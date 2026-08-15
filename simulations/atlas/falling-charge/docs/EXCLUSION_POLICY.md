# Exclusion policy and quality control

Version 0.1.0-milestone1. Implemented in `src/measurement.js`.

---

## 1. Quality indicators

Recorded per measurement. Deliberately **not** collapsed into a single score,
because a single score is the mechanism by which a rejection stops needing a
reason.

| indicator | unit | source |
|---|---|---|
| observation duration | s | tracker |
| tracked samples | count | tracker |
| focus quality | 0–1 | optical model |
| path continuity | 0–1 | fraction of expected samples present |
| terminal-velocity confidence | flag + quadratic t-stat | fit |
| Brownian noise magnitude | m | residual RMS |
| air-current contamination | flag | **not implemented** |
| proximity to plate edges | m | position vs. plate |
| voltage stability | V rms over window | apparatus |
| temperature stability | K over window | apparatus |
| charge stability | flag | droplet event log |
| droplet overlap | flag | proximity of other visible droplets |
| identity-loss risk | flag | overlap + invisibility gaps |
| evaporation suspicion | flag | **not implemented** |
| timing precision | s | apparatus |
| residual pattern | series | fit |
| velocity uncertainty | m s⁻¹ | fit SE |
| charge uncertainty | C | Monte Carlo propagation |

## 2. Statuses

`Candidate` · `Accepted` · `Accepted with caution` · `Rejected` · `Unresolved`

`Unresolved` exists so a user is not forced into a binary they do not believe.
Unresolved measurements are excluded from the primary estimate and are reported
separately, with a count, in the summary.

## 3. Rejection reasons

A rejection **requires** a reason from this list, or `other` with free text.
There is no path through the interface that rejects a measurement without one.

`droplet_identity_lost` · `overlapping_droplets` ·
`insufficient_observation_duration` · `terminal_velocity_not_reached` ·
`focus_failure` · `voltage_instability` ·
`charge_changed_during_measurement` · `left_calibrated_region` ·
`apparatus_disturbance` · `tracking_failure` ·
`uncertainty_threshold_exceeded` · `other`

## 4. Retention

**Rejected data are never deleted.** The persistence layer exposes no delete
operation for observations. Rejected measurements appear in:

- the raw table, greyed but present and sortable
- `exclusions.csv` in the export bundle
- the rejected-observation table in the report
- the exclusion-sensitivity analysis
- the reveal, where the user is shown which rejected measurements were in fact
  physically sound

## 5. Preregistration

Before a blind run collects its first measurement, the user must accept or edit
a rule set. The default is offered explicitly as a default, not as the truth:

| rule | default |
|---|---|
| minimum tracking duration | 6 s |
| minimum tracked samples | 60 |
| maximum voltage drift within window | 0.5 % |
| maximum relative velocity uncertainty | 5 % |
| maximum quadratic residual t-statistic | 2.5 |
| droplet must remain ≥ 0.5 mm from either plate | on |
| minimum focus quality | 0.35 |
| charge-changing droplets | segment into separate observations |
| suspected evaporation | flag, do not auto-reject |
| maximum relative charge uncertainty | 15 % |

Rules can be applied automatically (the instrument marks candidates) but the
**decision is always the user's** and is always attributed: each acceptance
records whether it followed the rule or overrode it.

## 6. Amendments

Any change to the rules after collection begins creates a **protocol amendment**:

```
{ version, timestamp, previousRules, newRules, reason (required, ≥ 20 chars),
  measurementsCollectedAtTime, estimateViewedBeforeAmendment: bool }
```

The previous rules are preserved. Amendments are listed in the report. Nothing
is erased.

`estimateViewedBeforeAmendment` is the field that makes H8 checkable: it records
whether the user had seen an intermediate estimate before changing the rules.
The instrument records it without comment.

## 7. After the reveal

Revealing the ground truth **locks** the primary analysis. All subsequent
analysis is tagged and displayed as:

> **Outcome-aware exploratory analysis** — performed after the accepted value
> was disclosed. Not part of the preregistered result.

The locked analysis remains retrievable, unchanged, and is what the report
presents as the primary result.

## 8. What the instrument will never do

- Call an exclusion "correct" because it moved `ê` toward the accepted value.
- Rank exclusion policies by `|ê − e|` alone. Coverage and reproducibility are
  reported alongside, always.
- Suggest an exclusion based on its effect on the estimate.
- Praise the cherry-picked analysis in Mode F.
