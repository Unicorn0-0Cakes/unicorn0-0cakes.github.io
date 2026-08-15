# Physical model

Version 0.1.0-milestone1. Implemented in `src/physics.js`, constants in
`src/units.js`. Every equation here has a test in `tests/` unless marked
otherwise.

All quantities are SI. No other unit system appears anywhere in the code; the
interface converts for display only, at the last moment.

---

## 1. Coordinate and sign conventions

This is where oil-drop simulations usually go wrong, so it is fixed here once.

- **Vertical axis `y` is positive upward**, metres, origin at the *lower* plate's
  inner face.
- **Velocity `v`** is `dy/dt`, positive upward, m s⁻¹. A falling droplet has
  `v < 0`.
- **`V_plate`** is the potential of the **upper** plate minus that of the lower
  plate, volts. Positive `V_plate` therefore puts the higher potential on top.
- The field between ideal parallel plates points from high to low potential, so
  for positive `V_plate` the field points **downward**:

  ```
  E_y = − V_plate / d          [V m⁻¹, positive upward]
  ```

- **Charge `q`** is signed, coulombs. `q = n·e` with `n ∈ ℤ` (positive,
  negative or zero).
- **`d`** is plate separation, metres, `d > 0`.

The consequence, which the interface states in words next to the polarity
control: *a positive droplet in a positive field moves down.*

The canvas draws `y` increasing upward and converts to screen coordinates in
exactly one place (`src/apparatus.js`, `toScreen()`), so a rendering bug cannot
silently invert the physics.

---

## 2. Forces

Let `r` be droplet radius (m), `ρ_oil` and `ρ_air` densities (kg m⁻³), `η` the
dynamic viscosity of air (Pa s), `g` standard gravity (m s⁻²).

### 2.1 Volume

```
V_drop = (4/3) π r³                                    [m³]
```

### 2.2 Gravity

```
F_g,y = − m g = − ρ_oil V_drop g                       [N, upward-positive]
```

### 2.3 Buoyancy

```
F_b,y = + ρ_air V_drop g                               [N]
```

### 2.4 Effective weight

Gravity and buoyancy are never used separately in the analysis; only their sum
appears, so it is given a name and a single implementation:

```
W_eff = (ρ_oil − ρ_air) · (4/3) π r³ · g               [N, magnitude, > 0]
F_gb,y = − W_eff
```

Buoyancy is a ~0.14 % correction at `ρ_oil = 886`, `ρ_air = 1.2`. It is retained
because it is free, and because dropping it is exactly the kind of silent
approximation this simulation is about.

### 2.5 Electric force

```
F_e,y = q · E_y = − q · V_plate / d                    [N]
```

The ideal parallel-plate field is assumed uniform. Edge non-uniformity is a
named, currently **unimplemented** systematic (see `LIMITATIONS.md` L-3).

### 2.6 Viscous drag

Stokes drag on a sphere in the continuum limit, opposing motion:

```
F_drag,y = − 6 π η r v / C_c                           [N]
```

`C_c` is the Cunningham slip-correction factor, dimensionless, `C_c ≥ 1`.
Setting `C_c = 1` recovers ordinary Stokes drag. Its form, coefficients and
sources are in `CUNNINGHAM_CORRECTION.md`. Stokes drag assumes small Reynolds
number; the check is in §6 below.

It is convenient to define the **drag coefficient**

```
b ≡ 6 π η r / C_c                                      [N s m⁻¹ = kg s⁻¹]
```

so that `F_drag,y = − b v`.

### 2.7 Brownian force

Modelled not as a force but as a diffusive displacement added to the
deterministic solution at each step, which is the correct treatment in the
overdamped regime this apparatus operates in. See `BROWNIAN_MOTION.md`.

### 2.8 Equation of motion

```
m dv/dt = − W_eff − q V_plate / d − b v + (stochastic)
```

with `m = ρ_oil V_drop`.

---

## 3. Terminal velocity

Setting `dv/dt = 0` and dropping the stochastic term:

```
v_∞ = − ( W_eff + q V_plate / d ) / b                  [m s⁻¹, upward-positive]
```

Three regimes follow directly, and the interface names them by this expression's
sign rather than by watching the pixels:

| condition | `v_∞` | user sees |
|---|---|---|
| `q V_plate / d < −W_eff` | `> 0` | droplet rises |
| `q V_plate / d = −W_eff` | `0` | droplet balanced |
| `q V_plate / d > −W_eff` | `< 0` | droplet falls |

### 3.1 Velocity relaxation time

The equation of motion is linear in `v`, so the approach to `v_∞` is a pure
exponential with time constant

```
τ = m / b = ρ_oil (4/3) π r³ C_c / (6 π η r)
  = 2 ρ_oil r² C_c / (9 η)                             [s]
```

For `r = 0.5 µm`, `ρ_oil = 886`, `η = 1.813 × 10⁻⁵`, `C_c = 1.151`:
`τ ≈ 3.1 × 10⁻⁶ s`. Transients die in about 20 µs — five orders of magnitude
below any measurement interval. This is *why* the terminal-velocity treatment is
legitimate, and it makes the system extremely stiff, which is why the integrator
must not be a naïve explicit scheme (§5).

**A consequence worth stating plainly:** droplet inertia is never the reason to
wait after changing the voltage. The droplet is on its new terminal velocity
within microseconds. The settling delay the interface enforces is an
*instrument* settling time (the supply and the meter), not a mechanical one, and
it is labelled as such.

---

## 4. Inverting the measurements

These are the equations the *user's analysis* runs. They are implemented in
`src/analysis.js` and are deliberately kept separate from the forward model in
`src/physics.js`, so that the analysis cannot accidentally read a hidden truth.

### 4.1 Radius from field-off fall

With the field off, `v_∞ = −W_eff/b`, so with `v_f ≡ |v_∞| > 0`:

```
(4/3) π r³ (ρ_oil − ρ_air) g = 6 π η r v_f / C_c(r)
```

which rearranges to

```
r² C_c(r) = 9 η v_f / (2 g (ρ_oil − ρ_air))  ≡  r_stokes²
```

**Ordinary Stokes** (`C_c ≡ 1`) gives the closed form in the specification:

```
r = √[ 9 η v_f / (2 g (ρ_oil − ρ_air)) ]
```

**With slip correction**, `C_c` depends on `r`, so the equation is implicit and
is solved numerically. Because `C_c > 1`, the corrected radius is always
*smaller* than the Stokes radius, which brackets the root:

```
r ∈ (0, r_stokes]
```

`src/physics.js:solveRadius()` uses bisection on `f(r) = r² C_c(r) − r_stokes²`,
which is strictly increasing on the bracket, so convergence is guaranteed.
Tolerance `1 × 10⁻¹² m` relative, max 200 iterations; the solver's iteration
count and residual are surfaced in the interface rather than hidden, because a
non-converged radius is a measurement defect the user should see.

### 4.2 Charge — the unified inversion

Let `v_f > 0` be the **field-off fall speed** (magnitude) and `v_s` the
**field-on terminal velocity expressed as a downward-positive speed**, so:

- `v_s = +|v|` if the droplet still falls (slowed fall),
- `v_s = 0` if balanced,
- `v_s = −|v|` if it rises.

From §3, field-off: `W_eff = b v_f`. Field-on: `W_eff + q V_plate/d = b v_s`.
Subtracting eliminates `W_eff`:

```
q V_plate / d = − b (v_f − v_s)
```

```
q = − 6 π η r d (v_f − v_s) / (C_c V_plate)
```

This single expression covers Procedures 2, 3 and 4 of the specification:

| procedure | `v_s` | reduces to |
|---|---|---|
| balanced suspension | `0` | `q = −W_eff d / V_plate` |
| slowed fall | `0 < v_s < v_f` | `q = −6πηr d (v_f − v_s)/(C_c V_plate)` |
| terminal rise | `v_s < 0` | `q = −6πηr d (v_f + \|v_s\|)/(C_c V_plate)` |

The leading minus sign is the sign convention of §1 doing its job: with the
upper plate positive (`V_plate > 0`), the field points down, and a droplet that
*rises* must carry **negative** charge. Millikan's droplets were predominantly
negative for exactly this reason — the atomiser charges them by friction.

The balanced-suspension case is the specification's `q = W_eff d / V_plate` up
to that sign.

**Why this form and not `q = W_eff d / V_plate` alone:** the combined
fall-and-rise form is far better conditioned. Balancing requires driving `v_s`
to zero, which Brownian motion makes impossible to verify exactly and which
takes a long time; the rise method measures two robust velocities instead of
hunting a null.

### 4.3 Charge steps

For two observations of the *same* droplet with charge states `q₁`, `q₂` under
the same field-off fall speed:

```
Δq = q₂ − q₁ = − 6 π η r d (v_{s,1} − v_{s,2}) / (C_c V_plate)
```

Note `r`, `η`, `d` and `V_plate` cancel *partially* — `Δq` depends only on the
*difference* of the two field-on velocities, so it is immune to any error in
`W_eff` and therefore to `ρ_oil`. It remains sensitive to `η`, `r` and `d`.
This is a genuinely different systematic-error profile and is why the charge-step
route is worth having. **Implemented in the forward model (ionisation events
occur); the Δq analysis route is not yet implemented.**

---

## 5. Numerical integration

### 5.1 Why not RK4

The system is stiff: `τ ≈ 3 ms` while observations run for 10–30 s. An explicit
scheme would need `Δt ≪ τ` for stability throughout, wasting four orders of
magnitude of work, and would still accumulate error.

### 5.2 The scheme actually used — exact exponential update

Because the drag is linear and the other forces are constant over a step, the
ODE has a closed-form solution over each step. For step `h`:

```
v(t+h) = v_∞ + (v(t) − v_∞) · exp(−h/τ)

y(t+h) = y(t) + v_∞ h + (v(t) − v_∞) τ (1 − exp(−h/τ))  + ξ
```

This is **exact** for constant forces, to floating-point precision, at any step
size. It is unconditionally stable. It cannot produce the oscillating or
diverging velocities that a naïve integrator produces near balance — the case
that matters most here.

`ξ` is the Brownian displacement for the step (`BROWNIAN_MOTION.md` §2).

Numerical care: for `h/τ > 40`, `exp(−h/τ)` underflows harmlessly to 0 and the
update correctly reduces to `v = v_∞`, `y += v_∞ h`. For `h/τ < 10⁻⁸`,
`1 − exp(−h/τ)` loses precision, so `expm1` is used:
`(1 − exp(−h/τ)) = −expm1(−h/τ)`.

### 5.3 Timestep and frame-rate independence

- **Physics timestep** `Δt_phys = 2 × 10⁻³ s` of *simulated* time, fixed.
- The render loop accumulates elapsed wall time × speed multiplier and runs
  `floor(accumulator / Δt_phys)` steps, carrying the remainder.
- Steps are capped at 240 per frame so a backgrounded tab cannot produce a
  single enormous catch-up burst; the shortfall is reported in the interface as
  a dropped-time warning rather than silently absorbed.
- **Consequence:** the sequence of physics states for a given simulated time is
  identical on a 30 Hz and a 144 Hz display. This is asserted in
  `tests/test-determinism.js`.

`Δt_phys` is about 640 τ at `r = 0.5 µm`, so `exp(−h/τ)` underflows to zero and
the update reduces *exactly* to the terminal-velocity solution — which is the
correct answer, not an approximation to it. An explicit integrator at this step
size would diverge immediately. Since the exponential update is exact for
constant forces, `Δt_phys` is not an accuracy constraint on the deterministic
part; it is a resolution constraint on the *Brownian* part, which is a random walk and is
therefore correct at any step size in distribution (the variance is linear in
`h`). It is also the resolution at which the tracker samples position.

### 5.4 Terminal-velocity mode

For teaching modes and for batch generation, `src/physics.js` can skip
integration and place the droplet on `v = v_∞` directly, adding the same
Brownian displacement. This is selectable and recorded in the experiment
manifest, because it is a modelling choice that could in principle matter.
It does not change any of the equations in §4.

---

## 6. Validity checks the model performs

These run at droplet creation and at each measurement, and surface as quality
flags rather than as silent clamps.

### 6.1 Reynolds number

```
Re = 2 r ρ_air |v| / η
```

Stokes drag requires `Re ≪ 1`. For `r = 0.5 µm`, `v = 40 µm s⁻¹`:
`Re ≈ 2.6 × 10⁻⁶`. The model flags any droplet exceeding `Re = 0.1`.
In the default parameter ranges this never occurs; the check exists so that a
user who winds the voltage to an absurd value is told the drag law has left its
domain, rather than being given a wrong number politely.

### 6.2 Knudsen number

```
Kn = λ / r
```

Reported for every droplet. `Kn > 0.5` means the slip correction is doing heavy
lifting and the ordinary-Stokes analysis will be badly biased — exactly the H7
regime.

### 6.3 Non-negativity and finiteness

`r > 0`, `m > 0`, `η > 0`, `C_c ≥ 1`, all outputs finite. Asserted in
`tests/test-stability.js`.

---

## 7. Environment sub-models

### 7.1 Air viscosity — Sutherland's formula

```
η(T) = η_ref · (T/T_ref)^{3/2} · (T_ref + S) / (T + S)
```

with `η_ref = 1.716 × 10⁻⁵ Pa s`, `T_ref = 273.15 K`, `S = 110.4 K`.
Source: standard Sutherland constants for air, see `REFERENCES.md` R-5.
Valid roughly 200–1300 K; the apparatus operates at 288–303 K.

At 293.15 K this gives `η = 1.813 × 10⁻⁵ Pa s`.

**Sensitivity:** `q ∝ η^{3/2}` overall (`η` appears explicitly and again through
`r ∝ √η`), so a 1 % error in viscosity moves `ê` by about 1.5 %. This is the
single largest systematic in the historical experiment and the reason
Millikan's value was later revised. It is the first entry in the uncertainty
budget.

### 7.2 Air density — ideal gas

```
ρ_air = p M_air / (R T)
```

`M_air = 0.028 964 6 kg mol⁻¹`, `R = 8.314 462 618 J mol⁻¹ K⁻¹` (exact, SI).
Dry air assumed; humidity is **not modelled** (`LIMITATIONS.md` L-5).

### 7.3 Mean free path

Computed from viscosity by the kinetic-theory relation, so that it stays
consistent with §7.1 rather than being an independent hard-coded number:

```
λ = (η / p) · √( π R T / (2 M_air) )
```

At 101 325 Pa, 293.15 K this gives `λ ≈ 6.5 × 10⁻⁸ m`, within the 66–67 nm range
of the established theoretical expressions. Note that the value of the mean free
path of air is not entirely settled — see `REFERENCES.md` R-6 and
`LIMITATIONS.md` L-6. `λ` enters only through `Kn` in the slip correction, so a
5 % error in `λ` produces well under 1 % in `C_c` at these radii.

### 7.4 Oil density

- Modern teaching apparatus default: `ρ_oil = 886 kg m⁻³`. **Not yet
  calibrated** against a specific manufacturer's data sheet; see
  `PARAMETER_REGISTER.md`.
- Historical mode: `ρ_oil = 919.9 kg m⁻³`, the clock-oil density Millikan
  reports. See `REFERENCES.md` R-1.

Temperature dependence of oil density is **not modelled**.

---

## 8. What is deliberately not in this model

Listed so that absence is a decision rather than an oversight. Each has an
entry in `LIMITATIONS.md`.

- Edge and fringing fields near the plate boundary (uniform field assumed).
- Convective air currents from the illumination source.
- Droplet evaporation (state exists on the droplet; dynamics not implemented).
- Non-sphericity.
- Image charge between droplet and plates.
- Humidity and its effect on `ρ_air` and `η`.
- Radiometric forces from the illuminating beam.
- Relativistic or quantum corrections of any kind (irrelevant at this scale, but
  named so nobody wonders).
