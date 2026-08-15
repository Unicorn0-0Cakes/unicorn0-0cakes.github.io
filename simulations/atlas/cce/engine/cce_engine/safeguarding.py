"""Welfare checks, detection of hidden severe abuse, and intervention.

Abuse is NOT set to zero. Situations are initiated stochastically, weighted by
modelled vulnerability (dependence on a caregiver, isolation, restrictive
housing, unmet support need). What the civilization controls is the *duration*:
mandatory in-person checks, randomised inspection, medical anomaly detection,
attendance and employment presence monitoring, financial anomaly detection and
anonymous reporting each provide an independent detection opportunity.

The default regime targets near-total prevention of *prolonged* hidden abuse:
no situation may persist undetected beyond `max_undetected_duration`. That cap
is enforced explicitly and is itself a sensitivity parameter, so a researcher
can ask what a weaker safeguarding system would cost.
"""

from __future__ import annotations

import numpy as np


def vulnerability_index(st, idx, p) -> np.ndarray:
    lvl = st.support_level[idx] / max(int(p["support_levels"]) - 1, 1)
    restrictive = (st.housing[idx] >= 5).astype(np.float32)
    child = (st.age[idx] < 18).astype(np.float32)
    old = (st.age[idx] > 80).astype(np.float32)
    return np.clip(0.35 * lvl + 0.25 * restrictive + 0.2 * (1 - st.adaptive[idx])
                   + 0.15 * child + 0.15 * old
                   + 0.2 * st.unmet[idx] / max(int(p["support_levels"]) - 1, 1),
                   0.0, 1.0).astype(np.float32)


def step(st, idx, p, rng, year: int, gov_quality: float) -> dict:
    """One year of safeguarding. Returns aggregate counters for the log."""
    st.vulnerability[idx] = vulnerability_index(st, idx, p)

    # --- initiation --------------------------------------------------------
    inactive = idx[st.abuse_state[idx] == 0]
    hz = float(p["abuse_attempt_rate"]) * (0.3 + 1.7 * st.vulnerability[inactive])
    started = inactive[rng.random(inactive.size) < hz]
    st.abuse_state[started] = 1
    st.abuse_since[started] = year

    # --- detection ---------------------------------------------------------
    active = idx[st.abuse_state[idx] == 1]
    interval = float(p["welfare_check_interval"])
    checks_per_year = max(1.0 / max(interval, 1e-6), 1.0)
    eff = float(p["safeguard_detection_effectiveness"])
    eff = float(np.clip(eff * (0.85 + 0.3 * gov_quality), 0.0, 1.0))
    # corrupted inspectors reduce effective detection for a subset
    compromised = rng.random(active.size) < float(p["inspector_corruption_rate"])
    p_detect = 1.0 - (1.0 - eff) ** checks_per_year
    p_detect_arr = np.where(compromised, p_detect * 0.4, p_detect)
    detected = active[rng.random(active.size) < p_detect_arr]

    # --- hard cap on undetected duration ----------------------------------
    still = idx[st.abuse_state[idx] == 1]
    overdue = still[(year - st.abuse_since[still]) >= float(p["max_undetected_duration"])]
    forced = np.setdiff1d(overdue, detected, assume_unique=False)
    all_detected = np.union1d(detected, forced)
    delays = (year - st.abuse_since[all_detected]) if all_detected.size else np.zeros(0)
    st.abuse_state[all_detected] = 2

    # --- intervention ------------------------------------------------------
    intervening = idx[st.abuse_state[idx] == 2]
    resolved = intervening[rng.random(intervening.size) < float(p["intervention_success"])]
    st.abuse_state[resolved] = 0
    st.abuse_since[resolved] = np.nan

    n_checks = int(idx.size * checks_per_year)
    false_pos = int(n_checks * float(p["false_positive_rate"]))
    return {
        "abuse_initiated": int(started.size),
        "abuse_detected": int(all_detected.size),
        "abuse_forced_detected": int(forced.size),
        "abuse_active_end": int((st.abuse_state[idx] == 1).sum()),
        "abuse_intervening": int((st.abuse_state[idx] == 2).sum()),
        "abuse_resolved": int(resolved.size),
        "mean_detection_delay_years": float(np.mean(delays)) if len(delays) else 0.0,
        "max_detection_delay_years": float(np.max(delays)) if len(delays) else 0.0,
        "welfare_checks": n_checks,
        "false_positive_findings": false_pos,
        "inspectors_compromised": int(compromised.sum()),
    }
