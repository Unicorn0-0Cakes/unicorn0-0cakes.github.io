# Preregistration (Draft)

**Status: DRAFT — not frozen.** Freeze before any run tagged `main`.
Model version at drafting: 0.1.0-milestone0. Parameter set: `2d6343f41b392d36`.

## 1. Title

The Cognitive Civilization Experiment: a matched-seed agent-based comparison of three
allocation systems over 500 simulated years.

## 2. Study type

Computational experiment on a fictional simulated society. No human subjects. No
empirical data are analysed. Findings are statements about a model.

## 3. Hypotheses

H1–H10 exactly as stated in `HYPOTHESES.md`, with H10 assigned to a separate phase.
Directional predictions, mechanisms, measures, SESOIs and falsification conditions are
specified there and are frozen with this document.

## 4. Design

Three arms (A: IQ allocation, B: universal cognitive support, C: multidimensional
competency), 1,000 matched seeds each, 100,000 citizens, 500 years, `equal_voluntary`
fertility in all arms, identical government module, identical shock stream per seed.

## 5. Primary outcomes (three)

1. Healthy life expectancy, mean over the final 100 years.
2. Independent life expectancy, mean over the final 100 years.
3. Mean occupational mismatch over the run.

All other outcomes are secondary and labelled as such.

## 6. Analysis

As specified in `STATISTICAL_ANALYSIS_PLAN.md`: run-level unit of analysis, matched-pair
differences over shared seeds, BCa bootstrap CIs, Monte Carlo standard errors, paired
effect sizes, `P(A > B)`, best/worst 5%, collapse probability, recovery time. Equivalence
tested by TOST against the SESOIs. No conclusion rests on a p-value.

## 7. Fixed before production (may not change without a documented amendment)

| Decision | Value |
|---|---|
| Normalisation method | arithmetic mean and SD |
| Reporting ceiling / floor | 150 / 40 |
| Assessment interval | 5 years |
| Adult civic classification age | 20 |
| Test reliability | 0.92 |
| Population cap | 100,000 |
| Fertility policy (primary) | `equal_voluntary` |
| Band definitions | as in `params.iq_bands` |
| Seats | 1 guaranteed per populated band + 90 proportional |
| Welfare-check interval / max undetected duration | 1 year / 1 year |
| Heritability, shared environment | 0.50 / 0.20 |
| Leader competence / ethics link to g | 0.20 / 0.00 |
| Seeds | 1–1000, identical across arms |
| SESOIs | as in `STATISTICAL_ANALYSIS_PLAN.md` §4 |

## 8. Sensitivity analyses planned in advance

OFAT screen over all registered parameters; Latin hypercube over the high-priority
subset; Sobol indices on the three primary outcomes; five pre-specified corner scenarios.
Any conclusion that reverses inside a parameter's plausible range is reported as not
robust.

## 9. Stopping and exclusion rules

* Fixed n = 1,000 runs per arm; no optional stopping.
* Runs are excluded only for technical failure (non-zero exit, checksum mismatch), and
  every exclusion is listed in the batch manifest with its seed and error.
* Failed seeds are rerun with the same seed; reruns are flagged.

## 10. Amendments

Any change after freeze is recorded here with date, reason, and the affected results,
and the affected analyses are reported both ways.

## 11. Declarations

* No empirical calibration has been performed; all parameters are stylised.
* No results exist at the time of drafting other than the engine benchmarks and the
  invariant test outcomes.
* No claim from this study may be described as indisputable, proven or generalisable to
  real populations.
