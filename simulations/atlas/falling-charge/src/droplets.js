/* =====================================================================
   THE FALLING CHARGE — droplet generation and evolution
   ---------------------------------------------------------------------
   Ground truth (radius, integer charge count, charge) is written into a
   `truth` sub-object. Nothing outside src/persistence.js and the reveal
   panel is permitted to read it. See docs/DROPLET_MODEL.md.

   The charge model is q = n*e with n a signed integer sampled from a
   configurable distribution. Droplets are NOT tuned so that a user
   recovers e; a small unlucky sample genuinely fails.
   ===================================================================== */
(function (root) {
  "use strict";

  const isNode = (typeof module !== "undefined" && module.exports);
  const U = isNode ? require("./units.js")   : root.FC.units;
  const P = isNode ? require("./physics.js") : root.FC.physics;

  /* ---------------------------------------------------------------
     Default population parameters.
     EVERY ONE OF THESE IS "NOT YET CALIBRATED" — they are modelling
     choices, not measured properties of any atomiser. See
     docs/PARAMETER_REGISTER.md §7.
     ------------------------------------------------------------ */
  const DEFAULTS = {
    rMedian:      5.5e-7,   // m    log-normal median radius
    rSigmaG:      1.45,     // -    geometric standard deviation
    rMin:         2.0e-7,   // m
    rMax:         1.5e-6,   // m
    pNeutral:     0.12,     // -    fraction with n = 0
    pNegative:    0.80,     // -    fraction of charged droplets that are negative
    nExponent:    1.35,     // -    P(|n| = k) proportional to k^-nExponent
    nMax:         12,       // -    largest |n| generated
    ionHazard:    2.0e-3,   // 1/s  spontaneous charge-change rate
    lifetimeMean: 240,      // s    mean time before leaving the region
    depthSigma:   6.0e-4    // m    spread of droplets about the focal plane
  };

  let counter = 0;

  /** Reset the id counter. Used by tests and by starting a new experiment. */
  function resetIds() { counter = 0; }

  function nextId() {
    counter += 1;
    return "D-" + String(counter).padStart(4, "0");
  }

  /* ---------------------------------------------------------------
     Charge magnitude weights: P(|n| = k) proportional to k^-exponent
     ------------------------------------------------------------ */
  function magnitudeWeights(nMax, exponent) {
    const w = [];
    for (let k = 1; k <= nMax; k++) w.push(Math.pow(k, -exponent));
    return w;
  }

  /**
   * Sample one droplet's hidden truth.
   *
   * DRAW ORDER IS PART OF THE SEED CONTRACT. New properties must be
   * appended at the end, never inserted. docs/REPRODUCIBILITY.md §4.
   *
   * @param {Stream} rng          the "droplets" stream
   * @param {object} cfg          population parameters
   * @param {number} eHidden      the elementary charge used to build q
   * @param {object|null} synth   optional falsification scenario
   */
  function sampleTruth(rng, cfg, eHidden, synth) {
    /* 1. radius, log-normal, truncated by rejection */
    const lnMed = Math.log(cfg.rMedian);
    const lnSig = Math.log(cfg.rSigmaG);
    let r = 0, tries = 0, clamped = false;
    do {
      r = Math.exp(rng.gauss(lnMed, lnSig));
      tries++;
    } while ((r < cfg.rMin || r > cfg.rMax) && tries < 100);
    if (r < cfg.rMin || r > cfg.rMax) {
      r = Math.min(cfg.rMax, Math.max(cfg.rMin, r));
      clamped = true;
    }

    /* 2. optical depth relative to the nominal focal plane */
    const depth = rng.gauss(0, cfg.depthSigma);

    /* 3. sign, 4. neutrality, 5. magnitude */
    const negative = rng.bernoulli(cfg.pNegative);
    const neutral = rng.bernoulli(cfg.pNeutral);
    const kIndex = rng.weighted(magnitudeWeights(cfg.nMax, cfg.nExponent));
    const n = neutral ? 0 : (negative ? -1 : 1) * (kIndex + 1);

    /* 6. lifetime */
    const lifetime = -cfg.lifetimeMean * Math.log(1 - rng.uniform());

    /* 7. ionisation phase — drawn now so the hazard is deterministic */
    const ionPhase = rng.uniform();

    /* 8. the charge itself */
    let charge = n * eHidden;
    let anomalous = false;
    if (synth && synth.fraction > 0 && rng.bernoulli(synth.fraction) && n !== 0) {
      anomalous = true;
      if (synth.type === "F-thirds") {
        charge = (n + (rng.bernoulli(0.5) ? 1 / 3 : -1 / 3)) * eHidden;
      } else {                                   // "F-uniform"
        charge = (n + rng.range(-0.5, 0.5)) * eHidden;
      }
    }

    return { radius: r, n: n, charge: charge, depth: depth,
             lifetime: lifetime, ionPhase: ionPhase,
             clamped: clamped, anomalous: anomalous };
  }

  /**
   * Create a droplet. `truth` is separated by the caller into the vault;
   * this function returns both halves so persistence can split them.
   */
  function create(rng, cfg, opts) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    const t = sampleTruth(rng, cfg, opts.eHidden, opts.synthetic);
    const id = nextId();

    const truth = {
      id: id,
      radius: t.radius,
      n: t.n,
      charge: t.charge,
      rhoOil: opts.rhoOil,
      mass: P.mass(t.radius, opts.rhoOil),
      anomalous: t.anomalous,
      clamped: t.clamped
    };

    const droplet = {
      id: id,
      /* --- kinematics, upward-positive, origin at the lower plate --- */
      x: rng.range(-opts.chamberWidth * 0.35, opts.chamberWidth * 0.35),
      y: opts.entryY,
      vy: 0,
      depth: t.depth,
      brownianX: 0,
      brownianY: 0,
      /* --- lifecycle --- */
      tBirth: opts.now,
      lifetime: t.lifetime,
      /* --- optical --- */
      focus: 0,
      visible: false,
      /* --- state --- */
      evaporating: false,          // field exists; dynamics NOT implemented (L-9)
      ionPhase: t.ionPhase,
      pIonise: cfg.ionHazard,
      chargeEvents: [],
      measurements: [],
      status: "candidate",
      notes: "",
      /* --- cached derived quantities, refreshed when environment moves --- */
      _env: null
    };

    return { droplet: droplet, truth: truth };
  }

  /* ---------------------------------------------------------------
     Optical model. docs/DROPLET_MODEL.md §4.
     ------------------------------------------------------------ */

  /**
   * Focus quality in [0,1] for a droplet at `depth` when the microscope
   * is focused at `focalPlane`, with depth of field `w`.
   */
  function focusQuality(depth, focalPlane, w) {
    const dz = depth - focalPlane;
    return Math.exp(-(dz * dz) / (2 * w * w));
  }

  /**
   * Whether the droplet clears the visibility threshold. Small droplets
   * scatter less light, which is the origin of the selection effect in
   * LIMITATIONS.md L-2.
   */
  function signalStrength(focus, radius, rRef) {
    const s = radius / rRef;
    return focus * s * s;
  }

  /* ---------------------------------------------------------------
     Charge events. docs/DROPLET_MODEL.md §5.
     A charge change happens only through an explicit event.
     ------------------------------------------------------------ */

  const DELTA_N = [-2, -1, 1, 2];
  const DELTA_W = [1, 4, 4, 1];

  /**
   * Test the spontaneous ionisation hazard for one physics step.
   * @returns {number|null} deltaN, or null for no event
   */
  function spontaneousEvent(rng, droplet, h) {
    const p = 1 - Math.exp(-droplet.pIonise * h);
    if (!rng.bernoulli(p)) return null;
    return DELTA_N[rng.weighted(DELTA_W)];
  }

  /** Operator ionisation pulse. */
  function pulseEvent(rng, pPulse) {
    if (!rng.bernoulli(pPulse)) return null;
    return DELTA_N[rng.weighted(DELTA_W)];
  }

  /**
   * Apply a charge change to a droplet's truth. Records the event on the
   * PUBLIC droplet so the analysis can know that *something happened*
   * without being told the new value.
   */
  function applyChargeEvent(droplet, truth, deltaN, eHidden, now, cause) {
    truth.n += deltaN;
    truth.charge = truth.n * eHidden;
    droplet.chargeEvents.push({ t: now, deltaN: deltaN, cause: cause });
    return truth;
  }

  const API = {
    DEFAULTS: DEFAULTS,
    resetIds: resetIds,
    create: create,
    sampleTruth: sampleTruth,
    magnitudeWeights: magnitudeWeights,
    focusQuality: focusQuality,
    signalStrength: signalStrength,
    spontaneousEvent: spontaneousEvent,
    pulseEvent: pulseEvent,
    applyChargeEvent: applyChargeEvent
  };

  if (isNode) module.exports = API;
  root.FC = root.FC || {};
  root.FC.droplets = API;

})(typeof globalThis !== "undefined" ? globalThis : this);
