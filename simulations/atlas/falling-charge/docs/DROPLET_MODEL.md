# Droplet model

Version 0.1.0-milestone1. Implemented in `src/droplets.js`.

---

## 1. State

Every droplet is an independent object. Fields marked **hidden** are stored in a
separate `truth` sub-object that the analysis code has no reference to, and
which the interface refuses to render before the ground-truth reveal.

| field | unit | hidden | notes |
|---|---|---|---|
| `id` | — | no | `D-0001`, stable, assigned at creation |
| `truth.radius` | m | **yes** | sampled at creation |
| `truth.n` | — | **yes** | signed integer charge count |
| `truth.charge` | C | **yes** | `n · e_hidden` |
| `truth.rhoOil` | kg m⁻³ | **yes** | per-droplet, currently constant |
| `mass` | kg | **yes** | `ρ_oil · (4/3)πr³` |
| `wEff` | N | **yes** | derived, cached |
| `x`, `y` | m | no | position; `y` upward-positive from lower plate |
| `vy` | m s⁻¹ | no | current vertical velocity |
| `brownianX`, `brownianY` | m | no | cumulative diffusive displacement, for diagnostics |
| `tBirth` | s | no | simulated time of entry |
| `lifetime` | s | no | time before it leaves the illuminated region |
| `focus` | 0–1 | no | how sharply it images; see §4 |
| `visible` | bool | no | in the field of view and above the visibility threshold |
| `evaporating` | bool | no | state exists; **dynamics not implemented** |
| `pIonise` | s⁻¹ | no | hazard rate for a charge change |
| `chargeEvents` | list | no | `{t, deltaN, cause}` — every change, retained |
| `measurements` | list | no | measurement ids taken on this droplet |
| `status` | enum | no | `candidate` / `tracked` / `lost` / `retired` |
| `notes` | string | no | user text |

Acceptance status and rejection reason live on the **measurement**, not the
droplet, because the same droplet can yield a good measurement and a bad one.

---

## 2. Radius distribution

An atomiser produces a broad, right-skewed size distribution. Modelled as
log-normal:

```
ln r ~ N( ln r_med , (ln σ_g)² )        truncated to [r_min, r_max]
```

Defaults: `r_med = 0.55 µm`, `σ_g = 1.45`, truncated to `[0.20, 1.50] µm`.

**Not yet calibrated.** These values are chosen to place the bulk of droplets in
the range where fall times over a 0.5 mm reticle are 8–30 s — the range a real
apparatus is usable in — and to make small, noisy droplets genuinely available
so that H6 is discoverable. They are not fitted to any published atomiser
characterisation. Recorded as such in `PARAMETER_REGISTER.md`.

Truncation is by rejection sampling with a hard cap of 100 attempts, after which
the clamped value is used and a counter is incremented; the counter appears in
the manifest so that a badly configured distribution cannot hide.

---

## 3. Charge distribution

```
q_true = n · e_hidden
```

`n` is a **signed integer**, sampled as:

1. **Sign.** `P(negative) = 0.80`, `P(positive) = 0.20`. Friction charging in an
   atomiser produces predominantly negative droplets; Millikan's were mostly
   negative. **Not yet calibrated** — the 80/20 split is plausible but not
   sourced.
2. **Neutral fraction.** With probability 0.12, `n = 0`. A neutral droplet
   simply falls whatever the field does, and is unusable for charge measurement.
   The instrument does not hide them; finding and discarding them is part of the
   work.
3. **Magnitude.** For charged droplets, `|n|` is drawn from a discrete
   distribution weighted toward small values:

   ```
   P(|n| = k) ∝ k^(−1.35),  k = 1 … 12
   ```

   giving roughly 38 % singly charged, 15 % doubly, and a thin tail. **Not yet
   calibrated**; chosen so that the integer ladder is discoverable from ~15
   droplets without every droplet being `n = 1`, which would make the inference
   trivial.

**Design constraint honoured:** the distribution is *not* tuned so that any
particular sample recovers `e` accurately. Small samples dominated by high `|n|`
will produce a poorly determined lattice, and that is a real outcome the user
must be allowed to reach.

---

## 4. Focus and visibility

A droplet is visible when it is inside the illuminated region and its optical
signal clears a threshold. Modelled as

```
focus = exp( − (z − z_focal)² / (2 w²) )
```

where `z` is the droplet's depth in the chamber (sampled at creation, fixed),
`z_focal` is the microscope focal plane the user sets, and `w` is the depth of
field. Smaller droplets additionally scatter less light, so

```
signal = focus · (r / r_ref)²
```

with visibility requiring `signal > 0.06`. This makes the focus control a real
control: the user must find the plane, and droplets at other depths are dim or
invisible. It also means the *sample the user sees is not the sample that
exists* — a selection effect biased toward larger droplets, which is stated in
`LIMITATIONS.md` L-2 and shown against the truth at reveal.

---

## 5. Charge changes

A charge change occurs only through an explicit simulated event:

- **Spontaneous ionisation**, hazard rate `λ_ion` per second per droplet
  (default `2 × 10⁻³ s⁻¹`, i.e. a mean of ~8 minutes — rare enough to be a
  hazard, common enough to be encountered). **Not yet calibrated.**
- **Operator ionisation pulse**, when the user fires the ionisation source.
  Each exposed droplet has a per-pulse probability of changing charge.

On an event, `Δn` is drawn from `{−2,−1,+1,+2}` with weights `{1,4,4,1}`, and
the event is appended to `chargeEvents` with its simulated time and cause.
Nothing else about the droplet changes.

If a charge event falls *inside* an active measurement window, the measurement
is flagged `charge_changed_during_measurement`. The flag is raised from the
event log, which the analysis can see; the *new charge value* is not disclosed.
This is deliberate: a real experimenter can see the droplet suddenly change
speed, and should be able to act on that, without being told the answer.

---

## 6. Falsification scenario — Model F

Optional, **off by default**, and labelled in the interface as
`SYNTHETIC — non-physical charge model` wherever data from it appear.

When enabled, a configurable fraction `f` of droplets (default 0.15) receive

```
q_true = (n + δ) · e_hidden ,   δ ~ Uniform(−0.5, 0.5)   [Model F-uniform]
```
or
```
q_true = (n ± 1/3) · e_hidden                            [Model F-thirds]
```

Its purpose is solely to test whether the analysis can *detect* departures from
the integer-multiple model. It is not a claim about physics. Any export
generated with Model F active carries `syntheticChargeModel` in its manifest and
the PDF report carries the label on every page.

---

## 7. Reproducibility

Droplet properties are drawn from the `droplets` stream, seeded
`hash(seed + ":droplets")`, in a fixed order: radius, depth, sign, neutral,
magnitude, lifetime, ionisation phase. Adding a new property in future must
append to the end of this order or the seed compatibility breaks — noted in
`REPRODUCIBILITY.md` §4.

`truth.n` is drawn **before** any user action can influence it, at spray time,
so the apparatus cannot adapt to the user.
