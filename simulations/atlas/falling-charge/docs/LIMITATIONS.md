# Limitations

What this instrument does not do, cannot do, or does badly. Kept as a numbered
list so other documents can cite entries.

**The overarching one:** this is a simulation. Data it produces are evidence
about this model, not about the physical world. No number here is a measurement
of anything. The instrument says so on the reveal screen and in every export.

---

**L-1 · Velocity standard errors — RESOLVED in this build.**
*Previously the most consequential known defect; now fixed, and the fix is worth
recording because of what it broke.*

Brownian residuals are a random walk, so tracked positions are correlated and
the ordinary least-squares standard error understates the velocity uncertainty.
Measured against simulated tracks, the understatement is a factor of **13 to
50**.

The consequences were not subtle. With a 10× overconfident `σ_v`, a **neutral**
droplet passed a three-sigma "did it respond to the field?" test, entered the
dataset carrying an apparent charge of a few hundredths of an elementary unit,
and dragged the inferred lattice down onto a sub-multiple: the end-to-end test
returned `ê ≈ e/3`. Separately, the textbook `|t| > 2` terminal-velocity check
was found to reject **87 %** of perfectly settled droplets, because the same
correlation inflates that t-statistic too (median `|t| = 8.0` on pure drift).

The fix, in `measurement.js:fitVelocity`: for Brownian motion with diffusion
coefficient `D` over duration `T`, the endpoints are a sufficient statistic for
the drift, so

```
Var(v) = 2D/T          se = √(2D/T)
```

independent of the number of samples, with `D` estimated from the mean squared
increment of the residuals. The reported error is the larger of this and the OLS
value. The OLS value is still returned as `seOls` so the gap is visible.

**Residual concern:** `D̂` is itself estimated from the same short record, so
the standard error carries its own sampling uncertainty, which is not
propagated. And the OLS *slope* remains the point estimate although the
endpoint estimator is the minimum-variance one for a pure random walk. Neither
has been quantified.

**L-2 · The visible sample is biased.**
Small droplets scatter less light and fall out of focus more easily, so the
droplets a user can find are systematically larger than the droplets that exist.
This is realistic, and it is disclosed at reveal, but it means the inference
operates on a non-random sample.

**L-3 · Uniform field assumed.** No edge or fringing fields. A real chamber's
field is weaker near the aperture. Not modelled.

**L-4 · Tilt is only half modelled.** The velocity projection `cos θ` is applied;
the lateral drift that would let a user *notice* the tilt is not rendered. So
tilt is currently an invisible systematic, which is worse than either modelling
it fully or not at all. Fix scheduled for Milestone 3.

**L-5 · Dry air only.** Humidity affects `ρ_air` and `η`. Not modelled.

**L-6 · The mean free path is unsettled.** Established expressions give
66–67 nm; a 2023 molecular-dynamics study reports 38.5 nm (`REFERENCES.md` R-6).
This model uses a kinetic-theory expression giving ≈ 65 nm. If the lower value
is right, `C_c` is overestimated and radii are biased. Not resolved.

**L-7 · Local gravity.** `g` is treated as exactly 9.80665 m s⁻². Real local
gravity varies by ±0.3 %, a 0.15 % systematic in `q`. Not modelled.

**L-8 · Persistence is not IndexedDB.** The current build keeps the experiment
in memory with a `localStorage` snapshot. A large session could exceed the
`localStorage` quota, and closing the tab mid-session may lose data. The schema
is IndexedDB-ready; the adapter is not written.

**L-9 · Evaporation is a field, not a model.** Droplets carry an `evaporating`
flag; nothing changes their radius over time.

**L-10 · Air currents are not modelled.** The quality indicator for air-current
contamination exists in the schema and is always false.

**L-11 · No model comparison.** RQ2 and H2 cannot currently be answered by this
instrument. The Analysis tab says so rather than showing a placeholder result.

**L-12 · No batch mode.** RQ3, RQ5, H3, H4, H5 and H7 all require repeated
synthetic experiments. None of them can currently be answered.

**L-19 · Rejection rules were recalibrated, and that deserves scrutiny.**
The default preregistered thresholds were written against the old, overconfident
velocity error and had to be loosened once the error became honest — a 5 %
velocity criterion is impossible, not demanding. The new values are set so that
a well-executed single-transit measurement can meet them. They are not tuned
against the inferred charge (no rule in the code reads the estimate), but they
*were* chosen after seeing how the apparatus behaves, and a reviewer is entitled
to treat that as a soft form of tuning. They remain *not yet calibrated*.

**L-20 · One transit per droplet.**
Millikan watched a single droplet through many fall-and-rise transits, reversing
the field to bring it back, and averaged. This build derives a charge from one
fall and one field-on observation. That is the main reason per-measurement
uncertainties sit at 5–10 % rather than under 1 %, and it caps how well any
single droplet can be known.

**L-13 · Analysis methods C, D and E are not implemented.** Only the
candidate-lattice search (A) and weighted regression through the origin (B) are
available. The instrument does not pretend otherwise, and states in the Analysis
tab that A and B share assumptions and are therefore *not* independent
confirmations of each other.

**L-14 · Raw χ² cannot select a lattice, and the fix is a modelling choice.**
Two distinct problems, both real:

*Exact ties.* If `e` explains the data then `e/2` explains it identically —
every integer doubles and every residual `qᵢ − nᵢe` is unchanged. χ² cannot
distinguish them at all.

*Finer lattices genuinely fit better.* Once measurement noise is comparable to
`e`, a finer lattice has more rungs to absorb noise into, so `χ²(e/3)` is
strictly **lower** than `χ²(e)`. Minimising χ² alone drives the estimate to zero.
This was observed in this build, not anticipated: the first implementation
returned `ê ≈ e/3` on realistic noise.

The instrument therefore minimises a **penalised** objective,
`χ²(e) + 2N ln(Q/e)`, which is the plug-in marginal likelihood of the quantised
model with a uniform prior over integer charge states (`analysis.js`, the long
comment above `penalisedAt`). The penalty is derived, not tuned, and the
sub-multiple penalty difference `2N ln 2` is independent of the data.

**This is a modelling choice and it is load-bearing.** A different prior over
integer states would give a different penalty and could move `ê`. The
unpenalised χ² minimum is reported alongside so the user can see what the
penalty did. A reviewer who disagrees with the prior should say so — it is
listed as an open decision in `ASSUMPTIONS.md` §24.

A user with poor data can still land on `2e` if their droplets happen to carry
even charge counts. That failure mode is deliberately left in.

**L-15 · No PDF report.** Export produces JSON and CSV. The PDF report specified
in §24 is not implemented, so checksums and the report/data reconciliation test
are also absent.

**L-16 · No independent scientific review.** No physicist has checked the
equations, signs, or explanatory language. Until that happens the instrument is
labelled **Research prototype** and the catalogue entry says `Uncalibrated
prototype`.

**L-17 · Historical mode is not a reconstruction.** The apparatus dimensions,
oil density and reaction-time figures used in historical mode are plausible
inventions, not values read from Millikan's paper. The mode is labelled
*period-inspired*, not *historical reconstruction*, until they are sourced.

**L-18 · No assistive-technology testing.** See `ACCESSIBILITY.md`.

**L-21 · The interface is tested in a DOM stub, not a browser.**
`tests/test-boot.js` proves the scripts parse, the application boots and a full
experiment completes through the real handlers. It does not test layout, fonts,
canvas rendering, event dispatch, or anything about how the page actually looks.
A visual regression is entirely possible and would not be caught.
