# The Magnetic Ocean

Nobody has ever seen a magnetic stripe on the seafloor. What a ship collects is one number every
kilometre or so — the strength of the magnetic field, with the Earth's main field already taken off —
on a cable trailing two or three kilometres above rock it cannot see. Everything else is inference.

You run the survey. You choose where the line goes, how often to read, how fast to steam, and how much
of a finite budget of ship-hours to spend. Then you say what the seafloor is doing, and commit to it,
before the geology underneath is shown to you.

Open `magnetic-ocean.html` in any modern browser. Nothing to install, no build step, no network access.

---

## Purpose

To put the Vine–Matthews–Morley inference in the operator's hands as an **inverse problem**: observe
effects, reconstruct the unseen system that produced them. The instrument exists to make one thing
concrete — the difference between a coloured stripe diagram and a magnetometer record. The stripe
diagram is the answer. The magnetometer record is what you actually get.

## Current status

**Research preview**, version 0.1.0 (August 2026).

Everything described below is implemented and tested. What has *not* been done: verification in a real
browser at desktop and mobile widths, and any comparison against measured marine magnetic data. See
[Known limitations](#known-limitations).

## Evidence level

**Uncalibrated prototype** — internally consistent, with nothing fitted to data.

The forward model is a faithful implementation of published potential-theory expressions and is checked
against independent properties of those expressions. But no parameter has been calibrated against a
measured marine magnetic profile, and no output has been compared with one. Raising the badge would
require exactly that comparison, shown as a table in
[§06 of the methods page](methods.html#s6).

**This is a browser research instrument, not a replacement for professional marine magnetic processing
software.** It does not do base-station correction, heading calibration, crossover adjustment, levelling
between lines, or main-field removal — it assumes all of those have already been done perfectly, which
in the field is the hard part.

---

## File map

```
magnetic-ocean/
  magnetic-ocean.html          the instrument; entry point
  methods.html                 methods & limitations, 7 sections
  README.md                    this file
  USER_MANUAL.md               how to operate it
  css/
    magnetic-ocean.css         page-local styles, mapped onto --rf-* tokens
  data/
    polarity-timescale.js      the published chronology, with per-boundary sources
  js/
    config.js                  units, constants, control ranges, presets, modes
    model.js                   the scientific kernel — no DOM access
    charts.js                  the four canvas scopes
    events.js                  input handling, by delegation
    screens.js                 panels, tables, reports, dialogues
    main.js                    state and the survey loop
  tests/
    model-tests.js             87 assertions; runs in node and in the browser
    model-tests.html           browser runner for the same suite
    smoke.js                   17 assertions; renders every screen headlessly
```

`model.js` never touches the DOM, so the simulation can be reasoned about — and tested — on its own.

## Local launch

```
# from the repository root
python3 -m http.server 8000
# then open http://localhost:8000/magnetic-ocean/magnetic-ocean.html
```

Opening `magnetic-ocean/magnetic-ocean.html` straight off the filesystem also works; every path in the
instrument is relative, so it behaves identically on GitHub Pages. The only network request on the page
is Google Fonts in `<head>`, and the instrument is fully functional without it.

---

## The model

### Age from distance

For a constant half-spreading rate, `distance_km = 10 × half_rate_cm_per_yr × age_Ma`. The factor of ten
is a unit conversion and nothing else: 1 cm/yr is 10 km per million years. A polarity interval lasting
`D` Ma is therefore written into the crust as a band `10 × v × D` km wide on **one** side of the axis.

A **half rate** is one plate. A **full rate** is the sum of the two. They are never interchanged; the
variables are named `halfRateLeftCmYr`, `halfRateRightCmYr` and `fullRateCmYr` so the mistake would be
visible. Age at the active axis is exactly zero and increases away from it.

### Polarity

Two sources, always distinguished:

- **Published** — twelve normal-polarity intervals covering 0–5.23 Ma, transcribed from ODP Leg 207
  Initial Reports Table T7, itself a compilation after Shackleton et al. (1990), Hilgen (1991),
  Shackleton et al. (1995) and Cande & Kent (1995). Every boundary carries the attribution the source
  table gives it. Crust older than 5.23 Ma is left **unmagnetised** rather than extrapolated.
- **Synthetic** — a seeded sequence of irregular intervals, labelled synthetic everywhere it appears.

### The forward magnetic profile

The magnetised layer is a set of two-dimensional rectangular prisms, infinite along strike, uniformly
magnetised, sharing one top and one bottom depth. This is the classical marine-magnetics forward problem
of Talwani & Heirtzler (1964), re-derived from first principles — with the errors in the 1964 derivation
identified and corrected — by Kravchinsky et al. (2019). Their equations (4)–(6) are the ones
implemented, integrated in closed form over each rectangle:

```
V = (1/2π) · D[ −Jx·R − Jz·A ]
H = (1/2π) · D[ −Jz·R + Jx·A ]

A = arctan(x/z),  R = ½·ln(x² + z²)
```

with `x`, `z` the source position relative to the sensor (`z` positive downward), `Jx`, `Jz` the
magnetisation components in A/m, and `D[·]` the double difference over the rectangle's corners. The
sensor is always above the layer, so `z > 0` throughout and `arctan(x/z)` never crosses a branch cut —
no special cases, no singularities.

Projecting onto the main-field direction, with strike azimuth and declination folded into a single
**effective inclination** after Schouten & McCamy (1972), collapses the total-field anomaly to one line
per unit magnetisation:

```
T = −sin(2·I_eff)·D[R] + cos(2·I_eff)·D[A]
```

At `I_eff = 90°` — the magnetic-pole case — this is `T = −D[A]`, the anomaly is symmetric about each
block, and a symmetric world gives a symmetric profile. Below 90° the anomalies skew, which is real.

**Chance enters in exactly one place**: the seeded generator (mulberry32, Box–Muller for Gaussians)
that produces instrument noise, navigation jitter, dropout and the regional offset, drawn in a fixed
order — navigation, then noise, then dropout, sample by sample. The geology is not random once the seed
is chosen; it is a deterministic function of it.

### Why the trace is smooth when the crust is not

The blocks have sharp edges; the field they produce does not. Raising the sensor reduces the amplitude
and suppresses high-frequency detail — upward continuation is a low-pass filter whose corner is set by
the sensor's height above the source. Neighbouring blocks of opposite polarity partly cancel. What comes
out is a continuous trace whose peaks do not sit over block centres and whose zero crossings do not land
on the polarity boundaries. Both of those are asserted as tests, not claimed as prose.

---

## Controls

| Control | Range | What it costs you |
|---|---|---|
| Track start, chart east | −140 to 140 km | nothing — but the chart origin is arbitrary and the ridge is not at zero |
| Track length | 20–260 km | ship-hours, in proportion |
| Track angle to ridge | 10–90° | ridge-normal coverage: below 30° the instrument warns, below 15° it refuses |
| Sample spacing | 0.1–4.0 km | nothing — a free choice about a line you are paying for anyway |
| Sensor altitude | 0.5–5.0 km | amplitude and resolution |
| Ship speed | 4–14 kn | how fast the budget is spent |
| Instrument noise (1σ) | 0–120 nT | everything |
| Regional trend | 0–400 nT/100 km | a nuisance every model has to fit |
| Navigation uncertainty (1σ) | 0–3.0 km | the reading is taken where the ship *was* and logged where it *thought* it was |
| Dropout rate | 0–30% | lost readings, marked as gaps and never as zeros |
| Echo sounder | on / off | shows a rise; says nothing about rate, polarity or age |

Buttons: **Begin survey · Pause / Resume · Step · Restart same seed · New seed · Reset controls ·
Export observations · Methods**. The interpretation panel adds **Fit symmetric**, **Fit asymmetric** and
**Compare four explanations**; the inspector adds **Commit interpretation**.

Keyboard: `Space` runs or pauses a line, `S` steps, `R` restarts on the same seed, `N` draws a new seed,
`E` exports, `?` opens the quick explanation, `T` switches theme, `Esc` closes a dialogue. Focus the
profile and `← →` move the cursor (`Shift` for ten stations), `Home` / `End` jump to the ends.

## Modes

- **Guided discovery** — one clean ridge, a perpendicular crossing, a note at every step. Under ten
  minutes. You still commit before the geology is shown.
- **Blind survey** — axis, rates, symmetry and polarity history all hidden; three lines and sixty
  ship-hours.
- **Model comparison** — four lines, four candidate explanations, held-out scoring.
- **Laboratory** — every hidden parameter exposed and explicitly labelled as such. Useful for examining
  the forward model; nothing inferred in it is a test of anything.

## Presets

| Preset | What it is for |
|---|---|
| Clean symmetric ridge | Equal half rates, perpendicular crossing, a well-behaved instrument |
| Slow-spreading ridge | 0.9 cm/yr — short subchrons compressed into bands a few km wide |
| Fast-spreading ridge | 5.0 cm/yr — the same chronology over five times the distance |
| Asymmetric ridge | 1.4 cm/yr west, 2.8 cm/yr east — one sequence at two scales |
| Oblique survey | A 35° crossing; every band stretched by 1/sin 35° ≈ 1.74 |
| Noisy old instrument | Strong trend, 55 nT noise, one reading in eight lost, kilometre navigation |
| Null world | Correlated magnetisation organised by nothing. There is no rate to find, and saying so is the correct answer |
| Spreading, no reversals | Crust spreads but the field holds one polarity. Almost nothing happens |

No preset is named after a real ridge, and none claims to reproduce a measured survey.

## Deterministic seed behaviour

The seed is shown, editable, and written into the export. **Restart same seed** rebuilds the identical
hidden world *and* the identical noise realisation. **New seed** draws a new world. The stream mixer is
FNV-1a over the arguments, so `(seed, "noise", 2)` is a reproducible distinct stream and results are
identical in every browser and in node. Every generated array is checked for non-finite values and
throws rather than quietly drawing an empty chart.

## Testing

```
node tests/model-tests.js      # 87 assertions on the science
node tests/smoke.js            # 17 assertions on the interface, headless
```

or open [`tests/model-tests.html`](tests/model-tests.html) to run the same model suite in the browser,
against the files the instrument itself loads.

The model suite covers reproducibility, the age–distance conversion, polarity lookup, crustal geometry,
survey geometry including obliquity, the forward model's amplitude and resolution behaviour with sensor
altitude, observation effects, the inversion, the session and export, the inference report, and the
catalogue record's conformance to the schema. The smoke suite loads every file, launches every mode,
runs a line to completion, drives the fit and the four-model comparison, commits, reveals, exports, and
checks that no element id is requested that the page does not define.

---

## Known limitations

The forward model is a **simplified pedagogical implementation of a published physical model**. The
potential-theory expressions are the real ones and are implemented exactly; the world they are applied to
is deliberately thin. Not modelled at all: variable crustal thickness, variable magnetisation intensity,
alteration, sediment cover, bathymetric effects on the magnetics, latitude and true field inclination,
declination, non-vertical magnetisation, anomalous skewness, transform faults, ridge jumps, propagating
rifts, changes in spreading rate through time, three-dimensional source geometry, ship contamination,
diurnal variation, external disturbance, and uncertainty in the reversal chronology itself.

The bathymetry is drawn from the Parsons & Sclater depth–age relation but is **not** fed back into the
magnetics: the source layer sits at a constant depth below the sensor. The section you see and the
section the model uses are not the same section. That is deliberate, so sensor altitude stays a single
controllable variable, and it is listed as a simplification rather than hidden.

A good fit here shows that synthetic observations are consistent with a synthetic world of a particular
kind. It is evidence about the model, not about the Earth. It is not a measurement of anything, it does
not establish that the real seafloor spreads, and a working interface does not establish scientific
validity.

Outstanding at this version: no real-browser verification, no comparison against measured data, and no
source-verified historical preset.

## Sources

1. Vine, F.J. & Matthews, D.H. (1963). Magnetic anomalies over oceanic ridges. *Nature* **199**, 947–949.
   doi:10.1038/199947a0
2. Morley, L.W. & Larochelle, A. (1964). Palaeomagnetism as a means of dating geological events. In
   *Geochronology in Canada*, Royal Society of Canada Special Publication 8, 39–51.
3. Heirtzler, J.R., Dickson, G.O., Herron, E.M., Pitman, W.C. III & Le Pichon, X. (1968). Marine magnetic
   anomalies, geomagnetic field reversals, and motions of the ocean floor and continents.
   *J. Geophys. Res.* **73**, 2119–2136. doi:10.1029/JB073i006p02119
4. U.S. Geological Survey, *This Dynamic Earth: The Story of Plate Tectonics* — "Magnetic stripes and
   isotopic clocks". https://pubs.usgs.gov/gip/dynamic/stripes.html
5. Talwani, M. & Heirtzler, J.R. (1964). Computation of magnetic anomalies caused by two dimensional
   structures of arbitrary shape. *Computers in the Mineral Industries, Part 1*, Stanford Univ. Publ.
   Geol. Sci. **9**, 464–480.
6. Kravchinsky, V.A., Hnatyshin, D., Lysak, B. & Alemie, W. (2019). Computation of magnetic anomalies
   caused by two-dimensional structures of arbitrary shape: derivation and Matlab implementation.
   *Geophys. Res. Lett.* **46**, 7345–7351. doi:10.1029/2019GL082767
7. Schouten, H. & McCamy, K. (1972). Filtering marine magnetic anomalies. *J. Geophys. Res.* **77**,
   7089–7099. doi:10.1029/JB077i035p07089
8. Ocean Drilling Program, Leg 207 Initial Reports, Ch. 2, Table T7.
   https://www-odp.tamu.edu/publications/207_IR/chap_02/c2_t7.htm — after Shackleton et al. (1990),
   Hilgen (1991), Shackleton et al. (1995), Cande & Kent (1995) doi:10.1029/94JB03098
9. Parsons, B. & Sclater, J.G. (1977). An analysis of the variation of ocean floor bathymetry and heat
   flow with age. *J. Geophys. Res.* **82**, 803–827.

## Version

**0.1.0** — August 2026. First release. See [§07 of the methods page](methods.html#s7).

## Roadmap

- Verify in a real browser at desktop, tablet and mobile widths, in both themes.
- Compare one clean synthetic case against a published forward-model figure, and record the comparison
  in methods §06. That is the step that would justify moving off *Uncalibrated prototype*.
- Bathymetric relief fed into the magnetic forward model, so the displayed section and the modelled
  section agree.
- Magnetisation decaying with crustal age, which changes the relative amplitude of old and young
  anomalies and is one of the first things a reader of real profiles notices.
- A source-verified historical preset — only after its geometry, rates and noise figures can each be
  cited.
- Uncertainty on the recovered rate, from the curvature of the misfit surface rather than from a single
  best fit.
