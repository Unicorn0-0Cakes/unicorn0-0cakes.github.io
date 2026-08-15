"""Run-level statistics: arm summaries and matched-seed paired contrasts.

The simulation run is the independent unit. Citizens inside a run share an
institutional environment and are never treated as independent observations.

Because the design is matched by seed, the treatment estimate is the **paired
difference** within a seed, not the difference of arm means. Both are reported,
but the paired contrast is the estimate; `paired_contrasts` refuses to fall back
to an independent-sample calculation, and seeds missing either arm are excluded
and counted.

Stdlib + NumPy only: no SciPy dependency in the engine.
"""

from __future__ import annotations

import math
from statistics import NormalDist

import numpy as np

CONTRASTS = [("B", "A"), ("C", "A"), ("C", "B")]

# Smallest effect sizes of interest, preregistered in
# STATISTICAL_ANALYSIS_PLAN.md section 4. Absolute units, per outcome.
# These are the ORIGINAL preregistered values and are not to be altered on the
# basis of pilot results; a change must be proposed separately and the original
# preserved in the audit trail.
SESOI = {
    "healthy_life_expectancy": 1.0,        # years
    "independent_life_expectancy": 1.0,    # years (2% of ~50y, floored at 1y)
    "life_expectancy": 1.0,                # years
    "mean_mismatch": 0.05,                 # 5% of a ~1.0 scale
    "output_per_capita": 0.05,
    "unmet_need_rate": 0.02,
    "collapse_rate": 0.05,
    "final_population": 1000.0,
    "max_abuse_detection_delay": 0.25,     # 3 months
}

_ND = NormalDist()


def _clean(x) -> np.ndarray:
    a = np.asarray(list(x), dtype=float)
    return a[np.isfinite(a)]


def bca_ci(x: np.ndarray, alpha: float = 0.05, n_boot: int = 10_000,
           seed: int = 20260801) -> tuple[float, float]:
    """Bias-corrected and accelerated bootstrap CI for the mean.

    Deterministic: the resampling RNG is seeded from a fixed constant so a
    reported interval is reproducible. Falls back to the normal-approximation
    interval when the sample is too small for BCa to be meaningful.
    """
    x = _clean(x)
    n = x.size
    if n < 2:
        return (float("nan"), float("nan"))
    theta = float(np.mean(x))
    if n < 5:
        se = float(np.std(x, ddof=1)) / math.sqrt(n)
        z = _ND.inv_cdf(1 - alpha / 2)
        return (theta - z * se, theta + z * se)

    rng = np.random.default_rng(seed)
    idx = rng.integers(0, n, size=(n_boot, n))
    boots = x[idx].mean(axis=1)

    prop = float(np.mean(boots < theta))
    prop = min(max(prop, 1.0 / n_boot), 1.0 - 1.0 / n_boot)
    z0 = _ND.inv_cdf(prop)

    # jackknife acceleration
    total = x.sum()
    jack = (total - x) / (n - 1)
    jbar = jack.mean()
    d = jbar - jack
    denom = 6.0 * (float(np.sum(d ** 2)) ** 1.5)
    a = float(np.sum(d ** 3)) / denom if denom > 0 else 0.0

    out = []
    for q in (alpha / 2, 1 - alpha / 2):
        zq = _ND.inv_cdf(q)
        adj = z0 + (z0 + zq) / max(1 - a * (z0 + zq), 1e-9)
        p = _ND.cdf(adj)
        out.append(float(np.percentile(boots, 100 * min(max(p, 0.0), 1.0))))
    return (out[0], out[1])


def describe(values, alpha: float = 0.05) -> dict:
    """Distribution summary for a set of run-level values."""
    x = _clean(values)
    n = x.size
    if n == 0:
        return {"n": 0}
    sd = float(np.std(x, ddof=1)) if n > 1 else 0.0
    mcse = sd / math.sqrt(n) if n > 0 else float("nan")
    q1, q3 = (float(v) for v in np.percentile(x, [25, 75])) if n > 1 else (float(x[0]),) * 2
    lo, hi = bca_ci(x, alpha=alpha) if n > 1 else (float("nan"), float("nan"))
    return {
        "n": int(n),
        "mean": float(np.mean(x)),
        "median": float(np.median(x)),
        "sd": sd,
        "iqr": q3 - q1,
        "min": float(np.min(x)),
        "max": float(np.max(x)),
        "p2_5": float(np.percentile(x, 2.5)) if n > 1 else float(x[0]),
        "p97_5": float(np.percentile(x, 97.5)) if n > 1 else float(x[0]),
        "mcse": mcse,
        "ci95_low": lo,
        "ci95_high": hi,
    }


def arm_summary(records: list[dict], outcomes: list[str]) -> list[dict]:
    """Between-seed distribution of each outcome, per society."""
    rows = []
    for society in sorted({r["society"] for r in records}):
        vals = [r for r in records if r["society"] == society]
        for outcome in outcomes:
            d = describe([r.get(outcome) for r in vals])
            rows.append({"society": society, "outcome": outcome, **d})
    return rows


def paired_index(records: list[dict]) -> dict:
    """(society, seed) -> record."""
    return {(r["society"], int(r["seed"])): r for r in records}


def paired_contrasts(records: list[dict], outcomes: list[str],
                     sesoi: dict | None = None) -> tuple[list[dict], list[dict]]:
    """Matched-seed paired differences. Returns (contrast rows, per-seed rows).

    A seed contributes to a contrast only if BOTH arms completed for that seed.
    Incomplete pairs are excluded and counted -- never silently imputed, and
    never replaced by an unpaired difference of means.
    """
    sesoi = SESOI if sesoi is None else sesoi
    idx = paired_index(records)
    seeds = sorted({int(r["seed"]) for r in records})

    per_seed: list[dict] = []
    for seed in seeds:
        row = {"seed": seed}
        for society in ("A", "B", "C"):
            row[f"has_{society}"] = int((society, seed) in idx)
        for outcome in outcomes:
            for hi, lo in CONTRASTS:
                a, b = idx.get((hi, seed)), idx.get((lo, seed))
                key = f"{outcome}__{hi}_minus_{lo}"
                if a is None or b is None:
                    row[key] = ""
                    continue
                va, vb = a.get(outcome), b.get(outcome)
                if va is None or vb is None or not (math.isfinite(va) and math.isfinite(vb)):
                    row[key] = ""
                else:
                    row[key] = va - vb
        per_seed.append(row)

    rows: list[dict] = []
    for outcome in outcomes:
        thr = sesoi.get(outcome)
        for hi, lo in CONTRASTS:
            diffs, used = [], []
            for seed in seeds:
                a, b = idx.get((hi, seed)), idx.get((lo, seed))
                if a is None or b is None:
                    continue
                va, vb = a.get(outcome), b.get(outcome)
                if va is None or vb is None:
                    continue
                if not (math.isfinite(va) and math.isfinite(vb)):
                    continue
                diffs.append(va - vb)
                used.append(seed)
            d = np.asarray(diffs, dtype=float)
            summary = describe(d)
            n_excluded = len(seeds) - len(used)
            row = {
                "outcome": outcome,
                "contrast": f"{hi}_minus_{lo}",
                "n_matched_seeds": int(d.size),
                "n_seeds_excluded_incomplete": int(n_excluded),
                "sesoi": thr if thr is not None else "",
                "mean_diff": summary.get("mean", float("nan")),
                "median_diff": summary.get("median", float("nan")),
                "sd_diff": summary.get("sd", float("nan")),
                "mcse_diff": summary.get("mcse", float("nan")),
                "ci95_low": summary.get("ci95_low", float("nan")),
                "ci95_high": summary.get("ci95_high", float("nan")),
                "min_diff": summary.get("min", float("nan")),
                "max_diff": summary.get("max", float("nan")),
            }
            if d.size:
                row["p_diff_gt_0"] = float(np.mean(d > 0))
                row["p_diff_gt_sesoi"] = (float(np.mean(d > thr)) if thr is not None else "")
                row["p_diff_lt_neg_sesoi"] = (float(np.mean(d < -thr)) if thr is not None else "")
                if thr is not None:
                    # precise but trivial: CI excludes zero yet lies inside +-SESOI
                    excludes_zero = (row["ci95_low"] > 0) or (row["ci95_high"] < 0)
                    inside = abs(row["mean_diff"]) < thr
                    row["precise_but_below_sesoi"] = int(bool(excludes_zero and inside))
                else:
                    row["precise_but_below_sesoi"] = ""
            else:
                row.update({"p_diff_gt_0": "", "p_diff_gt_sesoi": "",
                            "p_diff_lt_neg_sesoi": "", "precise_but_below_sesoi": ""})
            rows.append(row)
    return rows, per_seed


def shock_response(records: list[dict], outcomes: list[str]) -> list[dict]:
    """Does stochastic history move the outcomes at all?

    Correlates each run-level outcome with that run's total exposure to external
    shocks, within each arm. A near-zero correlation together with a near-zero
    between-seed SD means the campaign would be measuring a model that barely
    responds to its own stochastic history -- which must be reported, because it
    changes what 1,000 runs are worth.
    """
    rows = []
    for society in sorted({r["society"] for r in records}):
        vals = [r for r in records if r["society"] == society]
        for driver in ("shock_events_total", "mortality_burden_total"):
            xs = np.asarray([r.get(driver, float("nan")) for r in vals], dtype=float)
            for outcome in outcomes:
                ys = np.asarray([r.get(outcome, float("nan")) for r in vals], dtype=float)
                ok = np.isfinite(xs) & np.isfinite(ys)
                if ok.sum() < 3 or np.std(xs[ok]) == 0 or np.std(ys[ok]) == 0:
                    r_val = float("nan")
                else:
                    r_val = float(np.corrcoef(xs[ok], ys[ok])[0, 1])
                rows.append({"society": society, "driver": driver, "outcome": outcome,
                             "n": int(ok.sum()), "pearson_r": r_val,
                             "driver_sd": float(np.std(xs[ok], ddof=1)) if ok.sum() > 1 else 0.0,
                             "outcome_sd": float(np.std(ys[ok], ddof=1)) if ok.sum() > 1 else 0.0})
    return rows
