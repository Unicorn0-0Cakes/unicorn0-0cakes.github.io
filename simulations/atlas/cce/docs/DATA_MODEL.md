# Data Model

## 1. Entity relationships

```
                       ┌──────────────────┐
                       │   Experiment     │  experiment_id (CCE-{A|B|C}-{nnnn})
                       │  (one run)       │  society, run_number, seed,
                       └────────┬─────────┘  model_version, git_commit,
                                │            parameter_set_id, tag, status
              ┌─────────────────┼──────────────────┬───────────────────┐
              │                 │                  │                   │
      ┌───────▼──────┐  ┌───────▼───────┐  ┌───────▼──────┐   ┌────────▼───────┐
      │ AnnualRow    │  │ Assessment    │  │ Event        │   │ Checkpoint     │
      │ (1 per year) │  │ (1 per cycle) │  │ (rare/crit.) │   │ (every k yrs)  │
      └──────────────┘  └───────┬───────┘  └──────┬───────┘   └────────────────┘
                                │                 │
                        ┌───────▼───────┐  categories: environment,
                        │ Snapshot      │  government, safeguarding,
                        │ (percentiles) │  cognition, population, health
                        └───────────────┘

      ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
      │  Citizen     │───────►│  Occupation  │        │  Government  │
      │  cid, slot   │  works │  24 sectors  │        │  president + │
      └──┬────┬──────┘        └──────────────┘        │  assembly    │
         │    │                                       └──────┬───────┘
         │    │ mother/father (cid)                          │ represents
         │    └──────────────► Citizen                       │
         │ lives in                                   ┌──────▼───────┐
         ▼                                            │   IQ Band    │
   ┌──────────────┐    ┌───────────────┐              │ (configurable│
   │  Housing     │    │ SupportLevel  │              │  boundaries) │
   │  9 types     │    │ 0..8          │              └──────────────┘
   └──────────────┘    └───────────────┘

   PanelRow (1 per panel citizen per year)  ──►  Citizen
   DeathRow (1 per death, panel or forensic) ──►  Citizen
```

## 2. Storage layout

```
runs/
  CCE-A-0001/
    manifest.json        provenance, retention record, per-file SHA-256
    annual.parquet       one row per simulated year (~70 columns)
    assessments.parquet  one row per 5-year assessment cycle
    snapshots.parquet    distribution percentiles per cycle
    events.parquet       rare and critical events
    deaths.parquet       death records (panel; all deaths in forensic mode)
    panel.parquet        one row per panel citizen per year
    checkpoints/
      year_0050.npz ...  resumable state
batches/
  BATCH-<id>/manifest.json, index.parquet, failures.parquet
```

Formats: **Parquet** for large tabular output (falls back to CSV when pyarrow is
unavailable), **JSON** for manifests, **CSV** for small human-readable tables, SHA-256
checksums for every file.

## 3. In-memory representation

Structure-of-arrays, preallocated to `population_cap`:

* `State.<field>`: one NumPy array per field (see `state.FIELDS`, 50 fields).
* `State.latent`: `(capacity, 11)` float32 — the latent cognitive profile.
* A free-slot stack makes the population cap structural: a birth cannot occur without a
  free slot, and a death is the only thing that creates one.

Per-citizen memory ≈ 250 bytes → 100,000 citizens ≈ 25 MB; measured peak RSS for a
500-year run at 100,000 citizens is 554 MB, dominated by accumulated log rows rather than
by agent state.

## 4. Keys and joins

| Table | Key | Joins |
|---|---|---|
| annual | (experiment_id, year) | manifest |
| assessments / snapshots | (experiment_id, year) | annual on year |
| events | (experiment_id, year, type, seq) | annual on year; citizen via cid |
| panel | (experiment_id, cid, year) | citizen history; annual on year |
| deaths | (experiment_id, cid) | panel on cid |

`cid` is globally unique within a run and assigned deterministically, so panel and event
rows can be joined into complete individual life histories for the Citizen Inspector.
