# System Architecture

## 1. Recommendation

**Reference engine: vectorised NumPy, Python ≥3.10. No compiled kernel for Milestones
1–4.**

The brief prefers a compiled kernel and permits pure Python only if benchmarks
demonstrate the required scale. They do: the full 3,000-run campaign
(1.5 × 10¹¹ agent-years) costs a **measured 24 core-hours** at 1.7 million agent-years per
second per core, on a small 3-core ARM container
(`COMPUTE_AND_STORAGE_ESTIMATE.md`). A Rust kernel would add a second implementation to
keep correct, a cross-validation burden, and a barrier between the scientists and the
model, in exchange for headroom the project does not need.

The decision is reversible by construction: the kernel is behind a narrow interface
(columnar state arrays, named RNG streams, one `step()` per year), so a Rust/Numba kernel
can be added later and validated digest-for-digest against the Python oracle.
**Revisit trigger: per-run wall time at 100,000 × 500 exceeding 5 minutes.**

## 2. Layers

```
┌──────────────────────────────────────────────────────────────┐
│ UI  — local web app (React + TypeScript, Tauri or localhost)  │  [M2]
│      Home · Society Selector · Scenario Builder · Single Run  │
│      Batch · Dashboard · Citizen Inspector · Government ·     │
│      Results · Methodology · Reports                          │
└───────────────┬───────────────────────────────────────────────┘
                │ JSON over local HTTP / IPC
┌───────────────▼───────────────────────────────────────────────┐
│ Orchestration — batch runner: matched seeds, worker pool,      │  [M3]
│ pause/resume, failure recovery, batch manifests                │
└───────────────┬───────────────────────────────────────────────┘
┌───────────────▼───────────────────────────────────────────────┐
│ Engine (implemented)                                           │
│  rng · params · state · cognition · occupations · models ·     │
│  government · safeguarding · events · recorder · kernel · cli  │
└───────────────┬───────────────────────────────────────────────┘
┌───────────────▼───────────────────────────────────────────────┐
│ Storage — Parquet (CSV fallback) + JSON manifests + SHA-256    │
└───────────────┬───────────────────────────────────────────────┘
┌───────────────▼───────────────────────────────────────────────┐
│ Analysis — Polars/DuckDB over run outputs, NumPy/SciPy/        │  [M3]
│ statsmodels for effect sizes and sensitivity, Matplotlib       │
│ figures, Typst or Quarto → PDF reports                         │  [M1]
└───────────────────────────────────────────────────────────────┘
```

## 3. Engine design rules

1. **Structure of arrays, never objects per agent.** Every per-citizen quantity is a
   NumPy column of length `population_cap`.
2. **Slot reuse makes the population cap structural.** A birth needs a free slot; only a
   death creates one.
3. **No Python loop over agents.** Loops are permitted only over the 24 occupations and
   the 10 bands — bounded, tiny, and vectorised inside.
4. **Named RNG streams, never a global RNG.** Shared vs society-specific streams are
   declared in one table (`rng.py`).
5. **Fixed-size shock block per year** so matched arms cannot fall out of step.
6. **Parameters only from the registry.** `Params.override` rejects unregistered names,
   so a typo cannot silently create a new knob.
7. **Every output file is checksummed and manifested**; retention choices are recorded,
   never implicit.

## 4. Parallelism

Across runs only. Each run is single-threaded, deterministic and independent, so a run is
the unit of scheduling, retry and checkpoint. Worker count can never change results.
Batch layout: `multiprocessing` pool locally; the same manifest format supports a
distributed scheduler later without changing the engine.

## 5. Performance profile (measured)

Per-year cost at 100,000 citizens is ~58 ms, dominated by: annual health update, adaptive
functioning, mortality hazard, and the per-year life-table bincounts. Occupational
reallocation runs only on the 5-year cycle and uses `argpartition` (O(n)) rather than a
sort; support rationing uses the level histogram rather than a sort. Both were chosen
after profiling showed sorts dominating at 100k.

## 6. Repository layout

See `ROADMAP.md` §1 and the top-level `README.md`.
