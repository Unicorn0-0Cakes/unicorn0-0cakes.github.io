/* =====================================================================
   THE FALLING CHARGE — session summary and export
   ---------------------------------------------------------------------
   Everything here is generated FROM STORED DATA. No value is transcribed
   by hand and no number appears in a report that did not come out of the
   analysis object the charts were drawn from.

   Implemented: JSON, CSV, and the complete experiment bundle as a set of
   named text files.
   NOT implemented: PDF report, chart image export, checksums.
   docs/LIMITATIONS.md L-15.
   ===================================================================== */
(function (root) {
  "use strict";
  const isNode = (typeof module !== "undefined" && module.exports);
  const U = isNode ? require("./units.js") : root.FC.units;

  const VERSION = "0.1.0-milestone1";
  const GIT_COMMIT = "e49d8bf";     // baked at authoring time

  const DISCLAIMER =
    "Simulated data. These are not measurements of the physical world; " +
    "they are output of a model, and they are evidence about that model only. " +
    "This instrument has not been reviewed by a physicist and is labelled a " +
    "research prototype. See docs/LIMITATIONS.md.";

  /* =================================================================
     1. SESSION SUMMARY — neutral language, no praise
     ============================================================== */

  function summary(store, world, analysis, revealInfo) {
    const all = store.derivedMeasurements;
    const acc = store.accepted(), rej = store.rejected(), unr = store.unresolved();
    const reasons = {};
    rej.forEach(function (m) {
      reasons[m.rejectionReason] = (reasons[m.rejectionReason] || 0) + 1;
    });

    return {
      experimentId: store.experiment.experimentId,
      seed: store.experiment.seed,
      mode: store.experiment.mode,
      apparatusProfile: store.experiment.apparatusProfile,
      softwareVersion: VERSION,
      gitCommit: GIT_COMMIT,

      dropletsGenerated: world.counters.generated,
      dropletsObserved: countObserved(store),
      dropletsMeasured: new Set(all.map(function (m) { return m.dropletId; })).size,
      measurementsTotal: all.length,
      accepted: acc.length,
      rejected: rej.length,
      unresolved: unr.length,
      rejectionReasons: reasons,

      eHat: analysis ? analysis.eHat : null,
      uncertainty: analysis ? analysis.uncertainty : null,
      relativeUncertainty: (analysis && analysis.eHat)
        ? Math.abs(analysis.uncertainty / analysis.eHat) : null,
      confidenceLevel: 0.68,
      chi2Reduced: (analysis && analysis.methodB && analysis.methodB.ok)
        ? analysis.methodB.chi2Reduced : null,

      /* model comparison is not implemented; say so rather than omit */
      quantisedModelFit: analysis && analysis.methodB && analysis.methodB.ok
        ? { chi2: analysis.methodB.chi2, dof: analysis.methodB.dof } : null,
      continuousModelFit: null,
      preferredModel: "not determined — model comparison is not implemented",
      modelSelectionStrength: null,

      dominantUncertainty: analysis && analysis.budget
        ? analysis.budget.dominant : "not computed",
      calibrationVersions: store.calibrations.length,
      calibrationComplete: store.calibrations.length > 0,
      protocolAmendments: Math.max(0, store.protocols.length - 1),
      exclusionSensitivity: analysis && analysis.loo
        ? maxAbs(analysis.loo.map(function (r) { return r.relDelta; })) : null,
      experimentDuration: world.t,
      revealed: store.truth.isRevealed(),
      reveal: revealInfo || null,

      unavailable: [
        "Interval coverage — requires repeated experiments (Mode G, not built)",
        "Model comparison — not implemented",
        "Reproducibility across sessions — no replay driver"
      ],
      disclaimer: DISCLAIMER
    };
  }

  function countObserved(store) {
    const ids = new Set();
    store.rawObservations.forEach(function (o) { ids.add(o.dropletId); });
    return ids.size;
  }

  function maxAbs(a) {
    let m = 0;
    a.forEach(function (v) { if (isFinite(v) && Math.abs(v) > Math.abs(m)) m = v; });
    return m;
  }

  /* =================================================================
     2. THE REVEAL
     ============================================================== */

  /**
   * Compare the locked analysis with the ground truth. Deliberately does
   * NOT return a verdict. Accuracy, precision and methodology are
   * reported separately because they come apart: an estimate can be close
   * and badly justified, or far and honestly bounded.
   */
  function reveal(store, analysis, eTrue, errors) {
    const inside = analysis && isFinite(analysis.uncertainty)
      ? Math.abs(analysis.eHat - eTrue) <= analysis.uncertainty : null;
    const inside95 = analysis && isFinite(analysis.uncertainty)
      ? Math.abs(analysis.eHat - eTrue) <= 1.96 * analysis.uncertainty : null;

    /* per-measurement comparison */
    const rows = store.derivedMeasurements.map(function (m) {
      const t = store.truth.read(m.dropletId, "ground-truth reveal");
      const nTrue = t ? t.n : null;
      const qTrue = t ? t.charge : null;
      const nAssigned = (analysis && analysis.assignmentFor)
        ? analysis.assignmentFor[m.measId] : null;
      return {
        measId: m.measId, dropletId: m.dropletId, status: m.status,
        rejectionReason: m.rejectionReason,
        trueRadius: t ? t.radius : null,
        trueN: nTrue, trueCharge: qTrue,
        estRadius: m.radius, estCharge: m.charge, uCharge: m.uCharge,
        radiusError: t ? (m.radius - t.radius) / t.radius : null,
        chargeError: qTrue ? (m.charge - qTrue) / qTrue : null,
        assignedN: nAssigned,
        assignmentCorrect: (nAssigned !== null && nTrue !== null)
          ? Math.abs(nAssigned) === Math.abs(nTrue) : null,
        /* "sound" means the observation was not physically compromised —
           it says nothing about whether excluding it helped the answer */
        physicallySound: m.quality
          ? (m.quality.chargeStable && m.quality.solverConverged &&
             !m.quality.identityLossRisk && m.quality.pathContinuity > 0.95)
          : null
      };
    });

    const rejectedButSound = rows.filter(function (r) {
      return r.status === "rejected" && r.physicallySound;
    });
    const acceptedButCompromised = rows.filter(function (r) {
      return (r.status === "accepted" || r.status === "accepted_caution") && r.physicallySound === false;
    });

    return {
      acceptedValue: eTrue,
      acceptedValueNote:
        "Exact by definition in the SI since 2019. This is not a value the " +
        "experiment could have measured; it is the number used to generate " +
        "the droplets. See docs/RESEARCH_QUESTION.md.",
      estimate: analysis ? analysis.eHat : null,
      absoluteError: analysis ? analysis.eHat - eTrue : null,
      relativeError: analysis ? (analysis.eHat - eTrue) / eTrue : null,
      insideInterval68: inside,
      insideInterval95: inside95,

      systematicBiases: {
        voltageGain: errors.vGain, voltageOffset: errors.vOffset,
        reticleScaleGain: errors.scaleGain,
        temperatureBias: errors.tempBias, pressureBias: errors.pressBias,
        tilt: errors.tilt,
        plateGapTrue: errors.plateGapTrue
      },

      measurements: rows,
      rejectedButSound: rejectedButSound.map(function (r) { return r.measId; }),
      acceptedButCompromised: acceptedButCompromised.map(function (r) { return r.measId; }),

      evaluation: {
        accuracy: analysis ? Math.abs((analysis.eHat - eTrue) / eTrue) : null,
        precision: analysis && analysis.eHat
          ? Math.abs(analysis.uncertainty / analysis.eHat) : null,
        coverage: inside,
        exclusionTransparency: {
          rejections: store.rejected().length,
          allHaveReasons: store.rejected().every(function (m) { return !!m.rejectionReason; }),
          madeAfterViewingEstimate: store.rejected()
            .filter(function (m) { return m.estimateViewedBeforeDecision; }).length,
          protocolAmendments: Math.max(0, store.protocols.length - 1)
        },
        modelAdequacy: "not assessed — model comparison is not implemented"
      },

      framing:
        "This is not a score. An estimate can be close to the accepted value " +
        "and badly justified: a numerically small error with an interval that " +
        "does not contain the truth means the uncertainty was understated. An " +
        "estimate can be several per cent out and scientifically sound, if the " +
        "interval is honest and the method is defensible. Read accuracy, " +
        "precision, coverage and exclusion transparency separately. Note also " +
        "that this instrument's intervals are known to be too narrow — see " +
        "docs/LIMITATIONS.md L-1."
    };
  }

  /* =================================================================
     3. CSV
     ============================================================== */

  function csv(head, rows) {
    const esc = function (v) {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return head.join(",") + "\n" +
      rows.map(function (r) { return r.map(esc).join(","); }).join("\n") + "\n";
  }

  function dropletsCsv(store, world, revealed) {
    const head = ["experiment_id", "seed", "mode", "droplet_id", "t_birth_s",
      "true_radius_m", "true_n", "true_charge_C", "true_mass_kg",
      "oil_density_kg_m3", "depth_m", "focus_quality", "charge_events", "status", "notes"];
    const rows = store.droplets.map(function (d) {
      let t = null;
      if (revealed) { try { t = store.truth.read(d.id, "export"); } catch (e) {} }
      return [store.experiment.experimentId, store.experiment.seed, store.experiment.mode,
        d.id, d.tBirth.toFixed(4),
        t ? t.radius.toExponential(6) : "", t ? t.n : "",
        t ? t.charge.toExponential(6) : "", t ? t.mass.toExponential(6) : "",
        world.physics.rhoOil, d.depth.toExponential(4), d.focus.toFixed(4),
        d.chargeEvents.length, d.status, d.notes];
    });
    return csv(head, rows);
  }

  function rawObservationsCsv(store) {
    const head = ["obs_id", "droplet_id", "experiment_id", "kind", "t_start_s", "t_end_s",
      "n_samples", "v_display_V", "polarity", "field_on", "temp_read_K", "press_read_Pa",
      "focus_set_m", "calibration_version", "protocol_version", "gaps", "flags"];
    const rows = store.rawObservations.map(function (o) {
      return [o.obsId, o.dropletId, store.experiment.experimentId, o.kind,
        o.tStart.toFixed(4), o.tEnd.toFixed(4), o.samples.length,
        o.instrument.vDisplay, o.instrument.polarity, o.instrument.fieldOn,
        o.instrument.tempRead, o.instrument.pressRead, o.instrument.focusSet,
        o.calibrationVersion, o.protocolVersion, o.gaps, o.flags.join(";")];
    });
    return csv(head, rows);
  }

  function samplesCsv(obs) {
    return csv(["t_s", "y_m"],
      obs.samples.map(function (s) { return [s[0].toExponential(9), s[1].toExponential(9)]; }));
  }

  function derivedCsv(store, revealed) {
    const head = ["meas_id", "droplet_id", "fall_obs_id", "field_obs_id", "method",
      "method_version", "slip_model", "regime",
      "v_fall_m_s", "se_v_fall_m_s", "v_field_m_s", "se_v_field_m_s",
      "balancing_voltage_V", "plate_spacing_m", "field_V_m",
      "temperature_K", "pressure_Pa", "viscosity_Pa_s", "air_density_kg_m3",
      "mean_free_path_m", "slip_correction", "knudsen", "oil_density_kg_m3",
      "est_radius_m", "u_radius_m", "est_charge_C", "u_charge_C",
      "true_radius_m", "true_charge_C", "true_n",
      "solver_iterations", "solver_residual", "solver_converged",
      "focus_quality", "brownian_rms_m", "path_continuity", "r_squared",
      "duration_s", "n_samples", "status", "rejection_reason",
      "followed_prereg_rule", "decision_at", "estimate_viewed_before_decision",
      "protocol_version", "calibration_version", "notes"];
    const rows = store.derivedMeasurements.map(function (m) {
      const e = m.environment, q = m.quality;
      let t = null;
      if (revealed) { try { t = store.truth.read(m.dropletId, "export"); } catch (er) {} }
      return [m.measId, m.dropletId, m.fallObsId, m.fieldObsId, m.method.name,
        m.method.version, m.method.slipModel, m.regime,
        m.vFall.toExponential(6), m.seVFall.toExponential(6),
        m.vField.toExponential(6), m.seVField.toExponential(6),
        m.balancingVoltage === null ? "" : m.balancingVoltage,
        e.d.toExponential(6), (e.V / e.d).toExponential(6),
        e.T.toFixed(4), e.p.toFixed(1), e.eta.toExponential(6),
        e.rhoAir.toExponential(6), e.lambda.toExponential(6),
        e.Cc.toFixed(6), e.Kn.toFixed(6), e.rhoOil,
        m.radius.toExponential(6), fmtNum(m.uRadius),
        m.charge.toExponential(6), fmtNum(m.uCharge),
        t ? t.radius.toExponential(6) : "", t ? t.charge.toExponential(6) : "", t ? t.n : "",
        m.solver.iterations, fmtNum(m.solver.residual), m.solver.converged,
        q.focusQuality.toFixed(4), q.brownianRms.toExponential(4),
        q.pathContinuity.toFixed(4), q.r2.toFixed(5),
        q.duration.toFixed(3), q.samples, m.status, m.rejectionReason || "",
        m.followedPreregRule, m.decisionAt || "", m.estimateViewedBeforeDecision,
        m.protocolVersion, m.calibrationVersion, m.notes];
    });
    return csv(head, rows);
  }

  function fmtNum(v) { return (isFinite(v) ? v.toExponential(6) : ""); }

  function exclusionsCsv(store, revealInfo) {
    const head = ["meas_id", "droplet_id", "status", "rejection_reason", "rejection_note",
      "decision_at", "protocol_version", "followed_prereg_rule",
      "estimate_viewed_before_decision", "was_actually_sound"];
    const soundMap = {};
    if (revealInfo) {
      revealInfo.measurements.forEach(function (r) { soundMap[r.measId] = r.physicallySound; });
    }
    const rows = store.derivedMeasurements
      .filter(function (m) { return m.status !== "accepted"; })
      .map(function (m) {
        return [m.measId, m.dropletId, m.status, m.rejectionReason || "",
          m.rejectionNote || "", m.decisionAt || "", m.protocolVersion,
          m.followedPreregRule, m.estimateViewedBeforeDecision,
          revealInfo ? String(soundMap[m.measId]) : ""];
      });
    return csv(head, rows);
  }

  /* =================================================================
     4. MANIFEST AND BUNDLE
     ============================================================== */

  function manifest(store, world, analysis, streams) {
    return {
      experimentId: store.experiment.experimentId,
      seed: store.experiment.seed,
      modelVersion: VERSION,
      softwareVersion: VERSION,
      gitCommit: GIT_COMMIT,
      mode: store.experiment.mode,
      apparatusProfile: store.experiment.apparatusProfile,
      physics: world.physics,
      noiseToggles: world.noise,
      syntheticChargeModel: store.experiment.syntheticChargeModel || null,
      dropletConfig: store.experiment.dropletConfig || null,
      createdAt: store.experiment.createdAt,
      lockedAt: analysis && analysis.lockedAt ? analysis.lockedAt : null,
      revealed: store.truth.isRevealed(),
      analysisMethod: analysis ? (analysis.methodName || "candidate-lattice + WLS") : null,
      counts: {
        droplets: world.counters.generated,
        observations: store.rawObservations.length,
        measurements: store.derivedMeasurements.length,
        accepted: store.accepted().length,
        rejected: store.rejected().length,
        unresolved: store.unresolved().length
      },
      streamDesign: streams ? streams.design() : null,
      truthVaultReads: store.truth.isRevealed() ? store.truth.readLog().length : 0,
      fileInventory: [
        "manifest.json", "protocol.json", "calibration.json", "droplets.csv",
        "raw_observations.csv", "derived_measurements.csv", "exclusions.csv",
        "notebook.json", "analysis.json", "summary.json"
      ],
      notImplemented: ["report.pdf", "charts/", "checksums.json"],
      disclaimer: DISCLAIMER
    };
  }

  /**
   * The complete bundle, as a map of filename to text. The caller turns
   * this into downloads. Every file is generated from the stores.
   */
  function bundle(store, world, analysis, nb, streams, revealInfo) {
    const revealed = store.truth.isRevealed();
    const files = {
      "manifest.json": JSON.stringify(manifest(store, world, analysis, streams), null, 2),
      "protocol.json": JSON.stringify({ versions: store.protocols }, null, 2),
      "calibration.json": JSON.stringify({ versions: store.calibrations }, null, 2),
      "droplets.csv": dropletsCsv(store, world, revealed),
      "raw_observations.csv": rawObservationsCsv(store),
      "derived_measurements.csv": derivedCsv(store, revealed),
      "exclusions.csv": exclusionsCsv(store, revealInfo),
      "notebook.json": nb ? JSON.stringify({ entries: nb.entries }, null, 2) : "{}",
      "analysis.json": JSON.stringify(analysis || { note: "no analysis run" }, null, 2),
      "summary.json": JSON.stringify(summary(store, world, analysis, revealInfo), null, 2),
      "README.txt":
        "THE FALLING CHARGE — experiment bundle\n" +
        "=====================================\n\n" + DISCLAIMER + "\n\n" +
        "Reproduction\n------------\n" +
        "Seed: " + store.experiment.seed + "\n" +
        "Model version: " + VERSION + "\n" +
        "Apparatus profile: " + store.experiment.apparatusProfile + "\n" +
        "Slip model: " + world.physics.slipModel + "\n\n" +
        "Open the instrument, enter this seed and profile, and the same " +
        "droplets with the same hidden charges will be generated. Your own " +
        "actions determine which of them you measure, so the DATA will differ " +
        "unless you repeat the same actions. See docs/REPRODUCIBILITY.md.\n\n" +
        "Not included in this build: report.pdf, chart images, checksums.json.\n"
    };
    /* raw sample series, one file per observation */
    store.rawObservations.forEach(function (o) {
      files["samples/" + o.obsId + ".csv"] = samplesCsv(o);
    });
    return files;
  }

  const API = {
    VERSION: VERSION, GIT_COMMIT: GIT_COMMIT, DISCLAIMER: DISCLAIMER,
    summary: summary, reveal: reveal, csv: csv,
    dropletsCsv: dropletsCsv, rawObservationsCsv: rawObservationsCsv,
    derivedCsv: derivedCsv, exclusionsCsv: exclusionsCsv, samplesCsv: samplesCsv,
    manifest: manifest, bundle: bundle
  };
  if (isNode) module.exports = API;
  root.FC = root.FC || {};
  root.FC.reporting = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
