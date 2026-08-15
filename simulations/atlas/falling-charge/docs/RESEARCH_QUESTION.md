# Research question

**The Falling Charge** — *A Millikan Oil-Drop Experiment in Measurement, Uncertainty, and Scientific Inference*

Version 0.1.0-milestone1 · Status: **Research prototype** (no independent scientific review yet)

---

## The objective, stated precisely

A user operating a simulated oil-drop apparatus must produce an estimate
`ê ± u(ê)` of the elementary electric charge, together with a defensible
statement about whether droplet charge is quantised, using only:

- quantities the apparatus can actually measure (times, distances, voltages,
  temperature, pressure, plate spacing),
- calibrations the user performs and records,
- an analysis method declared before the estimate is computed,
- and exclusion rules declared before the data are collected.

The accepted value of the elementary charge is **not** available to the user
during collection or analysis. It is released only after the user locks the
analysis.

The purpose is not to obtain 1.602 × 10⁻¹⁹ C. The purpose is to make visible
the chain by which a number that nobody can see becomes a number somebody can
defend.

---

## What is being recreated, and what is not

This simulation recreates **the experimental inference** that historically
established charge quantisation and produced the first good estimates of the
elementary charge — the logic of Millikan's 1913 paper.

It does **not** redefine, re-derive, or re-measure the modern SI constant.
Since the 2019 revision of the SI, the elementary charge is a *defined* exact
value, `e = 1.602 176 634 × 10⁻¹⁹ C`, and the ampere is defined in terms of it.
There is no longer any experiment that measures `e`; `e` is a fixed number and
experiments measure other things against it.

The distinction matters and is stated on the methods page:

| | Millikan, 1913 | Modern SI, since 2019 |
|---|---|---|
| `e` is | an unknown quantity to be measured | an exact defined constant |
| the experiment | estimates `e` from droplet motion | cannot estimate `e`; `e` defines the coulomb |
| uncertainty in `e` | real, and dominated by air viscosity | zero, by definition |
| what an oil-drop apparatus does today | — | a teaching instrument for measurement and inference |

Internally the simulation uses the exact SI value as the hidden ground truth
for generating droplet charges. That is a modelling convenience, not a claim
that the user is measuring the SI constant.

---

## RQ1 — Recoverability

Can a user infer the elementary unit of electric charge from noisy oil-drop
measurements without being shown the accepted value?

*Operationalised as:* over repeated blind sessions with default noise, what
fraction of locked analyses produce an interval that contains the hidden `e`,
and what is the distribution of `ê`?

## RQ2 — Model comparison

Does a quantised-charge model explain the measured droplet charges better than
a continuous-charge model?

*Operationalised as:* penalised fit comparison (AIC / BIC / held-out
likelihood) between Model Q (`qᵢ = nᵢe`) and Model C (`qᵢ ~ continuous`), on
both quantised and continuous synthetic datasets, reporting the classification
performance in both directions.

## RQ3 — Systematic effects

How much do systematic effects — air viscosity, temperature, pressure, plate
spacing, timing error, Brownian motion, slip correction — shift the inferred
charge?

*Operationalised as:* single-factor perturbation runs in batch mode, reporting
`Δê/ê` per unit miscalibration, so that a sensitivity ranking can be built
rather than asserted.

## RQ4 — Selection policy

How do transparent, preregistered measurement-rejection rules compare with
subjective or outcome-aware data selection?

*Operationalised as:* the same fixed dataset analysed under four policies
(none / preregistered / robust / outcome-aware), comparing not only `|ê − e|`
but interval coverage and run-to-run reproducibility.

## RQ5 — Sample size

How does increasing the number of measured droplets reduce random uncertainty
while leaving systematic uncertainty unresolved?

*Operationalised as:* `sd(ê)` and `bias(ê)` as functions of `N` droplets, under
correct and deliberately miscalibrated apparatus.

---

## Traceability

Every claim the finished instrument makes must be walkable backwards along this
chain. Where a link is not yet implemented, the roadmap says so.

```
research question
  → hypothesis                  docs/HYPOTHESES.md
  → physical equation           docs/PHYSICS_MODEL.md
  → parameter                   docs/PARAMETER_REGISTER.md
  → simulated event             src/droplets.js, src/physics.js
  → raw measurement             src/measurement.js  (never overwritten)
  → derived measurement         src/analysis.js     (recomputable, versioned)
  → acceptance decision         src/measurement.js  (reason required, retained)
  → statistical inference       src/analysis.js
  → uncertainty                 src/uncertainty.js
  → chart                       src/charts.js
  → report conclusion           src/reporting.js
```

## Non-goals

- Producing the right answer reliably. The apparatus is allowed to defeat the user.
- Scoring, ranking, or congratulating.
- Claiming historical fidelity beyond what is sourced in `REFERENCES.md`.
- Replacing a real laboratory. Simulated data are not experimental evidence
  about the world; they are evidence about this model.
