"""Export completed-run output into the data payload embedded in cce.html.

The web page must never contain a hand-typed number. This script reads real run
directories and batch summaries, downsamples the annual series, and injects the
result into cce.html between the DATA_START / DATA_END markers, so every figure
on the page is traceable to a run manifest and its checksums.

Usage:
    python3 analysis/export_web_data.py
    python3 analysis/export_web_data.py --pilot /tmp/gate5 --check
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "engine"))

from cce_engine.verify import verify_run  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]

# annual columns carried to the browser, downsampled
SERIES = [
    "population", "births", "deaths", "births_denied",
    "life_expectancy", "healthy_life_expectancy", "independent_life_expectancy",
    "preventable_deaths", "mean_health", "mean_adaptive", "frac_independent",
    "abs_capability_mean", "iq_mean", "iq_sd", "iq_ceiling_frac",
    "employment_rate", "mean_performance", "mean_mismatch", "mismatch_rate",
    "output_per_capita", "innovations", "tech_level", "performance_gini",
    "mean_support_level", "unmet_need_rate", "over_support_rate",
    "mean_housing_restrictiveness", "gov_quality", "president_iq",
    "populated_bands", "corrupt_officials", "abuse_detected",
    "mean_detection_delay_years", "welfare_checks", "false_positive_findings",
    "shock_events", "mortality_burden", "med_level", "mean_age",
]

STEP = 5  # keep every 5th year: 500 years -> 100 points


def _f(v):
    try:
        x = float(v)
        return None if not math.isfinite(x) else x
    except (TypeError, ValueError):
        return None


def _round(x, nd=4):
    if x is None:
        return None
    r = round(x, nd)
    return int(r) if r == int(r) and abs(r) < 1e15 else r


def read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_run(run_dir: Path) -> dict:
    res = verify_run(str(run_dir))
    if not res.ok:
        raise SystemExit(f"{run_dir} failed verification: {res.reason()}")
    m = res.manifest
    annual = read_csv(run_dir / "annual.csv")
    keep = annual[::STEP]
    if annual and keep[-1] is not annual[-1]:
        keep.append(annual[-1])

    series = {col: [_round(_f(r.get(col)), 3) for r in keep] for col in SERIES}
    series["year"] = [int(_f(r["year"])) for r in keep]

    assessments = [
        {k: _round(_f(r.get(k))) for k in
         ("year", "n_assessed", "mean", "sd", "median", "mad", "iqr", "skew",
          "ceiling_frac", "floor_frac", "abs_mean", "abs_sd")}
        for r in read_csv(run_dir / "assessments.csv")
    ]
    # distribution snapshots: every other cycle is enough to draw the fan chart
    snapshots = [
        {k: _round(_f(r.get(k)), 1) for k in r if k.startswith(("iq_p", "abs_p", "year"))}
        for r in read_csv(run_dir / "snapshots.csv")[::2]
    ]

    events = read_csv(run_dir / "events.csv")
    env = [{"year": int(_f(e["year"])), "type": e["type"],
            "severity": _round(_f(e.get("severity")), 3)}
           for e in events if e.get("category") == "environment"]
    presidents = [{"year": int(_f(e["year"])), "iq": _round(_f(e.get("president_iq")), 2),
                   "method": e.get("method", ""), "n_tied": e.get("n_tied", "")}
                  for e in events if e.get("type") == "presidential_selection"]
    counts: dict[str, int] = {}
    for e in events:
        counts[e["type"]] = counts.get(e["type"], 0) + 1

    return {
        "id": m["experiment_id"],
        "society": m["society"],
        "seed": m["seed"],
        "years": m["years"],
        "population": m["capacity"],
        "tag": m["run_tag"],
        "model_version": m["model_version"],
        "git_commit": (m.get("git_commit") or "")[:12],
        "parameter_set_id": m["parameter_set_id"],
        "normalization_method": m.get("normalization_method"),
        "fertility_policy": m.get("fertility_policy"),
        "births_denied_total": m.get("births_denied_total"),
        "files": {k: {"rows": v["rows"], "bytes": v["bytes"],
                      "sha256": v["sha256"][:16]} for k, v in m.get("files", {}).items()},
        "series": series,
        "assessments": assessments,
        "snapshots": snapshots,
        "env_events": env,
        "presidents": presidents,
        "event_counts": counts,
        "outcomes": {k: _round(v) if isinstance(v, float) else v
                     for k, v in res.outcomes.items()},
    }


def load_pilot(batch_dir: Path) -> dict | None:
    if not batch_dir.exists():
        return None
    manifest_path = batch_dir / "batch_manifest.json"
    if not manifest_path.exists():
        return None
    bm = json.loads(manifest_path.read_text())

    def num(rows, keys):
        out = []
        for r in rows:
            row = {}
            for k, v in r.items():
                row[k] = _round(_f(v)) if k in keys else v
            out.append(row)
        return out

    arm = read_csv(batch_dir / "summaries" / "arm_summary.csv")
    contrasts = read_csv(batch_dir / "summaries" / "paired_contrasts.csv")
    shock = read_csv(batch_dir / "summaries" / "shock_response.csv")
    runs = read_csv(batch_dir / "summaries" / "run_summary.csv")
    per_seed = read_csv(batch_dir / "summaries" / "seed_paired_summary.csv")

    numeric = {"n", "mean", "median", "sd", "iqr", "min", "max", "p2_5", "p97_5",
               "mcse", "ci95_low", "ci95_high", "mean_diff", "median_diff",
               "sd_diff", "mcse_diff", "min_diff", "max_diff", "p_diff_gt_0",
               "p_diff_gt_sesoi", "p_diff_lt_neg_sesoi", "pearson_r",
               "driver_sd", "outcome_sd"}
    return {
        "batch_id": bm["batch_id"],
        "tag": bm["run_tag"],
        "n_seeds": bm["n_seeds"],
        "n_runs": bm["n_runs_planned"],
        "completed": bm["completed"],
        "failed": bm["failed"],
        "years": bm["years"],
        "population": bm["population"],
        "workers": bm["workers"],
        "wall_seconds": bm["wall_seconds"],
        "storage_bytes": bm["storage_bytes"],
        "arm_summary": num(arm, numeric),
        "paired_contrasts": num(contrasts, numeric),
        "shock_response": num(shock, numeric),
        # only the primary-outcome contrast columns: the full per-seed table has
        # ~60 columns and belongs in the CSV, not in a web payload
        "per_seed": [{k: (_round(_f(v), 3) if _f(v) is not None else v)
                      for k, v in r.items()
                      if k in ("seed", "has_A", "has_B", "has_C")
                      or (k.split("__")[0] in ("healthy_life_expectancy",
                                               "independent_life_expectancy",
                                               "life_expectancy") and "__" in k)}
                     for r in per_seed],
        "runs": [{k: r[k] for k in ("experiment_id", "society", "seed",
                                    "healthy_life_expectancy",
                                    "independent_life_expectancy",
                                    "life_expectancy", "mean_mismatch",
                                    "final_population", "shock_events_total")}
                 for r in runs],
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", default=str(ROOT / "runs"))
    ap.add_argument("--pilot", default=None)
    ap.add_argument("--html", default=str(ROOT / "cce.html"))
    ap.add_argument("--check", action="store_true",
                    help="only report what would be exported")
    args = ap.parse_args(argv)

    runs_root = Path(args.runs)
    wanted = [
        ("seed1", runs_root / "CCE-A-0001-full"),
        ("seed1", runs_root / "CCE-B-0001-full"),
        ("seed1", runs_root / "CCE-C-0001-full"),
        ("seed2", runs_root / "triad-full-seed-0002" / "CCE-A-0002"),
        ("seed2", runs_root / "triad-full-seed-0002" / "CCE-B-0002"),
        ("seed2", runs_root / "triad-full-seed-0002" / "CCE-C-0002"),
    ]
    payload = {"runs": {}, "pilot": None,
               "generated_by": "analysis/export_web_data.py",
               "series_step_years": STEP}
    for group, d in wanted:
        if not d.exists():
            print(f"  skip (absent): {d}")
            continue
        run = load_run(d)
        run["group"] = group
        payload["runs"][run["id"] + "@" + group] = run
        print(f"  loaded {run['id']} ({group}) "
              f"{len(run['series']['year'])} points, {len(run['env_events'])} events")

    if args.pilot:
        payload["pilot"] = load_pilot(Path(args.pilot))
        if payload["pilot"]:
            print(f"  loaded pilot {payload['pilot']['batch_id']}: "
                  f"{payload['pilot']['completed']}/{payload['pilot']['n_runs']} runs")

    blob = json.dumps(payload, separators=(",", ":"), default=str)
    print(f"payload: {len(blob)/1024:.0f} KB, {len(payload['runs'])} runs")
    if args.check:
        return 0

    html_path = Path(args.html)
    if not html_path.exists():
        out = html_path.with_suffix(".data.json")
        out.write_text(blob, encoding="utf-8")
        print(f"{html_path} not found; wrote {out}")
        return 0

    text = html_path.read_text(encoding="utf-8")
    start, end = "/*DATA_START*/", "/*DATA_END*/"
    if start not in text or end not in text:
        raise SystemExit("cce.html is missing the DATA_START / DATA_END markers")
    head = text.split(start)[0]
    tail = text.split(end)[1]
    html_path.write_text(f"{head}{start}\nconst DATA = {blob};\n{end}{tail}",
                         encoding="utf-8")
    print(f"injected {len(blob)/1024:.0f} KB into {html_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
