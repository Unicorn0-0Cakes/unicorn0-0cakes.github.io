"""Batch-runner tests (docs/BATCH_EXECUTION.md).

Run with:
    PYTHONWARNINGS=error python3 engine/tests/test_batch.py
"""

from __future__ import annotations

import json
import math
import os
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from cce_engine import batch as B  # noqa: E402
from cce_engine import stats  # noqa: E402
from cce_engine.verify import verify_run  # noqa: E402

TINY = dict(years=8, population=400, logging_level="minimal", tag="debug")


def _tmp() -> Path:
    return Path(tempfile.mkdtemp(prefix="cce_batch_"))


def _specs(root: Path, seeds, societies=("A", "B", "C")):
    return B.build_specs(list(seeds), list(societies), TINY["years"],
                         TINY["population"], TINY["logging_level"], TINY["tag"],
                         root / "runs")


def _run_batch(root: Path, seeds, workers=1, **kw):
    specs = _specs(root, seeds)
    b = B.Batch(out=str(root), specs=specs, workers=workers, tag=TINY["tag"],
                seed_source="test")
    b.run(**kw)
    return b


# --- seeds -----------------------------------------------------------------

def test_deterministic_seed_generation():
    assert B.generate_seeds(1, 5) == [1, 2, 3, 4, 5]
    assert B.generate_seeds(1, 5) == B.generate_seeds(1, 5)
    assert B.generate_seeds(100, 3) == [100, 101, 102]
    for bad in ((1, 0), (1, -3), (-1, 5)):
        try:
            B.generate_seeds(*bad)
        except ValueError:
            pass
        else:
            raise AssertionError(f"accepted {bad}")


def test_seed_file_parsing_and_precedence():
    root = _tmp()
    csv_path = root / "seeds.csv"
    csv_path.write_text("seed,note\n7,a\n11,b\n13,c\n", encoding="utf-8")
    assert B.read_seed_file(csv_path) == [7, 11, 13]

    bare = root / "bare.txt"
    bare.write_text("# comment\n21\n22\n\n23\n", encoding="utf-8")
    assert B.read_seed_file(bare) == [21, 22, 23]

    dupe = root / "dupe.csv"
    dupe.write_text("seed\n5\n5\n6\n", encoding="utf-8")
    try:
        B.read_seed_file(dupe)
    except ValueError as e:
        assert "duplicate" in str(e)
    else:
        raise AssertionError("duplicate seeds accepted")

    bad = root / "bad.csv"
    bad.write_text("seed\nnot_a_number\n", encoding="utf-8")
    try:
        B.read_seed_file(bad)
    except ValueError:
        pass
    else:
        raise AssertionError("non-integer seed accepted")

    empty = root / "empty.csv"
    empty.write_text("seed\n", encoding="utf-8")
    try:
        B.read_seed_file(empty)
    except ValueError:
        pass
    else:
        raise AssertionError("empty seed file accepted")
    shutil.rmtree(root, ignore_errors=True)


def test_unique_run_directories_and_no_collision():
    root = _tmp()
    specs = _specs(root, [4, 5, 6])
    dirs = [s.run_dir for s in specs]
    assert len(set(dirs)) == len(dirs) == 9
    ids = [s.experiment_id for s in specs]
    assert len(set(ids)) == 9
    assert "CCE-A-0001" in ids and "CCE-C-0003" in ids
    # run number is positional; seed is preserved separately even when unequal
    a1 = [s for s in specs if s.experiment_id == "CCE-A-0001"][0]
    assert a1.run_number == 1 and a1.seed == 4
    shutil.rmtree(root, ignore_errors=True)


def test_batch_extension_preserves_run_numbering():
    """A batch run in chunks must not renumber earlier seeds, or the second
    invocation would collide with the first invocation's directories."""
    root = _tmp()
    pos1 = B.assign_positions([1, 2, 3])
    assert pos1 == {1: 1, 2: 2, 3: 3}
    B.write_seed_list(root, pos1)

    pos2 = B.assign_positions([4, 5], B.load_seed_positions(root))
    assert pos2[1] == 1 and pos2[3] == 3, "existing seeds were renumbered"
    assert pos2[4] == 4 and pos2[5] == 5, "new seeds not appended"

    # and the same seed always maps to the same directory
    s1 = B.build_specs([1, 2, 3], ["A"], 5, 100, "minimal", "debug",
                       root / "runs", positions=pos1)
    s2 = B.build_specs([4, 5], ["A"], 5, 100, "minimal", "debug",
                       root / "runs", positions=pos2)
    assert not (set(x.run_dir for x in s1) & set(x.run_dir for x in s2))
    shutil.rmtree(root, ignore_errors=True)


def test_chunked_batch_summaries_cover_the_whole_batch():
    """Summaries must describe the batch on disk, not just the seeds of the most
    recent invocation, or the paired contrasts silently use a fraction of it."""
    root = _tmp()
    pos = B.assign_positions([1, 2], B.load_seed_positions(root))
    B.write_seed_list(root, pos)
    b1 = B.Batch(out=str(root), specs=_specs_with(root, [1, 2], pos), workers=1,
                 tag=TINY["tag"], seed_source="chunk1")
    b1.run()

    pos = B.assign_positions([3, 4], B.load_seed_positions(root))
    B.write_seed_list(root, pos)
    b2 = B.Batch(out=str(root), specs=_specs_with(root, [3, 4], pos), workers=1,
                 tag=TINY["tag"], seed_source="chunk2")
    b2.run()

    rows = list(_read_csv(root / "summaries" / "run_summary.csv"))
    assert len(rows) == 12, f"{len(rows)} rows, expected all 12 runs"
    assert {int(r["seed"]) for r in rows} == {1, 2, 3, 4}
    contrasts = list(_read_csv(root / "summaries" / "paired_contrasts.csv"))
    ba = [r for r in contrasts if r["outcome"] == "healthy_life_expectancy"
          and r["contrast"] == "B_minus_A"][0]
    assert int(ba["n_matched_seeds"]) == 4, ba["n_matched_seeds"]
    # and earlier seeds kept their run numbers
    assert {int(r["seed"]): int(r["run_number"]) for r in rows}[1] == 1
    shutil.rmtree(root, ignore_errors=True)


def _specs_with(root: Path, seeds, positions):
    return B.build_specs(list(seeds), ["A", "B", "C"], TINY["years"],
                         TINY["population"], TINY["logging_level"], TINY["tag"],
                         root / "runs", positions=positions)


def test_matched_seed_pairing_across_societies():
    root = _tmp()
    specs = _specs(root, [10, 20])
    by_seed = {}
    for s in specs:
        by_seed.setdefault(s.seed, set()).add(s.society)
    assert all(v == {"A", "B", "C"} for v in by_seed.values())
    # matched arms share a run number
    for seed in (10, 20):
        nums = {s.run_number for s in specs if s.seed == seed}
        assert len(nums) == 1
    shutil.rmtree(root, ignore_errors=True)


def test_worker_count_validation():
    assert B.default_workers(100_000, 500) >= 1
    assert B.default_workers(1_000, 10) >= 1
    est = B.estimate_rss_mb(100_000, 500)
    assert 100 < est < 5000, est
    assert B.estimate_rss_mb(10_000, 100) < est
    p = B.plan([1, 2], ["A", "B", "C"], 100, 10_000, 2)
    assert p["runs"] == 6 and p["workers"] == 2
    assert p["estimated_peak_rss_total_mb"] > 0


# --- execution -------------------------------------------------------------

def test_batch_completes_and_writes_summaries():
    root = _tmp()
    b = _run_batch(root, [1, 2])
    st = b.status()
    assert st["completed"] == 6 and st["failed"] == 0
    for f in ("run_summary.csv", "arm_summary.csv", "paired_contrasts.csv",
              "seed_paired_summary.csv", "failures.csv", "runtime_summary.csv",
              "shock_response.csv"):
        assert (root / "summaries" / f).exists(), f
    assert (root / "batch_manifest.json").exists()
    assert (root / "reports" / "pilot_summary.md").exists()
    m = json.loads((root / "batch_manifest.json").read_text())
    assert m["completion_rate"] == 1.0
    assert m["n_seeds"] == 2
    shutil.rmtree(root, ignore_errors=True)


def test_environment_metadata_captured():
    root = _tmp()
    _run_batch(root, [3])
    rows = list(_read_csv(root / "summaries" / "run_summary.csv"))
    assert rows
    for r in rows:
        for field in ("python_version", "numpy_version", "platform", "machine",
                      "started_utc", "completed_utc", "worker_pid",
                      "parameter_set_id", "model_version", "git_commit"):
            assert r[field] not in ("", None), field
        assert r["numpy_version"] == np.__version__
    shutil.rmtree(root, ignore_errors=True)


def test_resume_skips_verified_runs():
    root = _tmp()
    b1 = _run_batch(root, [1, 2])
    assert b1.status()["completed"] == 6
    mtimes = {p.name: p.stat().st_mtime_ns
              for p in (root / "runs").glob("*/manifest.json")}

    b2 = _run_batch(root, [1, 2])          # second pass, everything present
    st = b2.status()
    assert st["verified_existing"] == 6, st
    assert st["failed"] == 0
    after = {p.name: p.stat().st_mtime_ns
             for p in (root / "runs").glob("*/manifest.json")}
    assert mtimes == after, "a verified run was needlessly re-executed"
    shutil.rmtree(root, ignore_errors=True)


def test_incomplete_run_is_quarantined_and_rerun():
    root = _tmp()
    _run_batch(root, [1, 2])
    victim = root / "runs" / "CCE-B-0002"
    (victim / "manifest.json").unlink()      # simulate an interrupted run
    assert not (victim / "manifest.json").exists()

    b = _run_batch(root, [1, 2])
    st = b.status()
    assert st["failed"] == 0, st
    assert st["completed"] == 6
    assert (victim / "manifest.json").exists(), "run was not recovered"
    q = list((root / "quarantine").glob("*/CCE-B-0002"))
    assert q, "incomplete run was not quarantined"
    assert (q[0] / "QUARANTINE_REASON.txt").exists()
    shutil.rmtree(root, ignore_errors=True)


def test_corrupt_checksum_is_detected_and_quarantined():
    root = _tmp()
    _run_batch(root, [1])
    victim = root / "runs" / "CCE-C-0001" / "annual.csv"
    text = victim.read_text(encoding="utf-8").splitlines()
    text[1] = text[1].replace(",", ",", 1) + " "     # one byte, still parseable
    victim.write_text("\n".join(text) + "\n", encoding="utf-8")

    res = verify_run(str(root / "runs" / "CCE-C-0001"))
    assert not res.ok
    assert any("checksum" in f for f in res.failures), res.failures

    b = _run_batch(root, [1], verify_only=True)
    st = b.status()
    assert st["failed"] >= 1, st
    shutil.rmtree(root, ignore_errors=True)


def test_non_finite_output_is_rejected_by_verification():
    root = _tmp()
    _run_batch(root, [1])
    run = root / "runs" / "CCE-A-0001"
    rows = (run / "annual.csv").read_text(encoding="utf-8").splitlines()
    header = rows[0].split(",")
    col = header.index("mean_health")
    parts = rows[1].split(",")
    parts[col] = "nan"
    rows[1] = ",".join(parts)
    (run / "annual.csv").write_text("\n".join(rows) + "\n", encoding="utf-8")
    res = verify_run(str(run), check_checksums=False)
    assert not res.ok
    assert res.nonfinite and res.nonfinite[0][2] == "mean_health"
    shutil.rmtree(root, ignore_errors=True)


def test_legitimate_missing_values_are_not_treated_as_corruption():
    """official_iq may be missing only when band == -1; president_iq only when
    no president is seated."""
    root = _tmp()
    b = B.Batch(out=str(root), specs=B.build_specs(
        [1], ["A"], 40, 1200, "standard", "debug", root / "runs"),
        workers=1, tag="debug", seed_source="test")
    b.run()
    res = verify_run(str(root / "runs" / "CCE-A-0001"))
    assert res.ok, res.reason()
    import csv as _csv
    with (root / "runs" / "CCE-A-0001" / "panel.csv").open(encoding="utf-8") as f:
        rows = list(_csv.DictReader(f))
    missing = [r for r in rows if r["official_iq"] in ("nan", "")]
    assert missing, "expected some unclassified citizens in the panel"
    assert all(int(r["band"]) == -1 for r in missing)
    shutil.rmtree(root, ignore_errors=True)


def test_failure_isolation_does_not_stop_the_batch():
    root = _tmp()
    specs = list(_specs(root, [1, 2]))
    # one impossible spec: zero population cannot be simulated
    broken = B.RunSpec(society="B", seed=99, run_number=99, years=5,
                       population=0, logging_level="minimal", tag="debug",
                       run_dir=str(root / "runs" / "CCE-B-0099"))
    specs.insert(2, broken)
    b = B.Batch(out=str(root), specs=specs, workers=1, tag="debug",
                seed_source="test")
    b.run()
    st = b.status()
    assert st["failed"] == 1, st
    assert st["completed"] == 6, st
    fails = list(_read_csv(root / "summaries" / "failures.csv"))
    assert len(fails) == 1
    f = fails[0]
    assert f["error_type"] and f["stage"] and f["traceback"]
    assert f["seed"] == "99"
    shutil.rmtree(root, ignore_errors=True)


def test_atomic_batch_status_write():
    root = _tmp()
    b = _run_batch(root, [1])
    p = root / "batch_status.json"
    assert p.exists()
    data = json.loads(p.read_text())       # parses => not truncated
    assert data["total_runs"] == 3
    assert not list(root.glob("*.tmp")), "temporary status file left behind"
    # every completed run left a status snapshot behind it
    assert data["completed"] == 3
    shutil.rmtree(root, ignore_errors=True)


def test_parallel_workers_produce_identical_results_to_serial():
    a, b = _tmp(), _tmp()
    _run_batch(a, [1, 2], workers=1)
    _run_batch(b, [1, 2], workers=2)
    ra = {r["experiment_id"]: r for r in _read_csv(a / "summaries" / "run_summary.csv")}
    rb = {r["experiment_id"]: r for r in _read_csv(b / "summaries" / "run_summary.csv")}
    assert set(ra) == set(rb)
    for k in ra:
        for field in ("healthy_life_expectancy", "independent_life_expectancy",
                      "mean_mismatch", "final_population"):
            assert ra[k][field] == rb[k][field], (k, field)
    shutil.rmtree(a, ignore_errors=True)
    shutil.rmtree(b, ignore_errors=True)


# --- statistics ------------------------------------------------------------

def _rec(society, seed, **kw):
    base = {"society": society, "seed": seed, "healthy_life_expectancy": 70.0,
            "independent_life_expectancy": 50.0, "life_expectancy": 80.0,
            "shock_events_total": 10, "mortality_burden_total": 1.0}
    base.update(kw)
    return base


def test_paired_difference_calculation():
    recs = []
    for i, seed in enumerate([1, 2, 3, 4]):
        recs.append(_rec("A", seed, healthy_life_expectancy=70.0 + i))
        recs.append(_rec("B", seed, healthy_life_expectancy=72.0 + i))   # +2 exactly
        recs.append(_rec("C", seed, healthy_life_expectancy=71.0 + i))   # +1 exactly
    rows, per_seed = stats.paired_contrasts(recs, ["healthy_life_expectancy"])
    got = {r["contrast"]: r for r in rows}
    assert math.isclose(got["B_minus_A"]["mean_diff"], 2.0)
    assert math.isclose(got["C_minus_A"]["mean_diff"], 1.0)
    assert math.isclose(got["C_minus_B"]["mean_diff"], -1.0)
    # constant differences => zero variance, and the paired estimate is exact
    assert math.isclose(got["B_minus_A"]["sd_diff"], 0.0, abs_tol=1e-12)
    assert got["B_minus_A"]["p_diff_gt_0"] == 1.0
    assert got["B_minus_A"]["p_diff_gt_sesoi"] == 1.0     # 2.0 > SESOI 1.0
    assert got["C_minus_A"]["p_diff_gt_sesoi"] == 0.0     # 1.0 is not > 1.0
    assert len(per_seed) == 4
    assert per_seed[0]["healthy_life_expectancy__B_minus_A"] == 2.0


def test_paired_not_substituted_by_independent_samples():
    """Arm means can be identical while every paired difference is non-zero.
    A correct matched analysis must not report zero here."""
    recs = [
        _rec("A", 1, healthy_life_expectancy=60.0),
        _rec("B", 1, healthy_life_expectancy=70.0),
        _rec("A", 2, healthy_life_expectancy=70.0),
        _rec("B", 2, healthy_life_expectancy=80.0),
    ]
    arm = {r["society"]: r for r in stats.arm_summary(recs, ["healthy_life_expectancy"])}
    assert math.isclose(arm["B"]["mean"] - arm["A"]["mean"], 10.0)
    rows, _ = stats.paired_contrasts(recs, ["healthy_life_expectancy"])
    ba = [r for r in rows if r["contrast"] == "B_minus_A"][0]
    assert math.isclose(ba["mean_diff"], 10.0)
    assert math.isclose(ba["sd_diff"], 0.0, abs_tol=1e-12)   # paired SD, not arm SD
    assert arm["A"]["sd"] > 0                                # arms are variable
    assert ba["mcse_diff"] < arm["A"]["mcse"]


def test_incomplete_pairs_are_excluded_and_counted():
    recs = [
        _rec("A", 1, healthy_life_expectancy=70.0),
        _rec("B", 1, healthy_life_expectancy=72.0),
        _rec("A", 2, healthy_life_expectancy=70.0),   # seed 2 has no B
        _rec("B", 3, healthy_life_expectancy=75.0),   # seed 3 has no A
    ]
    rows, per_seed = stats.paired_contrasts(recs, ["healthy_life_expectancy"])
    ba = [r for r in rows if r["contrast"] == "B_minus_A"][0]
    assert ba["n_matched_seeds"] == 1
    assert ba["n_seeds_excluded_incomplete"] == 2
    assert math.isclose(ba["mean_diff"], 2.0)
    seed2 = [r for r in per_seed if r["seed"] == 2][0]
    assert seed2["healthy_life_expectancy__B_minus_A"] == ""
    assert seed2["has_A"] == 1 and seed2["has_B"] == 0


def test_mcse_calculation():
    x = [1.0, 2.0, 3.0, 4.0, 5.0]
    d = stats.describe(x)
    sd = float(np.std(x, ddof=1))
    assert math.isclose(d["sd"], sd)
    assert math.isclose(d["mcse"], sd / math.sqrt(5))
    assert d["n"] == 5 and d["min"] == 1.0 and d["max"] == 5.0
    # MCSE shrinks as 1/sqrt(n)
    big = stats.describe(list(np.random.default_rng(0).normal(0, 1, 4000)))
    assert big["mcse"] < 0.05
    lo, hi = stats.bca_ci(np.asarray(x, dtype=float))
    assert lo < d["mean"] < hi
    # deterministic
    assert stats.bca_ci(np.asarray(x, dtype=float)) == (lo, hi)


def test_precise_but_below_sesoi_is_flagged():
    rng = np.random.default_rng(7)
    recs = []
    for seed in range(1, 41):
        base = float(rng.normal(70, 1))
        recs.append(_rec("A", seed, healthy_life_expectancy=base))
        # a consistent but trivial +0.05y advantage, far below the 1.0y SESOI
        recs.append(_rec("B", seed, healthy_life_expectancy=base + 0.05))
    rows, _ = stats.paired_contrasts(recs, ["healthy_life_expectancy"])
    ba = [r for r in rows if r["contrast"] == "B_minus_A"][0]
    assert ba["ci95_low"] > 0                     # statistically unambiguous
    assert abs(ba["mean_diff"]) < ba["sesoi"]     # scientifically trivial
    assert ba["precise_but_below_sesoi"] == 1


def _read_csv(path: Path):
    import csv as _csv
    with Path(path).open(newline="", encoding="utf-8") as f:
        return list(_csv.DictReader(f))


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
