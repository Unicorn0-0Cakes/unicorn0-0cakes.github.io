"use strict";
/* A complete blind experiment driven headlessly through the REAL modules:
   the same apparatus, tracker, fits, inversions and analysis the interface
   uses. Nothing here reads the truth vault until the reveal. */
const T = require("./harness.js");
const U   = require("../src/units.js");
const P   = require("../src/physics.js");
const R   = require("../src/prng.js");
const DR  = require("../src/droplets.js");
const A   = require("../src/apparatus.js");
const CAL = require("../src/calibration.js");
const M   = require("../src/measurement.js");
const UN  = require("../src/uncertainty.js");
const AN  = require("../src/analysis.js");
const PS  = require("../src/persistence.js");
const REP = require("../src/reporting.js");

const DT = 2e-3;

function runExperiment(seed, profile, opts) {
  opts = opts || {};
  DR.resetIds(); M.resetIds();
  const streams = new R.Streams(seed);
  const errors = A.drawSessionErrors(streams.get("apparatus"), profile);
  const world = A.createWorld({
    profile: profile, errors: errors, rhoOil: U.OIL.modern.rho,
    slipModel: opts.slipModel || "allen-raabe-1982", brownian: opts.brownian !== false,
    integrator: "exponential"
  });
  const store = PS.createStore({ experimentId: "T", seed: seed, mode: "blind",
                                 apparatusProfile: profile, createdAt: "" });
  const cal = CAL.createRecord(world);
  CAL.acceptNameplate(cal, world);
  CAL.calibrateScale(cal, world, errors, {});
  CAL.calibrateVoltage(cal, world, errors, {});
  store.addCalibration(cal);
  store.addProtocol(M.DEFAULT_RULES, null, {});

  const ctx = {
    streams: streams, truthVault: store.truth, eHidden: U.SI.e, errors: errors,
    dropletConfig: DR.DEFAULTS, synthetic: opts.synthetic || null,
    calibrationVersion: 1, protocolVersion: 1, estimateViewed: false,
    onEvent: function () {}
  };

  const advance = function (secs) {
    const n = Math.round(secs / DT);
    for (let i = 0; i < n; i++) A.step(world, DT, ctx);
  };
  const advanceTracking = function (secs, track) {
    const n = Math.round(secs / DT);
    for (let i = 0; i < n; i++) { A.step(world, DT, ctx); M.sample(track, world, ctx); }
  };

  const settings = { slipModel: world.physics.slipModel, rhoOil: world.physics.rhoOil };
  const relU = CAL.relativeUncertainties(cal);
  const wanted = opts.n || 18;
  let guard = 0;

  while (store.derivedMeasurements.length < wanted && guard++ < 400) {
    if (world.droplets.filter(d => d.visible).length < 3) {
      A.atomise(world, ctx, 26);
      advance(0.4);
      continue;
    }
    /* choose a visible droplet that is falling at a workable speed */
    const cand = world.droplets.filter(function (d) {
      return d.visible && d.y > 1.2e-3 && d.y < 4.8e-3 && d.focus > 0.4;
    });
    if (!cand.length) { advance(1.0); continue; }
    const drop = cand[0];
    world.selectedId = drop.id;

    /* --- Procedure 1: field off, measure the fall ------------------- */
    world.instrument.fieldOn = false;
    world.instrument.settleUntil = 0;
    const t1 = M.startTrack(world, ctx);
    if (t1.error) { advance(0.5); continue; }
    advanceTracking(opts.trackSeconds || 12, t1);
    const fallObs = M.stopTrack(t1, world, ctx);
    store.addObservation(fallObs);

    const fitF = M.fitVelocity(fallObs.samples);
    if (!fitF.ok || fitF.slope >= 0) { continue; }

    /* A DECLARED, BLIND SELECTION CRITERION.
       Brownian velocity error scales as r^(-5/2) while the fall speed
       scales as r^2, so slow droplets are hopeless: a 0.3 um droplet
       cannot have its charge determined to better than tens of per cent
       in a single transit, no matter how carefully it is watched. A real
       operator skips them on sight. This driver skips them on their
       MEASURED fall speed, which uses no hidden value and would be
       stated in the protocol. */
    if (Math.abs(fitF.slope) < (opts.minFallSpeed || 3.5e-5)) { advance(0.3); continue; }

    /* --- choose a voltage that should lift it, WITHOUT knowing q ----
       An experimenter does this by trial: apply a field, see what happens,
       adjust. Here: guess from the fall speed, then bisect if the droplet
       does not move usefully. No hidden value is consulted. */
    let V = opts.startVolts || 120;
    let ok = false, fieldObs = null, tries = 0;
    while (!ok && tries++ < 6) {
      const still = world.droplets.find(x => x.id === drop.id);
      if (!still || !still.visible || still.y < 0.9e-3 || still.y > 5.1e-3) break;
      world.instrument.vDial = V;
      world.instrument.fieldOn = true;
      world.instrument.settleUntil = 0;
      advance(0.3);
      const t2 = M.startTrack(world, ctx);
      if (t2.error) break;
      advanceTracking(opts.trackSeconds || 12, t2);
      const obs = M.stopTrack(t2, world, ctx);
      store.addObservation(obs);
      const fitE = M.fitVelocity(obs.samples);
      if (fitE.ok) {
        /* usable if the field-on velocity differs clearly from the free fall */
        const diff = Math.abs(fitE.slope - fitF.slope);
        if (diff > 3 * Math.sqrt(fitE.se * fitE.se + fitF.se * fitF.se)) {
          fieldObs = obs; ok = true; break;
        }
      }
      V = Math.min(600, V * 1.8);
      world.instrument.fieldOn = false;
      advance(0.3);
    }
    world.instrument.fieldOn = false;

    if (!ok || !fieldObs) { advance(0.5); continue; }

    let d;
    try { d = M.derive(fallObs, fieldObs, cal, settings); }
    catch (e) { continue; }
    if (!isFinite(d.charge) || !d.solver.converged) continue;

    const un = UN.propagate(d, relU, streams.get("mc:" + fallObs.obsId), settings, 200);
    const q = M.quality(d, fallObs, fieldObs, world, un.uCharge);
    const fails = M.checkRules(q, M.DEFAULT_RULES);
    const meas = M.makeMeasurement(d, fallObs, fieldObs, q, fails, un, ctx);
    store.addMeasurement(meas);
    /* preregistered policy applied without discretion */
    M.decide(meas, fails.length ? "rejected" : "accepted",
             fails.length ? fails[0] : null, "", ctx);
    advance(0.4);
  }
  return { world, store, streams, errors, cal, settings };
}

module.exports = function () {
  if (process.env.FC_DIAG) { return diag(); }
  T.suite("Layer 7 — a complete blind experiment, end to end");

  const X = runExperiment("e2e-1", "modern", { n: 14, trackSeconds: 18 });
  const all = X.store.derivedMeasurements;
  const acc = X.store.accepted();

  T.ok(all.length >= 10, "the headless run produced " + all.length + " measurements");
  T.ok(acc.length >= 4, acc.length + " passed the preregistered rules");
  T.ok(X.store.rawObservations.length >= all.length * 2,
       "every measurement has its two raw observations stored");

  T.ok(acc.every(m => isFinite(m.radius) && m.radius > 0), "all radii are physical");
  T.ok(acc.every(m => m.radius >= 1e-7 && m.radius <= 3e-6),
       "all radii fall in a plausible range for an oil-drop apparatus");
  T.ok(acc.every(m => isFinite(m.charge) && m.charge !== 0), "all charges are finite and non-zero");
  T.ok(acc.every(m => isFinite(m.uCharge) && m.uCharge > 0),
       "every measurement carries a propagated uncertainty");
  T.ok(acc.every(m => m.solver.converged), "the radius solver converged for every accepted measurement");

  T.suite("The truth is sealed during collection and analysis");
  T.throws(function () { X.store.truth.read("D-0001", "peek"); },
           "reading the truth vault before the reveal throws");
  T.throws(function () { X.store.truth.readAll("peek"); },
           "bulk reading throws too");
  T.ok(X.store.truth.size() > 0, "the vault is populated — it is sealed, not empty");

  T.suite("Inference from the blind dataset");
  const r = AN.run(acc);
  T.ok(r.ok, "the analysis runs on the collected data");
  const relErr = (r.eHat - U.SI.e) / U.SI.e;
  console.log("      ê = " + (r.eHat * 1e19).toFixed(4) + "e-19 C   " +
              "relative error " + (relErr * 100).toFixed(2) + " %   " +
              "n = " + acc.length);
  T.ok(Math.abs(relErr) < 0.25,
       "the estimate is within 25 % of the hidden value (" +
       (relErr * 100).toFixed(2) + " %) — this is a REAL simulated experiment " +
       "with Brownian motion, instrument error and a full inversion, not a rigged one");
  T.ok(r.methodA.assignments.every(n => Number.isInteger(n) && n !== 0),
       "every measurement received a non-zero integer assignment");

  T.suite("Rejected data are retained everywhere");
  const rej = X.store.rejected();
  T.ok(rej.every(m => !!m.rejectionReason), "every rejection carries a reason");
  T.ok(X.store.derivedMeasurements.length === acc.length + rej.length + X.store.unresolved().length,
       "accepted + rejected + unresolved accounts for every measurement");
  const csvAll = REP.derivedCsv(X.store, false);
  T.ok(rej.every(m => csvAll.indexOf(m.measId) >= 0),
       "every rejected measurement appears in the derived-measurements export");
  const exCsv = REP.exclusionsCsv(X.store, null);
  T.ok(rej.every(m => exCsv.indexOf(m.measId) >= 0),
       "and in the exclusions export");
  T.ok(typeof X.store.remove === "undefined" && typeof X.store.delete === "undefined",
       "the store exposes no delete operation at all");

  T.suite("Raw observations are immutable");
  const obs = X.store.rawObservations[0];
  T.ok(Object.isFrozen(obs), "an observation is frozen");
  T.ok(Object.isFrozen(obs.samples), "its sample series is frozen");
  const before = obs.samples[0][1];
  try { obs.samples[0][1] = 999; } catch (e) {}
  T.ok(obs.samples[0][1] === before, "a sample cannot be overwritten");

  T.suite("Analysis locking");
  const an = X.store.addAnalysis({ eHat: r.eHat, uRandom: r.uncertainty });
  X.store.lockAnalysis(an);
  T.ok(an.locked, "the analysis reports itself as locked");
  const was = an.eHat;
  try { an.eHat = 1e-18; } catch (e) {}
  T.ok(an.eHat === was, "a locked analysis cannot be silently changed");
  T.throws(function () { X.store.lockAnalysis(an); }, "it cannot be locked twice");

  T.suite("Ground-truth reveal");
  X.store.truth.reveal();
  const rv = REP.reveal(X.store, { eHat: r.eHat, uncertainty: r.uncertainty,
                                   assignmentFor: {} }, U.SI.e, X.errors);
  T.ok(rv.acceptedValue === U.SI.e, "the reveal discloses the accepted value");
  T.ok(isFinite(rv.relativeError), "a relative error is computed");
  T.ok(typeof rv.insideInterval68 === "boolean", "interval coverage is reported");
  T.ok(rv.measurements.length === X.store.derivedMeasurements.length,
       "the reveal covers every measurement, accepted and rejected alike");
  T.ok(rv.measurements.every(m => isFinite(m.trueCharge)), "true charges are now readable");
  T.ok(!/correct|incorrect|well done|congratul/i.test(rv.framing),
       "the reveal framing contains no verdict language");
  T.ok(X.store.truth.readLog().length > 0, "every truth read is logged");

  T.suite("Reveal exposes the radius and charge accuracy honestly");
  const radErrs = rv.measurements.filter(m => m.status === "accepted")
                    .map(m => Math.abs(m.radiusError));
  const medRad = radErrs.sort((a, b) => a - b)[Math.floor(radErrs.length / 2)];
  T.ok(isFinite(medRad) && medRad < 0.5,
       "median radius error on accepted measurements is " +
       (medRad * 100).toFixed(1) + " %");

  T.suite("Export reconciles with the stored data");
  const bundle = REP.bundle(X.store, X.world, r, { entries: [] }, X.streams, rv);
  T.ok(bundle["manifest.json"] && bundle["derived_measurements.csv"] &&
       bundle["exclusions.csv"] && bundle["raw_observations.csv"],
       "the bundle contains the specified files");
  const man = JSON.parse(bundle["manifest.json"]);
  T.ok(man.counts.measurements === X.store.derivedMeasurements.length &&
       man.counts.accepted === acc.length && man.counts.rejected === rej.length,
       "the manifest counts match the stores exactly");
  T.ok(man.seed === "e2e-1" && man.softwareVersion && man.revealed === true,
       "the manifest records seed, version and reveal status");
  T.ok(Array.isArray(man.notImplemented) && man.notImplemented.indexOf("checksums.json") >= 0,
       "the manifest declares what is NOT in the bundle");
  const sum = REP.summary(X.store, X.world, r, rv);
  T.ok(sum.accepted === acc.length && sum.rejected === rej.length,
       "the session summary reconciles with the stores");
  T.ok(sum.preferredModel.indexOf("not implemented") >= 0,
       "the summary says model comparison is unavailable rather than inventing a verdict");
  T.ok(!/success|congratul|well done/i.test(JSON.stringify(sum)),
       "the summary contains no congratulatory language");

  T.suite("Repeatability across seeds — no rigging");
  {
    const errsSeeds = [];
    ["e2e-2", "e2e-3", "e2e-4"].forEach(function (sd) {
      const Q = runExperiment(sd, "modern", { n: 10, trackSeconds: 18 });
      const a2 = Q.store.accepted();
      if (a2.length >= 3) {
        const rr = AN.run(a2);
        if (rr.ok) errsSeeds.push((rr.eHat - U.SI.e) / U.SI.e);
      }
    });
    console.log("      per-seed relative errors: " +
      errsSeeds.map(e => (e * 100).toFixed(1) + "%").join(", "));
    T.ok(errsSeeds.length >= 2, "several independent seeds produced analysable datasets");
    T.ok(errsSeeds.every(e => Math.abs(e) < 0.30),
         "every seed lands within 30 % — the apparatus is usable");
    T.ok(errsSeeds.some(e => Math.abs(e) > 0.005),
         "and none of them is suspiciously exact — the estimates carry real error");
  }

  T.suite("Determinism of a whole experiment");
  const Y = runExperiment("e2e-repeat", "modern", { n: 6, trackSeconds: 14 });
  const Z = runExperiment("e2e-repeat", "modern", { n: 6, trackSeconds: 14 });
  T.ok(Y.store.derivedMeasurements.length === Z.store.derivedMeasurements.length,
       "the same seed produces the same number of measurements");
  T.ok(Y.store.derivedMeasurements.every(function (m, i) {
         return m.charge === Z.store.derivedMeasurements[i].charge;
       }), "and bit-identical charges");
  T.ok(Y.errors.scaleGain === Z.errors.scaleGain && Y.errors.vGain === Z.errors.vGain,
       "and identical instrument errors");

  T.suite("The terminal-velocity rule is calibrated against its null distribution");
  {
    /* Pure drift plus diffusion, no acceleration anywhere. Any rejection
       here is a false positive by construction. */
    const rng = new R.Stream("null-dist");
    const ratios = [], tstats = [];
    for (let k = 0; k < 1200; k++) {
      const s = []; let y = 0;
      const v = -3e-5, D = 2.7e-11, h = 0.05;
      for (let i = 0; i < 240; i++) { y += v * h + rng.gauss(0, Math.sqrt(2 * D * h)); s.push([i * h, y]); }
      const f = M.fitVelocity(s);
      ratios.push(f.curvatureRatio); tstats.push(Math.abs(f.quadT));
    }
    const falseRej = ratios.filter(r => r > M.DEFAULT_RULES.maxCurvatureRatio).length / ratios.length;
    const tRej = tstats.filter(t => t > 2).length / tstats.length;
    T.ok(falseRej < 0.05,
         "the curvature rule falsely rejects " + (falseRej * 100).toFixed(1) +
         " % of perfectly settled droplets");
    T.ok(tRej > 0.8,
         "whereas the textbook |t| > 2 rule would falsely reject " +
         (tRej * 100).toFixed(0) + " % of them — correlated Brownian residuals " +
         "make the ordinary t-statistic worthless here, which is the same " +
         "defect as LIMITATIONS L-1 seen from another angle");
  }

  T.suite("Layer 4 — an ignored slip correction produces a size-dependent bias (H7)");
  /* The world keeps the slip correction; the ANALYSIS is told to ignore it. */
  const W = runExperiment("h7", "ideal", { n: 10, trackSeconds: 12, brownian: false });
  const accW = W.store.accepted();
  if (accW.length >= 4) {
    const stokes = accW.map(function (m) {
      const o1 = W.store.getObservation(m.fallObsId), o2 = W.store.getObservation(m.fieldObsId);
      return M.derive(o1, o2, W.cal, { slipModel: "none", rhoOil: W.settings.rhoOil });
    });
    const withSlip = accW.map(m => Math.abs(m.charge));
    const noSlip = stokes.map(d => Math.abs(d.charge));
    const ratios = noSlip.map((v, i) => v / withSlip[i]);
    const meanRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    T.ok(meanRatio > 1.05,
         "ignoring the slip correction inflates the inferred charge by " +
         ((meanRatio - 1) * 100).toFixed(1) + " %");
    /* the bias must depend on droplet size — that is what makes it detectable */
    const radii = accW.map(m => m.radius);
    const corr = pearson(radii, ratios);
    T.ok(corr < -0.5,
         "and the inflation is larger for smaller droplets (correlation with " +
         "radius = " + corr.toFixed(2) + "), which is the size-dependent " +
         "signature H7 predicts");
  } else {
    T.ok(false, "not enough measurements for the H7 check (got " + accW.length + ")");
  }
};

function pearson(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) * (x[i] - mx);
    syy += (y[i] - my) * (y[i] - my);
  }
  return sxy / Math.sqrt(sxx * syy);
}

function diag() {
  const X = runExperiment("e2e-1", "modern", { n: 8 });
  X.store.derivedMeasurements.forEach(function (m) {
    const q = m.quality;
    console.log(m.measId, m.regime, "fails:", m.ruleFails.join("|") || "(none)");
    console.log("   dur " + q.duration.toFixed(1) + "s  n " + q.samples +
      "  relVu " + (q.relVelocityUncertainty * 100).toFixed(1) + "%" +
      "  relQu " + (q.relChargeUncertainty * 100).toFixed(1) + "%" +
      "  quadT " + q.terminalVelocityT.toFixed(2) +
      "  clearance " + (q.plateClearance * 1000).toFixed(2) + "mm" +
      "  focus " + q.focusQuality.toFixed(2) +
      "  cont " + q.pathContinuity.toFixed(2));
  });
}

module.exports.runExperiment = runExperiment;
