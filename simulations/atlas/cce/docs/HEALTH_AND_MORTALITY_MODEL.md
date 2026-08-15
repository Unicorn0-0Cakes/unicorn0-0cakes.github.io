# Health and Mortality Model

Code: `engine/cce_engine/models.py` (`update_health`, `health_literacy`,
`mortality_hazard`), `kernel._life_table`. All values stylised; none calibrated.

## 1. Rule: cognition never buys life directly

There is exactly one route from cognition to the mortality hazard, and it is named,
bounded and attenuable:

```
health_literacy_z = standardise(0.5·verbal + 0.3·executive_function + 0.2·numerical)
attenuation       = 1 − accessibility_closes_gradient · clip(0.75·scaffolding + 0.25·support)
hazard           ×= exp( −health_literacy_gradient · health_literacy_z · attenuation )
```

At `scaffolding = 0.9` and `accessibility_closes_gradient = 0.85`, ~72% of the gradient is
removed. At `scaffolding = 0` it is fully present. This is the mechanism H4 tests, and it
is the only place where a cognitive variable multiplies a death rate.

Cognition also reaches health *indirectly* through occupational fit (hazard exposure,
error rates), support adequacy, stress and financial stability — each an explicit,
inspectable term.

## 2. Morbidity processes

| Process | Form | Modifiers |
|---|---|---|
| Chronic condition onset | `chronic_onset_base · exp(chronic_age_slope·(age−30))` | occupational consequence, medical level |
| Dementia | `dementia_base · 2^((age−65)/dementia_doubling)`, age > 45 | — |
| Injury | `injury_rate_base · (1 + occupational consequence)` | occupational **mismatch** (×`mismatch_error_multiplier`), scaffolding (−35%) |
| Mental health | `mental_health_incidence · (1 + 1.5·stress)` | scaffolding |
| Sensory decline | linear after 55 | — |
| Acute illness | AR(1) with shock burden | epidemic/pandemic severity |
| Physical capacity | `1 − 0.6·disability − age term` | — |

Health index = 1 − 0.09·chronic − 0.30·disability − 0.20·mental − 0.25·dementia −
0.30·acute − age term, clipped to [0,1].

## 3. Mortality

Gompertz–Makeham baseline `a·exp(b·age) + c`, with separate infant (age <1) and child
(1–14) rates, multiplied by:

* morbidity load (chronic, disability, mental health, dementia, general health),
* the health-literacy term above,
* support adequacy: `(1 − support_mortality_benefit·support_level_frac)`,
* unmet need: `(1 + undersupport_mortality_penalty·unmet_frac)`,
* accumulated medical progress `(1 − med_level)`,
* shock burden `(1 + 2·mortality_burden)`,
* active undetected abuse.

A hard age ceiling (`max_age`, 115) applies. Maternal mortality is charged per birth.

## 4. Primary health outcomes

Computed annually with a **Sullivan period life table** from age-specific death rates and
age-specific prevalences (single-year age groups 0–120):

1. `life_expectancy` — total life expectancy at birth.
2. `healthy_life_expectancy` — Sullivan-weighted by the share of the age group with
   health index ≥ `healthy_threshold`.
3. `independent_life_expectancy` — weighted by the share adaptive ≥
   `independence_threshold` **and** support level ≤ 2 (scheduled assistance or less).
4. `preventable_deaths` — deaths before 75 with unmet need or severe occupational
   mismatch present at death.
5. Disability-adjusted life-years — **[M2]**, requires disability weights.
6. `years requiring intensive assistance` — derivable from panel support levels;
   aggregate column **[M2]**.

Per-citizen cumulative healthy and independent years are also accumulated for the panel,
giving a cohort cross-check on the period life table.

## 5. Healthcare system

Access is identical across arms; what differs is *cognitive accessibility* of the system
(scaffolding), which affects adherence, symptom recognition, navigation, preventive
uptake and emergency response through the health-literacy attenuation term. Medical
innovation accumulates at `medical_innovation_rate`, boosted by breakthroughs and by
governance quality **[M2: explicit health budget]**.

Pandemics, epidemics, industrial accidents and disasters raise acute illness and the
mortality burden; preparedness (governance quality, support coverage, scaffolding) can
absorb at most 55%.

## 6. Limitations

* No cause-of-death taxonomy; deaths are drawn from a single composite hazard.
* No infectious-disease transmission model — epidemics are exogenous shocks, not
  contact processes. This matters for any claim about pandemic response and must be
  stated whenever pandemic results are reported. **[M2 candidate: SEIR layer.]**
* Disability is a scalar, not a typed profile.
* No comorbidity interactions beyond additive load.
* The Sullivan method assumes prevalence is stationary within the year; with 500-year
  horizons and slow drift this is acceptable but should be cross-checked against the
  cohort accumulators.
