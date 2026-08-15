# Apparatus model

Version 0.1.0-milestone1. Implemented in `src/apparatus.js` (rendering) and
`src/calibration.js` (the instrument's imperfections).

---

## 1. Geometry

A vertical observation chamber, two horizontal parallel conducting plates.

| element | symbol | default | unit | notes |
|---|---|---|---|---|
| plate separation | `d` | 6.00 × 10⁻³ | m | true value; the *displayed* value carries the apparatus's calibration error |
| chamber width (drawn) | — | 8.0 × 10⁻³ | m | |
| entry aperture | — | centre of upper plate | | droplets enter from above |
| illuminated region height | — | 4.0 × 10⁻³ | m | centred between plates |
| microscope field of view | — | 1.00 × 10⁻³ | m across | |
| reticle major divisions | — | 1.0 × 10⁻⁴ | m | 10 divisions across the field |
| depth of field `w` | — | 1.5 × 10⁻⁴ | m | |

The plates are drawn as an instrument: brass faces, a visible gap, the polarity
marked by **glyph and label** (`+` / `−` and the words) as well as colour, and
the field direction shown by hairline arrows whose density scales with `|E|`.

---

## 2. Electrical

- `V_plate` is the **upper minus lower** potential, volts, sign convention as in
  `PHYSICS_MODEL.md` §1.
- Coarse control 0–600 V; fine control ±5 V with 0.1 V steps.
- Polarity switch inverts the sign.
- Field on/off is a relay: off sets `V_plate = 0` exactly and is what Procedure 1
  uses. It is *not* the same as setting the dial to zero, which retains the
  displayed reading; the distinction is preserved because it is a real one.

### 2.1 Voltage error model

The *true* voltage applied differs from the displayed reading:

```
V_true = V_display · (1 + g_V) + o_V + drift(t) + noise
```

| term | modern mode | historical mode | teaching mode |
|---|---|---|---|
| gain error `g_V` | ±0.002 | ±0.02 | ±0.005 |
| offset `o_V` | ±0.1 V | ±2 V | ±0.5 V |
| drift | 0.02 % h⁻¹ random walk | 0.5 % h⁻¹ | 0.1 % h⁻¹ |
| reading noise | 0.05 V rms | 1 V (needle) | 0.1 V |
| display resolution | 0.1 V | 5 V | 1 V |

`g_V` and `o_V` are drawn **once per session** from the `apparatus` stream and
held fixed. They are systematic, not random: measuring more droplets does not
average them away. This is the mechanism behind H4.

**Not yet calibrated** — these magnitudes are plausible instrument
specifications, not values read from a data sheet for any real apparatus.

---

## 3. Optical

- **Reticle scale error.** The user calibrates pixels/divisions to metres. The
  true division spacing differs from nominal by a gain drawn once per session
  (`±0.5 %` modern, `±2 %` historical). Since `v ∝ scale` and `q ∝ r·v ∝ scale²`,
  a 1 % scale error produces a 2 % charge error — the second-largest systematic
  after viscosity.
- **Focus** as in `DROPLET_MODEL.md` §4.
- **Illumination** brightness affects visibility threshold only.

---

## 4. Environment

| sensor | true value | sensor bias | resolution |
|---|---|---|---|
| temperature | 293.15 K, slow drift ±0.4 K | ±0.3 K (modern), ±1.5 K (historical) | 0.1 K / 0.5 K |
| pressure | 101 325 Pa, slow drift ±150 Pa | ±120 Pa (modern), ±600 Pa (historical) | 10 Pa / 100 Pa |

Sensor biases are again drawn once per session and held. The analysis uses the
**read** values, so a biased thermometer propagates into `η` and into `ê`.

---

## 5. Timing

| mode | model |
|---|---|
| modern | digital gate, quantisation 1 ms, jitter 0.5 ms rms |
| teaching | digital gate, quantisation 10 ms |
| historical | human stopwatch: reaction-time bias `μ = 180 ms` on start and stop with `σ = 60 ms`, partially cancelling on the interval |

Historical mode's reaction time is the classic case where a *bias* largely
cancels (both ends delayed) while the *variance* does not. The instrument makes
this visible instead of asserting it.

**Not yet calibrated** — reaction-time figures are typical laboratory values,
not sourced.

---

## 6. Level and alignment

A small tilt `θ` (default drawn ±0.3°) rotates gravity relative to the tracking
axis, so the measured vertical velocity is `v cos θ` and a lateral drift `v sin θ`
appears. At 0.3° the velocity error is 1.4 × 10⁻⁵ — negligible — but the lateral
drift is visible and is the cue that lets the user *notice* the tilt. Modelled
because "the apparatus is not level" is a real and commonly missed systematic.

**Implemented in the state; the velocity-projection term is currently applied,
the lateral drift is not yet rendered.** Recorded in `LIMITATIONS.md` L-4.

---

## 7. Ionisation source

A switchable source above the chamber. Firing it exposes visible droplets to a
pulse; each has probability `p_pulse` (default 0.25) of a charge change per
pulse. Modelled as a discrete event only — no continuous ionisation field.

---

## 8. Apparatus modes

The four apparatus profiles (`modern`, `teaching`, `historical`, `ideal`) select
the error magnitudes above. `ideal` sets every instrument error to zero and is
used by the validation suite for noiseless-recovery tests; it is available in
the interface but is labelled `IDEAL APPARATUS — not a physical instrument`.
