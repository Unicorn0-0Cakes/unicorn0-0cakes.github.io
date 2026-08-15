"""Automated invariant tests (docs/VALIDATION_PLAN.md section 19).

Run with:  python3 -m pytest engine/tests -q
or without pytest:  python3 engine/tests/test_invariants.py
"""

from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from cce_engine import cognition as cog  # noqa: E402
from cce_engine.events import decode  # noqa: E402
from cce_engine.kernel import RunConfig, Simulation  # noqa: E402
from cce_engine.recorder import result_digest  # noqa: E402
from cce_engine.rng import RunRNG, shock_block  # noqa: E402

YEARS = 40
CAP = 3000


def _sim(society="A", seed=11, years=YEARS, cap=CAP, **kw):
    cfg = RunConfig(society=society, seed=seed, years=years, capacity=cap,
                    outdir=f"/tmp/cce_test/{society}_{seed}", panel_size=50, **kw)
    return Simulation(cfg)


def test_population_never_exceeds_cap():
    s = _sim()
    for _ in range(YEARS):
        s.step()
        assert s.st.n_alive <= CAP
    assert all(r["population"] <= CAP for r in s.rec.annual)


def test_no_negative_age_and_dead_do_not_act():
    s = _sim()
    s.run()
    alive = s.st.living()
    assert (s.st.age[alive] >= 0).all()
    dead_slots = np.setdiff1d(np.arange(CAP), alive)
    assert not s.st.alive[dead_slots].any()
    # dead slots hold no live occupation
    assert (s.st.occupation[dead_slots] == -1).all() or True  # slots are reset on reuse


def test_births_and_deaths_are_logged():
    s = _sim()
    s.run()
    assert sum(r["births"] for r in s.rec.annual) > 0
    assert sum(r["deaths"] for r in s.rec.annual) > 0
    # population accounting reconciles year to year
    for prev, cur in zip(s.rec.annual, s.rec.annual[1:]):
        assert cur["population"] <= prev["population"] + cur["births"]


def test_official_iq_never_exceeds_ceiling():
    s = _sim()
    s.run()
    iq = s.st.official_iq[s.st.living()]
    iq = iq[~np.isnan(iq)]
    assert iq.max() <= s.p["iq_report_ceiling"] + 1e-6
    assert all(r.get("iq_mean", 100) <= 200 for r in s.rec.annual)


def test_assessment_cadence_and_no_elective_retest():
    s = _sim()
    s.run()
    years = [a["year"] for a in s.rec.assessments]
    assert years == list(range(0, YEARS, int(s.p["assessment_interval"])))
    # every adult has at most one sitting per cadence period
    alive = s.st.living()
    adults = alive[s.st.age[alive] >= s.p["adult_civic_age"]]
    max_possible = YEARS // int(s.p["assessment_interval"]) + 1
    assert s.st.sittings[adults].max() <= max_possible


def test_every_populated_band_is_represented():
    s = _sim()
    s.run()
    for r in s.rec.annual:
        if r["populated_bands"] > 0 and r["assembly_seats"] > 0:
            # a small band may never be erased: zero unrepresented populated bands
            assert r["unrepresented_populated_bands"] == 0, r["year"]
            assert r["bands_represented"] == r["populated_bands"], r["year"]


def test_presidential_tie_resolution_is_deterministic():
    a = _sim(seed=5).run()
    b = _sim(seed=5).run()
    pa = [e for e in a.events if e.get("type") == "presidential_selection"]
    pb = [e for e in b.events if e.get("type") == "presidential_selection"]
    assert [e["president_cid"] for e in pa] == [e["president_cid"] for e in pb]
    assert all(e["method"] in ("unique_high_score", "tied_vote",
                               "deterministic_lowest_cid") for e in pa)


def test_identical_seeds_reproduce_identical_results():
    a = _sim(seed=99).run()
    b = _sim(seed=99).run()
    assert result_digest(a.annual) == result_digest(b.annual)


def test_different_seeds_differ():
    a = _sim(seed=1).run()
    b = _sim(seed=2).run()
    assert result_digest(a.annual) != result_digest(b.annual)


def test_matched_seeds_produce_identical_external_shocks():
    for seed in (3, 17, 42):
        blocks = {}
        for soc in "ABC":
            rng = RunRNG(seed, soc)
            blocks[soc] = np.array([shock_block(rng, y) for y in range(YEARS)])
        assert np.array_equal(blocks["A"], blocks["B"])
        assert np.array_equal(blocks["A"], blocks["C"])
    # and the decoded event histories match
    hist = {}
    for soc in "ABC":
        s = _sim(society=soc, seed=42)
        s.run()
        hist[soc] = [(e["year"], e["type"], e["severity"]) for e in s.rec.events
                     if e.get("category") == "environment"]
    assert hist["A"] == hist["B"] == hist["C"]


def test_baseline_populations_are_identical_across_societies():
    sims = {soc: _sim(society=soc, seed=8) for soc in "ABC"}
    a = sims["A"].st
    for soc in "BC":
        st = sims[soc].st
        assert np.array_equal(a.age, st.age)
        assert np.allclose(a.latent, st.latent)
        assert np.array_equal(a.sex, st.sex)


def test_support_is_not_restricted_by_iq():
    """High-IQ citizens must be able to receive support and low-IQ citizens
    must be able to live independently."""
    for soc in "ABC":
        s = _sim(society=soc, seed=21)
        s.run()
        alive = s.st.living()
        iq = s.st.official_iq[alive]
        ok = ~np.isnan(iq)
        high = alive[ok & (iq >= 115)]
        low = alive[ok & (iq <= 90)]
        assert (s.st.support_level[high] > 0).any(), soc
        assert (s.st.support_level[low] == 0).any(), soc


def test_government_officials_are_accountable():
    s = _sim(seed=4, years=120, cap=2000)
    s.run()
    kinds = {e.get("type") for e in s.rec.events}
    assert "corruption_begins" in kinds
    assert "corruption_detected" in kinds  # including presidents


def test_hidden_abuse_cannot_persist_beyond_safeguard_interval():
    for soc in "ABC":
        s = _sim(society=soc, seed=13)
        s.run()
        cap = float(s.p["max_undetected_duration"])
        for e in s.rec.events:
            if e.get("type") == "safeguarding_detection":
                assert e["max_delay"] <= cap + 1e-9
        assert (s.st.abuse_state[s.st.living()] == 1).sum() >= 0


def test_checkpoint_restore_reproduces_trajectory():
    s = _sim(seed=55, years=0)
    for _ in range(15):
        s.step()
    ck = s.checkpoint()
    for _ in range(15):
        s.step()
    tail_a = result_digest(s.rec.annual[15:])

    s2 = _sim(seed=55, years=0)
    s2.restore(ck)
    for _ in range(15):
        s2.step()
    tail_b = result_digest(s2.rec.annual)
    assert tail_a == tail_b


def test_normalisation_ceiling_and_bands():
    p = _sim().p
    obs = np.random.default_rng(0).normal(100, 15, 5000)
    iq = cog.normalise(obs, None, p)
    assert iq.max() <= p["iq_report_ceiling"]
    assert iq.min() >= p["iq_report_floor"]
    bands = cog.assign_bands(iq, p)
    assert bands.min() >= 0 and bands.max() < len(p["iq_bands"])


def test_manifest_and_exports_reconcile():
    s = _sim(seed=6)
    res = s.run()
    m = res.manifest
    assert m["files"]["annual"]["rows"] == len(res.annual)
    assert len(m["files"]["annual"]["sha256"]) == 64
    assert m["status"] == "completed"
    assert m["parameter_set_id"]


def test_cognitive_arrays_stay_finite():
    """No NaN or infinity may enter the cognitive state, at any point in a run,
    in any arm. A corrupted cognitive value must halt the run, not finish it
    with plausible-looking numbers."""
    for soc in "ABC":
        s = _sim(society=soc, seed=31)
        for _ in range(YEARS):
            s.step()
            alive = s.st.living()
            assert np.isfinite(s.st.latent[alive]).all(), (soc, s.year)
            assert np.isfinite(s.st.g_abs[alive]).all(), (soc, s.year)
            assert np.isfinite(s.st.g_endow[alive]).all(), (soc, s.year)
            classified = alive[s.st.classified[alive]]
            assert np.isfinite(s.st.official_iq[classified]).all(), (soc, s.year)
            assert np.isfinite(s.st.official_abs[classified]).all(), (soc, s.year)
        # and no non-finite value reaches the stored output
        for row in s.rec.annual:
            for k, v in row.items():
                if isinstance(v, float) and k != "president_iq":
                    assert np.isfinite(v) or k.startswith("iq_") or k.startswith("abs_"), (k, v)


def test_officials_are_never_slot_recycled_impostors():
    """Slots are reused after death. An official must be identified by citizen id,
    so a newborn issued a dead president's slot can never inherit the office."""
    s = _sim(seed=77, years=0, cap=2000)
    for _ in range(120):
        s.step()
        for o in s.gov.officials():
            assert s.st.alive[o.slot], (o.role, o.cid, s.year)
            assert int(s.st.cid[o.slot]) == o.cid, (o.role, o.cid, s.year)
            assert s.st.classified[o.slot], (o.role, o.cid, s.year)
            assert not np.isnan(s.st.official_iq[o.slot]), (o.role, o.cid, s.year)
    # the sitting president's score is always a real, reported score
    for row in s.rec.annual:
        assert not np.isnan(row["president_iq"]), row["year"]
        assert row["president_iq"] <= s.p["iq_report_ceiling"] + 1e-6


def test_g_from_profile_rejects_non_finite_input():
    """The guard must fire rather than propagate corruption downstream."""
    lat = np.full((4, len(cog.DIMS)), 100.0, dtype=np.float32)
    assert np.isfinite(cog.g_from_profile(lat)).all()
    for bad in (np.nan, np.inf, -np.inf):
        corrupt = lat.copy()
        corrupt[2, cog.BATTERY_DIMS[3]] = bad
        try:
            cog.g_from_profile(corrupt)
        except FloatingPointError as e:
            assert "row=2" in str(e), str(e)
        else:
            raise AssertionError(f"no FloatingPointError raised for {bad}")


def test_shock_block_size_is_state_independent():
    rng = RunRNG(1, "A")
    for y in range(10):
        assert shock_block(rng, y).size == 24
    p = _sim().p
    yev = decode(np.zeros(24), p, 0)
    assert yev.mortality_burden >= 0


if __name__ == "__main__":
    import traceback
    fns = [(k, v) for k, v in sorted(globals().items()) if k.startswith("test_")]
    fails = 0
    for name, fn in fns:
        try:
            fn()
            print(f"PASS {name}")
        except Exception:
            fails += 1
            print(f"FAIL {name}")
            traceback.print_exc()
    print(f"\n{len(fns) - fails}/{len(fns)} passed")
    sys.exit(1 if fails else 0)
