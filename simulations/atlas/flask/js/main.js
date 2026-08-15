"use strict";
/* =====================================================================
   EVOLUTION IN A FLASK — main.js
   Boot, the home screen, the experiment designer, the clock, and the
   wiring between what the player touches and what the model does.

   The run loop is budgeted rather than fixed: it steps simulated days
   until it has used up its slice of the frame, then stops. That way the
   fastest speed is "as fast as this machine can manage" rather than a
   number that means different things on different machines.
   ===================================================================== */

var Game = (function () {

  var W = null;
  var running = false;
  var speedIdx = 1;
  var screen = "bench";
  var lastFrame = 0, acc = 0;
  var renderTimer = 0, renderPending = false;

  /* days of simulated time per second of real time */
  var SPEEDS = [
    { label: "1×",   days: 1,    steps: FLASK.STEPS_FINE,   cap: 130 },
    { label: "10×",  days: 10,   steps: FLASK.STEPS_FINE,   cap: 130 },
    { label: "50×",  days: 50,   steps: 20,                 cap: 110 },
    { label: "200×", days: 200,  steps: 14,                 cap: 80 },
    { label: "max",  days: 3000, steps: FLASK.STEPS_COARSE, cap: 60 }
  ];

  /* ---------------- boot ---------------- */
  function boot() {
    /* Day/night is owned by the site-wide switch in assets/orbital.js.
       We only need to redraw when it flips. */
    window.addEventListener("orbital:theme", function () { if (W) requestRender(); });
    buildHome();
    document.addEventListener("keydown", function (ev) {
      if (!W) return;
      if (document.getElementById("home").style.display !== "none") return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) return;
      if (ev.code === "Space") { ev.preventDefault(); togglePlay(); }
      if (ev.key >= "1" && ev.key <= "5") setSpeed(+ev.key - 1);
    });
    window.addEventListener("resize", function () { if (W) requestRender(); });
  }



  /* ---------------- home ---------------- */
  function buildHome() {
    var modes = [
      { id: "historical", title: "The experiment as it was run",
        body: "Twelve populations, 25 micrograms of glucose per millilitre, thirty-seven degrees, " +
              "one hundredfold transfer a day, a sample frozen every five hundred generations. " +
              "Nothing else changes, ever. That constancy is what makes the question answerable.",
        tags: ["Recommended", "Historical protocol", "50,000 generations"] },
      { id: "short", title: "Two thousand generations",
        body: "The same design on a shorter clock. Long enough for the first few sweeps, for the " +
              "populations to become measurably different from one another, and for the freezer to " +
              "start being useful. Short enough for one sitting.",
        tags: ["Quick", "One year of bench time"] },
      { id: "design", title: "Design the experiment",
        body: "Choose the medium, the temperature, the acidity, the aeration, the dilution, whether " +
              "the flask is stirred or structured, and whether anything is trying to kill the " +
              "bacteria. Then find out what you have actually asked them.",
        tags: ["Sandbox", "Every knob", "Counterfactuals"] },
      { id: "blind", title: "Blind bench",
        body: "The historical protocol, but with half the bench hours. You will not be able to " +
              "measure everything, so you will have to decide what is worth knowing — which is the " +
              "part of experimental design nobody puts in the textbook.",
        tags: ["Difficult", "Scarce measurement"] }
    ];
    var el = document.getElementById("homeModes");
    el.innerHTML = modes.map(function (m) {
      return '<div class="modecard" data-mode="' + m.id + '"><h3>' + m.title + '</h3><p>' + m.body + '</p>' +
        '<div class="tags">' + m.tags.map(function (t) { return '<span class="pill">' + t + '</span>'; }).join("") +
        '</div></div>';
    }).join("");
    el.onclick = function (ev) {
      var c = ev.target.closest(".modecard");
      if (!c) return;
      var m = c.dataset.mode;
      if (m === "design") openWizard();
      else if (m === "historical") start({ target: 50000 });
      else if (m === "short") start({ target: 2000 });
      else if (m === "blind") start({ target: 50000, lean: true });
    };
  }

  /* ---------------- the designer ---------------- */
  var wiz = null;
  var STEPS = ["Medium", "Incubator", "Transfer", "Pressures", "Length"];

  function openWizard() {
    wiz = { step: 0, env: {}, target: 20000, nPops: 12, seed: Math.floor(Math.random() * 1e9) };
    for (var k in ENV_DEFAULT) wiz.env[k] = ENV_DEFAULT[k];
    drawWizard();
    modal(true);
  }

  function drawWizard() {
    var e = wiz.env, body = "";
    var steps = '<div class="wizsteps">' + STEPS.map(function (s, i) {
      return '<div class="' + (i === wiz.step ? "on" : (i < wiz.step ? "done" : "")) + '">' + (i + 1) + ". " + s + '</div>';
    }).join("") + '</div>';

    function rng(key, label, lo, hi, step, disp, hint) {
      return '<div class="ctl"><label><span>' + label + '</span><b>' + disp + '</b></label>' +
        '<input type="range" data-w="' + key + '" min="' + lo + '" max="' + hi + '" step="' + step +
        '" value="' + e[key] + '"><div class="hint">' + hint + '</div></div>';
    }

    if (wiz.step === 0) {
      body = '<p class="dim">What is in the flask, and how much of it.</p>' +
        '<div class="ctl"><label><span>Carbon source</span></label><select data-w="carbon">' +
        Object.keys(CARBON).map(function (k) {
          return '<option value="' + k + '"' + (k === e.carbon ? " selected" : "") + '>' + CARBON[k].label + '</option>';
        }).join("") + '</select><div class="hint">' + CARBON[e.carbon].note + '</div></div>' +
        rng("glucose", "Concentration", 2, 250, 1, e.glucose + " µg/mL",
          "Twenty-five is the historical figure. It runs out about nine hours into a twenty-four hour day, " +
          "which means these bacteria spend most of their lives starving. Raising it changes that balance " +
          "more than it changes anything else.");
    } else if (wiz.step === 1) {
      body = '<p class="dim">Physical conditions. The ancestor is adapted to thirty-seven degrees, ' +
        'neutral pH and full aeration; anything else is a stress it will have to answer.</p>' +
        rng("temperature", "Temperature", 20, 46, 0.5, e.temperature.toFixed(1) + " °C",
          "Away from the optimum every lineage grows more slowly, and the ones whose thermal optimum " +
          "happens to have drifted the right way grow less slowly than the rest.") +
        rng("pH", "Acidity", 4.5, 9, 0.1, e.pH.toFixed(1),
          "Acid and alkaline stress both cost growth rate. Tolerance is heritable here and can widen.") +
        rng("oxygen", "Aeration", 0.02, 1, 0.02, Math.round(e.oxygen * 100) + "%",
          "Poorly aerated cultures burn carbon incompletely and dump acetate. That makes the second " +
          "niche in this medium much larger, and cross-feeding much more likely to evolve.");
    } else if (wiz.step === 2) {
      body = '<p class="dim">The transfer regime is the least visible and most consequential part of ' +
        'the design. It sets how many generations a day happen, and how small the population gets ' +
        'every time it happens.</p>' +
        rng("dilution", "Dilution", 2, 1000, 1, "1 : " + Math.round(e.dilution),
          "One in a hundred is 6.64 generations a day through a bottleneck of about five million cells. " +
          "One in a thousand is 10 generations a day through a bottleneck of five hundred thousand, " +
          "where drift is loud enough to lose good mutations regularly.") +
        rng("transferEvery", "Days between transfers", 1, 7, 1, e.transferEvery + " day(s)",
          "Longer cycles do not add growth. They add starvation, and select for surviving it.") +
        rng("patches", "Spatial structure", 1, 8, 1, e.patches === 1 ? "well mixed" : e.patches + " patches",
          "Dividing the medium into patches means a lineage competes mainly with whoever is next to it. " +
          "Diversity lasts far longer, sweeps take far longer, and the simulation runs proportionally slower.");
    } else if (wiz.step === 3) {
      body = '<p class="dim">None of this was in the original design. All of it changes what the ' +
        'populations are being asked.</p>' +
        rng("antibiotic", "Antibiotic", 0, 6, 0.1, e.antibiotic === 0 ? "none" : e.antibiotic.toFixed(1) + " × MIC",
          "Multiples of the ancestor’s minimum inhibitory concentration. Below about half, nothing much " +
          "happens. Above about two, most of the population dies every day and only the resistant " +
          "matter — which is a very different experiment.") +
        '<div class="ctl"><label class="switch"><input type="checkbox" data-w="phage"' +
        (e.phage ? " checked" : "") + '><span>Introduce a lytic phage</span></label>' +
        '<div class="hint">Resistance is available by losing a surface receptor, and costs a little ' +
        'growth. The phage can broaden its host range in reply, and generally does.</div></div>' +
        rng("mutagen", "Mutation rate", 0.1, 20, 0.1, e.mutagen.toFixed(1) + " ×",
          "Multiplies the entire mutation supply, good and bad alike.") +
        '<div class="ctl"><label><span>Environmental change</span></label><select data-w="drift">' +
        [["none", "Constant"], ["gradual", "Gradual drift"], ["abrupt", "Abrupt alternation"]].map(function (o) {
          return '<option value="' + o[0] + '"' + (o[0] === e.drift ? " selected" : "") + '>' + o[1] + '</option>';
        }).join("") + '</select><div class="hint">Constant conditions are what make repeatability a ' +
        'meaningful question. A moving target asks something else entirely.</div></div>';
    } else {
      body = '<p class="dim">How long to run, and how many flasks.</p>' +
        '<div class="ctl"><label><span>Target</span><b>' + wiz.target.toLocaleString() + ' generations</b></label>' +
        '<input type="range" data-w2="target" min="500" max="75000" step="500" value="' + wiz.target + '">' +
        '<div class="hint">Fifty thousand generations is about twenty-one years of daily transfers. ' +
        'The simulation will keep going past the target if you let it.</div></div>' +
        '<div class="ctl"><label><span>Populations</span><b>' + wiz.nPops + '</b></label>' +
        '<input type="range" data-w2="nPops" min="2" max="12" step="1" value="' + wiz.nPops + '">' +
        '<div class="hint">Twelve is the historical number. Fewer runs faster; fewer also makes ' +
        '"one flask in twelve found something" a much weaker statement.</div></div>' +
        '<div class="ctl"><label><span>Seed</span><b class="mono">' + wiz.seed + '</b></label>' +
        '<input type="number" data-w2="seed" value="' + wiz.seed + '">' +
        '<div class="hint">Every random decision comes from this. The same seed and the same settings ' +
        'give the same history, exactly, which is what makes a replay experiment mean anything.</div></div>';
    }

    document.getElementById("modal").innerHTML =
      '<h3>Design the experiment</h3><div class="sub muted tiny" style="margin-bottom:14px">' +
      'You are deciding what question the bacteria are going to be asked.</div>' +
      steps + body +
      '<div class="foot">' +
      (wiz.step > 0 ? '<button class="btn" id="wizBack">Back</button>' : '<button class="btn" id="wizCancel">Cancel</button>') +
      '<button class="btn primary" id="wizNext">' + (wiz.step === STEPS.length - 1 ? "Begin" : "Next") + '</button>' +
      '</div>';

    var els = document.querySelectorAll("[data-w]");
    for (var i = 0; i < els.length; i++) {
      els[i].oninput = els[i].onchange = function () {
        var k = this.dataset.w;
        wiz.env[k] = this.type === "checkbox" ? this.checked
          : (isNaN(+this.value) ? this.value : +this.value);
        drawWizard();
      };
    }
    var els2 = document.querySelectorAll("[data-w2]");
    for (var j = 0; j < els2.length; j++) {
      els2[j].oninput = els2[j].onchange = function () { wiz[this.dataset.w2] = +this.value; drawWizard(); };
    }
    var back = document.getElementById("wizBack");
    if (back) back.onclick = function () { wiz.step--; drawWizard(); };
    var cancel = document.getElementById("wizCancel");
    if (cancel) cancel.onclick = function () { modal(false); };
    document.getElementById("wizNext").onclick = function () {
      if (wiz.step === STEPS.length - 1) {
        modal(false);
        start({ env: wiz.env, target: wiz.target, nPops: wiz.nPops, seed: wiz.seed, sandbox: true });
      } else { wiz.step++; drawWizard(); }
    };
  }

  function modal(on) { document.getElementById("scrim").classList.toggle("on", !!on); }

  /* ---------------- start ---------------- */
  function start(opts) {
    opts = opts || {};
    W = Sim.newWorld({
      seed: opts.seed || (Date.now() % 1e9),
      env: opts.env, target: opts.target || 50000,
      nPops: opts.nPops || 12, sandbox: !!opts.sandbox,
      cap: SPEEDS[speedIdx].cap
    });
    if (opts.lean) W.lab.hours = 6;
    W.leanBench = !!opts.lean;
    W.refTick = 0;
    UI.setWorld(W);

    document.getElementById("home").style.display = "none";
    document.getElementById("app").classList.add("on");
    buildSpeed();
    document.getElementById("playBtn").onclick = togglePlay;
    
    document.getElementById("homeBtn").onclick = function () {
      if (!confirm("End this experiment and return to the start? Nothing is saved.")) return;
      running = false; W = null;
      document.getElementById("app").classList.remove("on");
      document.getElementById("home").style.display = "";
    };
    var nav = document.getElementById("rail");
    nav.onclick = function (ev) {
      var it = ev.target.closest(".navitem");
      if (!it) return;
      setScreen(it.dataset.screen);
    };
    setScreen("bench");
    toast("The experiment has begun. Twelve flasks, identical, in the same incubator. " +
      "Nothing will happen for a while, and then it will.", true);
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  function buildSpeed() {
    document.getElementById("speedSeg").innerHTML = SPEEDS.map(function (s, i) {
      return '<button data-sp="' + i + '" class="' + (i === speedIdx ? "on" : "") + '">' + s.label + '</button>';
    }).join("");
    document.getElementById("speedSeg").onclick = function (ev) {
      var b = ev.target.closest("[data-sp]");
      if (b) setSpeed(+b.dataset.sp);
    };
  }

  function setSpeed(i) {
    speedIdx = clamp(i, 0, SPEEDS.length - 1);
    if (W) { W.steps = SPEEDS[speedIdx].steps; W.cap = SPEEDS[speedIdx].cap; }
    buildSpeed();
  }

  function togglePlay() {
    running = !running;
    document.getElementById("playBtn").innerHTML = running ? "&#10073;&#10073; Pause" : "&#9654; Run";
    if (running) { lastFrame = performance.now(); requestAnimationFrame(frame); }
  }

  function setScreen(name) {
    screen = name;
    var items = document.querySelectorAll(".navitem");
    for (var i = 0; i < items.length; i++) items[i].classList.toggle("on", items[i].dataset.screen === name);
    var scr = document.querySelectorAll(".screen");
    for (var j = 0; j < scr.length; j++) scr[j].classList.toggle("on", scr[j].id === "screen-" + name);
    render();
  }

  /* ---------------- the loop ---------------- */
  function frame(now) {
    if (!W) return;
    var dt = Math.min(0.25, (now - lastFrame) / 1000);
    lastFrame = now;

    if (running) {
      acc += dt * SPEEDS[speedIdx].days;
      var budget = 13;                  // milliseconds of simulation per frame
      var t0 = performance.now();
      var did = 0;
      while (acc >= 1 && performance.now() - t0 < budget) {
        Sim.stepDay(W);
        acc -= 1; did++;
        if (W.jobs.length && did % 6 === 0) Sim.jobStep(W, 40);
      }
      if (acc > SPEEDS[speedIdx].days) acc = SPEEDS[speedIdx].days;   // never build a backlog
      if (!did && W.jobs.length) Sim.jobStep(W, 40);
      if (did) {
        drainToasts();
        UI.benchBar();
        if (!renderPending) {
          renderPending = true;
          renderTimer = setTimeout(function () { renderPending = false; render(); }, 260);
        }
      }
    } else if (W.jobs.length) {
      Sim.jobStep(W, 60);
      UI.benchBar();
    }
    requestAnimationFrame(frame);
  }

  function render() { if (W) UI.render(screen); }
  function requestRender() { clearTimeout(renderTimer); renderPending = false; render(); }

  /* ---------------- toasts ---------------- */
  function drainToasts() {
    for (var i = 0; i < W.events.length; i++) {
      var e = W.events[i];
      if (e.big && !e.toasted) { e.toasted = true; toast(e.text, true); }
    }
  }

  function toast(text, big) {
    var box = document.getElementById("toast");
    var d = document.createElement("div");
    if (big) d.className = "big";
    d.textContent = text;
    box.appendChild(d);
    setTimeout(function () {
      d.style.transition = "opacity .4s, transform .4s";
      d.style.opacity = "0"; d.style.transform = "translateY(6px)";
      setTimeout(function () { d.remove(); }, 420);
    }, big ? 9000 : 5200);
    while (box.children.length > 4) box.removeChild(box.children[0]);
  }

  return { boot: boot, render: render, requestRender: requestRender, toast: toast,
           setSpeed: setSpeed, world: function () { return W; } };
})();
