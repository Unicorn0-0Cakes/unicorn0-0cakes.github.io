# Hypotheses

All hypotheses are statements about the *model*, to be evaluated against matched-seed run
distributions, not about real societies. Each is paired with the mechanism that could
produce it, the outcome column that measures it, the smallest effect size of interest
(SESOI), and the observation that would falsify it.

Notation: `Δ(X−Y)` is the matched-pair mean difference across 1,000 shared seeds.

---

## H1 — Universal adaptive support raises healthy and independent life-years

**Claim.** Increasing cognitive accessibility raises healthy life expectancy and
functionally independent life-years *within every allocation system*.

**Mechanism.** `scaffolding_strength` attenuates the health-literacy mortality gradient
(`accessibility_closes_gradient`), lowers injury hazard, and reduces the environmentally
imposed component of cognitive load in `adaptive_functioning`.

**Measures.** `healthy_life_expectancy`, `independent_life_expectancy`, `frac_independent`.
**SESOI.** 1.0 year HALE; 2% independent life-years.
**Falsified if.** Δ(B−A) < SESOI, or the within-arm sensitivity sweep over
`scaffolding_strength` shows no monotone relationship.
**Confound to watch.** `scaffolding_cost` reduces output, which feeds medical progress;
a null result may be a cost effect rather than an accessibility effect. Test by holding
cost fixed across arms in a sensitivity run.

---

## H2 — IQ-based allocation helps some complex roles but adds classification error and rigidity

**Claim.** Society A attains equal or better performance in the highest-complexity,
highest-`g`-loaded roles, but higher total misallocation and slower recovery from shocks.

**Mechanism.** The official battery measures only six psychometric dimensions
(`cognition.BATTERY_DIMS`); practical judgment, social understanding, emotional
regulation and consistency are unmeasured but required by `occupations.WEIGHT`. Ranking
on the composite therefore mis-sorts roles that load on the unmeasured dimensions.

**Measures.** `mean_performance` within high-complexity sectors; `mean_mismatch`;
time-to-recovery of `output_per_capita` after a shock year.
**SESOI.** 5% mismatch; 2 years recovery time.
**Falsified if.** A shows both lower mismatch and equal recovery.

---

## H3 — Multidimensional competency matching produces fewer occupational mismatches than IQ-only

**Measures.** `mean_mismatch`, `mismatch_rate`.
**SESOI.** 5% relative reduction.
**Falsified if.** Δ(A−C) ≤ 0.
**Note.** C is not assumed to dominate: its matching runs on noisy measured profiles and
is capacity-constrained, so scarcity can make it perform worse than preference-based B.

---

## H4 — The cognition–mortality relationship weakens as systems become accessible

**Claim.** The regression coefficient of preventable mortality on absolute capability
shrinks toward zero as `scaffolding_strength` rises.

**Measures.** Within-run coefficient of `preventable_deaths` (and individual death hazard
in the panel) on `abs_capability`, by arm.
**SESOI.** 50% reduction in the standardised coefficient.
**Falsified if.** The coefficient is invariant to scaffolding — which would indicate the
pathway is not doing the work the model claims.

---

## H5 — Five-year testing is more stable but slower than annual testing

**Claim.** Longer intervals reduce classification churn (measurement-error-driven band
changes) but delay recognition of genuine non-emergency change.

**Measures.** Band-change rate per decade; lag between a ≥1 SD latent change and the
matching official change.
**SESOI.** 20% churn reduction; 2 years lag.
**Design.** Separate sweep over `assessment_interval ∈ {1, 2, 5, 10}`.

---

## H6 — Emergency assessment reduces preventable harm after acute change

**Measures.** Preventable deaths and independence loss in the 3 years following a
qualifying medical event, with the emergency-assessment trigger enabled vs disabled.
**SESOI.** 2% preventable mortality.
**Status.** The emergency-assessment pathway is specified in `COGNITIVE_MODEL.md` and
scheduled for Milestone 2; the Milestone 0 kernel implements scheduled assessment only.

---

## H7 — A highest-IQ presidency does not reliably predict good governance

**Claim.** Correlation between presidential official score and governance quality is
weak; the variance in `gov_quality` is dominated by ethics and corruption dynamics.

**Mechanism.** `leader_competence_iq_link = 0.20`, `leader_ethics_iq_link = 0.0`.
**This is an assumption, not a finding.** The honest statement of H7 is therefore:
*given* a modest assumed link, high-score presidencies do not stabilise institutions.
The sensitivity sweep over both link parameters is mandatory before H7 is reported, and
the result must be presented as conditional on that sweep.

**Measures.** Across-run correlation of `president_iq` with `gov_quality`, corruption
episodes and post-shock recovery.
**Falsified if.** `r > 0.5` at the default link values.

---

## H8 — Guaranteed band representation reduces neglect of minority cognitive groups

**Measures.** Unmet need and preventable mortality in the smallest populated bands,
with `seats_base = 1` vs a proportional-only assembly (`seats_base = 0`).
**SESOI.** 5% unmet-need gap between smallest and largest band.

---

## H9 — Strong welfare checks shorten hidden abuse but cost money and produce false positives

**Measures.** `mean_detection_delay_years`, `max_detection_delay_years`,
`false_positive_findings`, safeguarding cost share, autonomy/privacy index.
**SESOI.** 3 months mean detection delay.
**Design.** Sweep `welfare_check_interval`, `safeguard_detection_effectiveness`,
`max_undetected_duration`. The default regime caps undetected duration at 1 year
(enforced and tested); the sweep asks what weaker regimes cost.

---

## H10 — IQ-weighted fertility outcomes depend heavily on inheritance and environment assumptions

**Claim.** Under `fertility_policy = iq_weighted`, the sign and size of long-run effects
on capability, inequality, diversity and resilience are driven by
`heritability_latent`, `shared_environment_share`, `education_effect` and
`childhood_adversity_effect` rather than by the policy itself.

**Design.** **Separate preregistered phase.** Not part of the primary A/B/C comparison;
the primary comparison holds `fertility_policy = equal_voluntary` in all arms.
**Measures.** `abs_capability_mean` drift, capability variance, band-population entropy,
collapse probability, post-shock recovery.
**Reporting rule.** Results must be reported jointly with the inheritance-assumption
sweep; no headline number may be reported at a single assumption setting.
