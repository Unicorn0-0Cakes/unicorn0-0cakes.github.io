# Development Roadmap

## 1. Repository structure

```
cce/
├── README.md
├── requirements.txt
├── benchmarks/
│   └── milestone0_reference_python.json      measured, this machine
├── docs/                                     18 specification documents
├── params/
│   └── baseline.json                         generated from the code registry
├── engine/
│   ├── cce_engine/
│   │   ├── rng.py           named deterministic streams, shared vs arm-specific
│   │   ├── params.py        parameter registry (92 entries, single source of truth)
│   │   ├── state.py         columnar agent state, slot reuse, checkpointing
│   │   ├── cognition.py     latent profile, ageing, observation, normalisation,
│   │   │                    banding, inheritance
│   │   ├── occupations.py   24 sectors, multidimensional requirement profiles
│   │   ├── models.py        adaptive function, support, housing, employment, health
│   │   ├── government.py    presidency, assembly, corruption, accountability
│   │   ├── safeguarding.py  welfare checks, detection, duration cap, intervention
│   │   ├── events.py        shock decoding and absorption
│   │   ├── recorder.py      tiered logging, manifests, checksums, digests
│   │   ├── kernel.py        annual step, life table, fertility, assessment, finalise
│   │   ├── benchmark.py     measured performance harness
│   │   └── cli.py           run · triad · params
│   └── tests/
│       └── test_invariants.py                18 invariants, all passing
├── analysis/
│   ├── gen_parameter_register.py             docs generated from code
│   └── check_data_dictionary.py              fails on undocumented columns
├── runs/                                     run outputs (gitignored)
└── ui/                                       [M2]
```

## 2. Milestones

### Milestone 0 — Scientific and technical specification · **COMPLETE**
Assumption register · research design · ODD outline · data model and ERD · system
architecture · performance plan (measured) · storage estimate (measured) · risk register ·
repository structure · roadmap · parameter registry (92 entries) · reference kernel ·
18 passing invariant tests.

### Milestone 1 — Minimal vertical slice · **kernel complete, reporting outstanding**
10,000 citizens · 100 years · one selectable society · annual ageing · births · deaths ·
population cap · five-year cognitive testing · basic employment · basic support ·
government representation · presidential selection · deterministic seeds · checkpointing ·
automated invariant tests — **all done**.
Outstanding: basic charts, one generated PDF run report, golden regression digests,
property-based tests over the registered parameter ranges, pattern-validation targets 1–4.

### Milestone 2 — Full individual simulation
100,000 citizens · 500 years · all three arms · emergency medical assessment as a distinct
logged event · 19-domain needs model · explicit households and caregivers · retraining and
voluntary career change · coarse regions for transport and housing access · legislation and
coalitions · expanded legal model (act / responsibility / intent / capacity / vulnerability
/ coercion / safeguards / disposition) · DALYs and years-requiring-intensive-assistance ·
optional epidemic transmission layer · full reports.

### Milestone 3 — Production batch runner
1,000 runs per arm on shared seeds 1–1000 · parallel worker pool · pause and resume ·
failure recovery with same-seed rerun · batch manifests and index · batch reports ·
statistical analysis package (matched-pair differences, bootstrap CIs, MCSE, effect sizes,
`P(A>B)`, collapse probability, recovery time).

### Milestone 4 — Scientific validation
Calibration where sources can be established · pattern-oriented validation against the
eight targets · OFAT → Latin hypercube → Sobol sensitivity · robustness and corner
scenarios · preregistration freeze · code freeze · reproducibility package · manuscript-ready
outputs.

### Milestone 5 — Separate IQ-weighted fertility phase (H10)
Own preregistration; reported only jointly with the inheritance-assumption sweep and with
assortative mating implemented, since its absence materially affects the result.

## 3. Immediate next steps

1. Golden regression digests + property-based invariant tests over parameter ranges (M1).
2. Matplotlib figure set and the Typst/Quarto run-report pipeline; verify the report
   reproduces stored data byte-for-byte (M1).
3. Pattern-validation targets 1–4 with tolerance bands (M1).
4. Batch runner and matched-triad orchestration at 10,000 citizens before scaling (M3 prep).
5. Re-measure storage with pyarrow available, then fix the retention policy (T9).
