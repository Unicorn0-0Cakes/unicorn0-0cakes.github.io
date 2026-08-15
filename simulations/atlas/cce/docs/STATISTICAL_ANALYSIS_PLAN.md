# Statistical Analysis Plan

To be frozen before production runs. Any deviation is reported as a deviation.

## 1. Unit of analysis

**The simulation run.** Citizens within a run share an institutional environment and are
not independent; treating 100,000 citizens as 100,000 observations would understate
standard errors by orders of magnitude. Individual-level data is used only for
within-run mechanism analysis (pathway coefficients), never for treatment inference.

n = 1,000 runs per arm, matched by seed.

## 2. Primary comparison

For each outcome `Y` and arm pair `(s, t)`, compute the **matched-pair difference**
`d_k = Y(s,k) − Y(t,k)` over shared seeds `k = 1..1000`, and report:

* mean and median of `d`
* SD and IQR of `d`
* 95% CI for the mean (bootstrap, 10,000 resamples, BCa)
* **Monte Carlo standard error** `MCSE = SD(d)/√1000`, reported next to every mean
* absolute and percentage difference
* standardised effect size (Cohen's `d_z` for paired data, plus Hedges' g for the
  unpaired arm distributions)
* `P(Y(s,k) > Y(t,k))` — probability one arm outperforms the other on a matched seed
* best and worst 5% of runs per arm
* collapse probability (share of runs flagged `collapsed`)
* time-to-recovery after major shocks (years until `output_per_capita` returns to its
  pre-shock 10-year mean)

**Implementation.** `engine/cce_engine/stats.py`. `paired_contrasts` computes only
the paired form and excludes-and-counts seeds missing an arm; it has no code path
that substitutes an independent-sample difference. `describe` returns n, mean,
median, SD, IQR, min, max, 2.5th/97.5th percentiles, MCSE and a BCa bootstrap CI
(10,000 resamples, deterministic seed). Batch output lands in
`summaries/arm_summary.csv`, `summaries/paired_contrasts.csv` and
`summaries/seed_paired_summary.csv` (see `BATCH_EXECUTION.md`).

## 3. Primary outcomes (three only)

1. `healthy_life_expectancy` — mean over the final 100 simulated years
2. `independent_life_expectancy` — mean over the final 100 years
3. `mean_mismatch` — mean over the whole run

Everything else is **secondary** and reported with explicit multiplicity labelling.
Secondary families: productivity, innovation, mobility, safety, inequality, institutional
stability, population development.

## 4. Smallest effect sizes of interest (SESOI)

Configurable and preregistered; initial values:

| Outcome | SESOI |
|---|---|
| Healthy life expectancy | 1.0 year |
| Independent life-years | 2% |
| Preventable mortality | 2% |
| Occupational mismatch | 5% |
| Major institutional failure | 5% |

These values are **preregistered and frozen**. They live in `stats.SESOI`, and are
not to be adjusted on the basis of pilot results; a change must be proposed
separately, dated, with the original preserved in the audit trail.
`independent_life_expectancy` uses an absolute 1.0-year floor rather than the
relative 2%, because 2% of ~50 years is ~1 year and an absolute threshold is
harder to game.

With 1,000 runs, trivially small differences will be "statistically significant" —
the 30-seed rehearsal already shows paired MCSEs of ~0.04 years, implying ~0.01
years at n=1,000. **No result is described as important on the basis of a
p-value.** Any contrast whose interval excludes zero while the estimate is
smaller than its SESOI is flagged `precise_but_below_sesoi` and reported under a
heading that says so. Every comparison is
reported as: point estimate, CI, MCSE, effect size, and whether the CI excludes the
SESOI. Equivalence is tested with TOST against the SESOI bounds.

## 5. Reporting rules

* No finding is ever called indisputable, proven or established. The standard phrasing
  is: *"reproducible in this model under the stated assumptions and parameter ranges."*
* Every headline number carries its MCSE and its parameter-set fingerprint.
* Exploratory, calibration, debug and sensitivity runs are never pooled with main runs;
  the analysis code refuses to mix `run_tag` values.
* Distribution plots (run-level histograms and matched-pair difference densities)
  accompany every mean.
* Any outcome where the three arms' distributions overlap substantially is reported as
  overlapping, not ranked.

## 6. Mechanism analysis (within-run, individual level)

Used only to verify that pathways behave as specified, never for treatment claims:

* regression of individual death hazard on `abs_capability`, by arm and by
  `scaffolding_strength` (H4)
* mismatch decomposition: share attributable to unmeasured dimensions vs capacity
  constraints vs measurement error (H2, H3)
* band-boundary uncertainty: share of citizens whose official score CI crosses a band
  edge, and the classification churn attributable to it (H5)

Clustered standard errors by run; results reported per-run and then aggregated.

## 7. Sensitivity analysis

Separate from the stochastic-uncertainty experiment (§2, which varies only the seed).

* **OFAT** screening across all 92 registered parameters at ±1 range step.
* **Latin hypercube** over the high-sensitivity subset (≈25 parameters), 512 designs
  × 20 seeds.
* **Sobol** first-order and total indices on the primary outcomes, using a Saltelli
  design sized after the LHS screen.
* Scenario comparison: pre-specified corner cases (no scaffolding anywhere; full
  scaffolding everywhere; zero measurement error; zero heritability; weak safeguarding).

Sensitivity results are reported as index tables plus tornado plots, and any conclusion
that reverses within the plausible range of a parameter is reported as *not robust*.

## 8. Handling failures

Failed or non-completing runs are reported, not silently replaced. A campaign is invalid
if completion is below 99%; failed seeds are rerun with the same seed and the rerun is
recorded in the batch manifest.
