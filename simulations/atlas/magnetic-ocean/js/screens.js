"use strict";
/* =====================================================================
   THE MAGNETIC OCEAN — screens.js

   Everything that puts marks on the page other than the canvases: the
   home screen, the survey-design rail, the interpretation workbench, the
   inspector, the transect ledger, the guided script, the commitment
   dialogue and the inference report.

   The screen-reader summary is not an afterthought bolted on at the end.
   Every canvas has a sibling text block that states, in words, what the
   canvas is showing — the same numbers, not a description of the
   picture — and the commit dialogue can be completed without ever
   looking at a chart.
   ===================================================================== */

var Screens = (function () {

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function n1(v) { return isFinite(v) ? v.toFixed(1) : "—"; }
  function n2(v) { return isFinite(v) ? v.toFixed(2) : "—"; }
  function n0(v) { return isFinite(v) ? Math.round(v).toString() : "—"; }

  /* ==================================================================
     HOME
     =============================================================== */
  function renderHome() {
    var host = $("homeModes");
    if (!host) return;
    host.innerHTML = MODE_KEYS.map(function (k) {
      var m = MODES[k];
      return '<button class="modecard" type="button" data-launch="' + k + '">' +
        '<div class="mc-tag">' + esc(m.tag) + '</div>' +
        '<h3>' + esc(m.name) + '</h3>' +
        '<p>' + esc(m.line) + '</p></button>';
    }).join("");
  }

  /* ==================================================================
     TOP BAR
     =============================================================== */
  function renderTop() {
    var S = App.S;
    $("tbMode").textContent = "· " + MODES[S.mode].name +
      (MODES[S.mode].preset === "random" ? "" : " · " + presetByKey(S.presetKey).name);
    var left = S.budgetHours - S.budgetUsedHours;
    var b = $("tbBudget");
    if (S.budgetHours > 500) {
      b.textContent = "Budget: unlimited";
      b.classList.remove("low");
    } else {
      b.textContent = "Ship-hours " + n1(left) + " of " + n0(S.budgetHours) +
        " · lines " + S.transects.length + "/" + S.transectLimit;
      b.classList.toggle("low", left < App.costOfNextLine());
    }
    $("btnBegin").disabled = S.running || !App.canRunLine().ok;
    $("btnPause").disabled = !S.active;
    $("btnStep").disabled = !S.active || S.running;
    $("btnPause").textContent = S.running ? "Pause" : "Resume";
  }

  /* ==================================================================
     THE RAIL — survey design and interpretation
     =============================================================== */
  function slider(key, opts) {
    var c = CONTROLS[key];
    var v = App.S.survey[key];
    var o = opts || {};
    var lock = o.locked ? " locked" : "";
    return '<div class="field' + lock + '" data-field="' + key + '">' +
      '<label for="c_' + key + '">' + esc(c.label) +
        '<span class="v" id="v_' + key + '">' + fmtCtl(key, v) + '</span></label>' +
      '<input type="range" id="c_' + key + '" data-ctl="' + key + '" min="' + c.min +
        '" max="' + c.max + '" step="' + c.step + '" value="' + v + '"' +
        (o.locked ? " disabled" : "") + '>' +
      (o.note && c.note ? '<p class="note">' + esc(c.note) + '</p>' : '') +
      '</div>';
  }

  function fmtCtl(key, v) {
    var c = CONTROLS[key];
    if (key === "dropoutRate") return Math.round(v * 100) + "%";
    var dec = c.step < 1 ? (c.step < 0.1 ? 2 : 1) : 0;
    return v.toFixed(dec) + (c.unit ? " " + c.unit : "");
  }

  function renderRail() {
    var S = App.S, h = [];
    var locked = !!S.active || S.revealed;

    /* ---- mode and preset ---- */
    h.push('<div class="panel"><h3>Run</h3>');
    h.push('<div class="field"><label for="c_mode">Mode</label><select id="c_mode" data-act="mode">' +
      MODE_KEYS.map(function (k) {
        return '<option value="' + k + '"' + (k === S.mode ? " selected" : "") + '>' + esc(MODES[k].name) + '</option>';
      }).join("") + '</select></div>');
    if (MODES[S.mode].preset !== "random") {
      h.push('<div class="field"><label for="c_preset">Preset</label><select id="c_preset" data-act="preset"' +
        (locked ? " disabled" : "") + '>' +
        PRESETS.map(function (p) {
          return '<option value="' + p.key + '"' + (p.key === S.presetKey ? " selected" : "") + '>' + esc(p.name) + '</option>';
        }).join("") + '</select><p class="note">' + esc(presetByKey(S.presetKey).line) + '</p></div>');
    } else {
      h.push('<p class="note">In this mode the world is drawn from the seed and stays hidden. ' +
        'The same seed always gives the same seafloor.</p>');
    }
    h.push('<div class="field"><label for="c_seed">Seed<span class="v">' + S.seed + '</span></label>' +
      '<input type="number" id="c_seed" data-act="seed" value="' + S.seed + '" step="1"' + (locked ? " disabled" : "") + '></div>');
    h.push('<div class="rowbtns">' +
      '<button class="btn sm" type="button" data-act="restart">Restart same seed</button>' +
      '<button class="btn sm" type="button" data-act="newseed">New seed</button>' +
      '<button class="btn sm" type="button" data-act="resetctl">Reset controls</button>' +
      '</div></div>');

    /* ---- survey design ---- */
    h.push('<div class="panel"><h3>Survey design</h3>');
    h.push(slider("trackStartKm", { locked: locked }));
    h.push(slider("trackLengthKm", { locked: locked }));
    h.push(slider("trackAngleDeg", { locked: locked, note: true }));
    h.push(slider("sampleSpacingKm", { locked: locked }));
    h.push(slider("sensorAltitudeKm", { locked: locked, note: true }));
    h.push(slider("shipSpeedKn", { locked: locked }));
    var warn = MagOcean.geometryWarning(S.survey);
    if (warn) {
      h.push('<div class="callout' + (warn.level === "fail" ? " bad" : "") + '">' + esc(warn.text) + '</div>');
    }
    h.push('<p class="note">This line will cost <b>' + n1(App.costOfNextLine()) + ' ship-hours</b> and take ' +
      Math.max(2, Math.floor(S.survey.trackLengthKm / S.survey.sampleSpacingKm) + 1) + ' readings.</p>');
    h.push('</div>');

    /* ---- instrument and sea ---- */
    h.push('<details class="acc"' + (S.transects.length ? "" : " open") + '><summary>Instrument &amp; sea state</summary><div>');
    h.push(slider("noiseNt", { locked: locked }));
    h.push(slider("trendNtPer100km", { locked: locked, note: true }));
    h.push(slider("navJitterKm", { locked: locked, note: true }));
    h.push(slider("dropoutRate", { locked: locked, note: true }));
    h.push('<div class="field"><label for="c_sounder">Echo sounder' +
      '<span class="v">' + (S.sounded ? "on" : "off") + '</span></label>' +
      '<select id="c_sounder" data-act="sounder"><option value="on"' + (S.sounded ? " selected" : "") +
      '>On — show bathymetry</option><option value="off"' + (S.sounded ? "" : " selected") +
      '>Off — magnetics only</option></select>' +
      '<p class="note">The sounder shows a rise in the seafloor. It says nothing about spreading rate, polarity or age.</p></div>');
    h.push('</div></details>');

    /* ---- the laboratory: the true world, only where it is labelled ---- */
    if (S.mode === "lab") {
      h.push('<div class="panel warn"><h3>Laboratory — the true world</h3>' +
        '<p class="note">These are the hidden parameters. They are exposed here and nowhere else, ' +
        'so that the forward model can be examined directly. Nothing you infer in this mode is a test of anything.</p>');
      h.push(labSlider("ridgeAxisKm", S.world.ridgeAxisKm));
      h.push(labSlider("halfRateLeftCmYr", S.world.halfRateLeftCmYr));
      h.push(labSlider("halfRateRightCmYr", S.world.halfRateRightCmYr));
      h.push(labSlider("effInclinationDeg", S.world.effInclinationDeg));
      h.push('<p class="note">Full spreading rate: <b>' + n2(S.world.fullRateCmYr) + ' cm/yr</b> — ' +
        'the sum of the two half rates, not either one of them.</p>');
      h.push('</div>');
    }

    /* ---- the interpretation workbench ---- */
    if (S.transects.length) {
      h.push('<div class="panel"><h3>Interpretation</h3>');
      h.push('<div class="field"><label for="w_axis">Ridge axis' +
        '<span class="v" id="v_w_axis">' + n2(S.wb.axisKm) + ' km</span></label>' +
        '<input type="range" id="w_axis" data-wb="axisKm" min="' + Math.round(S.planView.x0) +
        '" max="' + Math.round(S.planView.x1) + '" step="0.25" value="' + S.wb.axisKm + '"></div>');
      h.push('<div class="field"><label for="w_sym">Symmetry</label>' +
        '<select id="w_sym" data-wb="symmetric"><option value="1"' + (S.wb.symmetric ? " selected" : "") +
        '>Symmetric — one rate both sides</option><option value="0"' + (S.wb.symmetric ? "" : " selected") +
        '>Asymmetric — a rate each side</option></select></div>');
      h.push('<div class="field"><label for="w_rl">' + (S.wb.symmetric ? "Half-spreading rate" : "Left half rate") +
        '<span class="v" id="v_w_rl">' + n2(S.wb.rateL) + ' cm/yr</span></label>' +
        '<input type="range" id="w_rl" data-wb="rateL" min="0.4" max="8" step="0.01" value="' + S.wb.rateL + '"></div>');
      if (!S.wb.symmetric) {
        h.push('<div class="field"><label for="w_rr">Right half rate' +
          '<span class="v" id="v_w_rr">' + n2(S.wb.rateR) + ' cm/yr</span></label>' +
          '<input type="range" id="w_rr" data-wb="rateR" min="0.4" max="8" step="0.01" value="' + S.wb.rateR + '"></div>');
      }
      h.push('<p class="note">Full spreading rate implied: <b>' +
        n2(S.wb.rateL + (S.wb.symmetric ? S.wb.rateL : S.wb.rateR)) + ' cm/yr</b></p>');
      h.push('<div class="field"><label for="w_chron">Polarity chronology</label>' +
        '<select id="w_chron" data-wb="chronology">' +
        '<option value="published"' + (S.wb.chronology === "published" ? " selected" : "") +
        '>Published — 0 to 5.23 Ma, sourced</option>' +
        '<option value="synthetic"' + (S.wb.chronology === "synthetic" ? " selected" : "") +
        '>Synthetic — generated, not historical</option></select>' +
        '<p class="note">' + esc(MagOcean.chronologyByKey(S.wb.chronology, S.seed).citation) + '</p></div>');
      h.push('<div class="rowbtns">' +
        '<button class="btn sm" type="button" data-act="fitsym">Fit symmetric</button>' +
        '<button class="btn sm" type="button" data-act="fitasym">Fit asymmetric</button>' +
        '</div>');
      h.push('<div class="prog" id="fitProg"><i></i></div>');
      h.push('<p class="note">The automatic fit is a search, not an oracle. It reports what fits best under ' +
        'the assumptions you have set; it cannot tell you those assumptions are right.</p>');
      h.push('</div>');

      h.push('<div class="panel"><h3>Candidate models</h3>' +
        '<button class="btn sm" type="button" data-act="compare">Compare four explanations</button>' +
        '<div class="prog" id="cmpProg"><i></i></div>' +
        '<p class="note">' + (S.transects.length >= 2
          ? "With " + S.transects.length + " lines run, the models are fitted on the first " +
            (S.transects.length - 1) + " and scored on the last one, which none of them has seen."
          : "With one line only, every model is scored on the data it was fitted to. Run a second line to test them on something they have not seen.") +
        '</p></div>');
    }

    $("rail").innerHTML = h.join("");
  }

  function labSlider(key, value) {
    var c = CONTROLS[key];
    return '<div class="field"><label for="L_' + key + '">' + esc(c.label) +
      '<span class="v" id="v_L_' + key + '">' + value.toFixed(c.step < 1 ? 1 : 0) + ' ' + c.unit + '</span></label>' +
      '<input type="range" id="L_' + key + '" data-lab="' + key + '" min="' + c.min + '" max="' + c.max +
      '" step="' + c.step + '" value="' + value + '"></div>';
  }

  /* ==================================================================
     THE INSPECTOR
     =============================================================== */
  function renderInspector() {
    var S = App.S, h = [];

    if (MODES[S.mode].guided) {
      h.push('<div class="panel"><h3>Guided discovery</h3><ul class="steps">');
      GUIDED_STEPS.forEach(function (st, i) {
        var cls = i === S.guidedStep ? "on" : (i < S.guidedStep ? "done" : "");
        h.push('<li class="' + cls + '"><span class="k">' + (i + 1) + '</span><span>' + esc(st.title) + '</span></li>');
      });
      h.push('</ul><button class="btn sm" type="button" data-act="guide">Open the note for this step</button></div>');
    }

    /* live readout */
    h.push('<div class="panel"><h3>Readout</h3><dl class="readout" id="liveReadout">' + readoutRows() + '</dl></div>');

    /* the fit */
    if (S.fitStats) {
      var st = S.fitStats;
      h.push('<div class="panel"><h3>Your current interpretation</h3><dl class="readout">' +
        row("Axis", n2(S.wb.axisKm) + " km") +
        row("Half rate, left", n2(S.wb.rateL) + " cm/yr") +
        row("Half rate, right", n2(S.wb.symmetric ? S.wb.rateL : S.wb.rateR) + " cm/yr") +
        row("Full rate", n2(S.wb.rateL + (S.wb.symmetric ? S.wb.rateL : S.wb.rateR)) + " cm/yr") +
        row("Profile RMSE", n1(st.rmse) + " nT") +
        row("Instrument noise", n1(S.survey.noiseNt) + " nT") +
        row("Correlation", n2(st.r)) +
        row("Residual lag-1", n2(st.lag1)) +
        '</dl>');
      if (st.rmse < S.survey.noiseNt * 1.35) {
        h.push('<div class="callout ok">The residual is close to the noise the instrument is putting in. ' +
          'There is little structure left for a better model to explain.</div>');
      } else if (Math.abs(st.lag1) > 0.45) {
        h.push('<div class="callout">The residual is strongly autocorrelated. What is left over is ' +
          'structured, not random: something in the model is wrong rather than merely imprecise.</div>');
      }
      h.push('</div>');
    }

    /* candidates */
    if (S.candidates) h.push(candidateBlock());

    /* commit */
    if (S.transects.length && !S.revealed) {
      h.push('<div class="panel"><h3>Commit</h3>' +
        '<p class="note">Recording an interpretation is what makes this an experiment rather than a demonstration. ' +
        'The hidden geology is shown only afterwards, and the reveal cannot be undone for this run.</p>' +
        '<button class="btn primary" type="button" data-act="commit">Commit interpretation</button></div>');
    }
    if (S.revealed) {
      h.push('<div class="panel"><h3>Result</h3>' +
        '<button class="btn primary" type="button" data-act="report">Reopen the inference report</button>' +
        '<div class="rowbtns"><button class="btn sm" type="button" data-act="newseed">Survey a new world</button></div></div>');
    }

    /* the ledger */
    h.push(ledgerBlock());

    /* explanation layers */
    h.push('<div class="panel"><h3>Explanation</h3><div class="rowbtns">' +
      '<button class="btn sm" type="button" data-act="explain1">Quick</button>' +
      '<button class="btn sm" type="button" data-act="explain2">Mechanism</button>' +
      '<a class="btn sm" href="methods.html">Methods</a>' +
      '</div></div>');

    $("inspector").innerHTML = h.join("");
  }

  function row(k, v) { return "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>"; }

  function readoutRows() {
    var S = App.S;
    var tr = S.active || S.transects[S.viewTransect];
    var out = "";
    out += row("Seed", String(S.seed));
    out += row("Ship-hours used", n1(S.budgetUsedHours) + " of " + (S.budgetHours > 500 ? "∞" : n0(S.budgetHours)));
    out += row("Lines run", S.transects.length + " of " + S.transectLimit);
    if (!tr) { out += row("Status", "no line run"); return out; }
    var k = S.active ? Math.floor(S.cursor) : tr.n - 1;
    out += row("Station", (k + 1) + " of " + tr.n);
    out += row("Along-track", n1(tr.s[k]) + " km");
    out += row("Chart east", n1(tr.x[k]) + " km");
    out += row("Anomaly", tr.missing[k] ? "reading lost" : n1(tr.values[k]) + " nT");
    out += row("Readings lost", App.countMissing(tr) + " of " + tr.n);
    out += row("Ridge-normal span", n1(tr.track.normalSpanKm) + " km");
    if (S.survey.trackAngleDeg < 89.5) {
      out += row("Apparent stretch", "×" + n2(tr.track.apparentWidthFactor));
    }
    return out;
  }

  function updateLiveReadout() {
    var el = $("liveReadout");
    if (el) el.innerHTML = readoutRows();
    var t = $("cursorVal");
    if (t) t.textContent = cursorText();
  }

  function cursorText() {
    var S = App.S;
    var tr = S.active || S.transects[S.viewTransect];
    if (!tr) return "";
    var i = (S.hoverIndex !== null && S.hoverIndex !== undefined) ? S.hoverIndex
      : (S.active ? Math.floor(S.cursor) : tr.n - 1);
    if (i >= tr.n) i = tr.n - 1;
    return "s = " + n1(tr.s[i]) + " km · x = " + n1(tr.x[i]) + " km · " +
      (tr.missing[i] ? "reading lost" : n1(tr.values[i]) + " nT");
  }

  /* ---- candidate models ---- */
  function candidateBlock() {
    var S = App.S, C = S.candidates;
    var h = ['<div class="panel"><h3>Candidate explanations</h3><div class="cands">'];
    var lead = C[0];
    var sep = C.length > 1 ? MagOcean.distinguishability(
      (S.heldOut && C[0].heldOut) ? C[0].heldOut : C[0].stats,
      (S.heldOut && C[1].heldOut) ? C[1].heldOut : C[1].stats,
      S.survey.noiseNt) : null;

    C.forEach(function (c, i) {
      var stat = (S.heldOut && c.heldOut) ? c.heldOut : c.stats;
      h.push('<div class="cand' + (i === 0 ? " lead" : "") + '">');
      h.push('<h5>' + esc(c.label) + '</h5>');
      h.push('<div class="st">RMSE ' + n1(c.stats.rmse) + ' nT · r ' + n2(c.stats.r) +
        ' · k ' + c.k + ' · ΔAICc ' + (isFinite(c.dAICc) ? n1(c.dAICc) : "—") + '</div>');
      if (S.heldOut && c.heldOut) {
        h.push('<div class="st">held-out RMSE ' + n1(c.heldOut.rmse) + ' nT on line ' + (S.heldOut.index + 1) + '</div>');
      }
      if (c.fitted && c.fitted.axisKm !== undefined) {
        h.push('<div class="st">axis ' + n2(c.fitted.axisKm) + ' km · ' +
          n2(c.fitted.halfRateLeftCmYr) + ' / ' + n2(c.fitted.halfRateRightCmYr) + ' cm/yr half rates</div>');
        h.push('<button class="btn sm" type="button" data-adopt="' + i + '">Adopt these numbers</button>');
      }
      h.push('<p>' + esc(c.detail) + '</p>');
      h.push('</div>');
    });
    h.push('</div>');

    /* the verdict, in the language the evidence supports */
    var verdict;
    if (!sep) verdict = "Only one model produced a usable fit.";
    else if (!sep.separable) {
      verdict = "<b>Unable to distinguish.</b> " + esc(lead.label) + " has the lower error, but the gap to " +
        esc(App.S.candidates[1].label.toLowerCase()) + " (" + n1(sep.delta) + " nT) is inside the sampling noise on that difference (" +
        n1(sep.threshold) + " nT). This survey does not separate them. Another transect would.";
    } else {
      verdict = "<b>" + esc(lead.label) + "</b> is better supported under this survey: it leaves " +
        n1(sep.delta) + " nT less error than the next model, which is more than the sampling noise on that difference. " +
        "That is a statement about these data, not a proof.";
    }
    h.push('<div class="callout">' + verdict + '</div>');
    if (!S.heldOut) {
      h.push('<div class="callout">Every model here was scored on the data it was fitted to. ' +
        'The flexible one will always win that contest eventually. Run a second line and it gets tested on something it has not seen.</div>');
    }
    h.push('<p class="note">ΔAICc is an information criterion: it charges each model for its parameters. ' +
      'It is a comparison aid, not a probability that a model is true.</p>');
    h.push('</div>');
    return h.join("");
  }

  /* ---- transect ledger ---- */
  function ledgerBlock() {
    var S = App.S;
    if (!S.transects.length) return "";
    var h = ['<div class="panel"><h3>Lines run</h3><div class="tablewrap"><table>',
      '<thead><tr><th>Line</th><th class="num">Length</th><th class="num">Angle</th>' +
      '<th class="num">Spacing</th><th class="num">Lost</th><th class="num">Hours</th><th></th></tr></thead><tbody>'];
    S.transects.forEach(function (t, i) {
      h.push('<tr' + (i === S.viewTransect ? ' class="lead"' : '') + '>' +
        '<td>L' + (i + 1) + '</td>' +
        '<td class="num">' + n0(t.survey.trackLengthKm) + ' km</td>' +
        '<td class="num">' + n0(t.survey.trackAngleDeg) + '°</td>' +
        '<td class="num">' + n1(t.survey.sampleSpacingKm) + ' km</td>' +
        '<td class="num">' + App.countMissing(t) + '</td>' +
        '<td class="num">' + n1(t.costHours) + '</td>' +
        '<td><button class="btn sm" type="button" data-view="' + i + '">View</button></td></tr>');
    });
    h.push('</tbody></table></div>');
    h.push('<div class="rowbtns"><button class="btn sm" type="button" data-act="export">Export observations</button></div>');
    h.push('</div>');
    return h.join("");
  }

  /* ==================================================================
     CANVASES AND THEIR TEXT EQUIVALENTS
     =============================================================== */
  function drawScopes() {
    var S = App.S;
    Charts.drawPlan($("planCv"), S);
    Charts.drawProfile($("profCv"), S);
    var bench = $("benchScope");
    bench.classList.toggle("hide", !S.fitData);
    if (S.fitData) Charts.drawWorkbench($("benchCv"), S);
    var rev = $("revealScope");
    rev.classList.toggle("hide", !S.revealed);
    if (S.revealed) Charts.drawReveal($("revealCv"), S);
    writeSummaries();
  }

  /* The text equivalent. Not a description of a picture — the same
     numbers, so a reader who never sees the canvas can still answer the
     question the instrument is asking. */
  function writeSummaries() {
    var S = App.S;
    var tr = S.active || S.transects[S.viewTransect];
    var p = [];

    if (!tr) {
      p.push("No survey line has been run yet. The chart shows only the seafloor rise found by the echo sounder.");
    } else {
      var lo = Infinity, hi = -Infinity, sum = 0, k = 0, i;
      var upto = S.active ? Math.max(1, Math.floor(S.cursor) + 1) : tr.n;
      for (i = 0; i < upto; i++) {
        if (tr.missing[i]) continue;
        if (tr.values[i] < lo) lo = tr.values[i];
        if (tr.values[i] > hi) hi = tr.values[i];
        sum += tr.values[i]; k++;
      }
      p.push("Magnetic profile, line " + ((S.active ? S.transects.length : S.viewTransect) + 1) + ": " +
        k + " good readings over " + n1(tr.s[upto - 1]) + " kilometres of trackline, " +
        "at " + n1(tr.survey.sampleSpacingKm) + " km spacing and " +
        n0(tr.survey.trackAngleDeg) + " degrees to the ridge. " +
        "The anomaly runs from " + n0(lo) + " to " + n0(hi) + " nanotesla, mean " + n0(sum / Math.max(k, 1)) + ". " +
        App.countMissing(tr) + " readings were lost and are marked as gaps, not as zeros.");
      var flips = 0;
      for (i = 1; i < upto; i++) {
        if (tr.missing[i] || tr.missing[i - 1]) continue;
        if ((tr.values[i] - sum / Math.max(k, 1) < 0) !== (tr.values[i - 1] - sum / Math.max(k, 1) < 0)) flips++;
      }
      p.push("The trace crosses its own mean " + flips + " times.");
    }
    if (S.fitStats) {
      p.push("Current interpretation: ridge axis at " + n2(S.wb.axisKm) + " kilometres on the chart, half-spreading rates " +
        n2(S.wb.rateL) + " and " + n2(S.wb.symmetric ? S.wb.rateL : S.wb.rateR) +
        " centimetres a year, giving a full rate of " + n2(S.wb.rateL + (S.wb.symmetric ? S.wb.rateL : S.wb.rateR)) +
        ". It leaves a root-mean-square residual of " + n1(S.fitStats.rmse) +
        " nanotesla against instrument noise of " + n1(S.survey.noiseNt) +
        ", with a lag-one residual autocorrelation of " + n2(S.fitStats.lag1) + ".");
    }
    if (S.revealed && S.world) {
      p.push("Revealed: the true axis is at " + n2(S.world.ridgeAxisKm) + " kilometres, the true half rates are " +
        n2(S.world.halfRateLeftCmYr) + " and " + n2(S.world.halfRateRightCmYr) +
        " centimetres a year, and the hidden world was generated by " +
        GENERATORS[S.world.generator].label.toLowerCase() + ".");
    }
    $("srSummary").innerHTML = p.map(function (s) { return "<p>" + esc(s) + "</p>"; }).join("");
    var cv = $("profCv");
    cv.setAttribute("aria-label", p[0] || "");
  }

  /* ==================================================================
     PROGRESS, TOASTS, LIVE REGION
     =============================================================== */
  function updateFitProgress(f) {
    var el = $("fitProg");
    if (el) el.firstChild.style.width = Math.round(f * 100) + "%";
  }
  function updateCompareProgress(f) {
    var el = $("cmpProg");
    if (el) el.firstChild.style.width = Math.round(f * 100) + "%";
  }
  function say(text) {
    var el = $("live");
    if (el) el.textContent = text;
  }
  function toast(text, kind) {
    say(text);
    var host = $("toast");
    host.textContent = text;
    host.className = "callout" + (kind === "bad" ? " bad" : kind === "ok" ? " ok" : "");
    host.style.display = "block";
    clearTimeout(host._t);
    host._t = setTimeout(function () { host.style.display = "none"; }, 6000);
  }

  /* ==================================================================
     MODAL
     =============================================================== */
  var lastFocus = null;
  function openModal(kicker, title, body, footer) {
    lastFocus = document.activeElement;
    $("modalKicker").textContent = kicker;
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = body;
    $("modalFoot").innerHTML = footer;
    $("veil").classList.add("on");
    var f = $("modalFoot").querySelector("button, a, input, select, textarea");
    if (f) f.focus();
  }
  function closeModal() {
    $("veil").classList.remove("on");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---- guided script ---- */
  function showGuide(i) {
    var S = App.S;
    if (i !== undefined) S.guidedStep = Math.max(0, Math.min(GUIDED_STEPS.length - 1, i));
    var st = GUIDED_STEPS[S.guidedStep];
    var extra = "";
    if (st.id === "design") {
      extra = "<h4>The one thing to know first</h4><p>Nobody has ever seen a magnetic stripe on the seafloor. " +
        "What ships collect is a single number, repeated every kilometre or so: the strength of the magnetic field, " +
        "with the Earth's main field already taken off. Everything else is inference.</p>";
    }
    if (st.id === "inspect") {
      extra = "<h4>What to look for</h4><ul>" +
        "<li>A centre. Is there a position about which the wiggles repeat?</li>" +
        "<li>An order. Are the same features present on both sides, in the same sequence?</li>" +
        "<li>A scale. How wide is the broad central feature compared with the ones beside it?</li></ul>";
    }
    if (st.id === "compare") {
      extra = "<h4>The arithmetic</h4><p>A polarity interval that lasted <i>D</i> million years is written into " +
        "the crust as a band <i>10 × v × D</i> kilometres wide on one side of the ridge, where <i>v</i> is that side's " +
        "half-spreading rate in centimetres a year. The Brunhes, the current normal chron, has lasted 0.780 Ma; " +
        "at 2 cm/yr that is a band 15.6 km wide either side of the axis, so 31 km of normal crust across the ridge.</p>";
    }
    openModal("Step " + (S.guidedStep + 1) + " of " + GUIDED_STEPS.length, st.title,
      "<p>" + esc(st.body) + "</p>" + extra,
      (S.guidedStep > 0 ? '<button class="btn" type="button" data-act="guideprev">Back</button>' : "") +
      (S.guidedStep < GUIDED_STEPS.length - 1
        ? '<button class="btn primary" type="button" data-act="guidenext">Next</button>'
        : '<button class="btn primary" type="button" data-act="closemodal">Close</button>'));
    renderInspector();
  }

  /* ---- explanation layers ---- */
  function showExplain(level) {
    if (level === 1) {
      openModal("Level 1", "The quick explanation",
        "<p>The floor of the ocean is made at long cracks called ridges. Molten rock rises, cools, and " +
        "becomes new seafloor. As it cools past a certain temperature it locks in the direction of the " +
        "Earth's magnetic field at that moment, like a compass needle setting in wax.</p>" +
        "<p>The Earth's magnetic field flips over from time to time — north becomes south — at irregular " +
        "intervals of tens of thousands to millions of years. Each flip is written into whatever crust " +
        "happens to be cooling at the time.</p>" +
        "<p>The seafloor then moves away from the ridge on both sides, carrying its record with it. The " +
        "result is a long strip of rock in which the recorded field direction alternates, and because " +
        "both sides move away together, the pattern is roughly mirrored about the ridge.</p>" +
        "<p><b>You cannot see any of this.</b> What a ship measures is the total magnetic field above the " +
        "water: a smooth, noisy line. The alternating rock underneath has to be inferred from it.</p>",
        '<button class="btn primary" type="button" data-act="closemodal">Close</button>');
      return;
    }
    openModal("Level 2", "The mechanism",
      "<h4>Making the rock</h4>" +
      "<p>Basalt erupted at a ridge cools through the Curie temperature of its magnetic minerals — " +
      "titanomagnetite, mostly — and acquires a thermoremanent magnetisation in the direction of the field " +
      "present at that moment. The uppermost half kilometre of crust, the pillow-basalt layer, carries most " +
      "of it. That magnetisation stays put while the rock moves.</p>" +
      "<h4>Moving it</h4>" +
      "<p>Crust leaves the axis at the half-spreading rate. Age therefore increases with distance:</p>" +
      "<p class='mono'>distance (km) = 10 × half rate (cm/yr) × age (Ma)</p>" +
      "<p>The factor of ten is only a unit conversion: one centimetre a year is ten kilometres per million " +
      "years. A polarity interval lasting <i>D</i> million years occupies a band <i>10 × v × D</i> " +
      "kilometres wide on <i>one</i> side. Both sides together make a band twice that across the ridge, " +
      "which is why a half rate and a full rate must never be confused.</p>" +
      "<h4>Why the measured signal is smooth</h4>" +
      "<p>The magnetised blocks have sharp edges. The field they produce does not. A magnetometer towed at " +
      "the sea surface sits two to three kilometres above the source, and the field of a buried body is " +
      "smoothed and reduced with distance — a low-pass filter with a corner set by the sensor's height. " +
      "Blocks narrower than about that height blur into each other and lose amplitude. Neighbouring blocks " +
      "of opposite polarity partly cancel. What comes out is a continuous trace whose peaks do not sit over " +
      "the block centres and whose zero crossings do not sit on the boundaries.</p>" +
      "<h4>Approximately, not exactly, symmetric</h4>" +
      "<p>Spreading is usually close to symmetric but rarely exactly so; the two flanks can differ by tens " +
      "of per cent. Ridge jumps, propagating rifts and changes in rate through time all break the pattern " +
      "further. None of those is modelled here.</p>",
      '<button class="btn primary" type="button" data-act="closemodal">Close</button>');
  }

  /* ---- commitment ---- */
  function showCommit() {
    var S = App.S;
    var body =
      "<p>Write down what you think the seafloor is doing. Nothing here is scored against a single number, " +
      "and the reveal cannot be undone for this run.</p>" +
      '<div class="field"><label for="cm_axis">Ridge-axis position, km on the chart</label>' +
      '<input type="number" id="cm_axis" step="0.1" value="' + S.wb.axisKm.toFixed(2) + '"></div>' +
      '<div class="field"><label for="cm_rl">Left half-spreading rate, cm/yr</label>' +
      '<input type="number" id="cm_rl" step="0.01" min="0" value="' + S.wb.rateL.toFixed(2) + '"></div>' +
      '<div class="field"><label for="cm_rr">Right half-spreading rate, cm/yr</label>' +
      '<input type="number" id="cm_rr" step="0.01" min="0" value="' +
        (S.wb.symmetric ? S.wb.rateL : S.wb.rateR).toFixed(2) + '"></div>' +
      '<div class="field"><label for="cm_sym">Is the spreading symmetric?</label>' +
      '<select id="cm_sym"><option value="1"' + (S.wb.symmetric ? " selected" : "") + '>Yes — the two flanks match</option>' +
      '<option value="0"' + (S.wb.symmetric ? "" : " selected") + '>No — the flanks differ</option>' +
      '<option value="-1">Cannot tell from this survey</option></select></div>' +
      '<div class="field"><label for="cm_chron">Which polarity chronology did you use?</label>' +
      '<select id="cm_chron"><option value="published"' + (S.wb.chronology === "published" ? " selected" : "") +
      '>The published one</option><option value="synthetic"' + (S.wb.chronology === "synthetic" ? " selected" : "") +
      '>A synthetic one</option></select></div>' +
      '<div class="field"><label for="cm_model">Which explanation do you prefer?</label>' +
      '<select id="cm_model">' +
      '<option value="symmetric">Symmetric spreading with field reversals</option>' +
      '<option value="asymmetric"' + (S.wb.symmetric ? "" : " selected") + '>Asymmetric spreading with field reversals</option>' +
      '<option value="static">Stationary crust with correlated magnetisation</option>' +
      '<option value="constant">Spreading with a constant-polarity field</option>' +
      '<option value="undecided">Cannot decide on this evidence</option></select></div>' +
      '<div class="field"><label for="cm_conf">How confident are you in the full spreading rate? <span class="v" id="cm_confv">60%</span></label>' +
      '<input type="range" id="cm_conf" min="5" max="99" step="1" value="60"></div>' +
      '<div class="field"><label for="cm_why">Why. One or two sentences, for your own record.</label>' +
      '<textarea id="cm_why" placeholder="What in the trace persuaded you, and what did not?"></textarea></div>' +
      '<div class="callout">Committing reveals the hidden geology for this run. If you want to survey more first, close this.</div>';
    openModal("Interpretation", "Commit before you look", body,
      '<button class="btn" type="button" data-act="closemodal">Not yet</button>' +
      '<button class="btn primary" type="button" data-act="docommit">Commit and reveal</button>');
    var cf = $("cm_conf");
    cf.addEventListener("input", function () { $("cm_confv").textContent = cf.value + "%"; });
  }

  /* ---- the inference report ---- */
  function showReport() {
    var S = App.S, R = S.report, W = S.world;
    if (!R) return;
    var h = [];

    h.push('<p>This is an inference report, not a score. Each line is a separate question about what the ' +
      'survey could and could not establish.</p>');

    h.push('<div class="repgrid">');
    h.push(cell("Axis error", n2(R.axisErrorKm) + " km", "you said " + n2(S.claim.axisKm) + ", it is " + n2(W.ridgeAxisKm),
      Math.abs(R.axisErrorKm) < 2 ? "good" : Math.abs(R.axisErrorKm) < 6 ? "warn" : "bad"));
    h.push(cell("Left half rate", n2(R.leftRateError) + " cm/yr", "true " + n2(W.halfRateLeftCmYr),
      rateClass(R.leftRateError, W.halfRateLeftCmYr)));
    h.push(cell("Right half rate", n2(R.rightRateError) + " cm/yr", "true " + n2(W.halfRateRightCmYr),
      rateClass(R.rightRateError, W.halfRateRightCmYr)));
    h.push(cell("Full rate", n2(R.fullRateError) + " cm/yr", "true " + n2(W.fullRateCmYr),
      rateClass(R.fullRateError, W.fullRateCmYr)));
    h.push(cell("Profile RMSE", R.claimStats ? n1(R.claimStats.rmse) + " nT" : "—",
      "instrument noise " + n1(S.survey.noiseNt) + " nT",
      R.claimStats && R.claimStats.rmse < S.survey.noiseNt * 1.4 ? "good" : "warn"));
    if (R.boundaryAlignment.applicable) {
      h.push(cell("Boundary alignment", n1(R.boundaryAlignment.meanOffsetKm) + " km",
        "mean over " + R.boundaryAlignment.nBoundaries + " boundaries, worst " + n1(R.boundaryAlignment.worstOffsetKm) + " km",
        R.boundaryAlignment.meanOffsetKm < 2 ? "good" : "warn"));
    }
    h.push(cell("Survey cost", n1(R.budgetUsedHours) + " h",
      R.transectsRun + " line" + (R.transectsRun > 1 ? "s" : "") + " of " +
      (S.budgetHours > 500 ? "unlimited" : n0(S.budgetHours) + " h"), ""));
    h.push(cell("Confidence", R.confidence + "%", "stated calibration: " + R.calibration,
      R.calibration === "consistent" ? "good" : "warn"));
    h.push('</div>');

    h.push("<h4>Symmetry</h4>");
    h.push("<p>You said the spreading was <b>" +
      (S.claim.symmetric === -1 ? "impossible to call" : S.claim.symmetric ? "symmetric" : "asymmetric") +
      "</b>. It was <b>" + (W.symmetric ? "symmetric" : "asymmetric") + "</b> — half rates of " +
      n2(W.halfRateLeftCmYr) + " and " + n2(W.halfRateRightCmYr) + " cm/yr.</p>");

    h.push("<h4>The generating model</h4>");
    h.push("<p>You preferred <b>" + esc(modelName(S.claim.model)) + "</b>. The hidden world was generated by <b>" +
      esc(GENERATORS[W.generator].label) + "</b>. " + esc(GENERATORS[W.generator].detail) + "</p>");
    if (W.generator === "staticCorrelated") {
      h.push('<div class="callout">This was the null world. There was no ridge axis and no spreading rate to find. ' +
        'A magnetisation field that is merely correlated in space can produce something that looks convincingly ' +
        'like a stripe sequence. Reporting that you could not distinguish the models would have been the correct answer.</div>');
    }
    if (W.generator === "constantPolarity") {
      h.push('<div class="callout">The crust here really was spreading, but the field never reversed, so every ' +
        'block was magnetised the same way and the anomaly is almost flat. Seafloor spreading on its own does not ' +
        'make stripes; spreading plus reversals does.</div>');
    }

    h.push("<h4>Chronology</h4>");
    h.push("<p>You fitted with the <b>" + esc(S.claim.chronology) + "</b> chronology. The world was built with the <b>" +
      esc(W.chronologyKey) + "</b> one. " +
      (S.claim.chronology === W.chronologyKey
        ? "Those agree, so the rate you recovered is not distorted by a mismatch in the assumed reversal ages."
        : "Those differ. A rate inferred against the wrong reversal sequence is wrong by whatever factor the two sequences differ by, and no amount of extra data fixes it.") +
      "</p>");

    if (R.residualWarning) h.push('<div class="callout">' + esc(R.residualWarning) + "</div>");

    h.push("<h4>Would more data have helped?</h4>");
    h.push("<p>" + esc(R.moreDataAdvice) + "</p>");

    if (S.candidates) {
      h.push("<h4>What the candidate models said</h4>");
      h.push('<div class="tablewrap"><table><thead><tr><th>Model</th><th class="num">RMSE</th>' +
        (S.heldOut ? '<th class="num">Held-out</th>' : "") +
        '<th class="num">k</th><th class="num">ΔAICc</th></tr></thead><tbody>');
      S.candidates.forEach(function (c) {
        h.push("<tr><td>" + esc(c.label) + '</td><td class="num">' + n1(c.stats.rmse) + "</td>" +
          (S.heldOut ? '<td class="num">' + (c.heldOut ? n1(c.heldOut.rmse) : "—") + "</td>" : "") +
          '<td class="num">' + c.k + '</td><td class="num">' + (isFinite(c.dAICc) ? n1(c.dAICc) : "—") + "</td></tr>");
      });
      h.push("</tbody></table></div>");
    }

    h.push("<h4>What was most informative</h4>");
    h.push("<p>" + esc(informative()) + "</p>");

    h.push("<h4>What this cannot establish</h4>");
    h.push("<p>A good fit here means the observations are consistent with a spreading, reversing world of the " +
      "kind this instrument builds. It is not a demonstration that the real seafloor works that way, and it is " +
      "not a measurement of anything. The forward model leaves out sediment, variable crustal thickness, " +
      "alteration, bathymetric relief, transform faults, ridge jumps, changes of rate through time, " +
      "three-dimensional geometry, ship contamination and diurnal variation. " +
      '<a href="methods.html#s4">The full list is on the methods page.</a></p>');

    if (S.claim.rationale) {
      h.push("<h4>What you wrote before looking</h4><p><i>" + esc(S.claim.rationale) + "</i></p>");
    }

    openModal("Inference report", "Seed " + S.seed, h.join(""),
      '<button class="btn" type="button" data-act="export">Export observations</button>' +
      '<a class="btn" href="methods.html">Methods &amp; limitations</a>' +
      '<button class="btn primary" type="button" data-act="closemodal">Close</button>');
  }

  function rateClass(err, truth) {
    var rel = Math.abs(err) / Math.max(truth, 1e-9);
    return rel < 0.08 ? "good" : rel < 0.25 ? "warn" : "bad";
  }
  function cell(k, v, s, cls) {
    return '<div class="repcell ' + (cls || "") + '"><div class="k">' + esc(k) + '</div>' +
      '<div class="v">' + esc(v) + '</div><div class="s">' + esc(s) + '</div></div>';
  }
  function modelName(key) {
    var map = {
      symmetric: "symmetric spreading with field reversals",
      asymmetric: "asymmetric spreading with field reversals",
      static: "stationary crust with correlated magnetisation",
      constant: "spreading with a constant-polarity field",
      undecided: "no decision on this evidence"
    };
    return map[key] || key;
  }

  function informative() {
    var S = App.S;
    var tr = S.transects[0];
    if (!tr) return "";
    var W = S.world;
    if (W.generator !== "spreading") {
      return "With no spreading in the hidden world, no part of the profile carried information about a rate. " +
        "The informative observation was the absence of a consistent centre of symmetry.";
    }
    var span = 0;
    for (var i = 0; i < S.transects.length; i++) span = Math.max(span, S.transects[i].track.normalSpanKm);
    var reach = span / 2 / (10 * Math.max(W.halfRateLeftCmYr, W.halfRateRightCmYr));
    return "The survey reached about " + n1(reach) + " Ma of crust either side of the axis. " +
      "The broad central anomaly fixed the axis; the narrow features further out fixed the rate, because a " +
      "small error in the rate displaces a distant boundary far more than a nearby one. " +
      (reach < 1.2
        ? "This line barely reached beyond the youngest chron, which is why the rate was poorly constrained."
        : "Sampling more finely would not have helped as much as running further out.");
  }

  /* ---- comparison result, opened after the scan ---- */
  function showComparison() {
    var S = App.S;
    if (!S.candidates) return;
    openModal("Model comparison", "Four explanations, scored", candidateBlock(),
      '<button class="btn primary" type="button" data-act="closemodal">Close</button>');
  }

  /* ==================================================================
     WHOLE-PAGE RENDER
     =============================================================== */
  function renderAll() {
    renderTop();
    renderRail();
    renderInspector();
    drawScopes();
    updateLiveReadout();
  }

  return {
    renderHome: renderHome, renderAll: renderAll, renderRail: renderRail,
    renderInspector: renderInspector, renderTop: renderTop,
    drawScopes: drawScopes, updateLiveReadout: updateLiveReadout,
    updateFitProgress: updateFitProgress, updateCompareProgress: updateCompareProgress,
    say: say, toast: toast, openModal: openModal, closeModal: closeModal,
    showGuide: showGuide, showExplain: showExplain, showCommit: showCommit,
    showReport: showReport, showComparison: showComparison,
    fmtCtl: fmtCtl, cursorText: cursorText
  };
})();
