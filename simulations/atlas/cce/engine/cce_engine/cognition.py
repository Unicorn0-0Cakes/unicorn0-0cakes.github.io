"""Cognitive model: latent capability, development, testing, normalisation.

Two measurements are maintained and never conflated (docs/COGNITIVE_MODEL.md):

  ABSOLUTE capability  -- referenced to the fixed Year-0 scale, never renormalised.
  RELATIVE civic IQ    -- norm-referenced, recomputed after each civilization-wide
                          assessment against the previous completed cycle.

Observed score != latent capability. The observation model adds measurement
error, acute health, stress, sensory access, practice and motivation. Every
official score is stored with its standard error.
"""

from __future__ import annotations

import numpy as np

DIMS = [
    "fluid_reasoning",
    "verbal_comprehension",
    "working_memory",
    "processing_speed",
    "spatial_reasoning",
    "numerical_reasoning",
    "practical_judgment",
    "social_understanding",
    "executive_function",
    "emotional_regulation",
    "consistency",
]
IDX = {d: i for i, d in enumerate(DIMS)}

# dimensions subject to normal-ageing decline
FLUID_DIMS = [IDX["fluid_reasoning"], IDX["processing_speed"], IDX["working_memory"]]
CRYST_DIMS = [IDX["verbal_comprehension"], IDX["practical_judgment"],
              IDX["social_understanding"], IDX["emotional_regulation"]]

# The official assessment battery does not measure the whole profile: it is a
# g-weighted composite of the psychometric dimensions only. Practical judgment,
# social understanding, emotional regulation and consistency are NOT part of the
# official score -- this is the modelled source of Society A's classification
# error and Society C's advantage.
BATTERY_DIMS = [IDX["fluid_reasoning"], IDX["verbal_comprehension"],
                IDX["working_memory"], IDX["processing_speed"],
                IDX["spatial_reasoning"], IDX["numerical_reasoning"]]
BATTERY_W = np.array([0.22, 0.20, 0.17, 0.14, 0.13, 0.14], dtype=np.float32)


def sample_profiles(n: int, g: np.ndarray, p, rng) -> np.ndarray:
    """Build an (n, len(DIMS)) latent profile from a general factor plus specifics."""
    loadings = np.asarray(p["g_loading"], dtype=np.float32)
    sd = np.float32(p["abs_scale_sd"])
    mu = np.float32(p["abs_scale_mean"])
    z = ((g - mu) / sd).astype(np.float32)[:, None]
    spec = rng.standard_normal((n, len(DIMS))).astype(np.float32)
    resid = np.sqrt(np.maximum(1.0 - loadings ** 2, 1e-6))
    return mu + sd * (z * loadings + spec * resid)


def g_from_profile(latent: np.ndarray) -> np.ndarray:
    """Absolute capability index = battery-weighted composite of latent dims.

    Fail immediately if a non-finite cognitive value enters the model.
    Elementwise multiplication avoids platform-specific matmul instability.
    """
    x = latent[:, BATTERY_DIMS]

    if not np.isfinite(x).all():
        bad = np.argwhere(~np.isfinite(x))
        row, column = bad[0]
        raise FloatingPointError(
            f"Non-finite latent cognitive value at row={int(row)}, "
            f"battery_column={int(column)}, value={x[row, column]!r}"
        )

    result = np.sum(x * BATTERY_W, axis=1, dtype=np.float64)

    if not np.isfinite(result).all():
        raise FloatingPointError(
            "Non-finite absolute cognitive capability produced by g_from_profile"
        )

    return result.astype(np.float32)


def age_profile(latent: np.ndarray, age: np.ndarray, p) -> np.ndarray:
    """Apply age-graded maturation and decline. Returns a modified copy-in-place."""
    peak = np.float32(p["fluid_peak_age"])
    dec = np.float32(p["fluid_decline_rate"])
    # childhood maturation: capability expressed as a fraction of endowment
    mat = np.clip(age / 18.0, 0.25, 1.0).astype(np.float32)[:, None]
    out = latent * mat
    over = np.maximum(age - peak, 0.0).astype(np.float32)[:, None]
    out[:, FLUID_DIMS] -= dec * over
    return out


def observe(latent_now: np.ndarray, st, idx: np.ndarray, p, rng,
            scaffolding: float) -> tuple[np.ndarray, np.ndarray]:
    """Observation model. Returns (observed absolute-scale score, standard error).

    observed = battery composite
             - acute health effect
             - stress effect
             - uncorrected sensory penalty (reduced by accessible testing)
             + practice effect
             + measurement error
    """
    sd = np.float32(p["abs_scale_sd"])
    rel = np.float32(p["test_reliability"])
    err_sd = sd * np.sqrt(max(1.0 - rel, 1e-6))
    true_score = g_from_profile(latent_now)

    acute = st.acute[idx]
    stress = st.stress[idx]
    # accessible testing environments remove most of the sensory/state artefacts
    sens_pen = p["sensory_penalty"] * st.sensory[idx] * (1.0 - 0.9 * scaffolding)
    state_pen = (p["state_effect_health"] * acute * (1.0 - 0.5 * scaffolding)
                 + p["state_effect_stress"] * stress * (1.0 - 0.5 * scaffolding))
    practice = np.minimum(st.sittings[idx] * p["practice_effect"], p["practice_max"])
    motivation = rng.normal(0.0, 2.0, size=idx.size).astype(np.float32)
    err = rng.normal(0.0, err_sd, size=idx.size).astype(np.float32)

    obs = true_score - sens_pen - state_pen + practice + motivation + err
    se = np.full(idx.size, float(np.sqrt(err_sd ** 2 + 4.0)), dtype=np.float32)
    return obs.astype(np.float32), se


def normalise(obs: np.ndarray, ref: np.ndarray | None, p) -> np.ndarray:
    """Norm-reference observed scores against the previous cycle's population.

    Year 0 uses the concurrent population as its own reference (documented).
    The method is fixed for the whole experiment by params['normalization_method'].
    """
    reference = obs if ref is None or ref.size < 100 else ref
    method = p["normalization_method"]
    if method == "mean_sd":
        c, s = float(np.mean(reference)), float(np.std(reference, ddof=1))
    elif method == "median_mad":
        c = float(np.median(reference))
        s = 1.4826 * float(np.median(np.abs(reference - c)))
    elif method == "trimmed":
        lo, hi = np.percentile(reference, [5, 95])
        keep = reference[(reference >= lo) & (reference <= hi)]
        c, s = float(np.mean(keep)), float(np.std(keep, ddof=1))
    else:  # pragma: no cover - guarded by schema
        raise ValueError(method)
    s = max(s, 1e-6)
    iq = 100.0 + 15.0 * (obs - c) / s
    return np.clip(iq, p["iq_report_floor"], p["iq_report_ceiling"]).astype(np.float32)


def distribution_diagnostics(x: np.ndarray, p) -> dict:
    """Robust descriptive statistics reported alongside every assessment."""
    if x.size == 0:
        return {}
    med = float(np.median(x))
    mad = 1.4826 * float(np.median(np.abs(x - med)))
    lo, hi = np.percentile(x, [5, 95])
    trimmed = x[(x >= lo) & (x <= hi)]
    q1, q3 = np.percentile(x, [25, 75])
    m, s = float(np.mean(x)), float(np.std(x, ddof=1))
    skew = float(np.mean(((x - m) / max(s, 1e-9)) ** 3))
    return {
        "mean": m, "sd": s, "median": med, "mad": mad,
        "trimmed_mean_5pct": float(np.mean(trimmed)),
        "iqr": float(q3 - q1), "skew": skew,
        "ceiling_frac": float(np.mean(x >= p["iq_report_ceiling"] - 1e-6)),
        "floor_frac": float(np.mean(x <= p["iq_report_floor"] + 1e-6)),
    }


def assign_bands(iq: np.ndarray, p) -> np.ndarray:
    bands = p["iq_bands"]
    out = np.full(iq.size, -1, dtype=np.int8)
    for i, (lo, hi) in enumerate(bands):
        out[(iq >= lo) & (iq < hi)] = i
    # top band is closed on the reporting ceiling
    out[iq >= p["iq_report_ceiling"] - 1e-6] = len(bands) - 1
    return out


def inherit(p, rng, mother_g: np.ndarray, father_g: np.ndarray,
            pop_mean: float) -> np.ndarray:
    """Polygenic-plus-environment endowment for newborns.

    Deliberately NOT a single-gene model: a mid-parent term with regression to
    the contemporaneous mean, a shared-environment term supplied later by the
    development model, and a large residual. h2 and the environment share are
    both sensitivity parameters.
    """
    h2 = float(p["heritability_latent"])
    shared = float(p["shared_environment_share"])
    reg = float(p["regression_to_mean"])
    sd = float(p["abs_scale_sd"])
    mid = 0.5 * (mother_g + father_g)
    expected = pop_mean + reg * h2 * (mid - pop_mean)
    resid_sd = sd * np.sqrt(max(1.0 - h2 ** 2 - shared, 0.05))
    return (expected + rng.normal(0.0, resid_sd, size=mid.size)).astype(np.float32)
