# Risk register

Likelihood and impact on 1–5. **Validation status** is the honest state today.

---

## Scientific risks

| id | risk | L | I | detection | mitigation | status |
|---|---|---|---|---|---|---|
| R-S1 | Slip-correction coefficients or their validity range are wrong | 3 | 4 | hand-checked `C_c` values in `tests/test-physics.js`; comparison of the two coefficient sets | two sourced sets offered; correction can be disabled; provenance documented | **partially validated** — values checked against secondary sources, primary papers not read |
| R-S2 | Hidden circular use of the accepted `e` | 2 | **5** | `tests/test-no-circularity.js` greps analysis modules for `truth`, `SI.e`, `readTruth`; truth vault throws before reveal | structural isolation (`ARCHITECTURE.md` §4) | **partially validated** — a grep cannot prove absence |
| R-S3 | Force signs wrong | 2 | 5 | `tests/test-forces.js` asserts direction for all four procedures and both polarities | single sign convention documented and used once | **validated** for the implemented cases |
| R-S4 | Understated uncertainty from correlated Brownian residuals | 4 | 4 | end-to-end test; null-distribution calibration of the curvature rule | Brownian-aware standard error `√(2D/T)`, `D` estimated from residual increments | **mitigated** — see `LIMITATIONS.md` L-1. Residual: `D̂`'s own sampling error is not propagated |
| R-S5 | Unrealistic noise magnitudes | 4 | 3 | none | parameters registered as *Not yet calibrated* | **open** |
| R-S6 | Model comparison favours Model Q by construction | 3 | **5** | two-sided test on continuous synthetic data is a *required gate* for shipping Milestone 4 | feature not shipped until the gate passes | **not applicable yet** — feature not built |
| R-S7 | Radius inversion outside valid range | 2 | 3 | `Kn` and `Re` range flags | flags surfaced, not clamped | **validated** |
| R-S8 | Viscosity temperature dependence wrong | 2 | 4 | hand-checked `η(293.15) = 1.813e-5` | Sutherland form, constants registered as secondary | **partially validated** |
| R-S9 | Overconfident inference presented to the user | 3 | 4 | — | random and systematic reported separately; sig-fig limiter; L-1 stated on the panel | **partially mitigated** |
| R-S10 | Users treat simulated output as experimental evidence | 3 | 4 | — | stated on the reveal screen, in every export manifest, and on the catalogue card | **mitigated by disclosure only** |

## UX risks

| id | risk | L | I | detection | mitigation | status |
|---|---|---|---|---|---|---|
| R-U1 | Impressive apparatus, opaque science | 3 | 4 | — | every derived number shows its equation, inputs, and assumptions | **partially mitigated** |
| R-U2 | Automation removes the reasoning | 3 | 4 | — | radius and charge require the user to have taken the right observations; no auto-measure | **mitigated** |
| R-U3 | Manual timing is tedious | 4 | 2 | — | modern mode automates tracking; historical mode is opt-in | **mitigated** |
| R-U4 | Rejection workflow teaches cherry-picking | 3 | **5** | exclusion-order timeline records whether an estimate was viewed first | preregistration; reasons required; nothing deleted; no estimate-improving hints | **partially mitigated** — Mode F, the part that actually teaches the distinction, is not built |
| R-U5 | Users cannot find a usable droplet and give up | 3 | 3 | — | guided mode; suitability warnings | **partially mitigated** |

## Technical risks

| id | risk | L | I | detection | mitigation | status |
|---|---|---|---|---|---|---|
| R-T1 | Frame-rate-dependent physics | 3 | 5 | `tests/test-determinism.js` runs the same simulated time in 1, 7 and 331 chunks and asserts bit-identical state | fixed-step accumulator | **validated** |
| R-T2 | Non-deterministic across browsers | 3 | 3 | not tested | integer PRNG; `Math.exp`/`Math.log` are not bit-guaranteed by ECMA-262 | **open** — documented in `REPRODUCIBILITY.md` §5 |
| R-T3 | Floating-point instability near balance | 3 | 4 | `tests/test-stability.js` runs 10⁵ steps at `v ≈ 0` | exact exponential integrator; `expm1` for small arguments | **validated** |
| R-T4 | Main thread blocked | 2 | 3 | manual | bootstrap is ~30 ms; batch mode not built | **not applicable yet** |
| R-T5 | Export/report mismatch | 3 | 4 | not tested | report and charts read the same analysis object | **open** — PDF report not built, so the test cannot exist yet |
| R-T6 | Charts inaccessible | 3 | 4 | manual | table + prose per chart | **partially validated** |
| R-T7 | Data loss | 3 | 3 | — | `localStorage` snapshot on every state change | **open** — IndexedDB not implemented (`LIMITATIONS.md` L-8) |
| R-T8 | Mobile layout failure | 3 | 2 | manual | stacking breakpoints at 1100 and 720 px | **partially validated** |

---

## The three that most deserve attention

1. **R-S6** — the model comparison is unbuilt, and building it badly would be
   worse than leaving it out.
2. **R-U4** — the rejection workflow exists but the mode that teaches its
   misuse does not.
3. **R-S5** — the noise magnitudes and the droplet population are invented, so
   the instrument's apparent difficulty is a design choice rather than a
   measured property of any real apparatus.

**Removed from this list:** R-S4, understated uncertainty, which was the top
entry until it was found and fixed during end-to-end testing. The way it was
found is instructive: it did not show up as a wrong uncertainty, it showed up as
a wrong *physical conclusion* — the inferred charge landed on a sub-multiple
because overconfident errors let neutral droplets into the dataset.
