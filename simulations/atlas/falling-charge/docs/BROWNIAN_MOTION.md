# Brownian motion

Version 0.1.0-milestone1. Implemented in `src/physics.js:brownianStep()`.

---

## 1. Regime

The velocity relaxation time is `τ = m/b ≈ 3 µs` (`PHYSICS_MODEL.md` §3.1),
while measurements last 5–30 s. The droplet is therefore deep in the
**overdamped** regime: over any interval the experimenter can resolve, inertia
has already been forgotten and the correct description is diffusion of
*position*, not a random force on velocity.

Modelling Brownian motion as a random force in a fine-timestep integrator would
be defensible but wasteful, and would require `Δt ≪ τ ≈ 3 µs` to be right — which
at 10⁻⁶ s steps would be about 10⁷ steps per observation. The
overdamped displacement model is exact in the limit that actually applies here.

---

## 2. The model

Stokes–Einstein diffusion coefficient, with the slip correction carried through
because the same mobility appears in both drag and diffusion:

```
D = k_B T C_c / (6 π η r)          [m² s⁻¹]
```

`k_B = 1.380 649 × 10⁻²³ J K⁻¹` (exact, SI since 2019).

Over a physics step of duration `h`, the vertical Brownian displacement is drawn
from a zero-mean Gaussian:

```
ξ ~ N( 0, σ² )        σ = √(2 D h)          [m]
```

added to the deterministic position update. Horizontal displacement is drawn
independently with the same `σ` and is used only for the focus/visibility model
and for lateral drift out of the field of view — it does not enter any
measurement.

Because the variance of a sum of independent Gaussian steps is the sum of the
variances, the displacement over a whole observation of duration `t` has
standard deviation `√(2Dt)` regardless of the step size chosen. The model is
therefore **step-size invariant in distribution**, which is asserted in
`tests/test-stability.js`.

Dependence on the four quantities the specification requires:

| quantity | enters through | direction |
|---|---|---|
| temperature `T` | `D ∝ T` (and weakly through `η(T)`) | warmer → noisier |
| viscosity `η` | `D ∝ 1/η` | thicker air → quieter |
| radius `r` | `D ∝ C_c(r)/r` | smaller → much noisier |
| interval `h` | `σ ∝ √h` | longer → larger absolute wander |

---

## 3. Effect on a velocity measurement (H6)

This is the result the instrument is built to let a user discover, so it is
derived rather than asserted.

A droplet moving at terminal speed `v` is tracked for time `t`. The measured
displacement is `v t + ξ` with `ξ ~ N(0, 2Dt)`. A two-point velocity estimate
has relative error

```
σ_v / v  =  √(2 D t) / (v t)  =  √(2D) / (v √t)
```

so:

- **Longer observations help**, as `t^{−1/2}`.
- **Smaller droplets are much worse.** `D ∝ C_c/r` while the fall speed
  `v ∝ r² C_c`, so `√D / v ∝ r^{−5/2} C_c^{−1/2}`. Halving the radius makes the
  relative Brownian error roughly **5.7 times worse**. This is why the
  instrument warns on very small droplets and why a user who selects only the
  slowest, prettiest droplets will quietly ruin their own dataset.

Worked number, `r = 0.5 µm`, `T = 293.15 K`, `t = 10 s`, `ρ_oil = 886`:
`D = 2.73 × 10⁻¹¹ m² s⁻¹`, `√(2Dt) = 23.3 µm`, `v = 30.6 µm s⁻¹`,
fall `= 306 µm`, so `σ_v/v ≈ 7.6 %`. At `r = 0.25 µm` the same 10 s gives
roughly 40 %.

**A correction to a natural intuition.** It is tempting to think that fitting a
line to 240 points beats a two-point estimate by a factor of order `√N`. For
*independent* noise it would. For a random walk it does not help at all: the
expression above is not the worst case, it is the right answer. This is why the
reported uncertainty barely improves when the sampling rate is raised, and
improves as `√T` when the observation is lengthened.

**The correlated-residual correction.** For a *diffusing* particle the tracked
positions are **not** independent — the noise is a random walk, so successive
residuals are correlated and adding samples does not add information about the
drift the way ordinary least squares assumes.

For pure Brownian motion the endpoints are a **sufficient statistic** for the
drift: the increments are independent, so `(y(T) − y(0))/T` is the
minimum-variance estimator and

```
Var(v) = 2D / T        se_Brownian = √(2D / T)
```

*independent of the number of samples taken*. `D` is estimated from the data
itself, from the mean squared increment of the residuals,
`D̂ = ⟨(Δr)²⟩ / (2Δt)`. The instrument reports the larger of `se_Brownian` and
the OLS value.

Measured on simulated tracks, `se_OLS` understates the true uncertainty by a
factor of **13 to 50**. On the worked case above, OLS gives 0.57 % where the
Brownian-aware value gives 7.64 % — which is the figure derived analytically in
this section. See `LIMITATIONS.md` L-1 for what the overconfident version broke
before it was fixed.

---

## 4. Determinism

Brownian displacements come from a per-droplet random stream
(`brownian:<dropletId>`), drawn in strict step order from the droplet's birth.
Since every live droplet is stepped exactly once per physics step and the
physics step count for a given simulated time is fixed
(`PHYSICS_MODEL.md` §5.3), the trajectory is reproducible from the seed alone,
independent of frame rate, tab focus, or when the user chose to look at it.

Gaussians are generated by Box–Muller with the spare value cached **per stream**,
so that consuming an odd number of draws does not desynchronise a stream.

---

## 5. Not modelled

- Rotational Brownian motion (irrelevant to a sphere's translation).
- Brownian contribution to charge measurement *via* the balance criterion is
  modelled implicitly, but the instrument does not yet compute a formal
  confidence interval for "is this droplet stationary" — the user's stated
  balance criterion is applied as a threshold on the fitted velocity and its
  standard error. Adequate, but cruder than the specification asks for.
- Correlated air currents, which look like Brownian motion but are not.
  A separate, currently unimplemented disturbance channel is reserved for them.
