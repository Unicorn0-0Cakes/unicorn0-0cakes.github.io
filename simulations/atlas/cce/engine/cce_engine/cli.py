"""Command-line entry points: single run, matched triad, batch, parameter export."""

from __future__ import annotations

import argparse
import json
import os
import time

from .kernel import MODEL_VERSION, RunConfig, Simulation
from .params import Params, registry_as_records


def _run(args) -> None:
    t0 = time.time()
    cfg = RunConfig(society=args.society, seed=args.seed, years=args.years,
                    capacity=args.population, logging_level=args.logging,
                    outdir=args.out, run_number=args.run_number, tag=args.tag,
                    panel_size=args.panel)
    res = Simulation(cfg).run()
    dt = time.time() - t0
    print(json.dumps({"experiment_id": res.experiment_id, "wall_seconds": round(dt, 2),
                      **res.summary}, indent=2))


def _triad(args) -> None:
    """Matched-seed A/B/C triad -- identical external shocks, different rules."""
    out = {}
    for soc in ("A", "B", "C"):
        cfg = RunConfig(society=soc, seed=args.seed, years=args.years,
                        capacity=args.population, logging_level=args.logging,
                        outdir=os.path.join(args.out, f"CCE-{soc}-{args.run_number:04d}")
                        if args.out else None,
                        run_number=args.run_number, tag=args.tag)
        res = Simulation(cfg).run()
        out[soc] = res.summary
    print(json.dumps(out, indent=2))


def _batch(args) -> None:
    from . import batch as B
    from pathlib import Path

    if args.seed_file:
        seeds = B.read_seed_file(args.seed_file)
        seed_source = f"seed-file:{args.seed_file}"
    else:
        seeds = B.generate_seeds(args.seed_start, args.seed_count)
        seed_source = f"seed-start:{args.seed_start},seed-count:{args.seed_count}"

    workers = args.workers or B.default_workers(args.population, args.years)
    if workers < 1:
        raise SystemExit("--workers must be at least 1")
    if workers > 512:
        raise SystemExit("--workers is implausibly large")

    root = Path(args.out)
    # Positions are a property of the batch, not of this invocation, so a batch
    # extended or resumed with a different seed range keeps its run numbering.
    positions = B.assign_positions(seeds, B.load_seed_positions(root))
    root.mkdir(parents=True, exist_ok=True)
    B.write_seed_list(root, positions)
    specs = B.build_specs(seeds, args.societies, args.years, args.population,
                          args.logging, args.tag, root / "runs",
                          positions=positions)

    est = B.plan(seeds, args.societies, args.years, args.population, workers)
    print(json.dumps({"batch": root.name, "seed_source": seed_source,
                      "seeds": len(seeds), **est}, indent=2), flush=True)
    if est["estimated_peak_rss_total_mb"] > 0.85 * est["available_memory_mb"]:
        print("WARNING: estimated peak memory exceeds 85% of available memory; "
              "reduce --workers", flush=True)
    if args.dry_run:
        for s in specs[:12]:
            print(f"  would run {s.experiment_id} society={s.society} seed={s.seed} "
                  f"-> {s.run_dir}")
        if len(specs) > 12:
            print(f"  ... and {len(specs) - 12} more")
        return

    b = B.Batch(out=str(root), specs=specs, workers=workers, tag=args.tag,
                seed_source=seed_source)
    status = b.run(resume=not args.retry_failed or args.resume,
                   retry_failed=args.retry_failed, verify_only=args.verify_only,
                   quarantine=args.quarantine)
    print(json.dumps({k: v for k, v in status.items() if k != "runs"}, indent=2))
    if status["failed"]:
        raise SystemExit(1)


def _verify(args) -> None:
    from .verify import verify_run
    res = verify_run(args.run_dir, society=args.society, seed=args.seed,
                     years=args.years, capacity=args.population)
    print(json.dumps({"run_dir": res.run_dir, "ok": res.ok,
                      "reason": res.reason(),
                      "experiment_id": res.manifest.get("experiment_id"),
                      "outcomes": res.outcomes}, indent=2, default=str))
    if not res.ok:
        raise SystemExit(1)


def _params(args) -> None:
    recs = registry_as_records()
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump({"model_version": MODEL_VERSION,
                   "parameter_set_id": Params().fingerprint(),
                   "parameters": recs}, f, indent=2, default=str)
    print(f"wrote {len(recs)} parameters to {args.out}")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="cce", description="Cognitive Civilization Experiment")
    sub = ap.add_subparsers(dest="cmd", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--seed", type=int, default=1)
    common.add_argument("--years", type=int, default=100)
    common.add_argument("--population", type=int, default=10_000)
    common.add_argument("--logging", default="standard",
                        choices=["minimal", "standard", "forensic"])
    common.add_argument("--out", default=None)
    common.add_argument("--run-number", dest="run_number", type=int, default=1)
    common.add_argument("--tag", default="exploratory",
                        choices=["main", "exploratory", "calibration", "debug", "sensitivity"])
    common.add_argument("--panel", type=int, default=None)

    r = sub.add_parser("run", parents=[common], help="single society run")
    r.add_argument("--society", choices=["A", "B", "C"], required=True)
    r.set_defaults(func=_run)

    t = sub.add_parser("triad", parents=[common], help="matched-seed A/B/C runs")
    t.set_defaults(func=_triad)

    b = sub.add_parser("batch", help="matched-seed batch of runs")
    b.add_argument("--societies", nargs="+", default=["A", "B", "C"],
                   choices=["A", "B", "C"])
    b.add_argument("--seed-start", dest="seed_start", type=int, default=1)
    b.add_argument("--seed-count", dest="seed_count", type=int, default=30)
    b.add_argument("--seed-file", dest="seed_file", default=None,
                   help="explicit seed list; takes precedence over start/count")
    b.add_argument("--years", type=int, default=500)
    b.add_argument("--population", type=int, default=100_000)
    b.add_argument("--workers", type=int, default=None,
                   help="default: conservative, from CPU count and free memory")
    b.add_argument("--logging", default="standard",
                   choices=["minimal", "standard", "forensic"])
    b.add_argument("--tag", default="exploratory",
                   choices=["main", "exploratory", "calibration", "debug", "sensitivity"])
    b.add_argument("--out", required=True)
    b.add_argument("--resume", action="store_true", default=True)
    b.add_argument("--no-resume", dest="resume", action="store_false")
    b.add_argument("--retry-failed", dest="retry_failed", action="store_true")
    b.add_argument("--verify-only", dest="verify_only", action="store_true")
    b.add_argument("--no-quarantine", dest="quarantine", action="store_false",
                   default=True,
                   help="strictly read-only audit: report failures without moving them")
    b.add_argument("--dry-run", dest="dry_run", action="store_true")
    b.set_defaults(func=_batch)

    v = sub.add_parser("verify", help="verify a single run directory")
    v.add_argument("run_dir")
    v.add_argument("--society", default=None)
    v.add_argument("--seed", type=int, default=None)
    v.add_argument("--years", type=int, default=None)
    v.add_argument("--population", type=int, default=None)
    v.set_defaults(func=_verify)

    p = sub.add_parser("params", help="export the parameter registry")
    p.add_argument("--out", default="params/baseline.json")
    p.set_defaults(func=_params)

    args = ap.parse_args(argv)
    args.func(args)


if __name__ == "__main__":  # pragma: no cover
    main()
