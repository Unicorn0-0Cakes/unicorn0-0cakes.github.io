"""Environmental and historical event system.

The year's events are decoded from a fixed-size block of uniforms drawn from the
shared `shocks` stream (see rng.py). Because the block size and decode order are
fixed by contract and the stream is seeded from the run seed alone, Societies A,
B and C running the same seed experience an identical external history. Any
outcome difference between arms is therefore attributable to their allocation
rules and to the internal stochastic streams, not to different disasters.

Societies differ only in how well they *absorb* a shock, via preparedness
(governance quality, support coverage, occupational fit in emergency-relevant
sectors) -- never in the shock itself.
"""

from __future__ import annotations

from dataclasses import dataclass

# fixed decode positions in the 24-slot shock block; append only
SLOTS = {
    "disaster": (0, 1), "epidemic": (2, 3), "pandemic": (4, 5),
    "crop_failure": (6, 7), "infrastructure_failure": (8, 9),
    "economic_contraction": (10, 11), "breakthrough": (12, 13),
    "resource_discovery": (14, 15), "migration_pressure": (16, 17),
    "industrial_accident": (18, 19), "external_scandal": (20, 21),
    "_reserved": (22, 23),
}

_RATE_PARAM = {
    "disaster": "disaster_rate", "epidemic": "epidemic_rate",
    "pandemic": "pandemic_rate", "crop_failure": "crop_failure_rate",
    "infrastructure_failure": "infrastructure_failure_rate",
    "economic_contraction": "economic_contraction_rate",
    "breakthrough": "breakthrough_rate", "resource_discovery": "breakthrough_rate",
    "migration_pressure": "disaster_rate", "industrial_accident": "injury_rate_base",
    "external_scandal": "corruption_base",
}

# how much each event type contributes to mortality/health burden and to output
_BURDEN = {
    "disaster": (0.020, 0.10), "epidemic": (0.015, 0.04),
    "pandemic": (0.090, 0.18), "crop_failure": (0.008, 0.12),
    "infrastructure_failure": (0.004, 0.09), "economic_contraction": (0.002, 0.15),
    "industrial_accident": (0.003, 0.03), "migration_pressure": (0.001, 0.02),
    "external_scandal": (0.0, 0.01), "breakthrough": (0.0, -0.05),
    "resource_discovery": (0.0, -0.04),
}


@dataclass
class YearEvents:
    active: list[dict]
    mortality_burden: float
    output_loss: float
    innovation_boost: float
    climate: float


def decode(block, p, year: int) -> YearEvents:
    active, mort, loss, innov = [], 0.0, 0.0, 0.0
    for name, (i_trig, i_sev) in SLOTS.items():
        if name == "_reserved":
            continue
        rate = float(p[_RATE_PARAM[name]])
        if block[i_trig] < rate:
            sev = float(block[i_sev]) ** 1.5 * (2.0 * float(p["shock_severity_mean"]))
            sev = min(sev, 1.0)
            active.append({"year": year, "type": name, "severity": round(sev, 4)})
            m, o = _BURDEN[name]
            mort += m * sev
            loss += o * sev
            if name in ("breakthrough", "resource_discovery"):
                innov += 0.5 * sev
    climate = float(p["climate_drift"]) * year
    return YearEvents(active=active, mortality_burden=min(mort, 0.5),
                      output_loss=loss + climate, innovation_boost=innov,
                      climate=climate)


def absorbed(ev: YearEvents, preparedness: float) -> tuple[float, float]:
    """Preparedness in [0,1] reduces, but never eliminates, the impact."""
    k = 1.0 - 0.55 * preparedness
    return ev.mortality_burden * k, ev.output_loss * k
