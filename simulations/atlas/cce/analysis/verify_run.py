"""Post-run integrity gate for a single run directory.

Thin wrapper around `cce_engine.verify`, which is the single implementation used
by the CLI (`cce verify`) and by the batch runner before it treats an existing
run as complete. Keeping one implementation means the standalone script and the
batch resume path can never drift apart and start disagreeing about whether a
run is usable.

Usage:
    python3 analysis/verify_run.py runs/CCE-A-0001-full
    python3 analysis/verify_run.py runs/CCE-A-0001-full --society A --years 500 \
        --capacity 100000

Exit code 0 = pass, 1 = fail.
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "engine"))

from cce_engine.verify import verify_run  # noqa: E402


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="verify one CCE run directory")
    ap.add_argument("run_dir")
    ap.add_argument("--society", default=None)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--years", type=int, default=None)
    ap.add_argument("--capacity", type=int, default=None)
    args = ap.parse_args(argv)

    res = verify_run(args.run_dir, society=args.society, seed=args.seed,
                     years=args.years, capacity=args.capacity)

    if not res.ok:
        if res.nonfinite:
            print("NON-FINITE VALUES FOUND:")
            for item in res.nonfinite[:30]:
                print("  ", item)
        for f in res.failures:
            print("FAIL:", f)
        return 1

    m, o = res.manifest, res.outcomes
    print(f"PASS: {m['experiment_id']} (society {m['society']}, seed {m['seed']}, "
          f"tag {m['run_tag']}) completed")
    print(f"PASS: {o['years']} annual rows")
    print(f"PASS: population cap respected (peak {o['population_peak']} / "
          f"{m['capacity']})")
    print("PASS: no non-finite numeric output in any stored table "
          "(nullable columns justified, not exempted)")
    print("PASS: every stored file matches its manifest checksum")
    print("PASS: every populated IQ band represented in every year")
    print("PASS: no hidden abuse beyond the safeguard interval")
    print("Model version:", m["model_version"],
          "| parameter set:", m["parameter_set_id"])
    print(f"Final population: {o['final_population']:.0f}")
    print(f"HALE (final {o['final_window']}y mean): "
          f"{o['healthy_life_expectancy']:.4f}")
    print(f"Independent LE (final {o['final_window']}y mean): "
          f"{o['independent_life_expectancy']:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
