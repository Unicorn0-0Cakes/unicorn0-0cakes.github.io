# Cognitive Model

Code: `engine/cce_engine/cognition.py`. All values stylised; none calibrated.

## 1. Eleven latent dimensions

`fluid_reasoning · verbal_comprehension · working_memory · processing_speed ·
spatial_reasoning · numerical_reasoning · practical_judgment · social_understanding ·
executive_function · emotional_regulation · consistency`

Each is stored on the **Year-0 absolute scale** (mean 100, SD 15 at year 0) and is
generated as

```
dim_d = 100 + 15 · ( z_g · λ_d + ε_d · √(1 − λ_d²) ),    ε_d ~ N(0,1)
```

with loadings `λ` from `g_loading`. The loadings for practical judgment (0.45), social
understanding (0.35), emotional regulation (0.30) and consistency (0.40) are deliberately
low: these are the dimensions the official battery does not measure and that many jobs
require.

## 2. Two measurements, never conflated

### 2.1 Absolute cognitive capability
`g_abs` = battery-weighted composite of the six psychometric dimensions, on the fixed
Year-0 scale. **Never renormalised.** This is the only measure that can answer "did
population capability change across centuries?".

### 2.2 Relative civic IQ
Norm-referenced, recomputed after each civilization-wide assessment against **the
previous completed assessment cycle's observed scores** (year 0 uses the concurrent
population, documented). Mean 100, SD 15, reported ceiling 150, floor 40. Method fixed by
`normalization_method` (primary: arithmetic mean and SD, the conventional choice).
Alternatives available for sensitivity: median/MAD, 5% trimmed mean with robust SD.
**The method may never be changed silently mid-experiment**; it is stamped into every
manifest and enters the parameter fingerprint.

Every assessment additionally reports median, 5% trimmed mean, IQR, robust MAD, skew,
ceiling fraction and floor fraction (`cognition.distribution_diagnostics`).

## 3. Ageing

Maturation: capability is expressed as a fraction of endowment rising to 1.0 at age 18.
Decline: fluid reasoning, processing speed and working memory fall by
`fluid_decline_rate` (0.22 points/year) after `fluid_peak_age` (25). Verbal and
practical/social dimensions do not decline with normal ageing. Dementia multiplies the
whole expressed profile by 0.72.

## 4. Development

Schooling (ages 5–18) adds `education_effect × edu_quality × 0.25` per year to the latent
profile, with quality improved by scaffolding. Childhood adversity subtracts up to
`childhood_adversity_effect` scaled by the accumulated adversity index (nutrition,
toxins, stress, illness, family support, environmental safety). Both are high-priority
sensitivity parameters: they determine how much of the observed capability distribution
is environmental rather than endowed.

## 5. Observation model

```
observed = battery_composite(latent_now)
         − sensory_penalty · sensory · (1 − 0.9·scaffolding)
         − health_effect · acute_illness · (1 − 0.5·scaffolding)
         − stress_effect · stress · (1 − 0.5·scaffolding)
         + min(sittings · practice_effect, practice_max)
         + motivation ~ N(0, 2)
         + error ~ N(0, 15·√(1 − reliability))
```

At `test_reliability = 0.92` the measurement SD is ≈4.2 points. A citizen scoring 89 and
one scoring 90 are not metaphysically different: every official score is stored with its
standard error (`official_se`) and all band-based analysis must report the fraction of
citizens whose confidence interval crosses a band boundary.

Note the direction of the accessibility terms: an inaccessible testing environment
*lowers measured scores of impaired citizens without lowering their capability*. Part of
any A-vs-B classification difference is therefore measurement artefact, by construction —
and it is reported as such.

## 6. Testing schedule and change of classification

* Civilization-wide assessment every `assessment_interval` (5) years, on the
  civilization anniversary, not individual birthdays.
* All living citizens aged ≥ `adult_civic_age` (20) are assessed in the same cycle.
* Children aged ≥ 6 receive developmental/educational assessment; this never produces a
  civic classification.
* Citizens born between cycles wait for the next cycle; the interval is logged.
* **No appeals. No elective retesting. No discretionary repeat attempts.** Enforced by
  construction (there is no code path from a citizen to a test request) and tested by
  `test_assessment_cadence_and_no_elective_retest`.

### Emergency medical assessment **[M2]**

Triggered only by a documented medical event: traumatic brain injury, stroke, severe
infection, neurological disease, dementia onset, toxic exposure, major psychiatric event,
or sudden loss of function. It may immediately change support level, medical supervision,
housing assistance, safety requirements, work restrictions and treatment planning.

Whether it also changes **civic classification** immediately or only at the next
five-year cycle is a configurable parameter (`emergency_changes_classification`,
default: *no — support changes immediately, civic classification waits*), documented as
an assumption and included in the sensitivity plan. In Milestone 0 the trigger conditions
are modelled (dementia, injury, acute illness alter support and health) but the separate
emergency *assessment event* is not yet a distinct logged object.

## 7. Inheritance

```
endowment_child = pop_mean + regression · h² · (mid_parent − pop_mean) + N(0, σ_resid)
σ_resid = 15 · √(1 − h⁴ − shared_environment_share)
```

plus, applied later through development: prenatal and parental health, education quality,
childhood nutrition, environmental safety, stress, toxin exposure, disease, family
support and random variation. Intelligence is **never** a single-gene trait here.
`heritability_latent` (default 0.50) is a model knob, not an empirical claim, and it is
first-priority in the sensitivity plan — especially for H10, where it drives the sign of
the result.

## 8. Known limitations

* The battery is a fixed linear composite; real instruments have subtest structure,
  differential item functioning and cohort effects (Flynn-type drift). Not modelled.
* Practice effects are linear and saturating; real practice effects depend on interval
  and form.
* One reliability coefficient applies to all ages and impairment levels, which is
  unrealistic and biases against detecting measurement-driven misclassification at the
  tails.
* No cultural or linguistic bias term is modelled beyond the generic sensory/state
  penalties. **[M2]**
