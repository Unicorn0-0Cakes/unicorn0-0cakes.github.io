const runExperiment = require("./test-endtoend.js").runExperiment;
const U = require("../src/units.js");
const X = runExperiment("e2e-1", "modern", { n: 12, trackSeconds: 18, minFallSpeed: 3.5e-5 });
X.store.truth.reveal();
console.log("meas   q/e     true n   u_q/q   v_f(um/s)  r(um)  regime      fails");
X.store.derivedMeasurements.forEach(m => {
  const t = X.store.truth.read(m.dropletId, "d");
  console.log(m.measId.padEnd(7),
    (m.charge/U.SI.e).toFixed(2).padStart(6), String(t.n).padStart(6),
    ((m.uCharge/Math.abs(m.charge))*100).toFixed(1).padStart(7)+"%",
    (m.vFall*1e6).toFixed(1).padStart(8),
    (m.radius*1e6).toFixed(2).padStart(7),
    m.regime.padEnd(13), m.ruleFails.join(",")||"ok");
});
