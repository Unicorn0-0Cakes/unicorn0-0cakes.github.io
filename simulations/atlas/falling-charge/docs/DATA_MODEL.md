# Data model

Version 0.1.0-milestone1. Implemented in `src/persistence.js`.

Raw and derived data are stored in separate collections and derived values are
always recomputable from raw + method version. Nothing in the schema permits
overwriting a raw observation.

---

## Experiment

```jsonc
{
  "experimentId": "FC-20260802-8F3A",
  "seed": "millikan-1913",
  "modelVersion": "0.1.0-milestone1",
  "softwareVersion": "0.1.0-milestone1",
  "gitCommit": "e49d8bf",          // baked at build; "unknown" if unavailable
  "mode": "blind",                  // guided|blind|historical|modern|uncertainty|analyst|batch
  "apparatusProfile": "modern",
  "createdAt": "2026-08-02T18:04:11Z",
  "physics": {
    "slipModel": "allen-raabe-1982",
    "integrator": "exponential",    // exponential|terminal
    "dtPhys": 0.002,
    "brownian": true
  },
  "syntheticChargeModel": null,     // or {type:"F-uniform", fraction:0.15}
  "streams": { /* see REPRODUCIBILITY.md */ },
  "revealed": false,
  "lockedAt": null
}
```

## Droplet

Public fields as in `DROPLET_MODEL.md` §1. The `truth` sub-object is stored in a
**separate object store** (`truth`), keyed by droplet id, and the analysis
module is never passed a reference to it. See `ARCHITECTURE.md` §4.

## RawObservation — immutable

```jsonc
{
  "obsId": "OBS-0007",
  "dropletId": "D-0003",
  "kind": "field-off" | "field-on",
  "tStart": 412.220, "tEnd": 424.180,        // simulated seconds
  "samples": [[t, y], ...],                   // metres, as recorded
  "instrument": {
    "vDisplay": 0.0, "polarity": 1, "fieldOn": false,
    "tempRead": 293.4, "pressRead": 101290,
    "focusSet": 0.0012, "illumination": 0.8
  },
  "calibrationVersion": 2,
  "protocolVersion": 1,
  "flags": ["terminal_velocity_not_reached"],
  "createdAt": "..."
}
```

`samples` is written once. There is no update path.

## DerivedMeasurement — recomputable, versioned

```jsonc
{
  "measId": "M-0004",
  "dropletId": "D-0003",
  "fallObsId": "OBS-0007",
  "fieldObsId": "OBS-0008",
  "method": { "name": "combined-fall-rise", "version": "1.0",
              "slipModel": "allen-raabe-1982" },
  "vFall": 3.81e-5, "seVFall": 1.9e-6,
  "vField": -2.10e-5, "seVField": 2.2e-6,
  "radius": 4.93e-7, "uRadius": 1.4e-8,
  "charge": -3.19e-19, "uCharge": 2.6e-20,
  "solver": { "iterations": 41, "residual": 3.1e-25, "converged": true },
  "environment": { "eta": 1.8142e-5, "rhoAir": 1.2033, "lambda": 6.50e-8,
                   "Cc": 1.1523, "Kn": 0.1318 },
  "quality": { /* every indicator in EXCLUSION_POLICY.md §1 */ },
  "status": "accepted",
  "rejectionReason": null,
  "decisionAt": "...", "followedPreregRule": true,
  "notes": ""
}
```

Recomputing with a different method **appends** a new DerivedMeasurement
referencing the same raw observations. The previous one is retained and the
analysis records which method version it consumed.

## ProtocolVersion

```jsonc
{ "version": 2, "createdAt": "...", "rules": {...}, "previous": 1,
  "reason": "Focus threshold too strict; discarding usable droplets.",
  "measurementsAtTime": 6, "estimateViewedBefore": false }
```

## NotebookEntry

```jsonc
{ "entryId": "N-0042", "at": "...", "simTime": 431.2, "auto": true,
  "kind": "voltage_change", "dropletId": "D-0003",
  "text": "V_display 0 → 152.0 V, polarity +",
  "fields": { "observation": "", "prediction": "", "interpretation": "",
              "uncertaintyConcern": "" } }
```

## Analysis — immutable once locked

```jsonc
{ "analysisId": "A-0001", "lockedAt": "...", "locked": true,
  "inputMeasurementIds": [...], "excludedIds": [...],
  "method": "candidate-lattice+wls", "methodVersion": "1.0",
  "eHat": 1.61e-19, "uRandom": 4.1e-21, "uSystematic": null,
  "ci": [1.53e-19, 1.69e-19], "ciLevel": 0.68,
  "chi2": 12.4, "dof": 13, "assignments": [...],
  "outcomeAware": false }
```

After `locked: true`, any write is rejected by the persistence layer and a new
analysis object is created with `outcomeAware: true` if the reveal has occurred.

## Storage

IndexedDB, database `falling-charge`, object stores: `experiments`, `droplets`,
`truth`, `rawObservations`, `derivedMeasurements`, `protocols`, `notebook`,
`analyses`, `calibrations`.

**Current build:** the schema above is what the export produces, but persistence
is **in-memory with a `localStorage` snapshot**, not IndexedDB. This is a
Milestone 5 gap recorded in `LIMITATIONS.md` L-8 and `RISK_REGISTER.md` R-T7.
