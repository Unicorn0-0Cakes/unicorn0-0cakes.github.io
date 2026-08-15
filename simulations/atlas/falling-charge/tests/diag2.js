const runExperiment = require("./test-endtoend.js").runExperiment;
const U = require("../src/units.js");
const X = runExperiment("e2e-1", "modern", { n: 18 });
X.store.truth.reveal();
console.log("meas    status/flags                  q/e meas   true n   err%    u_q/q   r_err%");
X.store.derivedMeasurements.forEach(m => {
  const t = X.store.truth.read(m.dropletId, "diag");
  console.log(m.measId.padEnd(8),
    (m.status + "/" + (m.ruleFails.join(",") || "ok")).padEnd(30),
    (m.charge / U.SI.e).toFixed(3).padStart(8),
    String(t.n).padStart(8),
    (((m.charge - t.charge) / t.charge) * 100).toFixed(1).padStart(7),
    ((m.uCharge / Math.abs(m.charge)) * 100).toFixed(1).padStart(7) + "%",
    (((m.radius - t.radius) / t.radius) * 100).toFixed(1).padStart(7));
});
