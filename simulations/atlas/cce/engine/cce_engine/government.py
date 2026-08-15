"""Common government module (identical structure in Societies A, B and C).

Government is held constant across arms so that it is not an uncontrolled
confound. It is nevertheless a *module*: alternative political systems can be
registered here without touching the simulation kernel.

Design commitments:
  * Eligibility for the presidency follows the highest valid official score.
    Eligibility is not competence: leadership traits are drawn with a modest,
    configurable correlation to g (default 0.20 for systems planning, 0.0 for
    ethics) and the model must be able to produce bad high-scoring leaders.
  * Every populated band receives at least one seat, regardless of size.
  * Officials remain legally accountable; corruption, capture and coalition
    behaviour are possible outcomes, not excluded by construction.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class Official:
    cid: int
    slot: int
    band: int
    role: str          # "president" | "representative"
    competence: float
    ethics: float
    since_year: int
    corrupt: bool = False
    corrupt_since: int | None = None
    removed_reason: str | None = None


@dataclass
class Government:
    president: Official | None = None
    representatives: list[Official] = field(default_factory=list)
    history: list[dict] = field(default_factory=list)
    quality: float = 0.5

    def officials(self):
        return ([self.president] if self.president else []) + self.representatives


def _traits(g_abs: np.ndarray, p, rng) -> tuple[np.ndarray, np.ndarray]:
    z = (g_abs - 100.0) / 15.0
    rc = float(p["leader_competence_iq_link"])
    re_ = float(p["leader_ethics_iq_link"])
    comp = rc * z + np.sqrt(max(1 - rc ** 2, 0.0)) * rng.standard_normal(z.size)
    eth = re_ * z + np.sqrt(max(1 - re_ ** 2, 0.0)) * rng.standard_normal(z.size)
    return comp.astype(np.float32), eth.astype(np.float32)


def select_president(st, eligible: np.ndarray, p, rng, year: int) -> tuple[Official, dict]:
    """Highest official score wins; exact ties vote among themselves only.

    Tie-breaking after a tied vote is deterministic and documented: the tied
    candidate with the lowest citizen id wins, so replay is exact.
    """
    scores = st.official_iq[eligible]
    top = np.nanmax(scores)
    tied = eligible[scores >= top - 1e-6]
    log = {"year": year, "top_score": float(top), "n_tied": int(tied.size)}
    if tied.size == 1:
        winner = int(tied[0])
        log["method"] = "unique_high_score"
    else:
        # only tied citizens vote, and only among themselves
        votes = rng.integers(0, tied.size, size=tied.size)
        counts = np.bincount(votes, minlength=tied.size)
        best = counts.max()
        finalists = tied[counts == best]
        if finalists.size == 1:
            winner = int(finalists[0])
            log["method"] = "tied_vote"
        else:
            winner = int(finalists[np.argmin(st.cid[finalists])])
            log["method"] = "deterministic_lowest_cid"
        log["votes"] = counts.tolist()
    comp, eth = _traits(st.g_abs[np.array([winner])], p, rng)
    pres = Official(cid=int(st.cid[winner]), slot=winner, band=int(st.band[winner]),
                    role="president", competence=float(comp[0]), ethics=float(eth[0]),
                    since_year=year)
    log["president_cid"] = pres.cid
    log["president_iq"] = float(st.official_iq[winner])
    return pres, log


def elect_assembly(st, classified: np.ndarray, p, rng, year: int) -> list[Official]:
    """Guaranteed seat per populated band plus proportional seats."""
    bands = st.band[classified]
    n_bands = len(p["iq_bands"])
    counts = np.bincount(bands[bands >= 0], minlength=n_bands)
    populated = np.flatnonzero(counts > 0)
    seats = np.zeros(n_bands, dtype=np.int64)
    seats[populated] = int(p["seats_base"])
    extra = int(p["seats_proportional"])
    if extra > 0 and counts.sum() > 0:
        share = counts / counts.sum()
        add = np.floor(share * extra).astype(np.int64)
        rem = extra - add.sum()
        if rem > 0:
            order = np.argsort(-(share * extra - add))
            add[order[:rem]] += 1
        seats += add * (counts > 0)

    reps: list[Official] = []
    for b in populated:
        pool = classified[bands == b]
        k = int(min(seats[b], pool.size))
        if k <= 0:
            continue
        # within-band election: candidates weighted by visibility (a mix of
        # performance, social understanding and chance), not by score
        weight = (0.4 * st.performance[pool]
                  + 0.3 * (st.adaptive[pool])
                  + 0.3 * rng.random(pool.size))
        sel = pool[np.argsort(-weight)[:k]]
        comp, eth = _traits(st.g_abs[sel], p, rng)
        for i, s in enumerate(sel):
            reps.append(Official(cid=int(st.cid[s]), slot=int(s), band=int(b),
                                 role="representative", competence=float(comp[i]),
                                 ethics=float(eth[i]), since_year=year))
    return reps


def holds_office(st, o: Official) -> bool:
    """Is this official still the person who was elected?

    An `Official` stores a *slot index*, and slots are recycled: when a citizen
    dies the slot returns to the free stack and may be reissued to a newborn in
    the same year. Checking `alive[slot]` alone would therefore silently treat
    that newborn as the sitting president. Identity is the citizen id, so the
    slot is only valid while it still holds the same `cid`.
    """
    return bool(st.alive[o.slot]) and int(st.cid[o.slot]) == o.cid


def fill_vacancies(gov: Government, st, classified: np.ndarray, p, rng,
                   year: int) -> list[dict]:
    """Restore the representation guarantee after deaths, removals or succession.

    The constitutional rule is that every populated band is represented at all
    times, not merely on election day. A vacated seat triggers a by-election
    within the same band; a vacated presidency is filled by the highest valid
    official score among living classified citizens until the next assessment.
    """
    events: list[dict] = []
    if classified.size == 0:
        return events
    bands = st.band[classified]
    n_bands = len(p["iq_bands"])
    pop = np.bincount(bands[bands >= 0], minlength=n_bands)
    held = np.bincount([r.band for r in gov.representatives], minlength=n_bands)
    for b in np.flatnonzero((pop > 0) & (held == 0)):
        pool = classified[bands == b]
        weight = 0.4 * st.performance[pool] + 0.3 * st.adaptive[pool] + 0.3 * rng.random(pool.size)
        s = int(pool[int(np.argmax(weight))])
        comp, eth = _traits(st.g_abs[np.array([s])], p, rng)
        gov.representatives.append(
            Official(cid=int(st.cid[s]), slot=s, band=int(b), role="representative",
                     competence=float(comp[0]), ethics=float(eth[0]), since_year=year))
        events.append({"year": year, "type": "by_election", "band": int(b),
                       "cid": int(st.cid[s]), "reason": "vacant_seat"})
    if gov.president is None:
        scores = st.official_iq[classified]
        s = int(classified[int(np.nanargmax(scores))])
        comp, eth = _traits(st.g_abs[np.array([s])], p, rng)
        gov.president = Official(cid=int(st.cid[s]), slot=s, band=int(st.band[s]),
                                 role="president", competence=float(comp[0]),
                                 ethics=float(eth[0]), since_year=year)
        events.append({"year": year, "type": "presidential_succession",
                       "cid": gov.president.cid, "reason": "vacancy",
                       "president_iq": float(st.official_iq[s])})
    return events


def annual_governance(gov: Government, st, p, rng, year: int) -> list[dict]:
    """Corruption, audits, accountability and succession. Returns event rows."""
    events: list[dict] = []
    officials = gov.officials()
    if not officials:
        return events

    # death or incapacity -> documented succession
    for o in list(officials):
        vacated = not holds_office(st, o)
        incapacitated = vacated or bool(st.dementia[o.slot])
        if incapacitated:
            reason = "death" if vacated else "medically_verified_decline"
            o.removed_reason = reason
            events.append({"year": year, "type": "succession", "role": o.role,
                           "cid": o.cid, "reason": reason})
            if o.role == "president":
                gov.president = None
            else:
                gov.representatives = [r for r in gov.representatives if r.cid != o.cid]

    base = float(p["corruption_base"])
    for o in gov.officials():
        if not o.corrupt:
            hz = base * float(np.exp(-0.6 * o.ethics))
            if rng.random() < hz:
                o.corrupt, o.corrupt_since = True, year
                events.append({"year": year, "type": "corruption_begins",
                               "role": o.role, "cid": o.cid})
        else:
            if rng.random() < float(p["audit_effectiveness"]):
                events.append({"year": year, "type": "corruption_detected",
                               "role": o.role, "cid": o.cid,
                               "duration": year - (o.corrupt_since or year)})
                # officials are subject to the law, including the president
                o.corrupt = False
                st.offence_count[o.slot] += 1
                if o.role == "president":
                    gov.president = None
                    events.append({"year": year, "type": "presidential_removal",
                                   "cid": o.cid, "reason": "legal_accountability"})
                else:
                    gov.representatives = [r for r in gov.representatives if r.cid != o.cid]

    offs = gov.officials()
    if offs:
        comp = float(np.mean([o.competence for o in offs]))
        eth = float(np.mean([o.ethics for o in offs]))
        corrupt_frac = float(np.mean([o.corrupt for o in offs]))
        gov.quality = float(np.clip(0.5 + 0.2 * comp + 0.2 * eth - 0.6 * corrupt_frac,
                                    0.0, 1.0))
    return events
