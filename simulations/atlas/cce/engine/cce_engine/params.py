"""Parameter registry.

Single source of truth for every tunable quantity in the model. Each entry
carries the metadata required by docs/PARAMETER_REGISTER.md:

    default        value used in the preregistered baseline
    units          unit of measurement
    range          plausible range for sensitivity analysis
    source         "not yet calibrated" | "stylised" | free text
    scope          "common" (identical in A/B/C) | "society" (arm-specific)
    sensitivity    "high" | "medium" | "low" -- screening priority
    note           definition

CALIBRATION STATUS: every parameter below is marked `not yet calibrated`.
None of these values were fitted to empirical data. They are internally
consistent stylised defaults chosen so the model produces plausible
demographic behaviour; they must not be read as empirical estimates.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from typing import Any

# ---------------------------------------------------------------------------
# registry: name -> metadata dict
# ---------------------------------------------------------------------------

P: dict[str, dict[str, Any]] = {}


def _p(name, default, units, rng, note, scope="common", sensitivity="medium",
       source="not yet calibrated"):
    P[name] = dict(default=default, units=units, range=rng, note=note,
                   scope=scope, sensitivity=sensitivity, source=source,
                   code_location="engine/cce_engine/params.py")
    return name


# --- run structure ---------------------------------------------------------
_p("population_cap", 100_000, "citizens", [1_000, 100_000],
   "Hard invariant: living population may never exceed this.", sensitivity="high")
_p("years", 500, "years", [1, 1000], "Simulated duration.")
_p("assessment_interval", 5, "years", [1, 10],
   "Civilization-wide assessment cadence, on the civilization anniversary.", sensitivity="high")
_p("adult_civic_age", 20, "years", [16, 25],
   "Age at which a citizen receives an official civic classification.", sensitivity="high")
_p("child_assessment_min_age", 6, "years", [3, 12],
   "Youngest age at which developmental assessment is recorded (not civic).")

# --- cognition -------------------------------------------------------------
_p("g_loading", [0.80, 0.75, 0.70, 0.65, 0.70, 0.72, 0.45, 0.35, 0.55, 0.30, 0.40],
   "correlation", [0.0, 0.95],
   "Loading of each cognitive dimension on the general factor g. Order matches "
   "cognition.DIMS. Low loadings for practical judgment / social understanding / "
   "emotional regulation encode the assumption that these are only weakly "
   "predicted by g.", sensitivity="high")
_p("abs_scale_mean", 100.0, "points", [80, 120], "Year-0 absolute capability scale mean.")
_p("abs_scale_sd", 15.0, "points", [10, 20], "Year-0 absolute capability scale SD.")
_p("test_reliability", 0.92, "reliability coefficient", [0.75, 0.98],
   "Test-retest reliability of the official assessment. Observed = latent + error "
   "with SD = abs_scale_sd * sqrt(1 - reliability).", sensitivity="high")
_p("practice_effect", 1.2, "points per prior sitting", [0.0, 4.0],
   "Score inflation per previous official sitting, saturating at practice_max.")
_p("practice_max", 4.0, "points", [0.0, 10.0], "Ceiling on cumulative practice effect.")
_p("state_effect_health", 12.0, "points per unit ill-health", [0.0, 25.0],
   "Reduction in observed score at maximal acute ill-health.", sensitivity="high")
_p("state_effect_stress", 5.0, "points per unit stress", [0.0, 15.0],
   "Reduction in observed score at maximal stress.")
_p("sensory_penalty", 6.0, "points", [0.0, 20.0],
   "Observed-score penalty for uncorrected sensory impairment. A measurement "
   "artefact, not a capability difference.", sensitivity="high")
_p("iq_report_ceiling", 150.0, "IQ points", [130, 200],
   "Maximum reportable official score. Latent capability is retained separately.",
   sensitivity="low")
_p("iq_report_floor", 40.0, "IQ points", [20, 60], "Minimum reportable official score.")
_p("normalization_method", "mean_sd", "categorical",
   ["mean_sd", "median_mad", "trimmed"],
   "Primary normalisation for relative civic IQ. DECLARED BEFORE PRODUCTION RUNS.",
   sensitivity="high")
_p("fluid_peak_age", 25.0, "years", [18, 35], "Age of peak fluid/speed capability.")
_p("fluid_decline_rate", 0.22, "points per year after peak", [0.0, 0.6],
   "Normal-ageing decline in fluid reasoning and processing speed.", sensitivity="high")
_p("crystallised_growth", 0.10, "points per year of experience", [0.0, 0.4],
   "Growth in verbal/learned expertise with experience, saturating.")
_p("education_effect", 1.5, "points per effective school year", [0.0, 4.0],
   "Effect of schooling on latent capability during development.", sensitivity="high")
_p("childhood_adversity_effect", 9.0, "points", [0.0, 20.0],
   "Latent capability cost of maximal childhood adversity (nutrition, toxins, "
   "stress, illness).", sensitivity="high")

# --- inheritance -----------------------------------------------------------
_p("heritability_latent", 0.50, "proportion of variance", [0.0, 0.8],
   "Share of child's expected latent endowment attributable to a polygenic "
   "mid-parent term. NOT a claim about real-world heritability; a model knob "
   "whose influence is measured by sensitivity analysis.", sensitivity="high")
_p("shared_environment_share", 0.20, "proportion of variance", [0.0, 0.5],
   "Share attributable to modelled family/environment inputs.", sensitivity="high")
_p("regression_to_mean", 1.0, "multiplier", [0.5, 1.0],
   "Strength of regression of mid-parent value toward the contemporaneous mean.")

# --- demography ------------------------------------------------------------
_p("gompertz_a", 2.6e-5, "annual hazard", [1e-5, 1e-4],
   "Gompertz baseline hazard at age 0 of the adult component.", sensitivity="high")
_p("gompertz_b", 0.085, "per year", [0.06, 0.12],
   "Gompertz rate of hazard increase with age.", sensitivity="high")
_p("makeham_c", 0.0009, "annual hazard", [0.0002, 0.003],
   "Age-independent background mortality.", sensitivity="high")
_p("infant_mortality", 0.0045, "annual probability", [0.001, 0.05],
   "First-year death probability before health-system modifiers.", sensitivity="high")
_p("child_mortality", 0.0004, "annual probability", [0.0001, 0.005],
   "Ages 1-14 baseline death probability.")
_p("max_age", 115, "years", [100, 130], "Hard age ceiling.")
_p("fertility_window", [18, 44], "years", [[15, 50], [15, 50]],
   "Ages at which a citizen may hold a birth permit.")
_p("desired_children_mean", 2.1, "children", [0.5, 4.0],
   "Mean desired completed family size.", sensitivity="high")
_p("desired_children_sd", 1.0, "children", [0.2, 2.0], "Dispersion of desired family size.")
_p("conception_rate", 0.32, "annual probability", [0.05, 0.9],
   "Annual probability that a permitted, willing, fertile citizen conceives.")
_p("fertility_policy", "equal_voluntary", "categorical",
   ["equal_voluntary", "lottery", "waiting_list", "iq_weighted", "need_aware",
    "society_allotment"],
   "Reproductive-policy module. Held IDENTICAL across A/B/C in the primary "
   "comparison; iq_weighted belongs to a separate preregistered phase.",
   sensitivity="high")
_p("maternal_mortality", 0.00012, "per birth", [0.0, 0.005], "Maternal death risk per birth.")

# --- health ----------------------------------------------------------------
_p("chronic_onset_base", 0.006, "annual probability", [0.001, 0.03],
   "Baseline annual chronic-condition onset hazard at age 30.", sensitivity="high")
_p("chronic_age_slope", 0.055, "per year", [0.02, 0.09],
   "Exponential increase in chronic onset with age.")
_p("dementia_base", 0.0016, "annual probability at 65", [0.0005, 0.01],
   "Dementia incidence at age 65, doubling every dementia_doubling years.",
   sensitivity="high")
_p("dementia_doubling", 5.5, "years", [4.0, 8.0], "Age doubling time of dementia incidence.")
_p("injury_rate_base", 0.010, "annual probability", [0.002, 0.05],
   "Baseline injury hazard before occupational and support modifiers.")
_p("mental_health_incidence", 0.011, "annual probability", [0.003, 0.04],
   "Annual onset hazard of a significant mental-health condition.")
_p("health_literacy_gradient", 0.22, "hazard multiplier per SD", [0.0, 0.5],
   "Mortality hazard reduction per +1 SD in the health-literacy pathway. This is "
   "the ONLY route by which cognition touches mortality directly; accessible "
   "systems can close it (see accessibility_closes_gradient).", sensitivity="high")
_p("accessibility_closes_gradient", 0.85, "proportion", [0.0, 1.0],
   "Fraction of the health-literacy gradient removed at full cognitive "
   "accessibility of the health system.", sensitivity="high")
_p("support_mortality_benefit", 0.28, "hazard multiplier", [0.0, 0.6],
   "Proportional hazard reduction when assigned support matches assessed need.",
   sensitivity="high")
_p("undersupport_mortality_penalty", 0.35, "hazard multiplier", [0.0, 1.0],
   "Proportional hazard increase under severe unmet support need.", sensitivity="high")
_p("oversupport_independence_cost", 0.06, "adaptive points per year", [0.0, 0.2],
   "Loss of adaptive functioning per year of unnecessary supervision. Encodes "
   "that more supervision is not automatically better.", sensitivity="high")
_p("medical_innovation_rate", 0.0011, "annual hazard reduction", [0.0, 0.005],
   "Compounding mortality improvement from accumulated medical knowledge.")
_p("healthy_threshold", 0.55, "index 0-1", [0.3, 0.8],
   "Health index above which a person-year counts as healthy (HALE).")
_p("independence_threshold", 0.50, "index 0-1", [0.3, 0.8],
   "Adaptive-functioning index above which a person-year counts as functionally "
   "independent.")

# --- support ---------------------------------------------------------------
_p("support_levels", 9, "count", [3, 12],
   "Number of ordered support levels, 0 = independent .. 8 = secure protective care.",
   sensitivity="low")
_p("support_assessment_error", 0.12, "SD of need index", [0.0, 0.4],
   "Noise in the needs assessment; drives over- and under-support.", sensitivity="high")
_p("support_capacity_per_capita", 0.95, "relative to assessed need", [0.4, 1.5],
   "Resource ceiling on total assigned support.", sensitivity="high")
_p("scaffolding_strength", {"A": 0.35, "B": 0.90, "C": 0.65}, "proportion", [0.0, 1.0],
   "Society-level reduction of unnecessary cognitive burden in civic, medical, "
   "financial and transport systems. THE PRIMARY B-vs-A/C treatment lever.",
   scope="society", sensitivity="high")
_p("scaffolding_cost", {"A": 0.03, "B": 0.11, "C": 0.07}, "share of output", [0.0, 0.3],
   "Recurrent cost of accessibility infrastructure.", scope="society", sensitivity="high")

# --- employment ------------------------------------------------------------
_p("allocation_rule", {"A": "iq_rank", "B": "preference_qualification", "C": "competency_fit"},
   "categorical", ["iq_rank", "preference_qualification", "competency_fit"],
   "Occupational allocation rule.", scope="society", sensitivity="high")
_p("reallocation_interval", 5, "years", [1, 10],
   "Years between civilization-wide occupational reallocation reviews.")
_p("training_rate", 0.06, "skill points per year", [0.01, 0.2],
   "Learned-expertise accumulation while employed in a matched role.")
_p("experience_performance_weight", 0.30, "weight", [0.0, 0.6],
   "Weight of accumulated experience in job performance relative to ability fit.",
   sensitivity="high")
_p("burnout_rate", 0.02, "annual probability per unit strain", [0.0, 0.1],
   "Burnout hazard when role demands exceed capability plus support.")
_p("mismatch_error_multiplier", 1.8, "multiplier", [1.0, 4.0],
   "Increase in adverse occupational events per unit of role mismatch.",
   sensitivity="high")
_p("innovation_base", 0.004, "annual probability per research worker", [0.0, 0.02],
   "Baseline innovation hazard, scaled by research-role fit and education.")

# --- housing ---------------------------------------------------------------
_p("housing_preference_weight", {"A": 0.15, "B": 0.65, "C": 0.40}, "weight", [0.0, 1.0],
   "Weight of stated preference against administrative assignment in housing.",
   scope="society", sensitivity="medium")
_p("housing_capacity_slack", 0.05, "proportion", [0.0, 0.3],
   "Spare housing stock; scarcity forces suboptimal placement.")

# --- government ------------------------------------------------------------
_p("iq_bands", [[-1e9, 70], [70, 80], [80, 90], [90, 100], [100, 110], [110, 120],
                [120, 130], [130, 140], [140, 150], [150, 1e9]],
   "IQ points", "configurable",
   "Reporting bands for guaranteed representation. Configurable, not hard-coded.",
   sensitivity="medium")
_p("seats_base", 1, "seats per populated band", [1, 5],
   "Guaranteed seats for every populated band, however small.", sensitivity="high")
_p("seats_proportional", 90, "additional seats", [0, 300],
   "Additional seats allocated proportionally to band population.")
_p("leader_competence_iq_link", 0.20, "correlation", [0.0, 0.6],
   "Correlation between g and *systems-planning* competence. Deliberately modest: "
   "the model must not assume high-IQ leadership is good leadership.",
   sensitivity="high")
_p("leader_ethics_iq_link", 0.0, "correlation", [-0.3, 0.3],
   "Correlation between g and leadership ethics. Default zero (assumption).",
   sensitivity="high")
_p("corruption_base", 0.03, "annual probability per official", [0.0, 0.2],
   "Baseline hazard that an official engages in capture or corruption.",
   sensitivity="high")
_p("audit_effectiveness", 0.70, "detection probability", [0.2, 0.99],
   "Probability that an anti-corruption audit detects an active corruption episode.")
_p("policy_effect_strength", 0.25, "multiplier", [0.0, 0.6],
   "Maximum proportional effect of governance quality on health, support and "
   "safeguarding budgets.", sensitivity="high")

# --- safeguarding ----------------------------------------------------------
_p("welfare_check_interval", 1.0, "years", [0.083, 1.0],
   "Maximum interval between mandatory in-person welfare checks.", sensitivity="high")
_p("abuse_attempt_rate", 0.0016, "annual probability per vulnerable citizen", [0.0, 0.02],
   "Hazard that a severe-abuse situation is initiated. NOT set to zero.",
   sensitivity="high")
_p("safeguard_detection_effectiveness", 0.97, "probability per check", [0.90, 1.0],
   "Per-check probability of detecting an active severe-abuse situation.",
   sensitivity="high")
_p("max_undetected_duration", 1.0, "years", [0.083, 1.0],
   "Hard cap on how long a severe-abuse situation may persist undetected under "
   "the default safeguarding regime.", sensitivity="high")
_p("false_positive_rate", 0.012, "per check", [0.0, 0.1],
   "Rate of incorrect safeguarding findings; drives administrative cost and harm.")
_p("inspector_corruption_rate", 0.004, "annual probability", [0.0, 0.05],
   "Hazard that an inspector is compromised; mitigated by rotation.")
_p("intervention_success", 0.88, "probability", [0.5, 1.0],
   "Probability that intervention after detection ends the situation within a year.")

# --- environment / shocks --------------------------------------------------
_p("disaster_rate", 0.05, "annual probability", [0.0, 0.3], "Major natural disaster.")
_p("epidemic_rate", 0.030, "annual probability", [0.0, 0.2], "Epidemic onset.")
_p("pandemic_rate", 0.004, "annual probability", [0.0, 0.05], "Severe pandemic onset.")
_p("crop_failure_rate", 0.045, "annual probability", [0.0, 0.3], "Agricultural failure.")
_p("infrastructure_failure_rate", 0.035, "annual probability", [0.0, 0.3],
   "Major infrastructure or information-system failure.")
_p("economic_contraction_rate", 0.07, "annual probability", [0.0, 0.3], "Economic contraction.")
_p("breakthrough_rate", 0.025, "annual probability", [0.0, 0.2],
   "Exogenous technological breakthrough.")
_p("shock_severity_mean", 0.35, "index 0-1", [0.05, 0.9], "Mean shock severity.")
_p("climate_drift", 0.0007, "index per year", [0.0, 0.005],
   "Slow degradation of environmental carrying capacity.")

# --- logging ---------------------------------------------------------------
_p("logging_level", "standard", "categorical", ["minimal", "standard", "forensic"],
   "Standard = annual aggregates + 5-year snapshots + all rare events + panel.",
   sensitivity="low")
_p("panel_size", 1000, "citizens", [0, 10000],
   "Reproducible individual-citizen panel retained at full resolution.",
   sensitivity="low")
_p("checkpoint_interval", 50, "years", [0, 500], "Years between full checkpoints.",
   sensitivity="low")

DEFAULTS = {k: copy.deepcopy(v["default"]) for k, v in P.items()}


@dataclass
class Params:
    """Resolved parameter set for one run."""

    society: str = "A"
    values: dict = field(default_factory=lambda: copy.deepcopy(DEFAULTS))

    def __getitem__(self, key: str):
        v = self.values[key]
        if isinstance(v, dict) and set(v) == {"A", "B", "C"}:
            return v[self.society]
        return v

    def raw(self, key: str):
        return self.values[key]

    def override(self, **kw) -> "Params":
        vals = copy.deepcopy(self.values)
        for k, v in kw.items():
            if k not in vals:
                raise KeyError(f"unregistered parameter {k!r}")
            vals[k] = v
        return Params(society=self.society, values=vals)

    def fingerprint(self) -> str:
        import hashlib

        blob = json.dumps(self.values, sort_keys=True, default=str).encode()
        return hashlib.sha256(blob).hexdigest()[:16]


def registry_as_records() -> list[dict]:
    return [dict(name=k, **v) for k, v in P.items()]
