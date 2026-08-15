/* Browser smoke test without a browser.
     node js/smoke.js
   Stubs just enough DOM to run every screen builder, every post-render
   hook, every chart and both lineage views, and fails on the first
   exception. It will not catch a layout mistake; it will catch a typo,
   an undefined reference, or a chart that divides by zero. */
"use strict";
var fs = require("fs"), path = require("path"), vm = require("vm");

/* ---------------- a very small DOM ---------------- */
function El(tag) {
  this.tagName = (tag || "div").toUpperCase();
  this.children = []; this.dataset = {}; this.style = {}; this.classList = {
    _s: {}, add: function (c) { this._s[c] = 1; }, remove: function (c) { delete this._s[c]; },
    toggle: function (c, on) { if (on) this._s[c] = 1; else delete this._s[c]; },
    contains: function (c) { return !!this._s[c]; }
  };
  this._html = ""; this.textContent = ""; this.value = "0"; this.checked = false;
  this.type = tag === "input" ? "range" : "";
  this.clientWidth = 640; this.clientHeight = 240;
  this.width = 640; this.height = 240;
}
El.prototype.appendChild = function (c) { this.children.push(c); c.parentNode = this; return c; };
Object.defineProperty(El.prototype, "firstChild", { get: function () { return this.children[0] || null; } });
El.prototype.removeChild = function (c) {
  var before = this.children.length;
  this.children = this.children.filter(function (x) { return x !== c; });
  if (this.children.length === before) throw new Error("removeChild called with a node that is not a child");
};
El.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
/* closest() and querySelectorAll() return stubs carrying plausible dataset
   values, so the click and change handlers the screens install are real
   code paths rather than dead assignments. Every stub handed out is kept,
   so the test can fire all of them afterwards. */
var handed = [];
function stubFor(sel, i) {
  var e = new El("div");
  e.dataset.pop = "0"; e.dataset.mode = "historical"; e.dataset.sp = "0";
  e.dataset.screen = "bench"; e.dataset.tick = "0"; e.dataset.w2 = "target";
  if (/data-act/.test(sel)) e.dataset.act = ACTIONS[i % ACTIONS.length];
  if (/data-env/.test(sel)) { e.dataset.env = ENV_KEYS[i % ENV_KEYS.length]; e.value = "1"; }
  if (/data-w\b/.test(sel)) { e.dataset.w = WIZ_KEYS[i % WIZ_KEYS.length]; e.value = "1"; }
  if (/data-geno/.test(sel)) e.dataset.geno = "1";
  handed.push(e);
  return e;
}
/* replay is exercised on its own in test.js; firing it once per screen
   render here would queue nine twenty-replicate jobs and dwarf everything else */
var ACTIONS = ["assay", "assayFreq", "plate", "sequence", "sequencePop", "invade"];
var ENV_KEYS = ["temperature", "pH", "oxygen", "glucose", "dilution", "patches",
                "antibiotic", "phage", "mutagen", "drift", "carbon", "transferEvery"];
var WIZ_KEYS = ["temperature", "pH", "oxygen", "glucose", "dilution", "patches",
                "antibiotic", "phage", "mutagen", "drift", "carbon", "transferEvery"];
El.prototype.closest = function (sel) { return stubFor(sel || "", 0); };
El.prototype.querySelector = function (sel) { return stubFor(sel || "", 0); };
El.prototype.querySelectorAll = function (sel) {
  var out = [];
  var n = /data-act/.test(sel || "") ? ACTIONS.length
        : /data-env|data-w\b/.test(sel || "") ? ENV_KEYS.length : 3;
  for (var i = 0; i < n; i++) out.push(stubFor(sel || "", i));
  return out;
};
El.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 640, height: 240 }; };
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function () {}; El.prototype.getAttribute = function () { return null; };
El.prototype.removeAttribute = function () {};
Object.defineProperty(El.prototype, "innerHTML", {
  get: function () { return this._html; },
  set: function (v) { this._html = String(v); }
});

var ctx2d = {};
["clearRect","fillRect","beginPath","moveTo","lineTo","closePath","stroke","fill","arc","rect",
 "save","restore","translate","rotate","setTransform","setLineDash","fillText","strokeText",
 "measureText","createLinearGradient","clip","quadraticCurveTo","bezierCurveTo","ellipse"]
  .forEach(function (m) { ctx2d[m] = function () { return { addColorStop: function () {} }; }; });
ctx2d.measureText = function (t) { return { width: String(t).length * 6 }; };

El.prototype.getContext = function () { return ctx2d; };

var registry = {};
var document = {
  documentElement: new El("html"),
  createElement: function (t) { return new El(t); },
  getElementById: function (id) { return registry[id] || (registry[id] = new El("div")); },
  querySelector: function (sel) { return stubFor(sel || "", 0); },
  querySelectorAll: function (sel) { return El.prototype.querySelectorAll.call(null, sel); },
  addEventListener: function () {}
};
document.documentElement.getAttribute = function () { return null; };
document.documentElement.setAttribute = function () {};
document.documentElement.removeAttribute = function () {};

/* every id that flask.html defines, so getElementById never returns a bare stub
   where the code expects a canvas */
["home","app","rail","main","inspector","scrim","modal","toast","bbClock","bbStats",
 "playBtn","speedSeg","themeBtn","themeBtn2","homeBtn","homeModes",
 "cvDens","cvFitAll","cvMuller","cvCycle","cvTree","cvFit2","mullerRead","treeRead","refSel"]
  .forEach(function (id) { registry[id] = new El(id.indexOf("cv") === 0 ? "canvas" : "div"); });
["bench","population","tree","fitness","genomes","freezer","conditions","notebook","assumptions"]
  .forEach(function (s) { registry["screen-" + s] = new El("section"); });

var sandbox = {
  document: document,
  window: { devicePixelRatio: 1, addEventListener: function () {} },
  getComputedStyle: function () { return { getPropertyValue: function (n) { return n === "--font" ? "sans-serif" : "#888888"; } }; },
  localStorage: { getItem: function () { return null; }, setItem: function () {} },
  performance: { now: function () { return Date.now(); } },
  requestAnimationFrame: function () { return 0; },
  setTimeout: function () { return 0; }, clearTimeout: function () {},
  confirm: function () { return false; },
  console: console, Math: Math, Date: Date, JSON: JSON, Object: Object,
  Array: Array, Float64Array: Float64Array, String: String, Number: Number,
  isNaN: isNaN, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat,
  Error: Error, TypeError: TypeError
};
sandbox.window.document = document;
sandbox.global = sandbox;
vm.createContext(sandbox);

["config.js", "model.js", "charts.js", "lineage.js", "events.js", "screens.js", "main.js"]
  .forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, f), "utf8"), sandbox, { filename: f });
  });

var pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log("  ok   " + name); }
  catch (e) { fail++; console.log("  FAIL " + name + "\n         " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join("\n         ") : e)); }
}

console.log("\nScreens render without throwing");

var Sim = sandbox.Sim, UI = sandbox.UI, Game = sandbox.Game, Events = sandbox.Events;
var W = null;

ok("boot builds the home screen", function () { Game.boot(); });

ok("a world can be created", function () {
  W = Sim.newWorld({ seed: 5150 });
  W.refTick = 0;
  UI.setWorld(W);
});

ok("500 days run", function () { for (var i = 0; i < 500; i++) Sim.stepDay(W); });

/* give the laboratory enough time that every screen has something to show */
ok("measurements can be taken", function () {
  W.lab.hours = 200;
  Sim.runAssay(W, 0, 0, 0.5, false);
  Sim.runAssay(W, 1, 0, 0.5, false);
  Sim.runAssay(W, 0, 0, 0.05, false);
  Sim.sequence(W, 0, true);
  Sim.sequence(W, 1, false);
  var pl = Sim.plate(W, 0);
  W.pops[0].plateSeen = { types: Object.keys(pl.types).length, size: pl.size, gen: pl.gen };
  var top = Sim.frequencies(W.pops[0]).filter(function (x) { return x.f > 0.02; });
  if (top.length > 1) Sim.invasion(W, 0, top[0].g.id, top[1].g.id);
  Sim.replayStart(W, 0, 1, 3, 200);
  var guard = 0;
  while (W.jobs.length && guard++ < 20000) Sim.jobStep(W, 60);
});

["bench", "population", "tree", "fitness", "genomes", "freezer",
 "conditions", "notebook", "assumptions"].forEach(function (s) {
  ok("screen: " + s, function () { UI.render(s); });
});

ok("the bench bar formats", function () { UI.benchBar(); });

ok("selecting another population re-renders everything", function () {
  UI.selectPop(7);
  ["bench", "population", "tree", "fitness", "genomes", "freezer"].forEach(function (s) { UI.render(s); });
});

ok("an empty world renders too", function () {
  var W2 = Sim.newWorld({ seed: 1, nPops: 2 });
  W2.refTick = 0;
  UI.setWorld(W2);
  ["bench", "population", "tree", "fitness", "genomes", "freezer",
   "conditions", "notebook", "assumptions"].forEach(function (s) { UI.render(s); });
  UI.setWorld(W);
});

ok("a sandbox world with patches, phage and antibiotic renders", function () {
  var W3 = Sim.newWorld({
    seed: 2, nPops: 4, sandbox: true,
    env: { patches: 4, phage: true, phageStart: 1e6, antibiotic: 1.2, temperature: 41,
           pH: 6.2, oxygen: 0.4, dilution: 300, transferEvery: 2, carbon: "maltose", mutagen: 4 }
  });
  W3.refTick = 0;
  for (var i = 0; i < 150; i++) Sim.stepDay(W3);
  W3.lab.hours = 60;
  Sim.runAssay(W3, 0, 0, 0.5, false);
  Sim.sequence(W3, 0, true);
  UI.setWorld(W3);
  ["bench", "population", "tree", "fitness", "genomes", "freezer",
   "conditions", "notebook", "assumptions"].forEach(function (s) { UI.render(s); });
  UI.setWorld(W);
});

ok("every handler the screens install can be fired", function () {
  UI.setWorld(W);
  W.lab.hours = 120;
  var fired = 0;
  ["bench", "population", "tree", "fitness", "genomes", "freezer",
   "conditions", "notebook", "assumptions"].forEach(function (s) {
    handed.length = 0;
    UI.render(s);
    var snapshot = handed.slice();
    for (var i = 0; i < snapshot.length; i++) {
      var el = snapshot[i];
      if (typeof el.onclick === "function") { el.onclick.call(el, { target: el }); fired++; }
      if (typeof el.onchange === "function") { el.onchange.call(el, { target: el }); fired++; }
    }
  });
  if (fired < 20) throw new Error("only " + fired + " handlers were reachable; expected many more");
  console.log("         (" + fired + " handlers fired)");
  /* the actions above really did spend bench hours and really did run */
  if (W.lab.spent <= 0) throw new Error("inspector actions never charged the laboratory");
  W.jobs.length = 0;
});

ok("the world still runs after all that", function () {
  for (var i = 0; i < 200; i++) Sim.stepDay(W);
  W.pops.forEach(function (P) {
    if (!isFinite(P.N) || P.N < 0) throw new Error(P.name + " has N=" + P.N);
  });
});

ok("charts survive degenerate input", function () {
  var cv = new El("canvas");
  sandbox.Chart.line(cv, [{ vals: [] }], {});
  sandbox.Chart.line(cv, [{ vals: [{ x: 0, y: 1 }] }], {});
  sandbox.Chart.spark(cv, []);
  sandbox.Chart.spark(cv, [1, 1, 1]);
  sandbox.Chart.cycleCurve(cv, [{ t: 0, N: 1, S: 0, A: 0, C: 0 }], {});
});

ok("dark theme resolves every colour it asks for", function () {
  var cssText = fs.readFileSync(path.join(__dirname, "..", "css", "flask.css"), "utf8");
  var wanted = {};
  ["config.js", "charts.js", "lineage.js", "screens.js", "main.js"].forEach(function (f) {
    var src = fs.readFileSync(path.join(__dirname, f), "utf8");
    /* only real references: css("--x") and var(--x) */
    var m = src.match(/(?:css\(|var\()"?(--[a-z][a-z0-9-]*)"?\)/g) || [];
    m.forEach(function (v) { wanted[v.match(/--[a-z][a-z0-9-]*/)[0]] = true; });
  });
  var missing = Object.keys(wanted).filter(function (v) {
    return cssText.indexOf(v + ":") === -1;
  });
  if (missing.length) throw new Error("CSS variables used but never defined: " + missing.join(", "));
});

ok("flask.html loads exactly the files that exist", function () {
  var html = fs.readFileSync(path.join(__dirname, "..", "flask.html"), "utf8");
  var srcs = (html.match(/src="js\/([a-z]+\.js)"/g) || []).map(function (s) { return s.match(/js\/([a-z]+\.js)/)[1]; });
  srcs.forEach(function (f) {
    if (!fs.existsSync(path.join(__dirname, f))) throw new Error("missing " + f);
  });
  ["config.js", "model.js", "charts.js", "lineage.js", "events.js", "screens.js", "main.js"]
    .forEach(function (f) { if (srcs.indexOf(f) === -1) throw new Error(f + " is never loaded"); });
  if (srcs.indexOf("calibrate.js") !== -1 || srcs.indexOf("test.js") !== -1 || srcs.indexOf("smoke.js") !== -1)
    throw new Error("a development script is being shipped to the browser");
});

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
