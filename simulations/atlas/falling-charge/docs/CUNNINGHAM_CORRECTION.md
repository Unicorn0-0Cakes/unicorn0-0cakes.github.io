# The Cunningham slip correction

Version 0.1.0-milestone1. Implemented in `src/physics.js:slipCorrection()`.

---

## 1. Why it is needed

Stokes' drag law assumes the surrounding gas is a continuum — that the sphere is
much larger than the distance a gas molecule travels between collisions. An oil
droplet of radius 0.5 µm in air at atmospheric pressure is only about eight mean
free paths across. Gas molecules "slip" past its surface, the drag is *less*
than Stokes predicts, and a droplet falls faster than the continuum law says.

Uncorrected, this makes the inferred radius too large, and therefore the
inferred charge too large. It is the correction that Millikan himself had to
work out, and getting it wrong is the origin of the best-known systematic in the
history of this experiment.

The correction is applied as

```
F_drag = 6 π η r v / C_c        with   C_c ≥ 1
```

---

## 2. The form used

```
C_c = 1 + Kn · ( α + β · exp( − γ / Kn ) )

Kn = λ / r
```

- `Kn` — Knudsen number, dimensionless, defined here with the **particle
  radius** in the denominator, not the diameter. This matters: coefficient sets
  in the literature are quoted against a particular convention and mixing them
  produces a silent ~factor-2 error. Allen & Raabe use the radius convention and
  so does this code.
- `λ` — mean free path of the surrounding gas, m; computed from viscosity,
  temperature and pressure as in `PHYSICS_MODEL.md` §7.3, so the correction
  inherits the pressure dependence correctly.
- `α, β, γ` — dimensionless empirical coefficients.

**Pressure dependence** enters entirely through `λ ∝ 1/p`. At lower pressure the
mean free path grows, `Kn` grows, `C_c` grows, drag falls. This is why Millikan's
apparatus was run at reduced pressure for part of the work and why pressure must
be recorded with the data.

**Radius dependence:** `C_c → 1` as `r ≫ λ` (continuum) and `C_c → 1 + Kn(α+β)`
as `r ≪ λ` (free molecular).

---

## 3. Coefficient sets

Both are selectable in the interface; the choice is recorded in the manifest.

### 3.1 `allen-raabe-1982` — default

```
α = 1.155,  β = 0.471,  γ = 0.596
```

Obtained by Allen and Raabe from a nonlinear least-squares re-evaluation of
Millikan's own most accurate raw oil-drop data, using modern values of the
physical constants. Source: `REFERENCES.md` R-3.

This set is the default because it was fitted to **oil droplets in a Millikan
apparatus**, which is exactly the system being simulated.

### 3.2 `allen-raabe-1985`

```
α = 1.142,  β = 0.558,  γ = 0.999
```

From Allen and Raabe's own later measurements on **solid** spherical aerosol
particles in an improved Millikan apparatus. Reported standard errors
±0.0024, ±0.0024, ±0.0212 respectively. Source: `REFERENCES.md` R-2.

Offered as an alternative so the user can see how much a defensible choice of
correction coefficients moves the answer. On the default parameter ranges the
two sets differ in `C_c` by well under 1 %, which is itself worth seeing.

### 3.3 `none`

```
C_c ≡ 1
```

Ordinary Stokes drag. Available so that H7 can be tested: run the world with
the correction on and the *analysis* with it off, and watch a size-dependent
bias appear in the residuals.

### 3.4 A note on the widely quoted 1.257 / 0.400 / 1.100

That set appears in much of the aerosol-engineering literature and in many
textbooks. It is a legitimate fit but to a different body of data. It is **not
offered here** because this simulation is specifically an oil-drop apparatus and
the Millikan-calibrated set is the appropriate one; adding a third option would
suggest a choice that is not really open. Documented here so its absence is
deliberate. See `REFERENCES.md` R-4.

---

## 4. Valid range

| quantity | range where the fits were established | apparatus default range |
|---|---|---|
| `Kn` | roughly 0.03 – 100 (1985 measurements span Kn 0.5–83 for the NIST-era work; the 1982 Millikan re-evaluation covers the oil-drop range) | 0.04 – 0.35 |
| `r` | — | 0.2 – 1.5 µm |
| `p` | — | 60 – 105 kPa |
| `T` | — | 288 – 303 K |

The code flags `Kn` outside `[0.01, 10]` as out of the documented range rather
than extrapolating quietly.

**Not yet calibrated:** the exact stated validity envelope of the 1982
coefficient set has not been read from the primary paper — only the coefficient
values and their provenance have been verified from secondary summaries. The
range row above is therefore marked as approximate, and this is recorded in
`PARAMETER_REGISTER.md` and `RISK_REGISTER.md` R-S1.

---

## 5. Worked check

Values a reviewer can verify by hand. `T = 293.15 K`, `p = 101 325 Pa`,
`α,β,γ = 1.155, 0.471, 0.596`.

```
η   = 1.81332e-5 Pa s         (Sutherland)
λ   = 6.506e-8 m              (kinetic theory, PHYSICS_MODEL §7.3)

r = 1.0e-6 m :  Kn = 0.0651   C_c = 1.0752
r = 5.0e-7 m :  Kn = 0.1301   C_c = 1.1509
r = 2.0e-7 m :  Kn = 0.3253   C_c = 1.4003
```

At `r = 0.5 µm` the Stokes radius is 0.536 µm against a corrected 0.500 µm, so
ignoring the correction inflates the inferred radius by 7.3 % and the inferred
charge by roughly 11 %. That is far larger than the
statistical uncertainty of a careful measurement — which is the entire point of
H7.

These three cases are asserted in `tests/test-physics.js`.

---

## 6. Implementation notes

```js
function slipCorrection(r, lambda, coeffs) {
  if (!coeffs) return 1;                 // "none"
  const Kn = lambda / r;
  return 1 + Kn * (coeffs.alpha + coeffs.beta * Math.exp(-coeffs.gamma / Kn));
}
```

Because `C_c` depends on `r`, the radius inversion in `PHYSICS_MODEL.md` §4.1 is
implicit and is solved by bisection. `f(r) = r²·C_c(r) − r_stokes²` is strictly
increasing in `r` on `(0, r_stokes]` — `r²` increases and `C_c` decreases but
`r²C_c` still increases, because `C_c` is bounded below by 1 and its decrease is
slower than `r²`'s growth — so the root is unique and bracketed. The monotonicity
is verified numerically over the whole parameter range in
`tests/test-physics.js` rather than asserted from the algebra alone.
