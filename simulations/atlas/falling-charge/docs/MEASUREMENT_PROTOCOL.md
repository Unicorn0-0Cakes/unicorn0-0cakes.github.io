# Measurement protocol

Version 0.1.0-milestone1. Implemented in `src/measurement.js`.

---

## 1. The loop

```
calibrate → spray → find a droplet → focus → track (field off)
   → fit fall velocity → apply field → track again
   → fit field-on velocity → derive radius and charge
   → accept or reject, with a reason → repeat
   → lock the dataset → infer e → compare models → reveal → report
```

The interface will not compute a charge from a voltage alone. A charge requires
a field-off fall measurement and a field-on measurement on the *same droplet*,
because that is what the physics requires (`PHYSICS_MODEL.md` §4.2).

---

## 2. Tracking and velocity fitting

A measurement window is opened by the user (`Start track`) and closed by the
user (`Stop track`). While open, the tracker records `(t, y)` samples at 20 Hz
of simulated time, taken from the physics state, with:

- **position quantisation** from the reticle-reading model (modern: automated
  centroid, `σ_pos = 0.4 µm`; historical: eye against a reticle line, so
  positions are recorded only at division crossings),
- **timing quantisation and jitter** from `APPARATUS_MODEL.md` §5.

The velocity is then obtained by **ordinary least squares** of `y` on `t`:

```
v̂ = Σ(tᵢ − t̄)(yᵢ − ȳ) / Σ(tᵢ − t̄)²

SE(v̂) = √[ Σ ε̂ᵢ² / ((N−2) Σ(tᵢ − t̄)²) ]
```

Reported alongside: `N` samples, duration, residual RMS, R², and the residual
series itself, which is stored raw.

**The reported standard error is not this one.** The residuals are a random
walk, not independent noise, so the OLS expression above understates the true
uncertainty by a factor of 13 to 50. The instrument reports

```
se = max( se_OLS , √(2 D̂ / T) )
```

with `D̂` estimated from the residual increments (`BROWNIAN_MOTION.md` §3).
`se_OLS` is retained and displayed alongside, because the size of the gap is one
of the more useful things this apparatus can show a user.

### 2.1 Terminal-velocity confidence

A quadratic is also fitted, but the **t-statistic on its coefficient is not
usable** and the instrument says so. Measured on 3000 simulated tracks of pure
drift plus diffusion with no acceleration whatsoever, the median `|t|` is **8.0**
and the 99th percentile is 33 — the textbook `|t| > 2` rule would reject 87 % of
perfectly settled droplets. The same correlation that inflates the OLS standard
error inflates this statistic.

The criterion actually used compares the *size* of the implied curvature with
the observed noise:

```
amplitude = |c| (T/2)²          ratio = amplitude / residual RMS
```

The null distribution of that ratio has median 1.7 and 99th percentile 7.2, so
the default threshold of 8.0 falsely rejects about 1 % of settled droplets. Both
numbers are asserted in `tests/test-endtoend.js` rather than assumed. In practice this catches
measurements started within a few `τ` of a voltage change — the instrument
enforces a settling wait of `20 τ` before a track can start, and warns if the
user overrides it.

---

## 3. Procedure 1 — field-off fall

Field relay **off** (`V_plate = 0` exactly). Track. Fit `v_f`.
Then invert for radius (`PHYSICS_MODEL.md` §4.1), numerically if slip correction
is enabled.

The panel shows: the measured values, the equation with the numbers substituted,
the solver's iteration count and residual, the propagated uncertainty, and the
list of assumptions active (`ρ_oil`, `η(T)`, slip coefficient set, `g`).

The user is never simply handed a radius.

## 4. Procedure 2 — balanced suspension

The user adjusts `V_plate` until the droplet is approximately stationary and
declares a **balance criterion** before starting, consisting of:

- maximum permitted `|v̂|`,
- minimum observation duration,
- whether zero must lie inside the fitted `v̂ ± k·SE(v̂)` interval, and `k`.

"Stationary" is a statement about a finite interval in the presence of diffusion.
The instrument refuses to record a balance without a declared criterion, and
records the criterion with the measurement.

## 5. Procedure 3 — terminal rise

Field applied so the droplet rises. Track. Fit. `v_s < 0` in the sign convention
of `PHYSICS_MODEL.md` §4.2.

**Preferred procedure.** Two well-conditioned velocity measurements beat one
null-hunt.

## 6. Procedure 4 — slowed fall

Field applied upward but insufficient to reverse. `0 < v_s < v_f`. Same
inversion. Note that as `v_s → v_f` the charge tends to zero and the *relative*
uncertainty diverges; the instrument flags `poor_field_response` when
`(v_f − v_s) < 3·√(SE_f² + SE_s²)`.

## 7. Procedure 5 — charge step

Observe the same droplet's field-on velocity before and after a charge event,
with the same `V_plate` and the same `v_f`. Gives `Δq` (`PHYSICS_MODEL.md` §4.3).

**Forward model implemented; the Δq analysis route is not implemented.** Charge
events are recorded and flagged, so the data to do this exist, but no estimator
consumes them yet.

---

## 8. What is stored

Every measurement stores, immutably:

- the full `(t, y)` sample series as recorded, before any fit
- the apparatus settings in force, as *read from the instrument* (not the truth)
- the environment readings, as *read*
- the calibration record version in force
- the fitted quantities and the fit diagnostics
- the derived quantities **and the analysis-method version that produced them**

Derived values are recomputable. Raw samples are never recomputed, never
overwritten, and never deleted — including for rejected measurements. The
storage layer has no delete path for raw observations; the only way to remove
one is to discard the entire experiment.
