"""Matched-seed batch runner.

One batch = a set of seeds × a set of societies. Every society runs every seed,
so each seed yields a complete matched set and the paired contrasts in
`stats.py` are well defined.

Guarantees:

* **Idempotent and resumable.** An existing run is skipped only if it passes
  full integrity verification (`verify.verify_run`). Anything incomplete or
  corrupt is quarantined with a reason and rerun.
* **Order-independent.** Runs may execute in any order and on any worker; run
  identity, output paths and pairing are computed from (society, seed) alone.
* **Failure-isolated.** A worker exception is captured with type, message,
  traceback, elapsed time and last known stage; the rest of the batch continues.
* **Crash-safe.** `batch_status.json` is rewritten atomically after every
  completed or failed run, so interruption cannot destroy progress.
* **No collisions.** Two runs can never share an output directory; this is
  asserted before any worker starts.

Nothing here changes the scientific model. Batch runs are tagged and are never
preregistered main results unless explicitly tagged `main`.
"""

from __future__ import annotations

import csv
import json
import multiprocessing as mp
import os
import platform
import shutil
import sys
import time
import traceback
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

# Single-threaded numeric libraries in every process. Set in the parent BEFORE
# any pool is created so children inherit it under both fork and spawn, and set
# again in the worker initializer for belt and braces. Nested BLAS threading
# inside an already-parallel batch is pure contention.
THREAD_ENV = {
    "OMP_NUM_THREADS": "1",
    "OPENBLAS_NUM_THREADS": "1",
    "MKL_NUM_THREADS": "1",
    "VECLIB_MAXIMUM_THREADS": "1",
    "NUMEXPR_NUM_THREADS": "1",
}

SOCIETIES = ("A", "B", "C")

# Measured peak RSS for a 100,000-citizen, 500-year run (see
# docs/COMPUTE_AND_STORAGE_ESTIMATE.md). Used only for the pre-launch estimate.
_RSS_PER_100K_500Y_MB = 560.0


def apply_thread_env() -> None:
    for k, v in THREAD_ENV.items():
        os.environ[k] = v


@dataclass(frozen=True)
class RunSpec:
    society: str
    seed: int
    run_number: int
    years: int
    population: int
    logging_level: str
    tag: str
    run_dir: str

    @property
    def experiment_id(self) -> str:
        return f"CCE-{self.society}-{self.run_number:04d}"


# ---------------------------------------------------------------------------
# seed handling
# ---------------------------------------------------------------------------

def generate_seeds(seed_start: int, seed_count: int) -> list[int]:
    """Deterministic contiguous seed list. Identical inputs, identical output."""
    if seed_count <= 0:
        raise ValueError("seed_count must be positive")
    if seed_start < 0:
        raise ValueError("seed_start must be non-negative")
    return list(range(int(seed_start), int(seed_start) + int(seed_count)))


def read_seed_file(path) -> list[int]:
    """Explicit seed list. Takes precedence over seed-start/seed-count.

    Accepts a CSV with a `seed` column, or one integer per line. Blank lines and
    lines beginning with '#' are ignored. Duplicates are an error: a repeated
    seed would silently double-weight one draw of the external history.
    """
    text = Path(path).read_text(encoding="utf-8")
    lines = [ln.strip() for ln in text.splitlines()]
    lines = [ln for ln in lines if ln and not ln.startswith("#")]
    if not lines:
        raise ValueError(f"seed file {path} contains no seeds")

    header = [h.strip().lower() for h in lines[0].split(",")]
    if "seed" in header:
        col = header.index("seed")
        rows = [ln.split(",")[col].strip() for ln in lines[1:]]
    else:
        rows = [ln.split(",")[0].strip() for ln in lines]

    seeds = []
    for r in rows:
        if r == "":
            continue
        try:
            seeds.append(int(r))
        except ValueError as e:
            raise ValueError(f"seed file {path}: {r!r} is not an integer") from e
    if not seeds:
        raise ValueError(f"seed file {path} contains no seeds")
    dupes = {s for s in seeds if seeds.count(s) > 1}
    if dupes:
        raise ValueError(f"seed file {path} contains duplicate seeds: {sorted(dupes)}")
    return seeds


def load_seed_positions(batch_root) -> dict[int, int]:
    """Seed -> run number, from a batch's existing seed_list.csv."""
    path = Path(batch_root) / "seed_list.csv"
    if not path.exists():
        return {}
    out: dict[int, int] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                out[int(row["seed"])] = int(row["position"])
            except (KeyError, ValueError):
                continue
    return out


def assign_positions(seeds: list[int], existing: dict[int, int] | None = None
                     ) -> dict[int, int]:
    """Stable seed -> run number mapping.

    Run number is positional, but the position must be a property of the BATCH,
    not of one invocation. If a batch is extended or resumed with a different
    seed range, previously assigned positions are preserved and new seeds are
    appended after the highest existing position. Without this, a second
    invocation would restart numbering at 1 and collide with the first
    invocation's output directories.
    """
    existing = dict(existing or {})
    nxt = max(existing.values(), default=0) + 1
    for seed in seeds:
        if seed not in existing:
            existing[seed] = nxt
            nxt += 1
    return existing


def write_seed_list(batch_root, positions: dict[int, int]) -> None:
    rows = [{"position": p, "seed": s}
            for s, p in sorted(positions.items(), key=lambda kv: kv[1])]
    write_csv(Path(batch_root) / "seed_list.csv", rows)


def build_specs(seeds: list[int], societies: list[str], years: int, population: int,
                logging_level: str, tag: str, runs_root: Path,
                positions: dict[int, int] | None = None) -> list[RunSpec]:
    """Run number is the seed's 1-based position in the batch, so matched arms
    share a run number as well as a seed. Both are recorded separately, because
    they coincide only by construction and must not be conflated."""
    for s in societies:
        if s not in SOCIETIES:
            raise ValueError(f"unknown society {s!r}")
    positions = positions or assign_positions(list(seeds))
    specs = []
    for seed in seeds:
        pos = positions[seed]
        for society in societies:
            rid = f"CCE-{society}-{pos:04d}"
            specs.append(RunSpec(society=society, seed=int(seed), run_number=pos,
                                 years=years, population=population,
                                 logging_level=logging_level, tag=tag,
                                 run_dir=str(runs_root / rid)))
    dirs = [s.run_dir for s in specs]
    if len(set(dirs)) != len(dirs):
        clash = {d for d in dirs if dirs.count(d) > 1}
        raise ValueError(f"output directory collision: {sorted(clash)}")
    return specs


# ---------------------------------------------------------------------------
# worker
# ---------------------------------------------------------------------------

def _worker_init() -> None:
    apply_thread_env()


def execute(spec: RunSpec) -> dict:
    """Run one simulation. Never raises: failures are returned as records."""
    apply_thread_env()
    from .kernel import MODEL_VERSION, RunConfig, Simulation  # local: spawn-safe
    from .verify import verify_run

    t0 = time.perf_counter()
    stage = "init"
    log_lines = [f"{datetime.now(timezone.utc).isoformat()} start {spec.experiment_id} "
                 f"society={spec.society} seed={spec.seed} pid={os.getpid()}"]
    try:
        cfg = RunConfig(society=spec.society, seed=spec.seed, years=spec.years,
                        capacity=spec.population, logging_level=spec.logging_level,
                        outdir=spec.run_dir, run_number=spec.run_number, tag=spec.tag)
        sim = Simulation(cfg)
        stage = "simulate"
        sim.run()
        stage = "verify"
        res = verify_run(spec.run_dir, society=spec.society, seed=spec.seed,
                         years=spec.years, capacity=spec.population)
        elapsed = time.perf_counter() - t0
        if not res.ok:
            log_lines.append(f"post-run verification failed: {res.reason()}")
            return {"status": "failed", "stage": "verify", "spec": asdict(spec),
                    "error_type": "VerificationError", "error": res.reason(),
                    "traceback": "", "elapsed_seconds": round(elapsed, 3),
                    "log": "\n".join(log_lines)}
        log_lines.append(f"completed in {elapsed:.2f}s")
        return {"status": "completed", "stage": "done", "spec": asdict(spec),
                "elapsed_seconds": round(elapsed, 3),
                "model_version": MODEL_VERSION,
                "outcomes": res.outcomes, "manifest": res.manifest,
                "log": "\n".join(log_lines)}
    except BaseException as e:  # noqa: BLE001 - deliberate: isolate every failure
        elapsed = time.perf_counter() - t0
        tb = traceback.format_exc()
        log_lines.append(tb)
        return {"status": "failed", "stage": stage, "spec": asdict(spec),
                "error_type": type(e).__name__, "error": str(e), "traceback": tb,
                "elapsed_seconds": round(elapsed, 3), "log": "\n".join(log_lines)}


# ---------------------------------------------------------------------------
# batch
# ---------------------------------------------------------------------------

def atomic_write(path: Path, text: str) -> None:
    """Write via a temporary file plus rename, so a crash mid-write leaves the
    previous good file intact rather than a truncated one."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        atomic_write(path, "")
        return
    keys: list[str] = []
    for r in rows:
        for k in r:
            if k not in keys:
                keys.append(k)
    out = [",".join(keys)]
    for r in rows:
        vals = []
        for k in keys:
            v = r.get(k, "")
            v = "" if v is None else str(v)
            vals.append(f'"{v}"' if "," in v else v)
        out.append(",".join(vals))
    atomic_write(path, "\n".join(out) + "\n")


def default_workers(population: int, years: int) -> int:
    """Conservative default: leave a core free, and cap by memory headroom."""
    cpu = os.cpu_count() or 1
    by_cpu = max(1, cpu - 1)
    per_run_mb = estimate_rss_mb(population, years)
    total_mb = _available_memory_mb()
    by_mem = max(1, int((total_mb * 0.6) // max(per_run_mb, 1)))
    return max(1, min(by_cpu, by_mem))


def estimate_rss_mb(population: int, years: int) -> float:
    """Peak RSS per worker, scaled from the measured 100k x 500y figure. Log
    volume held in memory scales with both population and years."""
    return _RSS_PER_100K_500Y_MB * (population / 100_000) * (0.4 + 0.6 * years / 500)


def _available_memory_mb() -> float:
    try:
        with open("/proc/meminfo", encoding="utf-8") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return float(line.split()[1]) / 1024.0
    except Exception:
        pass
    try:
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_AVPHYS_PAGES") / 1e6
    except Exception:
        return 4096.0


def _quarantine(run_dir: Path, batch_root: Path, reason: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = batch_root / "quarantine" / stamp / run_dir.name
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(run_dir), str(dest))
    atomic_write(dest / "QUARANTINE_REASON.txt",
                 f"{datetime.now(timezone.utc).isoformat()}\n{reason}\n")
    return str(dest)


class Batch:
    def __init__(self, out: str, specs: list[RunSpec], workers: int,
                 tag: str, seed_source: str):
        self.root = Path(out)
        self.specs = specs
        self.workers = workers
        self.tag = tag
        self.seed_source = seed_source
        self.batch_id = self.root.name
        for sub in ("runs", "summaries", "logs", "reports"):
            (self.root / sub).mkdir(parents=True, exist_ok=True)
        self.results: dict[str, dict] = {}
        self.started = time.perf_counter()
        self.started_utc = datetime.now(timezone.utc).isoformat()

    # -- status ---------------------------------------------------------
    def status(self) -> dict:
        done = [r for r in self.results.values() if r["status"] in
                ("completed", "verified_existing")]
        failed = [r for r in self.results.values() if r["status"] == "failed"]
        skipped = [r for r in self.results.values() if r["status"] == "verified_existing"]
        elapsed = time.perf_counter() - self.started
        times = [r["elapsed_seconds"] for r in self.results.values()
                 if r["status"] == "completed"]
        mean_rt = sum(times) / len(times) if times else 0.0
        remaining = len(self.specs) - len(self.results)
        eta = remaining * mean_rt / max(self.workers, 1) if mean_rt else float("nan")
        return {
            "batch_id": self.batch_id,
            "total_runs": len(self.specs),
            "completed": len(done),
            "failed": len(failed),
            "verified_existing": len(skipped),
            "pending": remaining,
            "elapsed_seconds": round(elapsed, 1),
            "mean_runtime_seconds": round(mean_rt, 2),
            "eta_seconds": None if mean_rt == 0 else round(eta, 1),
            "storage_bytes": self.storage_bytes(),
            "updated_utc": datetime.now(timezone.utc).isoformat(),
            "runs": {k: {kk: vv for kk, vv in v.items()
                         if kk in ("status", "stage", "elapsed_seconds",
                                   "error_type", "error")}
                     for k, v in sorted(self.results.items())},
        }

    def storage_bytes(self) -> int:
        total = 0
        for p in (self.root / "runs").rglob("*"):
            if p.is_file():
                total += p.stat().st_size
        return total

    def save_status(self) -> None:
        atomic_write(self.root / "batch_status.json",
                     json.dumps(self.status(), indent=2, default=str))

    def record(self, spec: RunSpec, result: dict) -> None:
        self.results[spec.experiment_id] = result
        if result.get("log"):
            atomic_write(self.root / "logs" / f"{spec.experiment_id}.log", result["log"])
        self.save_status()
        self.progress(spec, result)

    def progress(self, spec: RunSpec, result: dict) -> None:
        s = self.status()
        eta = s["eta_seconds"]
        eta_txt = "--" if eta is None else f"{eta/60:.1f}m"
        mark = {"completed": "ok", "verified_existing": "skip", "failed": "FAIL"}[
            result["status"]]
        print(f"[{s['completed']}/{s['total_runs']}] {mark:>4} {spec.experiment_id} "
              f"(society {spec.society}, seed {spec.seed}, "
              f"{result.get('elapsed_seconds', 0):.1f}s) | "
              f"failed {s['failed']} | skipped {s['verified_existing']} | "
              f"elapsed {s['elapsed_seconds']/60:.1f}m | mean "
              f"{s['mean_runtime_seconds']:.1f}s | eta {eta_txt} | "
              f"{s['storage_bytes']/1e6:.0f} MB", flush=True)
        if result["status"] == "failed":
            print(f"       reason: {result.get('error_type')}: "
                  f"{str(result.get('error'))[:200]} (stage {result.get('stage')})",
                  flush=True)

    # -- verification of pre-existing runs -------------------------------
    def check_existing(self, spec: RunSpec, quarantine: bool = True) -> dict | None:
        from .verify import verify_run
        d = Path(spec.run_dir)
        if not d.exists():
            return None
        res = verify_run(spec.run_dir, society=spec.society, seed=spec.seed,
                         years=spec.years, capacity=spec.population)
        if res.ok:
            return {"status": "verified_existing", "stage": "done",
                    "spec": asdict(spec), "elapsed_seconds": 0.0,
                    "outcomes": res.outcomes, "manifest": res.manifest,
                    "log": f"verified existing run at {spec.run_dir}"}
        if quarantine:
            dest = _quarantine(d, self.root, res.reason())
            print(f"       quarantined {spec.experiment_id}: {res.reason()} -> {dest}",
                  flush=True)
        return {"status": "quarantined", "stage": "verify", "spec": asdict(spec),
                "elapsed_seconds": 0.0, "reason": res.reason(),
                "log": f"quarantined: {res.reason()}"}

    # -- main loop -------------------------------------------------------
    def run(self, resume: bool = True, retry_failed: bool = False,
            verify_only: bool = False, quarantine: bool = True) -> dict:
        """Corrupt or incomplete runs are quarantined by default, including under
        --verify-only: output that fails verification must not remain in the
        batch masquerading as valid. Pass quarantine=False for a strictly
        read-only audit."""
        todo: list[RunSpec] = []
        for spec in self.specs:
            existing = self.check_existing(spec, quarantine=quarantine)
            if existing is None:
                todo.append(spec)
                continue
            if existing["status"] == "verified_existing":
                if resume or verify_only:
                    self.record(spec, existing)
                    continue
                todo.append(spec)
            else:  # quarantined or unusable
                if verify_only:
                    self.record(spec, {**existing, "status": "failed",
                                       "error_type": "VerificationError",
                                       "error": existing.get("reason", "")})
                else:
                    todo.append(spec)

        if verify_only:
            self.finalize()
            return self.status()

        if todo:
            self.dispatch(todo)
        self.finalize()
        return self.status()

    def dispatch(self, todo: list[RunSpec]) -> None:
        apply_thread_env()
        if self.workers <= 1:
            for spec in todo:
                self.record(spec, execute(spec))
            return
        ctx = mp.get_context("spawn")
        with ctx.Pool(processes=self.workers, initializer=_worker_init) as pool:
            for result in pool.imap_unordered(execute, todo):
                spec = RunSpec(**result["spec"])
                self.record(spec, result)

    # -- outputs ---------------------------------------------------------
    def absorb_existing_runs(self) -> int:
        """Include runs from earlier invocations in this batch's summaries.

        A batch may be executed in chunks (different seed ranges into the same
        directory). Without this, `finalize` would describe only the seeds of
        the most recent invocation, and the paired contrasts would silently be
        computed over a fraction of the batch. The summary must describe the
        batch on disk, not the invocation that happened to write it last.
        """
        from .verify import verify_run
        known = {Path(r["spec"]["run_dir"]).resolve() for r in self.results.values()}
        added = 0
        runs_root = self.root / "runs"
        if not runs_root.exists():
            return 0
        for d in sorted(runs_root.iterdir()):
            if not d.is_dir() or d.resolve() in known:
                continue
            res = verify_run(str(d))
            if not res.ok:
                continue
            m = res.manifest
            spec = RunSpec(society=m["society"], seed=int(m["seed"]),
                           run_number=int(m["run_number"]), years=int(m["years"]),
                           population=int(m["capacity"]),
                           logging_level=m.get("logging_level", "standard"),
                           tag=m.get("run_tag", "exploratory"), run_dir=str(d))
            self.results[spec.experiment_id] = {
                "status": "verified_existing", "stage": "done",
                "spec": asdict(spec), "elapsed_seconds": 0.0,
                "outcomes": res.outcomes, "manifest": m,
                "log": f"absorbed from an earlier invocation: {d}"}
            added += 1
        return added

    def finalize(self) -> None:
        from . import stats
        from .verify import PRIMARY_OUTCOMES, SECONDARY_OUTCOMES

        absorbed = self.absorb_existing_runs()
        if absorbed:
            print(f"       absorbed {absorbed} run(s) from earlier invocations "
                  f"into this batch's summaries", flush=True)

        outcomes = PRIMARY_OUTCOMES + SECONDARY_OUTCOMES
        summaries = self.root / "summaries"

        run_rows, failures = [], []
        for rid, r in sorted(self.results.items()):
            spec = r["spec"]
            if r["status"] in ("completed", "verified_existing"):
                m = r.get("manifest", {})
                run_rows.append({
                    "experiment_id": rid, "society": spec["society"],
                    "run_number": spec["run_number"], "seed": spec["seed"],
                    "status": r["status"], "years": spec["years"],
                    "population": spec["population"], "tag": spec["tag"],
                    "wall_seconds": m.get("wall_seconds", r.get("elapsed_seconds")),
                    "worker_pid": m.get("worker_pid", ""),
                    "model_version": m.get("model_version", ""),
                    "git_commit": m.get("git_commit", ""),
                    "parameter_set_id": m.get("parameter_set_id", ""),
                    "python_version": m.get("python_version", ""),
                    "numpy_version": m.get("numpy_version", ""),
                    "platform": m.get("platform", ""),
                    "machine": m.get("machine", ""),
                    "started_utc": m.get("started_utc", ""),
                    "completed_utc": m.get("completed_utc", ""),
                    **{k: v for k, v in r.get("outcomes", {}).items()
                       if k not in ("experiment_id", "society", "seed", "run_number")},
                })
            else:
                failures.append({
                    "experiment_id": rid, "society": spec["society"],
                    "seed": spec["seed"], "status": r["status"],
                    "stage": r.get("stage", ""), "error_type": r.get("error_type", ""),
                    "error": str(r.get("error", ""))[:500],
                    "elapsed_seconds": r.get("elapsed_seconds", ""),
                    "traceback": (r.get("traceback", "") or "").replace("\n", " | ")[:1000],
                })

        write_csv(summaries / "run_summary.csv", run_rows)
        write_csv(summaries / "failures.csv", failures)

        records = [{**r} for r in run_rows]
        for rec in records:
            rec["seed"] = int(rec["seed"])
        write_csv(summaries / "arm_summary.csv",
                  stats.arm_summary(records, outcomes) if records else [])
        contrasts, per_seed = (stats.paired_contrasts(records, outcomes)
                               if records else ([], []))
        write_csv(summaries / "paired_contrasts.csv", contrasts)
        write_csv(summaries / "seed_paired_summary.csv", per_seed)
        write_csv(summaries / "shock_response.csv",
                  stats.shock_response(records, outcomes) if records else [])

        times = [r["wall_seconds"] for r in run_rows
                 if isinstance(r.get("wall_seconds"), (int, float))]
        rt = []
        if times:
            import numpy as np
            arr = np.asarray(times, dtype=float)
            for society in sorted({r["society"] for r in run_rows}):
                sub = np.asarray([r["wall_seconds"] for r in run_rows
                                  if r["society"] == society], dtype=float)
                rt.append({"scope": f"society_{society}", "n": int(sub.size),
                           "mean_s": float(sub.mean()), "median_s": float(np.median(sub)),
                           "min_s": float(sub.min()), "max_s": float(sub.max()),
                           "total_s": float(sub.sum())})
            rt.append({"scope": "all", "n": int(arr.size), "mean_s": float(arr.mean()),
                       "median_s": float(np.median(arr)), "min_s": float(arr.min()),
                       "max_s": float(arr.max()), "total_s": float(arr.sum())})
        write_csv(summaries / "runtime_summary.csv", rt)

        st = self.status()
        manifest = {
            "batch_id": self.batch_id,
            "created_utc": self.started_utc,
            "finished_utc": datetime.now(timezone.utc).isoformat(),
            "run_tag": self.tag,
            "societies": sorted({s.society for s in self.specs}),
            "seeds": sorted({s.seed for s in self.specs}),
            "n_seeds": len({s.seed for s in self.specs}),
            "n_runs_planned": len(self.specs),
            "seed_source": self.seed_source,
            "workers": self.workers,
            "years": self.specs[0].years if self.specs else None,
            "population": self.specs[0].population if self.specs else None,
            "logging_level": self.specs[0].logging_level if self.specs else None,
            "completed": st["completed"], "failed": st["failed"],
            "verified_existing": st["verified_existing"],
            "completion_rate": (st["completed"] / len(self.specs)) if self.specs else 0.0,
            "wall_seconds": st["elapsed_seconds"],
            "storage_bytes": st["storage_bytes"],
            "controller_env": {
                "python_version": platform.python_version(),
                "platform": platform.platform(),
                "machine": platform.machine(),
                "cpu_count": os.cpu_count(),
                "thread_env": THREAD_ENV,
                "argv": " ".join(sys.argv),
            },
            "outputs": ["summaries/run_summary.csv", "summaries/arm_summary.csv",
                        "summaries/paired_contrasts.csv",
                        "summaries/seed_paired_summary.csv",
                        "summaries/shock_response.csv", "summaries/failures.csv",
                        "summaries/runtime_summary.csv", "reports/pilot_summary.md"],
            "warning": ("Batch runs are engineering or pilot output unless run_tag "
                        "is 'main'. They are not preregistered results."),
        }
        atomic_write(self.root / "batch_manifest.json",
                     json.dumps(manifest, indent=2, default=str))
        # merge, so extending a batch never renumbers or drops earlier seeds
        merged = load_seed_positions(self.root)
        merged.update(self.seed_positions())
        write_seed_list(self.root, merged)
        self.save_status()
        self.write_report(manifest, records, contrasts)

    def seed_positions(self) -> dict[int, int]:
        return {s.seed: s.run_number for s in self.specs}

    def write_report(self, manifest: dict, records: list[dict],
                     contrasts: list[dict]) -> None:
        from . import stats
        from .verify import PRIMARY_OUTCOMES

        L = [f"# Batch report: {self.batch_id}", ""]
        L.append("> Engineering / pilot output. **Not** a preregistered result. "
                 "Findings are reproducible only under the stated model "
                 "assumptions and parameter ranges.")
        L.append("")
        L.append(f"- Run tag: `{manifest['run_tag']}`")
        L.append(f"- Societies: {', '.join(manifest['societies'])} · "
                 f"seeds: {manifest['n_seeds']} · runs: {manifest['n_runs_planned']}")
        L.append(f"- Scale: {manifest['population']:,} citizens × "
                 f"{manifest['years']} years")
        L.append(f"- Completed {manifest['completed']}/{manifest['n_runs_planned']} "
                 f"({100*manifest['completion_rate']:.1f}%), "
                 f"failed {manifest['failed']}, "
                 f"skipped-verified {manifest['verified_existing']}")
        L.append(f"- Wall time {manifest['wall_seconds']/60:.1f} min on "
                 f"{manifest['workers']} worker(s); storage "
                 f"{manifest['storage_bytes']/1e6:.0f} MB")
        L.append("")

        if not records:
            L.append("No completed runs.")
            atomic_write(self.root / "reports" / "pilot_summary.md", "\n".join(L))
            return

        L.append("## Between-seed variability, by arm")
        L.append("")
        L.append("| Outcome | Arm | n | Mean | SD | MCSE | 95% CI (BCa) |")
        L.append("|---|---|---|---|---|---|---|")
        for row in stats.arm_summary(records, PRIMARY_OUTCOMES):
            L.append(f"| {row['outcome']} | {row['society']} | {row['n']} | "
                     f"{row['mean']:.4f} | {row['sd']:.4f} | {row['mcse']:.4f} | "
                     f"[{row['ci95_low']:.4f}, {row['ci95_high']:.4f}] |")
        L.append("")

        L.append("## Matched-seed paired contrasts (the treatment estimates)")
        L.append("")
        L.append("| Outcome | Contrast | n pairs | Mean diff | SD | MCSE | "
                 "95% CI | P(d>0) | SESOI | P(d>SESOI) |")
        L.append("|---|---|---|---|---|---|---|---|---|---|")
        flagged = []
        for row in contrasts:
            if row["outcome"] not in PRIMARY_OUTCOMES or not row["n_matched_seeds"]:
                continue
            L.append(f"| {row['outcome']} | {row['contrast']} | "
                     f"{row['n_matched_seeds']} | {row['mean_diff']:.4f} | "
                     f"{row['sd_diff']:.4f} | {row['mcse_diff']:.4f} | "
                     f"[{row['ci95_low']:.4f}, {row['ci95_high']:.4f}] | "
                     f"{row['p_diff_gt_0']:.2f} | {row['sesoi']} | "
                     f"{row['p_diff_gt_sesoi']:.2f} |")
            if row.get("precise_but_below_sesoi"):
                flagged.append(row)
        L.append("")

        if flagged:
            L.append("## Precise but not meaningful")
            L.append("")
            L.append("The following contrasts have a 95% interval excluding zero while "
                     "the estimated difference is **smaller than the preregistered "
                     "smallest effect size of interest**. Statistical precision here "
                     "reflects the number of runs, not the importance of the effect.")
            L.append("")
            for row in flagged:
                L.append(f"- `{row['outcome']}` {row['contrast']}: "
                         f"{row['mean_diff']:+.4f} (SESOI {row['sesoi']})")
            L.append("")

        L.append("## Response to stochastic history")
        L.append("")
        L.append("If between-seed SD is near zero **and** outcomes barely correlate "
                 "with shock exposure, a large campaign would be measuring a model "
                 "that hardly responds to its own stochastic history. That is a "
                 "design finding, not a nuisance.")
        L.append("")
        L.append("| Arm | Driver | Outcome | n | Pearson r | Outcome SD |")
        L.append("|---|---|---|---|---|---|")
        for row in stats.shock_response(records, PRIMARY_OUTCOMES):
            r = row["pearson_r"]
            L.append(f"| {row['society']} | {row['driver']} | {row['outcome']} | "
                     f"{row['n']} | " + ("n/a" if r != r else f"{r:+.3f}") +
                     f" | {row['outcome_sd']:.4f} |")
        L.append("")
        L.append("## SESOI comparison")
        L.append("")
        L.append("Preregistered SESOIs are **not** adjusted on the basis of pilot "
                 "results. Any proposed change must be recorded separately, with the "
                 "original values preserved in the audit trail.")
        L.append("")
        for outcome in PRIMARY_OUTCOMES:
            sds = [r["sd"] for r in stats.arm_summary(records, [outcome])]
            if sds:
                thr = stats.SESOI.get(outcome)
                worst = max(sds)
                ratio = (thr / worst) if worst > 0 else float("inf")
                L.append(f"- `{outcome}`: largest between-seed SD {worst:.4f}, "
                         f"SESOI {thr} → SESOI is {ratio:.1f}× the noise SD"
                         if worst > 0 else
                         f"- `{outcome}`: between-seed SD is zero")
        atomic_write(self.root / "reports" / "pilot_summary.md", "\n".join(L) + "\n")


def plan(seeds: list[int], societies: list[str], years: int, population: int,
         workers: int) -> dict:
    """Pre-launch estimate printed before anything is executed."""
    n = len(seeds) * len(societies)
    per_rss = estimate_rss_mb(population, years)
    return {
        "runs": n,
        "workers": workers,
        "estimated_peak_rss_per_worker_mb": round(per_rss, 1),
        "estimated_peak_rss_total_mb": round(per_rss * workers, 1),
        "available_memory_mb": round(_available_memory_mb(), 1),
        "cpu_count": os.cpu_count(),
    }
