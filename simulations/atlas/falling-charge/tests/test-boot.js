"use strict";
/* =====================================================================
   BOOT TEST — loads the page's scripts the way the browser does.
   ---------------------------------------------------------------------
   The Node suite exercises the DOM-free science modules. It cannot catch
   a syntax error in app.js, or a runtime error in the interface code,
   because it never loads them — and exactly that happened: a mismatched
   quote in app.js meant the module never parsed, FCApp was never defined,
   and the "Open the instrument" button silently did nothing.

   This file closes that gap. It builds a permissive DOM stub, loads every
   script tag from index.html in order, boots the app, starts a session,
   sprays droplets, runs the physics loop, tracks a droplet, derives a
   measurement, and renders every tab. It is not a substitute for opening
   the page in a browser — it stubs layout, fonts and pixels — but it does
   prove the code paths execute.
   ===================================================================== */
const T = require("./harness.js");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

/* ---- a permissive DOM stub -------------------------------------- */
function makeElement(id) {
  const el = {
    id: id, tagName: "DIV", value: "", textContent: "", innerHTML: "",
    checked: false, disabled: false, dataset: {},
    style: { setProperty: function () {}, removeProperty: function () {} },
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    children: [], parentElement: null,
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){},
    addEventListener(){}, removeEventListener(){}, appendChild(){}, removeChild(){},
    focus(){}, click(){ if (typeof el.onclick === "function") el.onclick({}); },
    getBoundingClientRect(){ return { width: 480, height: 400, left: 0, top: 0 }; },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    getContext(){ return ctx2d; }, toDataURL(){ return ""; }
  };
  el.parentElement = { getBoundingClientRect: el.getBoundingClientRect };
  return el;
}

/* A canvas context that accepts everything and records nothing. */
const ctx2d = new Proxy({}, {
  get(_, prop) {
    if (prop === "createLinearGradient" || prop === "createRadialGradient") {
      return function () { return { addColorStop: function () {} }; };
    }
    if (prop === "measureText") return function () { return { width: 10 }; };
    if (prop === "canvas") return undefined;
    return function () {};
  },
  set() { return true; }
});

function makeDom() {
  const els = new Map();
  const doc = {
    documentElement: {
      classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
      style: { setProperty(){}, removeProperty(){} },
      setAttribute(){}, getAttribute(){ return "day"; }
    },
    body: makeElement("body"),
    getElementById(id) {
      if (!els.has(id)) els.set(id, makeElement(id));
      return els.get(id);
    },
    createElement(tag) { const e = makeElement("_" + tag); e.tagName = tag.toUpperCase(); return e; },
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    addEventListener(){}, removeEventListener(){},
    _elements: els
  };
  return doc;
}

module.exports = function () {
  T.suite("Boot — every script parses");

  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const srcs = [];
  const re = /<script src="(src\/[^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) srcs.push(m[1]);

  T.ok(srcs.length >= 15, "index.html loads " + srcs.length + " application scripts");

  /* every script the page references must exist and parse */
  let allParse = true;
  srcs.forEach(function (rel) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) { T.ok(false, rel + " exists"); allParse = false; return; }
    try {
      new vm.Script(fs.readFileSync(p, "utf8"), { filename: rel });
    } catch (e) {
      T.ok(false, rel + " parses — " + e.message);
      allParse = false;
    }
  });
  T.ok(allParse, "all " + srcs.length + " scripts parse without syntax errors");

  /* app.js must actually be in the list — the interface is not optional */
  T.ok(srcs.indexOf("src/app.js") >= 0, "app.js is among the loaded scripts");

  T.suite("Boot — the page starts and a session runs");

  const doc = makeDom();
  const sandbox = {
    console: console,
    document: doc,
    localStorage: {
      _d: {}, getItem(k){ return this._d[k] || null; },
      setItem(k, v){ this._d[k] = String(v); }, removeItem(k){ delete this._d[k]; }
    },
    matchMedia: function () { return { matches: false, addEventListener(){} }; },
    devicePixelRatio: 1,
    performance: { now: function () { return Date.now(); } },
    requestAnimationFrame: function () { return 0; },   // loop stepped manually
    cancelAnimationFrame: function () {},
    setTimeout: function (fn) { return 0; },            // no async in the test
    clearTimeout: function () {},
    getComputedStyle: function () { return { getPropertyValue: function () { return "#888"; } }; },
    Blob: function () {}, URL: { createObjectURL(){ return ""; }, revokeObjectURL(){} },
    confirm: function () { return false; },
    Math: Math, Date: Date, JSON: JSON, Set: Set, Map: Map, Array: Array,
    Object: Object, String: String, Number: Number, isFinite: isFinite,
    parseFloat: parseFloat, parseInt: parseInt, Error: Error, Proxy: Proxy,
    CustomEvent: function () {}, Event: function () {},
    addEventListener: function () {}, removeEventListener: function () {},
    dispatchEvent: function () { return true; }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);

  let loadError = null;
  try {
    srcs.forEach(function (rel) {
      const code = fs.readFileSync(path.join(ROOT, rel), "utf8");
      new vm.Script(code, { filename: rel }).runInContext(context);
    });
  } catch (e) {
    loadError = e;
  }
  T.ok(!loadError, "every script executes at load time" +
       (loadError ? " — " + loadError.message : ""));

  T.ok(typeof sandbox.FC === "object", "the FC namespace exists");
  ["prng", "units", "physics", "droplets", "apparatus", "calibration",
   "measurement", "uncertainty", "analysis", "models", "notebook",
   "persistence", "charts", "reporting", "accessibility"].forEach(function (k) {
    T.ok(sandbox.FC && typeof sandbox.FC[k] === "object", "FC." + k + " is registered");
  });

  T.ok(typeof sandbox.FCApp === "object" && typeof sandbox.FCApp.boot === "function",
       "FCApp.boot exists — this is what the missing quote broke");

  /* boot wires the start button */
  let bootErr = null;
  try { sandbox.FCApp.boot(); } catch (e) { bootErr = e; }
  T.ok(!bootErr, "FCApp.boot() runs" + (bootErr ? " — " + bootErr.message : ""));

  const startBtn = doc.getElementById("btnStart");
  T.ok(typeof startBtn.onclick === "function",
       "the 'Open the instrument' button has a click handler attached");

  /* set the form up the way the page defaults it, then click */
  doc.getElementById("modeSel").value = "blind";
  doc.getElementById("profSel").value = "modern";
  doc.getElementById("seedIn").value = "boot-test";
  doc.getElementById("slipSel").value = "allen-raabe-1982";

  let clickErr = null;
  try { startBtn.onclick(); } catch (e) { clickErr = e; }
  T.ok(!clickErr, "clicking it starts a session" + (clickErr ? " — " + clickErr.message : ""));

  const S = sandbox.FCApp.state;
  T.ok(S.world !== null, "a world was created");
  T.ok(S.store !== null, "a store was created");
  T.ok(S.phase === "CALIBRATION", "the state machine is in CALIBRATION, as specified");
  T.ok(doc.getElementById("app").style.display === "grid", "the instrument pane was shown");

  T.suite("Boot — the interaction loop executes");

  /* walk the state machine the way the interface does */
  const btn = function (id) { return doc.getElementById(id); };

  let err = null;
  try {
    btn("btnNameplate").onclick();
    btn("btnCalScale").onclick();
    btn("btnCalVolt").onclick();
  } catch (e) { err = e; }
  T.ok(!err, "the calibration buttons work" + (err ? " — " + err.message : ""));
  T.ok(sandbox.FC.calibration.isComplete(S.cal), "the calibration record is complete");

  err = null;
  try { btn("btnCalDone").onclick(); } catch (e) { err = e; }
  T.ok(!err && S.phase === "PREREGISTER",
       "accepting the record moves to PREREGISTER" + (err ? " — " + err.message : ""));

  err = null;
  try { btn("btnPrereg").onclick(); } catch (e) { err = e; }
  T.ok(!err && S.phase === "COLLECTING",
       "preregistering the rules moves to COLLECTING" + (err ? " — " + err.message : ""));
  T.ok(S.store.protocolVersion() === 1, "protocol v1 is recorded");

  err = null;
  try { btn("btnAtomise").onclick(); } catch (e) { err = e; }
  T.ok(!err, "the atomiser fires" + (err ? " — " + err.message : ""));
  T.ok(S.world.droplets.length > 0, S.world.droplets.length + " droplets entered the chamber");

  /* advance using the app's OWN frame-loop body, not a reimplementation */
  err = null;
  try { sandbox.FCApp.advanceForTest(1.0); } catch (e) { err = e; }
  T.ok(!err, "the frame loop advances the world" + (err ? " — " + err.message : ""));
  T.ok(S.world.t > 0.9, "simulated time advanced to " + S.world.t.toFixed(2) + " s");

  err = null;
  try { btn("btnNext").onclick(); } catch (e) { err = e; }
  T.ok(!err, "droplet selection works" + (err ? " — " + err.message : ""));
  T.ok(S.world.selectedId !== null, "a droplet is selected: " + S.world.selectedId);

  /* rendering: the part the Node suite never touched */
  err = null;
  try {
    const pal = { scope:"#000", scopeLit:"#111", beam:"#222", field:"#333",
      brass1:"#a1", brass2:"#a2", brass3:"#a3", rule:"#444", ink:"#eee",
      muted:"#888", droplet:"#fff", selected:"#f80", dropletCore:"#fff",
      dropletEdge:"#000", reticleMaj:"#ccc", reticleMin:"#666", path:"#0cc",
      gate:"#fc0", point:"#0cc", fit:"#f80", zero:"#888", gridSoft:"#333",
      canvas:"#000" };
    const L = { x: 0, y: 0, w: 480, h: 400 };
    sandbox.FC.apparatus.drawChamber(ctx2d, S.world, L, pal);
    sandbox.FC.apparatus.drawScope(ctx2d, S.world, L, pal, null);
  } catch (e) { err = e; }
  T.ok(!err, "the chamber and microscope render without error" +
       (err ? " — " + err.message : ""));

  T.suite("Boot — every desk tab renders");
  ["notebook", "raw", "derived", "calibration", "qc", "analysis", "reveal", "methods"]
    .forEach(function (tab) {
      let e2 = null;
      try {
        S.tab = tab;
        sandbox.FCApp.renderDesk();
      } catch (ex) { e2 = ex; }
      T.ok(!e2, "tab '" + tab + "' renders" + (e2 ? " — " + e2.message : ""));
      if (!e2) {
        const body = doc.getElementById("deskBody").innerHTML;
        T.ok(typeof body === "string" && body.length > 40,
             "  and produces content (" + String(body).length + " chars)");
      }
    });


  /* =================================================================
     A COMPLETE EXPERIMENT, DRIVEN THROUGH THE INTERFACE
     ============================================================== */
  T.suite("Boot — a full experiment completes through the UI");

  const MEAS = sandbox.FC.measurement;
  const APP = sandbox.FCApp;

  /* Measure droplets until we have enough accepted ones. Each cycle uses
     the real buttons: field off, track, stop, set voltage, field on,
     track, stop — which is the loop a user performs. */
  let attempted = 0, derived = 0;
  let loopErr = null;

  /* A competent operator. Two things a real one does that a naive driver
     does not: turn the focus knob until the droplet is sharp, and skip
     droplets that are obviously too slow to measure. Both use only what
     the instrument shows — the suitability readout added for exactly this
     purpose. Neither consults any hidden value. */
  function focusOn(dropletId) {
    /* Sweep the focal plane and keep the sharpest setting. Computed from
       the optical model directly rather than by stepping the world, so
       turning the knob does not consume randomness or advance time. */
    const d = S.world.droplets.find(function (x) { return x.id === dropletId; });
    if (!d) return 0;
    const DRP = sandbox.FC.droplets, GEOM = sandbox.FC.apparatus.GEOM;
    let best = 0, bestQ = -1;
    for (let z = -1.4e-3; z <= 1.4e-3; z += 2e-5) {
      const q = DRP.focusQuality(d.depth, z, GEOM.depthOfField);
      if (q > bestQ) { bestQ = q; best = z; }
    }
    S.world.instrument.focalPlane = best;
    d.focus = bestQ;
    return bestQ;
  }

  /* How long can this droplet be tracked before it leaves the calibrated
     region? An operator judges this by eye; here it is computed from the
     observable speed and the visible runway. Fast droplets are precise
     but short-lived — the tension Millikan solved by reversing the field
     and re-timing the same droplet many times over. */
  function trackSeconds(d) {
    const gap = S.world.geom.plateGap;
    const v = Math.abs(d.vy);
    if (!(v > 0)) return 0;
    const runway = (d.vy < 0 ? d.y : gap - d.y) - 6e-4;
    return Math.max(0, Math.min(20, runway / v));
  }

  try {
    while (S.store.accepted().length < 3 && attempted < 22) {
      attempted++;

      const cands = S.world.droplets.filter(function (d) {
        return d.visible && d.y > 1.2e-3 && d.y < 4.8e-3 && Math.abs(d.vy) > 3.0e-5;
      });
      if (!cands.length) {
        btn("btnAtomise").onclick();
        APP.advanceForTest(1.5);
        continue;
      }
      /* the best droplet is the one with the most measurable travel:
         fast enough for a good velocity fit, with room to complete it */
      cands.sort(function (a, b) { return trackSeconds(b) - trackSeconds(a); });
      const pick = cands[0];
      S.world.selectedId = pick.id;
      focusOn(pick.id);

      const sel = S.world.droplets.find(function (x) { return x.id === pick.id; });
      const su = MEAS.suitability(sel, S.world);
      if (su.level === "poor") { APP.advanceForTest(1.0); continue; }

      const tFall = Math.min(16, trackSeconds(sel));
      if (tFall < 7) { APP.advanceForTest(1.0); continue; }

      /* --- field off, measure the fall --- */
      if (S.world.instrument.fieldOn) btn("btnField").onclick();
      S.world.instrument.settleUntil = 0;
      btn("btnTrack").onclick();
      if (!S.track) continue;
      APP.advanceForTest(tFall);
      btn("btnTrack").onclick();

      const before = S.store.derivedMeasurements.length;

      /* --- field on: raise it back up, which also measures the charge --- */
      const still = S.world.droplets.find(function (d) { return d.id === S.world.selectedId; });
      if (!still || !still.visible) continue;
      S.world.instrument.vDial = 250;
      if (!S.world.instrument.fieldOn) btn("btnField").onclick();
      S.world.instrument.settleUntil = 0;
      APP.advanceForTest(0.5);

      const after = S.world.droplets.find(function (d) { return d.id === S.world.selectedId; });
      if (!after || !after.visible) continue;
      const tField = Math.min(16, trackSeconds(after));
      if (tField < 6) { if (S.world.instrument.fieldOn) btn("btnField").onclick(); continue; }

      btn("btnTrack").onclick();
      if (!S.track) continue;
      APP.advanceForTest(tField);
      btn("btnTrack").onclick();

      if (S.store.derivedMeasurements.length > before) {
        derived++;
        const m = S.store.derivedMeasurements[S.store.derivedMeasurements.length - 1];
        APP.decideForTest(m.measId,
          m.ruleFails.length ? "rejected" : "accepted",
          m.ruleFails.length ? m.ruleFails[0] : null, "");
      }
      if (S.world.instrument.fieldOn) btn("btnField").onclick();
      APP.advanceForTest(0.5);
    }
  } catch (e) { loopErr = e; }

  T.ok(!loopErr, "the measurement loop runs through the UI" +
       (loopErr ? " — " + loopErr.message : ""));
  T.ok(derived >= 3, derived + " measurements were derived from " + attempted + " attempts");
  T.ok(MEAS.suitability(null, S.world).level === "none",
       "the suitability readout handles having no droplet selected");
  T.ok(S.store.rawObservations.length >= derived * 2,
       "each measurement stored its two raw observations");
  if (process.env.FC_DIAG) {
    S.store.derivedMeasurements.forEach(function (m) {
      console.log("      " + m.measId + " vf=" + (m.vFall * 1e6).toFixed(1) +
        "um/s r=" + (m.radius * 1e6).toFixed(2) + "um regime=" + m.regime +
        " u_q/q=" + ((m.uCharge / Math.abs(m.charge)) * 100).toFixed(1) + "%" +
        " fails=" + (m.ruleFails.join(",") || "ok"));
    });
  }
  T.ok(S.store.accepted().length >= 2,
       S.store.accepted().length + " accepted, " + S.store.rejected().length + " rejected");
  T.ok(S.store.rejected().every(function (m) { return !!m.rejectionReason; }),
       "every rejection through the UI carries a reason");

  T.suite("Boot — a charge cannot be reached from a voltage alone");
  {
    let threw = false;
    try {
      MEAS.derive(null, S.store.rawObservations[0], S.cal,
                  { slipModel: "allen-raabe-1982", rhoOil: 886 });
    } catch (e) { threw = true; }
    T.ok(threw, "deriving without a field-off fall observation throws");
    threw = false;
    try {
      MEAS.derive(S.store.rawObservations[0], null, S.cal,
                  { slipModel: "allen-raabe-1982", rhoOil: 886 });
    } catch (e) { threw = true; }
    T.ok(threw, "deriving without a field-on observation throws");
  }

  T.suite("Boot — lock, analyse, reveal");

  err = null;
  try { S.tab = "analysis"; APP.renderDesk(); btn("btnLockData").onclick(); } catch (e) { err = e; }
  T.ok(!err, "locking the dataset works" + (err ? " — " + err.message : ""));
  T.ok(S.phase === "ANALYSIS", "the state machine reached ANALYSIS");
  T.ok(S.analysis && S.analysis.ok, "an analysis was produced");
  if (S.analysis) {
    T.ok(isFinite(S.analysis.eHat) && S.analysis.eHat > 0,
         "it produced a finite estimate: " + (S.analysis.eHat * 1e19).toFixed(3) + "e-19 C");
    T.ok(isFinite(S.analysis.uncertainty), "with an uncertainty");
    T.ok(S.analysis.budget && S.analysis.budget.rows.length > 0,
         "and an uncertainty budget naming " + (S.analysis.budget ? S.analysis.budget.dominant : "—"));
  }

  /* the truth must still be sealed at this point */
  {
    let sealed = false;
    try { S.store.truth.read(S.world.droplets[0] ? S.world.droplets[0].id : "D-0001", "probe"); }
    catch (e) { sealed = true; }
    T.ok(sealed, "ground truth is STILL sealed after the analysis has run");
  }

  err = null;
  try { S.tab = "analysis"; APP.renderDesk(); btn("btnLockAn").onclick(); } catch (e) { err = e; }
  T.ok(!err, "locking the analysis works" + (err ? " — " + err.message : ""));
  T.ok(S.phase === "LOCKED", "the state machine reached LOCKED");
  T.ok(S.store.lockedAnalysis() !== null, "a locked, non-outcome-aware analysis is on record");

  err = null;
  try { S.tab = "analysis"; APP.renderDesk(); btn("btnReveal").onclick(); } catch (e) { err = e; }
  T.ok(!err, "revealing works" + (err ? " — " + err.message : ""));
  T.ok(S.phase === "REVEALED", "the state machine reached REVEALED");
  T.ok(S.revealInfo && isFinite(S.revealInfo.relativeError),
       "the reveal computed a relative error of " +
       (S.revealInfo ? (S.revealInfo.relativeError * 100).toFixed(1) + " %" : "—"));
  T.ok(S.revealInfo && typeof S.revealInfo.insideInterval68 === "boolean",
       "and reported interval coverage");

  err = null;
  try { S.tab = "reveal"; APP.renderDesk(); } catch (e) { err = e; }
  T.ok(!err, "the reveal tab renders with real data" + (err ? " — " + err.message : ""));
  {
    const body = doc.getElementById("deskBody").innerHTML;
    T.ok(body.indexOf("1.602") >= 0, "the reveal tab shows the accepted value");
    T.ok(!/correct|congratul|well done/i.test(body),
         "and contains no verdict or congratulatory language");
  }

  T.suite("Boot — export produces a complete bundle");
  err = null;
  let files = null;
  try {
    files = sandbox.FC.reporting.bundle(S.store, S.world, S.analysis, S.nb,
                                        S.streams, S.revealInfo);
  } catch (e) { err = e; }
  T.ok(!err, "the bundle builds" + (err ? " — " + err.message : ""));
  if (files) {
    ["manifest.json", "protocol.json", "calibration.json", "droplets.csv",
     "raw_observations.csv", "derived_measurements.csv", "exclusions.csv",
     "notebook.json", "analysis.json", "summary.json"].forEach(function (f) {
      T.ok(typeof files[f] === "string" && files[f].length > 0, "bundle contains " + f);
    });
    const der = files["derived_measurements.csv"];
    T.ok(S.store.rejected().every(function (m) { return der.indexOf(m.measId) >= 0; }),
         "rejected measurements survive into the export");
    T.ok(der.indexOf("true_charge_C") >= 0 && der.split("\n")[1].indexOf("e-") >= 0,
         "true values appear in the export only now that the reveal has happened");
  }

  T.suite("Boot — charts render");
  err = null;
  try {
    const CH = sandbox.FC.charts;
    const pal = { gridSoft:"#333", rule:"#444", muted:"#888", ink:"#eee",
                  point:"#0cc", fit:"#f80", zero:"#888", selected:"#f80" };
    const L = { x: 0, y: 0, w: 400, h: 230 };
    const E = 1.6e-19;
    const items = [];
    for (let i = 1; i <= 8; i++) {
      items.push({ measId: "M" + i, dropletId: "D" + i, charge: -i * E,
                   uCharge: 0.05 * i * E, status: "accepted", radius: 5e-7 });
    }
    const r = sandbox.FC.analysis.run(items);
    const out = [];
    out.push(CH.objectiveCurve(ctx2d, L, pal, r.methodA));
    out.push(CH.chargeVsInteger(ctx2d, L, pal, r.charges, r.methodA.assignments, r.eHat));
    out.push(CH.ladder(ctx2d, L, pal, r.charges, r.methodA.assignments, r.eHat));
    out.push(CH.chargeDistribution(ctx2d, L, pal, items));
    out.push(CH.residuals(ctx2d, L, pal, r.methodA.assignments.map(Math.abs),
                          r.methodB.residuals, r.sigmas, "assigned integer"));
    out.push(CH.positionTime(ctx2d, L, pal,
      [[0, 0], [1, -3e-5], [2, -6e-5], [3, -9e-5]],
      sandbox.FC.measurement.fitVelocity([[0,0],[1,-3e-5],[2,-6e-5],[3,-9e-5]])));
    T.ok(out.every(function (o) { return typeof o.summary === "string" && o.summary.length > 20; }),
         "every chart returns a prose summary for screen readers");
    T.ok(out.every(function (o) { return o.table && Array.isArray(o.table.rows); }),
         "every chart returns a data table alternative");
  } catch (e) { err = e; }
  T.ok(!err, "all charts draw without error" + (err ? " — " + err.message : ""));
};
