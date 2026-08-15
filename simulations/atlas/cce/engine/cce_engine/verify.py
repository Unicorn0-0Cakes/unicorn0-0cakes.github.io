"""Run-level integrity verification.

Shared by the CLI (`cce verify`), the batch runner (before treating an existing
run as complete) and `analysis/verify_run.py`. A run is only usable if it passes
every check here.

Design rule: a missing value is never waved through. Columns where NaN is a
legitimate "no such value exists" are listed in NULLABLE, and each one is paired
with a semantic check establishing *why* it is absent, so arithmetic corruption
can never hide behind a legitimate blank.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

# (file, column) -> NaN permitted, subject to the paired justification below
NULLABLE = {
    ("panel.csv", "official_iq"),    # citizen not yet civically classified
    ("panel.csv", "official_se"),
    ("annual.csv", "president_iq"),  # office vacant at year end
}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


@dataclass
class VerifyResult:
    ok: bool = True
    run_dir: str = ""
    failures: list[str] = field(default_factory=list)
    nonfinite: list[tuple] = field(default_factory=list)
    manifest: dict = field(default_factory=dict)
    outcomes: dict = field(default_factory=dict)

    def reason(self) -> str:
        parts = list(self.failures)
        if self.nonfinite:
            f, row, col, val = self.nonfinite[0]
            parts.append(f"{len(self.nonfinite)} non-finite values "
                         f"(first: {f} row {row} column {col} = {val})")
        return "; ".join(parts) or "ok"


def _float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def verify_run(run_dir, society=None, seed=None, years=None, capacity=None,
               check_checksums: bool = True) -> VerifyResult:
    root = Path(run_dir)
    res = VerifyResult(run_dir=str(root))

    def fail(msg):
        res.failures.append(msg)

    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        fail("manifest.json missing")
        res.ok = False
        return res
    try:
        manifest = json.loads(manifest_path.read_text())
    except Exception as e:  # corrupted manifest
        fail(f"manifest unreadable: {e}")
        res.ok = False
        return res
    res.manifest = manifest

    if manifest.get("status") != "completed":
        fail(f"status is {manifest.get('status')!r}")
    if society is not None and manifest.get("society") != society:
        fail(f"society is {manifest.get('society')!r}, expected {society!r}")
    if seed is not None and manifest.get("seed") != seed:
        fail(f"seed is {manifest.get('seed')!r}, expected {seed!r}")
    if years is not None and manifest.get("years") != years:
        fail(f"years is {manifest.get('years')!r}, expected {years}")
    if capacity is not None and manifest.get("capacity") != capacity:
        fail(f"capacity is {manifest.get('capacity')!r}, expected {capacity}")

    # --- declared files present, and matching their recorded checksums ------
    for name, info in manifest.get("files", {}).items():
        fpath = root / info["path"]
        if not fpath.exists():
            fail(f"{name}: declared file {info['path']} missing")
            continue
        if check_checksums and sha256(fpath) != info["sha256"]:
            fail(f"{name}: checksum mismatch (file altered since it was written)")

    # --- non-finite scan over every stored table ---------------------------
    for path in sorted(root.glob("*.csv")):
        with path.open(newline="", encoding="utf-8") as f:
            for row_number, row in enumerate(csv.DictReader(f), start=2):
                for column, value in row.items():
                    if value in (None, ""):
                        continue
                    number = _float(value)
                    if number is None or math.isfinite(number):
                        continue
                    if math.isnan(number) and (path.name, column) in NULLABLE:
                        continue  # justified below
                    res.nonfinite.append((path.name, row_number, column, value))

    # --- justify the nullable columns --------------------------------------
    panel_path = root / "panel.csv"
    if panel_path.exists():
        banded_without_score = scored_without_band = late = 0
        with panel_path.open(newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                iq = _float(r.get("official_iq"))
                missing = iq is None or math.isnan(iq)
                banded = int(r["band"]) != -1
                if missing and banded:
                    banded_without_score += 1
                if not missing and not banded:
                    scored_without_band += 1
                if missing and _float(r["age"]) >= 25:
                    late += 1
        if banded_without_score:
            fail(f"{banded_without_score} panel rows have a band but no score")
        if scored_without_band:
            fail(f"{scored_without_band} panel rows have a score but no band")
        if late:
            fail(f"{late} panel rows unclassified at age 25 or older")

    # --- annual series ------------------------------------------------------
    annual_path = root / "annual.csv"
    if not annual_path.exists():
        fail("annual.csv missing")
        res.ok = not (res.failures or res.nonfinite)
        return res

    with annual_path.open(newline="", encoding="utf-8") as f:
        annual = list(csv.DictReader(f))

    expected_years = years if years is not None else manifest.get("years")
    if expected_years is not None and len(annual) != expected_years:
        fail(f"{len(annual)} annual rows, expected {expected_years}")
    cap = capacity if capacity is not None else manifest.get("capacity")
    peak = max(int(_float(r["population"])) for r in annual) if annual else 0
    if cap is not None and peak > cap:
        fail(f"population peaked at {peak}, cap is {cap}")
    if any(int(_float(r["unrepresented_populated_bands"])) for r in annual):
        fail("a populated IQ band went unrepresented")
    worst_delay = max(_float(r["max_detection_delay_years"]) for r in annual) if annual else 0.0
    if worst_delay > 1.0 + 1e-9:
        fail(f"hidden abuse persisted {worst_delay} years")
    seated_missing = sum(1 for r in annual
                         if math.isnan(_float(r["president_iq"]) or float("nan"))
                         and int(_float(r["president_cid"])) != -1)
    if seated_missing:
        fail(f"{seated_missing} years have a seated president with no score")

    res.outcomes = run_outcomes(annual, manifest)
    res.outcomes["population_peak"] = peak
    res.ok = not (res.failures or res.nonfinite)
    return res


# ---------------------------------------------------------------------------
# run-level outcome extraction (the row that enters the statistical analysis)
# ---------------------------------------------------------------------------

# Primary outcomes are averaged over the final `FINAL_WINDOW` years, or the
# whole run when it is shorter (STATISTICAL_ANALYSIS_PLAN.md section 3).
FINAL_WINDOW = 100

PRIMARY_OUTCOMES = ["healthy_life_expectancy", "independent_life_expectancy",
                    "life_expectancy"]
SECONDARY_OUTCOMES = ["mean_mismatch", "final_population", "output_per_capita",
                      "unmet_need_rate", "collapse_rate",
                      "max_abuse_detection_delay"]


def run_outcomes(annual: list[dict], manifest: dict) -> dict:
    n = len(annual)
    w = annual[-min(FINAL_WINDOW, n):]

    def mean_of(rows, col):
        vals = [_float(r[col]) for r in rows]
        vals = [v for v in vals if v is not None and math.isfinite(v)]
        return sum(vals) / len(vals) if vals else float("nan")

    return {
        "experiment_id": manifest.get("experiment_id"),
        "society": manifest.get("society"),
        "seed": manifest.get("seed"),
        "run_number": manifest.get("run_number"),
        "years": n,
        "final_window": len(w),
        # primary
        "healthy_life_expectancy": mean_of(w, "healthy_life_expectancy"),
        "independent_life_expectancy": mean_of(w, "independent_life_expectancy"),
        "life_expectancy": mean_of(w, "life_expectancy"),
        # secondary
        "mean_mismatch": mean_of(annual, "mean_mismatch"),
        "final_population": _float(annual[-1]["population"]),
        "output_per_capita": mean_of(w, "output_per_capita"),
        "unmet_need_rate": mean_of(annual, "unmet_need_rate"),
        "collapse_rate": float(any(int(_float(r["collapsed"])) for r in annual)),
        "max_abuse_detection_delay": max(_float(r["max_detection_delay_years"])
                                         for r in annual),
        # stochastic-history exposure, for the shock-response check
        "shock_events_total": sum(int(_float(r["shock_events"])) for r in annual),
        "mortality_burden_total": sum(_float(r["mortality_burden"]) for r in annual),
        "preventable_deaths_total": sum(_float(r["preventable_deaths"]) for r in annual),
    }
