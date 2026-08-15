# Ethics and Limitations

## 1. What this is

A fictional, fully simulated research environment. No human subjects. No real-world
enforcement. No implementation of any policy. Every entity is a row in a NumPy array.

## 2. What this is not, and must never be presented as

* **Not evidence about real people.** Nothing here supports a claim about the abilities,
  needs, prospects or worth of any real person or group.
* **Not a policy recommendation.** The model contains institutions that would be
  ethically unacceptable in reality — allocating occupation and housing by test score,
  restricting births, mandating in-person welfare checks on the whole population. They
  are modelled *because* the research question is what such systems do, not because any
  of them is endorsed.
* **Not calibrated.** No parameter is fitted to empirical data. All are marked
  `not yet calibrated`. Numbers that look like life expectancies are model artefacts.
* **Not a psychometric claim.** The 11-dimensional structure, the g-loadings, the
  reliability coefficient and the heritability parameter are model knobs chosen to make
  the mechanism inspectable. They are not estimates of anything.

## 3. Substantive ethical hazards in the design, and how they are handled

| Hazard | Handling |
|---|---|
| The model could be read as endorsing IQ-based allocation | All three arms can succeed, stagnate or fail. Society A is not built to lose or to win; the matched triad at seeds 1–5 already shows a non-uniform ordering across outcomes. Every report states the arms' overlapping distributions. |
| IQ as a universal cause | Structurally prevented: cognition acts only through named pathways; the official battery deliberately omits four dimensions that jobs require; the health pathway is attenuable to near-zero. |
| Dehumanising framing of support needs | Support tracks need in all arms; higher support is not treated as better; over-support has a measured cost in lost independence; restrictive housing raises abuse vulnerability. |
| Eugenic reading of the fertility module | `iq_weighted` fertility is quarantined to a separate preregistered phase (H10), may never enter the primary comparison, and may never be reported at a single set of inheritance assumptions. No coercive reproductive mechanism is modelled; consent assumptions are stated in `POPULATION_MODEL.md`. |
| Abuse and trafficking content | Modelled abstractly as states, counts, durations and detection delays only. No graphic, procedural or narrative content is generated at any logging level. |
| Overclaiming from 1,000 runs | 1,000 runs measure *stochastic* uncertainty only. Parameter uncertainty is a separate, larger source addressed by the sensitivity framework. Tight confidence intervals across seeds say nothing about whether the parameters are right. |
| Language creep toward certainty | Fixed reporting phrasing: "reproducible in this model under the stated assumptions and parameter ranges". The words *indisputable*, *proven* and *established* are prohibited in outputs. |

## 4. Structural limitations of the current model

1. **No spatial structure.** Transport access, regional inequality and locality effects
   are parameters, not geography.
2. **No economy.** Output is a performance sum; there are no prices, markets, capital,
   trade or fiscal accounts. Claims about productivity are claims about a stylised index.
3. **No epidemiology.** Epidemics and pandemics are exogenous shocks, not transmission
   processes. Any pandemic-related result must carry this caveat.
4. **No household objects.** Family support, caregiver burden and multigenerational
   housing are approximated at the individual level.
5. **No assortative mating**, which matters materially for H10.
6. **No migration.**
7. **Single aggregate need index** rather than 19 scored domains.
8. **Governance acts through one quality index**; no legislation, parties or coalitions.
9. **Perpetrators are not strategic agents**, so adaptive evasion of safeguarding is
   absent and detection performance is likely optimistic.
10. **Sex is binary and used only for fertility eligibility.**
11. **500 years with fixed parameters** implies an implausibly static technological and
    cultural world; technology accumulates but institutions do not evolve.
12. **The absolute capability scale is anchored at year 0** and assumes the battery
    remains valid for five centuries — a strong assumption that no real instrument meets.

Each of these is a candidate for Milestone 2 or is a permanent scope boundary; the
distinction is recorded in `ASSUMPTION_REGISTER.md`.

## 5. Data and publication practice

* No fabricated citations. Where an empirical source would normally be cited and none has
  been established, the text says `not yet calibrated` or `not provided`.
* No fabricated results. Nothing in this repository reports an experiment that has not
  been run; the only quantitative results present are the benchmark measurements and the
  invariant test outcomes, both reproducible with the commands given.
* Preregistration is frozen before production runs; deviations are reported as deviations.
