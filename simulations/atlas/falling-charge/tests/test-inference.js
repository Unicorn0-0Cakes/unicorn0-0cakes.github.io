"use strict";
const T = require("./harness.js");
const U = require("../src/units.js");
const R = require("../src/prng.js");
const AN = require("../src/analysis.js");
const UN = require("../src/uncertainty.js");

const E = U.SI.e;   // the test knows the truth; the ANALYSIS never does

function mk(seed, N, relNoise, nMax, opts) {
  opts = opts || {};
  const rng = new R.Stream(seed);
  const items = [];
  for (let i = 0; i < N; i++) {
    const n = (opts.signed && rng.bernoulli(0.3) ? 1 : -1) * (1 + Math.floor(rng.uniform() * nMax));
    const s = Math.abs(n * E) * (relNoise || 0.02);
    const noise = relNoise ? rng.gauss(0, s) : 0;
    items.push({ measId: "M" + i, dropletId: "D" + i, charge: n * E + noise,
                 uCharge: s, trueN: n });
  }
  return items;
}

module.exports = function () {
  T.suite("Layer 2 — noiseless synthetic recovery");

  const clean = mk("clean", 24, 0, 8);
  const r0 = AN.run(clean);
  T.ok(r0.ok, "the analysis runs on clean data");
  T.near(r0.eHat, E, 1e-9, "the hidden elementary charge is recovered from noiseless data");
  T.ok(clean.every((it, i) => Math.abs(r0.methodA.assignments[i]) === Math.abs(it.trueN)),
       "every integer charge count is assigned correctly");

  T.suite("The lattice degeneracy is handled, not hidden");
  T.ok(r0.methodA.selection.unpenalisedWouldDiffer,
       "raw chi-squared alone would have chosen a different candidate");
  T.near(r0.methodA.selection.subMultipleRatio, 2, 0.02,
       "unpenalised chi-squared lands on a sub-multiple — here exactly e/2");
  T.ok(r0.methodA.localMinima.length > 1,
       "the sub-multiple minima are found and reported rather than suppressed");
  T.ok(r0.methodA.unpenalisedMinimum && isFinite(r0.methodA.unpenalisedMinimum.e),
       "the unpenalised minimum is reported alongside, so the penalty is auditable");

  /* the penalty difference between e and e/2 must be exactly 2N ln2 */
  const q = clean.map(x => x.charge), sg = clean.map(x => x.uCharge);
  const gAtE = AN.penalisedAt(E, q, sg, Math.max.apply(null, q.map(Math.abs)));
  const gAtHalf = AN.penalisedAt(E / 2, q, sg, Math.max.apply(null, q.map(Math.abs)));
  T.near(gAtHalf - gAtE, 2 * clean.length * Math.LN2, 1e-6,
         "the penalty separates e from e/2 by exactly 2N·ln2, independent of the data");
  T.ok(gAtE < gAtHalf, "and it separates them in favour of the coarser lattice");

  T.suite("Layer 3 — recovery under controlled noise");
  const seeds = ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"];
  let within = 0;
  const errs = [];
  seeds.forEach(function (s) {
    const r = AN.run(mk(s, 25, 0.04, 8));
    const rel = (r.eHat - E) / E;
    errs.push(rel);
    if (Math.abs(rel) < 0.05) within++;
  });
  T.ok(within >= 7, within + " of 8 noisy runs land within 5 % of the hidden value");
  const meanErr = errs.reduce((a, b) => a + b, 0) / errs.length;
  T.ok(Math.abs(meanErr) < 0.02,
       "the estimator shows no large bias across runs (mean relative error " +
       (meanErr * 100).toFixed(2) + " %)");

  T.suite("Honest failure is possible");
  let spread = [];
  ["h1","h2","h3","h4","h5","h6","h7","h8","h9","h10"].forEach(function (s) {
    const r = AN.run(mk(s, 6, 0.20, 6));
    if (r.ok) spread.push((r.eHat - E) / E);
  });
  const worst = Math.max.apply(null, spread.map(Math.abs));
  T.ok(worst > 0.08,
       "small, noisy samples do sometimes produce badly wrong answers (worst " +
       (worst * 100).toFixed(0) + " %) — the apparatus is allowed to defeat the user");

  T.suite("Ambiguous assignments are exposed, not resolved silently");
  /* Eight well-measured droplets on a clean ladder, plus one badly measured
     droplet sitting halfway between two rungs. Its large uncertainty means a
     finer lattice is not worth the penalty, so the ladder survives — but the
     halfway droplet cannot be confidently assigned and must be flagged.

     Note what would happen with a SMALL uncertainty on that droplet: the
     finer lattice would then genuinely explain it better and the analysis
     would choose e/2. That is correct behaviour, not a bug, which is why
     this test gives the odd droplet an honest, large sigma. */
  const amb = [];
  for (let n = 1; n <= 8; n++) {
    amb.push({ measId: "C" + n, charge: n * E, uCharge: 0.02 * E });
  }
  amb.push({ measId: "X", charge: 2.5 * E, uCharge: 0.5 * E });
  const ra = AN.run(amb);
  T.near(ra.eHat, E, 0.02, "the ladder survives one badly measured droplet");
  const iX = 8;
  T.ok(ra.methodA.ambiguous[iX],
       "the droplet sitting halfway between two rungs is flagged as ambiguous");
  T.ok(!ra.methodA.ambiguous.slice(0, 8).some(Boolean),
       "the well-measured droplets are not flagged");

  T.suite("Safeguard — no circular use of the accepted value");
  /* Strip comments first: the word "truth" legitimately appears in the header
     comment explaining that this module cannot reach the truth vault. What
     matters is whether any EXECUTABLE line touches it.

     This check is deliberately crude and is not proof. A subtler circularity
     could pass it. Recorded as a partial mitigation in RISK_REGISTER R-S2. */
  const fs = require("fs");
  const raw = fs.readFileSync(__dirname + "/../src/analysis.js", "utf8");
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  T.ok(!/1\.602176634/.test(raw), "analysis.js does not contain the accepted value anywhere");
  T.ok(!/require\(["']\.\/units/.test(code), "analysis.js does not import units.js");
  T.ok(!/\bSI\.e\b/.test(code), "no executable line references SI.e");
  T.ok(!/truth/i.test(code), "no executable line mentions truth");
  T.ok(!/readTruth|truthVault/.test(raw), "the truth vault accessors appear nowhere");
  T.ok(/candidateRange/.test(code) && /maxAbs \/ nMax/.test(code),
       "the candidate range is derived from the data, not from a known constant");

  /* the same guard on measurement.js, which also must not see the truth */
  const mraw = fs.readFileSync(__dirname + "/../src/measurement.js", "utf8");
  const mcode = mraw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  T.ok(!/\bSI\.e\b/.test(mcode), "measurement.js never references SI.e");
  T.ok(!/readTruth|truthVault|\.truth\b/.test(mcode),
       "measurement.js never reaches the truth vault");

  /* the estimator must work on data whose unit is NOT the SI value */
  const fake = 7.77e-19;
  const items = [];
  for (let i = 1; i <= 12; i++) items.push({ measId: "F" + i, charge: (i % 7 + 1) * fake,
                                             uCharge: fake * 0.02 });
  const rf = AN.run(items);
  T.near(rf.eHat, fake, 1e-6,
         "an invented unit of 7.77e-19 C is recovered just as well — the analysis " +
         "has no preference for the real value");

  T.suite("Method B — weighted regression through the origin");
  const B = r0.methodB;
  T.ok(B.ok, "the regression runs");
  T.near(B.eHat, E, 1e-9, "the regression slope through the origin recovers e");
  T.ok(B.se >= 0 && isFinite(B.se), "a standard error is reported");
  T.ok(B.leverage.length === clean.length, "leverage is reported per measurement");
  T.near(B.leverage.reduce((a, b) => a + b, 0), 1, 1e-9, "leverages sum to one");
  T.ok(/not an independent confirmation/.test(B.note),
       "the regression states that it is not independent of Method A");

  T.suite("Uncertainty behaviour");
  const est = AN.estimator({});
  const boot = UN.bootstrap(mk("b", 25, 0.04, 8), est, new R.Stream("boot"), 400);
  T.ok(boot.lo < boot.hi && isFinite(boot.sd), "the bootstrap returns a usable interval");

  /* more droplets must reduce the spread of the estimate */
  function spreadAt(N) {
    const es = [];
    for (let k = 0; k < 30; k++) {
      const r = AN.run(mk("size" + N + "_" + k, N, 0.05, 8));
      if (r.ok) es.push(r.eHat);
    }
    return UN.sd(es);
  }
  const sd10 = spreadAt(10), sd60 = spreadAt(60);
  T.ok(sd60 < sd10,
       "random uncertainty falls as the number of droplets grows (H3): sd " +
       (sd10 / E * 100).toFixed(2) + " % at N=10 versus " +
       (sd60 / E * 100).toFixed(2) + " % at N=60");

  /* a systematic must NOT be reduced by sample size (H4) */
  function biasAt(N) {
    const es = [];
    for (let k = 0; k < 30; k++) {
      const it = mk("bias" + N + "_" + k, N, 0.05, 8).map(function (m) {
        return { measId: m.measId, charge: m.charge * 1.04, uCharge: m.uCharge * 1.04 };
      });
      const r = AN.run(it);
      if (r.ok) es.push(r.eHat);
    }
    return UN.mean(es) / E - 1;
  }
  const b10 = biasAt(10), b60 = biasAt(60);
  T.ok(Math.abs(b10 - 0.04) < 0.02 && Math.abs(b60 - 0.04) < 0.02,
       "a 4 % systematic appears as a 4 % bias at both N=10 (" +
       (b10 * 100).toFixed(1) + " %) and N=60 (" + (b60 * 100).toFixed(1) + " %)");
  T.ok(Math.abs(b60) > sd60 / E,
       "at N=60 the bias exceeds the random spread — more data has made the " +
       "answer more confidently wrong (H4)");

  T.suite("Leave-one-out");
  const loo = UN.leaveOneOut(mk("loo", 15, 0.04, 8), est);
  T.ok(loo.length === 15, "one entry per droplet");
  T.ok(loo.every(x => isFinite(x.estimate)), "every leave-one-out estimate is finite");
};
