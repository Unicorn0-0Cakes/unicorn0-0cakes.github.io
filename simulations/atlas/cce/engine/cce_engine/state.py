"""Agent state: structure-of-arrays with slot reuse.

Memory layout is columnar and preallocated at ``capacity`` = population_cap.
A citizen occupies a slot for life; on death the slot is returned to a free
stack and may be reused by a newborn. The living population can therefore never
exceed capacity -- the population invariant is structural, not policed after the
fact. Nothing is ever silently deleted: a dead citizen's summary row is emitted
to the recorder before the slot is released.
"""

from __future__ import annotations

import numpy as np

from .cognition import DIMS

N_DIMS = len(DIMS)

# name -> (dtype, fill)
FIELDS: dict[str, tuple] = {
    "cid": (np.int64, -1),          # globally unique citizen id
    "alive": (np.bool_, False),
    "age": (np.float32, 0.0),
    "birth_year": (np.int32, -1),
    "sex": (np.int8, 0),
    "mother": (np.int64, -1),
    "father": (np.int64, -1),
    # cognition -------------------------------------------------------------
    "g_abs": (np.float32, 100.0),        # absolute capability, Year-0 scale
    "g_endow": (np.float32, 100.0),      # endowment before development effects
    "edu_years": (np.float32, 0.0),
    "edu_quality": (np.float32, 0.5),
    "adversity": (np.float32, 0.0),      # cumulative childhood adversity 0-1
    "official_iq": (np.float32, np.nan),  # relative civic IQ (capped, reported)
    "official_abs": (np.float32, np.nan),  # absolute-scale official score
    "official_se": (np.float32, np.nan),  # standard error of the official score
    "sittings": (np.int16, 0),
    "classified": (np.bool_, False),
    "band": (np.int8, -1),
    # health ----------------------------------------------------------------
    "health": (np.float32, 1.0),
    "chronic": (np.int8, 0),
    "disability": (np.float32, 0.0),
    "mental": (np.float32, 0.0),
    "sensory": (np.float32, 0.0),
    "dementia": (np.bool_, False),
    "phys_cap": (np.float32, 1.0),
    "acute": (np.float32, 0.0),          # transient ill-health, affects testing
    "stress": (np.float32, 0.2),
    # function and support --------------------------------------------------
    "adaptive": (np.float32, 1.0),
    "need_idx": (np.float32, 0.0),
    "need_level": (np.int8, 0),
    "support_level": (np.int8, 0),
    "unmet": (np.float32, 0.0),
    "over_support_years": (np.float32, 0.0),
    "housing": (np.int8, 0),
    "housing_pref": (np.int8, 0),
    # work ------------------------------------------------------------------
    "occupation": (np.int16, -1),
    "occ_pref": (np.int16, -1),
    "experience": (np.float32, 0.0),
    "expertise": (np.float32, 0.0),
    "performance": (np.float32, 0.0),
    "mismatch": (np.float32, 0.0),
    "burnout": (np.float32, 0.0),
    # fertility -------------------------------------------------------------
    "desired_children": (np.float32, 0.0),
    "children": (np.int8, 0),
    "permit": (np.bool_, False),
    "wait_since": (np.float32, np.nan),
    "pregnant": (np.bool_, False),
    # safeguarding / law ----------------------------------------------------
    "vulnerability": (np.float32, 0.0),
    "abuse_state": (np.int8, 0),         # 0 none, 1 active undetected, 2 intervening
    "abuse_since": (np.float32, np.nan),
    "offence_count": (np.int16, 0),
    # accumulators ----------------------------------------------------------
    "healthy_years": (np.float32, 0.0),
    "independent_years": (np.float32, 0.0),
    "panel": (np.bool_, False),
}


class State:
    def __init__(self, capacity: int, n_dims: int = N_DIMS):
        self.capacity = int(capacity)
        for name, (dt, fill) in FIELDS.items():
            arr = np.empty(self.capacity, dtype=dt)
            arr[:] = fill
            setattr(self, name, arr)
        # latent cognitive profile on the Year-0 absolute scale
        self.latent = np.zeros((self.capacity, n_dims), dtype=np.float32)
        self._free = np.arange(self.capacity - 1, -1, -1, dtype=np.int64).tolist()
        self._next_cid = 0

    # -- slot management ----------------------------------------------------
    @property
    def n_alive(self) -> int:
        return int(self.alive.sum())

    def free_slots(self) -> int:
        return len(self._free)

    def allocate(self, n: int) -> np.ndarray:
        """Return up to n free slot indices, reset to field defaults."""
        n = min(n, len(self._free))
        if n == 0:
            return np.empty(0, dtype=np.int64)
        idx = np.array([self._free.pop() for _ in range(n)], dtype=np.int64)
        for name, (_dt, fill) in FIELDS.items():
            getattr(self, name)[idx] = fill
        self.latent[idx] = 0.0
        self.cid[idx] = np.arange(self._next_cid, self._next_cid + n)
        self._next_cid += n
        self.alive[idx] = True
        return idx

    def release(self, idx: np.ndarray) -> None:
        self.alive[idx] = False
        self._free.extend(int(i) for i in idx)

    def living(self) -> np.ndarray:
        return np.flatnonzero(self.alive)

    # -- checkpointing ------------------------------------------------------
    def snapshot(self) -> dict:
        d = {name: getattr(self, name).copy() for name in FIELDS}
        d["latent"] = self.latent.copy()
        d["_free"] = list(self._free)
        d["_next_cid"] = self._next_cid
        return d

    def restore(self, d: dict) -> None:
        for name in FIELDS:
            getattr(self, name)[:] = d[name]
        self.latent[:] = d["latent"]
        self._free = list(d["_free"])
        self._next_cid = d["_next_cid"]
