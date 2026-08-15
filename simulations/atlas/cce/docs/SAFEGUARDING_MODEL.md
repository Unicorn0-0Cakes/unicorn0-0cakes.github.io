# Safeguarding Model

Code: `engine/cce_engine/safeguarding.py`.

## 1. Position

Abuse is **not set to zero**. A model in which harm cannot occur cannot measure whether a
safeguarding system works. What the civilization controls is *duration*: the default
regime is designed so that severe hidden abuse cannot persist undetected beyond a defined
maximum welfare-check interval, and the cost of that regime is measured alongside its
benefit.

Everything is modelled at an abstract research level: counts, states, durations and
detection delays. No graphic or procedural content is generated.

## 2. Vulnerability

```
vulnerability = 0.35·support_level_frac + 0.25·restrictive_housing + 0.20·(1 − adaptive)
              + 0.15·child + 0.15·elderly + 0.20·unmet_need_frac
```

Dependence on a caregiver, isolation in restrictive housing, and unmet support need are
the modelled risk factors — not test scores.

## 3. Initiation

`hazard = abuse_attempt_rate · (0.3 + 1.7·vulnerability)` per citizen-year for citizens
not already in an active situation. Default `abuse_attempt_rate = 0.0016`.

## 4. Detection mechanisms

Each of these provides an independent detection opportunity; in Milestone 0 they are
aggregated into a per-check effectiveness with a check frequency:

mandatory periodic in-person welfare checks · independent inspectors · randomised
inspections · private citizen interviews (out of earshot of caregivers) · medical anomaly
detection · school attendance monitoring · employment presence monitoring · household
composition checks · financial anomaly detection · anonymous reporting · safe exit
procedures · protected witness systems · cross-agency data review · inspector rotation ·
anti-corruption audits · independent judicial review · emergency extraction teams.

```
checks_per_year = 1 / welfare_check_interval
p_detect        = 1 − (1 − effectiveness)^checks_per_year
effectiveness  ← effectiveness · (0.85 + 0.3 · gov_quality)      # clipped to [0,1]
compromised inspectors (rate `inspector_corruption_rate`) detect at 40% of that rate
```

## 5. The duration cap

After the probabilistic pass, any situation whose age reaches
`max_undetected_duration` (default 1.0 year) is **forced** to detection and counted
separately as `abuse_forced_detected`. This makes the safeguarding guarantee explicit and
auditable rather than an emergent hope. Asserted by
`test_hidden_abuse_cannot_persist_beyond_safeguard_interval` in all three arms.

## 6. Intervention

Detected situations enter intervention; each year, `intervention_success` (default 0.88)
resolves them. Unresolved situations remain in intervention and are re-counted, so
institutional failure to act is visible in the log rather than invisible.

## 7. Costs and harms of the regime itself

`false_positive_rate` (default 0.012 per check) generates incorrect findings. At one check
per citizen per year and 100,000 citizens that is ~1,200 false positives annually — a
deliberate reminder that near-total detection is not free. Administrative cost, privacy
intrusion and autonomy loss are logged as counts now and monetised at **[M2]**.

## 8. Logged outputs

`abuse_initiated · abuse_detected · abuse_forced_detected · abuse_active_end ·
abuse_intervening · abuse_resolved · mean_detection_delay_years ·
max_detection_delay_years · welfare_checks · false_positive_findings ·
inspectors_compromised`, plus `safeguarding_detection` events and per-citizen
`abuse_state` in the panel.

## 9. Sensitivity range

`safeguard_detection_effectiveness ∈ [0.90, 1.00]`,
`max_undetected_duration ∈ [1 month, 1 year]`,
`welfare_check_interval ∈ [1 month, 1 year]`,
`inspector_corruption_rate ∈ [0, 0.05]`.

The default targets near-total prevention of *prolonged* hidden abuse. The sweep exists to
quantify what weaker systems cost in delay, harm and preventable mortality, and what
stronger ones cost in money, false positives and privacy (H9).

## 10. Limitations

* Detection mechanisms are aggregated into one effectiveness parameter rather than
  modelled as separate, partially correlated channels. Correlated failure (all channels
  compromised at once) is therefore under-represented. **[M2]**
* Perpetrators are not modelled as agents with strategies, so adaptive evasion is absent.
* Harm severity is binary (severe / not), so gradations of neglect are not captured.
