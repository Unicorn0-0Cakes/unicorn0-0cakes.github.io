"use strict";
/* =====================================================================
   INSIDE THE ATOM — headless smoke test.  `node js/smoke.js`

   Renders every screen and every export without a browser, against a
   minimal DOM and canvas stub. It catches the errors that a physics test
   suite cannot: a misspelt element id, a helper that only exists in one
   file, a screen that throws on an empty ledger.

   Not loaded by the browser.
   ===================================================================== */

var fs = require("fs"), path = require("path"), vm = require("vm");

/* ---------------- a DOM small enough to reason about ---------------- */
function mkEl(tag) {
  var el = {
    tagName: (tag || "div").toUpperCase(), _html: "", style: {}, children: [],
    classList: {
      _s: {}, add: function (c) { this._s[c] = 1; }, remove: function (c) { delete this._s[c]; },
      toggle: function (c, on) { if (on) this._s[c] = 1; else delete this._s[c]; },
      contains: function (c) { return !!this._s[c]; }
    },
    attrs: {},
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    hasAttribute: function (k) { return this.attrs[k] !== undefined; },
    removeAttribute: function (k) { delete this.attrs[k]; },
    addEventListener: function () {}, removeEventListener: function () {},
    appendChild: function (c) { this.children.push(c); return c; },
    removeChild: function () {}, remove: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    closest: function () { return null; },
    focus: function () {}, click: function () {},
    getContext: function () { return ctx2d(); },
    clientWidth: 720, clientHeight: 400, width: 720, height: 400,
    insertBefore: function (c) { this.children.push(c); return c; }
  };
  Object.defineProperty(el, "innerHTML", {
    get: function () { return this._html; },
    set: function (v) { this._html = String(v); }
  });
  Object.defineProperty(el, "textContent", {
    get: function () { return this._text || ""; },
    set: function (v) { this._text = String(v); }
  });
  return el;
}

function ctx2d() {
  var noop = function () { return ctx; };
  var ctx = {
    canvas: { width: 720, height: 400 },
    setTransform: noop, clearRect: noop, fillRect: noop, strokeRect: noop,
    beginPath: noop, moveTo: noop, lineTo: noop, arc: noop, rect: noop,
    closePath: noop, fill: noop, stroke: noop, save: noop, restore: noop,
    translate: noop, rotate: noop, scale: noop, setLineDash: noop,
    fillText: noop, measureText: function () { return { width: 10 }; },
    createLinearGradient: function () { return { addColorStop: noop }; }
  };
  return ctx;
}

var registry = {};
function el(id) {
  if (!registry[id]) { registry[id] = mkEl("div"); registry[id].id = id; }
  return registry[id];
}

var sandbox = {
  console: console, Math: Math, JSON: JSON, Date: Date, Number: Number, String: String,
  Object: Object, Array: Array, Float64Array: Float64Array, isFinite: isFinite,
  parseInt: parseInt, parseFloat: parseFloat, setTimeout: function () {}, clearTimeout: function () {},
  performance: { now: function () { return 0; } },
  requestAnimationFrame: function () {},
  Blob: function (parts) { this.parts = parts; },
  URL: { createObjectURL: function () { return "blob:x"; }, revokeObjectURL: function () {} }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = {
  documentElement: mkEl("html"),
  body: mkEl("body"),
  activeElement: null,
  readyState: "complete",
  getElementById: el,
  createElement: mkEl,
  querySelector: function () { return null; },
  querySelectorAll: function () { return []; },
  addEventListener: function () {},
  currentScript: null
};
sandbox.matchMedia = function () { return { matches: false, addEventListener: function () {} }; };
sandbox.Orbital = {
  theme: function () { return "day"; },
  color: function (n) { return "#000000"; },
  onThemeChange: function () {},
  evidenceBadge: function () { return ""; }, stateBadge: function () { return ""; },
  basisBadge: function () { return ""; }, flagChips: function () { return ""; }
};
sandbox.devicePixelRatio = 1;

vm.createContext(sandbox);

function load(f) {
  var src = fs.readFileSync(path.join(__dirname, f), "utf8");
  try { vm.runInContext(src, sandbox, { filename: f }); }
  catch (e) { console.log("  FAIL loading " + f + ": " + e.message); throw e; }
}

var pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log("  ok   " + name); }
  catch (e) { fail++; console.log("  FAIL " + name + "\n         " + e.message); }
}

console.log("\n1. Every file parses and evaluates");
["config.js", "model.js", "charts.js", "apparatus.js", "events.js", "screens.js"].forEach(function (f) {
  ok("loads " + f, function () { load(f); });
});

var C = sandbox, A = sandbox.Atom, Sc = sandbox.Screens, Ev = sandbox.Events;

/* Canvas-bearing elements have to answer getContext. */
["benchCanvas", "sweepCanvas", "distCanvas", "polarCanvas", "cmpCanvas"].forEach(function (id) {
  registry[id] = mkEl("canvas"); registry[id].id = id;
});

function state(mode, exposures, extra) {
  var cfg = {}; for (var k in C.DEFAULTS) cfg[k] = C.DEFAULTS[k];
  var S = {
    mode: mode || "free", cfg: cfg, session: A.newSession(cfg, mode || "free"),
    screen: "bench",
    view: { logY: true, logX: false, showRuth: true, showThom: true,
            sweepLog: true, speed: 3, trajDensity: 40 },
    paths: [], lastObs: null, guidedStep: 0, prediction: null, conclusion: null,
    draftChoice: null, draftConfidence: 70, compare: null, advanced: true
  };
  if (mode === "blind") S.session.hidden = A.chooseHidden(cfg.seed);
  var angles = [5, 30, 90, 150, 175];
  for (var i = 0; i < (exposures || 0); i++) {
    var c = A.snapshot(S.cfg); c.detAngle = angles[i % angles.length];
    var o = A.expose(c, S.session.hidden || S.cfg.model, S.session.seed, A.nextIndex(S.session));
    A.record(S.session, o); S.lastObs = o;
  }
  S.paths = A.trajectories(S.cfg, S.cfg.model, S.session.seed, 0, 60);
  for (var q in (extra || {})) S[q] = extra[q];
  return S;
}

console.log("\n2. Every screen renders in every mode");
var screens = ["bench", "counts", "distribution", "ledger", "compare", "conclude", "notes"];
["free", "guided", "blind", "compare"].forEach(function (mode) {
  [0, 5].forEach(function (n) {
    screens.forEach(function (sc) {
      ok(mode + " · " + n + " exposures · " + sc, function () {
        var S = state(mode, n);
        S.screen = sc;
        Sc.render(S);
        var out = el("screen-" + sc).innerHTML;
        if (typeof out !== "string") throw new Error("no output");
        if (/undefined|NaN|\[object Object\]/.test(out)) {
          var m = out.match(/.{0,60}(undefined|NaN|\[object Object\]).{0,60}/);
          throw new Error("rendered a broken value: …" + m[0] + "…");
        }
      });
    });
  });
});

console.log("\n3. The states that only appear after an action");
ok("blind mode after a conclusion", function () {
  var S = state("blind", 6);
  S.conclusion = A.scoreBlind(S.session, "rutherford", 85);
  S.screen = "conclude"; Sc.render(S);
  var out = el("screen-conclude").innerHTML;
  if (!/Correct|Not correct/.test(out)) throw new Error("no verdict rendered");
  if (/undefined|NaN/.test(out)) throw new Error("broken value in the verdict");
});
ok("blind mode withholds the model before a conclusion", function () {
  var S = state("blind", 3);
  S.screen = "distribution"; Sc.render(S);
  if (!Sc.modelIsSecret(S)) throw new Error("the model was not treated as secret");
  var insp = el("inspector").innerHTML;
  if (/Nuclear model —|Diffuse model —/.test(el("screen-distribution").innerHTML))
    throw new Error("model legend leaked in blind mode");
  if (!/Hidden/.test(insp)) throw new Error("inspector did not say the model is hidden");
});
ok("guided mode at every step", function () {
  for (var i = 0; i < C.GUIDED.length; i++) {
    var S = state("guided", 2);
    S.guidedStep = i;
    if (i > 1) S.prediction = "1e4";
    S.screen = "bench"; Sc.render(S);
    if (/undefined|NaN/.test(el("screen-bench").innerHTML))
      throw new Error("broken value at guided step " + i);
  }
});
ok("model comparison after a run", function () {
  var S = state("compare", 0);
  S.compare = {
    angles: A.defaultSweepAngles(),
    rutherford: A.sweep(S.cfg, "rutherford", 7, 100000, A.defaultSweepAngles()),
    thomson: A.sweep(S.cfg, "thomson", 7, 100000, A.defaultSweepAngles())
  };
  S.screen = "compare"; Sc.render(S);
  var out = el("screen-compare").innerHTML;
  if (!/Matched conditions/.test(out)) throw new Error("comparison table missing");
  if (/undefined|NaN/.test(out)) throw new Error("broken value in comparison");
});
ok("the home mode chooser renders", function () {
  Sc.renderHome();
  var out = el("homeModes").innerHTML;
  if (!/Guided reconstruction/.test(out) || !/Blind model/.test(out)) throw new Error("modes missing");
});

console.log("\n4. Exports produce content, and it matches the ledger");
var captured = null;
sandbox.Blob = function (parts) { captured = parts.join(""); };
ok("configuration JSON is valid and carries the seed", function () {
  var S = state("free", 3);
  Ev.bind(S, {});
  Ev.exportConfig();
  var o = JSON.parse(captured);
  if (o.version !== C.VERSION) throw new Error("version missing");
  if (o.seed !== S.session.seed) throw new Error("seed missing");
  if (!o.derived || !isFinite(o.derived.b_fm)) throw new Error("derived geometry missing");
});
ok("observation CSV matches the ledger row for row", function () {
  var S = state("free", 5);
  Ev.bind(S, {});
  Ev.exportObservations();
  var lines = captured.trim().split("\n");
  if (lines.length !== S.session.ledger.length + 1) throw new Error("wrong row count");
  var head = lines[0].split(",");
  var iRaw = head.indexOf("raw_count"), iAng = head.indexOf("detector_angle_deg");
  var iSeed = head.indexOf("exposure_seed"), iCorr = head.indexOf("corrected_count");
  S.session.ledger.forEach(function (o, i) {
    var f = lines[i + 1].split(",");
    if (Number(f[iRaw]) !== o.raw) throw new Error("raw count differs at row " + i);
    if (Number(f[iAng]) !== o.detAngleDeg) throw new Error("angle differs at row " + i);
    if (Number(f[iSeed]) !== o.exposureSeed) throw new Error("seed differs at row " + i);
    if (Math.abs(Number(f[iCorr]) - o.corrected) > 1e-9) throw new Error("corrected differs at row " + i);
  });
});
ok("angular-distribution CSV is finite throughout", function () {
  var S = state("free", 1); Ev.bind(S, {}); Ev.exportDistribution();
  var lines = captured.trim().split("\n");
  if (lines.length < 300) throw new Error("too few rows");
  for (var i = 1; i < lines.length; i++) {
    var f = lines[i].split(",").map(Number);
    if (f.some(function (v) { return !isFinite(v); })) throw new Error("non-finite at row " + i);
    if (f[3] < 0 || f[3] > 1 || f[4] < 0 || f[4] > 1) throw new Error("probability out of range at row " + i);
  }
});
ok("model-comparison CSV matches the comparison table", function () {
  var S = state("compare", 0);
  var ang = A.defaultSweepAngles();
  S.compare = { angles: ang,
    rutherford: A.sweep(S.cfg, "rutherford", 7, 100000, ang),
    thomson: A.sweep(S.cfg, "thomson", 7, 100000, ang) };
  Ev.bind(S, {}); Ev.exportCompare();
  var lines = captured.trim().split("\n");
  if (lines.length !== ang.length + 1) throw new Error("wrong row count");
  var f = lines[1].split(",");
  if (Number(f[0]) !== ang[0]) throw new Error("angle mismatch");
  if (Number(f[3]) !== S.compare.rutherford[0].raw) throw new Error("raw count mismatch");
});
ok("methods summary names both papers and the current settings", function () {
  var S = state("free", 2); Ev.bind(S, {}); Ev.exportMethods();
  ["Geiger", "Marsden", "Rutherford", "1909", "1911", "1913", "cosec^4",
   "session seed", "WHAT THIS CANNOT ESTABLISH"].forEach(function (w) {
    if (captured.indexOf(w) < 0) throw new Error("missing: " + w);
  });
  if (/NaN|undefined/.test(captured)) throw new Error("broken value in the summary");
});
ok("blind mode does not leak the hidden model into an export", function () {
  var S = state("blind", 3); Ev.bind(S, {});
  Ev.exportConfig();
  var o = JSON.parse(captured);
  if (o.hiddenModel !== "withheld") throw new Error("hidden model leaked into the config export");
  Ev.exportObservations();
  if (captured.indexOf("rutherford") >= 0 || captured.indexOf("thomson") >= 0)
    throw new Error("hidden model leaked into the observation export");
});

console.log("\n5. Charts survive the awkward inputs");
ok("every chart draws with an empty ledger", function () {
  var S = state("free", 0);
  sandbox.Charts.distribution(registry.distCanvas, { observations: [], curves: [], logY: true });
  sandbox.Charts.polar(registry.polarCanvas, { observations: [], curves: [] });
  sandbox.Charts.sweepChart(registry.sweepCanvas, { observations: [] });
});
ok("every chart draws with counts of zero everywhere", function () {
  var cfg = {}; for (var k in C.DEFAULTS) cfg[k] = C.DEFAULTS[k];
  cfg.particles = 1000; cfg.detAngle = 170; cfg.background = 0;
  var S2 = A.newSession(cfg, "free"), obs = [];
  for (var i = 0; i < 4; i++) obs.push(A.expose(cfg, "thomson", 3, i));
  if (obs.some(function (o) { return o.raw !== 0; })) throw new Error("expected all zeros for this setup");
  sandbox.Charts.distribution(registry.distCanvas, { observations: obs, curves: [], logY: true });
  sandbox.Charts.polar(registry.polarCanvas, { observations: obs, curves: [] });
  sandbox.Charts.sweepChart(registry.sweepCanvas, { observations: obs, logY: true });
  sandbox.Charts.sweepChart(registry.sweepCanvas, { observations: obs, logY: false });
});
ok("the chart summary is a sentence, not a stack trace", function () {
  var S = state("free", 4);
  var t = sandbox.Charts.describeDistribution(S.session.ledger, []);
  if (typeof t !== "string" || t.length < 40) throw new Error("summary too short");
  if (/undefined|NaN/.test(t)) throw new Error("broken value in the summary");
});

console.log("\n6. The apparatus view");
ok("draws, steps and clears without a browser", function () {
  var S = state("free", 1);
  var st = { height: 380, detAngle: 45, detWidth: 5, beamSpread: 0.5,
             targetName: "Gold", thicknessNm: 210, paths: S.paths,
             speed: 3, trajDensity: 40, now: 0 };
  sandbox.Apparatus.draw(registry.benchCanvas, st);
  for (var i = 0; i < 200; i++) sandbox.Apparatus.step(st, 16, i * 16);
  sandbox.Apparatus.burst(5, 0);
  sandbox.Apparatus.draw(registry.benchCanvas, st);
  sandbox.Apparatus.clearMarks();
  sandbox.Apparatus.reset();
});

console.log("\n7. Theming");
ok("every --rf-* token the canvases ask for is defined in BOTH themes", function () {
  var css = fs.readFileSync(path.join(__dirname, "..", "..", "assets", "orbital.css"), "utf8");
  function block(re) {
    var m = css.match(re);
    if (!m) throw new Error("could not find a token block in orbital.css");
    var names = {}, mm, r = /--rf-([a-z0-9-]+)\s*:/g;
    while ((mm = r.exec(m[1]))) names[mm[1]] = 1;
    return names;
  }
  var day = block(/:root,\s*\n?html\[data-theme="day"\]\s*\{([\s\S]*?)\n\}/);
  var night = block(/html\[data-theme="night"\]\s*\{([\s\S]*?)\n\}/);

  var asked = {};
  ["charts.js", "apparatus.js"].forEach(function (f) {
    var s = fs.readFileSync(path.join(__dirname, f), "utf8"), mm;
    var r = /col\("([a-z0-9-]+)"\)/g;
    while ((mm = r.exec(s))) asked[mm[1]] = f;
    var r2 = /Orbital\.color\("([a-z0-9-]+)"\)/g;
    while ((mm = r2.exec(s))) asked[mm[1]] = f;
  });
  var names = Object.keys(asked);
  if (names.length < 8) throw new Error("only found " + names.length + " token uses — the scan is wrong");
  var missing = names.filter(function (n) { return !day[n] || !night[n]; });
  if (missing.length) throw new Error("not defined in both themes: " + missing.join(", "));
});
ok("every --rf-* token the stylesheet maps is defined in both themes", function () {
  var css = fs.readFileSync(path.join(__dirname, "..", "..", "assets", "orbital.css"), "utf8");
  var page = fs.readFileSync(path.join(__dirname, "..", "css", "inside-the-atom.css"), "utf8");
  var defined = {}, mm, r = /--rf-([a-z0-9-]+)\s*:/g;
  while ((mm = r.exec(css))) defined[mm[1]] = 1;
  var used = {}, r2 = /var\(--rf-([a-z0-9-]+)\)/g;
  while ((mm = r2.exec(page))) used[mm[1]] = 1;
  var missing = Object.keys(used).filter(function (n) { return !defined[n]; });
  if (missing.length) throw new Error("page stylesheet uses undefined tokens: " + missing.join(", "));
});
ok("no colour is hard-coded outside a print rule", function () {
  ["charts.js", "apparatus.js", "screens.js", "main.js", "events.js", "config.js", "model.js"]
    .forEach(function (f) {
      var s = fs.readFileSync(path.join(__dirname, f), "utf8");
      var m = s.match(/["']#[0-9A-Fa-f]{3,8}["']/);
      if (m) throw new Error(f + " hard-codes " + m[0]);
    });
  var page = fs.readFileSync(path.join(__dirname, "..", "css", "inside-the-atom.css"), "utf8");
  var printAt = page.indexOf("@media print");
  var body = printAt >= 0 ? page.slice(0, printAt) : page;
  var m2 = body.match(/#[0-9A-Fa-f]{3,8}\b/);
  if (m2) throw new Error("stylesheet hard-codes " + m2[0] + " outside the print rule");
});
ok("both themes repaint every canvas without error", function () {
  var S = state("free", 4);
  ["day", "night"].forEach(function (theme) {
    sandbox.Orbital.theme = function () { return theme; };
    sandbox.Orbital.color = function (n) { return theme === "day" ? "#241C14" : "#F4E6C8"; };
    ["bench", "counts", "distribution"].forEach(function (sc) {
      S.screen = sc; Sc.render(S); Sc.paint(S);
    });
  });
  sandbox.Orbital.color = function () { return "#000000"; };
});

console.log("\n8. Reduced motion");
ok("reduced motion is detected and stops the animation", function () {
  sandbox.matchMedia = function (q) { return { matches: /reduced-motion/.test(q), addEventListener: function () {} }; };
  if (!sandbox.Apparatus.reduced()) throw new Error("reduced motion not detected");
  var S = state("free", 2);
  var st = { height: 380, detAngle: 45, detWidth: 5, beamSpread: 0.5, targetName: "Gold",
             thicknessNm: 210, paths: S.paths, speed: 3, trajDensity: 40, now: 0 };
  for (var i = 0; i < 50; i++) {
    if (sandbox.Apparatus.step(st, 16, i * 16) !== false) throw new Error("step animated under reduced motion");
  }
  sandbox.Apparatus.draw(registry.benchCanvas, st);
  S.screen = "bench"; Sc.render(S);
  if (!/Reduced motion is on/.test(el("benchSummary").innerHTML))
    throw new Error("the view did not say it is in reduced-motion mode");
});
ok("the pause class also stops the animation", function () {
  sandbox.matchMedia = function () { return { matches: false, addEventListener: function () {} }; };
  sandbox.document.documentElement.classList.add("rf-paused");
  if (!sandbox.Apparatus.reduced()) throw new Error("pause class not honoured");
  sandbox.document.documentElement.classList.remove("rf-paused");
  if (sandbox.Apparatus.reduced()) throw new Error("pause class not released");
});
ok("counts are identical whether or not the animation is running", function () {
  var cfg = {}; for (var k in C.DEFAULTS) cfg[k] = C.DEFAULTS[k];
  var a = A.expose(cfg, "rutherford", 4242, 0);
  sandbox.document.documentElement.classList.add("rf-paused");
  var b = A.expose(cfg, "rutherford", 4242, 0);
  sandbox.document.documentElement.classList.remove("rf-paused");
  if (a.raw !== b.raw || a.detected !== b.detected)
    throw new Error("a count changed with the animation state");
});

console.log("\n9. Keyboard operation");
(function () {
  /* Capture the handlers Events.attach registers, then drive them. */
  var handlers = {};
  sandbox.document.addEventListener = function (t, fn) { handlers[t] = fn; };
  var veil = el("veil"); veil.addEventListener = function () {};
  var fired = [];
  var S = state("free", 0);
  var api = {};
  ["start", "go", "rerender", "softUpdate", "resample", "afterSettingsChange", "expose",
   "runSweep", "runCompare", "guidedStep", "commitBlind", "reseed", "confirmReset",
   "printReport"].forEach(function (n) { api[n] = function () { fired.push(n); }; });
  Ev.bind(S, api);
  Ev.attach();
  /* Shortcuts only apply once the instrument is open, so open it. */
  el("app").classList.add("on");

  ok("no shortcut fires on the mode chooser", function () {
    el("app").classList.remove("on");
    fired = [];
    handlers.keydown({ key: " ", metaKey: false, ctrlKey: false, altKey: false,
                       preventDefault: function () {} });
    if (fired.length) throw new Error("a shortcut fired before the instrument was open");
    el("app").classList.add("on");
  });

  function key(k, shift) {
    fired = [];
    handlers.keydown({ key: k, shiftKey: !!shift, metaKey: false, ctrlKey: false,
                       altKey: false, preventDefault: function () {} });
    return fired;
  }

  ok("space runs an exposure", function () {
    if (key(" ").indexOf("expose") < 0) throw new Error("space did nothing");
  });
  ok("E runs an exposure and S runs a sweep", function () {
    if (key("e").indexOf("expose") < 0) throw new Error("E did nothing");
    if (key("S").indexOf("runSweep") < 0) throw new Error("S did nothing");
  });
  ok("arrow keys move the detector, Shift moves it ten degrees", function () {
    S.cfg.detAngle = 45;
    key("ArrowRight");
    if (S.cfg.detAngle !== 46) throw new Error("right arrow gave " + S.cfg.detAngle);
    key("ArrowLeft", true);
    if (S.cfg.detAngle !== 36) throw new Error("shift-left gave " + S.cfg.detAngle);
    S.cfg.detAngle = 0; key("ArrowLeft");
    if (S.cfg.detAngle !== 0) throw new Error("detector went below 0°");
    S.cfg.detAngle = 180; key("ArrowRight");
    if (S.cfg.detAngle !== 180) throw new Error("detector went past 180°");
  });
  ok("up and down change the aperture, within bounds", function () {
    S.cfg.detWidth = 5; key("ArrowUp");
    if (S.cfg.detWidth !== 5.5) throw new Error("up arrow gave " + S.cfg.detWidth);
    S.cfg.detWidth = 1; key("ArrowDown");
    if (S.cfg.detWidth !== 1) throw new Error("aperture went below 1°");
    S.cfg.detWidth = 20; key("ArrowUp");
    if (S.cfg.detWidth !== 20) throw new Error("aperture went past 20°");
  });
  ok("1 to 7 reach all seven screens", function () {
    var want = ["bench", "counts", "distribution", "ledger", "compare", "conclude", "notes"];
    var got = [];
    api.go = function (s) { got.push(s); };
    for (var i = 1; i <= 7; i++) key(String(i));
    api.go = function () { fired.push("go"); };
    if (got.join(",") !== want.join(",")) throw new Error("got " + got.join(","));
  });
  ok("R resets and ? shows the key list", function () {
    if (key("r").indexOf("confirmReset") < 0) throw new Error("R did nothing");
    key("?");
    if (!/Space or E/.test(el("modalBody").innerHTML)) throw new Error("help did not open");
  });
  ok("Escape closes a dialogue and the keys stop while one is open", function () {
    veil.classList.add("on");
    if (key(" ").length !== 0) throw new Error("keys still fired with a dialogue open");
    handlers.keydown({ key: "Escape", metaKey: false, ctrlKey: false, altKey: false,
                       preventDefault: function () {} });
    if (veil.classList.contains("on")) throw new Error("Escape did not close the dialogue");
  });
  ok("typing in a field does not trigger a shortcut", function () {
    sandbox.document.activeElement = { tagName: "INPUT", type: "number", isContentEditable: false };
    if (key("s").length !== 0) throw new Error("a shortcut fired while typing");
    if (key("ArrowRight").length !== 0) throw new Error("an arrow key was stolen from an input");
    sandbox.document.activeElement = null;
  });
  ok("a modifier key never triggers a shortcut", function () {
    fired = [];
    handlers.keydown({ key: "s", metaKey: true, ctrlKey: false, altKey: false,
                       preventDefault: function () {} });
    if (fired.length) throw new Error("Cmd-S triggered a shortcut");
  });
  ok("every interactive control the screens emit is a real focusable element", function () {
    var Sx = state("free", 3);
    var offenders = [];
    ["bench", "counts", "distribution", "ledger", "compare", "conclude", "notes"].forEach(function (sc) {
      Sx.screen = sc; Sc.render(Sx);
      var html = el("screen-" + sc).innerHTML + el("inspector").innerHTML;
      /* anything carrying a click action must be a button, an input or a select */
      var m, r = /<(\w+)([^>]*\sdata-(?:act|preset|model|screen|mode|predict|choose)=[^>]*)>/g;
      while ((m = r.exec(html))) {
        if (!/^(button|input|select|a)$/i.test(m[1])) offenders.push(sc + ": <" + m[1] + ">");
      }
    });
    if (offenders.length) throw new Error("not keyboard-reachable: " + offenders.slice(0, 4).join("; "));
  });
})();

console.log("\n10. Responsive layout");
ok("the stylesheet has no fixed width that can overflow a 360 px viewport", function () {
  var page = fs.readFileSync(path.join(__dirname, "..", "css", "inside-the-atom.css"), "utf8");
  var offenders = [], m;
  var r = /(?:^|[;{]\s*)(?:min-)?width:\s*(\d+)px/g;
  while ((m = r.exec(page))) if (Number(m[1]) > 340) offenders.push(m[0].trim());
  if (offenders.length) throw new Error("fixed widths over 340px: " + offenders.join(", "));
});
ok("the grid collapses to two columns below 1080 px and the rail narrows below 720", function () {
  var page = fs.readFileSync(path.join(__dirname, "..", "css", "inside-the-atom.css"), "utf8");
  if (!/@media \(max-width: 1080px\)/.test(page)) throw new Error("no 1080px breakpoint");
  if (!/@media \(max-width: 720px\)/.test(page)) throw new Error("no 720px breakpoint");
  if (!/@media print/.test(page)) throw new Error("no print stylesheet");
  if (!/overflow-x: auto|overflow-x:auto/.test(page)) throw new Error("tables cannot scroll in place");
});
ok("charts size themselves from the element rather than a constant", function () {
  var s = fs.readFileSync(path.join(__dirname, "charts.js"), "utf8");
  if (!/clientWidth/.test(s)) throw new Error("charts do not read the element width");
  var sc = fs.readFileSync(path.join(__dirname, "screens.js"), "utf8");
  if (!/cv\.clientWidth/.test(sc)) throw new Error("screens pass a constant height");
});
ok("every canvas has an accessible label and every chart a text summary", function () {
  var Sx = state("free", 3);
  [["bench", ["benchSummary"]], ["counts", ["sweepSummary"]],
   ["distribution", ["distSummary", "polarSummary"]]].forEach(function (pair) {
    Sx.screen = pair[0]; Sc.render(Sx);
    var html = el("screen-" + pair[0]).innerHTML;
    var m, r = /<canvas([^>]*)>/g;
    while ((m = r.exec(html))) {
      if (!/aria-label=/.test(m[1])) throw new Error(pair[0] + ": a canvas has no aria-label");
    }
    pair[1].forEach(function (id) {
      if (html.indexOf(id) < 0) throw new Error(pair[0] + ": missing summary " + id);
    });
    Sc.paint(Sx);
    pair[1].forEach(function (id) {
      if ((el(id).innerHTML || "").length < 30) throw new Error(id + " is empty after painting");
    });
  });
});

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
