# Experimental Design

## 1. Structure

Three arms, 1,000 matched seeds, one factor manipulated (the allocation system).

```
arm × seed  →  CCE-A-0001 … CCE-A-1000
               CCE-B-0001 … CCE-B-1000
               CCE-C-0001 … CCE-C-1000      (3,000 runs)
```

`CCE-A-0001`, `CCE-B-0001` and `CCE-C-0001` share seed 1 and therefore share:

* the baseline population (identical citizen-by-citizen at year 0),
* the external event history (identical event types, years and severities).

They differ in the allocation rule and in the internal stochastic streams that the rule
sets in motion. The unit of analysis is the **run**, never the citizen
(`STATISTICAL_ANALYSIS_PLAN.md` §2).

## 2. What is held constant across arms

Population cap and slot mechanics · baseline population generation · fertility policy
(`equal_voluntary`) · government structure, band definitions and seat rules ·
assessment cadence, battery, reliability, normalisation method and reporting ceiling ·
mortality and morbidity models · healthcare access rules · welfare-check interval and
safeguarding effectiveness · legal accountability standard · environmental event
generator · logging and retention · random seed structure · initial resource
distribution.

## 3. What differs across arms

| Lever | A (IQ-allocated) | B (universal support) | C (competency) |
|---|---|---|---|
| `allocation_rule` | `iq_rank` — citizens ranked by official score, filling highest-complexity roles first | `preference_qualification` — stated preference, then demonstrated qualification/experience, capacity-limited | `competency_fit` — weighted multidimensional shortfall against role requirements, plus expertise, experience and preference; highest-consequence roles filled first |
| `scaffolding_strength` | 0.35 | 0.90 | 0.65 |
| `scaffolding_cost` (share of output) | 0.03 | 0.11 | 0.07 |
| `housing_preference_weight` | 0.15 (IQ enters the administrative housing rule) | 0.65 | 0.40 |

**Support is need-based in all three arms.** Society A allocates *occupation, housing and
office* by score, not assistance. A high-scoring citizen with disability, executive-function
limitation, illness or sensory impairment receives substantial support in every arm; a
low-scoring citizen in a familiar, accessible environment receives little. This is an
enforced invariant (`test_support_is_not_restricted_by_iq`), checked in all three arms.

**Scaffolding is a bundle, not a free lunch.** It buys accessibility (simplified forms,
automated medication, visual instruction, hazard detection, financial safeguards, adaptive
education, transport, automatic scheduling, escalating healthcare) and it is paid for out
of output every year.

## 4. Confounds identified and how each is controlled

| Confound | Control |
|---|---|
| Different disasters between arms | Shared `shocks` stream, fixed 24-slot block per year, decoded before any arm-specific logic; tested |
| Different starting populations | Shared `population_init` stream; derived state computed after initialisation; tested |
| Government type as a hidden treatment | Identical government module in all arms; only a configurable module swap can change it |
| Fertility policy interacting with allocation | `equal_voluntary` in all primary runs; `iq_weighted` isolated to Phase 2 |
| Support generosity confounded with allocation | Support is need-based everywhere; only *accessibility* (scaffolding) differs, and its cost is charged |
| Scaffolding cost masquerading as an accessibility effect | Sensitivity run with `scaffolding_cost` equalised across arms |
| RNG stream drift after divergence | Streams are named and separated; shared streams consume a fixed number of draws per year regardless of state |
| Normalisation method changing mid-experiment | Method declared before production and stamped into every manifest; changing it changes `parameter_set_id` |
| Multiple outcomes inflating false positives | Three primary outcomes preregistered; everything else is secondary and labelled exploratory |

## 5. External event system

Eleven event types (disaster, epidemic, pandemic, crop failure, infrastructure failure,
economic contraction, breakthrough, resource discovery, migration pressure, industrial
accident, external scandal) plus a slow climate drift. Each has a fixed decode position in
the shock block; positions are append-only. Severity is a power-transformed uniform.

Arms differ only in **absorption**: preparedness is a function of governance quality,
support coverage and scaffolding, and reduces impact by at most 55%. A shock is never
softer in one arm because the shock itself differed.

## 6. Run identity

Every run carries: experiment ID (`CCE-{A|B|C}-{run:04d}`), society code, run number,
seed, model version, git commit, parameter-set fingerprint, start/completion time,
execution environment, status, error log, per-file SHA-256 checksums, and a retention
record stating exactly what was and was not stored.

Run tags separate **main** (preregistered), **exploratory**, **calibration**, **debug**
and **sensitivity** runs. Analysis code refuses to pool across tags.

## 7. Phases

| Phase | Content | Fertility policy | Status |
|---|---|---|---|
| 0 | Specification + reference kernel + benchmarks + invariants | — | **complete** |
| 1 | Vertical slice: 10,000 citizens, 100 years, all invariants, one PDF report | `equal_voluntary` | kernel done; report pending |
| 2 | Full model: 100,000 × 500, all three arms, emergency assessment, households, retraining, regions | `equal_voluntary` | pending |
| 3 | Production batch: 3,000 runs, matched seeds, parallel, resumable | `equal_voluntary` | pending |
| 4 | Calibration, sensitivity (OFAT → Latin hypercube → Sobol), preregistration freeze, code freeze, reproducibility package | — | pending |
| 5 | **Separate** IQ-weighted fertility phase (H10), reported jointly with its assumption sweep | `iq_weighted` | pending |
