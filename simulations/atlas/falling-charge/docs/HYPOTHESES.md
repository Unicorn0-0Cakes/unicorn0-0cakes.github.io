# Hypotheses

These are **simulation hypotheses** — statements about how this model and the
people using it are expected to behave. They are not predetermined conclusions,
and several of them are currently untested because the machinery that would
test them (batch mode, Mode F, Mode G) is not yet implemented. Test status is
recorded honestly below.

Version 0.1.0-milestone1.

---

## H1 — Charge quantisation

Measured droplet charges will cluster around integer multiples of one common
elementary charge when the apparatus is correctly calibrated and an appropriate
drag model is used.

- **Prediction:** the residuals `qᵢ − nᵢê` from the candidate-lattice fit are
  consistent with the per-measurement uncertainties `σ_qᵢ`, i.e. reduced χ² ≈ 1.
- **Would falsify:** residuals structurally larger than `σ_q`, or residual
  structure that varies with `n`, radius, or voltage.
- **Test status:** *partially tested.* Noiseless recovery is covered by
  `tests/test-inference.js`. Reduced-χ² calibration under realistic noise is
  **not yet tested** — requires batch mode.

## H2 — Model comparison

The quantised-charge model will provide a better penalised fit than a
continuous arbitrary-charge model under normal experimental conditions.

- **Prediction:** ΔBIC favours Model Q by a margin that grows with `N` on
  quantised data, and favours Model C on continuous synthetic data.
- **Would falsify:** Model Q winning on data generated *without* quantisation —
  which would mean the comparison is rigged by construction, the most important
  failure mode to watch for. See `RISK_REGISTER.md` R-S6.
- **Test status:** **not implemented.** Model comparison is Milestone 4.

## H3 — Sample size and random error

Increasing the number of independently measured droplets reduces random
uncertainty in the inferred elementary charge.

- **Prediction:** `sd(ê) ∝ N^(−1/2)` across batch replications.
- **Test status:** **not implemented.** Requires Mode G.

## H4 — Systematic uncertainty is not cured by N

Increasing sample size will not eliminate bias caused by incorrect viscosity,
plate spacing, voltage calibration, temperature, pressure, or slip correction.

- **Prediction:** under a fixed miscalibration, `bias(ê)` is flat in `N` while
  `sd(ê)` falls, so interval coverage *degrades* as N grows — the most
  counter-intuitive and most important result the instrument can show.
- **Test status:** **not implemented.** Requires Mode G. The analytic
  expectation is derived in `UNCERTAINTY_ANALYSIS.md` §4 and can be checked by
  hand today.

## H5 — Transparent quality control

Preregistered measurement-quality criteria will produce more reproducible
results than discretionary, outcome-aware exclusion.

- **Prediction:** across users/seeds, the spread of `ê` under preregistered
  rules is smaller than under outcome-aware exclusion, *and* interval coverage
  is closer to nominal, even where outcome-aware exclusion produces a smaller
  mean absolute error.
- **Note:** outcome-aware exclusion is expected to produce estimates *closer*
  to the truth on average, because the user is steering toward it. The point is
  that its intervals will be dishonest. The interface must report both.
- **Test status:** **not implemented.** Requires Mode F and Mode G.

## H6 — Brownian motion

Brownian motion contributes more relative measurement uncertainty for smaller
droplets and shorter observation intervals.

- **Prediction:** the relative velocity uncertainty from diffusion scales as
  `√(2D t) / (v t)`, i.e. as `t^(−1/2)` and, since `D/v` grows as droplets
  shrink, strongly with decreasing radius. Derived in `BROWNIAN_MOTION.md` §3.
- **Test status:** *implemented in the model, not yet tested numerically.*

## H7 — Model fidelity (slip correction)

Ignoring the Cunningham slip correction creates a detectable size-dependent
bias when droplet radii approach the regime where ordinary Stokes drag is
insufficient.

- **Prediction:** with slip ignored in analysis but present in the world,
  residuals `qᵢ − nᵢê` correlate with estimated radius, and `ê` is biased
  upward, with the bias increasing for smaller droplets.
- **Test status:** *implemented both ways* (`slipModel: "none" | "allen-raabe"`),
  **bias magnitude not yet measured.** Requires Mode G.

## H8 — Blind analysis

Users who cannot see the accepted value during collection and analysis will
produce less outcome-directed exclusion behaviour than users who can.

- **Prediction:** the exclusion-order timeline will show fewer exclusions
  occurring after intermediate estimates are viewed, in blind mode.
- **Test status:** **not testable by this software alone.** This is a hypothesis
  about users, and would require a study with human participants. The
  instrument records the data that such a study would need (exclusion
  timestamps relative to first estimate view) but makes no claim about it.

---

## Summary of test status

| Hypothesis | Machinery implemented | Result available |
|---|---|---|
| H1 quantisation | partial | noiseless recovery only |
| H2 model comparison | no | no |
| H3 sample size | no | no |
| H4 systematic bias | no | no |
| H5 QC policy | no | no |
| H6 Brownian | model yes, test no | no |
| H7 slip correction | model yes, test no | no |
| H8 blind analysis | logging yes | not testable in software |

No hypothesis in this table is currently confirmed by this software.
