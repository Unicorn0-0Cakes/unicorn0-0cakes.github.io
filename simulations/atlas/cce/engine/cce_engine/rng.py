"""Deterministic random-number stream management.

Design rules (see docs/REPRODUCIBILITY.md):

1. Every stochastic process draws from a *named* stream. Streams are never shared.
2. Streams whose name appears in ``SHARED_STREAMS`` are seeded from the run seed
   ONLY. They therefore produce identical draws in Society A, B and C for the
   same run seed. This is what makes matched-seed comparison valid: the baseline
   population and the external shock history are identical across arms.
3. All other streams are seeded from (run_seed, society_code, stream_name) and
   are allowed to diverge between arms.
4. Shared streams must consume a *fixed number of draws per simulated year*,
   independent of simulation state. ``ShockStream.year_block`` enforces this.

Implementation uses numpy SeedSequence entropy pools; the mapping from
(seed, society, stream) to a Generator is pure and version-stamped so that a run
can be replayed byte-identically from its manifest.
"""

from __future__ import annotations

import numpy as np

# Bump when the stream layout changes in a way that breaks replay of old runs.
RNG_LAYOUT_VERSION = 1

SHARED_STREAMS = (
    "population_init",  # baseline population generation
    "shocks",  # environmental / historical event stream
)

SOCIETY_STREAMS = (
    "mortality",
    "morbidity",
    "cognition_noise",
    "testing",
    "fertility",
    "employment",
    "housing",
    "support",
    "safeguarding",
    "government",
    "misc",
)

_SOCIETY_CODE = {"A": 1, "B": 2, "C": 3}


def _stream_index(name: str) -> int:
    if name in SHARED_STREAMS:
        return SHARED_STREAMS.index(name)
    return len(SHARED_STREAMS) + SOCIETY_STREAMS.index(name)


class RunRNG:
    """Container of named Generators for one simulation run."""

    def __init__(self, run_seed: int, society: str):
        if society not in _SOCIETY_CODE:
            raise ValueError(f"unknown society {society!r}")
        self.run_seed = int(run_seed)
        self.society = society
        self._gens: dict[str, np.random.Generator] = {}

    def _make(self, name: str) -> np.random.Generator:
        idx = _stream_index(name)
        if name in SHARED_STREAMS:
            entropy = (self.run_seed, 0, idx, RNG_LAYOUT_VERSION)
        elif name in SOCIETY_STREAMS:
            entropy = (self.run_seed, _SOCIETY_CODE[self.society], idx, RNG_LAYOUT_VERSION)
        else:
            raise KeyError(f"undeclared RNG stream {name!r}")
        return np.random.Generator(np.random.PCG64(np.random.SeedSequence(entropy)))

    def __call__(self, name: str) -> np.random.Generator:
        g = self._gens.get(name)
        if g is None:
            g = self._make(name)
            self._gens[name] = g
        return g

    # -- state capture for checkpoint / resume -----------------------------
    def get_state(self) -> dict:
        return {
            "run_seed": self.run_seed,
            "society": self.society,
            "layout_version": RNG_LAYOUT_VERSION,
            "streams": {k: g.bit_generator.state for k, g in self._gens.items()},
        }

    def set_state(self, state: dict) -> None:
        if state["layout_version"] != RNG_LAYOUT_VERSION:
            raise ValueError("checkpoint RNG layout version mismatch")
        self.run_seed = state["run_seed"]
        self.society = state["society"]
        self._gens = {}
        for name, bg_state in state["streams"].items():
            g = self._make(name)
            g.bit_generator.state = bg_state
            self._gens[name] = g


# Number of uniform variates drawn from the shock stream every simulated year.
# FIXED BY CONTRACT. Adding a new shock type means appending to the block and
# bumping RNG_LAYOUT_VERSION -- never inserting in the middle.
SHOCK_BLOCK_SIZE = 24


def shock_block(rng: RunRNG, year: int) -> np.ndarray:
    """Draw the year's fixed-size shock block.

    Called exactly once per simulated year, before any society-specific logic,
    so that arms sharing a run seed observe an identical external history.
    """
    return rng("shocks").random(SHOCK_BLOCK_SIZE)
