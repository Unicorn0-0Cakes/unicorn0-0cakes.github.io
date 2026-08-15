"""Performance benchmark harness.

Reports measured runtime, peak memory and output size for the reference engine
at the three scales required before an engine decision is made
(docs/COMPUTE_AND_STORAGE_ESTIMATE.md), and projects the cost of the full
3,000-run production campaign. Hardware assumptions are recorded with the
results; no projection is reported without the machine it was measured on.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import resource
import shutil
import time

from .kernel import MODEL_VERSION, RunConfig, Simulation


def _dirsize(path: str) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            total += os.path.getsize(os.path.join(root, f))
    return total


def bench_one(pop: int, years: int, society: str = "A", level: str = "standard",
              seed: int = 1) -> dict:
    out = f"/tmp/cce_bench/{society}_{pop}_{years}_{level}"
    shutil.rmtree(out, ignore_errors=True)
    rss0 = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    t0 = time.perf_counter()
    cfg = RunConfig(society=society, seed=seed, years=years, capacity=pop,
                    logging_level=level, outdir=out, tag="calibration",
                    panel_size=min(1000, pop // 10))
    res = Simulation(cfg).run()
    dt = time.perf_counter() - t0
    rss1 = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return {
        "population": pop, "years": years, "society": society,
        "logging_level": level,
        "wall_seconds": round(dt, 2),
        "seconds_per_year": round(dt / years, 4),
        "agent_years": pop * years,
        "agent_years_per_second": round(pop * years / dt),
        "peak_rss_mb": round(max(rss1, rss0) / 1024, 1),
        "output_bytes": _dirsize(out),
        "final_population": res.summary["final_population"],
    }


def project(bench: dict, runs_per_society: int = 1000) -> dict:
    total_runs = 3 * runs_per_society
    per_run = bench["wall_seconds"]
    core_hours = per_run * total_runs / 3600
    storage_gb = bench["output_bytes"] * total_runs / 1e9
    return {
        "per_run_seconds": per_run,
        "per_run_output_mb": round(bench["output_bytes"] / 1e6, 2),
        "runs": total_runs,
        "single_core_hours": round(core_hours, 1),
        "wall_hours_8_cores": round(core_hours / 8, 1),
        "wall_hours_32_cores": round(core_hours / 32, 1),
        "wall_hours_96_cores": round(core_hours / 96, 1),
        "storage_gb_standard_logging": round(storage_gb, 1),
    }


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description="CCE engine benchmark")
    ap.add_argument("--scales", default="10000x100,100000x100,100000x500")
    ap.add_argument("--out", default=None)
    args = ap.parse_args(argv)

    env = {
        "model_version": MODEL_VERSION,
        "python": platform.python_version(),
        "platform": platform.platform(),
        "machine": platform.machine(),
        "cpu_count": os.cpu_count(),
    }
    results = []
    for scale in args.scales.split(","):
        pop, years = (int(x) for x in scale.split("x"))
        r = bench_one(pop, years)
        r["projection_from_this_scale"] = project(r)
        results.append(r)
        print(json.dumps(r, indent=2), flush=True)

    payload = {"environment": env, "benchmarks": results}
    if args.out:
        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        print("wrote", args.out)


if __name__ == "__main__":  # pragma: no cover
    main()
