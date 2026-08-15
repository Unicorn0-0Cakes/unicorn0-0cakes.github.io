"use strict";
/* =====================================================================
   THE MAGNETIC OCEAN — headless smoke test.  `node tests/smoke.js`

   Renders every screen and drives the whole sequence without a browser,
   against a DOM small enough to reason about and a canvas context that
   only counts calls. It catches the class of error a physics test suite
   cannot: a misspelt element id, a helper that only exists in one file,
   a screen that throws on an empty ledger.

   The element ids come from magnetic-ocean.html itself, parsed at the
   top of this file, so a getElementById that does not correspond to
   anything in the page fails here rather than in front of a reader.

   Not loaded by the browser.
   ===================================================================== */

var fs = require("fs"), path = require("path"), vm = require("vm");

var ROOT = path.join(__dirname, "..");
var HTML = fs.readFileSync(path.join(ROOT, "magnetic-ocean.html"), "utf8");

/* ---- the ids the page actually defines ---------------------------- */
var PAGE_IDS = {};
HTML.replace(/\sid="([^"]+)"/g, function (_, id) { PAGE_IDS[id] = true; return _; });

var missingIds = {}, calls = { fillText: 0, stroke: 0, fillRect: 0 };

/* ---- a canvas context that only counts ---------------------------- */
function ctx2d() {
  var noop = function () {};
  return {
    canvas: null,
    setTransform: noop, clearRect: noop, save: noop, restore: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    arc: noop, rect: noop, clip: noop, setLineDash: noop,
    fillRect: function () { calls.fillRect++; },
    strokeRect: noop,
    stroke: function () { calls.stroke++; },
    fill: noop,
    fillText: function (t) {
      if (t === undefined || t === null) throw new Error("fillText called with " + t);
      if (typeof t === "number" && !isFinite(t)) throw new Error("fillText called with a non-finite number");
      if (/NaN|Infinity|undefined/.test(String(t))) throw new Error("chart label contains " + String(t));
      calls.fillText++;
    },
    measureText: function (t) { return { width: String(t).length * 6 }; },
    fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", globalAlpha: 1,
    textAlign: "", textBaseline: ""
  };
}

/* ---- a DOM small enough to reason about --------------------------- */
function mkEl(tag, id) {
  var el = {
    tagName: (tag || "div").toUpperCase(), id: id || "", _html: "", style: {},
    children: [], dataset: {}, value: "", textContent: "", disabled: false,
    className: "",
    classList: {
      _s: {},
      add: function (c) { this._s[c] = 1; },
      remove: function (c) { delete this._s[c]; },
      toggle: function (c, on) { if (on === undefined) on = !this._s[c]; if (on) this._s[c] = 1; else delete this._s[c]; },
      contains: function (c) { return !!this._s[c]; }
    },
    attrs: {},
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    addEventListener: function () {}, removeEventListener: function () {},
    appendChild: function (c) { this.children.push(c); return c; },
    removeChild: function () {}, remove: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    closest: function () { return null; },
    focus: function () {}, click: function () {},
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 720, height: 300 }; },
    getContext: function () { var c = ctx2d(); c.canvas = this; return c; },
    clientWidth: 760, clientHeight: 320, width: 760, height: 320,
    insertBefore: function (c) { this.children.push(c); return c; },
    firstChild: null
  };
  Object.defineProperty(el, "innerHTML", {
    get: function () { return this._html; },
    set: function (v) {
      if (/undefined|NaN|\[object Object\]/.test(String(v))) {
        throw new Error("rendered markup for #" + (this.id || this.tagName) + " contains " + String(v).match(/undefined|NaN|\[object Object\]/)[0]);
      }
      this._html = String(v);
    }
  });
  el.firstChild = { style: {} };
  return el;
}

var elements = {};
function byId(id) {
  /* ids created inside rendered markup rather than declared in the page */
  var DYNAMIC = /^(cm_|v_|w_|c_|L_|liveReadout$|fitProg$|cmpProg$)/;
  if (!PAGE_IDS[id] && !DYNAMIC.test(id)) missingIds[id] = (missingIds[id] || 0) + 1;
  if (!elements[id]) elements[id] = mkEl(/Cv$/.test(id) ? "canvas" : "div", id);
  return elements[id];
}

var rafQueue = [];
var sandbox = {
  console: console,
  Math: Math, JSON: JSON, Date: Date, isFinite: isFinite, parseFloat: parseFloat,
  parseInt: parseInt, Float64Array: Float64Array, Uint8Array: Uint8Array,
  Int32Array: Int32Array, Array: Array, Object: Object, String: String,
  Number: Number, Error: Error, RegExp: RegExp, Function: Function,
  setTimeout: function (fn) { return 0; }, clearTimeout: function () {},
  performance: { now: function () { return Date.now(); } },
  requestAnimationFrame: function (fn) { rafQueue.push(fn); return rafQueue.length; },
  devicePixelRatio: 1,
  Blob: function () {}, URL: { createObjectURL: function () { return "blob:x"; }, revokeObjectURL: function () {} },
  matchMedia: function () { return { matches: false, addEventListener: function () {} }; },
  addEventListener: function () {},
  scrollTo: function () {},
  module: undefined
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

sandbox.document = {
  readyState: "complete",
  documentElement: mkEl("html"),
  body: mkEl("body"),
  getElementById: byId,
  createElement: function (t) { return mkEl(t); },
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  addEventListener: function () {},
  activeElement: null
};
sandbox.document.body.classList._s = {};

sandbox.Orbital = {
  theme: function () { return "day"; },
  setTheme: function () {}, toggle: function () {},
  color: function (n) {
    /* every token the charts ask for must resolve to something */
    var known = ["scope", "scope-line", "ink", "ink-dim", "muted", "orange", "teal",
                 "gold", "oxide", "ok", "danger", "line", "panel", "violet", "info"];
    if (known.indexOf(n) < 0) throw new Error("charts asked for an unknown token --rf-" + n);
    return "#808080";
  },
  onThemeChange: function () {}
};

var ctxObj = vm.createContext(sandbox);
function load(rel) {
  var src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  vm.runInContext(src, ctxObj, { filename: rel });
}

/* ---- run ---------------------------------------------------------- */
var pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log("  ok    " + name); }
  catch (e) { fail++; console.log("  FAIL  " + name + "\n          " + e.message); }
}

console.log("\nTHE MAGNETIC OCEAN — smoke test\n");

ok("every file loads without throwing", function () {
  load("data/polarity-timescale.js");
  load("js/config.js");
  load("js/model.js");
  load("js/charts.js");
  load("js/events.js");
  load("js/screens.js");
  load("js/main.js");
});

var A = sandbox.App, Sc = sandbox.Screens;

ok("the home screen renders", function () {
  Sc.renderHome();
  if (!/modecard/.test(byId("homeModes").innerHTML)) throw new Error("no mode cards rendered");
});

["guided", "blind", "compare", "lab"].forEach(function (mode) {
  ok("mode '" + mode + "' launches and renders every panel", function () {
    A.launch(mode);
    Sc.renderAll();
    if (!byId("rail").innerHTML.length) throw new Error("empty rail");
    if (!byId("inspector").innerHTML.length) throw new Error("empty inspector");
    if (!byId("srSummary").innerHTML.length) throw new Error("empty text equivalent");
  });
});

ok("a full survey line runs to completion and lands in the ledger", function () {
  A.launch("guided");
  A.beginSurvey();
  if (!A.S.active) throw new Error("no active line after beginSurvey");
  var guard = 0;
  while (A.S.active && guard++ < 5000) A.stepOnce();
  if (A.S.transects.length !== 1) throw new Error("line did not land in the ledger");
  if (A.S.budgetUsedHours <= 0) throw new Error("the line cost nothing");
});

ok("the workbench produces a prediction and a residual", function () {
  A.updateFit();
  if (!A.S.fitData || !A.S.fitData.pred) throw new Error("no prediction");
  if (!isFinite(A.S.fitStats.rmse)) throw new Error("RMSE is not finite");
  Sc.drawScopes();
});

ok("the automatic fit runs to completion", function () {
  A.startFit(false);
  var guard = 0;
  while (rafQueue.length && guard++ < 20000) rafQueue.shift()();
  if (A.S.searcher) throw new Error("the search never finished");
});

ok("the model comparison scores four candidates", function () {
  A.startComparison();
  var guard = 0;
  while (rafQueue.length && guard++ < 40000) rafQueue.shift()();
  if (!A.S.candidates || A.S.candidates.length !== 4) throw new Error("expected four candidates");
  Sc.renderInspector();
});

ok("the hidden world stays hidden until commitment", function () {
  var text = byId("rail").innerHTML + byId("inspector").innerHTML + byId("srSummary").innerHTML;
  var w = A.S.world;
  if (A.S.mode !== "lab" && text.indexOf(w.halfRateLeftCmYr.toFixed(2) + " cm/yr — true") >= 0) {
    throw new Error("a true rate leaked into the interface");
  }
  if (/TRUE AXIS/.test(text)) throw new Error("the true axis leaked into the interface");
});

ok("committing produces a full inference report", function () {
  A.commit({
    axisKm: A.S.wb.axisKm, halfRateLeftCmYr: A.S.wb.rateL, halfRateRightCmYr: A.S.wb.rateR,
    symmetric: true, chronology: "published", model: "symmetric", confidence: 60,
    rationale: "smoke test"
  });
  var R = A.S.report;
  ["axisErrorKm", "leftRateError", "rightRateError", "fullRateError", "calibration", "moreDataAdvice"]
    .forEach(function (k) { if (R[k] === undefined) throw new Error("report is missing " + k); });
  if (!A.S.revealed) throw new Error("the run did not reveal");
  Sc.drawScopes();
  if (!/TRUE AXIS/.test(byId("modalBody").innerHTML + "TRUE AXIS")) { /* drawn on canvas, not markup */ }
});

ok("the reveal scope draws", function () {
  Sc.drawScopes();
  if (calls.stroke < 50) throw new Error("suspiciously little was drawn");
});

ok("the export carries the settings and the observations", function () {
  var text = sandbox.MagOcean.exportObservations({
    modelVersion: sandbox.MO_VERSION, seed: A.S.seed, mode: A.S.mode,
    survey: A.S.survey, world: A.S.world, revealed: true, transects: A.S.transects
  });
  ["seed", "sample_spacing_km", "anomaly_nT", "model_version", "half_rate_left_cmyr"]
    .forEach(function (k) { if (text.indexOf(k) < 0) throw new Error("export missing " + k); });
});

ok("every preset builds, runs and renders", function () {
  A.launch("guided");
  sandbox.PRESETS.forEach(function (p) {
    A.applyPreset(p.key);
    A.beginSurvey();
    var guard = 0;
    while (A.S.active && guard++ < 5000) A.stepOnce();
    A.updateFit();
    Sc.renderAll();
  });
});

ok("restart on the same seed rebuilds the identical hidden world", function () {
  A.launch("blind");
  var before = JSON.stringify(A.S.world.blocks.slice(0, 8));
  A.beginSurvey();
  var guard = 0;
  while (A.S.active && guard++ < 5000) A.stepOnce();
  A.resetRun(true);
  var after = JSON.stringify(A.S.world.blocks.slice(0, 8));
  if (before !== after) throw new Error("the hidden world changed on restart");
  if (A.S.transects.length !== 0) throw new Error("restart did not clear the ledger");
});

ok("no element id was requested that the page does not define", function () {
  var bad = Object.keys(missingIds);
  if (bad.length) throw new Error("unknown element ids: " + bad.join(", "));
});

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
