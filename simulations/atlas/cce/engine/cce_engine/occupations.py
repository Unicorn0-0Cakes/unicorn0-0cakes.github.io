"""Occupational ecosystem and multidimensional requirement profiles.

Each occupation carries a requirement vector over the same latent dimensions
used for citizens, plus non-cognitive requirements (physical capacity, social
demand, consistency, error consequence, training time, stress, novelty).

Requirements are built from role archetypes rather than hand-tuned numbers so
that the mapping is transparent and reproducible. Nothing here is empirically
calibrated; the profiles are stylised (docs/PARAMETER_REGISTER.md).
"""

from __future__ import annotations

import numpy as np

from .cognition import DIMS, IDX

ARCHETYPES = ["analytic", "verbal", "spatial", "practical", "social"]

# archetype -> latent-dimension emphasis (rows sum is not constrained)
_A2D = np.zeros((len(ARCHETYPES), len(DIMS)), dtype=np.float32)
_A2D[0, [IDX["fluid_reasoning"], IDX["numerical_reasoning"], IDX["working_memory"]]] = [0.45, 0.35, 0.20]
_A2D[1, [IDX["verbal_comprehension"], IDX["working_memory"], IDX["social_understanding"]]] = [0.55, 0.25, 0.20]
_A2D[2, [IDX["spatial_reasoning"], IDX["processing_speed"], IDX["fluid_reasoning"]]] = [0.55, 0.25, 0.20]
_A2D[3, [IDX["practical_judgment"], IDX["processing_speed"], IDX["consistency"]]] = [0.50, 0.20, 0.30]
_A2D[4, [IDX["social_understanding"], IDX["emotional_regulation"], IDX["verbal_comprehension"]]] = [0.45, 0.35, 0.20]

# name, demand share, complexity, archetype mix (a,v,s,p,so),
# physical, social, consequence, training years, stress, novelty
_OCC = [
    ("agriculture",            0.075, 0.30, (0.1, 0.1, 0.2, 0.5, 0.1), 0.75, 0.25, 0.35, 1.0, 0.35, 0.20),
    ("food_production",        0.045, 0.30, (0.1, 0.1, 0.2, 0.5, 0.1), 0.60, 0.30, 0.45, 1.0, 0.35, 0.15),
    ("manufacturing",          0.070, 0.40, (0.2, 0.1, 0.3, 0.35, 0.05), 0.65, 0.25, 0.45, 1.5, 0.40, 0.20),
    ("construction",           0.055, 0.40, (0.15, 0.05, 0.4, 0.35, 0.05), 0.85, 0.30, 0.60, 1.5, 0.45, 0.25),
    ("transportation",         0.050, 0.35, (0.1, 0.1, 0.35, 0.4, 0.05), 0.55, 0.30, 0.70, 1.0, 0.40, 0.20),
    ("sanitation",             0.030, 0.25, (0.05, 0.05, 0.2, 0.65, 0.05), 0.70, 0.20, 0.50, 0.5, 0.30, 0.10),
    ("healthcare",             0.085, 0.70, (0.35, 0.2, 0.1, 0.15, 0.20), 0.50, 0.75, 0.90, 6.0, 0.65, 0.55),
    ("education",              0.060, 0.60, (0.2, 0.35, 0.05, 0.1, 0.30), 0.30, 0.85, 0.55, 4.0, 0.55, 0.45),
    ("childcare",              0.045, 0.45, (0.05, 0.2, 0.05, 0.3, 0.40), 0.55, 0.85, 0.70, 1.5, 0.50, 0.30),
    ("elder_care",             0.055, 0.45, (0.05, 0.2, 0.05, 0.3, 0.40), 0.65, 0.80, 0.70, 1.5, 0.55, 0.25),
    ("engineering",            0.045, 0.75, (0.4, 0.1, 0.35, 0.1, 0.05), 0.35, 0.40, 0.85, 5.0, 0.55, 0.60),
    ("scientific_research",    0.030, 0.85, (0.55, 0.2, 0.15, 0.05, 0.05), 0.20, 0.40, 0.40, 7.0, 0.55, 0.90),
    ("administration",         0.055, 0.55, (0.25, 0.35, 0.05, 0.15, 0.20), 0.15, 0.55, 0.50, 3.0, 0.45, 0.30),
    ("law",                    0.020, 0.75, (0.25, 0.5, 0.05, 0.05, 0.15), 0.15, 0.65, 0.75, 6.0, 0.60, 0.45),
    ("public_safety",          0.035, 0.55, (0.15, 0.15, 0.15, 0.3, 0.25), 0.80, 0.65, 0.90, 2.0, 0.70, 0.50),
    ("utilities",              0.025, 0.55, (0.3, 0.1, 0.3, 0.25, 0.05), 0.55, 0.25, 0.85, 3.0, 0.45, 0.30),
    ("energy",                 0.025, 0.60, (0.35, 0.1, 0.3, 0.2, 0.05), 0.55, 0.25, 0.90, 3.5, 0.50, 0.35),
    ("information_technology", 0.040, 0.70, (0.45, 0.15, 0.25, 0.1, 0.05), 0.15, 0.35, 0.65, 4.0, 0.50, 0.70),
    ("logistics",              0.040, 0.50, (0.25, 0.15, 0.2, 0.3, 0.10), 0.40, 0.45, 0.55, 2.0, 0.50, 0.35),
    ("arts",                   0.025, 0.45, (0.15, 0.3, 0.3, 0.15, 0.10), 0.30, 0.40, 0.15, 2.0, 0.35, 0.85),
    ("communication",          0.025, 0.50, (0.2, 0.45, 0.1, 0.1, 0.15), 0.20, 0.60, 0.35, 2.5, 0.45, 0.50),
    ("maintenance",            0.045, 0.40, (0.15, 0.05, 0.35, 0.4, 0.05), 0.70, 0.25, 0.60, 1.5, 0.40, 0.25),
    ("environmental_mgmt",     0.025, 0.55, (0.35, 0.15, 0.2, 0.25, 0.05), 0.55, 0.35, 0.50, 3.0, 0.40, 0.45),
    ("emergency_response",     0.020, 0.60, (0.2, 0.1, 0.2, 0.3, 0.20), 0.90, 0.60, 0.95, 2.0, 0.80, 0.65),
]

NAMES = [o[0] for o in _OCC]
N_OCC = len(_OCC)

DEMAND = np.array([o[1] for o in _OCC], dtype=np.float32)
DEMAND = DEMAND / DEMAND.sum()
COMPLEXITY = np.array([o[2] for o in _OCC], dtype=np.float32)
_MIX = np.array([o[3] for o in _OCC], dtype=np.float32)
PHYSICAL = np.array([o[4] for o in _OCC], dtype=np.float32)
SOCIAL = np.array([o[5] for o in _OCC], dtype=np.float32)
CONSEQUENCE = np.array([o[6] for o in _OCC], dtype=np.float32)
TRAINING = np.array([o[7] for o in _OCC], dtype=np.float32)
STRESS = np.array([o[8] for o in _OCC], dtype=np.float32)
NOVELTY = np.array([o[9] for o in _OCC], dtype=np.float32)

# Requirement level on the Year-0 absolute scale (mean 100, SD 15).
# A complexity-0.5 role requires roughly the population mean on its key dims.
_W = np.sum(
    _MIX[:, :, None] * _A2D[None, :, :],
    axis=1,
    dtype=np.float64,
).astype(np.float32)                                   # (N_OCC, N_DIMS) emphasis
_W = _W / np.maximum(_W.sum(axis=1, keepdims=True), 1e-6)
REQ_LEVEL = 100.0 + 30.0 * (COMPLEXITY - 0.5)      # required level on key dims
REQUIRE = (REQ_LEVEL[:, None] * np.ones((1, len(DIMS)), dtype=np.float32)).astype(np.float32)
WEIGHT = _W.astype(np.float32)

# Executive functioning and consistency matter everywhere, scaled by consequence.
for _j in range(N_OCC):
    WEIGHT[_j, IDX["executive_function"]] += 0.10 + 0.15 * CONSEQUENCE[_j]
    WEIGHT[_j, IDX["consistency"]] += 0.05 + 0.20 * CONSEQUENCE[_j]
    WEIGHT[_j, IDX["social_understanding"]] += 0.15 * SOCIAL[_j]
WEIGHT /= WEIGHT.sum(axis=1, keepdims=True)


def capacity(n_workers: int) -> np.ndarray:
    """Integer job slots by sector for a given workforce size."""
    raw = DEMAND * n_workers
    base = np.floor(raw).astype(np.int64)
    short = int(n_workers - base.sum())
    if short > 0:
        order = np.argsort(-(raw - base))
        base[order[:short]] += 1
    return base


def fit_scores(latent: np.ndarray, phys: np.ndarray, expertise: np.ndarray,
               experience: np.ndarray, pref: np.ndarray, p) -> np.ndarray:
    """(n_citizens, N_OCC) fit score used by Society C.

    Weighted shortfall against multidimensional requirements, plus demonstrated
    expertise, experience and stated preference. Surplus capability above the
    requirement adds nothing: a role does not get better because the holder is
    far above its demands.
    """
    n = latent.shape[0]
    penalty = np.empty((n, N_OCC), dtype=np.float32)
    for j in range(N_OCC):  # loop over 24 jobs, vectorised over citizens
        short = np.maximum(REQUIRE[j][None, :] - latent, 0.0)

        if not np.isfinite(short).all():
            raise FloatingPointError(
                f"Non-finite occupational shortfall values for occupation {j}"
            )

        if not np.isfinite(WEIGHT[j]).all():
            raise FloatingPointError(
                f"Non-finite occupational weights for occupation {j}"
            )

        penalty[:, j] = np.sum(
            short * WEIGHT[j],
            axis=1,
            dtype=np.float64,
        ).astype(np.float32)
    phys_pen = np.maximum(PHYSICAL[None, :] - phys[:, None], 0.0) * 40.0
    score = -penalty - phys_pen
    score += 8.0 * expertise[:, None]
    score += float(p["experience_performance_weight"]) * 8.0 * np.minimum(experience, 10.0)[:, None]
    if pref is not None:
        ok = pref >= 0
        score[np.flatnonzero(ok), pref[ok]] += 6.0
    return score.astype(np.float32)
