"use strict";
const T = require("./harness.js");
const U = require("../src/units.js");
const P = require("../src/physics.js");

module.exports = function () {
  T.suite("Layer 1 — equations against hand-calculated reference cases");

  const T0 = 293.15, p0 = 101325, rhoOil = 886;
  const eta = P.viscosity(T0);
  const rhoAir = P.airDensity(p0, T0);
  const lam = P.meanFreePath(p0, T0);
  const slip = U.SLIP["allen-raabe-1982"];

  T.near(eta, 1.81332e-5, 1e-4, "η(293.15 K) = 1.81332e-5 Pa s");
  T.near(rhoAir, 1.2041, 1e-3, "ρ_air(101325 Pa, 293.15 K) = 1.2041 kg/m³");
  T.near(lam, 6.506e-8, 0.05, "λ = 6.5e-8 m, within 5 %");

  T.near(P.slipCorrection(1.0e-6, lam, slip), 1.0752, 1e-3, "C_c(r = 1.0 µm) = 1.0752");
  T.near(P.slipCorrection(5.0e-7, lam, slip), 1.1509, 1e-3, "C_c(r = 0.5 µm) = 1.1509");
  T.near(P.slipCorrection(2.0e-7, lam, slip), 1.4003, 1e-3, "C_c(r = 0.2 µm) = 1.4003");
  T.ok(P.slipCorrection(5e-7, lam, null) === 1, "C_c = 1 when the correction is disabled");

  const r = 5e-7;
  const W = P.effectiveWeight(r, rhoOil, rhoAir);
  T.near(W, 4.543e-15, 5e-3, "W_eff(r = 0.5 µm) = 4.543e-15 N");

  const Cc = P.slipCorrection(r, lam, slip);
  const b = P.dragCoefficient(r, eta, Cc);
  const vf = W / b;
  T.near(vf, 3.06e-5, 5e-3, "v_f(r = 0.5 µm) = 30.6 µm/s");

  /* balancing voltage for a doubly negative droplet, d = 6 mm */
  const q = -2 * U.SI.e, d = 6e-3;
  T.near(-W * d / q, 85.1, 0.01, "balancing voltage for n = −2 is 85.1 V");

  /* the monotonicity that guarantees the radius bisection converges */
  T.suite("Radius inversion");
  let mono = true, prev = -Infinity;
  for (let rr = 5e-8; rr < 5e-6; rr *= 1.05) {
    const v = rr * rr * P.slipCorrection(rr, lam, slip);
    if (v <= prev) mono = false;
    prev = v;
  }
  T.ok(mono, "r²·C_c(r) is strictly increasing over 0.05–5 µm, so the root is unique");

  const sol = P.solveRadius(vf, eta, rhoOil, rhoAir, lam, slip);
  T.near(sol.radius, r, 1e-9, "radius round trip r → v_f → r̂ is exact");
  T.ok(sol.converged, "the bisection reports convergence");
  T.ok(sol.iterations > 0 && sol.iterations < 200, "solver iterations are reported and bounded");
  T.ok(sol.rStokes > sol.radius, "the Stokes radius exceeds the slip-corrected radius");
  T.near(sol.rStokes, 5.364e-7, 1e-3, "Stokes radius for this fall speed is 0.5364 µm");

  const solNo = P.solveRadius(vf, eta, rhoOil, rhoAir, lam, null);
  T.near(solNo.radius, solNo.rStokes, 1e-12, "with no slip model the closed form is used");

  T.suite("Layer 1 — force balance and sign conventions");

  /* Procedure 1: field off, terminal fall */
  const env0 = P.makeEnv({ r, q, vPlate: 0, d, T: T0, p: p0, rhoOil, slip });
  const v0 = P.terminalVelocity(q, 0, d, env0.wEff, env0.b);
  T.ok(v0 < 0, "with the field off the droplet falls (v < 0, upward-positive axis)");
  T.near(-v0, vf, 1e-9, "the field-off terminal speed equals the analytic v_f");

  /* Procedure 2: balanced suspension */
  const Vbal = -env0.wEff * d / q;
  const vBal = P.terminalVelocity(q, Vbal, d, env0.wEff, env0.b);
  T.near(vBal, 0, 1e-6, "at the balancing voltage the terminal velocity is zero");

  /* Procedure 3: terminal rise */
  const vUp = P.terminalVelocity(q, Vbal * 2, d, env0.wEff, env0.b);
  T.ok(vUp > 0, "doubling the balancing voltage makes the droplet rise");

  /* Procedure 4: slowed fall */
  const vSlow = P.terminalVelocity(q, Vbal * 0.5, d, env0.wEff, env0.b);
  T.ok(vSlow < 0 && vSlow > v0, "half the balancing voltage slows the fall without reversing it");

  /* polarity reversal */
  const vRev = P.terminalVelocity(q, -Vbal, d, env0.wEff, env0.b);
  T.ok(vRev < v0, "reversing polarity drives a negative droplet down faster");

  /* a positive droplet in a positive field moves down — the stated consequence */
  const vPos = P.terminalVelocity(+2 * U.SI.e, 100, d, env0.wEff, env0.b);
  T.ok(vPos < 0, "a positive droplet in a positive field moves down");

  T.suite("Charge inversion");
  [["balance", 0], ["rise", -1], ["slowed fall", 0.5]].forEach(function (c) {
    const label = c[0];
    const V = (label === "balance") ? Vbal : (label === "rise" ? Vbal * 2 : Vbal * 0.5);
    const vinf = P.terminalVelocity(q, V, d, env0.wEff, env0.b);
    const vSigned = -vinf;
    const s2 = P.solveRadius(vf, eta, rhoOil, rhoAir, lam, slip);
    const qhat = P.chargeFromVelocities(vf, vSigned, s2.radius, s2.Cc, eta, d, V);
    T.near(qhat, q, 1e-8, "charge recovered exactly by " + label);
  });

  const qBal = P.chargeFromBalance(env0.wEff, d, Vbal);
  T.near(qBal, q, 1e-8, "the balance form q = −W d / V agrees with the unified inversion");

  T.suite("Domain-validity checks");
  T.ok(P.reynolds(r, rhoAir, vf, eta) < 0.01, "Reynolds number is far below 1 in the default regime");
  T.ok(P.knudsen(r, lam) > 0.1 && P.knudsen(r, lam) < 0.2, "Knudsen number is reported and plausible");
  const bad = P.solveRadius(-1, eta, rhoOil, rhoAir, lam, slip);
  T.ok(!bad.converged && !isFinite(bad.radius), "a non-physical fall speed is refused, not clamped");
};
