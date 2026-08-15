# Pilot Analysis Plan (30 matched seeds)

**Status: exploratory. Not a preregistered result. Not hypothesis testing.**

## 1. Why a pilot at all

A 1,000-run campaign multiplies every flaw by a thousand. The pilot exists to
find the flaws, and to answer a prior question that the campaign cannot answer
about itself: *how much is 1,000 runs actually worth here?*

## 2. Deliverables

1. **Between-seed variability** of each primary outcome, per arm — the noise floor.
2. **Variability of the matched treatment contrasts** (B−A, C−A, C−B) — which is
   the quantity that actually determines precision, and is typically far smaller
   than the arm-level SD because the seed is shared.
3. **Monte Carlo standard error** at n = 30, and its projection to n = 1,000.
4. **Comparison of the empirical noise floor with the preregistered SESOIs.**
5. **Operational faults**: failures, outliers, storage surprises, timing instability.
6. **Resource estimate** for 1,000 seeds.
7. **A judgement on whether 1,000 runs are scientifically useful or excessive.**

## 3. The estimand is the paired difference

Arms share a seed, so the treatment estimate is the within-seed difference

```
d_k = Y(s, k) − Y(t, k),    contrasts: B−A, C−A, C−B
```

not the difference of arm means. `stats.paired_contrasts` computes only the
paired form; a seed missing either arm is **excluded and counted**
(`n_seeds_excluded_incomplete`), never imputed and never replaced by an
independent-sample difference. `test_paired_not_substituted_by_independent_samples`
constructs a case where the two approaches give the same point estimate but very
different precision, and asserts the paired one is used.

Reported per outcome and contrast: n matched seeds, n excluded, mean, median, SD,
MCSE, 95% BCa bootstrap CI, min, max, `P(d > 0)`, `P(d > SESOI)`,
`P(d < −SESOI)`, and a `precise_but_below_sesoi` flag.

## 4. Interpretation rules

* **Do not lead with p-values.** None are computed. With 1,000 runs the MCSE on
  a paired contrast will be roughly 0.01 years; essentially any non-zero
  difference would be "significant". That is a statement about sample size, not
  about the world.
* **Explicitly flag precise-but-trivial results.** When a 95% interval excludes
  zero while the estimate is smaller than the SESOI, the report says so in its own
  section, by name.
* **Do not change the SESOIs after seeing the pilot.** The preregistered values
  live in `stats.SESOI` and are reproduced in `STATISTICAL_ANALYSIS_PLAN.md` §4.
  A proposed change must be a separate, dated recommendation with the original
  values preserved in the audit trail.
* **Overlap is reported as overlap.** Where arm distributions overlap
  substantially, they are not ranked.

## 5. Response to stochastic history

`summaries/shock_response.csv` correlates each run-level outcome with that run's
total exposure to external shocks (`shock_events_total`,
`mortality_burden_total`) within each arm.

This exists because of a specific risk. If between-seed SD is near zero **and**
outcomes barely respond to shock exposure, then a 1,000-run campaign would be a
very precise measurement of a model that hardly reacts to its own stochastic
history — and the honest conclusion would be that the seeds are not the
interesting source of uncertainty, the parameters are. That would redirect
effort from run count toward the sensitivity framework, which is the right
answer if it is true.

**Rehearsal result** (30 seeds, 10,000 citizens × 100 years, exploratory):
shock-exposure correlations with the primary outcomes ranged from −0.35 to +0.28,
so the model does respond to its stochastic history, but weakly. Between-seed SD
on healthy life expectancy was ≈0.15–0.18 years. This is a reduced-scale
rehearsal and does not substitute for the full-scale pilot.

Full variance decomposition (seed vs parameter vs arm) is a Milestone 4 task and
requires the sensitivity framework; the shock-response table is the pilot-stage
approximation of it.

## 6. Outstanding blockers before any `main` campaign

1. **No calibration.** All 92 parameters are `not yet calibrated`. Nothing here
   is an empirical estimate.
2. **Preregistration is not frozen** (`PREREGISTRATION_DRAFT.md`).
3. **No pattern-oriented validation** against the eight targets in
   `VALIDATION_PLAN.md` §3.
4. **No global sensitivity analysis.** Parameter uncertainty is the dominant
   source and is entirely unmeasured; 1,000 seeds address stochastic uncertainty
   only.
5. **Model gaps that affect specific hypotheses**: epidemics are exogenous
   shocks rather than transmission processes (any pandemic claim); no assortative
   mating (H10); emergency assessment is not yet a distinct logged event (H6).
6. **H7 rests partly on an assumption** (`leader_competence_iq_link`,
   `leader_ethics_iq_link`) and may only be reported alongside its sweep.
7. **Storage policy unresolved**: where pyarrow is present, tables are written in
   both CSV and Parquet, which roughly doubles storage. Both copies are now
   checksummed, but the retention policy should be fixed before a large campaign.
