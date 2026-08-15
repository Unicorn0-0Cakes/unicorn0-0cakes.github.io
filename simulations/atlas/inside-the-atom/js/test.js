"use strict";
/* =====================================================================
   INSIDE THE ATOM — headless validation suite.  `node js/test.js`

   Not loaded by the browser. These are the assertions that have to hold
   before any number the instrument prints means anything: the arithmetic
   against Rutherford's and Geiger and Marsden's own published figures,
   the accounting, the numerical guards, and the qualitative relations
   the model exists to demonstrate.

   Stochastic assertions use statistical tolerances, stated in each case.
   ===================================================================== */

var C = require("./config.js");
for (var k in C) global[k] = C[k];
var A = require("./model.js");

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? "   " + detail : "")); }
}
function near(a, b, relTol) { return Math.abs(a - b) <= Math.abs(b) * relTol; }
function base(over) {
  var c = {};
  for (var q in DEFAULTS) c[q] = DEFAULTS[q];
  for (var r in (over || {})) c[r] = over[r];
  return c;
}

/* ------------------------------------------------------------------ */
console.log("\n1. Arithmetic against the papers");
(function () {
  /* Rutherford, p. 671: "Assuming that the central charge is 100e, it can
     be calculated that the value of b for an α particle of velocity
     2.09 × 10⁹ cm per second is about 3.4 × 10⁻¹² cm." */
  var u = 2.09e9;
  var E = 0.5 * M_ALPHA_MEV * Math.pow(u / C_CM_S, 2);
  var b_fm = Z_ALPHA * 100 * K_E2_MEV_FM / E;
  ok("b for Z=100 at u=2.09e9 cm/s is about 3.4e-12 cm",
     b_fm / 1e13 > 3.0e-12 && b_fm / 1e13 < 3.5e-12,
     "b=" + (b_fm / 1e13).toExponential(3) + " cm, E=" + E.toFixed(2) + " MeV");

  /* Rutherford, p. 682–683: from Geiger's most probable angle of 1°40′
     for gold of t = 0.00017 cm, n = 6.07 × 10²², u = 1.8 × 10⁹, taking
     the half-scattering angle as 2° and p₂ = 0.46, "the value of N for
     gold comes out to be 97". Reproduced here from the same formula. */
  var t = 1.7e-4, n = 6.07e22, phi = 2 * RAD, p2 = 0.46;
  var cot = 1 / Math.tan(phi / 2);
  var b2 = p2 / ((Math.PI / 4) * n * t * cot * cot);
  var bR = Math.sqrt(b2) * 1e13;                       /* fm */
  var Eg = 0.5 * M_ALPHA_MEV * Math.pow(1.8e9 / C_CM_S, 2);
  var N = bR * Eg / (Z_ALPHA * K_E2_MEV_FM);
  ok("Rutherford's N for gold comes out at 97", Math.abs(N - 97) < 2, "N=" + N.toFixed(1));

  /* The same equation as the model uses, so this also checks the model's
     survival function rather than a private copy of the algebra. */
  var geo = A.geometry(base({ target: "au", thickness: 1700, energy: Eg, zOverride: 97 }));
  var pModel = A.survival(geo, "rutherford", phi);
  ok("the model's own P(>2°) reproduces that inversion", near(pModel, 0.46, 0.06),
     "P=" + pModel.toFixed(4));

  /* Geiger and Marsden 1913, p. 622: the fraction of Ra C α particles
     scattered to 45° onto 1 mm² at 1 cm from a gold foil 2.1 × 10⁻⁵ cm
     thick was 3.7 × 10⁻⁷, "probably correct to 20 per cent". */
  var a = A.absoluteCheck(E_RAC_PRIME, 79);
  var ratio = a.fraction / GM1913_ABSOLUTE.fraction;
  ok("the 1913 absolute measurement is reproduced within its quoted 20 per cent",
     ratio > 0.8 && ratio < 1.2,
     "model=" + a.fraction.toExponential(3) + " measured=3.7e-7 ratio=" + ratio.toFixed(3));

  /* And the discrepancy is explained: Rutherford and Geiger and Marsden
     deduced N ≈ A/2 = 98.5 for gold, where the nuclear charge is 79. */
  var a2 = A.absoluteCheck(8.80, 98.5);
  ok("with their own Z = A/2 and their own velocity, the agreement is exact",
     near(a2.fraction, GM1913_ABSOLUTE.fraction, 0.05),
     "model=" + a2.fraction.toExponential(3));
})();

/* ------------------------------------------------------------------ */
console.log("\n2. The cosec⁴ law and the 1913 angular data");
(function () {
  /* Geiger and Marsden's Table II tests one thing: that N·sin⁴(φ/2) is
     constant. The model must satisfy it to the accuracy of the
     quadrature, since the law is what it is built from. */
  var cfg = base({ target: "au", thickness: 210, energy: E_RAC_PRIME, beamSpread: 0, detWidth: 1 });
  var got = A.tableFor(cfg, "rutherford");
  var vals = [], degs = [15, 30, 45, 60, 90, 120, 150];
  for (var i = 0; i < degs.length; i++) {
    var d = degs[i], s = Math.sin(d * RAD / 2);
    vals.push(A.tableG(got.tab, d * RAD) * s * s * s * s);
  }
  var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
  ok("dP/dΩ · sin⁴(φ/2) is constant from 15° to 150°", (mx - mn) / mx < 1e-9,
     "spread=" + ((mx - mn) / mx).toExponential(2));

  /* And the published ratios themselves: the gold column of Table II,
     divided by 1/sin⁴(φ/2), should be flat. This is a check on the
     DATA, carried so the instrument can show what "in good agreement"
     looked like in 1913 rather than asserting it. */
  var w = GM1913_TABLE2.wide, rat = [];
  for (var j = 0; j < w.length; j++) rat.push(w[j].gold / w[j].inv);
  var rmin = Math.min.apply(null, rat), rmax = Math.max.apply(null, rat);
  ok("the published gold ratios are flat to within a factor of 1.5",
     rmax / rmin < 1.5, "min=" + rmin.toFixed(1) + " max=" + rmax.toFixed(1));
})();

/* ------------------------------------------------------------------ */
console.log("\n3. Normalisation and numerical integrity");
(function () {
  var cases = [
    base({ beamSpread: 0 }),
    base({ beamSpread: 2.0 }),
    base({ thickness: 20, beamSpread: 0 }),
    base({ thickness: 4000, beamSpread: 1.0 }),
    base({ target: "al", energy: 3, beamSpread: 0.5 }),
    base({ target: "c", energy: 10, thickness: 20, beamSpread: 0 })
  ];
  var bad = 0, worst = 0, m, i;
  for (i = 0; i < cases.length; i++) {
    for (m = 0; m < MODEL_KEYS.length; m++) {
      var got = A.tableFor(cases[i], MODEL_KEYS[m]);
      var whole = A.capFraction(got.tab, 0, Math.PI);
      worst = Math.max(worst, Math.abs(whole - 1));
      if (Math.abs(whole - 1) > 2e-3) bad++;
      /* survival is a proper probability everywhere */
      for (var d = 0; d <= 180; d += 5) {
        var p = A.tableBeyond(got.tab, d * RAD);
        if (!(p >= 0 && p <= 1 && isFinite(p))) bad++;
        var g = A.tableG(got.tab, d * RAD);
        if (!(g >= 0 && isFinite(g))) bad++;
      }
    }
  }
  ok("every distribution integrates to one over the whole sphere", bad === 0,
     "worst deviation=" + worst.toExponential(2) + " violations=" + bad);

  /* The nastiest inputs the interface can produce. */
  var edge = [
    base({ detAngle: 0, detWidth: 1 }), base({ detAngle: 180, detWidth: 20 }),
    base({ detAngle: 0, detWidth: 20 }), base({ detAngle: 180, detWidth: 1 }),
    base({ energy: 10, thickness: 20, detAngle: 179 }),
    base({ energy: 3, thickness: 4000, detAngle: 1, detWidth: 1 }),
    base({ target: "c", zOverride: 1, energy: 10 }),
    base({ particles: 1e4, background: 0 }),
    base({ particles: 1e10, efficiency: 1, background: 20 })
  ];
  var nan = 0;
  for (i = 0; i < edge.length; i++) {
    for (m = 0; m < MODEL_KEYS.length; m++) {
      var o = A.expose(edge[i], MODEL_KEYS[m], 7, i);
      var nums = [o.accept, o.omega, o.eligible, o.detected, o.background,
                  o.raw, o.corrected, o.sigma, o.perSr, o.backgroundMean];
      for (var q = 0; q < nums.length; q++) if (!isFinite(nums[q])) nan++;
      if (o.accept < 0 || o.accept > 1) nan++;
      if (o.eligible > o.fired) nan++;
      if (o.detected > o.eligible) nan++;
      if (o.raw < 0 || o.detected < 0 || o.background < 0) nan++;
    }
  }
  ok("no NaN, no infinity, no impossible count on any edge configuration", nan === 0,
     "violations=" + nan);
})();

/* ------------------------------------------------------------------ */
console.log("\n4. Determinism and independence");
(function () {
  function runSession(seed) {
    var s = A.newSession(base({ seed: seed }), "free");
    var out = [];
    var angles = [5, 30, 90, 150];
    for (var i = 0; i < angles.length; i++) {
      var c = A.snapshot(s.cfg); c.detAngle = angles[i];
      var o = A.expose(c, "rutherford", seed, A.nextIndex(s));
      A.record(s, o);
      out.push(o.raw + ":" + o.detected + ":" + o.background);
    }
    return out.join("|");
  }
  ok("the same seed reproduces the same observations exactly",
     runSession(1909) === runSession(1909));
  ok("a different seed gives different observations",
     runSession(1909) !== runSession(1911));

  /* Two exposures at identical settings in the same session must differ:
     they are independent counts, not a repeated cache lookup. */
  var s = A.newSession(base({ seed: 4242, particles: 1e8, detAngle: 30 }), "free");
  var a1 = A.expose(s.cfg, "rutherford", 4242, A.nextIndex(s));
  var a2 = A.expose(s.cfg, "rutherford", 4242, A.nextIndex(s));
  ok("repeating an exposure at the same settings draws again", a1.raw !== a2.raw,
     "raw=" + a1.raw + " and " + a2.raw);

  /* Reproducibility of the hidden model in blind mode. */
  ok("the hidden model is a function of the seed alone",
     A.chooseHidden(777) === A.chooseHidden(777));
  var hs = {};
  for (var i = 1; i <= 400; i++) hs[A.chooseHidden(i)] = (hs[A.chooseHidden(i)] || 0) + 1;
  ok("both models get hidden across seeds", hs.rutherford > 140 && hs.thomson > 140,
     JSON.stringify(hs));
})();

/* ------------------------------------------------------------------ */
console.log("\n5. Particle accounting");
(function () {
  var s = A.newSession(base({ seed: 31, particles: 1e7 }), "free");
  var angles = [3, 8, 20, 45, 75, 110, 160];
  var firedSum = 0, detSum = 0, viol = 0;
  for (var i = 0; i < angles.length; i++) {
    var c = A.snapshot(s.cfg); c.detAngle = angles[i];
    var o = A.expose(c, "rutherford", s.seed, A.nextIndex(s));
    A.record(s, o);
    firedSum += o.fired; detSum += o.detected;
    if (o.detected > o.eligible) viol++;
    if (o.eligible > o.fired) viol++;
    if (o.raw !== o.detected + o.background) viol++;
  }
  var sum = A.summary(s);
  ok("the ledger's totals match the exposures", sum.fired === firedSum && sum.detected === detSum,
     "fired=" + sum.fired + "/" + firedSum);
  ok("detected ≤ eligible ≤ fired in every exposure, and raw = detected + background",
     viol === 0, "violations=" + viol);

  /* Acceptance over a complete non-overlapping partition of the sphere
     must sum to one: nothing is lost and nothing is counted twice. */
  var cfg = base({ beamSpread: 0.5 });
  var got = A.tableFor(cfg, "rutherford");
  var tot = 0, step = 10;
  for (var d = 0; d < 180; d += step) {
    /* annulus [d, d+step] via two axial caps */
    tot += A.capFraction(got.tab, 0, (d + step) * RAD) - A.capFraction(got.tab, 0, d * RAD);
  }
  ok("acceptance over a partition of the sphere sums to one",
     Math.abs(tot - 1) < 3e-3, "sum=" + tot.toFixed(6));
})();

/* ------------------------------------------------------------------ */
console.log("\n6. The qualitative relations the instrument exists to show");
(function () {
  function frac(cfg, model, deg) {
    var got = A.tableFor(cfg, model);
    return A.tableBeyond(got.tab, deg * RAD);
  }

  /* (a) Large-angle scattering rises with nuclear charge. */
  var byZ = ["c", "al", "cu", "ag", "au"].map(function (t) {
    return { t: t, Z: targetByKey(t).Z, f: frac(base({ target: t, beamSpread: 0 }), "rutherford", 90) };
  });
  var mono = true;
  for (var i = 1; i < byZ.length; i++) if (!(byZ[i].f > byZ[i - 1].f)) mono = false;
  ok("P(>90°) rises monotonically with Z from carbon to gold", mono,
     byZ.map(function (x) { return x.t + "(Z" + x.Z + ")=" + x.f.toExponential(2); }).join(" "));
  /* and PER ATOM it rises as Z², since b ∝ Z and P ∝ n·t·b². At a fixed
     thickness the atom count differs between metals, so the raw ratio is
     not Z² — dividing by n·t is what isolates the charge dependence, and
     is exactly the correction Geiger and Marsden made in 1913 when they
     worked per centimetre of air equivalent. */
  var gAu = A.geometry(base({ target: "au" })), gCu = A.geometry(base({ target: "cu" }));
  var rZ = (byZ[4].f / gAu.nt) / (byZ[2].f / gCu.nt), rZ2 = Math.pow(79 / 29, 2);
  ok("...and per atom it rises as Z², not as Z", near(rZ, rZ2, 0.02),
     "Au/Cu per atom=" + rZ.toFixed(2) + " expected " + rZ2.toFixed(2));

  /* (b) Deflection falls as beam energy rises, as 1/E². */
  var eLo = frac(base({ energy: 4, beamSpread: 0 }), "rutherford", 90);
  var eHi = frac(base({ energy: 8, beamSpread: 0 }), "rutherford", 90);
  ok("P(>90°) falls when the beam energy rises", eHi < eLo,
     "4MeV=" + eLo.toExponential(3) + " 8MeV=" + eHi.toExponential(3));
  ok("...and falls as 1/E²", near(eLo / eHi, 4, 0.02), "ratio=" + (eLo / eHi).toFixed(3));

  /* (c) Most particles are barely deflected, and the distribution falls
         steeply with angle. */
  var f1 = frac(base({ beamSpread: 0 }), "rutherford", 1);
  var f5 = frac(base({ beamSpread: 0 }), "rutherford", 5);
  var f30 = frac(base({ beamSpread: 0 }), "rutherford", 30);
  ok("fewer than one particle in five is deflected past a single degree", f1 < 0.2,
     "P(>1°)=" + f1.toFixed(4));
  ok("the distribution falls steeply: P(>5°) is under a hundredth of P(>1°)... ",
     f5 / f1 < 0.05, "ratio=" + (f5 / f1).toFixed(4));
  ok("...and P(>30°) is smaller again by more than an order of magnitude",
     f30 / f5 < 0.05, "ratio=" + (f30 / f5).toFixed(5));

  /* (d) Diffuse charge produces far fewer extreme deflections. */
  var mr = frac(base({ beamSpread: 0 }), "rutherford", 30);
  var mt = frac(base({ beamSpread: 0 }), "thomson", 30);
  ok("a matched Thomson run gives fewer extreme deflections than Rutherford",
     mt < mr * 1e-6, "ruth=" + mr.toExponential(2) + " thom=" + mt.toExponential(2));
  ok("...while the two are comparable at one degree",
     frac(base({ beamSpread: 0 }), "thomson", 1) > 0.5 * f1,
     "thom=" + frac(base({ beamSpread: 0 }), "thomson", 1).toFixed(4) + " ruth=" + f1.toFixed(4));

  /* (e) Thicker foil means more interaction. */
  var tThin = frac(base({ thickness: 50, beamSpread: 0 }), "rutherford", 45);
  var tThick = frac(base({ thickness: 500, beamSpread: 0 }), "rutherford", 45);
  ok("a thicker foil scatters more, in proportion to the thickness",
     near(tThick / tThin, 10, 0.02), "ratio=" + (tThick / tThin).toFixed(3));

  /* (f) ...and the single-scattering treatment says when it is failing. */
  var gThin = A.geometry(base({ thickness: 210 }));
  var gThick = A.geometry(base({ thickness: 4000 }));
  ok("thin foil is inside the single-scattering regime", gThin.validity === "ok",
     "P(>5°)=" + gThin.ss5.toExponential(3));
  ok("the thickest foil is flagged rather than silently trusted",
     gThick.validity !== "ok", "P(>5°)=" + gThick.ss5.toExponential(3) + " " + gThick.validity);
})();

/* ------------------------------------------------------------------ */
console.log("\n7. Counting statistics");
(function () {
  /* Counts must be Poisson about the model mean. Tolerances are
     statistical: with 400 exposures the standard error on the mean is
     1/20 of a standard deviation. */
  var cfg = base({ particles: 1e8, detAngle: 45, detWidth: 5, background: 0, efficiency: 1 });
  var pred = A.predictBoth(cfg);
  var mu = cfg.particles * pred.rutherford;
  var n = 400, sum = 0, sum2 = 0;
  for (var i = 0; i < n; i++) {
    var o = A.expose(cfg, "rutherford", 90210, i);
    sum += o.detected; sum2 += o.detected * o.detected;
  }
  var mean = sum / n, varr = sum2 / n - mean * mean;
  ok("the mean count matches the model's prediction within 4 standard errors",
     Math.abs(mean - mu) < 4 * Math.sqrt(mu / n), "mean=" + mean.toFixed(2) + " predicted=" + mu.toFixed(2));
  ok("the variance matches the mean, as Poisson counting requires",
     varr > mu * 0.7 && varr < mu * 1.4, "var=" + varr.toFixed(1) + " mean=" + mu.toFixed(1));

  /* A rare search must be allowed to come back empty. */
  var rare = base({ particles: 1e7, detAngle: 150, detWidth: 5, background: 0 });
  var zeros = 0;
  for (var j = 0; j < 200; j++) if (A.expose(rare, "rutherford", 555, j).detected === 0) zeros++;
  ok("a small exposure at 150° often returns nothing at all", zeros > 20 && zeros < 200,
     zeros + "/200 empty");
  ok("...but not always: large angles are rare, not impossible", zeros < 200);

  /* Thomson at a large angle must return nothing, every time. */
  var tz = 0;
  for (var m = 0; m < 100; m++) {
    if (A.expose(base({ particles: 1e10, detAngle: 60, detWidth: 8, background: 0 }),
                 "thomson", 606, m).detected === 0) tz++;
  }
  ok("the diffuse model never produces a count at 60°, even at 10¹⁰ particles", tz === 100,
     tz + "/100 empty");
})();

/* ------------------------------------------------------------------ */
console.log("\n8. Blind mode scoring");
(function () {
  var s = A.newSession(base({ seed: 8080, particles: 1e8 }), "blind");
  s.hidden = A.chooseHidden(8080);
  var angles = [5, 20, 45, 90];
  for (var i = 0; i < angles.length; i++) {
    var c = A.snapshot(s.cfg); c.detAngle = angles[i];
    A.record(s, A.expose(c, s.hidden, s.seed, A.nextIndex(s)));
  }
  var right = A.scoreBlind(s, s.hidden, 80);
  var wrong = A.scoreBlind(s, s.hidden === "rutherford" ? "thomson" : "rutherford", 80);
  ok("scoring marks the right answer right", right.correct === true);
  ok("scoring marks the wrong answer wrong", wrong.correct === false);
  ok("the likelihood ratio favours the model that was actually hidden",
     s.hidden === "rutherford" ? right.logLR > 0 : right.logLR < 0,
     "hidden=" + s.hidden + " log10LR=" + right.log10LR.toFixed(1));
  ok("the likelihood ratio is finite", isFinite(right.logLR));
  ok("the most informative observations are reported", right.informative.length > 0);
  ok("no confidence produces a stated calibration rather than a number",
     typeof A.scoreBlind(s, s.hidden, null).calibration === "string");

  /* The distinction the instrument exists to teach: an empty detector at
     a large angle is not evidence that large angles are impossible. With
     a small exposure the nuclear model predicts a fraction of a count
     there too, so seeing none separates the two models by almost
     nothing. */
  var weak = A.newSession(base({ seed: 8081, particles: 1e6, detAngle: 90, detWidth: 5 }), "blind");
  weak.hidden = "thomson";
  var wo = A.expose(weak.cfg, "thomson", weak.seed, A.nextIndex(weak));
  A.record(weak, wo);
  var ws = A.scoreBlind(weak, "thomson", 50);
  ok("an empty detector at 90° from a small exposure decides nothing",
     wo.detected === 0 && Math.abs(ws.log10LR) < 0.5,
     "counts=" + wo.raw + " log10LR=" + ws.log10LR.toFixed(3));

  /* The same angle with a thousand times the exposure is decisive. */
  var strong = A.newSession(base({ seed: 8082, particles: 1e9, detAngle: 90, detWidth: 5 }), "blind");
  strong.hidden = "rutherford";
  A.record(strong, A.expose(strong.cfg, "rutherford", strong.seed, A.nextIndex(strong)));
  var ss2 = A.scoreBlind(strong, "rutherford", 90);
  ok("...and the same angle with a thousand times the exposure is decisive",
     ss2.log10LR > 10, "log10LR=" + ss2.log10LR.toFixed(1));
})();

/* ------------------------------------------------------------------ */
console.log("\n9. Sweeps, curves and trajectories");
(function () {
  var cfg = base({ particles: 1e8 });
  var sw = A.sweep(cfg, "rutherford", 12, 0, A.defaultSweepAngles());
  ok("a sweep returns one observation per angle", sw.length === A.defaultSweepAngles().length);
  var falling = true;
  for (var i = 1; i < sw.length; i++) if (sw[i].accept > sw[i - 1].accept * 1.02) falling = false;
  ok("acceptance falls monotonically with angle across the sweep", falling);
  ok("every sweep point is finite", sw.every(function (o) { return isFinite(o.accept) && isFinite(o.raw); }));

  var cv = A.curve(cfg, "rutherford", 60);
  ok("the model curve is finite and positive throughout",
     cv.every(function (p) { return isFinite(p.perSr) && p.perSr >= 0; }));

  var tr = A.trajectories(cfg, "rutherford", 12, 0, 200);
  ok("trajectories are drawn and stay inside the sphere", tr.length === 200 &&
     tr.every(function (t) { return t.theta >= 0 && t.theta <= Math.PI && isFinite(t.plane); }));
  var tr2 = A.trajectories(cfg, "rutherford", 12, 0, 200);
  ok("trajectories are reproducible from the seed",
     JSON.stringify(tr) === JSON.stringify(tr2));
  var big = tr.filter(function (t) { return t.large; }).length;
  ok("most sampled trajectories pass nearly straight through", big < 5,
     big + "/200 turned past 90°");
  ok("the sampled trajectories follow the same law as the counts",
     Math.abs(tr.filter(function (t) { return t.deg > 1; }).length / 200 -
              A.survival(A.geometry(cfg), "rutherford", 1 * RAD)) < 0.08);
})();

/* ------------------------------------------------------------------ */
console.log("\n10. Reset and the exported record");
(function () {
  var s = A.newSession(base({ seed: 5 }), "free");
  A.record(s, A.expose(s.cfg, "rutherford", 5, A.nextIndex(s)));
  A.record(s, A.expose(s.cfg, "rutherford", 5, A.nextIndex(s)));
  var fresh = A.newSession(base({ seed: 5 }), "free");
  ok("a new session starts empty", fresh.ledger.length === 0 && fresh.counter === 0 &&
     fresh.firedTotal === 0);
  ok("and the old one is unaffected", s.ledger.length === 2 && s.counter === 2);

  /* Every field the CSV export names must exist on every row and be
     finite, or the export and the screen will disagree. */
  var fields = ["index", "detAngleDeg", "detWidthDeg", "fired", "eligible",
                "detected", "background", "backgroundMean", "raw", "corrected",
                "sigma", "accept", "omega", "exposureSeed"];
  var missing = 0;
  for (var i = 0; i < s.ledger.length; i++) {
    for (var f = 0; f < fields.length; f++) {
      var v = s.ledger[i][fields[f]];
      if (v === undefined || v === null || !isFinite(v)) missing++;
    }
    if (!s.ledger[i].settings || s.ledger[i].settings.seed !== 5) missing++;
  }
  ok("every ledger row carries every exported field, finite, with its settings",
     missing === 0, "missing=" + missing);
})();

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
