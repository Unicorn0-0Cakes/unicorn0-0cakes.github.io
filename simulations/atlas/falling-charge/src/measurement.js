/* =====================================================================
   THE FALLING CHARGE — tracking, fitting, quality, and the decision
   ---------------------------------------------------------------------
   This module sees only what an experimenter could see: the droplet's
   position, the instrument's READINGS, and the clock. It never touches
   the truth vault, and it never imports the elementary charge.
   docs/MEASUREMENT_PROTOCOL.md, docs/EXCLUSION_POLICY.md.

   Raw sample series are written once and never modified. There is no
   delete path for an observation anywhere in this file.
   ===================================================================== */
(function (root) {
  "use strict";

  const isNode = (typeof module !== "undefined" && module.exports);
  const U = isNode ? require("./units.js")     : root.FC.units;
  const P = isNode ? require("./physics.js")   : root.FC.physics;
  const A = isNode ? require("./apparatus.js") : root.FC.apparatus;

  let obsCounter = 0, measCounter = 0;
  function resetIds() { obsCounter = 0; measCounter = 0; }
  function nextObsId()  { obsCounter++;  return "OBS-" + String(obsCounter).padStart(4, "0"); }
  function nextMeasId() { measCounter++; return "M-" + String(measCounter).padStart(4, "0"); }

  const TRACK_HZ = 20;

  /* =================================================================
     1. THE TRACKER
     ============================================================== */

  /**
   * Open a measurement window on the selected droplet.
   * @returns {object} tracker state, or {error} if refused
   */
  function startTrack(world, ctx) {
    const d = world.droplets.find(function (x) { return x.id === world.selectedId; });
    if (!d) return { error: "no droplet selected" };
    if (!d.visible) return { error: "selected droplet is not visible" };
    if (world.t < world.instrument.settleUntil) {
      return { error: "instrument still settling — " +
                      (world.instrument.settleUntil - world.t).toFixed(1) + " s remaining" };
    }
    return {
      dropletId: d.id,
      kind: world.instrument.fieldOn ? "field-on" : "field-off",
      tStart: world.t,
      anchorY: d.y,
      gateStart: d.y,
      gateStop: null,
      samples: [],
      nextSampleAt: world.t,
      chargeEventsAtStart: d.chargeEvents.length,
      instrument: snapshotInstrument(world, ctx),
      minY: d.y, maxY: d.y,
      gaps: 0, expected: 0
    };
  }

  /** Everything the instrument reads at this moment. Readings, not truth. */
  function snapshotInstrument(world, ctx) {
    return {
      vDisplay: A.displayedVoltage(world),
      polarity: world.instrument.polarity,
      fieldOn: world.instrument.fieldOn,
      tempRead: A.readTemperature(world, ctx.errors),
      pressRead: A.readPressure(world, ctx.errors),
      focusSet: world.instrument.focalPlane,
      illumination: world.instrument.illumination
    };
  }

  /**
   * Called every physics step while a track is open. Records a sample at
   * TRACK_HZ of simulated time, with the apparatus's position noise and
   * timing quantisation applied.
   */
  function sample(track, world, ctx) {
    if (world.t < track.nextSampleAt) return;
    const d = world.droplets.find(function (x) { return x.id === track.dropletId; });
    track.expected++;
    if (!d) { track.gaps++; track.nextSampleAt += 1 / TRACK_HZ; return; }
    if (!d.visible) { track.gaps++; track.nextSampleAt += 1 / TRACK_HZ; return; }

    const pr = A.PROFILES[world.profile];
    const rng = ctx.streams.get("measurement");

    /* position: centroid noise, worse out of focus */
    let y = d.y;
    if (world.noise.focus || pr.posNoise > 0) {
      const s = pr.posNoise * (1 + 2 * (1 - d.focus));
      if (s > 0) y += rng.gauss(0, s);
    }
    /* the reticle only resolves what the optical scale permits */
    const div = A.trueReticleDivision(world, ctx.errors);
    y = Math.round(y / (div / 50)) * (div / 50);

    /* time: quantisation and jitter */
    let t = world.t;
    if (world.noise.timing) {
      if (pr.timeJitter > 0) t += rng.gauss(0, pr.timeJitter);
      if (pr.timeQuant > 0) t = Math.round(t / pr.timeQuant) * pr.timeQuant;
    }

    track.samples.push([t, y]);
    if (y < track.minY) track.minY = y;
    if (y > track.maxY) track.maxY = y;
    track.nextSampleAt += 1 / TRACK_HZ;
  }

  /**
   * Close the window and produce an immutable RawObservation.
   * Observer reaction time (historical mode) is applied here, to both
   * ends, so the bias largely cancels and the variance does not.
   */
  function stopTrack(track, world, ctx) {
    const pr = A.PROFILES[world.profile];
    const d = world.droplets.find(function (x) { return x.id === track.dropletId; });
    let tEnd = world.t;

    if (world.noise.reaction && pr.reactionSd > 0) {
      const rng = ctx.streams.get("measurement");
      const delay = rng.gauss(pr.reactionMu, pr.reactionSd);
      tEnd += delay;
    }

    const flags = [];
    if (d && d.chargeEvents.length > track.chargeEventsAtStart) {
      flags.push("charge_changed_during_measurement");
    }
    if (!d) flags.push("droplet_identity_lost");
    if (track.gaps > 0) flags.push("tracking_gaps");

    const obs = Object.freeze({
      obsId: nextObsId(),
      dropletId: track.dropletId,
      kind: track.kind,
      tStart: track.tStart,
      tEnd: tEnd,
      samples: Object.freeze(track.samples.map(function (s) { return Object.freeze(s.slice()); })),
      instrument: Object.freeze(track.instrument),
      calibrationVersion: ctx.calibrationVersion,
      protocolVersion: ctx.protocolVersion,
      anchorY: track.anchorY,
      gaps: track.gaps,
      expected: track.expected,
      flags: Object.freeze(flags),
      createdAt: new Date().toISOString()
    });
    return obs;
  }

  /* =================================================================
     2. VELOCITY FIT
     ============================================================== */

  /**
   * Ordinary least squares of y on t.
   *
   * IMPORTANT AND STATED IN THE INTERFACE: for a diffusing particle the
   * residuals are a random walk, so the samples are correlated and this
   * standard error UNDERSTATES the true velocity uncertainty by an amount
   * this build has not quantified. docs/LIMITATIONS.md L-1.
   *
   * @returns {object} slope (m/s, upward-positive), se, diagnostics
   */
  function fitVelocity(samples) {
    const n = samples.length;
    if (n < 3) {
      return { ok: false, reason: "fewer than 3 samples", n: n,
               slope: NaN, se: NaN, r2: NaN, residuals: [] };
    }
    let st = 0, sy = 0;
    for (let i = 0; i < n; i++) { st += samples[i][0]; sy += samples[i][1]; }
    const tBar = st / n, yBar = sy / n;

    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dt = samples[i][0] - tBar, dy = samples[i][1] - yBar;
      sxx += dt * dt; sxy += dt * dy; syy += dy * dy;
    }
    if (sxx <= 0) {
      return { ok: false, reason: "zero time span", n: n,
               slope: NaN, se: NaN, r2: NaN, residuals: [] };
    }

    const slope = sxy / sxx;
    const intercept = yBar - slope * tBar;

    const residuals = new Array(n);
    let ss = 0;
    for (let i = 0; i < n; i++) {
      const r = samples[i][1] - (intercept + slope * samples[i][0]);
      residuals[i] = r;
      ss += r * r;
    }
    const seOls = Math.sqrt(ss / ((n - 2) * sxx));
    const r2 = syy > 0 ? 1 - ss / syy : 1;
    const rms = Math.sqrt(ss / n);

    /* -----------------------------------------------------------------
       THE BROWNIAN-AWARE STANDARD ERROR
       -----------------------------------------------------------------
       The ordinary least-squares standard error above assumes independent
       residuals. For a diffusing droplet the residuals are a RANDOM WALK,
       and the difference is not a detail: measured against simulated
       tracks, the OLS error understates the true velocity uncertainty by
       a factor of ten to fifty.

       That understatement has a concrete, damaging consequence. It makes
       a NEUTRAL droplet look as though it responded to the field, because
       the spurious velocity difference clears a wildly overconfident
       three-sigma test. Those droplets then enter the analysis carrying
       apparent charges of a few hundredths of an elementary unit, which
       forces the inferred lattice down onto a sub-multiple. A single bad
       uncertainty estimate propagates all the way to the wrong physical
       conclusion.

       The correct treatment. For pure Brownian motion with diffusion
       coefficient D observed over duration T, the endpoints are a
       sufficient statistic for the drift: intermediate samples add no
       information, because the increments are independent but the
       positions are not. The minimum-variance drift estimate is therefore
       (y(T) - y(0))/T with

           Var(v) = 2 D / T           so    se = sqrt(2 D / T)

       independent of how many samples were taken. D is estimated from the
       data itself, from the mean squared increment of the residuals:

           D_hat = <(dr)^2> / (2 dt)

       The reported standard error is the larger of this and the OLS value,
       so that a track dominated by instrument noise rather than diffusion
       is not penalised for it.

       This resolves LIMITATIONS.md L-1, which earlier builds could only
       declare. The OLS value is still returned as `seOls` because the gap
       between the two is worth showing.
       ----------------------------------------------------------------- */
    let dHat = 0, seBrownian = 0;
    const duration = samples[n - 1][0] - samples[0][0];
    if (n >= 4 && duration > 0) {
      let sumSq = 0, cnt = 0;
      for (let i = 1; i < n; i++) {
        const dt = samples[i][0] - samples[i - 1][0];
        if (dt <= 0) continue;
        const dr = residuals[i] - residuals[i - 1];
        sumSq += (dr * dr) / dt;
        cnt++;
      }
      if (cnt > 0) {
        dHat = (sumSq / cnt) / 2;
        seBrownian = Math.sqrt(2 * dHat / duration);
      }
    }
    const se = Math.max(seOls, seBrownian);

    /* quadratic term, as a terminal-velocity check */
    const quad = fitQuadraticT(samples, tBar);

    return {
      ok: true, n: n, slope: slope, intercept: intercept, se: se,
      seOls: seOls, seBrownian: seBrownian, diffusionEstimate: dHat,
      seInflation: seOls > 0 ? se / seOls : 1,
      r2: r2, residRms: rms, residuals: residuals,
      span: Math.abs(samples[n - 1][1] - samples[0][1]),
      quadT: quad.t, quadCoef: quad.c,
      curvatureAmplitude: quad.amplitude, curvatureRatio: quad.ratio,
      duration: duration,
      note: "Slope by OLS. The standard error is the larger of the OLS value " +
            "and the Brownian-aware value sqrt(2 D / T), with D estimated " +
            "from the residual increments, because the residuals of a " +
            "diffusing droplet are a random walk and OLS assumes they are " +
            "not."
    };
  }

  /**
   * Quadratic term, for the terminal-velocity check.
   *
   * The t-statistic alone is USELESS here and the reason is instructive.
   * The droplet reaches terminal velocity in about 3 microseconds
   * (PHYSICS_MODEL §3.1), so any real curvature is long gone. But the
   * residuals are a random walk, not independent noise, and a random walk
   * has genuine curvature on every finite sample. The ordinary
   * least-squares standard error assumes independence, so it is far too
   * small, and |t| routinely reaches 10-35 on a perfectly settled droplet.
   * A rule built on that t-statistic rejects every measurement ever taken.
   *
   * The check that works, and the one MEASUREMENT_PROTOCOL §2.1 specifies,
   * compares the SIZE of the implied curvature against the observed noise:
   *
   *   amplitude = |c| (T/2)^2      the sag the quadratic adds at the ends
   *   ratio     = amplitude / residual RMS
   *
   * A ratio of order one is what diffusion produces on its own. Only a
   * ratio well above that indicates the droplet was still accelerating —
   * which in this apparatus means the operator started tracking during an
   * instrument transient.
   *
   * The t-statistic is still reported, labelled, because seeing it be
   * large while the curvature is negligible is the clearest demonstration
   * in the whole instrument of what correlated residuals do to a standard
   * error.
   */
  function fitQuadraticT(samples, tBar) {
    const n = samples.length;
    if (n < 5) return { c: 0, t: 0, amplitude: 0, ratio: 0 };
    let s = [0, 0, 0, 0, 0], b = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const x = samples[i][0] - tBar, y = samples[i][1];
      const x2 = x * x;
      s[0] += 1; s[1] += x; s[2] += x2; s[3] += x2 * x; s[4] += x2 * x2;
      b[0] += y; b[1] += x * y; b[2] += x2 * y;
    }
    const M = [[s[0], s[1], s[2]], [s[1], s[2], s[3]], [s[2], s[3], s[4]]];
    const sol = solve3(M, b);
    if (!sol) return { c: 0, t: 0, amplitude: 0, ratio: 0 };
    const c = sol[2];
    let ss = 0;
    for (let i = 0; i < n; i++) {
      const x = samples[i][0] - tBar;
      const r = samples[i][1] - (sol[0] + sol[1] * x + c * x * x);
      ss += r * r;
    }
    const s2 = ss / Math.max(1, n - 3);
    const inv = invDiag3(M);
    const seC = inv ? Math.sqrt(Math.max(0, s2 * inv)) : 0;

    const span = samples[n - 1][0] - samples[0][0];
    const amplitude = Math.abs(c) * (span / 2) * (span / 2);
    const noise = Math.sqrt(ss / n);
    return {
      c: c,
      t: seC > 0 ? c / seC : 0,
      amplitude: amplitude,
      ratio: noise > 0 ? amplitude / noise : 0
    };
  }

  function solve3(M, b) {
    const a = [M[0].slice(), M[1].slice(), M[2].slice()];
    const v = b.slice();
    for (let i = 0; i < 3; i++) {
      let piv = i;
      for (let k = i + 1; k < 3; k++) if (Math.abs(a[k][i]) > Math.abs(a[piv][i])) piv = k;
      if (Math.abs(a[piv][i]) < 1e-300) return null;
      if (piv !== i) { const tA = a[i]; a[i] = a[piv]; a[piv] = tA;
                       const tV = v[i]; v[i] = v[piv]; v[piv] = tV; }
      for (let k = i + 1; k < 3; k++) {
        const f = a[k][i] / a[i][i];
        for (let j = i; j < 3; j++) a[k][j] -= f * a[i][j];
        v[k] -= f * v[i];
      }
    }
    const x = [0, 0, 0];
    for (let i = 2; i >= 0; i--) {
      let sum = v[i];
      for (let j = i + 1; j < 3; j++) sum -= a[i][j] * x[j];
      x[i] = sum / a[i][i];
    }
    return x;
  }

  /** The (2,2) element of M^-1, for the quadratic coefficient's variance. */
  function invDiag3(M) {
    const det =
      M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
      M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
      M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    if (Math.abs(det) < 1e-300) return null;
    const cof = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    return cof / det;
  }

  /* =================================================================
     3. DERIVATION — radius and charge from two observations
     ============================================================== */

  /**
   * Combine a field-off observation and a field-on observation into a
   * radius and a charge.
   *
   * THIS IS THE ONLY PATH TO A CHARGE. It throws if either observation
   * is missing, so there is no route from a voltage reading to a charge
   * value. Specification §20, enforced structurally.
   *
   * @param {object} fallObs   field-off RawObservation
   * @param {object} fieldObs  field-on RawObservation
   * @param {object} cal       the calibration record in force
   * @param {object} settings  {slipModel, rhoOil}
   */
  function derive(fallObs, fieldObs, cal, settings) {
    if (!fallObs) throw new Error(
      "A charge cannot be derived without a field-off fall observation.");
    if (!fieldObs) throw new Error(
      "A charge cannot be derived without a field-on observation.");
    if (fallObs.dropletId !== fieldObs.dropletId) throw new Error(
      "Observations belong to different droplets: " +
      fallObs.dropletId + " and " + fieldObs.dropletId + ".");

    const fitF = fitVelocity(fallObs.samples);
    const fitE = fitVelocity(fieldObs.samples);

    /* Calibrated quantities. Note these are the USER's numbers, scale
       error and all — the analysis has no access to the true values. */
    const scale = cal.scale.value / cal.scale.nominal;   // dimensionless gain
    const d = cal.plateGap.value;
    const T = fallObs.instrument.tempRead + cal.temperature.offset;
    const p = fallObs.instrument.pressRead + cal.pressure.offset;
    const V = fieldObs.instrument.vDisplay * cal.voltage.gain + cal.voltage.offset;

    const eta = P.viscosity(T);
    const rhoAir = P.airDensity(p, T);
    const lambda = P.meanFreePath(p, T);
    const slip = settings.slipModel === "none" ? null : U.SLIP[settings.slipModel];

    /* velocities, corrected by the reticle scale calibration */
    const vFallUp = fitF.slope * scale;         // upward-positive
    const vFieldUp = fitE.slope * scale;
    const vFall = -vFallUp;                     // fall SPEED, positive
    const vSigned = -vFieldUp;                  // downward-positive

    const sol = P.solveRadius(vFall, eta, settings.rhoOil, rhoAir, lambda, slip);
    const q = P.chargeFromVelocities(vFall, vSigned, sol.radius, sol.Cc, eta, d, V);

    const wEff = P.effectiveWeight(sol.radius, settings.rhoOil, rhoAir);
    const qBalance = P.chargeFromBalance(wEff, d, V);

    return {
      fitFall: fitF, fitField: fitE,
      vFall: vFall, seVFall: fitF.se * scale,
      vField: vFieldUp, seVField: fitE.se * scale,
      vSigned: vSigned,
      radius: sol.radius, rStokes: sol.rStokes, solver: sol,
      charge: q, chargeIfBalanced: qBalance,
      environment: {
        eta: eta, rhoAir: rhoAir, lambda: lambda,
        Cc: sol.Cc, Kn: sol.Kn, T: T, p: p, V: V, d: d, scale: scale,
        rhoOil: settings.rhoOil, slipModel: settings.slipModel
      },
      wEff: wEff,
      reynolds: P.reynolds(sol.radius, rhoAir, vFall, eta),
      regime: vSigned < -1e-9 ? "terminal rise"
            : vSigned > 1e-9 ? "slowed fall" : "balanced",
      assumptions: [
        "Sphere, constant radius during the observation",
        "Uniform field between the plates",
        "Dry air, ideal gas",
        "Oil density " + settings.rhoOil + " kg/m³ (assumed, not measured)",
        "Sutherland viscosity η(T)",
        "Slip model: " + (slip ? slip.label : "none — ordinary Stokes"),
        "Reticle scale from calibration v" + (cal.version || 1)
      ],
      equations: {
        radius: "r² · C_c(r) = 9 η v_f / (2 g (ρ_oil − ρ_air))",
        charge: "q = − 6π η r d (v_f − v_s) / (C_c V)"
      }
    };
  }

  /* =================================================================
     4. QUALITY INDICATORS
     ============================================================== */

  const REJECTION_REASONS = [
    "droplet_identity_lost", "overlapping_droplets",
    "insufficient_observation_duration", "terminal_velocity_not_reached",
    "focus_failure", "voltage_instability", "charge_changed_during_measurement",
    "left_calibrated_region", "apparatus_disturbance", "tracking_failure",
    "uncertainty_threshold_exceeded", "other"
  ];

  const REASON_LABEL = {
    droplet_identity_lost: "Droplet identity lost",
    overlapping_droplets: "Overlapping droplets",
    insufficient_observation_duration: "Insufficient observation duration",
    terminal_velocity_not_reached: "Terminal velocity not reached",
    focus_failure: "Focus failure",
    voltage_instability: "Voltage instability",
    charge_changed_during_measurement: "Charge changed during measurement",
    left_calibrated_region: "Droplet left the calibrated field region",
    apparatus_disturbance: "Apparatus disturbance",
    tracking_failure: "Tracking failure",
    uncertainty_threshold_exceeded: "Predefined uncertainty threshold exceeded",
    other: "Other (written explanation required)"
  };

  /* -------------------------------------------------------------------
     DEFAULT PREREGISTERED RULES

     RECALIBRATED after the Brownian-aware standard error was introduced.
     The earlier thresholds were written against the ordinary least-squares
     error, which understates the velocity uncertainty by a factor of ten
     to fifty; a 5 % velocity criterion was therefore not a demanding
     standard but an impossible one, and it rejected essentially every
     measurement the apparatus can produce.

     These thresholds are set so that a well-executed single-transit
     measurement can meet them. They are NOT tuned against the inferred
     elementary charge — no rule in this file reads the estimate, and
     several of them are deliberately achievable only for larger, faster
     droplets, which is a real experimental constraint rather than a
     convenience.

     Status: not yet calibrated against any external standard. A user is
     expected to change them, and changing them before collection begins
     costs nothing.
     ------------------------------------------------------------------- */
  const DEFAULT_RULES = {
    minDuration: 6,             // s
    minSamples: 60,
    maxVoltageDrift: 0.005,     // fraction
    maxRelVelocityU: 0.12,
    /* Calibrated against the null distribution, not guessed: 3000 simulated
       tracks of pure drift plus diffusion with NO acceleration give a median
       curvature ratio of 1.7 and a 99th percentile of 7.2, so 8.0 rejects
       about 1 % of perfectly settled droplets. For comparison, the textbook
       |t| > 2 rule on the same null data rejects essentially all of them —
       its median |t| is 8.0. See tests/test-endtoend.js. */
    maxCurvatureRatio: 8.0,
    minPlateClearance: 3e-4,    // m
    minFocus: 0.35,
    chargeChangePolicy: "segment",   // segment | exclude
    evaporationPolicy: "flag",       // flag | exclude
    maxRelChargeU: 0.15
  };

  /**
   * Compute every quality indicator. Deliberately NOT collapsed into a
   * single score — a single score is how a rejection stops needing a
   * reason. docs/EXCLUSION_POLICY.md §1.
   */
  function quality(derived, fallObs, fieldObs, world, uCharge) {
    const f = derived.fitFall, e = derived.fitField;
    const dur = Math.min(f.duration || 0, e.duration || 0);
    const nS = Math.min(f.n || 0, e.n || 0);
    const cont = (fallObs.expected > 0 && fieldObs.expected > 0)
      ? Math.min(1 - fallObs.gaps / fallObs.expected, 1 - fieldObs.gaps / fieldObs.expected)
      : 1;

    /* The relative uncertainty that belongs on the FALL velocity alone.
       Taking the worse of the fall and the field-on velocity looks
       cautious but is wrong: a droplet near balance has a small field-on
       velocity, so its relative uncertainty is enormous while its CHARGE
       may be very well determined — the charge depends on the difference
       (v_f - v_s), not on v_s itself. That difference is already
       propagated properly into the charge uncertainty below, so applying
       a relative criterion to v_s as well would reject exactly the
       measurements a balance method is best at. */
    const relVU = Math.abs(derived.seVFall / derived.vFall);
    const relVFieldU = derived.vField !== 0
      ? Math.abs(derived.seVField / derived.vField) : NaN;
    const relQU = (uCharge !== undefined && derived.charge)
      ? Math.abs(uCharge / derived.charge) : NaN;

    const flags = [].concat(fallObs.flags, fieldObs.flags);

    return {
      duration: dur,
      samples: nS,
      focusQuality: worldFocus(world, fallObs.dropletId),
      pathContinuity: cont,
      terminalVelocityT: Math.max(Math.abs(f.quadT || 0), Math.abs(e.quadT || 0)),
      curvatureRatio: Math.max(f.curvatureRatio || 0, e.curvatureRatio || 0),
      brownianRms: Math.max(f.residRms || 0, e.residRms || 0),
      airCurrentContamination: null,       // NOT IMPLEMENTED — L-10
      plateClearance: plateClearance(world, fallObs, fieldObs),
      voltageStability: 0,                 // filled by the caller from drift log
      temperatureStability: 0,
      chargeStable: flags.indexOf("charge_changed_during_measurement") < 0,
      overlapRisk: null,                   // NOT IMPLEMENTED
      identityLossRisk: flags.indexOf("droplet_identity_lost") >= 0,
      evaporationSuspected: null,          // NOT IMPLEMENTED — L-9
      timingPrecision: A.PROFILES[world.profile].timeQuant,
      r2: Math.min(f.r2 || 0, e.r2 || 0),
      relVelocityUncertainty: relVU,
      relFieldVelocityUncertainty: relVFieldU,
      relChargeUncertainty: relQU,
      knudsen: derived.environment.Kn,
      reynolds: derived.reynolds,
      solverConverged: derived.solver.converged,
      flags: flags
    };
  }

  function worldFocus(world, id) {
    const d = world.droplets.find(function (x) { return x.id === id; });
    return d ? d.focus : 0;
  }

  function plateClearance(world, o1, o2) {
    let lo = Infinity, hi = -Infinity;
    [o1, o2].forEach(function (o) {
      o.samples.forEach(function (s) {
        if (s[1] < lo) lo = s[1];
        if (s[1] > hi) hi = s[1];
      });
    });
    if (!isFinite(lo)) return 0;
    return Math.min(lo, world.geom.plateGap - hi);
  }

  /**
   * Apply the preregistered rules. Returns which rules a measurement
   * fails. The rules NEVER decide — they inform, and the user's decision
   * is recorded together with whether it followed the rule.
   */
  function checkRules(q, rules) {
    const fails = [];
    if (q.duration < rules.minDuration) fails.push("insufficient_observation_duration");
    if (q.samples < rules.minSamples) fails.push("insufficient_observation_duration");
    if (q.relVelocityUncertainty > rules.maxRelVelocityU) fails.push("uncertainty_threshold_exceeded");
    if (isFinite(q.relChargeUncertainty) && q.relChargeUncertainty > rules.maxRelChargeU)
      fails.push("uncertainty_threshold_exceeded");
    if (q.curvatureRatio > rules.maxCurvatureRatio) fails.push("terminal_velocity_not_reached");
    if (q.plateClearance < rules.minPlateClearance) fails.push("left_calibrated_region");
    if (q.focusQuality < rules.minFocus) fails.push("focus_failure");
    if (!q.chargeStable && rules.chargeChangePolicy === "exclude")
      fails.push("charge_changed_during_measurement");
    if (!q.solverConverged) fails.push("tracking_failure");
    return Array.from(new Set(fails));
  }

  /* =================================================================
     4b. DROPLET SUITABILITY — before you spend thirty seconds on it
     ---------------------------------------------------------------
     Built ONLY from quantities an experimenter can see: how sharply the
     droplet images, how fast it is currently moving, and where it sits
     between the plates. It uses no hidden value, says nothing about
     charge, and says nothing about the estimate — it is an instrument
     diagnostic, like a signal-strength meter, not a hint.

     It exists because the physics is unforgiving in a way that is not
     obvious. Brownian velocity error scales as r^(-5/2) while fall speed
     scales as r^2, so a droplet half the radius is roughly six times
     worse to measure. A user who picks the slow, delicate-looking
     droplets will produce an unusable dataset and have no idea why.
     Telling them the observable facts is teaching; telling them whether
     their answer is improving would not be.
     ============================================================== */

  /** Fall speed at which Brownian noise starts to dominate, m/s. */
  const SLOW_WARN = 3.0e-5;
  const SLOW_BAD  = 2.0e-5;

  function suitability(droplet, world) {
    if (!droplet) {
      return { level: "none", label: "No droplet selected", reasons: [], hints: [] };
    }
    const reasons = [], hints = [];
    let score = 2;                                   // 2 good, 1 marginal, 0 poor

    /* focus — the most common and most fixable problem */
    if (droplet.focus < 0.35) {
      score = 0;
      reasons.push("Focus quality " + Math.round(droplet.focus * 100) +
                   " %, below the 35 % rule");
      hints.push("Turn the focus control until this droplet sharpens.");
    } else if (droplet.focus < 0.6) {
      score = Math.min(score, 1);
      reasons.push("Focus quality " + Math.round(droplet.focus * 100) + " %, workable but soft");
      hints.push("A small focus adjustment would improve the position tracking.");
    }

    /* speed — a proxy for size, and the thing that decides precision */
    const v = Math.abs(droplet.vy);
    if (v < SLOW_BAD) {
      score = 0;
      reasons.push("Moving at only " + (v * 1e6).toFixed(1) +
                   " um/s — Brownian motion will dominate the velocity fit");
      hints.push("Larger droplets fall faster and are far easier to measure: " +
                 "the relative Brownian error grows as the radius to the power -5/2.");
    } else if (v < SLOW_WARN) {
      score = Math.min(score, 1);
      reasons.push("Moving at " + (v * 1e6).toFixed(1) + " um/s — slow; expect a wide interval");
      hints.push("Track for longer, or find a faster droplet. Uncertainty falls as the " +
                 "square root of the observation time.");
    }

    /* room to run — a track needs the droplet to stay in the region */
    const gap = world.geom.plateGap;
    const clearance = Math.min(droplet.y, gap - droplet.y);
    if (clearance < 5e-4) {
      score = 0;
      reasons.push("Only " + (clearance * 1000).toFixed(2) + " mm from a plate");
      hints.push("Too close to a plate to complete a track inside the calibrated region.");
    } else {
      /* will it survive a track of the usual length? */
      const runway = (droplet.vy < 0 ? droplet.y : gap - droplet.y) - 3e-4;
      const seconds = v > 0 ? runway / v : Infinity;
      if (seconds < 8) {
        score = Math.min(score, 1);
        reasons.push("About " + seconds.toFixed(0) + " s of travel before it leaves the region");
        hints.push("Consider reversing the field to bring it back, or pick a droplet " +
                   "with more room to run.");
      }
    }

    if (!droplet.visible) {
      score = 0;
      reasons.push("Not currently visible");
    }

    return {
      level: score === 2 ? "good" : score === 1 ? "marginal" : "poor",
      label: score === 2 ? "Suitable" : score === 1 ? "Usable, with caution" : "Unsuitable",
      reasons: reasons, hints: hints,
      focus: droplet.focus, speed: v,
      note: "Judged from what the instrument can see: sharpness, speed and " +
            "position. Nothing here refers to the droplet's charge or to your estimate."
    };
  }

  /* =================================================================
     5. THE MEASUREMENT RECORD
     ============================================================== */

  /**
   * Build a DerivedMeasurement. Status starts as "candidate"; the user
   * decides. Nothing here can delete anything.
   */
  function makeMeasurement(derived, fallObs, fieldObs, q, ruleFails, uncert, ctx) {
    return {
      measId: nextMeasId(),
      dropletId: fallObs.dropletId,
      fallObsId: fallObs.obsId,
      fieldObsId: fieldObs.obsId,
      method: {
        name: "combined-fall-and-field",
        version: "1.0",
        slipModel: derived.environment.slipModel
      },
      vFall: derived.vFall, seVFall: derived.seVFall,
      vField: derived.vField, seVField: derived.seVField,
      vSigned: derived.vSigned,
      regime: derived.regime,
      balancingVoltage: derived.regime === "balanced" ? derived.environment.V : null,
      radius: derived.radius, uRadius: uncert ? uncert.uRadius : NaN,
      charge: derived.charge, uCharge: uncert ? uncert.uCharge : NaN,
      solver: derived.solver,
      environment: derived.environment,
      wEff: derived.wEff,
      quality: q,
      ruleFails: ruleFails,
      status: "candidate",
      rejectionReason: null,
      rejectionNote: "",
      followedPreregRule: null,
      decisionAt: null,
      estimateViewedBeforeDecision: ctx ? !!ctx.estimateViewed : false,
      protocolVersion: fallObs.protocolVersion,
      calibrationVersion: fallObs.calibrationVersion,
      notes: "",
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Record a decision. A rejection REQUIRES a reason; "other" requires a
   * written note. The measurement is never removed from the dataset.
   */
  function decide(meas, status, reason, note, ctx) {
    const valid = ["accepted", "accepted_caution", "rejected", "unresolved"];
    if (valid.indexOf(status) < 0) throw new Error("Unknown status: " + status);
    if (status === "rejected") {
      if (!reason || REJECTION_REASONS.indexOf(reason) < 0) {
        throw new Error("A rejection requires a reason from the permitted list.");
      }
      if (reason === "other" && (!note || note.trim().length < 10)) {
        throw new Error("Rejection reason 'other' requires a written explanation.");
      }
    }
    meas.status = status;
    meas.rejectionReason = (status === "rejected") ? reason : null;
    meas.rejectionNote = note || "";
    meas.decisionAt = new Date().toISOString();
    meas.estimateViewedBeforeDecision = ctx ? !!ctx.estimateViewed : false;
    const ruleSaysReject = meas.ruleFails && meas.ruleFails.length > 0;
    const userRejected = (status === "rejected");
    meas.followedPreregRule = (ruleSaysReject === userRejected);
    return meas;
  }

  const API = {
    TRACK_HZ: TRACK_HZ,
    REJECTION_REASONS: REJECTION_REASONS, REASON_LABEL: REASON_LABEL,
    DEFAULT_RULES: DEFAULT_RULES,
    resetIds: resetIds,
    startTrack: startTrack, sample: sample, stopTrack: stopTrack,
    fitVelocity: fitVelocity,
    derive: derive, quality: quality, checkRules: checkRules,
    makeMeasurement: makeMeasurement, decide: decide,
    suitability: suitability, SLOW_WARN: SLOW_WARN, SLOW_BAD: SLOW_BAD,
    snapshotInstrument: snapshotInstrument
  };

  if (isNode) module.exports = API;
  root.FC = root.FC || {};
  root.FC.measurement = API;

})(typeof globalThis !== "undefined" ? globalThis : this);
