const runExperiment = require("./test-endtoend.js").runExperiment;
const U = require("../src/units.js"), AN = require("../src/analysis.js");
const seed = process.argv[2] || "e2e-1";
const secs = Number(process.argv[3] || 18);
const minV = Number(process.argv[4] || 3.5e-5);
const t0 = Date.now();
const X = runExperiment(seed, "modern", { n: 12, trackSeconds: secs, minFallSpeed: minV });
const acc = X.store.accepted(), all = X.store.derivedMeasurements;
let line = seed + " track " + secs + "s vmin " + (minV*1e6).toFixed(0) +
  " | measured " + all.length + " accepted " + acc.length;
if (acc.length >= 3) {
  const r = AN.run(acc);
  const relU = acc.map(m => Math.abs(m.uCharge/m.charge)).sort((a,b)=>a-b);
  line += " | med u " + (relU[Math.floor(relU.length/2)]*100).toFixed(0) + "%" +
          " | err " + (((r.eHat-U.SI.e)/U.SI.e)*100).toFixed(1) + "%";
} else line += " | (too few)";
console.log(line + "   [" + ((Date.now()-t0)/1000).toFixed(1) + "s]");
