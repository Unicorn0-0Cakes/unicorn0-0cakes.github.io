# UX flow and wireframe

Version 0.1.0-milestone1.

---

## 1. Layout (desktop, ≥ 1100 px)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ORBITAL chrome bar (shared, injected by assets/orbital.js)                 │
├───────────────────────────────────────────────────────────────────────────┤
│ FC bench bar:  mode · seed · sim clock · state · speed · pause             │
├──────────────────────────┬──────────────────────────┬─────────────────────┤
│ A. APPARATUS CHAMBER     │ B. MICROSCOPE            │ C. CONTROLS         │
│                          │                          │                     │
│  ┌────────────────────┐  │  ┌────────────────────┐  │  Atomiser           │
│  │ ═══ upper plate ═══│  │  │   ·        ┼       │  │  Droplet selector   │
│  │  ·  ·   ·          │  │  │      ○             │  │  Focus              │
│  │    ·  ●  ·         │  │  │  ─ ─ ─ ─ ─ ─ ─ ─   │  │  Illumination       │
│  │  ·      ·   ·      │  │  │      reticle       │  │  ─────────────      │
│  │ ═══ lower plate ═══│  │  │  MAGNIFIED ×420    │  │  Field on / off     │
│  └────────────────────┘  │  └────────────────────┘  │  Polarity  + / −    │
│  polarity  +  (upper)    │  track: 12.0 s, 240 pts  │  Voltage   [ 152.0] │
│  V 152.0 V   E 25.3 kV/m │  v̂ = −2.10e-5 ± 2.2e-6  │  Fine  −5 … +5      │
│  T 293.4 K   p 101.29 kPa│  R² 0.981                │  Ionise pulse       │
│                          │                          │  Start / Stop track │
├──────────────────────────┴──────────────────────────┴─────────────────────┤
│ D. DESK — tabs: Notebook · Raw · Derived · Calibration · QC · Analysis ·  │
│                 Methods                                                    │
│ ────────────────────────────────────────────────────────────────────────  │
│ (tab content)                                                              │
└───────────────────────────────────────────────────────────────────────────┘
```

Below 1100 px the three stage columns stack; below 720 px the desk tabs become a
select element. Nothing is hidden on small screens — it is reordered.

## 2. The loop, and where the interface refuses to shortcut

| step | UI | refusal |
|---|---|---|
| 1 calibrate | Calibration tab | cannot enter COLLECTING with an untouched record |
| 2 preregister | modal, blind mode | cannot collect without accepting rules |
| 3 spray | Atomiser button | — |
| 4 find a droplet | click a droplet in the chamber, or `Tab`+`Enter` through a list | — |
| 5 track field-off | Field OFF, Start/Stop track | Start is disabled until the field has settled 20 τ |
| 6 fall velocity | fit shown with residuals | — |
| 7 radius | shown with the equation, the solver status, the assumptions | never shown without a completed field-off fit |
| 8 apply voltage | voltage controls | — |
| 9 track field-on | Start/Stop track | disabled if no field-off fit exists for this droplet |
| 10 charge | shown with the substituted equation | **impossible to reach from voltage alone** |
| 11 accept/reject | Decide panel | reject requires a reason; no default is preselected |
| 12 repeat | — | — |
| 13 lock dataset | Analysis tab | warns how many measurements are unresolved |
| 14 infer | candidate-lattice + regression, shown together | — |
| 15 compare models | **not implemented** — the panel says so | — |
| 16 reveal | red-bordered confirm dialog, two-step | requires locked analysis |
| 17 review | reveal panel | — |
| 18 export | Report tab | — |

Step 10 is the specification's central requirement and is enforced structurally:
`analysis.chargeFromMeasurement()` takes two observation ids and throws if either
is missing. There is no code path from a voltage reading to a charge.

## 3. Keyboard

| key | action |
|---|---|
| `Space` | pause / resume |
| `1`–`4` | speed 1× 2× 5× 10× |
| `A` | atomise |
| `F` | field on/off |
| `P` | polarity |
| `T` | start/stop track |
| `[` `]` | voltage −/+ 5 V |
| `,` `.` | fine voltage −/+ 0.1 V |
| `N` / `M` | previous / next droplet |
| `I` | ionisation pulse |
| `?` | shortcut list |

Every action is also a labelled, focusable button. No action requires dragging.

## 4. What is deliberately not in the interface

- Any indicator of how close the current estimate is to anything.
- A "correct answer" affordance before reveal.
- A single quality score.
- A "delete measurement" control.
- Celebration of any kind.
