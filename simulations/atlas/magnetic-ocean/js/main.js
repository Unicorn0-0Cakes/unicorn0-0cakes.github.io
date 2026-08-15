"use strict";
/* =====================================================================
   THE MAGNETIC OCEAN — main.js

   State, the survey loop, and the sequence the operator moves through:

     design → collect → inspect → interpret → commit → reveal → limits

   The one rule this file exists to keep: NOTHING may read App.S.world
   before App.S.revealed is true, except the forward model that generates
   the observations. Anything that draws, prints or explains has to go
   through the accessors below, which refuse until the run is committed.
   ===================================================================== */

var App = (function () {

  var S = {
    mode: "guided",
    presetKey: "clean",
    seed: 20260805,
    survey: null,
    world: null,
    worldSpec: null,
    transects: [],
    active: null,
    cursor: 0,
    running: false,
    phase: "design",
    revealed: false,
    sounded: true,
    budgetHours: 40,
    budgetUsedHours: 0,
    transectLimit: 1,
    viewTransect: 0,
    hoverIndex: null,
    claimAxis: null,
    guidedStep: 0,
    /* the interpretation workbench */
    wb: { axisKm: 0, rateL: 2.0, rateR: 2.0, chronology: "published", symmetric: true },
    fitData: null,
    fitStats: null,
    noiseBand: 0,
    claim: null,
    report: null,
    candidates: null,
    heldOut: null,
    searcher: null,
    searchKind: null,
    compareStage: 0,
    compareRuns: null,
    planView: { x0: -120, x1: 120, y0: -80, y1: 80 },
    revealView: { x0: -120, x1: 120 },
    modelVersion: MO_VERSION
  };

  /* ---------------- world / survey construction ------------------- */

  function surveyFromPreset(p) {
    var s = controlDefaults();
    for (var k in p.survey) if (p.survey.hasOwnProperty(k)) s[k] = p.survey[k];
    s.trackStartYKm = -0.5 * p.survey.trackLengthKm;
    return s;
  }

  function buildWorld() {
    var spec;
    var m = MODES[S.mode];
    if (m.preset === "random") {
      spec = MagOcean.randomWorldSpec(S.seed, { allowNull: true });
    } else {
      var p = presetByKey(S.presetKey);
      spec = { seed: S.seed };
      for (var k in p.world) spec[k] = p.world[k];
    }
    spec.magnetisationAm = LAYER.magnetisationAm;
    spec.layerThicknessKm = LAYER.thicknessKm;
    S.worldSpec = spec;
    S.world = MagOcean.makeWorld(spec);
  }

  function resetRun(keepSeed) {
    if (!keepSeed) S.seed = (Math.floor(Math.random() * 1e9) >>> 0) || 1;
    var m = MODES[S.mode];
    S.budgetHours = m.budgetHours;
    S.transectLimit = m.transects;
    S.budgetUsedHours = 0;
    S.transects = [];
    S.active = null;
    S.cursor = 0;
    S.running = false;
    S.revealed = false;
    S.phase = "design";
    S.viewTransect = 0;
    S.hoverIndex = null;
    S.claimAxis = null;
    S.claim = null;
    S.report = null;
    S.candidates = null;
    S.heldOut = null;
    S.searcher = null;
    S.compareRuns = null;
    S.guidedStep = 0;
    S.fitData = null;
    S.fitStats = null;
    if (m.preset !== "random") {
      S.presetKey = m.preset === "clean" ? S.presetKey : m.preset;
      S.survey = surveyFromPreset(presetByKey(S.presetKey));
    } else {
      var d = controlDefaults();
      d.trackStartYKm = -0.5 * d.trackLengthKm;
      S.survey = d;
    }
    buildWorld();
    S.wb.axisKm = 0;
    S.wb.rateL = 2.0;
    S.wb.rateR = 2.0;
    S.wb.symmetric = true;
    S.wb.chronology = "published";
    recomputeViews();
  }

  function applyPreset(key) {
    S.presetKey = key;
    S.survey = surveyFromPreset(presetByKey(key));
    buildWorld();
    S.transects = []; S.active = null; S.budgetUsedHours = 0;
    S.revealed = false; S.phase = "design"; S.claim = null; S.report = null;
    S.candidates = null; S.fitData = null; S.claimAxis = null;
    recomputeViews();
  }

  function recomputeViews() {
    var half = Math.max(60, S.survey.trackLengthKm * Math.sin(S.survey.trackAngleDeg * DEG) * 0.62);
    var c = S.survey.trackStartKm + 0.5 * S.survey.trackLengthKm * Math.sin(S.survey.trackAngleDeg * DEG);
    S.planView = { x0: c - half, x1: c + half, y0: -half, y1: half };
    S.revealView = { x0: c - half, x1: c + half };
  }

  /* ---------------- the survey ------------------------------------ */

  function costOfNextLine() {
    return transectCostHours(S.survey.trackLengthKm, S.survey.shipSpeedKn);
  }
  function canRunLine() {
    if (S.revealed) return { ok: false, why: "This run has been committed. Start a new one to survey again." };
    if (S.transects.length >= S.transectLimit) {
      return { ok: false, why: "You have used all " + S.transectLimit + " line" + (S.transectLimit > 1 ? "s" : "") + " available in this mode." };
    }
    var c = costOfNextLine();
    if (c > S.budgetHours - S.budgetUsedHours) {
      return { ok: false, why: "That line costs " + c.toFixed(1) + " ship-hours and you have " +
               (S.budgetHours - S.budgetUsedHours).toFixed(1) + " left. Shorten it or run faster." };
    }
    var warn = MagOcean.geometryWarning(S.survey);
    if (warn && warn.level === "fail") return { ok: false, why: warn.text };
    return { ok: true };
  }

  function beginSurvey() {
    var chk = canRunLine();
    if (!chk.ok) { Screens.toast(chk.why, "bad"); return; }
    S.survey.trackStartYKm = -0.5 * S.survey.trackLengthKm * Math.cos(S.survey.trackAngleDeg * DEG);
    S.active = MagOcean.runTransect(S.world, S.survey, S.seed, S.transects.length);
    S.cursor = 0;
    S.running = true;
    S.phase = "collect";
    S.noiseBand = S.survey.noiseNt;
    recomputeViews();
    Screens.renderAll();
    Screens.say("Survey line " + (S.transects.length + 1) + " started. " +
      S.active.n + " stations planned over " + S.survey.trackLengthKm + " kilometres.");
  }

  function finishLine() {
    S.running = false;
    var tr = S.active;
    S.active = null;
    S.budgetUsedHours += tr.costHours;
    S.transects.push(tr);
    S.viewTransect = S.transects.length - 1;
    S.phase = "inspect";
    /* first guess for the workbench: the middle of what was surveyed */
    if (S.transects.length === 1) {
      var mid = 0.5 * (tr.x[0] + tr.x[tr.n - 1]);
      S.wb.axisKm = Math.round(mid * 2) / 2;
      S.claimAxis = S.wb.axisKm;
      updateFit();
    }
    Screens.renderAll();
    Screens.say("Line complete. " + tr.n + " stations, " + countMissing(tr) + " readings lost, " +
      tr.costHours.toFixed(1) + " ship-hours spent.");
  }

  function countMissing(tr) {
    var k = 0;
    for (var i = 0; i < tr.n; i++) if (tr.missing[i]) k++;
    return k;
  }

  var lastT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (!S.running || !S.active) return;
    if (document.documentElement.classList.contains("rf-paused")) return;
    /* stations per second = ship speed / sample spacing, sped up so a
       160 km line takes about twenty seconds rather than ten hours */
    var kmPerSec = S.survey.shipSpeedKn * KM_PER_NAUTICAL_MILE * 1500 / 3600;
    var step = kmPerSec * dt / S.survey.sampleSpacingKm;
    S.cursor += step;
    if (S.cursor >= S.active.n - 1) { S.cursor = S.active.n - 1; finishLine(); return; }
    Screens.drawScopes();
    Screens.updateLiveReadout();
  }

  function stepOnce() {
    if (!S.active) return;
    S.cursor = Math.min(S.active.n - 1, Math.floor(S.cursor) + 1);
    if (S.cursor >= S.active.n - 1) { finishLine(); return; }
    Screens.drawScopes();
    Screens.updateLiveReadout();
  }

  /* ---------------- the interpretation workbench ------------------ */

  function pooled() {
    if (!S.transects.length) return null;
    return MagOcean.poolData(S.transects);
  }

  function updateFit() {
    var data = pooled();
    if (!data) { S.fitData = null; S.fitStats = null; return; }
    var g = MagOcean.geometry(S.survey.sensorAltitudeKm, LAYER.thicknessKm, workbenchInclination());
    var table = MagOcean.edgeTable(g, 420, 0.02);
    var cand = {
      generator: "spreading", axisKm: S.wb.axisKm,
      halfRateLeftCmYr: S.wb.rateL,
      halfRateRightCmYr: S.wb.symmetric ? S.wb.rateL : S.wb.rateR,
      effInclinationDeg: workbenchInclination(),
      layerThicknessKm: LAYER.thicknessKm,
      chronology: S.wb.chronology, seed: S.seed
    };
    var col = MagOcean.structuralColumn(data, cand, table);
    var f = MagOcean.fitLinear(data, [col], null);
    if (!f) { S.fitData = null; S.fitStats = null; return; }
    var st = MagOcean.evaluateCandidateModel(data.y, f.pred, data.w, data.tid);

    /* the boundaries this interpretation implies, for the tick marks */
    var wSpec = {
      generator: "spreading", seed: S.seed, ridgeAxisKm: cand.axisKm,
      halfRateLeftCmYr: cand.halfRateLeftCmYr, halfRateRightCmYr: cand.halfRateRightCmYr,
      effInclinationDeg: cand.effInclinationDeg, magnetisationAm: 1,
      layerThicknessKm: LAYER.thicknessKm, chronology: cand.chronology
    };
    var cw = MagOcean.makeWorld(wSpec);
    var bounds = [];
    for (var i = 0; i < cw.blocks.length; i++) bounds.push(cw.blocks[i].x1);

    S.fitData = {
      x: data.x, y: data.y, w: data.w, s: data.s, tid: data.tid,
      pred: f.pred, axisKm: cand.axisKm, boundaries: bounds
    };
    S.fitStats = st;
    S.claimAxis = cand.axisKm;
    S.noiseBand = S.survey.noiseNt;
  }

  /* In laboratory mode the operator may set the effective inclination
     and therefore knows it. Everywhere else the workbench assumes the
     pole case, which is a real assumption and is labelled as one. */
  function workbenchInclination() {
    return S.mode === "lab" ? S.world.effInclinationDeg : 90;
  }

  /* ---------------- automatic fitting ----------------------------- */

  function startFit(asymmetric) {
    var data = pooled();
    if (!data) return;
    S.searchKind = asymmetric ? "asymmetric" : "symmetric";
    S.searcher = MagOcean.makeSearch(data, {
      sensorAltitudeKm: S.survey.sensorAltitudeKm,
      layerThicknessKm: LAYER.thicknessKm,
      effInclinationDeg: workbenchInclination(),
      chronology: S.wb.chronology,
      chronologySeed: S.seed,
      asymmetric: asymmetric
    });
    pumpSearch();
  }

  function pumpSearch() {
    if (!S.searcher) return;
    var t0 = performance.now();
    while (!S.searcher.done() && performance.now() - t0 < 22) S.searcher.step(80);
    Screens.updateFitProgress(S.searcher.progress());
    if (S.searcher.done()) {
      var b = S.searcher.best();
      if (b) {
        S.wb.axisKm = Math.round(b.cand.axisKm * 100) / 100;
        S.wb.rateL = Math.round(b.cand.halfRateLeftCmYr * 1000) / 1000;
        S.wb.rateR = Math.round(b.cand.halfRateRightCmYr * 1000) / 1000;
        S.wb.symmetric = S.searchKind === "symmetric";
        updateFit();
      }
      S.searcher = null;
      Screens.renderRail();
      Screens.renderInspector();
      Screens.drawScopes();
      Screens.say(b ? "Automatic fit finished." : "The automatic fit found nothing usable.");
      return;
    }
    requestAnimationFrame(pumpSearch);
  }

  /* ---------------- model comparison ------------------------------ */

  function startComparison() {
    var data = pooled();
    if (!data) return;
    var useHeldOut = S.transects.length >= 2;
    var holdIndex = S.transects.length - 1;
    var fitMask = useHeldOut ? MagOcean.heldOutMask(data, holdIndex) : null;
    S.compareRuns = {
      data: data, useHeldOut: useHeldOut, holdIndex: holdIndex, fitMask: fitMask,
      opts: {
        sensorAltitudeKm: S.survey.sensorAltitudeKm,
        layerThicknessKm: LAYER.thicknessKm,
        effInclinationDeg: workbenchInclination(),
        chronology: S.wb.chronology,
        chronologySeed: S.seed,
        fitMask: fitMask
      },
      symmetric: null, asymmetric: null, stage: 0
    };
    S.compareStage = 0;
    S.searcher = MagOcean.makeSearch(data, mix(S.compareRuns.opts, { asymmetric: false }));
    pumpCompare();
  }

  function mix(a, b) {
    var o = {};
    for (var k in a) o[k] = a[k];
    for (var j in b) o[j] = b[j];
    return o;
  }

  function pumpCompare() {
    var R = S.compareRuns;
    if (!R) return;
    var t0 = performance.now();
    while (S.searcher && !S.searcher.done() && performance.now() - t0 < 22) S.searcher.step(80);
    var frac = (R.stage + (S.searcher ? S.searcher.progress() : 1)) / 2.15;
    Screens.updateCompareProgress(Math.min(0.99, frac));
    if (S.searcher && !S.searcher.done()) { requestAnimationFrame(pumpCompare); return; }

    if (R.stage === 0) {
      R.symmetric = S.searcher.best();
      R.stage = 1;
      S.searcher = MagOcean.makeSearch(R.data, mix(R.opts, { asymmetric: true }));
      requestAnimationFrame(pumpCompare);
      return;
    }
    R.asymmetric = S.searcher.best();
    S.searcher = null;

    var cands = MagOcean.candidateSet(R.data, mix(R.opts, {
      searchResults: { symmetric: R.symmetric, asymmetric: R.asymmetric }
    }));
    if (R.useHeldOut) {
      var holdMask = MagOcean.holdMaskOnly(R.data, R.holdIndex);
      for (var i = 0; i < cands.length; i++) {
        cands[i].heldOut = MagOcean.heldOutScore(R.data, cands[i], holdMask);
      }
    }
    S.candidates = cands;
    S.heldOut = R.useHeldOut ? { index: R.holdIndex } : null;
    S.compareRuns = null;
    Screens.updateCompareProgress(1);
    Screens.renderInspector();
    Screens.showComparison();
    Screens.say("Model comparison complete. " + cands.length + " candidate explanations scored.");
  }

  /* ---------------- commitment and reveal ------------------------- */

  function commit(claim) {
    S.claim = claim;
    S.claimAxis = claim.axisKm;
    var data = pooled();
    if (!data) return;
    S.report = MagOcean.inferenceReport(S.world, claim, data, S.candidates, {
      sensorAltitudeKm: S.survey.sensorAltitudeKm,
      layerThicknessKm: LAYER.thicknessKm,
      effInclinationDeg: workbenchInclination(),
      noiseNt: S.survey.noiseNt,
      budgetHours: S.budgetHours,
      budgetUsedHours: S.budgetUsedHours
    });
    S.revealed = true;
    S.phase = "reveal";
    Screens.renderAll();
    Screens.showReport();
    Screens.say("Interpretation committed. The hidden geology is now shown.");
  }

  /* ---------------- export ---------------------------------------- */

  function exportObservations() {
    if (!S.transects.length) { Screens.toast("Nothing to export until a line has been run.", "bad"); return; }
    var text = MagOcean.exportObservations({
      modelVersion: S.modelVersion, seed: S.seed, mode: S.mode,
      survey: S.survey, world: S.world, revealed: S.revealed, transects: S.transects
    });
    var blob = new Blob([text], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "magnetic-ocean-seed" + S.seed + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    Screens.toast("Observations exported.", "ok");
  }

  /* ---------------- boot ------------------------------------------ */

  function launch(modeKey) {
    S.mode = modeKey;
    var m = MODES[modeKey];
    if (m.preset !== "random") S.presetKey = m.preset;
    resetRun(true);
    document.body.classList.add("launched");
    Screens.renderAll();
    if (m.guided) Screens.showGuide(0);
    window.scrollTo(0, 0);
  }

  function init() {
    S.seed = 20260805;
    S.survey = surveyFromPreset(presetByKey("clean"));
    buildWorld();
    recomputeViews();
    Screens.renderHome();
    Events.wire();
    Orbital.onThemeChange(function () { Screens.drawScopes(); });
    window.addEventListener("resize", function () { Screens.drawScopes(); });
    requestAnimationFrame(frame);
  }

  return {
    S: S, init: init, launch: launch, resetRun: resetRun, applyPreset: applyPreset,
    beginSurvey: beginSurvey, stepOnce: stepOnce, finishLine: finishLine,
    canRunLine: canRunLine, costOfNextLine: costOfNextLine,
    updateFit: updateFit, pooled: pooled, recomputeViews: recomputeViews,
    startFit: startFit, startComparison: startComparison,
    commit: commit, exportObservations: exportObservations,
    countMissing: countMissing, workbenchInclination: workbenchInclination
  };
})();

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", App.init);
else App.init();
