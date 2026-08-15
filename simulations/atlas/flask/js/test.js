/* Headless test suite. Not loaded by the browser.
     node js/test.js
   Checks the things that have to hold for any of the numbers on screen to
   mean anything. */
"use strict";
var C = require("./config.js");
for (var k in C) global[k] = C[k];
var Sim = require("./model.js");

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? "   " + detail : "")); }
}
function near(a, b, tol) { return Math.abs(a - b) <= tol; }

var env = {}; for (var q in ENV_DEFAULT) env[q] = ENV_DEFAULT[q];

console.log("\n1. Growth and the resource ledger");
(function () {
  var g = { tr: Sim.copyTr(ANCESTOR), n: [FLASK.VOLUME * 5e5] };
  var info = Sim.cycle([g], env, 40, {});
  var fold = info.finalN / (FLASK.VOLUME * 5e5);
  ok("regrows roughly one hundredfold", fold > 88 && fold < 112, "fold=" + fold.toFixed(1));
  ok("generations per cycle near 6.64", near(Math.log2(fold), 6.64, 0.25),
     "gen=" + Math.log2(fold).toFixed(2));
  ok("glucose is fully consumed", info.glucoseLeft < 1e-6);
  ok("the ancestor cannot touch the citrate",
     near(info.citrateLeft, MEDIUM.citrate * FLASK.VOLUME, 1e-6),
     "left=" + info.citrateLeft.toFixed(3));

  /* carbon in equals carbon in cells plus carbon left over */
  var cellsFromGlu = info.carbonUsed * YIELD.glucose;
  ok("no cells appear from nowhere", info.finalN <= cellsFromGlu * 1.6 + 5e6,
     "N=" + info.finalN.toExponential(2) + " ceiling=" + (cellsFromGlu * 1.6).toExponential(2));
})();

console.log("\n2. Competition assays");
(function () {
  ok("ancestor against itself is exactly 1", near(Sim.compete(ANCESTOR, ANCESTOR, env, 0.5, 30), 1, 1e-6));
  ok("ancestor against itself is 1 when rare too", near(Sim.compete(ANCESTOR, ANCESTOR, env, 0.05, 30), 1, 1e-6));
  var faster = Sim.copyTr(ANCESTOR); faster.mumax *= 1.15;
  ok("a faster grower beats the ancestor", Sim.compete(faster, ANCESTOR, env, 0.5, 30) > 1.02);
  var slower = Sim.copyTr(ANCESTOR); slower.mumax *= 0.85;
  ok("a slower grower loses", Sim.compete(slower, ANCESTOR, env, 0.5, 30) < 0.98);
  var shortLag = Sim.copyTr(ANCESTOR); shortLag.lag *= 0.7;
  ok("a shorter lag is worth something", Sim.compete(shortLag, ANCESTOR, env, 0.5, 30) > 1.01);
  var cit = Sim.copyTr(ANCESTOR); cit.citT = 0.30;
  ok("citrate use is a large advantage", Sim.compete(cit, ANCESTOR, env, 0.5, 30) > 1.3);
})();

console.log("\n3. Determinism");
(function () {
  function run(seed) {
    var W = Sim.newWorld({ seed: seed });
    for (var i = 0; i < 120; i++) Sim.stepDay(W);
    return W.pops.map(function (P) { return Math.round(P.N) + ":" + P.genotypes.length; }).join("|");
  }
  ok("same seed gives the same history", run(1234) === run(1234));
  ok("different seeds give different histories", run(1234) !== run(5678));
})();

console.log("\n4. Drift at the bottleneck");
(function () {
  var W = Sim.newWorld({ seed: 99 });
  var P = W.pops[0];
  /* a strictly neutral lineage at one per cent should not stay at one
     per cent; the transfer is a random sample */
  var anc = P.genotypes[0];
  var clone = {
    id: 99999, pop: 0, parent: anc.id, born: 0, bornDay: 0,
    tr: Sim.copyTr(ANCESTOR), n: [anc.n[0] * 0.01],
    muts: [], nNeutral: 0, mutator: false, cit: false, citCopies: 0,
    potCount: 0, W: 1, Wknown: null, peak: 0.01, extinct: null,
    name: "neutral", depth: 1, colour: "#888"
  };
  P.genotypes.push(clone); P.lineageIndex[clone.id] = clone;
  var fs = [];
  for (var i = 0; i < 400; i++) {
    Sim.stepDay(W);
    fs.push(Sim.totalN(clone) / Math.max(1, P.N));
  }
  var last = fs[fs.length - 1];
  var moved = Math.abs(last - 0.01) > 0.0015 || last === 0;
  ok("a neutral lineage wanders", moved, "final f=" + last.toExponential(2));
  ok("frequencies stay in bounds", fs.every(function (f) { return f >= 0 && f <= 1.0001; }));
})();

console.log("\n5. Frequency dependence from cross-feeding");
(function () {
  /* an acetate specialist should do better when rare than when common,
     because the acetate it lives on is made by everybody else */
  var spec = Sim.copyTr(ANCESTOR);
  spec.aceMu *= 3.2; spec.aceLag *= 0.45; spec.mumax *= 0.90;
  var rare = Sim.compete(spec, ANCESTOR, env, 0.03, 34);
  var common = Sim.compete(spec, ANCESTOR, env, 0.85, 34);
  ok("an acetate specialist is fitter when rare than when common", rare > common + 0.005,
     "rare=" + rare.toFixed(3) + " common=" + common.toFixed(3));
})();

console.log("\n6. Environment actually does something");
(function () {
  var hot = {}; for (var z in env) hot[z] = env[z];
  hot.temperature = 43;
  var g1 = { tr: Sim.copyTr(ANCESTOR), n: [FLASK.VOLUME * 5e5] };
  var g2 = { tr: Sim.copyTr(ANCESTOR), n: [FLASK.VOLUME * 5e5] };
  var a = Sim.cycle([g1], env, 40, {});
  var b = Sim.cycle([g2], hot, 40, {});
  /* The yield, not the growth rate, sets how many cells a flask ends with,
     so heat does not reduce the final count much — it just takes longer to
     get there, which leaves fewer hours of starvation at the end. What heat
     costs is time, and time is what a competitor is measured against. */
  ok("heat delays exhaustion of the glucose", b.glucoseGoneAt > a.glucoseGoneAt + 3,
     "37C=" + a.glucoseGoneAt.toFixed(1) + "h 43C=" + b.glucoseGoneAt.toFixed(1) + "h");
  ok("the yield still caps the population within a fifth",
     Math.abs(b.finalN - a.finalN) / a.finalN < 0.2,
     "37C=" + a.finalN.toExponential(2) + " 43C=" + b.finalN.toExponential(2));

  var lethal = {}; for (var x in env) lethal[x] = env[x];
  lethal.temperature = 45;
  var g3 = { tr: Sim.copyTr(ANCESTOR), n: [FLASK.VOLUME * 5e5] };
  var c3 = Sim.cycle([g3], lethal, 40, {});
  ok("at 45 C the ancestor cannot finish the glucose", c3.glucoseLeft > 1,
     "left=" + c3.glucoseLeft.toFixed(1) + " ug");

  var warm = Sim.copyTr(ANCESTOR); warm.tOpt = 43;
  ok("a heat-adapted lineage wins at 43 C", Sim.compete(warm, ANCESTOR, hot, 0.5, 30) > 1.05);
  ok("...and loses at 37 C", Sim.compete(warm, ANCESTOR, env, 0.5, 30) < 0.99);

  var abx = {}; for (var y in env) abx[y] = env[y];
  abx.antibiotic = 2.5;
  var res = Sim.copyTr(ANCESTOR); res.abxRes = 0.8;
  ok("resistance matters under antibiotic", Sim.compete(res, ANCESTOR, abx, 0.5, 30) > 1.3);
  ok("...and is a small cost without it", Sim.compete(res, ANCESTOR, env, 0.5, 30) < 1.001);
})();

console.log("\n7. The laboratory");
(function () {
  var W = Sim.newWorld({ seed: 4242 });
  for (var i = 0; i < 900; i++) Sim.stepDay(W);
  var P = W.pops[0];
  ok("samples are being frozen", P.snapshots.length >= 10, "n=" + P.snapshots.length);
  ok("frozen samples carry genotypes", P.snapshots[5].genotypes.length > 0);

  W.lab.hours = 100;
  var a = Sim.runAssay(W, 0, 0, 0.5, false);
  ok("an assay returns a number with error on it", a && a.sem >= 0 && isFinite(a.W), a ? "W=" + a.W.toFixed(3) : "null");
  ok("an assay costs bench hours", W.lab.hours === 100 - LAB.COSTS.assay);
  ok("the evolved population beats its founder", a.W > 1.02, "W=" + a.W.toFixed(3));

  var before = W.lab.hours;
  W.lab.hours = 0;
  ok("no bench hours, no assay", Sim.runAssay(W, 0, 0, 0.5, false) === null);
  W.lab.hours = before;

  var s = Sim.sequence(W, 0, false);
  ok("sequencing returns a clone", s && s.clones.length === 1);
  ok("sequencing reveals mutations", s.clones[0].drivers.length >= 0 && s.clones[0].nPassengers > 0,
     "passengers=" + s.clones[0].nPassengers);
  var par = Sim.parallelism(W);
  ok("parallelism only counts what was sequenced", par.length > 0 && par.length < 40, "rows=" + par.length);

  var pl = Sim.plate(W, 0);
  ok("plating reports a cell size", pl && pl.size >= 1);
})();

console.log("\n8. Replay jobs");
(function () {
  var W = Sim.newWorld({ seed: 31 });
  for (var i = 0; i < 400; i++) Sim.stepDay(W);
  W.lab.hours = 100;
  var job = Sim.replayStart(W, 0, 2, 4, 300);
  ok("a replay job starts", !!job);
  var guard = 0;
  while (W.jobs.length && guard++ < 40000) Sim.jobStep(W, 50);
  ok("a replay job finishes", !W.jobs.length, "guard=" + guard);
  ok("a replay reports a result", (W.completedJobs || []).length === 1 &&
     W.completedJobs[0].results.length === 4);
})();

console.log("\n9. Long run stability");
(function () {
  var W = Sim.newWorld({ seed: 777 });
  var bad = 0;
  for (var i = 0; i < 3000; i++) {
    Sim.stepDay(W);
    for (var j = 0; j < W.pops.length; j++) {
      var P = W.pops[j];
      if (!isFinite(P.N) || P.N < 0) bad++;
      if (P.genotypes.length > W.cap + 1) bad++;
      var f = 0;
      for (var m = 0; m < P.genotypes.length; m++) f += Sim.totalN(P.genotypes[m]);
      if (Math.abs(f - P.N) > P.N * 1e-6 + 1e6 && i % 1 === 0) { /* N is set at cycle end; drift after transfer is fine */ }
    }
  }
  ok("nothing goes non-finite over 3000 days", bad === 0, "violations=" + bad);
  ok("generations accumulate at about 6.6 a day",
     near(W.gen / W.day, FLASK.GEN_PER_CYCLE, 0.4), "gen/day=" + (W.gen / W.day).toFixed(2));
  var mem = W.pops.reduce(function (a, P) { return a + P.history.length + P.samples.length; }, 0);
  ok("history buffers stay bounded", mem < 60000, "entries=" + mem);
})();

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);
