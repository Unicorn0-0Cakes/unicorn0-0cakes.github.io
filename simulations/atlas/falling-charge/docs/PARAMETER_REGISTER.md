# Parameter register

Every parameter the model uses. Columns: symbol · definition · unit · default ·
valid range · source · calibration status · uncertainty · code location ·
sensitivity priority (1 = highest).

Status vocabulary: **defined** (exact by SI definition) · **sourced** (traced to
a reference in `REFERENCES.md`) · **secondary** (taken from a summary of a
primary source, not the source itself) · **not yet calibrated** (a modelling
choice, no external justification).

---

## 1. Fundamental constants

| symbol | definition | unit | default | range | source | status | uncertainty | code | sens. |
|---|---|---|---|---|---|---|---|---|---|
| `e` | elementary charge (hidden ground truth) | C | 1.602176634e-19 | fixed | R-7 | **defined** | 0 (exact) | `units.js:SI.e` | — |
| `k_B` | Boltzmann constant | J K⁻¹ | 1.380649e-23 | fixed | R-9 | **defined** | 0 | `units.js:SI.kB` | 4 |
| `R` | molar gas constant | J mol⁻¹ K⁻¹ | 8.314462618 | fixed | R-9 | **defined** | 0 | `units.js:SI.R` | 6 |
| `g` | standard gravity | m s⁻² | 9.80665 | fixed | R-9 | **defined** | 0 | `units.js:SI.g` | 5 |
| `M_air` | molar mass of dry air | kg mol⁻¹ | 0.0289646 | fixed | R-9 | **sourced** | ~1e-7 | `units.js:SI.Mair` | 7 |

`g` is treated as exact. Local gravity varies by ±0.3 % over the Earth's
surface, which would be a 0.15 % systematic in `q`; this is **not modelled**
(`LIMITATIONS.md` L-7).

## 2. Air properties

| symbol | definition | unit | default | range | source | status | uncertainty | code | sens. |
|---|---|---|---|---|---|---|---|---|---|
| `η_ref` | Sutherland reference viscosity | Pa s | 1.716e-5 | fixed | R-5 | **secondary** | not quantified | `units.js:AIR.etaRef` | **1** |
| `T_ref` | Sutherland reference temperature | K | 273.15 | fixed | R-5 | **secondary** | 0 | `units.js:AIR.tRef` | 1 |
| `S` | Sutherland constant for air | K | 110.4 | fixed | R-5 | **secondary** | not quantified | `units.js:AIR.S` | 1 |
| `η` | dynamic viscosity of air | Pa s | 1.813e-5 @293.15 K | 1.78–1.86e-5 | derived | **secondary** | ~0.5 % (est.) | `physics.js:viscosity()` | **1** |
| `ρ_air` | air density | kg m⁻³ | 1.204 @293.15 K, 101325 Pa | 0.7–1.3 | ideal gas | **sourced** | <0.1 % | `physics.js:airDensity()` | 8 |
| `λ` | mean free path | m | 6.50e-8 | 5–12e-8 | R-6 + kinetic theory | **not yet calibrated** | literature disagrees; see L-6 | `physics.js:meanFreePath()` | 6 |

**`η` is sensitivity priority 1.** `q ∝ η^{3/2}`. A 1 % viscosity error is a
1.5 % charge error that no amount of data will remove. It was the dominant
systematic in Millikan's own result.

## 3. Slip correction

| symbol | definition | unit | default | range | source | status | uncertainty | code | sens. |
|---|---|---|---|---|---|---|---|---|---|
| `α` | slip coefficient | — | 1.155 | — | R-3 | **secondary** | not stated in summary | `units.js:SLIP` | 3 |
| `β` | slip coefficient | — | 0.471 | — | R-3 | **secondary** | not stated | `units.js:SLIP` | 3 |
| `γ` | slip coefficient | — | 0.596 | — | R-3 | **secondary** | not stated | `units.js:SLIP` | 3 |
| `Kn` | Knudsen number `λ/r` | — | derived | 0.01–10 flagged | — | — | — | `physics.js:slipCorrection()` | 3 |

Alternative set `allen-raabe-1985`: α=1.142±0.0024, β=0.558±0.0024,
γ=0.999±0.0212, source R-2, status **secondary**.

**Validity range of the 1982 set: Not yet calibrated.**

## 4. Oil

| symbol | definition | unit | default | range | source | status | uncertainty | code | sens. |
|---|---|---|---|---|---|---|---|---|---|
| `ρ_oil` (modern) | oil density | kg m⁻³ | 886 | 850–920 | — | **not yet calibrated** | ±5 assumed | `units.js:OIL.modern` | 4 |
| `ρ_oil` (historical) | clock-oil density | kg m⁻³ | 919.9 | — | R-1 | **not yet calibrated** (value not read from primary text) | — | `units.js:OIL.historical` | 4 |

## 5. Apparatus geometry

| symbol | definition | unit | default | range | source | status | uncertainty | code | sens. |
|---|---|---|---|---|---|---|---|---|---|
| `d` | plate separation (true) | m | 6.00e-3 | 3–12e-3 | — | **not yet calibrated** | session-drawn error | `apparatus.js` | **2** |
| `h_illum` | illuminated region height | m | 4.0e-3 | — | — | not yet calibrated | — | `apparatus.js` | — |
| `FOV` | microscope field of view | m | 1.00e-3 | — | — | not yet calibrated | — | `apparatus.js` | — |
| `Δ_ret` | reticle division | m | 1.00e-4 | — | — | not yet calibrated | scale gain error | `apparatus.js` | **2** |
| `w` | depth of field | m | 1.5e-4 | — | — | not yet calibrated | — | `droplets.js` | — |
| `θ` | apparatus tilt | rad | drawn ±0.3° | — | — | not yet calibrated | — | `apparatus.js` | 9 |

## 6. Electrical

| symbol | definition | unit | default | range | source | status | uncertainty | code | sens. |
|---|---|---|---|---|---|---|---|---|---|
| `V_plate` | upper minus lower potential | V | user | −600…600 | — | — | mode-dependent | `apparatus.js` | **2** |
| `g_V` | voltage gain error | — | drawn | ±0.002 modern | — | not yet calibrated | — | `calibration.js` | 2 |
| `o_V` | voltage offset error | V | drawn | ±0.1 modern | — | not yet calibrated | — | `calibration.js` | 2 |

## 7. Droplet generation

| symbol | definition | unit | default | range | source | status | uncertainty | code | sens. |
|---|---|---|---|---|---|---|---|---|---|
| `r_med` | log-normal median radius | m | 5.5e-7 | 2e-7…1.5e-6 | — | **not yet calibrated** | — | `droplets.js` | — |
| `σ_g` | geometric SD of radius | — | 1.45 | 1.1–2.0 | — | **not yet calibrated** | — | `droplets.js` | — |
| `P(neutral)` | neutral fraction | — | 0.12 | 0–0.5 | — | **not yet calibrated** | — | `droplets.js` | — |
| `P(neg)` | negative-sign fraction | — | 0.80 | 0–1 | — | **not yet calibrated** | — | `droplets.js` | — |
| `p_n` | `P(\|n\|=k) ∝ k^(−1.35)` | — | 1.35 | 0.5–3 | — | **not yet calibrated** | — | `droplets.js` | — |
| `λ_ion` | spontaneous charge-change hazard | s⁻¹ | 2e-3 | 0–0.05 | — | **not yet calibrated** | — | `droplets.js` | — |

## 8. Environment

| symbol | definition | unit | default | range | source | status | uncertainty | code | sens. |
|---|---|---|---|---|---|---|---|---|---|
| `T` | chamber temperature (true) | K | 293.15 | 288–303 | — | not yet calibrated | drift ±0.4 K | `apparatus.js` | 4 |
| `p` | chamber pressure (true) | Pa | 101325 | 60k–105k | — | not yet calibrated | drift ±150 Pa | `apparatus.js` | 7 |
| `b_T` | thermometer bias | K | drawn ±0.3 | — | — | not yet calibrated | — | `calibration.js` | 4 |
| `b_p` | barometer bias | Pa | drawn ±120 | — | — | not yet calibrated | — | `calibration.js` | 7 |

## 9. Numerical

| symbol | definition | unit | default | range | source | status | code |
|---|---|---|---|---|---|---|---|
| `Δt_phys` | physics timestep (simulated) | s | 2.0e-3 | 1e-4…1e-2 | design | — | `physics.js` |
| `f_track` | tracker sample rate | Hz | 20 | 5–100 | design | — | `measurement.js` |
| `N_mc` | Monte Carlo draws per measurement | — | 400 | 100–5000 | design | — | `uncertainty.js` |
| `B` | bootstrap replicates | — | 2000 | 200–20000 | design | — | `uncertainty.js` |
| `N_e` | candidate-lattice grid points | — | 4000 | — | design | — | `analysis.js` |
| `n_max` | largest permitted integer assignment | — | 25 | 5–100 | design | — | `analysis.js` |

---

## Summary

Of 40 registered parameters: **5 defined**, **3 sourced**, **8 secondary**,
**24 not yet calibrated**.

That ratio is the honest state of this build. The physics constants are in
reasonable shape; the *apparatus* and *droplet-population* parameters are
invented, which is acceptable for a teaching instrument but means no number this
simulation produces is evidence about any real apparatus.
