# The Cognitive Civilization Experiment

A local-first agent-based research instrument comparing three systems for allocating work,
housing, assistance, representation and social responsibility in a **fictional, fully
simulated** society of 100,000 citizens over 500 years.

> **Scientific disclaimer.** This is a simulation. No human subjects, no real-world
> enforcement, no policy implementation. No parameter is calibrated to empirical data.
> Results are reproducible findings *conditional on the model's assumptions and parameter
> ranges* — never indisputable, and never claims about real people.

**Model version 0.1.0-milestone0** · Parameter set `2d6343f41b392d36` · 92 registered
parameters · 43/43 tests passing (21 invariant + 22 batch) under
`PYTHONWARNINGS=error`.

## The three societies

| | Allocation of work, housing, office | Assistance | Accessibility |
|---|---|---|---|
| **A — IQ-allocated** | By official relative IQ score | By assessed need | Low (0.35) |
| **B — Universal cognitive support** | By preference, qualification, experience, capacity | By assessed need | High (0.90), costed at 11% of output |
| **C — Multidimensional competency** | By weighted fit across 11 competency dimensions plus expertise and experience | By assessed need | Medium (0.65) |

Government, population cap, fertility policy, measurement rules, mortality model,
safeguarding regime and the external event history are **identical** across arms. Runs
sharing a seed also share an identical baseline population and an identical shock history,
so differences are attributable to the allocation rule.

## Browse the results

`cce.html` is a self-contained results explorer — real output from completed runs, embedded at
build time, with no second implementation of the model. Overview, the three societies, a
500-year dashboard, matched-seed paired contrasts, government, methodology and provenance.
See `USER_MANUAL.md`. Regenerate it from stored output with:

```bash
python3 analysis/export_web_data.py --pilot batches/rehearsal-30
```

## Quick start

```bash
cd cce

# a single 100-year run of Society B on 10,000 citizens
python3 -m cce_engine.cli run --society B --seed 1 --years 100 \
        --population 10000 --out runs/CCE-B-0001          # from ./engine

# a matched A/B/C triad on one seed
python3 -m cce_engine.cli triad --seed 1 --years 200 --population 10000

# a 30-seed matched-seed batch across all three arms
python3 -m cce_engine.cli batch --societies A B C --seed-start 1 --seed-count 30 \
        --years 500 --population 100000 --workers 4 --tag exploratory \
        --out batches/pilot-30

# verify a single run directory
python3 -m cce_engine.cli verify runs/CCE-A-0001 --society A --seed 1

# the test suites (21 invariants + 22 batch)
python3 engine/tests/test_invariants.py
python3 engine/tests/test_batch.py

# measured performance at the three required scales
python3 -m cce_engine.benchmark --scales 10000x100,100000x100,100000x500

# regenerate the parameter register and verify the data dictionary
python3 analysis/gen_parameter_register.py
python3 analysis/check_data_dictionary.py
```

Requires Python ≥3.10 and NumPy. Everything else is optional.

## Measured performance

| Scale | Wall time | Peak RSS | Output |
|---|---|---|---|
| 10,000 × 100 y | 0.92 s | 88 MB | 8.8 MB |
| 100,000 × 100 y | 5.91 s | 176 MB | 15.4 MB |
| 100,000 × 500 y | **29.1 s** | 554 MB | 75.0 MB |

Full campaign (3,000 runs, 1.5 × 10¹¹ agent-years): **24 core-hours**, 25–45 GB with
columnar compression. Measured on a 3-core ARM container, single-threaded — see
`docs/COMPUTE_AND_STORAGE_ESTIMATE.md` for the caveats.

## Documentation

| | |
|---|---|
| `docs/RESEARCH_QUESTION.md` | The question, estimand, outcome families, falsification conditions |
| `docs/HYPOTHESES.md` | H1–H10 with mechanisms, measures, SESOIs, falsifiers |
| `docs/ODD_PROTOCOL.md` | Overview, Design concepts, Details |
| `docs/EXPERIMENTAL_DESIGN.md` | Arms, controls, confounds, phases |
| `docs/COGNITIVE_MODEL.md` | Two measurements, observation model, inheritance |
| `docs/SUPPORT_MODEL.md` | Adaptive functioning, needs, support levels, housing |
| `docs/HEALTH_AND_MORTALITY_MODEL.md` | Pathways, hazards, Sullivan life table |
| `docs/POPULATION_MODEL.md` | Cap, permits, waiting, inheritance |
| `docs/GOVERNANCE_MODEL.md` | Presidency, assembly, accountability |
| `docs/SAFEGUARDING_MODEL.md` | Welfare checks, detection, duration cap |
| `docs/STATISTICAL_ANALYSIS_PLAN.md` | Run-level inference, SESOIs, sensitivity |
| `docs/VALIDATION_PLAN.md` | 21 invariants, test types, pattern validation |
| `docs/BATCH_EXECUTION.md` | Matched-seed campaigns: pool, resume, quarantine, run tags |
| `docs/PILOT_ANALYSIS_PLAN.md` | What the 30-seed pilot is for, and what it may not conclude |
| `docs/PARAMETER_REGISTER.md` | All 92 parameters (generated from code) |
| `docs/DATA_DICTIONARY.md` | Every stored column (completeness enforced) |
| `docs/DATA_MODEL.md` | Entities, relationships, storage layout |
| `docs/ARCHITECTURE.md` | Engine decision and layering |
| `docs/ASSUMPTION_REGISTER.md` | Every open decision and the default chosen |
| `docs/RISK_REGISTER.md` | Scientific, technical and process risks |
| `docs/REPRODUCIBILITY.md` | Determinism contract, streams, replay, provenance |
| `docs/ETHICS_AND_LIMITATIONS.md` | What this is not; structural limitations |
| `docs/PREREGISTRATION_DRAFT.md` | To be frozen before production runs |
| `docs/COMPUTE_AND_STORAGE_ESTIMATE.md` | Measured benchmarks and projections |
| `docs/ROADMAP.md` | Milestones 0–5 and repository layout |

## Status

Milestone 0 complete. Milestone 1 kernel complete. Milestone 3 batch runner built
and validated through five gates (see `BATCH_EXECUTION.md` §8); charts, PDF
reporting, golden regression digests and pattern validation remain outstanding.

**No production campaign has been run and no scientific findings exist.** The only
quantitative results in this repository are benchmark measurements, test outcomes,
and exploratory-tagged engineering runs. A working batch runner does not make the
experiment scientifically ready — the blockers are listed in
`PILOT_ANALYSIS_PLAN.md` §6.
