/* Headless calibration harness. Not loaded by the browser.
     node js/calibrate.js [days]
   Prints the things that have to be true for the model to be worth
   anything: the shape of the fitness trajectory, how many populations go
   hypermutable, whether citrate ever happens, and whether carbon is
   conserved. */
"use strict";
var C = require("./config.js");
for (var k in C) global[k] = C[k];
var Sim = require("./model.js");

var days = parseInt(process.argv[2] || "1200", 10);
var seed = parseInt(process.argv[3] || "20260728", 10);

console.log("--- growth check, ancestor alone -------------------------");
var anc = { tr: Sim.copyTr(ANCESTOR), n: [FLASK.VOLUME * 5e5] };
var env = {}; for (var q in ENV_DEFAULT) env[q] = ENV_DEFAULT[q];
var info = Sim.cycle([anc], env, 30, {});
console.log("  start        ", (FLASK.VOLUME * 5e5).toExponential(2), "cells");
console.log("  final        ", info.finalN.toExponential(3), "cells  (target 5.0e+08)");
console.log("  fold         ", (info.finalN / (FLASK.VOLUME * 5e5)).toFixed(1), " (target 100)");
console.log("  generations  ", Math.log2(info.finalN / (FLASK.VOLUME * 5e5)).toFixed(2), " (target 6.64)");
console.log("  glucose left ", info.glucoseLeft.toFixed(4), "ug   exhausted at h", info.glucoseGoneAt.toFixed(1));
console.log("  citrate left ", info.citrateLeft.toFixed(1), "ug of", (MEDIUM.citrate * FLASK.VOLUME).toFixed(0), "(should be untouched)");
console.log("  acetate left ", info.acetateLeft.toFixed(2), "ug");

console.log("\n--- self-competition (must be 1.000) ----------------------");
console.log("  W(anc vs anc) =", Sim.compete(ANCESTOR, ANCESTOR, env, 0.5, 30).toFixed(4));

console.log("\n--- trait sensitivity, fitness per unit relative gain -----");
var sens = Sim.sensitivity(env);
Object.keys(sens).forEach(function (t) {
  if (sens[t] > 0.003) console.log("  " + t.padEnd(11), sens[t].toFixed(3));
});

console.log("\n--- Cit+ payoff ------------------------------------------");
var cit = Sim.copyTr(ANCESTOR); cit.citT = 0.30;
var g1 = { tr: Sim.copyTr(ANCESTOR), n: [FLASK.VOLUME * 5e5] };
var g2 = { tr: cit, n: [FLASK.VOLUME * 5e5] };
console.log("  ancestor alone, final N ", Sim.cycle([g1], env, 30, {}).finalN.toExponential(2));
console.log("  Cit+ alone,     final N ", Sim.cycle([g2], env, 30, {}).finalN.toExponential(2));
console.log("  W(Cit+ vs ancestor)     ", Sim.compete(cit, ANCESTOR, env, 0.5, 30).toFixed(3));

console.log("\n--- running " + days + " days x 12 populations ------------");
var t0 = Date.now();
var W = Sim.newWorld({ seed: seed });
var marks = [500, 1000, 2000, 5000, 10000, 20000, 30000, 40000, 50000];
var next = 0;
for (var d = 0; d < days; d++) {
  Sim.stepDay(W);
  while (next < marks.length && W.gen >= marks[next]) {
    report(W, marks[next]);
    next++;
  }
}
report(W, Math.round(W.gen));
console.log("\n  elapsed", ((Date.now() - t0) / 1000).toFixed(1), "s for", days, "days",
            "=", (days / ((Date.now() - t0) / 1000)).toFixed(0), "days/s");

function report(W, mark) {
  var ws = W.pops.map(function (P) {
    var h = P.history[P.history.length - 1];
    return h ? h.W : 1;
  });
  var mean = ws.reduce(function (a, b) { return a + b; }, 0) / ws.length;
  var mut = W.pops.filter(function (P) {
    var h = P.history[P.history.length - 1]; return h && h.mut > 0.5;
  }).length;
  var citn = W.pops.filter(function (P) { return P.citEvents.length > 0; }).length;
  var div = W.pops.map(Sim.diversity);
  var lin = W.pops.map(function (P) { return P.genotypes.length; });
  console.log("  gen " + String(mark).padStart(6) +
    "  W " + mean.toFixed(3) +
    " [" + Math.min.apply(null, ws).toFixed(3) + "-" + Math.max.apply(null, ws).toFixed(3) + "]" +
    "  power-law " + Sim.powerLaw(mark).toFixed(3) +
    "  mutators " + mut + "/12" +
    "  Cit+ " + citn + "/12" +
    "  lineages " + (lin.reduce(function (a, b) { return a + b; }, 0) / 12).toFixed(0) +
    "  eff.div " + (div.reduce(function (a, b) { return a + b; }, 0) / 12).toFixed(2));
}
