# Reproducibility

## 1. Determinism contract

Given `(model_version, parameter_set_id, society, seed)` the engine produces an identical
trajectory and identical output bytes. Verified by
`test_identical_seeds_reproduce_identical_results` and by
`recorder.result_digest`, a SHA-256 over every numeric field of every annual row.

Sources of non-determinism that are explicitly excluded:

* No wall-clock or PID entropy anywhere. All RNGs derive from
  `SeedSequence((run_seed, society_code, stream_index, RNG_LAYOUT_VERSION))`.
* No `set`/`dict` iteration over unordered collections in numeric paths.
* No parallelism *inside* a run. Parallelism is across runs only, so worker count cannot
  change results.
* No floating-point reduction-order variability: array shapes and operation order are
  fixed by the schedule, not by data.

## 2. Random-number stream layout

| Stream | Seeded from | Consequence |
|---|---|---|
| `population_init` | seed only | identical baseline population in A, B and C |
| `shocks` | seed only | identical external history in A, B and C |
| `mortality`, `morbidity`, `cognition_noise`, `testing`, `fertility`, `employment`, `housing`, `support`, `safeguarding`, `government`, `misc` | seed + society | free to diverge between arms |

The shock stream consumes a **fixed 24 values per simulated year**, regardless of state,
so the two arms cannot fall out of step. Adding an event type means appending to the block
and bumping `RNG_LAYOUT_VERSION`; positions are never inserted in the middle.

## 3. Replay

Every run is reconstructable from: model version · initial population manifest (seed +
generation code) · parameters · seed · event stream · checkpoints.

```bash
# reproduce a run exactly
python3 -m cce_engine.cli run --society A --seed 1 --years 500 --population 100000 \
        --run-number 1 --tag main --out runs/CCE-A-0001

# forensic replay of the same run
python3 -m cce_engine.cli run --society A --seed 1 --years 500 --population 100000 \
        --run-number 1 --tag main --logging forensic --out replay/CCE-A-0001
```

Checkpoints capture agent state, all RNG stream states, government objects, medical and
technology levels, the normalisation reference sample, and counters — enough to resume to
a byte-identical future (`test_checkpoint_restore_reproducibility`). A checkpoint refuses
to load against a different parameter fingerprint.

## 3a. Batch reproducibility

Parallelism is **across runs only**; each run is single-threaded and
deterministic, so worker count cannot change results. Numeric libraries are
pinned to one thread per process (`OMP/OPENBLAS/MKL/VECLIB/NUMEXPR_NUM_THREADS=1`)
in the controller before the pool is created and again in each worker, so BLAS
threading cannot vary reduction order between machines.

`test_parallel_workers_produce_identical_results_to_serial` asserts that a
1-worker and a 2-worker batch produce field-identical outcomes despite completing
in different orders.

Run numbering is a property of the batch, persisted in `seed_list.csv`, so a
batch resumed or extended with a different seed range keeps its identity mapping
and its output paths.

## 4. Provenance stamped in every run manifest

`experiment_id · society · run_number · seed · model_version · git_commit ·
parameter_set_id (SHA-256 prefix of the full parameter dict) · years · capacity ·
logging_level · run_tag · status · normalization_method · fertility_policy ·
births_denied_total · python_version · numpy_version · platform · machine ·
started_utc · completed_utc · wall_seconds · worker_pid · per-file SHA-256, format
and byte counts · retention record · write time`

Every file written is checksummed, including both copies when a table is stored
in CSV and Parquet: listing only one would leave the other unverified.

Changing any parameter changes `parameter_set_id`, so runs from different parameter sets
cannot be silently pooled.

## 5. Environment

* Python ≥3.10, NumPy only for the engine (no other runtime dependency).
* Optional: pyarrow (parquet output), pytest, polars/duckdb/scipy/statsmodels/matplotlib
  for analysis.
* `requirements.txt` pins the analysis stack; the engine deliberately has a minimal
  dependency surface so that a 500-year run is not hostage to a library upgrade.
* Record `python --version`, `numpy.__version__`, OS and CPU in the campaign manifest.

## 6. Traceability chain

Every number in a report can be walked back:

```
research question → hypothesis → parameter (registry entry, code location)
   → simulation rule (module + function) → seed → stored output file (+SHA-256)
   → statistical analysis (script) → chart or table → PDF report (+manifest)
```

Reports are generated from stored data only; no figure or table is transcribed by hand.
