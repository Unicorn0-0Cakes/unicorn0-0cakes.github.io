# Risk Register

Severity × likelihood on the project's ability to produce a defensible result.

## Scientific risks

| # | Risk | Sev | Lik | Mitigation | Status |
|---|---|---|---|---|---|
| S1 | The model is read as evidence about real people | High | High | Disclaimer on every screen, report cover and module docstring; fixed reporting language; `ETHICS_AND_LIMITATIONS.md` | mitigated |
| S2 | Results are artefacts of uncalibrated parameters | High | High | Every parameter marked `not yet calibrated`; global sensitivity mandatory before any headline claim; conclusions that reverse in-range are reported as not robust | planned (M4) |
| S3 | An arm wins because of a modelling choice rather than its rule (e.g. free scaffolding) | High | Medium | Scaffolding costed; mismatch penalises both shortfall and unused capability; matched seeds; equalised-cost sensitivity run | mitigated |
| S4 | 1,000 runs produce tight CIs that get mistaken for certainty | High | High | MCSE next to every mean; SESOIs; TOST; explicit statement that seeds measure stochastic uncertainty only | mitigated in plan |
| S5 | Silent change of normalisation method or parameters mid-campaign | High | Low | Method stamped in every manifest; parameter fingerprint; analysis refuses to pool differing fingerprints | mitigated |
| S6 | Multiplicity across dozens of outcomes | Medium | High | Three preregistered primary outcomes; everything else labelled secondary/exploratory | mitigated in plan |
| S7 | H10 (IQ-weighted fertility) is reported without its assumption sweep and reads as a eugenic finding | High | Medium | Quarantined to a separate phase; reporting rule forbids single-setting numbers; assortative mating flagged as a missing mechanism | mitigated in plan |
| S8 | Pandemic/epidemic conclusions drawn from an exogenous shock model | Medium | Medium | Caveat required wherever epidemic results appear; SEIR layer is an M2 candidate | open |
| S9 | Pattern validation never done, so the model is internally consistent but demographically implausible | Medium | Medium | Eight pattern targets with tolerance bands; failure blocks code freeze | planned (M1/M4) |

## Technical risks

| # | Risk | Sev | Lik | Mitigation | Status |
|---|---|---|---|---|---|
| T1 | Runtime or storage far exceeds expectations | High | Low | Measured: 29 s and 75 MB per full run; 24 core-hours and 25–45 GB for the campaign; revisit trigger at 5 min/run | mitigated |
| T2 | Matched arms drift out of shock alignment as the model grows | High | Medium | Fixed 24-slot shock block per year, append-only positions, `RNG_LAYOUT_VERSION`, automated test in all arms | mitigated |
| T3 | Non-determinism creeps in (parallelism, dict order, time-based seeds) | High | Medium | No in-run parallelism; no wall-clock entropy; digest test on every model version; golden regression digests | mitigated |
| T4 | Checkpoint resume diverges from an uninterrupted run | Medium | Medium | Checkpoint includes RNG stream states, government objects and counters; automated equality test | mitigated |
| T5 | Log volume makes the campaign unmanageable | Medium | High | Tiered logging; panel dominates and is tunable; parquet + zstd; forensic mode on demand only | mitigated |
| T6 | Data dictionary drifts from emitted columns | Low | High | `check_data_dictionary.py` fails the build on any undocumented column | mitigated |
| T7 | Parameter register drifts from code | Low | High | Register is generated from the code registry | mitigated |
| T8 | Milestone 2 fidelity makes the engine 10× slower | Medium | Medium | Even at 10× the campaign is ~240 core-hours; compiled kernel remains an option behind the existing interface | accepted |
| T9 | pyarrow unavailable in the target environment, so storage estimates are wrong | Low | Medium | CSV fallback implemented; parquet figure explicitly labelled an estimate until measured | open |

## Process risks

| # | Risk | Sev | Lik | Mitigation |
|---|---|---|---|---|
| P1 | Exploratory runs leak into main results | High | Medium | Mandatory `run_tag`; analysis refuses to mix tags |
| P2 | Preregistration written after seeing results | High | Low | Freeze before any `main`-tagged run; amendments dated and reported both ways |
| P3 | Reports hand-transcribed and drift from data | Medium | Medium | Reports generated from stored data only; checksum verification before a report is accepted |
| P4 | Fabricated citations or effect sizes creep into the write-up | High | Low | Explicit prohibition; `not yet calibrated` / `not provided` labels; no result reported that has not been run |
