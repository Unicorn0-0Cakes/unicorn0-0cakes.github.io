/* ==========================================================================
   CUBE//TIMER - ULTRA-LIGHTWEIGHT ENGINE (JS)
   ========================================================================== */

(function () {
  'use strict';

  // --- STATE MANAGEMENT ---
  const STATE = {
    timerState: 'IDLE', // IDLE, HOLDING, READY, INSPECTING, RUNNING
    startTime: 0,
    elapsedTime: 0,
    animFrameId: null,
    holdTimeout: null,
    
    // Inspection state
    inspectionTimer: null,
    inspectionSeconds: 15,
    inspectionPenalty: null, // null, '+2', 'DNF'

    // Settings
    puzzle: '333',
    soundEnabled: true,
    inspectionEnabled: false,
    themeIndex: 0,
    themes: ['theme-matrix', 'theme-amber', 'theme-cyber', 'theme-dracula', 'theme-slate'],

    // Current Scramble
    currentScramble: '',

    // Solve History: Array of objects { id, time, puzzle, scramble, timestamp, penalty: null|'+2'|'DNF' }
    solves: []
  };

  // --- AUDIO SYNTHESIZER (Web Audio API) ---
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, type = 'sine', duration = 0.08, volume = 0.1) {
    if (!STATE.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play failed', e);
    }
  }

  function playChime() {
    if (!STATE.soundEnabled) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => playTone(freq, 'triangle', 0.12, 0.15), idx * 70);
    });
  }

  /* --- SCRAMBLE GENERATOR ---
     Random-MOVE scrambles with redundant-turn filtering. This is not the
     random-STATE generation the WCA requires for competition, and it is
     not described as such anywhere the visitor can see. It is the right
     tool for practice. */
  const SCRAMBLERS = {
    '333': function () {
      const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
      const suffixes = ['', "'", '2'];
      const oppFace = { U: 'D', D: 'U', L: 'R', R: 'L', F: 'B', B: 'F' };
      const result = [];
      let lastFace = '', secondLastFace = '';

      while (result.length < 20) {
        const face = faces[Math.floor(Math.random() * faces.length)];
        if (face === lastFace) continue;
        if (face === secondLastFace && oppFace[face] === lastFace) continue;

        const suf = suffixes[Math.floor(Math.random() * suffixes.length)];
        result.push(face + suf);
        secondLastFace = lastFace;
        lastFace = face;
      }
      return result.join(' ');
    },

    '222': function () {
      const faces = ['U', 'R', 'F'];
      const suffixes = ['', "'", '2'];
      const result = [];
      let lastFace = '';

      while (result.length < 10) {
        const face = faces[Math.floor(Math.random() * faces.length)];
        if (face === lastFace) continue;
        const suf = suffixes[Math.floor(Math.random() * suffixes.length)];
        result.push(face + suf);
        lastFace = face;
      }
      return result.join(' ');
    },

    '444': function () {
      const faces = ['U', 'D', 'L', 'R', 'F', 'B', 'Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw'];
      const suffixes = ['', "'", '2'];
      const result = [];
      let lastFace = '';

      while (result.length < 40) {
        const face = faces[Math.floor(Math.random() * faces.length)];
        if (face === lastFace) continue;
        const suf = suffixes[Math.floor(Math.random() * suffixes.length)];
        result.push(face + suf);
        lastFace = face;
      }
      return result.join(' ');
    },

    'pyram': function () {
      const faces = ['U', 'L', 'R', 'B'];
      const tips = ['u', 'l', 'r', 'b'];
      const suffixes = ['', "'"];
      const result = [];
      let lastFace = '';

      while (result.length < 11) {
        const face = faces[Math.floor(Math.random() * faces.length)];
        if (face === lastFace) continue;
        const suf = suffixes[Math.floor(Math.random() * suffixes.length)];
        result.push(face + suf);
        lastFace = face;
      }
      // Add tips randomly
      tips.forEach(t => {
        if (Math.random() > 0.4) {
          const suf = suffixes[Math.floor(Math.random() * suffixes.length)];
          result.push(t + suf);
        }
      });
      return result.join(' ');
    },

    'skewb': function () {
      const faces = ['U', 'L', 'R', 'B'];
      const suffixes = ['', "'"];
      const result = [];
      let lastFace = '';

      while (result.length < 10) {
        const face = faces[Math.floor(Math.random() * faces.length)];
        if (face === lastFace) continue;
        const suf = suffixes[Math.floor(Math.random() * suffixes.length)];
        result.push(face + suf);
        lastFace = face;
      }
      return result.join(' ');
    }
  };

  function generateScramble() {
    const generator = SCRAMBLERS[STATE.puzzle] || SCRAMBLERS['333'];
    STATE.currentScramble = generator();
    const el = document.getElementById('scramble-text');
    if (el) el.textContent = STATE.currentScramble;
  }

  // --- TIME FORMATTING UTILITIES ---
  function formatTime(ms, penalty = null) {
    if (penalty === 'DNF') return 'DNF';
    let totalMs = ms + (penalty === '+2' ? 2000 : 0);
    if (totalMs < 0) totalMs = 0;

    const mins = Math.floor(totalMs / 60000);
    const secs = Math.floor((totalMs % 60000) / 1000);
    const centis = Math.floor((totalMs % 1000) / 10);

    const cStr = String(centis).padStart(2, '0');
    const sStr = String(secs).padStart(2, '0');

    let formatted = '';
    if (mins > 0) {
      formatted = `${mins}:${sStr}.${cStr}`;
    } else {
      formatted = `${secs}.${cStr}`;
    }

    if (penalty === '+2') formatted += '+';
    return formatted;
  }

  // --- TIMER STATE CONTROL & TOUCH/KEYBOARD ---
  const timerDisplay = document.getElementById('timer-display');
  const timerStatusHint = document.getElementById('timer-status-hint');
  const inspectionDisplay = document.getElementById('inspection-display');
  const inspectionTimeEl = document.getElementById('inspection-time');

  function startArmingTimer() {
    if (STATE.timerState === 'RUNNING') {
      stopTimer();
      return;
    }
    if (STATE.timerState !== 'IDLE' && STATE.timerState !== 'INSPECTING') return;

    STATE.timerState = 'HOLDING';
    timerDisplay.className = 'timer-display state-holding';
    timerStatusHint.textContent = 'HOLD...';

    playTone(300, 'sine', 0.05, 0.05);

    STATE.holdTimeout = setTimeout(() => {
      if (STATE.timerState === 'HOLDING') {
        STATE.timerState = 'READY';
        timerDisplay.className = 'timer-display state-ready';
        timerStatusHint.textContent = 'RELEASE TO START!';
        playTone(600, 'triangle', 0.08, 0.12);
      }
    }, 300);
  }

  function releaseTimerArm() {
    clearTimeout(STATE.holdTimeout);

    if (STATE.timerState === 'HOLDING') {
      // Released too quickly
      STATE.timerState = STATE.inspectionEnabled ? 'INSPECTING' : 'IDLE';
      timerDisplay.className = 'timer-display';
      timerStatusHint.textContent = 'HOLD [SPACE] OR TOUCH & HOLD SCREEN';
      return;
    }

    if (STATE.timerState === 'READY') {
      if (STATE.inspectionTimer) {
        clearInterval(STATE.inspectionTimer);
        STATE.inspectionTimer = null;
        inspectionDisplay.classList.add('hidden');
      }
      startTimer();
    }
  }

  function startInspection() {
    STATE.timerState = 'INSPECTING';
    STATE.inspectionSeconds = 15;
    STATE.inspectionPenalty = null;
    inspectionDisplay.classList.remove('hidden');
    inspectionTimeEl.textContent = '15';
    timerDisplay.textContent = '0.00';
    timerStatusHint.textContent = 'INSPECTING - HOLD [SPACE] WHEN READY';

    playTone(440, 'sine', 0.08, 0.1);

    STATE.inspectionTimer = setInterval(() => {
      STATE.inspectionSeconds--;
      if (STATE.inspectionSeconds === 7) {
        playTone(523, 'triangle', 0.1, 0.15); // 8s warning cue
      }
      if (STATE.inspectionSeconds === 3) {
        playTone(659, 'triangle', 0.1, 0.15); // 12s warning cue
      }

      if (STATE.inspectionSeconds > 0) {
        inspectionTimeEl.textContent = STATE.inspectionSeconds;
      } else if (STATE.inspectionSeconds > -2) {
        inspectionTimeEl.textContent = '+2';
        STATE.inspectionPenalty = '+2';
      } else {
        inspectionTimeEl.textContent = 'DNF';
        STATE.inspectionPenalty = 'DNF';
        clearInterval(STATE.inspectionTimer);
      }
    }, 1000);
  }

  function startTimer() {
    STATE.timerState = 'RUNNING';
    STATE.startTime = performance.now();
    timerDisplay.className = 'timer-display state-running';
    timerStatusHint.textContent = 'TIMING... PRESS ANY KEY TO STOP';

    playTone(880, 'sine', 0.06, 0.12);

    function update() {
      if (STATE.timerState !== 'RUNNING') return;
      STATE.elapsedTime = performance.now() - STATE.startTime;
      timerDisplay.textContent = formatTime(STATE.elapsedTime);
      STATE.animFrameId = requestAnimationFrame(update);
    }
    STATE.animFrameId = requestAnimationFrame(update);
  }

  function stopTimer() {
    cancelAnimationFrame(STATE.animFrameId);
    STATE.timerState = 'IDLE';
    timerDisplay.className = 'timer-display';
    timerStatusHint.textContent = 'SOLVE COMPLETE! HOLD [SPACE] FOR NEXT';

    playTone(440, 'square', 0.08, 0.15);

    const rawMs = Math.round(STATE.elapsedTime);
    let penalty = STATE.inspectionPenalty;

    // Check if new PB!
    const activeSolves = STATE.solves.filter(s => s.puzzle === STATE.puzzle && s.penalty !== 'DNF');
    const bestBefore = activeSolves.length > 0 ? Math.min(...activeSolves.map(s => s.effectiveTime)) : Infinity;
    const currentEffective = penalty === 'DNF' ? Infinity : rawMs + (penalty === '+2' ? 2000 : 0);

    const newSolve = {
      id: Date.now(),
      time: rawMs,
      effectiveTime: currentEffective,
      penalty: penalty,
      puzzle: STATE.puzzle,
      scramble: STATE.currentScramble,
      timestamp: new Date().toISOString()
    };

    STATE.solves.unshift(newSolve);
    saveSolvesToStorage();

    if (currentEffective < bestBefore) {
      playChime();
    }

    renderAll();
    generateScramble();
  }

  // --- STATISTICS CALCULATOR ENGINE ---
  function getEffectiveTime(solve) {
    if (!solve || solve.penalty === 'DNF') return Infinity;
    return solve.time + (solve.penalty === '+2' ? 2000 : 0);
  }

  function calculateAverage(solvesChunk, size) {
    if (solvesChunk.length < size) return null;
    const slice = solvesChunk.slice(0, size);
    const dnfs = slice.filter(s => s.penalty === 'DNF').length;
    if (dnfs >= 2) return 'DNF';

    const times = slice.map(s => getEffectiveTime(s)).sort((a, b) => a - b);
    // Trim fastest (index 0) and slowest (last index)
    const trimmed = times.slice(1, times.length - 1);
    const sum = trimmed.reduce((acc, t) => acc + t, 0);
    return Math.round(sum / trimmed.length);
  }

  function calculateBestAverage(solvesList, size) {
    if (solvesList.length < size) return null;
    let best = Infinity;
    for (let i = 0; i <= solvesList.length - size; i++) {
      const avg = calculateAverage(solvesList.slice(i), size);
      if (avg !== null && avg !== 'DNF' && avg < best) {
        best = avg;
      }
    }
    return best === Infinity ? 'DNF' : best;
  }

  function updateStatsUI() {
    const puzzleSolves = STATE.solves.filter(s => s.puzzle === STATE.puzzle);

    // Count
    document.getElementById('stat-count').textContent = puzzleSolves.length;

    // PB
    const validTimes = puzzleSolves.filter(s => s.penalty !== 'DNF').map(s => getEffectiveTime(s));
    const pb = validTimes.length > 0 ? Math.min(...validTimes) : null;
    document.getElementById('stat-pb').textContent = pb ? formatTime(pb) : '--.--';

    // Current Ao5 & Ao12
    const curAo5 = calculateAverage(puzzleSolves, 5);
    document.getElementById('stat-ao5').textContent = curAo5 ? (curAo5 === 'DNF' ? 'DNF' : formatTime(curAo5)) : '--.--';

    const curAo12 = calculateAverage(puzzleSolves, 12);
    document.getElementById('stat-ao12').textContent = curAo12 ? (curAo12 === 'DNF' ? 'DNF' : formatTime(curAo12)) : '--.--';

    // Best Ao5 & Ao12
    const bestAo5 = calculateBestAverage(puzzleSolves, 5);
    document.getElementById('stat-best-ao5').textContent = bestAo5 ? (bestAo5 === 'DNF' ? 'DNF' : formatTime(bestAo5)) : '--.--';

    const bestAo12 = calculateBestAverage(puzzleSolves, 12);
    document.getElementById('stat-best-ao12').textContent = bestAo12 ? (bestAo12 === 'DNF' ? 'DNF' : formatTime(bestAo12)) : '--.--';

    // Ao50
    const curAo50 = calculateAverage(puzzleSolves, 50);
    document.getElementById('stat-ao50').textContent = curAo50 ? (curAo50 === 'DNF' ? 'DNF' : formatTime(curAo50)) : '--.--';

    // Session Mean
    if (validTimes.length > 0) {
      const sum = validTimes.reduce((a, b) => a + b, 0);
      document.getElementById('stat-mean').textContent = formatTime(Math.round(sum / validTimes.length));
    } else {
      document.getElementById('stat-mean').textContent = '--.--';
    }

    // Last solve bar
    const lastSolveBar = document.getElementById('last-solve-bar');
    if (puzzleSolves.length > 0) {
      const last = puzzleSolves[0];
      lastSolveBar.classList.remove('hidden');
      document.getElementById('last-solve-time').textContent = formatTime(last.time, last.penalty);
    } else {
      lastSolveBar.classList.add('hidden');
    }
  }

  // --- SOLVE LOG RENDER ENGINE ---
  function renderSolveLog() {
    const tbody = document.getElementById('solve-list-body');
    const emptyState = document.getElementById('solve-list-empty');
    const puzzleSolves = STATE.solves.filter(s => s.puzzle === STATE.puzzle);

    if (puzzleSolves.length === 0) {
      tbody.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    const validTimes = puzzleSolves.filter(s => s.penalty !== 'DNF').map(s => getEffectiveTime(s));
    const pbTime = validTimes.length > 0 ? Math.min(...validTimes) : null;

    let html = '';
    puzzleSolves.forEach((solve, index) => {
      const displayNum = puzzleSolves.length - index;
      const effectiveTime = getEffectiveTime(solve);
      const isPB = effectiveTime !== Infinity && effectiveTime === pbTime;
      const isDNF = solve.penalty === 'DNF';

      // Calc Ao5 at this point in history
      const remainingSlice = puzzleSolves.slice(index);
      const ao5 = calculateAverage(remainingSlice, 5);
      const ao5Str = ao5 ? (ao5 === 'DNF' ? 'DNF' : formatTime(ao5)) : '-';

      html += `
        <tr class="${isPB ? 'is-pb' : ''} ${isDNF ? 'is-dnf' : ''}">
          <td>${displayNum}</td>
          <td><strong>${formatTime(solve.time, solve.penalty)}</strong> ${isPB ? '⭐' : ''}</td>
          <td>${ao5Str}</td>
          <td>
            <div class="action-btns">
              <button class="tag-btn ${solve.penalty === '+2' ? 'active' : ''}" onclick="window.togglePenalty(${solve.id}, '+2')">+2</button>
              <button class="tag-btn ${solve.penalty === 'DNF' ? 'active' : ''}" onclick="window.togglePenalty(${solve.id}, 'DNF')">DNF</button>
              <button class="tag-btn danger" onclick="window.deleteSolve(${solve.id})">&times;</button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  window.togglePenalty = function (id, penaltyType) {
    const solve = STATE.solves.find(s => s.id === id);
    if (!solve) return;
    if (solve.penalty === penaltyType) {
      solve.penalty = null;
    } else {
      solve.penalty = penaltyType;
    }
    solve.effectiveTime = getEffectiveTime(solve);
    saveSolvesToStorage();
    renderAll();
  };

  window.deleteSolve = function (id) {
    STATE.solves = STATE.solves.filter(s => s.id !== id);
    saveSolvesToStorage();
    renderAll();
  };

  // --- DYNAMIC HEATMAP GRID & STREAK TRACKER ENGINE ---
  function renderHeatmapGrid() {
    const gridContainer = document.getElementById('heatmap-grid');
    if (!gridContainer) return;
    gridContainer.innerHTML = '';

    // 365 days ending today. The summary below reports "x/365" and a
    // consistency percentage over 365, so the window has to actually be
    // 365 days or both figures are quietly wrong.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const datesMap = {};
    // Pre-fill the window with 0 count
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      datesMap[key] = { date: d, key: key, count: 0, times: [] };
    }

    // Populate with solve history
    STATE.solves.forEach(solve => {
      const dateKey = solve.timestamp.split('T')[0];
      if (datesMap[dateKey]) {
        datesMap[dateKey].count++;
        if (solve.penalty !== 'DNF') {
          datesMap[dateKey].times.push(getEffectiveTime(solve));
        }
      }
    });

    // Render cells into grid
    let totalSolvesYTD = 0;
    let activeDaysCount = 0;
    let totalValidMs = 0;
    let validCountForAvg = 0;

    const dateKeys = Object.keys(datesMap);
    
    dateKeys.forEach(key => {
      const item = datesMap[key];
      totalSolvesYTD += item.count;
      if (item.count > 0) activeDaysCount++;

      item.times.forEach(t => {
        totalValidMs += t;
        validCountForAvg++;
      });

      // Intensity level: 0: 0, 1: 1-4, 2: 5-12, 3: 13-25, 4: 26+
      let lvl = 0;
      if (item.count >= 26) lvl = 4;
      else if (item.count >= 13) lvl = 3;
      else if (item.count >= 5) lvl = 2;
      else if (item.count >= 1) lvl = 1;

      const cell = document.createElement('div');
      cell.className = `hm-day-cell lvl-${lvl}`;
      cell.dataset.date = key;
      cell.dataset.count = item.count;

      // Calculate day best & avg
      const bestTime = item.times.length > 0 ? Math.min(...item.times) : null;
      const avgTime = item.times.length > 0 ? Math.round(item.times.reduce((a, b) => a + b, 0) / item.times.length) : null;

      // Mouseover tooltip listener
      cell.addEventListener('mouseenter', (e) => {
        const tooltip = document.getElementById('hm-tooltip');
        const formattedDate = item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        let text = `<strong>${formattedDate}</strong><br>${item.count} solve${item.count !== 1 ? 's' : ''}`;
        if (bestTime) text += `<br>Best: ${formatTime(bestTime)}`;
        if (avgTime) text += `<br>Avg: ${formatTime(avgTime)}`;

        tooltip.innerHTML = text;
        tooltip.classList.remove('hidden');

        const rect = e.target.getBoundingClientRect();
        tooltip.style.left = `${rect.left + window.scrollX - 40}px`;
        tooltip.style.top = `${rect.top + window.scrollY - 60}px`;
      });

      cell.addEventListener('mouseleave', () => {
        document.getElementById('hm-tooltip').classList.add('hidden');
      });

      gridContainer.appendChild(cell);
    });

    // Calculate Streaks ("Don't break the chain")
    //
    // These are two different questions and they need two passes. The best
    // streak is the longest run anywhere in the window; the current streak
    // is the run that is still alive at the newest end. Walking once from
    // newest to oldest and reading the counter at the end reports the run
    // at the OLDEST end instead, which is a different number entirely.
    let bestStreak = 0;
    let run = 0;
    for (let i = 0; i < dateKeys.length; i++) {
      if (datesMap[dateKeys[i]].count > 0) {
        run++;
        if (run > bestStreak) bestStreak = run;
      } else {
        run = 0;
      }
    }

    // Current streak: count back from today. A day with no solves yet does
    // not break a streak — it has not finished — so today is skipped rather
    // than counted when it is empty.
    let currentStreak = 0;
    for (let i = dateKeys.length - 1; i >= 0; i--) {
      if (datesMap[dateKeys[i]].count > 0) {
        currentStreak++;
      } else if (i === dateKeys.length - 1) {
        continue;
      } else {
        break;
      }
    }

    // Update Heatmap Stats Header UI
    document.getElementById('current-streak').textContent = currentStreak;
    document.getElementById('best-streak').textContent = bestStreak;
    document.getElementById('hm-total-solves').textContent = totalSolvesYTD;
    document.getElementById('hm-active-days').textContent = `${activeDaysCount}/365`;
    document.getElementById('hm-yearly-avg').textContent = validCountForAvg > 0 ? formatTime(Math.round(totalValidMs / validCountForAvg)) : '--.--';
    document.getElementById('hm-consistency').textContent = `${Math.round((activeDaysCount / 365) * 100)}%`;
  }

  // --- SEED DEMO DATA FOR MATRIX DEMONSTRATION ---
  /* Fabricates six months of plausible practice history so the activity
     matrix has something to show a first-time visitor. The data is not
     real, the button says so, and it asks before writing — nothing here
     should ever be mistaken for a record of actual solves. */
  function seedDemoData() {
    if (!confirm('This adds around 2,000 MADE-UP solves so the activity matrix has something to display.\n\nThis is sample data, not a record of real practice. Continue?')) return;
    const today = new Date();
    const newSolves = [...STATE.solves];

    for (let i = 0; i < 180; i++) {
      // Simulate activity on 75% of days
      if (Math.random() < 0.75) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);

        const dailySolveCount = Math.floor(Math.random() * 18) + 2; // 2 to 20 solves
        for (let j = 0; j < dailySolveCount; j++) {
          const baseTime = 12000 + Math.floor(Math.random() * 8000); // 12s - 20s times
          const isDnf = Math.random() < 0.03;
          const isPlus2 = Math.random() < 0.08;

          newSolves.push({
            id: Date.now() - (i * 86400000 + j * 1000),
            time: baseTime,
            effectiveTime: isDnf ? Infinity : baseTime + (isPlus2 ? 2000 : 0),
            penalty: isDnf ? 'DNF' : (isPlus2 ? '+2' : null),
            puzzle: '333',
            scramble: 'R U R\' U\' R\' F R2 U\' R\' U\' R U R\' F\'',
            timestamp: d.toISOString()
          });
        }
      }
    }

    STATE.solves = newSolves;
    saveSolvesToStorage();
    renderAll();
    playTone(1046, 'triangle', 0.2, 0.2);
  }

  // --- LOCAL STORAGE & DATA EXPORT/IMPORT ---
  function saveSolvesToStorage() {
    try {
      localStorage.setItem('cubetimer_solves', JSON.stringify(STATE.solves));
    } catch (e) {
      console.warn('Storage save failed', e);
    }
  }

  /* JSON has no Infinity, so a DNF's effectiveTime round-trips as null and
     an imported file may not carry the field at all. Recomputing it from
     time + penalty on the way in means the stored shape can never disagree
     with the derived value. */
  function normaliseSolves(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter(function (s) { return s && typeof s.time === 'number'; })
      .map(function (s) {
        s.penalty = (s.penalty === '+2' || s.penalty === 'DNF') ? s.penalty : null;
        s.effectiveTime = getEffectiveTime(s);
        return s;
      });
  }

  function loadSolvesFromStorage() {
    try {
      const data = localStorage.getItem('cubetimer_solves');
      if (data) STATE.solves = normaliseSolves(JSON.parse(data));
    } catch (e) {
      console.warn('Storage load failed', e);
    }
  }

  function exportData() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(STATE.solves, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `cube_timer_solves_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const imported = normaliseSolves(JSON.parse(e.target.result));
        if (imported.length) {
          STATE.solves = imported;
          saveSolvesToStorage();
          renderAll();
          alert('Imported ' + imported.length + ' solves.');
        } else {
          alert('No usable solves found in that file.');
        }
      } catch (err) {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  }

  // --- RENDER ALL UI ---
  function renderAll() {
    updateStatsUI();
    renderSolveLog();
    renderHeatmapGrid();
  }

  // --- INITIALIZATION & EVENT BINDINGS ---
  function init() {
    loadSolvesFromStorage();
    generateScramble();
    renderAll();

    // Puzzle selector
    const puzzleSelect = document.getElementById('puzzle-select');
    puzzleSelect.addEventListener('change', (e) => {
      STATE.puzzle = e.target.value;
      document.getElementById('scramble-puzzle-tag').textContent = e.target.options[e.target.selectedIndex].text;
      generateScramble();
      renderAll();
    });

    // New Scramble button
    document.getElementById('btn-new-scramble').addEventListener('click', (e) => {
      e.stopPropagation();
      generateScramble();
    });

    // Sound toggle
    const soundBtn = document.getElementById('btn-sound');
    soundBtn.addEventListener('click', () => {
      STATE.soundEnabled = !STATE.soundEnabled;
      soundBtn.querySelector('.btn-lbl').textContent = STATE.soundEnabled ? 'AUDIO: ON' : 'AUDIO: OFF';
    });

    // Inspection toggle
    const inspectBtn = document.getElementById('btn-inspection');
    inspectBtn.addEventListener('click', () => {
      STATE.inspectionEnabled = !STATE.inspectionEnabled;
      document.getElementById('inspect-status').textContent = STATE.inspectionEnabled ? 'ON' : 'OFF';
      if (STATE.inspectionEnabled) inspectBtn.classList.add('active');
      else inspectBtn.classList.remove('active');
    });

    // Theme Switcher
    const themeBtn = document.getElementById('btn-theme');
    themeBtn.addEventListener('click', () => {
      document.body.className = '';
      STATE.themeIndex = (STATE.themeIndex + 1) % STATE.themes.length;
      document.body.classList.add(STATE.themes[STATE.themeIndex]);
    });

    // Clear session
    document.getElementById('btn-clear-session').addEventListener('click', () => {
      if (confirm('Clear solves for current puzzle?')) {
        STATE.solves = STATE.solves.filter(s => s.puzzle !== STATE.puzzle);
        saveSolvesToStorage();
        renderAll();
      }
    });

    // Seed Data
    document.getElementById('btn-seed-data').addEventListener('click', seedDemoData);

    // Export / Import
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', (e) => {
      if (e.target.files.length > 0) importData(e.target.files[0]);
    });

    // Help Modal. Escape closes it and focus goes back where it came from,
    // so it behaves like a dialog rather than a div that happens to cover
    // the screen.
    const helpModal = document.getElementById('modal-help');
    const helpBtn = document.getElementById('btn-help');
    const helpClose = document.getElementById('btn-close-help');
    let helpOpener = null;

    function openHelp() {
      helpOpener = document.activeElement;
      helpModal.classList.remove('hidden');
      helpClose.focus();
    }
    function closeHelp() {
      if (helpModal.classList.contains('hidden')) return;
      helpModal.classList.add('hidden');
      if (helpOpener && helpOpener.focus) helpOpener.focus();
      helpOpener = null;
    }
    helpBtn.addEventListener('click', openHelp);
    helpClose.addEventListener('click', closeHelp);
    helpModal.addEventListener('click', (e) => { if (e.target === helpModal) closeHelp(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeHelp();
    });

    // Copy scramble on click
    document.getElementById('scramble-box').addEventListener('click', () => {
      navigator.clipboard.writeText(STATE.currentScramble).then(() => {
        const textEl = document.getElementById('scramble-text');
        const orig = textEl.textContent;
        textEl.textContent = 'COPIED TO CLIPBOARD!';
        setTimeout(() => textEl.textContent = orig, 1000);
      });
    });

    // Last solve modifier buttons
    document.getElementById('btn-last-plus2').addEventListener('click', () => {
      const puzzleSolves = STATE.solves.filter(s => s.puzzle === STATE.puzzle);
      if (puzzleSolves.length > 0) window.togglePenalty(puzzleSolves[0].id, '+2');
    });
    document.getElementById('btn-last-dnf').addEventListener('click', () => {
      const puzzleSolves = STATE.solves.filter(s => s.puzzle === STATE.puzzle);
      if (puzzleSolves.length > 0) window.togglePenalty(puzzleSolves[0].id, 'DNF');
    });
    document.getElementById('btn-last-del').addEventListener('click', () => {
      const puzzleSolves = STATE.solves.filter(s => s.puzzle === STATE.puzzle);
      if (puzzleSolves.length > 0) window.deleteSolve(puzzleSolves[0].id);
    });

    // KEYBOARD EVENT LISTENERS
    window.addEventListener('keydown', (e) => {
      const focusedTag = document.activeElement ? document.activeElement.tagName : '';

      // A running timer stops on any key, wherever focus happens to be.
      // Everything below this line is only reachable when it is not running.
      if (STATE.timerState === 'RUNNING' && e.code !== 'Space') {
        stopTimer();
        return;
      }

      // Ignore keys aimed at a control. Without BUTTON here, tabbing to
      // EXPORT and pressing Space would both press the button and arm the
      // timer — the browser activates the button, and this handler armed
      // the timer on the same keystroke.
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(focusedTag)) return;

      // Spacebar Timer Trigger
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) {
          if (STATE.timerState === 'RUNNING') {
            stopTimer();
          } else if (STATE.timerState === 'IDLE') {
            if (STATE.inspectionEnabled) {
              startInspection();
            } else {
              startArmingTimer();
            }
          } else if (STATE.timerState === 'INSPECTING') {
            startArmingTimer();
          }
        }
        return;
      }

      // Shortcuts
      if (e.code === 'KeyR') {
        generateScramble();
      } else if (e.code === 'KeyI') {
        document.getElementById('btn-inspection').click();
      } else if (e.code === 'KeyM') {
        document.getElementById('btn-sound').click();
      } else if (e.code === 'KeyT') {
        document.getElementById('btn-theme').click();
      } else if (e.key === '?') {
        if (helpModal.classList.contains('hidden')) openHelp(); else closeHelp();
      } else if (e.altKey && e.code === 'Digit1') {
        document.getElementById('btn-last-plus2').click();
      } else if (e.altKey && e.code === 'Digit2') {
        document.getElementById('btn-last-dnf').click();
      } else if (e.altKey && (e.code === 'Digit3' || e.code === 'KeyD')) {
        document.getElementById('btn-last-del').click();
      }
    });

    window.addEventListener('keyup', (e) => {
      const focusedTag = document.activeElement ? document.activeElement.tagName : '';
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(focusedTag)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        releaseTimerArm();
      }
    });

    // TOUCH / POINTER CONTROLS FOR MOBILE/TABLET
    const touchArea = document.getElementById('timer-touch-area');
    touchArea.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      if (STATE.timerState === 'RUNNING') {
        stopTimer();
      } else if (STATE.timerState === 'IDLE') {
        if (STATE.inspectionEnabled) {
          startInspection();
        } else {
          startArmingTimer();
        }
      } else if (STATE.timerState === 'INSPECTING') {
        startArmingTimer();
      }
    });

    touchArea.addEventListener('pointerup', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      releaseTimerArm();
    });
  }

  // Run init on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
