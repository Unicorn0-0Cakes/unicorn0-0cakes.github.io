"""The Cognitive Civilization Experiment -- reference simulation engine.

This is a fictional, fully simulated research environment. It involves no real
human subjects and implements no real-world policy. Findings produced by it are
reproducible results conditional on the model's assumptions and parameter
ranges -- never statements about real populations.
"""

from .kernel import MODEL_VERSION, RunConfig, RunResult, Simulation, run_one
from .params import DEFAULTS, P, Params

__all__ = ["Simulation", "RunConfig", "RunResult", "run_one", "Params", "P",
           "DEFAULTS", "MODEL_VERSION"]
