# Research Question

**Model version:** 0.1.0-milestone0 · **Status:** Milestone 0 specification, reference kernel implemented and tested.

## Scientific disclaimer

This is a fictional, fully simulated research environment. It involves no human subjects,
implements no policy, and produces no findings about any real population. Every quantity
below is a property of a computer model. Results are described as *reproducible findings
conditional on the model's assumptions and parameter ranges* — never as indisputable, and
never as evidence about real people.

## Primary question

> Under a fixed government structure, a fixed population cap, a fixed external event
> history and fixed measurement rules, how do three systems for allocating work,
> housing, assistance, representation and responsibility — **IQ-based allocation (A)**,
> **universal cognitive support (B)**, and **multidimensional competency matching (C)** —
> differ in healthy lifespan, functional independence, productivity, innovation, social
> mobility, safety, inequality, institutional stability and population development over
> 500 simulated years?

## Formal statement

For society arm `s ∈ {A, B, C}`, run seed `k ∈ {1..1000}` and outcome `Y`, the estimand is
the matched-pair mean difference

```
Δ_AB(Y) = E_k[ Y(A, k) − Y(B, k) ]
```

where `Y(s, k)` is the run-level summary of outcome `Y`. Because arms sharing a seed
receive an identical baseline population and an identical external shock history
(enforced by the shared RNG streams, `engine/cce_engine/rng.py`, and tested in
`test_matched_seeds_produce_identical_external_shocks`), `Δ` isolates the allocation rule
from the environment.

## The nine outcome families

| # | Family | Primary measure | Source column |
|---|--------|-----------------|---------------|
| 1 | Healthy lifespan | Sullivan healthy life expectancy at birth | `healthy_life_expectancy` |
| 2 | Functional independence | Independent life expectancy; share of person-years independent | `independent_life_expectancy`, `frac_independent` |
| 3 | Productivity | Output per capita | `output_per_capita` |
| 4 | Innovation | Innovations per decade; technology level | `innovations`, `tech_level` |
| 5 | Social mobility | Between-generation rank correlation of occupational tier | derived (Milestone 2) |
| 6 | Safety | Preventable deaths; injury-linked disability; detection delay | `preventable_deaths`, `mean_detection_delay_years` |
| 7 | Inequality | Gini of performance/output; unmet-need concentration | `performance_gini`, `unmet_need_rate` |
| 8 | Institutional stability | Governance quality; corruption episodes; unrepresented bands | `gov_quality`, `corrupt_officials`, `unrepresented_populated_bands` |
| 9 | Population development | Population, births, denied births, absolute capability drift | `population`, `births_denied`, `abs_capability_mean` |

## The ten constructs that must remain distinct

IQ is never permitted to act as a universal cause. The model separates, and stores
separately: (1) cognitive ability, (2) adaptive functioning, (3) learned competence,
(4) educational attainment, (5) physical and mental health, (6) executive functioning,
(7) social ability, (8) occupational skill, (9) environmental support, (10) random
opportunity and adversity.

Every route from cognition to an outcome is an explicit, named, inspectable pathway:

```
latent capability ──► observed test score ──► official classification ──► (A) job/housing
                 │
                 ├──► health-literacy pathway ──► mortality hazard        [attenuable]
                 ├──► executive function ──► adaptive functioning ──► support need
                 ├──► occupational fit ──► performance ──► output, error, injury
                 └──► (never) direct effect on longevity, ethics, judgment or leadership
```

`accessibility_closes_gradient` controls how much of the health pathway an accessible
environment removes. Setting it to 0 recovers a "cognition is destiny" world; setting it
to 1 removes the gradient entirely. Neither is assumed; both are run.

## What would falsify the headline hypotheses

* H1 is falsified if Society B's healthy life expectancy is not higher than A's by at
  least the smallest effect size of interest (1 year) in a majority of matched pairs.
* H3 is falsified if Society C's occupational mismatch is not below A's by ≥5%.
* H7 is falsified if presidential g predicts governance quality with `r > 0.5` across runs.

See `HYPOTHESES.md` and `STATISTICAL_ANALYSIS_PLAN.md`.
