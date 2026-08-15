# Batch Execution

How matched-seed campaigns are run, verified, resumed and summarised.
Code: `engine/cce_engine/batch.py`, `verify.py`, `stats.py`. Tests:
`engine/tests/test_batch.py` (22, all passing under `PYTHONWARNINGS=error`).

## 1. Run-class taxonomy — never pooled

Every run carries a `run_tag`, and the analysis refuses to mix them.

| Tag | Meaning | May enter a paper as a result? |
|---|---|---|
| `debug` | engineering tests, gates, smoke runs | no |
| `calibration` | fitting or benchmarking runs | no |
| `exploratory` | pilots, look-and-see runs, everything before preregistration freeze | no — reported as exploratory only |
| `sensitivity` | parameter sweeps | yes, labelled as sensitivity analysis |
| `main` | preregistered production campaign, after freeze | yes |

**A working batch runner does not make the experiment scientifically ready.**
Nothing in this document licenses a `main`-tagged campaign; that requires the
preregistration freeze, calibration status, and the blockers in §9.

## 2. Command

```bash
python -m cce_engine.cli batch \
  --societies A B C \
  --seed-start 1 --seed-count 30 \
  --years 500 --population 100000 \
  --workers 4 --logging standard --tag exploratory \
  --out batches/pilot-30
```

Explicit seed list, which **takes precedence** over `--seed-start`/`--seed-count`:

```bash
--seed-file seeds/pilot_30.csv        # CSV with a `seed` column, or one int per line
```

Duplicate seeds are rejected: a repeated seed would double-weight one draw of
the external history.

| Flag | Effect |
|---|---|
| `--resume` (default) | skip runs that pass full verification |
| `--no-resume` | re-execute even verified runs |
| `--retry-failed` | re-attempt runs that previously failed |
| `--verify-only` | verify without executing; quarantines what fails |
| `--no-quarantine` | strictly read-only audit; report without moving anything |
| `--dry-run` | print the plan and the memory estimate, execute nothing |

Single-run verification:

```bash
python -m cce_engine.cli verify runs/CCE-A-0001 --society A --seed 1 \
    --years 500 --population 100000
```

## 3. Execution architecture

* **Process pool, not threads** (`multiprocessing` with the `spawn` context), so
  the GIL is irrelevant and a crashed worker cannot corrupt the controller.
* **One run = one society × one seed.** Matched arms share a seed by
  construction.
* **Order-independent.** Runs execute in any order; identity, output path and
  pairing derive from (society, seed) alone. Verified by
  `test_parallel_workers_produce_identical_results_to_serial`, which compares
  1-worker and 2-worker batches field by field.
* **No nested BLAS oversubscription.** `OMP_NUM_THREADS`, `OPENBLAS_NUM_THREADS`,
  `MKL_NUM_THREADS`, `VECLIB_MAXIMUM_THREADS` and `NUMEXPR_NUM_THREADS` are all
  set to `1`, in the parent before the pool is created (so children inherit
  under both fork and spawn) and again in the worker initialiser.
* **Worker count** is configurable; the default is conservative —
  `min(cpu_count - 1, 60% of available RAM / estimated per-worker RSS)`.
* **Estimated peak RAM is printed before launch**, with a warning if the total
  would exceed 85% of available memory.
* **No two workers may write to the same run directory**; asserted in
  `build_specs` before any worker starts.

## 4. Run identity

`CCE-{society}-{run_number:04d}`, e.g. `CCE-A-0001`, `CCE-B-0001`, `CCE-C-0001`.

Run number is the seed's 1-based position **in the batch**, so matched arms share
it. Run number and seed are recorded separately in every manifest even when they
coincide, because they coincide only by construction.

Positions persist in `seed_list.csv` and are reused when a batch is extended or
resumed with a different seed range. Without this, a second invocation would
restart numbering at 1 and collide with the first invocation's directories
(`test_batch_extension_preserves_run_numbering`).

Each run manifest retains: experiment ID · society · run number · seed · years ·
population · model version · git commit · parameter-set fingerprint · Python
version · NumPy version · platform · machine architecture · start time ·
completion time · wall time · worker PID · status · error information · per-file
SHA-256 checksums · run tag.

## 5. Directory layout

```
batches/pilot-30/
    batch_manifest.json      provenance, completion rate, controller environment
    batch_status.json        rewritten atomically after every run
    seed_list.csv            seed -> run number, stable across invocations
    runs/CCE-A-0001/ ...     one directory per run
    quarantine/<UTC>/...     failed-verification runs, with QUARANTINE_REASON.txt
    summaries/
        run_summary.csv          one row per completed run
        seed_paired_summary.csv  per-seed paired differences
        arm_summary.csv          between-seed distribution per arm
        paired_contrasts.csv     the treatment estimates
        shock_response.csv       outcome vs stochastic-history exposure
        failures.csv             type, message, traceback, stage, elapsed
        runtime_summary.csv      per-arm and overall timing
    logs/CCE-A-0001.log      per-run log
    reports/pilot_summary.md generated from the stored data
```

## 6. Reliability and recovery

**Idempotent and resumable.** An existing run is treated as complete only if it
passes the full gate in `verify.verify_run`: manifest present, status
`completed`, society/seed/years/population matching what was asked for, every
declared file present, **every file matching its recorded SHA-256**, the expected
number of annual rows, the population cap never exceeded, every populated band
represented, no hidden abuse beyond the safeguard interval, and no unjustified
non-finite values. Passing runs are recorded as `verified_existing` and skipped.

**Legitimate missing values are validated semantically, not waved through.**
`official_iq`/`official_se` may be absent only where `band == -1`;
`president_iq` only where no president is seated. Each exemption is paired with
a check establishing *why* the value is absent, so arithmetic corruption can
never hide behind a legitimate blank. An unclassified citizen older than 24 is a
failure, because classification is at age 20 on a 5-year cycle.

**Quarantine, not deletion.** Anything incomplete or corrupt is moved to
`quarantine/<UTC timestamp>/<run id>/` with a `QUARANTINE_REASON.txt`, then rerun
cleanly. Nothing is ever deleted.

**Failure isolation.** A worker exception never terminates the batch. Captured:
exception type, message, traceback, society, seed, elapsed time and last known
stage (`init` / `simulate` / `verify`).

**Crash safety.** `batch_status.json` is written to a temporary file, fsynced and
renamed after every completed or failed run, so an interruption leaves the
previous good file rather than a truncated one.

**Chunked batches.** `finalize` absorbs any verified run already on disk that
this invocation did not execute, so the summaries always describe the batch,
never just the most recent invocation.

## 7. Progress display

Text only, one line per completed run: completed/total · pass, skip or FAIL ·
run id, society, seed, run time · failed count · skipped-verified count · elapsed
wall time · mean runtime · estimated remaining · approximate storage used.

## 8. Measured performance (this sandbox: 3-core aarch64 container)

| Gate | Scale | Workers | Result |
|---|---|---|---|
| 1 | 3 seeds × 3 arms, 1,000 × 25 y | 1 | 9/9, 2.7 s |
| 2 | 3 seeds × 3 arms, 10,000 × 100 y | 2 | 9/9, 1.4 s mean/run |
| 3 | interrupt at 4 s, then resume | 2 | 5 skipped, 1 half-written run quarantined and rerun, 12/12 |
| 4 | one byte flipped inside a completed run | 1 | checksum mismatch detected, quarantined, batch continued |
| 5 | 30 seeds × 3 arms, 10,000 × 100 y, run in two chunks | 2 | 90/90, 0.7 s mean/run, 6.4 MB total (minimal logging) |

## 9. Before a `main` campaign

Working batch machinery is a necessary condition, not a sufficient one. See
`PILOT_ANALYSIS_PLAN.md` §5 for the outstanding blockers.
