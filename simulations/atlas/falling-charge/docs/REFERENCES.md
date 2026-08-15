# References

Sources actually consulted for this build. Where a value was taken from a
secondary summary rather than read in the primary paper, that is stated. Nothing
here is invented, and no citation is included that was not checked.

---

**R-1 · Millikan's experiment**
Millikan, R. A. (1913). "On the Elementary Electrical Charge and the Avogadro
Constant." *Physical Review*, **2**(2), 109–143. DOI: 10.1103/PhysRev.2.109.
<https://link.aps.org/doi/10.1103/PhysRev.2.109>
A scan is available via the Caltech authors library,
<https://authors.library.caltech.edu/records/sfc90-k2g07>, and the ADS record is
<https://ui.adsabs.harvard.edu/abs/1913PhRv....2..109M>.
*Used for:* the experimental logic, the historical framing, and the clock-oil
density used in historical mode.
*Verification status:* citation and pagination verified. **The oil density
figure and the apparatus dimensions used in historical mode have not been read
from the primary text in this build** — they are marked *Not yet calibrated* in
`PARAMETER_REGISTER.md`.

**R-2 · Slip correction, solid particles**
Allen, M. D. & Raabe, O. G. (1985). "Slip Correction Measurements of Spherical
Solid Aerosol Particles in an Improved Millikan Apparatus." *Aerosol Science and
Technology*, **4**(3), 269–286. DOI: 10.1080/02786828508959055.
*Used for:* the alternative coefficient set α = 1.142, β = 0.558, γ = 0.999.
*Verification status:* coefficients and standard errors taken from published
summaries of this paper, not from the paper itself.

**R-3 · Slip correction, re-evaluation of Millikan's oil-drop data**
Allen, M. D. & Raabe, O. G. (1982). "Re-evaluation of Millikan's oil drop data
for the motion of small particles in air." *Journal of Aerosol Science*,
**13**(6), 537–547. DOI: 10.1016/0021-8502(82)90019-2.
*Used for:* the **default** coefficient set α = 1.155, β = 0.471, γ = 0.596.
*Verification status:* coefficients taken from published summaries. The stated
validity range has **not** been verified — see `CUNNINGHAM_CORRECTION.md` §4.

**R-4 · The commonly quoted engineering coefficient set**
The values α = 1.257, β = 0.400, γ = 1.100 are widely used in aerosol
engineering. Deliberately **not** offered in this simulation; see
`CUNNINGHAM_CORRECTION.md` §3.4.

**R-5 · Sutherland's formula for air viscosity**
Standard form with `η_ref = 1.716 × 10⁻⁵ Pa s` at `T_ref = 273.15 K` and
Sutherland constant `S = 110.4 K`. These are the conventional air constants,
reproduced in many fluid-dynamics references (e.g. the CFD-Online wiki entry on
Sutherland's law, <https://www.cfd-online.com/Wiki/Sutherland's_law>, and the
Wolfram Formula Repository entry for Sutherland's formula).
*Verification status:* **secondary sources only.** No primary metrological
source has been consulted. Marked *Not yet calibrated* accordingly.

**R-6 · Mean free path of air**
Established theoretical expressions give 66.3–67.3 nm for air at 300 K and
1 atm. A 2023 molecular-dynamics study reports a substantially different value
of 38.5 ± 1 nm, so this quantity is **not settled**:
Tsalikis et al. (2023), "Dynamics of molecular collisions in air and its mean
free path," *Physics of Fluids* **35**, 097131.
<https://pubs.aip.org/aip/pof/article/35/9/097131/2911715/>
See also "A new equation for the mean free path of air," *Aerosol Science and
Technology* (2024), <https://www.tandfonline.com/doi/full/10.1080/02786826.2024.2333859>.
*Used for:* a sanity check on the kinetic-theory expression in
`PHYSICS_MODEL.md` §7.3, which yields ≈ 65 nm. The disagreement in the
literature is disclosed in `LIMITATIONS.md` L-6.

**R-7 · Elementary charge, modern SI**
`e = 1.602 176 634 × 10⁻¹⁹ C`, **exact by definition** since the 2019 revision of
the SI. NIST CODATA value page: <https://physics.nist.gov/cgi-bin/cuu/Value?e>.
*Used for:* the hidden ground truth, and for the methodological distinction in
`RESEARCH_QUESTION.md`.

**R-8 · The SI definition of the ampere**
The ampere is defined by fixing the numerical value of the elementary charge.
The authoritative text is the BIPM SI Brochure (9th edition, 2019),
<https://www.bipm.org/en/publications/si-brochure>.
*Verification status:* **the brochure text has not been fetched and quoted in
this build.** The statement above is the standard summary of the 2019 revision.
Marked *Not yet calibrated* until the primary text is cited directly.

**R-9 · Boltzmann constant and molar gas constant**
`k_B = 1.380 649 × 10⁻²³ J K⁻¹` (exact, SI 2019);
`R = 8.314 462 618 … J mol⁻¹ K⁻¹` (exact, `R = N_A k_B`);
`g_n = 9.806 65 m s⁻²` (standard gravity, defined).
Source: NIST fundamental physical constants, <https://physics.nist.gov/cuu/Constants/>.

**R-10 · Teaching-laboratory practice**
MIT Junior Lab experiment guide for the Millikan oil drop experiment,
<https://web.mit.edu/8.13/www/JLExperiments/JLExp02.pdf>, consulted for
plausible modern apparatus parameters (plate spacing, voltage range, droplet
sizes).
*Verification status:* consulted as a sanity check on ranges only; **no specific
numeric value in this simulation is taken from it**, and the apparatus
parameters remain *Not yet calibrated*.

---

## Not cited, deliberately

No citation appears in this project for: the atomiser size distribution, the
charge-magnitude distribution, the ionisation hazard rate, instrument error
magnitudes, or reaction-time statistics. These are **invented modelling
choices**. They are listed as such in `PARAMETER_REGISTER.md` with status
*Not yet calibrated*, and inventing a citation for them would be worse than
admitting it.
