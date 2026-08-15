"use strict";
const T = require("./harness.js");
const U = require("../src/units.js");
const R = require("../src/prng.js");
const DR = require("../src/droplets.js");

module.exports = function () {
  T.suite("Droplet generation");

  DR.resetIds();
  const st = new R.Streams("droplet-test");
  const rng = st.get("droplets");
  const made = [];
  for (let i = 0; i < 2000; i++) {
    made.push(DR.create(rng, {}, {
      eHidden: U.SI.e, rhoOil: 886, chamberWidth: 8e-3,
      entryY: 5.5e-3, now: 0, synthetic: null
    }));
  }
  const truths = made.map(m => m.truth);

  T.ok(truths.some(t => t.n > 0), "positive integer charges are generated");
  T.ok(truths.some(t => t.n < 0), "negative integer charges are generated");
  T.ok(truths.some(t => t.n === 0), "neutral droplets are generated");

  const neutralFrac = truths.filter(t => t.n === 0).length / truths.length;
  T.ok(neutralFrac > 0.06 && neutralFrac < 0.20,
       "the neutral fraction is near the configured 0.12 (got " + neutralFrac.toFixed(3) + ")");

  const charged = truths.filter(t => t.n !== 0);
  const negFrac = charged.filter(t => t.n < 0).length / charged.length;
  T.ok(negFrac > 0.72 && negFrac < 0.88,
       "most charged droplets are negative, near the configured 0.80 (got " + negFrac.toFixed(3) + ")");

  const distinct = new Set(charged.map(t => Math.abs(t.n)));
  T.ok(distinct.size >= 5, "charge magnitudes are spread over several integers, not all identical");

  T.ok(truths.every(t => Number.isInteger(t.n)), "every charge count is an integer");
  T.ok(truths.every(t => Math.abs(t.charge - t.n * U.SI.e) < 1e-30),
       "q = n·e holds exactly for every droplet");

  const radii = truths.map(t => t.radius);
  T.ok(Math.min.apply(null, radii) >= DR.DEFAULTS.rMin * 0.999 &&
       Math.max.apply(null, radii) <= DR.DEFAULTS.rMax * 1.001,
       "radii respect the configured truncation");
  T.ok(truths.every(t => t.mass > 0 && isFinite(t.mass)), "masses are positive and finite");

  T.suite("Droplet reproducibility");
  DR.resetIds();
  const a = new R.Streams("same-seed").get("droplets");
  const A = [];
  for (let i = 0; i < 50; i++) A.push(DR.create(a, {}, {
    eHidden: U.SI.e, rhoOil: 886, chamberWidth: 8e-3, entryY: 5.5e-3, now: 0 }).truth);
  DR.resetIds();
  const b = new R.Streams("same-seed").get("droplets");
  const B = [];
  for (let i = 0; i < 50; i++) B.push(DR.create(b, {}, {
    eHidden: U.SI.e, rhoOil: 886, chamberWidth: 8e-3, entryY: 5.5e-3, now: 0 }).truth);

  T.ok(A.every((t, i) => t.radius === B[i].radius && t.n === B[i].n),
       "the same seed reproduces identical droplets");

  DR.resetIds();
  const c = new R.Streams("different-seed").get("droplets");
  const C = [];
  for (let i = 0; i < 50; i++) C.push(DR.create(c, {}, {
    eHidden: U.SI.e, rhoOil: 886, chamberWidth: 8e-3, entryY: 5.5e-3, now: 0 }).truth);
  T.ok(C.some((t, i) => t.radius !== A[i].radius), "a different seed gives different droplets");

  T.suite("Charge changes happen only through explicit events");
  DR.resetIds();
  const s2 = new R.Streams("charge-test");
  const pair = DR.create(s2.get("droplets"), {}, {
    eHidden: U.SI.e, rhoOil: 886, chamberWidth: 8e-3, entryY: 5.5e-3, now: 0 });
  const n0 = pair.truth.n;
  T.ok(pair.droplet.chargeEvents.length === 0, "a new droplet has no charge events");

  DR.applyChargeEvent(pair.droplet, pair.truth, +2, U.SI.e, 12.5, "operator_pulse");
  T.ok(pair.truth.n === n0 + 2, "an explicit event changes the integer charge count");
  T.ok(Math.abs(pair.truth.charge - (n0 + 2) * U.SI.e) < 1e-30,
       "the charge is rebuilt from the new integer count");
  T.ok(pair.droplet.chargeEvents.length === 1 &&
       pair.droplet.chargeEvents[0].cause === "operator_pulse" &&
       pair.droplet.chargeEvents[0].t === 12.5,
       "the event is logged on the PUBLIC droplet with its time and cause");
  T.ok(pair.droplet.chargeEvents[0].deltaN === 2 &&
       !("newCharge" in pair.droplet.chargeEvents[0]),
       "the event log discloses that a change happened, not the new charge value");

  const hazardRng = s2.get("charge");
  let fired = 0;
  for (let i = 0; i < 20000; i++) if (DR.spontaneousEvent(hazardRng, pair.droplet, 0.1) !== null) fired++;
  T.ok(fired > 0, "the spontaneous ionisation hazard does fire over long exposure");
  const expected = 20000 * (1 - Math.exp(-DR.DEFAULTS.ionHazard * 0.1));
  T.ok(Math.abs(fired - expected) < 4 * Math.sqrt(expected),
       "the hazard rate matches the configured exponential (got " + fired +
       ", expected about " + expected.toFixed(0) + ")");

  T.suite("Falsification scenario is opt-in and marked");
  DR.resetIds();
  const s3 = new R.Streams("synth").get("droplets");
  const synth = [];
  for (let i = 0; i < 400; i++) synth.push(DR.create(s3, {}, {
    eHidden: U.SI.e, rhoOil: 886, chamberWidth: 8e-3, entryY: 5.5e-3, now: 0,
    synthetic: { type: "F-uniform", fraction: 0.2 } }).truth);
  const anom = synth.filter(t => t.anomalous);
  T.ok(anom.length > 0, "the synthetic scenario produces anomalous droplets when enabled");
  T.ok(anom.every(t => Math.abs(t.charge / U.SI.e - t.n) > 1e-9),
       "anomalous droplets genuinely depart from integer multiples");
  T.ok(anom.every(t => t.anomalous === true), "anomalous droplets are flagged as synthetic");
  T.ok(synth.filter(t => !t.anomalous && t.n !== 0)
        .every(t => Math.abs(t.charge - t.n * U.SI.e) < 1e-30),
       "the rest of the population is unaffected");
};
