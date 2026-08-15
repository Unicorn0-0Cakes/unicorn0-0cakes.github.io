/* =====================================================================
   THE FALLING CHARGE — the physical model
   ---------------------------------------------------------------------
   SIGN CONVENTION, fixed once and used everywhere (docs/PHYSICS_MODEL §1):

     y        positive UPWARD, metres, origin at the lower plate face
     v        dy/dt, positive upward. A falling droplet has v < 0.
     V_plate  potential of the UPPER plate minus the LOWER plate
     E_y      = -V_plate / d          (positive V puts the field downward)
     q        signed charge, coulombs

   Consequence, stated in the interface: a positive droplet in a positive
   field moves DOWN.

   This module has no DOM dependency and can be loaded in a Web Worker or
   in Node unchanged. It knows the true elementary charge only because it
   shares units.js; it never uses SI.e for anything except when a caller
   explicitly hands it a charge to simulate.
   ===================================================================== */
(function (root) {
  "use strict";

  const U = (typeof require !== "undefined" && typeof module !== "undefined")
    ? require("./units.js")
    : root.FC.units;

  const SI = U.SI, AIR = U.AIR;

  /* =================================================================
     1. ENVIRONMENT
     ============================================================== */

  /**
   * Dynamic viscosity of air by Sutherland's formula.
   * docs/PHYSICS_MODEL.md §7.1.  Source R-5 (secondary).
   * @param {number} T  kelvin
   * @returns {number}  Pa s
   */
  function viscosity(T) {
    return AIR.etaRef
      * Math.pow(T / AIR.tRef, 1.5)
      * (AIR.tRef + AIR.S) / (T + AIR.S);
  }

  /**
   * Density of dry air from the ideal gas law. docs/PHYSICS_MODEL.md §7.2.
   * @param {number} p  pascals
   * @param {number} T  kelvin
   * @returns {number}  kg m^-3
   */
  function airDensity(p, T) {
    return p * SI.Mair / (SI.R * T);
  }

  /**
   * Mean free path from kinetic theory, kept consistent with the
   * viscosity model rather than hard-coded. docs/PHYSICS_MODEL.md §7.3.
   * Note the literature disagreement recorded in LIMITATIONS.md L-6.
   * @returns {number} metres
   */
  function meanFreePath(p, T) {
    return (viscosity(T) / p) * Math.sqrt(Math.PI * SI.R * T / (2 * SI.Mair));
  }

  /* =================================================================
     2. SLIP CORRECTION
     ============================================================== */

  /**
   * Cunningham slip correction factor.
   *   C_c = 1 + Kn (alpha + beta exp(-gamma/Kn)),  Kn = lambda / r
   * docs/CUNNINGHAM_CORRECTION.md. Kn uses the RADIUS, not the diameter.
   * @param {number} r        droplet radius, m
   * @param {number} lambda   mean free path, m
   * @param {object|null} c   coefficient set, or null for ordinary Stokes
   * @returns {number}        dimensionless, >= 1
   */
  function slipCorrection(r, lambda, c) {
    if (!c || c.alpha === null || c.alpha === undefined) return 1;
    const Kn = lambda / r;
    return 1 + Kn * (c.alpha + c.beta * Math.exp(-c.gamma / Kn));
  }

  function knudsen(r, lambda) { return lambda / r; }

  /* =================================================================
     3. FORCES
     ============================================================== */

  /** Sphere volume, m^3. */
  function volume(r) { return (4 / 3) * Math.PI * r * r * r; }

  /** Droplet mass, kg. */
  function mass(r, rhoOil) { return rhoOil * volume(r); }

  /**
   * Effective downward weight, gravity minus buoyancy.
   *   W_eff = (rho_oil - rho_air) (4/3) pi r^3 g          [N, magnitude]
   * Returned as a POSITIVE magnitude; the sign is applied by the caller
   * per the convention at the top of this file.
   */
  function effectiveWeight(r, rhoOil, rhoAir) {
    return (rhoOil - rhoAir) * volume(r) * SI.g;
  }

  /**
   * Electric field between ideal parallel plates, upward-positive.
   *   E_y = -V_plate / d
   * @returns {number} V m^-1, signed
   */
  function fieldY(vPlate, d) { return -vPlate / d; }

  /**
   * Drag coefficient b, such that F_drag_y = -b * v.
   *   b = 6 pi eta r / C_c                                [kg s^-1]
   */
  function dragCoefficient(r, eta, Cc) {
    return 6 * Math.PI * eta * r / Cc;
  }

  /**
   * Net constant (non-drag) force in the upward-positive convention.
   *   F = -W_eff + q E_y                                  [N]
   */
  function constantForceY(q, vPlate, d, wEff) {
    return -wEff + q * fieldY(vPlate, d);
  }

  /**
   * Terminal velocity, upward-positive. docs/PHYSICS_MODEL.md §3.
   *   v_inf = (-W_eff + q E_y) / b
   */
  function terminalVelocity(q, vPlate, d, wEff, b) {
    return constantForceY(q, vPlate, d, wEff) / b;
  }

  /** Velocity relaxation time, seconds. tau = m / b. */
  function relaxationTime(m, b) { return m / b; }

  /** Reynolds number, for the domain-validity flag. */
  function reynolds(r, rhoAir, v, eta) {
    return 2 * r * rhoAir * Math.abs(v) / eta;
  }

  /* =================================================================
     4. BROWNIAN MOTION
     ============================================================== */

  /**
   * Stokes-Einstein diffusion coefficient with slip.
   *   D = kB T C_c / (6 pi eta r)                         [m^2 s^-1]
   * docs/BROWNIAN_MOTION.md §2.
   */
  function diffusionCoefficient(r, T, eta, Cc) {
    return SI.kB * T * Cc / (6 * Math.PI * eta * r);
  }

  /** Standard deviation of the diffusive displacement over time h. */
  function brownianSigma(D, h) { return Math.sqrt(2 * D * h); }

  /**
   * One Brownian displacement, metres. Overdamped model: the step is a
   * zero-mean Gaussian of standard deviation sqrt(2 D h), added to the
   * deterministic position. docs/BROWNIAN_MOTION.md §2.
   * @param {Stream} rng  the per-droplet "brownian:<id>" stream
   */
  function brownianStep(rng, D, h) {
    return rng.gauss(0, brownianSigma(D, h));
  }

  /* =================================================================
     5. INTEGRATION
     ---------------------------------------------------------------
     Exact exponential update. The ODE is linear in v, so over a step
     with constant forces the solution is closed-form and this is exact
     to floating point at ANY step size, and unconditionally stable.
     docs/PHYSICS_MODEL.md §5.
     ============================================================== */

  /**
   * Advance one droplet by h seconds of simulated time.
   *
   * @param {object} st   {y, v}  mutated in place
   * @param {object} env  {q, vPlate, d, wEff, b, m, D}
   * @param {number} h    step, s
   * @param {number} xiY  Brownian displacement for this step, m (0 to disable)
   * @returns {object}    the same state object
   */
  function step(st, env, h, xiY) {
    const vInf = constantForceY(env.q, env.vPlate, env.d, env.wEff) / env.b;
    const tau = env.m / env.b;
    const x = h / tau;

    let decay, oneMinus;
    if (x > 40) {                 // exp underflows harmlessly
      decay = 0; oneMinus = 1;
    } else {
      decay = Math.exp(-x);
      oneMinus = -Math.expm1(-x); // = 1 - exp(-x), accurate for small x
    }

    const dv = st.v - vInf;
    st.y = st.y + vInf * h + dv * tau * oneMinus + (xiY || 0);
    st.v = vInf + dv * decay;
    return st;
  }

  /**
   * Terminal-velocity mode: place the droplet on v_inf directly and
   * translate. Selectable, recorded in the manifest, and identical in
   * distribution to the exponential update once transients have died.
   */
  function stepTerminal(st, env, h, xiY) {
    st.v = constantForceY(env.q, env.vPlate, env.d, env.wEff) / env.b;
    st.y = st.y + st.v * h + (xiY || 0);
    return st;
  }

  /* =================================================================
     6. THE INVERSIONS — what the USER's analysis runs
     ---------------------------------------------------------------
     These take only quantities an experimenter could have measured.
     They never see a droplet object and never see a true charge.
     ============================================================== */

  /**
   * Radius from field-off terminal fall speed.
   *
   *   Stokes:     r = sqrt( 9 eta v_f / (2 g (rho_oil - rho_air)) )
   *   With slip:  r^2 C_c(r) = that same quantity, solved numerically.
   *
   * docs/PHYSICS_MODEL.md §4.1.
   *
   * @param {number} vFall   fall SPEED (positive), m/s
   * @param {number} eta     Pa s
   * @param {number} rhoOil  kg/m^3
   * @param {number} rhoAir  kg/m^3
   * @param {number} lambda  mean free path, m
   * @param {object|null} slip  coefficient set, null for ordinary Stokes
   * @returns {object} {radius, rStokes, Cc, Kn, iterations, residual, converged}
   */
  function solveRadius(vFall, eta, rhoOil, rhoAir, lambda, slip) {
    const dRho = rhoOil - rhoAir;
    if (!(vFall > 0) || !(dRho > 0) || !(eta > 0)) {
      return { radius: NaN, rStokes: NaN, Cc: NaN, Kn: NaN,
               iterations: 0, residual: NaN, converged: false,
               note: "non-physical inputs" };
    }

    const rStokes2 = 9 * eta * vFall / (2 * SI.g * dRho);
    const rStokes = Math.sqrt(rStokes2);

    if (!slip || slip.alpha === null || slip.alpha === undefined) {
      return { radius: rStokes, rStokes: rStokes, Cc: 1,
               Kn: lambda / rStokes, iterations: 0, residual: 0,
               converged: true, note: "closed form (ordinary Stokes)" };
    }

    /* f(r) = r^2 C_c(r) - rStokes^2 is strictly increasing on (0, rStokes],
       f(rStokes) > 0 because C_c > 1, and f -> 0+ from below as r -> 0.
       Bisect. Monotonicity is verified numerically in tests/test-physics.js
       rather than trusted from the algebra. */
    let lo = rStokes * 1e-4, hi = rStokes, mid = 0, fm = 0, i = 0;
    const TOL = 1e-12;
    for (i = 0; i < 200; i++) {
      mid = 0.5 * (lo + hi);
      fm = mid * mid * slipCorrection(mid, lambda, slip) - rStokes2;
      if (fm > 0) hi = mid; else lo = mid;
      if ((hi - lo) / mid < TOL) break;
    }
    const Cc = slipCorrection(mid, lambda, slip);
    return {
      radius: mid, rStokes: rStokes, Cc: Cc, Kn: lambda / mid,
      iterations: i + 1, residual: fm, converged: Math.abs(fm) < rStokes2 * 1e-9,
      note: "bisection on r^2 C_c(r) = 9 eta v_f / (2 g dRho)"
    };
  }

  /**
   * Charge from a field-off fall and a field-on terminal velocity, the
   * unified inversion of docs/PHYSICS_MODEL.md §4.2.
   *
   *   q = -6 pi eta r d (v_f - v_s) / (C_c V_plate)
   *
   * @param {number} vFall    field-off fall SPEED, positive, m/s
   * @param {number} vSigned  field-on velocity as a DOWNWARD-POSITIVE speed:
   *                          +ve = still falling, 0 = balanced, -ve = rising
   * @param {number} r        radius from solveRadius, m
   * @param {number} Cc       slip factor at that radius
   * @param {number} eta, d, vPlate
   * @returns {number} signed charge, coulombs
   */
  function chargeFromVelocities(vFall, vSigned, r, Cc, eta, d, vPlate) {
    if (vPlate === 0) return NaN;
    return -6 * Math.PI * eta * r * d * (vFall - vSigned) / (Cc * vPlate);
  }

  /**
   * Charge from balanced suspension — the special case v_s = 0.
   *   q = -W_eff d / V_plate
   * Kept as its own function because it is the form users expect to see,
   * and because it lets the interface show that the two agree.
   */
  function chargeFromBalance(wEff, d, vPlate) {
    if (vPlate === 0) return NaN;
    return -wEff * d / vPlate;
  }

  /* =================================================================
     7. CONVENIENCE — build the per-droplet environment
     ============================================================== */

  /**
   * Assemble everything the integrator needs for one droplet under the
   * CURRENT TRUE conditions. Used by the forward model only.
   */
  function makeEnv(opts) {
    const eta = viscosity(opts.T);
    const rhoAir = airDensity(opts.p, opts.T);
    const lambda = meanFreePath(opts.p, opts.T);
    const Cc = slipCorrection(opts.r, lambda, opts.slip);
    const b = dragCoefficient(opts.r, eta, Cc);
    const m = mass(opts.r, opts.rhoOil);
    const wEff = effectiveWeight(opts.r, opts.rhoOil, rhoAir);
    return {
      q: opts.q, vPlate: opts.vPlate, d: opts.d,
      wEff: wEff, b: b, m: m,
      eta: eta, rhoAir: rhoAir, lambda: lambda, Cc: Cc,
      D: diffusionCoefficient(opts.r, opts.T, eta, Cc),
      tau: m / b
    };
  }

  const API = {
    viscosity: viscosity, airDensity: airDensity, meanFreePath: meanFreePath,
    slipCorrection: slipCorrection, knudsen: knudsen,
    volume: volume, mass: mass, effectiveWeight: effectiveWeight,
    fieldY: fieldY, dragCoefficient: dragCoefficient,
    constantForceY: constantForceY, terminalVelocity: terminalVelocity,
    relaxationTime: relaxationTime, reynolds: reynolds,
    diffusionCoefficient: diffusionCoefficient, brownianSigma: brownianSigma,
    brownianStep: brownianStep,
    step: step, stepTerminal: stepTerminal,
    solveRadius: solveRadius,
    chargeFromVelocities: chargeFromVelocities,
    chargeFromBalance: chargeFromBalance,
    makeEnv: makeEnv
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.FC = root.FC || {};
  root.FC.physics = API;

})(typeof globalThis !== "undefined" ? globalThis : this);
