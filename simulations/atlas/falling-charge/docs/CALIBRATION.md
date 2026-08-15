# Calibration

Version 0.1.0-milestone1. Implemented in `src/calibration.js`.

Every calibration entry carries: **value, unit, uncertainty (1σ), method,
source, timestamp, status, notes.** An entry with no uncertainty is not a
calibration and is rejected by the form.

Status is one of `not started` · `provisional` · `calibrated` ·
`not yet calibrated` · `expired`.

---

## 1. Microscope scale

The user must relate reticle divisions (or pixels) to metres. The instrument
provides a stage micrometer with a **nominal** division spacing; the true
spacing differs by the session's optical gain error (`APPARATUS_MODEL.md` §3).

Method offered: count `k` divisions against the micrometer, enter the count and
its reading uncertainty. The resulting scale uncertainty is `σ_scale/scale`.

**Why it matters most after viscosity:** `v ∝ scale`, `r ∝ √v ∝ √scale`, so
`q ∝ r·v ∝ scale^{3/2}`… and the field-on velocity also scales, giving
`q ∝ scale²` overall. A 1 % scale error is a 2 % charge error, unaffected by
sample size.

## 2. Plate separation

Entered by the user with an uncertainty, or accepted from the apparatus
nameplate (which carries the nameplate's own error). `q ∝ d`, so this is a
direct 1:1 systematic.

## 3. Voltage

The displayed voltage differs from the true voltage
(`APPARATUS_MODEL.md` §2.1). The user may:

- accept the display at face value (records `status: not yet calibrated`), or
- perform a two-point calibration against the instrument's reference source,
  which reveals gain and offset to within the reference's own uncertainty.

`q ∝ 1/V`, so this is also a direct systematic.

## 4. Temperature

Read from the sensor, which has a fixed session bias. Enters through `η(T)`.
Since `q ∝ η^{3/2}` and `∂η/∂T · T/η ≈ 0.75` near room temperature, a 1 K error
gives roughly `1.5 × 0.75 × (1/293) ≈ 0.38 %` in `q`. Small but not nothing.

## 5. Pressure

Read from the sensor. Enters through `ρ_air` (negligible) and through `λ` in the
slip correction (small). A 1 % pressure error moves `C_c` by well under 0.1 % at
default radii, hence `q` by a similar amount. Ranked low in the budget — but the
instrument computes the ranking rather than asserting it.

## 6. Timing

- Modern: the gate's quantisation and jitter are stated by the apparatus and
  accepted; the user records them.
- Historical: the user may calibrate their own reaction time against a reference
  interval, which is the historically correct thing to have done.

## 7. Level and alignment

A spirit-level readout with a resolution. Correcting the tilt reduces it toward
zero but not to zero.

---

## 8. Calibration record

The record is versioned. Editing a calibration after data collection has begun
does **not** overwrite it: it creates a new version, and every measurement
records which version was in force when it was taken. The analysis therefore
knows that measurements 1–6 used scale v1 and 7–20 used scale v2, and says so.

The final report reproduces the whole record, all versions.

## 9. Gate

Blind mode will not permit `Lock analysis` until every calibration entry has a
status other than `not started`. `not yet calibrated` is an acceptable, recorded
choice — the point is that it is a *declared* choice, and it appears in the
report.
