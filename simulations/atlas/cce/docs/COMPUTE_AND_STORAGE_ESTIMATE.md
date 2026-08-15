# Compute and Storage Estimate

**All figures below are measured, not assumed**, except where explicitly marked
*estimate*. Raw data: `benchmarks/milestone0_reference_python.json`.

## 1. Hardware the measurements were taken on

| | |
|---|---|
| Platform | Linux 6.8.0, aarch64, glibc 2.35 (containerised sandbox) |
| CPU | 3 cores available; **all runs single-threaded** |
| RAM | 3 GB total |
| Python | 3.10.12, NumPy vectorised kernel |
| Storage format | uncompressed CSV (pyarrow unavailable in this environment) |
| Model version | 0.1.0-milestone0 |

This is modest hardware. Figures on a modern workstation or server core will be better,
not worse; no projection below assumes a faster core than the one measured.

## 2. Measured single-run performance

| Scale | Wall time | s/year | agent-years/s | Peak RSS | Output (CSV) |
|---|---|---|---|---|---|
| 10,000 × 100 y | **0.92 s** | 0.0092 | 1.08 M | 88 MB | 8.8 MB |
| 100,000 × 100 y | **5.91 s** | 0.0591 | 1.69 M | 176 MB | 15.4 MB |
| **100,000 × 500 y** | **29.07 s** | 0.0581 | 1.72 M | **554 MB** | **75.0 MB** |

Scaling is linear in both population and years above ~10k agents — the kernel is
vectorised, so per-year cost is dominated by array width, not by a Python loop over
agents.

## 3. Production campaign projection (3,000 runs)

Derived from the measured 100,000 × 500 y figure.

| Quantity | Value |
|---|---|
| Runs | 3,000 (1,000 per arm) |
| Total agent-years simulated | 1.5 × 10¹¹ |
| **Single-core compute** | **24.2 core-hours** |
| Wall time, 8 cores | ~3.0 h |
| Wall time, 32 cores | ~0.8 h |
| Wall time, 96 cores | ~0.3 h |
| Peak RAM per worker | 0.55 GB → 8 workers ≈ 4.4 GB, 32 workers ≈ 18 GB |

### Storage

| Format | Per run | 3,000 runs |
|---|---|---|
| CSV, standard logging (measured) | 75.0 MB | **225 GB** |
| CSV + gzip (measured ratio 2.7×) | 27.8 MB | **83 GB** |
| Parquet + zstd (*estimate*, 5–9× vs CSV) | 8–15 MB | **25–45 GB** |
| Standard logging **without** the citizen panel (measured) | 5.0 MB | **15 GB** |
| Forensic logging, one run (*estimate*: 100k × 500 × ~40 columns) | ~40–80 GB | not for bulk use |

The citizen panel dominates: 70 MB of the 75 MB per run is 500,000 panel rows
(1,000 citizens × 500 years). Recommended production setting: **panel = 200 citizens,
parquet + zstd**, giving ≈3–5 MB/run and **10–15 GB** for the whole campaign, with
forensic replay available on demand for any individual run.

## 4. Honest caveats

1. **This kernel is Milestone 0 fidelity.** Milestone 2 adds households, regions,
   emergency assessments, a 19-domain needs model, retraining, legislation and a possible
   epidemic transmission layer. A 3–10× slowdown is realistic. Even at 10×, the campaign
   is **~240 core-hours ≈ 30 h on 8 cores** — still comfortably feasible.
2. Measurements are single-threaded on one core of a small ARM container. They do not
   include batch orchestration overhead, checkpoint writes at production frequency, or
   analysis time.
3. The parquet figure is an *estimate* extrapolated from a measured gzip ratio, because
   pyarrow could not be installed in this environment. It must be re-measured before the
   storage budget is fixed.
4. Analysis cost is not included. Full-campaign aggregation over ~15 GB of parquet with
   DuckDB/Polars is minutes, not hours.

## 5. Engine decision

The brief prefers a compiled kernel (e.g. Rust) and permits pure Python **only if
benchmarks demonstrate it meets the required scale**. They do, by a wide margin: the
required 150 billion agent-years costs **24 core-hours** on the reference NumPy kernel, at
1.7 million agent-years per second per core.

**Recommendation: keep the vectorised NumPy kernel as the production engine for
Milestones 1–4.** Reasons: it already meets scale with ~50× headroom; it is the same code
the scientists read and reason about; and a second implementation is a correctness risk
that buys nothing here. The kernel is nevertheless kept behind a narrow interface
(`Simulation.step`, state as columnar arrays, named RNG streams) so a Rust or Numba
kernel can be added later and validated against the Python oracle if Milestone 2 fidelity
turns out to cost more than 10×.

Trigger for revisiting: per-run wall time at 100,000 × 500 exceeding **5 minutes**.
