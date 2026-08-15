# Reproducibility

Version 0.1.0-milestone1. Implemented in `src/prng.js`.

---

## 1. PRNG

`sfc32`, a 32-bit four-state counter-based generator, seeded from a `cyrb128`
hash of the string `"<seed>:<streamName>"`. Chosen because it is integer-only
(no floating-point accumulation, so it is bit-identical across engines), fast,
and passes the usual small-state test batteries. It is not cryptographic and
does not need to be.

Gaussians: Box–Muller, with the spare value cached **per stream**, so consuming
an odd number of normals never desynchronises a stream.

## 2. Streams

Independent named streams, so that changing one part of the model does not
shift the numbers another part receives:

| stream | consumes |
|---|---|
| `droplets` | radius, depth, sign, neutrality, charge magnitude, lifetime |
| `brownian:<dropletId>` | one 2-D Gaussian pair per physics step, from birth |
| `measurement` | position noise, timing jitter, reading noise |
| `apparatus` | session error draws: `g_V`, `o_V`, scale gain, sensor biases, tilt |
| `drift` | slow random walks in `V`, `T`, `p` |
| `charge` | ionisation events and `Δn` |
| `environment` | disturbances |
| `mc:<measurementId>` | Monte Carlo uncertainty draws |
| `bootstrap` | resampling indices |

Per-droplet Brownian streams matter: they mean a droplet's trajectory depends
only on its own id and the seed, not on how many other droplets happen to be
alive, and not on the order the user looked at them.

## 3. What is reproducible

Given identical `seed`, `modelVersion`, apparatus profile, physics settings and
**user action sequence**, the simulation reproduces:

- the same droplets with the same radii and charges,
- the same trajectories at the same simulated times,
- the same session instrument errors,
- the same ionisation events,
- the same Monte Carlo and bootstrap intervals.

Frame rate, tab focus, window size and device do **not** affect any of this
(`RISK_REGISTER.md` R-T1, tested).

## 4. What breaks reproducibility

- **Changing `modelVersion`.** Any change to the *order* in which a stream is
  consumed invalidates old seeds. New droplet properties must be appended to the
  end of the draw order, never inserted. The version string is stored with every
  experiment so that a mismatch is detectable.
- **Different user actions.** Spraying at a different simulated time produces
  different droplets. This is correct: the apparatus is not on rails.

## 5. Cross-browser caveat

ECMA-262 does not require bit-identical results for `Math.exp`, `Math.log`,
`Math.pow` or `Math.sqrt` (`sqrt` is IEEE-exact in practice; the others are
not). The integrator uses `Math.exp`/`Math.expm1` and the slip correction uses
`Math.exp`, so **trajectories may differ in the last few ULP between engines**.

This has not been measured. The likely magnitude is ~1e-16 relative per step,
which over 10⁴ steps is far below any measurement resolution and cannot change a
scientific conclusion — but it does mean "bit-identical across browsers" is
**not** a claim this project makes. Recorded as `RISK_REGISTER.md` R-T2.

Within a single engine, replay is bit-identical, and that is what the
determinism test asserts.

## 6. Replay

An exported bundle contains the seed, the model version, the full parameter set
and the ordered action log. `Import bundle` re-runs the actions against the
seed. **Implemented for the physics and droplet state; not implemented for the
full UI action log** — currently the bundle records actions but the replay
driver is not written. `LIMITATIONS.md` L-8.
