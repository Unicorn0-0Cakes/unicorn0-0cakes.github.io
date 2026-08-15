# Uncertainty analysis

Version 0.1.0-milestone1. Implemented in `src/uncertainty.js`.

---

## 1. The separation that matters

| | random | systematic |
|---|---|---|
| behaves like | independent draw per measurement | one fixed offset for the whole session |
| reduced by more droplets | yes, as `N^{−1/2}` | **no** |
| shows up in | scatter of `qᵢ` about the lattice | shift of the whole lattice |
| detectable from the data alone | yes | **usually not** |

The last row is the point. A session can produce a beautiful integer ladder with
reduced χ² of 1.0 and be 4 % wrong, because every droplet was measured with the
same mis-scaled reticle. The instrument therefore reports two numbers and
refuses to add them into one without saying so.

## 2. Random sources modelled

Brownian motion · timing quantisation and jitter · position/centroid noise ·
focus-dependent localisation · finite observation duration · voltage reading
noise · (historical) reaction time variance.

## 3. Systematic sources modelled

| source | enters as | `∂ln q / ∂ln x` | status |
|---|---|---|---|
| air viscosity `η` | drag, twice | **+1.5** | modelled via `T` bias |
| reticle scale | velocities and radius | **+2.0** | modelled |
| plate spacing `d` | `q ∝ d` | +1.0 | modelled |
| voltage gain/offset | `q ∝ 1/V` | −1.0 | modelled |
| oil density `ρ_oil` | `W_eff`, and `r` | −0.5 | assumption, not measured |
| temperature bias | through `η` | ≈ +0.38 % per K | modelled |
| pressure bias | through `λ`, `C_c` | small, computed | modelled |
| slip correction omitted | `C_c` | size-dependent, ~+11 % at 0.5 µm | selectable |
| field non-uniformity | `E` | — | **not modelled** |
| evaporation | `r(t)` | — | **not modelled** |

The exponents in column 3 are derived in §7 and are *checked numerically* by the
sensitivity routine rather than trusted from the algebra.

## 4. Why coverage gets worse as N grows (H4)

With a fractional systematic `s` and random component `σ_r` per droplet:

```
ê ≈ e(1 + s) ± σ_r/√N
```

The interval half-width shrinks as `N^{−1/2}` but the centre stays at `e(1+s)`.
Coverage is the probability that `|ê − e| < k σ_r/√N`, which for fixed `s ≠ 0`
tends to **zero** as `N → ∞`. More data makes an uncorrected experiment more
confidently wrong. This is the single most useful thing the instrument can
teach, and it is why the reported interval must carry the systematic term
explicitly.

## 5. Propagation methods

### 5.1 Monte Carlo — implemented, and the default

For each measurement, `N_mc = 400` draws are made over the *user's declared*
input uncertainties (`v_f`, `v_s`, `d`, `V`, `T`, `p`, scale, `ρ_oil`), the full
inversion is re-run for each draw including the implicit radius solve, and
`σ_q` is the standard deviation of the resulting charges.

Chosen as the default because the radius inversion is implicit and nonlinear, so
analytic partials would require differentiating through a root-find. Monte Carlo
sidesteps that exactly.

The MC stream is seeded per measurement (`mc:<measurementId>`) so uncertainties
are reproducible.

### 5.2 Analytic propagation — **not implemented**

The first-order expressions are written out in §7 for review, and are used for
the *ranking* in the uncertainty budget, but the reported `σ_q` is the Monte
Carlo value. Reconciling the two is a Milestone 4 task.

### 5.3 Bootstrap over droplets — implemented

Non-parametric bootstrap resampling of accepted droplets, `B = 2000`, gives a
percentile interval for `ê`. This captures the random component including any
non-normality of the lattice assignment, which the χ² curvature does not.

### 5.4 Leave-one-droplet-out — implemented

`ê` recomputed with each droplet removed in turn. Feeds the exclusion-sensitivity
chart and identifies leverage points.

### 5.5 Sensitivity analysis — implemented

Each systematic parameter is perturbed by ±1 % (or ±1 σ where a σ is known) and
`ê` recomputed, giving the empirical elasticity. This is what populates the
uncertainty budget, so the budget is *computed from this model*, not asserted
from textbook rankings.

## 6. Reporting

```
ê = 1.61 × 10⁻¹⁹ C  ±  0.04 (random, 68 %)  ±  0.07 (systematic)
relative: 2.5 % random, 4.3 % systematic
dominant systematic: reticle scale calibration (46 % of variance)
```

Rules enforced by `src/units.js:formatWithUncertainty()`:

- the uncertainty is quoted to **one** significant figure (two if the leading
  digit is 1),
- the estimate is rounded to the same decade,
- no more figures are ever printed, anywhere, including in CSV exports of
  derived values (raw values are exported at full precision, separately),
- the confidence level is always stated,
- random and systematic are never silently summed.

## 7. First-order expressions (for review)

From `q = 6πηr d (v_f − v_s)/(C_c V)` with `r ∝ √(η v_f)` in the Stokes limit:

```
q ∝ η^{3/2} · v_f^{1/2} · (v_f − v_s) · d / V
```

hence, in the Stokes limit and ignoring `C_c`'s weak dependences:

| parameter | elasticity `∂ln q/∂ln x` |
|---|---|
| `η` | +3/2 |
| `d` | +1 |
| `V` | −1 |
| `ρ_oil − ρ_air` | −1/2 |
| length scale `L` (reticle) | +2 (both velocities scale, and `r ∝ √v`) |
| `g` | −1/2 |

The `+2` for reticle scale: `v_f ∝ L`, `v_s ∝ L`, `r ∝ √(v_f) ∝ √L`, so
`q ∝ √L · L = L^{3/2}`… **and** the fall distance used to get `v_f` is itself the
scaled quantity, so the correct total is `L^{3/2}` if only velocities scale.
The `+2` figure in §3 assumes the scale error also affects the plate-spacing
measurement when that is made with the same optics. **These two cases give
different exponents (3/2 vs 2) and the code computes the elasticity numerically
per configuration rather than picking one.** This discrepancy is flagged in
`RISK_REGISTER.md` R-S3 as a place where the documentation was initially loose
and the numerical sensitivity is the authority.
