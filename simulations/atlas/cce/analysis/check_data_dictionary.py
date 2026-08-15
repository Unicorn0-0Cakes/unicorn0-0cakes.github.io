"""Fail if the engine emits a column that docs/DATA_DICTIONARY.md does not document.

Keeps the dictionary honest without hand-maintaining it. Run:
    python3 analysis/check_data_dictionary.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "engine"))

from cce_engine.kernel import RunConfig, Simulation  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def main() -> int:
    res = Simulation(RunConfig(society="A", seed=3, years=12, capacity=1500,
                               outdir="/tmp/cce_dict", panel_size=20)).run()
    with open(os.path.join(ROOT, "docs", "DATA_DICTIONARY.md"), encoding="utf-8") as f:
        doc = f.read()

    missing = {}
    for table, rows in [("annual", res.annual), ("assessments", res.assessments),
                        ("events", res.events)]:
        cols = sorted({k for r in rows for k in r})
        gaps = [c for c in cols if f"`{c}`" not in doc]
        if gaps:
            missing[table] = gaps

    if missing:
        for t, cols in missing.items():
            print(f"UNDOCUMENTED in {t}: {', '.join(cols)}")
        return 1
    print("data dictionary complete: every emitted column is documented")
    return 0


if __name__ == "__main__":
    sys.exit(main())
