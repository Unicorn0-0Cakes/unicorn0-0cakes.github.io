# Population Model

Code: `engine/cce_engine/state.py` (slots), `kernel._fertility`, `cognition.inherit`.

## 1. The cap is structural

Each simulation begins with exactly 100,000 living citizens and the living population may
never exceed 100,000. This is not policed after the fact: the state is a preallocated
array of exactly `population_cap` slots. A citizen holds a slot for life; on death the
slot returns to a free stack and becomes a **population opening**. A birth requires a free
slot. There is therefore no code path that can exceed the cap, and none that can silently
delete a living citizen. Tested by `test_population_never_exceeds_cap`.

Before a slot is released, a death record is emitted (panel citizens in full; all deaths
in forensic logging).

## 2. Openings, permits and waiting

```
openings = free slots
wants    = fertile, in-window, below desired family size, not pregnant
granted  = first `openings` of `wants` under the active reproductive policy
refused  = the remainder → waiting-list timestamp recorded, denial counted
```

Every denied, postponed or waitlisted birth is logged (`births_denied` annually,
`birth_postponed` events when deliveries exceed slots at the moment of birth). The
interval between an opening and the birth that fills it is recoverable from the annual
series and, per-citizen, from `wait_since`.

Conception: permitted, willing citizens conceive with probability `conception_rate`;
gestation is approximated as one year with an 85% completion rate (documented
simplification — sub-annual gestation is **[M2]**).

## 3. Reproductive policy is a separate module

| Policy | Rule | Use |
|---|---|---|
| `equal_voluntary` | longest-waiting first among willing citizens | **primary A/B/C comparison, all arms** |
| `lottery` | random permit draw | sensitivity |
| `waiting_list` | strict FIFO by registration | sensitivity |
| `iq_weighted` | permits ordered by official score | **Phase 5 only, never in the primary comparison** |
| `need_aware` | lowest support need first | sensitivity |
| `society_allotment` | fixed per-citizen child allotment | sensitivity |

The module documents: eligibility rules, consent assumptions, permit allocation, waiting
time, desired children, permitted children, birth outcomes, parent ages, parent cognitive
and adaptive profiles, education and health conditions, environmental factors and
inheritance assumptions.

**Consent assumption (explicit).** Citizens are modelled as freely choosing whether to
seek a permit; the state allocates scarce permits but does not compel reproduction or
prevent a permitted citizen from declining. No coercive reproductive mechanism is
modelled. Any policy that would require one is out of scope.

## 4. Inheritance

Never a single gene. The child's endowment combines:

* a polygenic mid-parent term with regression to the contemporaneous population mean
  (`heritability_latent`, `regression_to_mean`),
* a large residual,
* and, applied through development: prenatal and parental health, education quality,
  childhood nutrition, environmental safety, stress, toxin exposure, disease, family
  support and random variation. Parental unmet support need raises the child's adversity
  index; scaffolding lowers it and raises education quality.

All inheritance assumptions are configurable and are first-priority in the sensitivity
plan. For H10 they determine the sign of the result, so no H10 number may be reported at
a single assumption setting.

## 5. Population outcomes tracked

`population · births · deaths · births_denied · birth_postponed events · mean_age ·
life expectancy family · abs_capability_mean (absolute, un-renormalised) ·
abs_capability_sd · band populations · collapse flag (population < 10% of cap)`

## 6. Limitations

* No migration in or out (migration pressure is a shock, not a flow of agents).
* Pair formation is not modelled: the father is drawn uniformly from in-window males.
  Assortative mating is a **[M2]** addition and will matter for H10.
* Gestation, twin births and age-specific fecundity curves are simplified.
* Sex is binary and used only for fertility eligibility.
