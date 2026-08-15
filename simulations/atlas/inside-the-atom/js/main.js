"use strict";
/* =====================================================================
   INSIDE THE ATOM — main.js

   Boot, state, and the animation loop.

   The loop only drives the apparatus view. Every count in this
   instrument is produced by a single call into the model when you press
   Expose; nothing accumulates over time, and pausing the animation
   changes no number anywhere. That is deliberate — an exposure is a
   quantity of particles, not a length of time, and a result should not
   depend on how long a window was left open.
   ===================================================================== */

(function () {

  /* ---------------- state ---------------- */
  var S = {
    mode: "free",
    cfg: null,
    session: null,
    screen: "bench",
    view: { logY: true, logX: false, showRuth: true, showThom: true,
            sweepLog: true, speed: 3, trajDensity: 40 },
    paths: [],
    lastObs: null,
    guidedStep: 0,
    prediction: null,
    conclusion: null,
    draftChoice: null,
    draftConfidence: 70,
    compare: null,
    advanced: false
  };

  function freshCfg() {
    var c = {};
    for (var k in DEFAULTS) c[k] = DEFAULTS[k];
    return c;
  }

  function say(msg) {
    if (!msg) return;
    var el = $("live");
    if (el) el.textContent = msg;
  }

  /* ---------------- rendering ---------------- */
  function rerender() { Screens.render(S); }
  function softUpdate() { Screens.renderTopbar(S); }

  function resample() {
    var n = Math.round(clamp(S.view.trajDensity, 0, 100) / 100 * 220);
    var model = (S.mode === "blind" && S.session.hidden) ? S.session.hidden : S.cfg.model;
    S.paths = Atom.trajectories(S.cfg, model, S.session.seed, S.session.counter, n);
    rerender();
  }

  function afterSettingsChange(msg) {
    resample();
    say(msg || ("Detector at " + S.cfg.detAngle + " degrees, aperture " + S.cfg.detWidth + " degrees."));
  }

  /* ---------------- the one action that produces data ---------------- */
  function activeModel() {
    return (S.mode === "blind" && S.session.hidden) ? S.session.hidden : S.cfg.model;
  }

  function expose() {
    var o = Atom.expose(S.cfg, activeModel(), S.session.seed, Atom.nextIndex(S.session));
    Atom.record(S.session, o);
    S.lastObs = o;
    Apparatus.burst(o.detected, performance.now());
    resample();
    say("Exposure " + o.index + " at " + o.detAngleDeg + " degrees: " + o.raw +
        " raw counts, background estimate " + fmt(o.backgroundMean, 2) +
        ", corrected " + fmt(o.corrected, 1) + " plus or minus " + fmt(o.sigma, 1) + ".");
  }

  function runSweep() {
    var angles = Atom.defaultSweepAngles();
    var start = S.session.counter;
    var out = Atom.sweep(S.cfg, activeModel(), S.session.seed, start, angles);
    S.session.counter = start + angles.length;
    out.forEach(function (o) { Atom.record(S.session, o); });
    S.lastObs = out[out.length - 1];
    go("counts");
    say("Sweep complete: " + angles.length + " exposures from " + angles[0] + " to " +
        angles[angles.length - 1] + " degrees.");
  }

  function runCompare() {
    var angles = Atom.defaultSweepAngles();
    /* Matched seeds: both models start from the same exposure index, so
       any difference between the two runs is the physics. */
    var base = S.session.seed;
    S.compare = {
      angles: angles,
      rutherford: Atom.sweep(S.cfg, "rutherford", base, 100000, angles),
      thomson: Atom.sweep(S.cfg, "thomson", base, 100000, angles)
    };
    rerender();
    say("Matched comparison run at " + angles.length + " angles through both models.");
  }

  /* ---------------- modes ---------------- */
  function start(mode, newSeed) {
    S.mode = mode;
    S.cfg = freshCfg();
    if (newSeed) S.cfg.seed = 1 + Math.floor(Date.now() % 999999);
    S.session = Atom.newSession(S.cfg, mode);
    S.lastObs = null;
    S.guidedStep = 0;
    S.prediction = null;
    S.conclusion = null;
    S.draftChoice = null;
    S.draftConfidence = 70;
    S.compare = null;
    S.screen = "bench";
    Apparatus.reset(); Apparatus.clearMarks();

    if (mode === "blind") {
      S.session.hidden = Atom.chooseHidden(S.cfg.seed);
      S.advanced = false;
    }
    if (mode === "guided") {
      for (var k in presetByKey("gold1913").set) S.cfg[k] = presetByKey("gold1913").set[k];
      S.cfg.seed = DEFAULTS.seed;
      S.session.seed = S.cfg.seed;
      S.session.cfg = Atom.snapshot(S.cfg);
    }
    if (mode === "compare") S.screen = "compare";

    $("home").style.display = "none";
    $("app").classList.add("on");
    setNav();
    resample();
    focusScreen();
    say(mode + " mode started with seed " + S.cfg.seed + ".");
  }

  function home() {
    $("app").classList.remove("on");
    $("home").style.display = "";
    Apparatus.reset();
    var f = document.querySelector(".modecard");
    if (f) f.focus();
  }

  function go(screen) {
    if (screen === "compare" && Screens.modelIsSecret(S)) {
      /* the screen still renders — it explains why it is withheld */
    }
    S.screen = screen;
    setNav();
    document.querySelectorAll(".screen").forEach(function (el) { el.classList.remove("on"); });
    var el = $("screen-" + screen);
    if (el) el.classList.add("on");
    rerender();
    focusScreen();
  }

  function focusScreen() {
    var el = $("screen-" + S.screen);
    if (el && el.focus) el.focus({ preventScroll: true });
  }

  function setNav() {
    document.querySelectorAll(".navitem").forEach(function (b) {
      var on = b.getAttribute("data-screen") === S.screen;
      b.classList.toggle("on", on);
      b.setAttribute("aria-current", on ? "page" : "false");
    });
  }

  /* ---------------- guided ---------------- */
  function guidedStep(delta) {
    var next = clamp(S.guidedStep + delta, 0, GUIDED.length - 1);
    if (delta > 0 && GUIDED[S.guidedStep].key === "predict" && S.prediction === null) {
      Events.modal("Guided reconstruction", "Commit to a prediction first",
        "<p>The point of writing it down before you look is that afterwards you will be certain you " +
        "knew all along. Pick the one nearest to what you expect; nothing is scored on it.</p>");
      return;
    }
    S.guidedStep = next;
    if (GUIDED[next].key === "compare") { go("distribution"); return; }
    if (GUIDED[next].key === "why") { go("conclude"); return; }
    rerender();
  }

  /* ---------------- blind ---------------- */
  function commitBlind() {
    if (!S.draftChoice) return;
    S.conclusion = Atom.scoreBlind(S.session, S.draftChoice, S.draftConfidence);
    rerender();
    say("Conclusion recorded. The hidden model was " + MODELS[S.conclusion.hidden].name +
        ". You were " + (S.conclusion.correct ? "correct" : "incorrect") + ".");
  }

  /* ---------------- housekeeping ---------------- */
  function reseed() {
    S.cfg.seed = 1 + Math.floor(Math.random() * 999998);
    S.session.seed = S.cfg.seed;
    if (S.mode === "blind" && !S.conclusion) S.session.hidden = Atom.chooseHidden(S.cfg.seed);
    afterSettingsChange("New seed: " + S.cfg.seed);
  }

  function confirmReset() {
    var n = S.session.ledger.length;
    if (!n) { doReset(); return; }
    Events.modal("Reset", "Discard " + n + " exposure" + (n === 1 ? "" : "s") + "?",
      "<p>The ledger is cleared and the session returns to its opening state, with the same mode and " +
      "the same seed. Export first if you want to keep the record.</p>",
      '<button class="btn" data-act="close-modal">Cancel</button>' +
      '<button class="btn danger" id="doReset">Reset</button>');
    var b = $("doReset");
    if (b) b.addEventListener("click", function () { Events.closeModal(); doReset(); });
  }

  function doReset() {
    var mode = S.mode, seed = S.cfg.seed;
    S.cfg = freshCfg();
    S.cfg.seed = seed;
    if (mode === "guided") {
      for (var k in presetByKey("gold1913").set) S.cfg[k] = presetByKey("gold1913").set[k];
    }
    S.session = Atom.newSession(S.cfg, mode);
    S.session.seed = seed;
    if (mode === "blind") S.session.hidden = Atom.chooseHidden(seed);
    S.lastObs = null; S.guidedStep = 0; S.prediction = null; S.conclusion = null;
    S.draftChoice = null; S.draftConfidence = 70; S.compare = null;
    Apparatus.reset(); Apparatus.clearMarks();
    go("bench");
    say("Session reset. Seed " + seed + ".");
  }

  /* Printing opens every screen so the report is complete, then puts the
     instrument back the way it was. */
  function printReport() {
    var was = S.screen;
    document.querySelectorAll(".screen").forEach(function (el) { el.classList.add("on"); });
    ["bench", "counts", "distribution", "ledger", "compare", "conclude", "notes"].forEach(function (k) {
      var el = $("screen-" + k);
      if (el && Screens.render) { S.screen = k; Screens.render(S); }
    });
    S.screen = was;
    window.print();
    setTimeout(function () { go(was); }, 300);
  }

  /* ---------------- animation loop ---------------- */
  var last = 0;
  function frame(now) {
    var dt = Math.min(60, now - last || 16);
    last = now;
    if (S.session && S.screen === "bench" && $("app").classList.contains("on")) {
      var cv = $("benchCanvas");
      if (cv) {
        Apparatus.step({
          speed: S.view.speed, trajDensity: S.view.trajDensity, paths: S.paths,
          detAngle: S.cfg.detAngle, detWidth: S.cfg.detWidth
        }, dt, now);
        Apparatus.draw(cv, {
          height: Math.max(320, Math.min(460, cv.clientWidth * 0.62)),
          detAngle: S.cfg.detAngle, detWidth: S.cfg.detWidth,
          beamSpread: S.cfg.beamSpread, targetName: Atom.geometry(S.cfg).target.name,
          thicknessNm: S.cfg.thickness, paths: S.paths,
          speed: S.view.speed, trajDensity: S.view.trajDensity, now: now
        });
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- boot ---------------- */
  function boot() {
    S.cfg = freshCfg();
    S.session = Atom.newSession(S.cfg, "free");
    Screens.renderHome();

    Events.bind(S, {
      start: start, go: go, rerender: rerender, softUpdate: softUpdate, resample: resample,
      afterSettingsChange: afterSettingsChange, expose: expose, runSweep: runSweep,
      runCompare: runCompare, guidedStep: guidedStep, commitBlind: commitBlind,
      reseed: reseed, confirmReset: confirmReset, printReport: printReport
    });
    Events.attach();

    $("fireBtn").addEventListener("click", expose);
    $("sweepBtn").addEventListener("click", runSweep);
    $("resetBtn").addEventListener("click", confirmReset);
    $("homeBtn").addEventListener("click", home);

    /* Canvases are drawn with colours read at paint time, so a theme
       change is a repaint. Without this the scopes keep the old world's
       ink until something else happens to redraw them. */
    Orbital.onThemeChange(function () { if (S.session) Screens.paint(S); });
    window.addEventListener("orbital:motion", function () { if (S.session) Screens.paint(S); });

    var t = null;
    window.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(function () { if (S.session) Screens.paint(S); }, 120);
    });

    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
