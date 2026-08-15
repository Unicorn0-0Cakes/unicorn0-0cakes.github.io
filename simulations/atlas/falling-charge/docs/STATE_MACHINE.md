# Experiment state machine

Version 0.1.0-milestone1. Implemented in `src/app.js:State`.

```
                  ┌──────────────┐
                  │   SETUP      │  choose mode, seed, apparatus profile
                  └──────┬───────┘
                         │ startSession
                  ┌──────▼───────┐
                  │ CALIBRATION  │  every entry must reach a status
                  └──────┬───────┘
                         │ acceptCalibration
                  ┌──────▼───────┐
                  │ PREREGISTER  │  accept or edit exclusion rules  (blind mode: mandatory)
                  └──────┬───────┘
                         │ preregister
              ┌──────────▼──────────┐
   ┌─────────►│    COLLECTING       │◄─────────┐
   │          └──┬───────────────┬──┘          │
   │   spray/    │               │  startTrack │
   │   select    │               ▼             │
   │          ┌──┴──────┐   ┌──────────┐       │
   │          │ IDLE    │   │ TRACKING │       │
   │          └─────────┘   └────┬─────┘       │
   │                             │ stopTrack   │
   │                        ┌────▼─────────┐   │
   │                        │  REVIEWING   │   │  fit shown, derive, decide
   │                        └────┬─────────┘   │
   │                             │ accept / reject / unresolved
   └─────────────────────────────┘─────────────┘
                         │ lockDataset
                  ┌──────▼───────┐
                  │  ANALYSIS    │  candidate lattice, WLS, uncertainty
                  └──────┬───────┘
                         │ lockAnalysis   (irreversible)
                  ┌──────▼───────┐
                  │   LOCKED     │  primary result fixed
                  └──────┬───────┘
                         │ reveal         (irreversible, requires confirmation)
                  ┌──────▼───────┐
                  │  REVEALED    │  ground truth; all further analysis is
                  └──────┬───────┘  tagged OUTCOME-AWARE EXPLORATORY
                         │ export
                  ┌──────▼───────┐
                  │  REPORTED    │
                  └──────────────┘
```

## Invariants enforced in code

1. `reveal` is unreachable unless `LOCKED`.
2. Truth values are unreadable by any renderer before `REVEALED`; the guard is
   in the data layer, not the view (`ARCHITECTURE.md` §4).
3. A protocol amendment is only possible in `COLLECTING` or `ANALYSIS`, and
   always records whether an estimate had been viewed.
4. `lockAnalysis` deep-freezes the analysis object.
5. Transitions out of `LOCKED` and `REVEALED` do not exist. There is no
   "unreveal".
6. `COLLECTING` cannot be entered without a completed calibration record and,
   in blind mode, a preregistered rule set.

## Currently implemented

`SETUP → CALIBRATION → PREREGISTER → COLLECTING ⇄ TRACKING ⇄ REVIEWING →
ANALYSIS → LOCKED → REVEALED → REPORTED` — all transitions above are
implemented in this build. Modes F and G are not, so the batch and
fixed-dataset entry points into `ANALYSIS` do not exist yet.
