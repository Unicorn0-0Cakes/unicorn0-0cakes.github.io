"use strict";
const T = require("./harness.js");
const U = require("../src/units.js");
const P = require("../src/physics.js");
const R = require("../src/prng.js");

module.exports = function () {
  T.suite("Numerical stability");

  const T0 = 293.15, p0 = 101325, rhoOil = 886, d = 6e-3, r = 5e-7;
  const slip = U.SLIP["allen-raabe-1982"];
  const q = -2 * U.SI.e;
  const env = P.makeEnv({ r, q, vPlate: 0, d, T: T0, p: p0, rhoOil, slip });

  T.ok(env.tau < 1e-4, "the relaxation time is microseconds, so the system is stiff (τ = " +
       env.tau.toExponential(2) + " s)");

  /* 100 000 steps at a big step-to-tau ratio: an explicit scheme would explode */
  let st = { y: 3e-3, v: 0 };
  let finite = true, bounded = true;
  for (let i = 0; i < 100000; i++) {
    P.step(st, env, 2e-3, 0);
    if (!isFinite(st.y) || !isFinite(st.v)) { finite = false; break; }
  }
  T.ok(finite, "100 000 steps produce no NaN and no infinity");

  /* near balance — the case that breaks naive integrators */
  const Vbal = -env.wEff * d / q;
  const envBal = P.makeEnv({ r, q, vPlate: Vbal, d, T: T0, p: p0, rhoOil, slip });
  st = { y: 3e-3, v: 0 };
  let maxV = 0;
  for (let i = 0; i < 100000; i++) {
    P.step(st, envBal, 2e-3, 0);
    maxV = Math.max(maxV, Math.abs(st.v));
  }
  T.ok(isFinite(st.y) && isFinite(st.v), "no divergence over 100 000 steps at balance");
  T.ok(maxV < 1e-12, "velocity stays at zero at the balance point rather than oscillating");
  T.near(st.y, 3e-3, 1e-9, "a balanced droplet does not drift when Brownian motion is off");

  /* the exact solution: step size must not matter for constant forces */
  const one = { y: 0, v: 0 };
  P.step(one, env, 1.0, 0);
  const many = { y: 0, v: 0 };
  for (let i = 0; i < 1000; i++) P.step(many, env, 1e-3, 0);
  T.near(many.y, one.y, 1e-9, "one 1 s step equals a thousand 1 ms steps (integrator is exact)");
  T.near(many.v, one.v, 1e-9, "the same holds for velocity");

  /* The terminal-velocity mode differs from the exact integrator by exactly
     the initial transient: a droplet released from rest travels tau*v_inf
     less far than one already moving at terminal velocity. That difference
     is physical, not numerical, so the test asserts its SIZE rather than
     pretending the two agree. */
  const tv = { y: 0, v: P.terminalVelocity(q, 0, d, env.wEff, env.b) };
  P.stepTerminal(tv, env, 1.0, 0);
  const transient = Math.abs(tv.y - one.y);
  T.near(transient, env.tau * Math.abs(tv.v), 1e-6,
         "terminal mode differs from the exact integrator by exactly tau*v_inf, " +
         "the transient a droplet released from rest never travels");
  T.ok(transient / Math.abs(one.y) < 1e-5,
       "that transient is under 10 ppm of a one-second displacement, which is " +
       "why the terminal-velocity approximation is legitimate here");

  T.suite("Brownian motion is step-size invariant in distribution");
  const D = env.D;
  const s = new R.Streams("brownian");
  function walk(nSteps, h) {
    const rng = s.get("w" + nSteps + "_" + h);
    let sum2 = 0;
    for (let k = 0; k < 400; k++) {
      let x = 0;
      for (let i = 0; i < nSteps; i++) x += P.brownianStep(rng, D, h);
      sum2 += x * x;
    }
    return Math.sqrt(sum2 / 400);
  }
  const coarse = walk(10, 0.1), fine = walk(1000, 0.001);
  const expect = Math.sqrt(2 * D * 1.0);
  T.ok(Math.abs(coarse / expect - 1) < 0.15,
       "10 steps of 0.1 s reproduce √(2Dt) over 1 s (got " + coarse.toExponential(2) + ")");
  T.ok(Math.abs(fine / expect - 1) < 0.15,
       "1000 steps of 1 ms reproduce the same distribution");

  T.suite("Determinism and frame-rate independence");
  function run(chunkSizes) {
    const str = new R.Streams("determinism");
    const rng = str.get("brownian:D-0001");
    const state = { y: 3e-3, v: 0 };
    chunkSizes.forEach(function (n) {
      for (let i = 0; i < n; i++) P.step(state, env, 2e-3, P.brownianStep(rng, D, 2e-3));
    });
    return state;
  }
  /* the same 1000 simulated steps, delivered in wildly different frame chunks */
  const a = run([1000]);
  /* the same 1000 steps split into 7s (and a remainder), and into 331s */
  const sevens = [];
  let left = 1000;
  while (left > 0) { const n = Math.min(7, left); sevens.push(n); left -= n; }
  const b = run(sevens);
  const c = run([331, 331, 331, 7]);
  T.ok(sevens.reduce((x, y) => x + y, 0) === 1000, "the chunked schedules total 1000 steps");
  T.ok(a.y === b.y && a.v === b.v,
       "1000 steps in one chunk are bit-identical to 143 chunks of 7");
  T.ok(a.y === c.y && a.v === c.v,
       "and identical again to chunks of 331 — frame rate cannot change the physics");

  T.suite("PRNG streams are independent and reproducible");
  const s1 = new R.Streams("x"), s2 = new R.Streams("x");
  T.ok(s1.get("a").uniform() === s2.get("a").uniform(), "the same seed and stream agree");
  const sA = new R.Streams("y");
  const first = sA.get("alpha").uniform();
  sA.get("beta").uniform(); sA.get("beta").uniform();
  const sB = new R.Streams("y");
  T.ok(sB.get("alpha").uniform() === first,
       "drawing from one stream does not disturb another");

  /* Box-Muller spare must not desynchronise on an odd number of draws */
  const o1 = new R.Streams("z").get("n");
  const o2 = new R.Streams("z").get("n");
  o1.normal(); o1.normal(); o1.normal();
  o2.normal(); o2.normal(); o2.normal();
  T.ok(o1.normal() === o2.normal(), "an odd number of normals does not desynchronise a stream");

  let allFinite = true;
  const g = new R.Streams("g").get("n");
  for (let i = 0; i < 100000; i++) { const v = g.normal(); if (!isFinite(v)) allFinite = false; }
  T.ok(allFinite, "100 000 Gaussians are all finite");
};
