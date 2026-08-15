"""Health, adaptive functioning, support, housing and employment sub-models.

Causal discipline (docs/HYPOTHESES.md, docs/COGNITIVE_MODEL.md): cognition never
acts directly on an outcome. It acts only through named intermediate pathways --
health literacy, occupational fit, adaptive functioning, financial stability --
and each pathway can be attenuated by cognitive accessibility (`scaffolding`).
Set scaffolding to 1.0 and the cognitive gradient in mortality nearly vanishes;
that is a modelled mechanism, not an assumed result.
"""

from __future__ import annotations

import numpy as np

from . import occupations as occ
from .cognition import IDX

HOUSING_TYPES = [
    "independent", "accessible_independent", "cluster", "supported_apartment",
    "multigenerational", "assisted_living", "medical_residential",
    "high_supervision", "emergency",
]


# ---------------------------------------------------------------------------
# adaptive functioning and support need
# ---------------------------------------------------------------------------

def adaptive_functioning(st, idx, latent_now, p, scaffolding: float) -> np.ndarray:
    """Index in [0, 1]. Cognitive load is only one input, and scaffolding
    removes part of the load that the environment (not the person) creates."""
    ef = (latent_now[:, IDX["executive_function"]] - 70.0) / 60.0
    pj = (latent_now[:, IDX["practical_judgment"]] - 70.0) / 60.0
    base = 0.55 * np.clip(ef, 0, 1.2) + 0.45 * np.clip(pj, 0, 1.2)

    age = st.age[idx]
    child = np.clip(age / 18.0, 0.0, 1.0)
    frail = np.clip((age - 75.0) / 35.0, 0.0, 1.0)

    load = (0.45 * (1.0 - np.clip(base, 0, 1))
            + 0.30 * st.disability[idx]
            + 0.20 * st.mental[idx]
            + 0.15 * st.sensory[idx]
            + 0.35 * st.dementia[idx]
            + 0.25 * frail)
    # environmental scaffolding removes part of the *environmentally imposed*
    # component of load, not the person's impairment
    load *= (1.0 - 0.55 * scaffolding)
    af = np.clip(child * (1.0 - load), 0.0, 1.0)
    return af.astype(np.float32)


def need_assessment(st, idx, p, rng) -> tuple[np.ndarray, np.ndarray]:
    """Assessed need index and discretised need level (0..8).

    The assessment is noisy; the noise is what produces over- and under-support,
    which are tracked outcomes rather than hidden bookkeeping."""
    true_need = np.clip(
        1.0 - st.adaptive[idx]
        + 0.35 * st.disability[idx]
        + 0.25 * st.mental[idx]
        + 0.20 * (1.0 - st.health[idx])
        + 0.30 * st.dementia[idx], 0.0, 1.6) / 1.6
    noise = rng.normal(0.0, float(p["support_assessment_error"]), size=idx.size)
    assessed = np.clip(true_need + noise, 0.0, 1.0).astype(np.float32)
    levels = int(p["support_levels"])
    lvl = np.clip((assessed * levels).astype(np.int8), 0, levels - 1)
    return assessed, lvl


def assign_support(st, idx, p, society: str) -> None:
    """Allocate support under a resource ceiling.

    Support is a function of assessed need in ALL societies -- never of IQ. In
    Society A the administrative process is less accessible, so a fraction of
    need goes unrequested; that is modelled through capacity, not eligibility."""
    need = st.need_level[idx].astype(np.float32)
    cap_ratio = float(p["support_capacity_per_capita"])
    total_need = need.sum()
    if total_need <= 0:
        st.support_level[idx] = 0
        st.unmet[idx] = 0.0
        return
    budget = cap_ratio * total_need
    if budget >= total_need:
        assigned = need.copy()
    else:
        # Ration by need, highest first. O(n) via the discrete level histogram
        # rather than a full sort: levels are small integers.
        levels = int(p["support_levels"])
        counts = np.bincount(need.astype(np.int64), minlength=levels)
        assigned = np.zeros_like(need)
        remaining = budget
        cut_level, partial = 0, 0.0
        for lv in range(levels - 1, -1, -1):
            cost = counts[lv] * lv
            if cost <= remaining:
                remaining -= cost
                cut_level = lv
            else:
                cut_level = lv + 1
                partial = remaining / max(lv, 1)  # citizens served at this level
                break
        full = need >= cut_level
        assigned[full] = need[full]
        if partial >= 1 and cut_level - 1 >= 0:
            at_cut = np.flatnonzero(need == cut_level - 1)
            k = int(min(partial, at_cut.size))
            assigned[at_cut[:k]] = cut_level - 1
    st.support_level[idx] = assigned.astype(np.int8)
    st.unmet[idx] = np.maximum(need - assigned, 0.0)
    over = np.maximum(assigned - need, 0.0)
    st.over_support_years[idx] += over


def assign_housing(st, idx, p, society: str, rng) -> None:
    """Housing as shelter and as cognitive infrastructure."""
    need = st.need_level[idx].astype(np.float32) / max(int(p["support_levels"]) - 1, 1)
    pref_w = float(p["housing_preference_weight"])
    admin = need
    if society == "A":
        # IQ influences allocation rules in Society A
        iq = np.nan_to_num(st.official_iq[idx], nan=100.0)
        admin = np.clip(0.6 * need + 0.4 * (1.0 - (iq - 55.0) / 95.0), 0.0, 1.0)
    pref = st.housing_pref[idx].astype(np.float32) / (len(HOUSING_TYPES) - 1)
    score = (1.0 - pref_w) * admin + pref_w * pref
    slack = float(p["housing_capacity_slack"])
    jitter = rng.normal(0.0, 0.03 * (1.0 + slack), size=idx.size)
    lvl = np.clip(((score + jitter) * (len(HOUSING_TYPES) - 1)).round(), 0,
                  len(HOUSING_TYPES) - 1)
    st.housing[idx] = lvl.astype(np.int8)


# ---------------------------------------------------------------------------
# employment
# ---------------------------------------------------------------------------

def allocate_jobs(st, idx, latent_now, p, society: str, rng) -> None:
    """Assign occupations to the citizens in `idx` under sector capacity."""
    n = idx.size
    if n == 0:
        return
    caps = occ.capacity(n)
    rule = p["allocation_rule"]

    if rule == "iq_rank":
        # Society A: rank by official score, fill highest-complexity roles first
        key = np.nan_to_num(st.official_iq[idx], nan=100.0).astype(np.float32)
        key = key + rng.normal(0, 0.01, size=n)  # deterministic tie-break
        job_order = np.argsort(-occ.COMPLEXITY)
        ranked = np.argsort(-key)
        out = np.empty(n, dtype=np.int16)
        pos = 0
        for j in job_order:
            take = int(caps[j])
            out[ranked[pos:pos + take]] = j
            pos += take
        st.occupation[idx] = out

    elif rule == "preference_qualification":
        # Society B: preference first, then qualification/experience, capacity-limited
        pref = st.occ_pref[idx].astype(np.int64)
        qual = (st.expertise[idx] + 0.05 * st.experience[idx]
                + 0.5 * st.phys_cap[idx] + rng.normal(0, 0.1, size=n))
        out = np.full(n, -1, dtype=np.int16)
        remaining = caps.copy()
        for j in range(occ.N_OCC):
            want = np.flatnonzero(pref == j)
            if want.size == 0:
                continue
            if want.size <= remaining[j]:
                out[want] = j
                remaining[j] -= want.size
            else:
                k = int(remaining[j])
                sel = want[np.argpartition(-qual[want], k - 1)[:k]] if k > 0 else want[:0]
                out[sel] = j
                remaining[j] = 0
        left = np.flatnonzero(out < 0)
        if left.size:
            slots = np.repeat(np.arange(occ.N_OCC), remaining)
            slots = slots[:left.size]
            if slots.size < left.size:
                slots = np.concatenate([slots, np.zeros(left.size - slots.size, dtype=slots.dtype)])
            out[left] = slots.astype(np.int16)
        st.occupation[idx] = out

    elif rule == "competency_fit":
        # Society C: multidimensional fit, filled highest-consequence first
        scores = occ.fit_scores(latent_now, st.phys_cap[idx], st.expertise[idx],
                                st.experience[idx], st.occ_pref[idx].astype(np.int64), p)
        scores += rng.normal(0, 0.01, size=scores.shape)
        out = np.full(n, -1, dtype=np.int16)
        free = np.ones(n, dtype=bool)
        for j in np.argsort(-occ.CONSEQUENCE):
            k = int(min(caps[j], free.sum()))
            if k <= 0:
                continue
            cand = np.flatnonzero(free)
            s = scores[cand, j]
            sel = cand[np.argpartition(-s, k - 1)[:k]] if k < cand.size else cand
            out[sel] = j
            free[sel] = False
        leftover = np.flatnonzero(out < 0)
        if leftover.size:
            out[leftover] = np.argmax(scores[leftover], axis=1).astype(np.int16)
        st.occupation[idx] = out
    else:  # pragma: no cover
        raise ValueError(rule)

    st.experience[idx] = 0.0


def job_performance(st, idx, latent_now, p, scaffolding: float, rng) -> None:
    """Performance and mismatch for employed citizens."""
    j = st.occupation[idx].astype(np.int64)
    ok = j >= 0
    if not ok.any():
        return
    ii = idx[ok]
    jj = j[ok]
    lat = latent_now[ok]
    short = np.maximum(occ.REQUIRE[jj] - lat, 0.0)
    surplus = np.maximum(lat - occ.REQUIRE[jj], 0.0)
    w = occ.WEIGHT[jj]
    gap = np.einsum("nd,nd->n", short, w) / 15.0          # in SD units
    over = np.einsum("nd,nd->n", surplus, w) / 15.0
    phys_gap = np.maximum(occ.PHYSICAL[jj] - st.phys_cap[ii], 0.0)

    # support and accessible workplaces close part of the capability gap
    support_help = 0.35 * (st.support_level[ii] / max(int(p["support_levels"]) - 1, 1))
    eff_gap = np.maximum(gap * (1.0 - 0.45 * scaffolding - support_help), 0.0)

    exp_w = float(p["experience_performance_weight"])
    exp_term = exp_w * np.minimum(st.experience[ii] / 10.0, 1.0)
    perf = (1.0 - 0.55 * eff_gap - 0.8 * phys_gap
            + exp_term + 0.25 * st.expertise[ii]
            - 0.3 * st.burnout[ii] - 0.25 * (1.0 - st.health[ii])
            + rng.normal(0, 0.08, size=ii.size))
    st.performance[ii] = np.clip(perf, 0.0, 1.6).astype(np.float32)
    # mismatch: capability shortfall AND unused capability both count
    st.mismatch[ii] = np.clip(eff_gap + 0.25 * over, 0.0, 4.0).astype(np.float32)

    strain = np.clip(eff_gap + occ.STRESS[jj] - support_help, 0.0, 2.0)
    burn = rng.random(ii.size) < float(p["burnout_rate"]) * strain
    st.burnout[ii] = np.clip(st.burnout[ii] + 0.35 * burn - 0.10, 0.0, 1.0)
    st.stress[ii] = np.clip(0.25 + 0.35 * strain + 0.3 * st.burnout[ii], 0.0, 1.0)
    st.experience[ii] += 1.0
    st.expertise[ii] = np.clip(
        st.expertise[ii] + float(p["training_rate"]) * (1.0 - st.expertise[ii]), 0.0, 1.0)
    # unemployed / non-working citizens decay stress toward baseline
    idle = idx[~ok]
    st.stress[idle] = np.clip(st.stress[idle] * 0.9 + 0.02, 0.0, 1.0)


# ---------------------------------------------------------------------------
# health and mortality
# ---------------------------------------------------------------------------

def health_literacy(st, idx, latent_now, p, scaffolding: float) -> np.ndarray:
    """Standardised health-literacy pathway score (the cognition -> health route)."""
    comp = (0.5 * latent_now[:, IDX["verbal_comprehension"]]
            + 0.3 * latent_now[:, IDX["executive_function"]]
            + 0.2 * latent_now[:, IDX["numerical_reasoning"]])
    z = (comp - 100.0) / 15.0
    support = st.support_level[idx] / max(int(p["support_levels"]) - 1, 1)
    # accessible systems + assigned support compress the gradient toward zero
    attenuation = 1.0 - float(p["accessibility_closes_gradient"]) * np.clip(
        scaffolding * 0.75 + 0.25 * support, 0.0, 1.0)
    return (z * attenuation).astype(np.float32)


def update_health(st, idx, latent_now, p, rng, scaffolding: float,
                  shock_burden: float, med_level: float) -> None:
    age = st.age[idx]
    n = idx.size
    u = rng.random((5, n))

    hz_chronic = (float(p["chronic_onset_base"])
                  * np.exp(float(p["chronic_age_slope"]) * (age - 30.0)))
    hz_chronic *= (1.0 + 0.5 * occ.CONSEQUENCE[np.clip(st.occupation[idx], 0, None)]
                   * (st.occupation[idx] >= 0))
    hz_chronic *= (1.0 - 0.25 * med_level)
    new_chronic = u[0] < np.clip(hz_chronic, 0, 0.9)
    st.chronic[idx] = np.minimum(st.chronic[idx] + new_chronic, 12)

    hz_dem = float(p["dementia_base"]) * 2.0 ** ((age - 65.0) / float(p["dementia_doubling"]))
    st.dementia[idx] |= (u[1] < np.clip(hz_dem, 0, 0.9)) & (age > 45)

    j = st.occupation[idx]
    hazard_occ = np.where(j >= 0, occ.CONSEQUENCE[np.clip(j, 0, None)], 0.2)
    hz_inj = (float(p["injury_rate_base"]) * (1.0 + hazard_occ)
              * (1.0 + float(p["mismatch_error_multiplier"]) * 0.25 * st.mismatch[idx])
              * (1.0 - 0.35 * scaffolding))
    injured = u[2] < np.clip(hz_inj, 0, 0.9)
    st.disability[idx] = np.clip(st.disability[idx] + 0.12 * injured
                                 + 0.02 * (age > 70), 0.0, 1.0)

    hz_mh = float(p["mental_health_incidence"]) * (1.0 + 1.5 * st.stress[idx]) \
        * (1.0 - 0.2 * scaffolding)
    st.mental[idx] = np.clip(st.mental[idx] + 0.25 * (u[3] < hz_mh) - 0.05, 0.0, 1.0)
    st.sensory[idx] = np.clip(st.sensory[idx] + 0.008 * (age > 55), 0.0, 1.0)

    st.acute[idx] = np.clip(0.6 * st.acute[idx] + 0.5 * (u[4] < 0.05 + 0.3 * shock_burden),
                            0.0, 1.0)
    st.phys_cap[idx] = np.clip(1.0 - 0.6 * st.disability[idx]
                               - np.clip((age - 60.0) / 60.0, 0, 0.6), 0.05, 1.0)
    st.health[idx] = np.clip(1.0
                             - 0.09 * st.chronic[idx]
                             - 0.30 * st.disability[idx]
                             - 0.20 * st.mental[idx]
                             - 0.25 * st.dementia[idx]
                             - 0.30 * st.acute[idx]
                             - np.clip((age - 65.0) / 70.0, 0, 0.5), 0.0, 1.0)


def mortality_hazard(st, idx, p, hlit: np.ndarray, med_level: float,
                     shock_burden: float) -> np.ndarray:
    age = st.age[idx]
    h = (float(p["gompertz_a"]) * np.exp(float(p["gompertz_b"]) * age)
         + float(p["makeham_c"]))
    h = np.where(age < 1, float(p["infant_mortality"]),
                 np.where(age < 15, float(p["child_mortality"]) + h, h))
    h = h * (1.0 + 0.55 * st.chronic[idx] + 0.9 * st.disability[idx]
             + 0.35 * st.mental[idx] + 1.2 * st.dementia[idx]
             + 0.8 * (1.0 - st.health[idx]))
    # the single cognition -> mortality route, attenuable by accessibility
    h *= np.exp(-float(p["health_literacy_gradient"]) * hlit)
    lvl = st.support_level[idx] / max(int(p["support_levels"]) - 1, 1)
    matched = 1.0 - float(p["support_mortality_benefit"]) * lvl
    unmet = 1.0 + float(p["undersupport_mortality_penalty"]) * (
        st.unmet[idx] / max(int(p["support_levels"]) - 1, 1))
    h = h * matched * unmet
    h *= (1.0 - med_level)
    h *= (1.0 + 2.0 * shock_burden)
    h += 0.15 * (st.abuse_state[idx] == 1) * 0.02
    return np.clip(h, 0.0, 1.0)
