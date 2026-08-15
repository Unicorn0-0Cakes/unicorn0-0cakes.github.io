# Support, Assistance and Housing Model

Code: `engine/cce_engine/models.py`. All values stylised; none calibrated.

## 1. Principle

The civilization's stated purpose is that every citizen receives the support needed to
function as safely and independently as reasonably possible. Support therefore tracks
**assessed need**, never classification, in all three arms.

Two failure modes are first-class outcomes, not bookkeeping:

* **Under-support** — assessed need exceeds assigned support. Raises mortality hazard
  (`undersupport_mortality_penalty`), vulnerability and abuse risk.
* **Over-support** — assigned supervision exceeds need. Costs adaptive functioning at
  `oversupport_independence_cost` per year. A more supervised residence is never
  automatically better.

## 2. Adaptive functioning

An index in [0,1] built from executive function and practical judgment, then reduced by
*load*:

```
load = 0.45·(1 − capability_term) + 0.30·disability + 0.20·mental_health
     + 0.15·sensory + 0.35·dementia + 0.25·frailty
load ← load · (1 − 0.55 · scaffolding)
adaptive = childhood_factor · (1 − load)
```

Scaffolding removes part of the load the *environment* imposes, not the person's
impairment. This is the mechanistic heart of Society B.

## 3. Needs assessment (19 domains)

Practical daily living · executive functioning · medication management · financial
management · transportation · communication · reading comprehension · numerical
comprehension · social vulnerability · physical disability · mental health · sensory
impairment · memory · judgment · occupational support · housing safety · parenting
support · legal comprehension · emergency response ability.

In Milestone 0 these are aggregated into a single need index from adaptive functioning,
disability, mental health, general health and dementia. **[M2: the 19 domains become
separate scored dimensions with domain-specific supports.]**

The assessment is **noisy** (`support_assessment_error`, default 0.12 SD). That noise is
what generates over- and under-support; setting it to zero is a sensitivity condition,
not the default.

## 4. Support levels

`0 independent · 1 light support · 2 scheduled assistance · 3 daily assistance ·
4 continuous remote monitoring · 5 supported housing · 6 live-in assistance ·
7 medical residential support · 8 secure protective care (only where legally and
medically justified)`

Rationing: total assigned support is capped at `support_capacity_per_capita` × total
assessed need, allocated highest-need-first via the level histogram (O(n), no sort).
Scarcity therefore produces unmet need at the margin rather than a silent uniform cut.

**Enforced invariants** (`test_support_is_not_restricted_by_iq`, run in all three arms):

* High-scoring citizens can and do receive support at every level.
* Low-scoring citizens can and do live independently.

## 5. Tracked support outcomes

`support requested · support assigned · unmet need · incorrect assignment · over-support ·
under-support · independence gained · independence lost · preventable injury · caregiver
burden **[M2]** · support cost · quality of life **[M2]** · abuse vulnerability`

Currently logged: `mean_support_level`, `unmet_need_rate`, `over_support_rate`,
`frac_independent`, `vulnerability`, plus per-citizen values in the panel.

## 6. Housing

Nine types: independent · accessible independent · cluster · supported apartment ·
multigenerational · assisted living · medical residential · high supervision · emergency.

Allocation blends an administrative score with stated preference at
`housing_preference_weight`:

* **A** — administrative score mixes need with official classification (IQ influences the
  housing rule, as specified for this arm).
* **B** — preference-dominant (weight 0.65), constrained by need and stock.
* **C** — support-requirement and practical-compatibility dominant.

Housing is reviewed every 5 years. Capacity slack (`housing_capacity_slack`) means
scarcity can force suboptimal placement — a modelled failure, not an error.

Tracked: restrictiveness, autonomy, safety, isolation, social connection, cost, abuse risk
and functional independence. Milestone 0 logs restrictiveness and its downstream effects
on vulnerability and independence; the remainder is **[M2]**.

## 7. Limitations

* Single aggregate need index rather than 19 scored domains.
* No explicit caregiver agents, so caregiver burden is not yet measured.
* Housing stock is implicit (a slack parameter) rather than an explicit building
  inventory with construction lags.
