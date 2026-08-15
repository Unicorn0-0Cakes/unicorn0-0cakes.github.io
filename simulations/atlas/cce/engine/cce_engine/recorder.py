"""Output recorder: tiered logging, manifests, checksums.

Logging levels (docs/DATA_DICTIONARY.md):
  minimal   annual aggregates + assessments + manifest
  standard  + all rare/critical events, all leadership and classification
            changes, all safeguarding events, a reproducible citizen panel,
            five-year full-population distribution snapshots, checkpoints
  forensic  + per-citizen annual state for the whole population

Nothing is silently discarded: whatever is dropped is a declared retention
choice recorded in the run manifest.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone

import numpy as np

try:  # optional, used when available
    import pyarrow  # noqa: F401
    import pyarrow.parquet  # noqa: F401
    HAVE_PARQUET = True
except Exception:  # pragma: no cover
    HAVE_PARQUET = False


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Recorder:
    def __init__(self, outdir: str, experiment_id: str, level: str = "standard"):
        self.outdir = outdir
        self.experiment_id = experiment_id
        self.level = level
        os.makedirs(outdir, exist_ok=True)
        self.annual: list[dict] = []
        self.events: list[dict] = []
        self.assessments: list[dict] = []
        self.deaths: list[dict] = []
        self.panel: list[dict] = []
        self.snapshots: list[dict] = []
        self.forensic: list[dict] = []
        self.checkpoints: list[str] = []
        self.retention = {
            "level": level,
            "annual_aggregates": True,
            "events": level in ("standard", "forensic"),
            "citizen_panel": level in ("standard", "forensic"),
            "five_year_snapshots": level in ("standard", "forensic"),
            "per_citizen_annual": level == "forensic",
        }

    # -- capture ------------------------------------------------------------
    def year(self, row: dict) -> None:
        self.annual.append(row)

    def event(self, row: dict) -> None:
        if self.retention["events"]:
            self.events.append(row)

    def assessment(self, row: dict) -> None:
        self.assessments.append(row)

    def death(self, row: dict) -> None:
        if self.retention["events"]:
            self.deaths.append(row)

    def snapshot(self, row: dict) -> None:
        if self.retention["five_year_snapshots"]:
            self.snapshots.append(row)

    def panel_rows(self, rows: list[dict]) -> None:
        if self.retention["citizen_panel"]:
            self.panel.extend(rows)

    # -- write --------------------------------------------------------------
    def _write_table(self, name: str, rows: list[dict]) -> list[str]:
        """Write a table and return EVERY file produced.

        When pyarrow is available a table is written in both formats. Both must
        be checksummed: returning only one would leave the other unverified, so
        corruption of the unlisted copy would pass verification unnoticed.
        """
        if not rows:
            return []
        path = os.path.join(self.outdir, f"{name}.csv")
        keys: list[str] = []
        for r in rows:
            for k in r:
                if k not in keys:
                    keys.append(k)
        with open(path, "w", encoding="utf-8") as f:
            f.write(",".join(keys) + "\n")
            for r in rows:
                f.write(",".join("" if r.get(k) is None else str(r.get(k)) for k in keys) + "\n")
        if HAVE_PARQUET:
            import pyarrow as pa
            import pyarrow.parquet as pq
            table = pa.Table.from_pylist([{k: r.get(k) for k in keys} for r in rows])
            ppath = os.path.join(self.outdir, f"{name}.parquet")
            pq.write_table(table, ppath, compression="zstd")
            return [path, ppath]
        return [path]

    def finalize(self, manifest: dict) -> dict:
        files = {}
        for name, rows in [("annual", self.annual), ("events", self.events),
                           ("assessments", self.assessments), ("deaths", self.deaths),
                           ("panel", self.panel), ("snapshots", self.snapshots),
                           ("forensic", self.forensic)]:
            for path in self._write_table(name, rows):
                ext = os.path.splitext(path)[1].lstrip(".")
                key = name if ext == "csv" else f"{name}_{ext}"
                files[key] = {"path": os.path.basename(path),
                              "table": name,
                              "format": ext,
                              "rows": len(rows),
                              "sha256": _sha256(path),
                              "bytes": os.path.getsize(path)}
        manifest = dict(manifest)
        manifest["files"] = files
        manifest["retention"] = self.retention
        manifest["written_utc"] = datetime.now(timezone.utc).isoformat()
        mpath = os.path.join(self.outdir, "manifest.json")
        with open(mpath, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, default=str)
        manifest["manifest_sha256"] = _sha256(mpath)
        return manifest


def result_digest(annual: list[dict]) -> str:
    """Order-independent digest of the numeric output, used by determinism tests."""
    h = hashlib.sha256()
    for row in annual:
        for k in sorted(row):
            v = row[k]
            if isinstance(v, (int, np.integer)):
                h.update(f"{k}={int(v)};".encode())
            elif isinstance(v, (float, np.floating)):
                h.update(f"{k}={float(v):.9g};".encode())
            else:
                h.update(f"{k}={v};".encode())
    return h.hexdigest()
