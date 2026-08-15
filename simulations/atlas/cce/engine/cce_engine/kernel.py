"""Simulation kernel: annual vectorised time step.

One run = one society, one seed, one parameter set. The kernel is deterministic:
given (model_version, params, seed, society) the entire trajectory and every
output byte is reproducible, and can be resumed from a checkpoint to the same
future trajectory.
"""

from __future__ import annotations

import math
import os
import platform
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np

from . import cognition as cog
from . import events as ev
from . import government as govmod
from . import models as mdl
from . import occupations as occ
from . import safeguarding as safe
from .params import Params
from .recorder import Recorder
from .rng import RunRNG, shock_block
from .state import State

MODEL_VERSION = "0.1.0-milestone0"


def git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL, text=True).strip()
    except Exception:
        return "not provided"


@dataclass
class RunConfig:
    society: str = "A"
    seed: int = 1
    years: int = 100
    capacity: int = 10_000
    logging_level: str = "standard"
    outdir: str | None = None
    run_number: int = 1
    params: Params | None = None
    panel_size: int | None = None
    checkpoint_interval: int | None = None
    tag: str = "exploratory"      # main | exploratory | calibration | debug | sensitivity

    @property
    def experiment_id(self) -> str:
        return f"CCE-{self.society}-{self.run_number:04d}"


@dataclass
class RunResult:
    experiment_id: str
    manifest: dict
    annual: list = field(default_factory=list)
    assessments: list = field(default_factory=list)
    events: list = field(default_factory=list)
    summary: dict = field(default_factory=dict)


class Simulation:
    def __init__(self, cfg: RunConfig):
        self.cfg = cfg
        self._t0 = time.perf_counter()
        self.started_utc = datetime.now(timezone.utc).isoformat()
        self.p = (cfg.params or Params()).override()
        self.p.society = cfg.society
        self.p.values["population_cap"] = cfg.capacity
        self.rng = RunRNG(cfg.seed, cfg.society)
        self.st = State(cfg.capacity)
        self.rec = Recorder(cfg.outdir or f"./runs/{cfg.experiment_id}",
                            cfg.experiment_id, cfg.logging_level)
        self.gov = govmod.Government()
        self.year = 0
        self.med_level = 0.0
        self.tech = 1.0
        self.ref_scores: np.ndarray | None = None
        self.presidents: list[dict] = []
        self.births_denied = 0
        self.opening_wait: list[float] = []
        self._init_population()

    # ------------------------------------------------------------------
    # baseline population (shared stream -> identical in A, B and C)
    # ------------------------------------------------------------------
    def _init_population(self) -> None:
        p, st = self.p, self.st
        g = self.rng("population_init")
        n = self.cfg.capacity
        idx = st.allocate(n)

        # stationary-ish age structure
        age = np.clip(g.gamma(shape=2.2, scale=16.0, size=n), 0, p["max_age"] - 1)
        st.age[idx] = age.astype(np.float32)
        st.birth_year[idx] = (-age).astype(np.int32)
        st.sex[idx] = g.integers(0, 2, size=n).astype(np.int8)

        endow = g.normal(p["abs_scale_mean"], p["abs_scale_sd"], size=n).astype(np.float32)
        st.g_endow[idx] = endow
        st.latent[idx] = cog.sample_profiles(n, endow, p, g)
        st.g_abs[idx] = cog.g_from_profile(st.latent[idx])

        st.adversity[idx] = np.clip(g.beta(2, 6, size=n), 0, 1).astype(np.float32)
        st.edu_years[idx] = np.clip(np.minimum(age - 5, 16) * g.uniform(0.6, 1.0, n),
                                    0, 20).astype(np.float32)
        st.edu_quality[idx] = g.uniform(0.3, 0.9, n).astype(np.float32)
        st.chronic[idx] = g.binomial(3, np.clip(age / 200.0, 0, 0.9)).astype(np.int8)
        st.disability[idx] = np.clip(g.beta(1.3, 12, size=n) + 0.004 * np.maximum(age - 60, 0),
                                     0, 1).astype(np.float32)
        st.mental[idx] = np.clip(g.beta(1.2, 10, size=n), 0, 1).astype(np.float32)
        st.sensory[idx] = np.clip(g.beta(1.2, 14, size=n) + 0.004 * np.maximum(age - 55, 0),
                                  0, 1).astype(np.float32)
        st.dementia[idx] = (g.random(n) < np.where(age > 65, 0.05, 0.0))
        st.occ_pref[idx] = g.choice(occ.N_OCC, size=n, p=occ.DEMAND).astype(np.int16)
        st.housing_pref[idx] = g.integers(0, 4, size=n).astype(np.int8)
        st.desired_children[idx] = np.clip(
            g.normal(p["desired_children_mean"], p["desired_children_sd"], n), 0, 8
        ).astype(np.float32)
        st.expertise[idx] = np.clip(g.beta(2, 5, n) * np.clip((age - 18) / 30, 0, 1),
                                    0, 1).astype(np.float32)
        st.experience[idx] = np.clip(age - 20, 0, 45).astype(np.float32) * g.uniform(0.3, 1, n)
        st.health[idx] = 1.0
        st.phys_cap[idx] = 1.0

        k = self.cfg.panel_size if self.cfg.panel_size is not None else p["panel_size"]
        if k:
            step = max(n // int(k), 1)
            st.panel[idx[::step]] = True

    # ------------------------------------------------------------------
    def latent_now(self, idx: np.ndarray) -> np.ndarray:
        lat = cog.age_profile(self.st.latent[idx], self.st.age[idx], self.p)
        dem = self.st.dementia[idx]
        if dem.any():
            lat[dem] *= 0.72
        return lat

    # ------------------------------------------------------------------
    def run(self) -> RunResult:
        for _ in range(self.cfg.years):
            self.step()
        return self.finalize()

    def step(self) -> None:
        p, st = self.p, self.st
        year = self.year
        scaff = float(p["scaffolding_strength"])

        # --- 1. shared external history -------------------------------
        block = shock_block(self.rng, year)
        yev = ev.decode(block, p, year)
        for e in yev.active:
            self.rec.event({**e, "category": "environment"})
        self.med_level = min(self.med_level + float(p["medical_innovation_rate"])
                             * (1 + yev.innovation_boost), 0.6)

        alive = st.living()
        if alive.size == 0:
            self.rec.year({"year": year, "population": 0, "collapsed": 1})
            self.year += 1
            return

        support_cov = float(np.mean(st.support_level[alive] > 0))
        preparedness = float(np.clip(0.4 * self.gov.quality + 0.3 * support_cov
                                     + 0.3 * scaff, 0, 1))
        mort_burden, output_loss = ev.absorbed(yev, preparedness)

        # --- 2. ageing and development --------------------------------
        st.age[alive] += 1.0
        kids = alive[(st.age[alive] >= 5) & (st.age[alive] < 19)]
        if kids.size:
            gain = (float(p["education_effect"]) * st.edu_quality[kids]
                    * (0.6 + 0.4 * scaff))
            st.edu_years[kids] += 1.0
            st.latent[kids] += (gain[:, None] * 0.25).astype(np.float32)
            st.latent[kids] -= (float(p["childhood_adversity_effect"])
                                * st.adversity[kids] * 0.06)[:, None].astype(np.float32)
        st.g_abs[alive] = cog.g_from_profile(st.latent[alive])

        lat = self.latent_now(alive)

        # --- 3. function, support, housing ----------------------------
        st.adaptive[alive] = mdl.adaptive_functioning(st, alive, lat, p, scaff)
        st.adaptive[alive] = np.clip(
            st.adaptive[alive] - float(p["oversupport_independence_cost"])
            * np.minimum(st.over_support_years[alive], 5.0) * 0.1, 0.0, 1.0)
        need_idx, need_lvl = mdl.need_assessment(st, alive, p, self.rng("support"))
        st.need_idx[alive] = need_idx
        st.need_level[alive] = need_lvl
        mdl.assign_support(st, alive, p, self.cfg.society)
        if year % 5 == 0:
            mdl.assign_housing(st, alive, p, self.cfg.society, self.rng("housing"))

        # --- 4. work ---------------------------------------------------
        workers = alive[(st.age[alive] >= p["adult_civic_age"]) & (st.age[alive] < 70)
                        & (st.phys_cap[alive] > 0.1)]
        unassigned = workers[st.occupation[workers] < 0]
        if year % int(p["reallocation_interval"]) == 0 and year > 0:
            pool = workers
        else:
            pool = unassigned
        if pool.size:
            lat_pool = self.latent_now(pool)
            mdl.allocate_jobs(st, pool, lat_pool, p, self.cfg.society,
                              self.rng("employment"))
        retired = alive[(st.age[alive] >= 70) & (st.occupation[alive] >= 0)]
        st.occupation[retired] = -1
        mdl.job_performance(st, alive, lat, p, scaff, self.rng("employment"))

        emp = st.occupation[alive] >= 0
        output = float(np.sum(st.performance[alive][emp])) * self.tech * (1 - output_loss)
        output *= (1 - float(p["scaffolding_cost"]))
        n_research = int(np.sum(st.occupation[alive] == occ.NAMES.index("scientific_research")))
        innov_p = (float(p["innovation_base"]) * n_research
                   * (0.5 + 0.5 * float(np.mean(st.performance[alive][emp]) if emp.any() else 0)))
        innovations = int(self.rng("misc").poisson(max(innov_p, 0.0)))
        self.tech *= (1 + 0.0008 * innovations)

        # --- 5. health and mortality -----------------------------------
        mdl.update_health(st, alive, lat, p, self.rng("morbidity"), scaff,
                          mort_burden, self.med_level)
        hlit = mdl.health_literacy(st, alive, lat, p, scaff)
        hz = mdl.mortality_hazard(st, alive, p, hlit, self.med_level, mort_burden)
        died = alive[self.rng("mortality").random(alive.size) < hz]
        old = alive[st.age[alive] >= p["max_age"]]
        died = np.union1d(died, old)

        # --- 6. accumulators before removal -----------------------------
        healthy = st.health[alive] >= float(p["healthy_threshold"])
        indep = ((st.adaptive[alive] >= float(p["independence_threshold"]))
                 & (st.support_level[alive] <= 2))
        st.healthy_years[alive] += healthy
        st.independent_years[alive] += indep
        deaths_by_age = np.bincount(np.clip(st.age[alive].astype(np.int64), 0, 120),
                                    weights=np.isin(alive, died).astype(np.float64),
                                    minlength=121)
        pop_by_age = np.bincount(np.clip(st.age[alive].astype(np.int64), 0, 120),
                                 minlength=121).astype(np.float64)
        healthy_by_age = np.bincount(np.clip(st.age[alive].astype(np.int64), 0, 120),
                                     weights=healthy.astype(np.float64), minlength=121)
        indep_by_age = np.bincount(np.clip(st.age[alive].astype(np.int64), 0, 120),
                                   weights=indep.astype(np.float64), minlength=121)

        if died.size:
            preventable = ((st.unmet[died] > 0) | (st.mismatch[died] > 1.0)) & (st.age[died] < 75)
            for s in died[st.panel[died]]:
                self.rec.death({"year": year, "cid": int(st.cid[s]),
                                "age": float(st.age[s]),
                                "health": float(st.health[s]),
                                "support_level": int(st.support_level[s]),
                                "unmet": float(st.unmet[s]),
                                "healthy_years": float(st.healthy_years[s]),
                                "independent_years": float(st.independent_years[s])})
            n_preventable = int(preventable.sum())
            st.release(died)
        else:
            n_preventable = 0

        # --- 7. safeguarding -------------------------------------------
        alive = st.living()
        sg = safe.step(st, alive, p, self.rng("safeguarding"), year, self.gov.quality)
        if sg["abuse_detected"]:
            self.rec.event({"year": year, "type": "safeguarding_detection",
                            "category": "safeguarding", "count": sg["abuse_detected"],
                            "mean_delay": sg["mean_detection_delay_years"],
                            "max_delay": sg["max_detection_delay_years"]})

        # --- 8. fertility and births ------------------------------------
        births, denied = self._fertility(alive, year)

        # --- 9. assessment and government --------------------------------
        assessed = None
        if year % int(p["assessment_interval"]) == 0:
            assessed = self._assessment(year)
        gov_events = govmod.annual_governance(self.gov, st, p, self.rng("government"), year)
        for e in gov_events:
            self.rec.event({**e, "category": "government"})
        if assessed is not None:
            self._elect(year)
        # the representation guarantee holds continuously, not only on election day
        alive_now = st.living()
        classified_now = alive_now[st.classified[alive_now] & ~np.isnan(st.official_iq[alive_now])]
        for e in govmod.fill_vacancies(self.gov, st, classified_now, p,
                                       self.rng("government"), year):
            self.rec.event({**e, "category": "government"})

        # --- 10. record ---------------------------------------------------
        alive = st.living()
        self._record_year(year, alive, output, innovations, sg, births, denied,
                          n_preventable, deaths_by_age, pop_by_age, healthy_by_age,
                          indep_by_age, len(yev.active), mort_burden, output_loss)
        if st.panel.any() and self.rec.retention["citizen_panel"]:
            self._record_panel(year, alive)
        self.year += 1

    # ------------------------------------------------------------------
    def _fertility(self, alive: np.ndarray, year: int) -> tuple[int, int]:
        p, st = self.p, self.st
        g = self.rng("fertility")
        lo, hi = p["fertility_window"]
        fem = alive[(st.sex[alive] == 1) & (st.age[alive] >= lo) & (st.age[alive] <= hi)]
        if fem.size == 0:
            return 0, 0
        wants = fem[(st.children[fem] < st.desired_children[fem]) & (~st.pregnant[fem])]

        openings = st.free_slots()
        policy = p["fertility_policy"]
        if wants.size:
            if policy == "equal_voluntary":
                order = np.argsort(np.nan_to_num(st.wait_since[wants], nan=1e9))
            elif policy == "lottery":
                order = np.argsort(g.random(wants.size))
            elif policy == "waiting_list":
                order = np.argsort(np.nan_to_num(st.wait_since[wants], nan=float(year)))
            elif policy == "iq_weighted":
                order = np.argsort(-np.nan_to_num(st.official_iq[wants], nan=100.0))
            elif policy == "need_aware":
                order = np.argsort(st.need_level[wants])
            else:
                order = np.arange(wants.size)
            n_permit = int(min(openings, wants.size))
            granted = wants[order[:n_permit]]
            refused = wants[order[n_permit:]]
            st.permit[granted] = True
            new_wait = np.isnan(st.wait_since[refused])
            st.wait_since[refused[new_wait]] = year
            denied = int(refused.size)
        else:
            denied = 0
        self.births_denied += denied

        permitted = fem[st.permit[fem] & ~st.pregnant[fem]]
        conc = permitted[g.random(permitted.size) < float(p["conception_rate"])]
        st.pregnant[conc] = True

        delivering = fem[st.pregnant[fem]]
        delivering = delivering[g.random(delivering.size) < 0.85]  # gestation completion
        n_slots = st.free_slots()
        if delivering.size > n_slots:
            # never silently drop a birth: postpone and log
            keep = delivering[:n_slots]
            postponed = delivering[n_slots:]
            self.rec.event({"year": year, "type": "birth_postponed",
                            "category": "population", "count": int(postponed.size)})
            delivering = keep
        if delivering.size == 0:
            return 0, denied

        slots = st.allocate(delivering.size)
        n = slots.size
        delivering = delivering[:n]
        males = alive[(st.sex[alive] == 0) & (st.age[alive] >= lo) & (st.age[alive] <= hi + 10)]
        fathers = (males[g.integers(0, males.size, size=n)] if males.size
                   else delivering)
        pop_mean = float(np.mean(st.g_abs[alive])) if alive.size else 100.0
        endow = cog.inherit(p, g, st.g_abs[delivering], st.g_abs[fathers], pop_mean)
        st.g_endow[slots] = endow
        st.latent[slots] = cog.sample_profiles(n, endow, p, g)
        st.g_abs[slots] = cog.g_from_profile(st.latent[slots])
        st.age[slots] = 0.0
        st.birth_year[slots] = year
        st.sex[slots] = g.integers(0, 2, size=n).astype(np.int8)
        st.mother[slots] = st.cid[delivering]
        st.father[slots] = st.cid[fathers]
        scaff = float(p["scaffolding_strength"])
        st.adversity[slots] = np.clip(
            g.beta(2, 6, size=n) * (1 - 0.5 * scaff)
            + 0.3 * st.unmet[delivering] / max(int(p["support_levels"]) - 1, 1), 0, 1
        ).astype(np.float32)
        st.edu_quality[slots] = np.clip(g.uniform(0.3, 0.9, n) + 0.2 * scaff, 0, 1).astype(np.float32)
        st.occ_pref[slots] = g.choice(occ.N_OCC, size=n, p=occ.DEMAND).astype(np.int16)
        st.housing_pref[slots] = g.integers(0, 4, size=n).astype(np.int8)
        st.desired_children[slots] = np.clip(
            g.normal(p["desired_children_mean"], p["desired_children_sd"], n), 0, 8
        ).astype(np.float32)
        st.panel[slots] = g.random(n) < 0.01

        st.children[delivering] += 1
        st.pregnant[delivering] = False
        st.permit[delivering] = False
        st.wait_since[delivering] = np.nan
        mm = delivering[g.random(delivering.size) < float(p["maternal_mortality"])]
        if mm.size:
            st.release(mm)
            self.rec.event({"year": year, "type": "maternal_death",
                            "category": "health", "count": int(mm.size)})
        return int(n), denied

    # ------------------------------------------------------------------
    def _assessment(self, year: int) -> dict:
        """Civilization-wide assessment on the civilization anniversary."""
        p, st = self.p, self.st
        g = self.rng("testing")
        alive = st.living()
        adults = alive[st.age[alive] >= p["adult_civic_age"]]
        if adults.size == 0:
            return {}
        lat = self.latent_now(adults)
        obs, se = cog.observe(lat, st, adults, p, g, float(p["scaffolding_strength"]))
        iq = cog.normalise(obs, self.ref_scores, p)

        prev_iq = st.official_iq[adults].copy()
        prev_band = st.band[adults].copy()
        st.official_abs[adults] = obs
        st.official_iq[adults] = iq
        st.official_se[adults] = se
        st.sittings[adults] += 1
        st.classified[adults] = True
        st.band[adults] = cog.assign_bands(iq, p)
        self.ref_scores = obs.copy()

        changed = np.flatnonzero((prev_band >= 0) & (st.band[adults] != prev_band))
        for s in changed[st.panel[adults[changed]]]:
            self.rec.event({"year": year, "type": "classification_change",
                            "category": "cognition", "cid": int(st.cid[adults[s]]),
                            "from_band": int(prev_band[s]), "to_band": int(st.band[adults[s]]),
                            "from_iq": float(prev_iq[s]), "to_iq": float(iq[s])})

        diag = cog.distribution_diagnostics(iq, p)
        abs_diag = {"abs_mean": float(np.mean(st.g_abs[adults])),
                    "abs_sd": float(np.std(st.g_abs[adults], ddof=1)),
                    "abs_median": float(np.median(st.g_abs[adults]))}
        row = {"year": year, "n_assessed": int(adults.size), **diag, **abs_diag,
               "children_assessed": int(np.sum((st.age[alive] >= p["child_assessment_min_age"])
                                               & (st.age[alive] < p["adult_civic_age"]))),
               "normalization_method": p["normalization_method"]}
        self.rec.assessment(row)
        self.rec.snapshot({"year": year,
                           **{f"iq_p{q}": float(np.percentile(iq, q))
                              for q in (1, 5, 25, 50, 75, 95, 99)},
                           **{f"abs_p{q}": float(np.percentile(st.g_abs[adults], q))
                              for q in (1, 5, 25, 50, 75, 95, 99)}})
        return row

    def _elect(self, year: int) -> None:
        p, st = self.p, self.st
        g = self.rng("government")
        alive = st.living()
        classified = alive[st.classified[alive] & ~np.isnan(st.official_iq[alive])]
        if classified.size == 0:
            return
        pres, log = govmod.select_president(st, classified, p, g, year)
        self.gov.president = pres
        self.presidents.append(log)
        self.rec.event({**log, "type": "presidential_selection", "category": "government"})
        self.gov.representatives = govmod.elect_assembly(st, classified, p, g, year)
        bands = st.band[classified]
        counts = np.bincount(bands[bands >= 0], minlength=len(p["iq_bands"]))
        seats = np.bincount([r.band for r in self.gov.representatives],
                            minlength=len(p["iq_bands"]))
        self.rec.event({"year": year, "type": "assembly_elected", "category": "government",
                        "populated_bands": int((counts > 0).sum()),
                        "bands_with_seats": int((seats > 0).sum()),
                        "seats": int(seats.sum())})

    # ------------------------------------------------------------------
    @staticmethod
    def _life_table(deaths_by_age, pop_by_age, weights=None) -> float:
        mx = np.divide(deaths_by_age, np.maximum(pop_by_age, 1e-9))
        mx = np.clip(mx, 0, 1)
        qx = np.clip(mx, 0, 1)
        lx = np.concatenate([[1.0], np.cumprod(1 - qx)[:-1]])
        Lx = lx * (1 - 0.5 * qx)
        if weights is not None:
            Lx = Lx * weights
        return float(Lx.sum())

    def _record_year(self, year, alive, output, innovations, sg, births, denied,
                     preventable, deaths_by_age, pop_by_age, healthy_by_age,
                     indep_by_age, n_events, mort_burden, output_loss) -> None:
        p, st = self.p, self.st
        n = alive.size
        if n == 0:
            self.rec.year({"year": year, "population": 0, "collapsed": 1})
            return
        w_health = np.divide(healthy_by_age, np.maximum(pop_by_age, 1e-9))
        w_indep = np.divide(indep_by_age, np.maximum(pop_by_age, 1e-9))
        le = self._life_table(deaths_by_age, pop_by_age)
        hale = self._life_table(deaths_by_age, pop_by_age, w_health)
        ile = self._life_table(deaths_by_age, pop_by_age, w_indep)

        iq = st.official_iq[alive]
        iq = iq[~np.isnan(iq)]
        emp = st.occupation[alive] >= 0
        adults = st.age[alive] >= p["adult_civic_age"]
        gini = self._gini(st.performance[alive][emp]) if emp.any() else 0.0
        bands = st.band[alive]
        band_counts = np.bincount(bands[bands >= 0], minlength=len(p["iq_bands"]))
        seats = np.bincount([r.band for r in self.gov.representatives],
                            minlength=len(p["iq_bands"]))

        row = {
            "year": year,
            "population": int(n),
            "births": int(births),
            "deaths": int(deaths_by_age.sum()),
            "births_denied": int(denied),
            "mean_age": float(np.mean(st.age[alive])),
            "life_expectancy": le,
            "healthy_life_expectancy": hale,
            "independent_life_expectancy": ile,
            "preventable_deaths": int(preventable),
            "mean_health": float(np.mean(st.health[alive])),
            "mean_adaptive": float(np.mean(st.adaptive[alive])),
            "frac_independent": float(np.mean((st.adaptive[alive] >= p["independence_threshold"])
                                              & (st.support_level[alive] <= 2))),
            "abs_capability_mean": float(np.mean(st.g_abs[alive][adults])) if adults.any() else float("nan"),
            "abs_capability_sd": float(np.std(st.g_abs[alive][adults], ddof=1)) if adults.sum() > 1 else 0.0,
            "iq_mean": float(np.mean(iq)) if iq.size else float("nan"),
            "iq_sd": float(np.std(iq, ddof=1)) if iq.size > 1 else 0.0,
            "iq_ceiling_frac": float(np.mean(iq >= p["iq_report_ceiling"] - 1e-6)) if iq.size else 0.0,
            "employment_rate": float(np.mean(emp[adults])) if adults.any() else 0.0,
            "mean_performance": float(np.mean(st.performance[alive][emp])) if emp.any() else 0.0,
            "mean_mismatch": float(np.mean(st.mismatch[alive][emp])) if emp.any() else 0.0,
            "mismatch_rate": float(np.mean(st.mismatch[alive][emp] > 1.0)) if emp.any() else 0.0,
            "output": float(output),
            "output_per_capita": float(output / n),
            "innovations": int(innovations),
            "tech_level": float(self.tech),
            "mean_support_level": float(np.mean(st.support_level[alive])),
            "unmet_need_rate": float(np.mean(st.unmet[alive] > 0)),
            "over_support_rate": float(np.mean(st.over_support_years[alive] > 0)),
            "support_high_iq_frac": float(
                np.mean(st.support_level[alive][(iq.size > 0) & (st.official_iq[alive] >= 120)] > 0)
            ) if np.any(st.official_iq[alive] >= 120) else 0.0,
            "independent_low_iq_frac": float(
                np.mean(st.support_level[alive][st.official_iq[alive] < 85] == 0)
            ) if np.any(st.official_iq[alive] < 85) else 0.0,
            "mean_housing_restrictiveness": float(np.mean(st.housing[alive])),
            "performance_gini": gini,
            "gov_quality": float(self.gov.quality),
            "president_iq": (float(st.official_iq[self.gov.president.slot])
                             if self.gov.president is not None
                             and govmod.holds_office(st, self.gov.president)
                             else float("nan")),
            "president_cid": (self.gov.president.cid
                              if self.gov.president is not None else -1),
            "assembly_seats": int(seats.sum()),
            "populated_bands": int((band_counts > 0).sum()),
            "bands_represented": int(((band_counts > 0) & (seats > 0)).sum()),
            "unrepresented_populated_bands": int(((band_counts > 0) & (seats == 0)).sum()),
            "orphan_seat_bands": int(((band_counts == 0) & (seats > 0)).sum()),
            "corrupt_officials": int(sum(o.corrupt for o in self.gov.officials())),
            "offences": int(st.offence_count[alive].sum()),
            "shock_events": int(n_events),
            "mortality_burden": float(mort_burden),
            "output_loss": float(output_loss),
            "med_level": float(self.med_level),
            **sg,
            "collapsed": int(n < 0.1 * self.cfg.capacity),
        }
        self.rec.year(row)

    def _record_panel(self, year: int, alive: np.ndarray) -> None:
        st = self.st
        sel = alive[st.panel[alive]]
        if sel.size == 0:
            return
        rows = [{
            "year": year, "cid": int(st.cid[s]), "age": float(st.age[s]),
            "official_iq": float(st.official_iq[s]), "official_se": float(st.official_se[s]),
            "abs_capability": float(st.g_abs[s]), "band": int(st.band[s]),
            "health": float(st.health[s]), "adaptive": float(st.adaptive[s]),
            "need_level": int(st.need_level[s]), "support_level": int(st.support_level[s]),
            "housing": int(st.housing[s]), "occupation": int(st.occupation[s]),
            "performance": float(st.performance[s]), "mismatch": float(st.mismatch[s]),
            "abuse_state": int(st.abuse_state[s]),
        } for s in sel]
        self.rec.panel_rows(rows)

    @staticmethod
    def _gini(x: np.ndarray) -> float:
        if x.size == 0:
            return 0.0
        xs = np.sort(np.maximum(x, 0))
        n = xs.size
        s = xs.sum()
        if s <= 0:
            return 0.0
        return float((2 * np.sum((np.arange(1, n + 1)) * xs) / (n * s)) - (n + 1) / n)

    # ------------------------------------------------------------------
    def checkpoint(self) -> dict:
        """Full resumable state. A restored simulation must produce a
        byte-identical future trajectory (tested in test_invariants.py)."""
        import copy
        return {"year": self.year, "state": self.st.snapshot(),
                "rng": self.rng.get_state(), "med_level": self.med_level,
                "tech": self.tech, "ref_scores": None if self.ref_scores is None
                else self.ref_scores.copy(), "gov": copy.deepcopy(self.gov),
                "births_denied": self.births_denied,
                "presidents": copy.deepcopy(self.presidents),
                "model_version": MODEL_VERSION,
                "parameter_set_id": self.p.fingerprint()}

    def restore(self, ck: dict) -> None:
        import copy
        if ck.get("parameter_set_id") != self.p.fingerprint():
            raise ValueError("checkpoint parameter set does not match this run")
        self.year = ck["year"]
        self.st.restore(ck["state"])
        self.rng.set_state(ck["rng"])
        self.med_level = ck["med_level"]
        self.tech = ck["tech"]
        self.ref_scores = ck["ref_scores"]
        self.gov = copy.deepcopy(ck["gov"])
        self.births_denied = ck["births_denied"]
        self.presidents = copy.deepcopy(ck["presidents"])

    # ------------------------------------------------------------------
    def finalize(self) -> RunResult:
        cfg = self.cfg
        manifest = {
            "experiment_id": cfg.experiment_id,
            "society": cfg.society,
            "run_number": cfg.run_number,
            "seed": cfg.seed,
            "model_version": MODEL_VERSION,
            "git_commit": git_commit(),
            "parameter_set_id": self.p.fingerprint(),
            "years": cfg.years,
            "capacity": cfg.capacity,
            "logging_level": cfg.logging_level,
            "run_tag": cfg.tag,
            "status": "completed",
            "normalization_method": self.p["normalization_method"],
            "fertility_policy": self.p["fertility_policy"],
            "births_denied_total": self.births_denied,
            # execution environment, recorded per run so a batch assembled on
            # heterogeneous machines can be audited after the fact
            "python_version": platform.python_version(),
            "numpy_version": np.__version__,
            "platform": platform.platform(),
            "machine": platform.machine(),
            "started_utc": self.started_utc,
            "completed_utc": datetime.now(timezone.utc).isoformat(),
            "wall_seconds": round(time.perf_counter() - self._t0, 3),
            "worker_pid": os.getpid(),
        }
        manifest = self.rec.finalize(manifest)
        last = self.rec.annual[-1] if self.rec.annual else {}
        summary = {
            "final_population": last.get("population"),
            "final_life_expectancy": last.get("life_expectancy"),
            "final_hale": last.get("healthy_life_expectancy"),
            "final_independent_le": last.get("independent_life_expectancy"),
            "mean_hale": float(np.mean([r.get("healthy_life_expectancy", np.nan)
                                        for r in self.rec.annual])),
            "mean_mismatch": float(np.mean([r.get("mean_mismatch", np.nan)
                                            for r in self.rec.annual])),
            "collapse": int(any(r.get("collapsed") for r in self.rec.annual)),
            "max_abuse_delay": max((e.get("max_delay", 0) for e in self.rec.events
                                    if e.get("type") == "safeguarding_detection"), default=0.0),
        }
        return RunResult(cfg.experiment_id, manifest, self.rec.annual,
                         self.rec.assessments, self.rec.events, summary)


def run_one(cfg: RunConfig) -> RunResult:
    return Simulation(cfg).run()
