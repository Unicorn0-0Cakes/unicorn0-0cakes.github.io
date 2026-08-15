# Validation plan

Version 0.1.0-milestone1. **Layers 1, 2 and part of 3 are executed. Layers 4–8
are not.** Status is recorded per layer.

Until Layer 8 is complete the instrument is labelled **Research prototype**.

---

## Layer 1 — Equation tests · **EXECUTED**

Hand-calculated reference cases, asserted in `tests/test-physics.js`:

| case | expected | tolerance |
|---|---|---|
| `η(293.15 K)` | 1.81332e-5 Pa s | 1e-9 |
| `ρ_air(101325 Pa, 293.15 K)` | 1.2041 kg m⁻³ | 1e-3 |
| `λ(101325 Pa, 293.15 K)` | 6.506e-8 m | 5 % |
| `C_c(r = 1.0 µm)` | 1.0752 | 1e-3 |
| `C_c(r = 0.5 µm)` | 1.1509 | 1e-3 |
| `C_c(r = 0.2 µm)` | 1.4003 | 1e-3 |
| `W_eff(r = 0.5 µm)` | 4.543e-15 N | 0.5 % |
| `v_f(r = 0.5 µm)` | 3.06e-5 m s⁻¹ | 0.5 % |
| balancing `V` for `n = −2`, `d = 6 mm` | 85.1 V | 1 % |
| charge round trip `q → v → q̂` | exact | 1e-9 relative |
| radius round-trip `r → v_f → r̂` | exact | 1e-9 relative |
| `C_c` monotonicity of `r²C_c(r)` | strictly increasing | over 0.05–5 µm |

## Layer 2 — Noiseless synthetic recovery · **EXECUTED**

Ideal apparatus, no Brownian motion, no instrument error, 20 droplets with
known radii and integer charges. The candidate-lattice search plus weighted
regression must recover the hidden `e` to within 1e-6 relative.

`tests/test-inference.js`. **Result: passes** — recovery to better than 1e-9
relative.

This layer found a real defect. The first implementation minimised raw χ² and
returned `ê = e/2` on noiseless data and `ê ≈ e/3` under realistic noise,
because a finer lattice fits strictly better. The penalised objective in
`LIMITATIONS.md` L-14 was written in response. Layer 2 is the weakest kind of
evidence — it only shows the code is self-consistent — and it still caught the
most serious statistical error in the build.

## Layer 3 — Controlled-noise recovery · **PARTIALLY EXECUTED**

One noise source at a time. Currently tested: Brownian motion alone, 200
droplets, asserting that the recovered `ê` is within 3 % and that the estimate
degrades when the tracking interval is shortened.

**Not executed:** interval coverage. Coverage requires many replicated
experiments, i.e. Mode G. Until then, *no claim about interval coverage is made
anywhere in the instrument*.

## Layer 4 — Systematic-bias tests · **NOT EXECUTED**

Miscalibrate voltage, plate spacing, viscosity, pressure, temperature and
reticle scale in turn; confirm the expected bias appears with the expected
elasticity from `UNCERTAINTY_ANALYSIS.md` §7. Requires Mode G.

## Layer 5 — Model-comparison tests · **NOT EXECUTED**

Requires Milestone 4. The two-sided gate in `MODEL_COMPARISON.md` is a
prerequisite for shipping the feature at all.

## Layer 6 — Exclusion-policy tests · **NOT EXECUTED**

Requires Modes F and G.

## Layer 7 — Interface validation · **EXECUTED** (with one gap)

`tests/test-boot.js` loads every `<script>` tag from `index.html` in order into
a DOM stub, boots the application, and drives a complete blind experiment
through the real buttons: calibrate, preregister, atomise, focus, select, track
field-off, apply voltage, track field-on, derive, decide, lock the dataset,
lock the analysis, reveal, export. It asserts that the truth vault still throws
after the analysis has run, that the reveal tab contains no verdict language,
and that rejected measurements survive into the export.

**This layer was added after a shipping defect.** A mismatched quote in
`app.js` meant the file never parsed, `FCApp` was never defined, and every
control on the page was dead — while all 176 science tests passed, because none
of them loaded the interface. The suite could not distinguish a working
instrument from a blank page.

**Remaining gap:** the stub does not dispatch real events, so the tab buttons
and the accept/reject buttons are exercised through their handlers rather than
through synthesised clicks, and layout, fonts and canvas pixels are not tested
at all. Opening the page in a browser remains necessary and is not automated.

## Layer 8 — Independent scientific review · **NOT EXECUTED**

No physicist or laboratory instructor has reviewed the equations, signs,
correction factors, parameter ranges, uncertainty treatment or explanatory
language.

**Consequence:** the catalogue entry is `Uncalibrated prototype` /
`Research preview`, and the instrument's own status strip says
*Research prototype — not scientifically reviewed*.

---

## What would change the status

| to claim | requires |
|---|---|
| removal of "research prototype" | Layer 8 |
| any statement about interval coverage | Layers 3 (full) and 4 |
| any claim about quantisation detection | Layer 5, including the two-sided gate |
| any claim about exclusion policy | Layer 6 |
| `Calibrated research model` on the card | Layers 3–6 and a published benchmark to calibrate against |
