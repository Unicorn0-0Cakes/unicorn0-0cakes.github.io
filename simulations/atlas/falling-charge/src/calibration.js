/* =====================================================================
   THE FALLING CHARGE — the calibration record
   ---------------------------------------------------------------------
   Every entry carries value, unit, uncertainty, method, source, timestamp,
   status and notes. An entry with no uncertainty is not a calibration and
   is refused. docs/CALIBRATION.md.

   Editing a calibration after collection has begun does NOT overwrite it:
   it creates a new version, and every observation records the version in
   force when it was taken.
   ===================================================================== */
(function (root) {
  "use strict";

  const isNode = (typeof module !== "undefined" && module.exports);
  const A = isNode ? require("./apparatus.js") : root.FC.apparatus;

  const STATUS = ["not started", "provisional", "calibrated",
                  "not yet calibrated", "expired"];

  /**
   * A fresh, uncalibrated record. Nothing here is a measurement yet —
   * the values are the apparatus's nominal claims about itself.
   */
  function createRecord(world) {
    const now = new Date().toISOString();
    const mk = function (o) {
      return Object.assign({
        value: null, unit: "", uncertainty: null, method: "",
        source: "", timestamp: now, status: "not started", notes: ""
      }, o);
    };
    return {
      version: 1,
      createdAt: now,
      previous: null,
      reason: null,
      scale: mk({
        label: "Microscope scale",
        value: A.GEOM.reticleDiv, nominal: A.GEOM.reticleDiv,
        unit: "m per reticle division",
        uncertainty: null,
        method: "", source: "apparatus nameplate",
        sensitivity: "HIGH — q depends on the scale to a power between 3/2 and 2"
      }),
      plateGap: mk({
        label: "Plate separation",
        value: A.GEOM.plateGap, unit: "m", uncertainty: null,
        source: "apparatus nameplate",
        sensitivity: "HIGH — q is directly proportional to d"
      }),
      voltage: mk({
        label: "Voltage",
        gain: 1, offset: 0, value: 1, unit: "gain, dimensionless",
        uncertainty: null, source: "display accepted at face value",
        sensitivity: "HIGH — q is inversely proportional to V"
      }),
      temperature: mk({
        label: "Temperature",
        offset: 0, value: 0, unit: "K offset applied to the sensor reading",
        uncertainty: null, source: "sensor accepted at face value",
        sensitivity: "MODERATE — enters through η, and q ∝ η^{3/2}"
      }),
      pressure: mk({
        label: "Pressure",
        offset: 0, value: 0, unit: "Pa offset applied to the sensor reading",
        uncertainty: null, source: "sensor accepted at face value",
        sensitivity: "LOW — enters through λ and the slip correction"
      }),
      timing: mk({
        label: "Timing",
        value: null, unit: "s", uncertainty: null,
        source: "apparatus specification",
        sensitivity: "MODERATE — random, reduced by longer observations"
      }),
      level: mk({
        label: "Level and alignment",
        value: 0, unit: "rad", uncertainty: null,
        source: "spirit level",
        sensitivity: "LOW for velocity; the lateral drift is the tell"
      })
    };
  }

  /**
   * The apparatus's own claims, adopted wholesale. A legitimate and
   * common choice — and it is recorded as "not yet calibrated" so that
   * the report shows the user made it.
   */
  function acceptNameplate(rec, world) {
    const pr = A.PROFILES[world.profile];
    const now = new Date().toISOString();
    const set = function (e, u, note) {
      e.uncertainty = u;
      e.status = "not yet calibrated";
      e.method = "Accepted the apparatus nameplate without independent check";
      e.timestamp = now;
      e.notes = note || "";
    };
    set(rec.scale, A.GEOM.reticleDiv * (pr.scaleGain || 0.01),
        "Nameplate division spacing; the optical gain error is not measured.");
    set(rec.plateGap, A.GEOM.plateGap * 0.004, "");
    set(rec.voltage, Math.max(pr.vGain, 0.001),
        "Display gain assumed unity; offset assumed zero.");
    set(rec.temperature, pr.tempBias || 0.1, "");
    set(rec.pressure, pr.pressBias || 50, "");
    set(rec.timing, Math.max(pr.timeQuant, pr.timeJitter) || 1e-3, "");
    set(rec.level, pr.tilt || 0, "");
    return rec;
  }

  /**
   * Calibrate the microscope scale against the stage micrometer. The
   * user counts `divisions` across a `knownLength`; the result inherits
   * their reading uncertainty AND the micrometer's own.
   */
  function calibrateScale(rec, world, errors, opts) {
    const trueDiv = A.trueReticleDivision(world, errors);
    /* The micrometer is itself imperfect; the user cannot do better than
       its uncertainty. This is where the residual scale bias survives. */
    const micrometerU = opts.micrometerUncertainty || 0.002;
    const readU = opts.readingUncertainty || 0.004;
    const measured = trueDiv * (1 + (opts.residualBias || 0));
    rec.scale.value = measured;
    rec.scale.uncertainty = measured * Math.sqrt(micrometerU * micrometerU + readU * readU);
    rec.scale.method = "Stage micrometer, " + (opts.divisions || 10) +
                       " divisions counted";
    rec.scale.source = "In-apparatus stage micrometer";
    rec.scale.status = "calibrated";
    rec.scale.timestamp = new Date().toISOString();
    return rec;
  }

  /** Two-point voltage calibration against the reference source. */
  function calibrateVoltage(rec, world, errors, opts) {
    const refU = opts.referenceUncertainty || 0.001;
    /* The user recovers gain and offset to within the reference's own
       uncertainty; the rest survives as a systematic. */
    rec.voltage.gain = 1 / (1 + errors.vGain * (1 - refU));
    rec.voltage.offset = -errors.vOffset * (1 - refU);
    rec.voltage.value = rec.voltage.gain;
    rec.voltage.uncertainty = refU;
    rec.voltage.method = "Two-point comparison against the reference source";
    rec.voltage.source = "Internal voltage reference";
    rec.voltage.status = "calibrated";
    rec.voltage.timestamp = new Date().toISOString();
    return rec;
  }

  /** A user-entered value, with its uncertainty. Uncertainty is required. */
  function setEntry(rec, key, value, uncertainty, method, notes) {
    const e = rec[key];
    if (!e) throw new Error("Unknown calibration entry: " + key);
    if (uncertainty === null || uncertainty === undefined || !(uncertainty >= 0)) {
      throw new Error("A calibration entry requires an uncertainty. " +
                      "An entry without one is not a calibration.");
    }
    e.value = value;
    e.uncertainty = uncertainty;
    e.method = method || "Entered by the operator";
    e.status = "provisional";
    e.timestamp = new Date().toISOString();
    e.notes = notes || "";
    return rec;
  }

  /** Every entry has been touched? Blind mode gates collection on this. */
  function isComplete(rec) {
    return keys(rec).every(function (k) {
      return rec[k].status && rec[k].status !== "not started";
    });
  }

  function keys(rec) {
    return ["scale", "plateGap", "voltage", "temperature", "pressure",
            "timing", "level"];
  }

  /**
   * Amend the record. The previous version is PRESERVED, not replaced.
   */
  function amend(rec, changes, reason) {
    if (!reason || reason.trim().length < 10) {
      throw new Error("A calibration amendment requires a written reason.");
    }
    const next = JSON.parse(JSON.stringify(rec));
    next.version = rec.version + 1;
    next.previous = rec.version;
    next.reason = reason;
    next.createdAt = new Date().toISOString();
    Object.keys(changes || {}).forEach(function (k) {
      if (next[k]) Object.assign(next[k], changes[k]);
    });
    return next;
  }

  /** Fractional uncertainties, for the Monte Carlo propagation. */
  function relativeUncertainties(rec) {
    const rel = function (e) {
      if (!e || e.uncertainty === null || !e.value) return 0;
      return Math.abs(e.uncertainty / e.value);
    };
    return {
      scale: rel(rec.scale),
      plateGap: rel(rec.plateGap),
      voltage: rec.voltage.uncertainty || 0,
      temperatureAbs: rec.temperature.uncertainty || 0,   // K, absolute
      pressureAbs: rec.pressure.uncertainty || 0,         // Pa, absolute
      timingAbs: rec.timing.uncertainty || 0
    };
  }

  const API = {
    STATUS: STATUS, keys: keys,
    createRecord: createRecord, acceptNameplate: acceptNameplate,
    calibrateScale: calibrateScale, calibrateVoltage: calibrateVoltage,
    setEntry: setEntry, isComplete: isComplete, amend: amend,
    relativeUncertainties: relativeUncertainties
  };

  if (isNode) module.exports = API;
  root.FC = root.FC || {};
  root.FC.calibration = API;

})(typeof globalThis !== "undefined" ? globalThis : this);
