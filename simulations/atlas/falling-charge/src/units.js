/* =====================================================================
   THE FALLING CHARGE — SI constants, units, and honest number formatting
   ---------------------------------------------------------------------
   Every quantity in this program is SI. There is no other unit system
   anywhere in the model; the interface converts for display only, at the
   last possible moment, through the helpers at the bottom of this file.

   See docs/PARAMETER_REGISTER.md for the provenance of every value.
   ===================================================================== */
(function (root) {
  "use strict";

  /* ---------------------------------------------------------------
     1. Defined constants (exact, SI 2019)
     ------------------------------------------------------------ */
  const SI = {
    /* The hidden ground truth. Exact by definition since the 2019 SI
       revision; see docs/REFERENCES.md R-7. This value must never be
       read by src/analysis.js or src/measurement.js — the guard is in
       docs/ARCHITECTURE.md §4 and tests/test-no-circularity.js. */
    e:    1.602176634e-19,   // C     elementary charge          [defined]
    kB:   1.380649e-23,      // J/K   Boltzmann constant         [defined]
    NA:   6.02214076e23,     // 1/mol Avogadro constant          [defined]
    R:    8.314462618,       // J/(mol K)  = NA*kB               [defined]
    g:    9.80665,           // m/s²  standard gravity           [defined]
    Mair: 0.0289646          // kg/mol  molar mass of dry air    [sourced]
  };

  /* ---------------------------------------------------------------
     2. Air — Sutherland viscosity constants
        Source: docs/REFERENCES.md R-5. Status: SECONDARY.
     ------------------------------------------------------------ */
  const AIR = {
    etaRef: 1.716e-5,   // Pa s  at tRef
    tRef:   273.15,     // K
    S:      110.4       // K     Sutherland constant
  };

  /* ---------------------------------------------------------------
     3. Cunningham slip-correction coefficient sets
        C_c = 1 + Kn (alpha + beta exp(-gamma/Kn)),  Kn = lambda/r
        See docs/CUNNINGHAM_CORRECTION.md.
     ------------------------------------------------------------ */
  const SLIP = {
    "allen-raabe-1982": {
      alpha: 1.155, beta: 0.471, gamma: 0.596,
      label: "Allen & Raabe 1982",
      note: "Least-squares re-evaluation of Millikan's own oil-drop data. " +
            "Default because it was fitted to oil droplets in this apparatus.",
      source: "REFERENCES.md R-3", status: "secondary"
    },
    "allen-raabe-1985": {
      alpha: 1.142, beta: 0.558, gamma: 0.999,
      label: "Allen & Raabe 1985",
      note: "Measured on solid spherical aerosol particles in an improved " +
            "Millikan apparatus. Offered so the effect of a defensible " +
            "change of coefficients is visible.",
      source: "REFERENCES.md R-2", status: "secondary"
    },
    "none": {
      alpha: null, beta: null, gamma: null,
      label: "None (ordinary Stokes drag)",
      note: "C_c = 1. Available so that hypothesis H7 can be tested: run " +
            "the world with slip and the analysis without it.",
      source: "—", status: "n/a"
    }
  };

  /* ---------------------------------------------------------------
     4. Oil. Both entries are NOT YET CALIBRATED — see the register.
     ------------------------------------------------------------ */
  const OIL = {
    modern:     { rho: 886.0, label: "Light mineral oil (modern teaching)",
                  status: "not yet calibrated" },
    historical: { rho: 919.9, label: "Clock oil (1913, period-inspired)",
                  status: "not yet calibrated" }
  };

  /* ---------------------------------------------------------------
     5. Unit metadata — used for axis labels, table headers and the
        data dictionary, so a unit is never typed by hand twice.
     ------------------------------------------------------------ */
  const U = {
    length:      { si: "m",      sym: "m" },
    time:        { si: "s",      sym: "s" },
    velocity:    { si: "m s⁻¹",  sym: "m/s" },
    mass:        { si: "kg",     sym: "kg" },
    force:       { si: "N",      sym: "N" },
    charge:      { si: "C",      sym: "C" },
    voltage:     { si: "V",      sym: "V" },
    field:       { si: "V m⁻¹",  sym: "V/m" },
    viscosity:   { si: "Pa s",   sym: "Pa·s" },
    density:     { si: "kg m⁻³", sym: "kg/m³" },
    temperature: { si: "K",      sym: "K" },
    pressure:    { si: "Pa",     sym: "Pa" },
    diffusion:   { si: "m² s⁻¹", sym: "m²/s" },
    dimensionless: { si: "—",    sym: "" }
  };

  /* ---------------------------------------------------------------
     6. Display conversion. SI in, human-readable out. One place.
     ------------------------------------------------------------ */
  const disp = {
    micron:  function (m) { return m * 1e6; },        // m -> µm
    mm:      function (m) { return m * 1e3; },        // m -> mm
    umPerS:  function (v) { return v * 1e6; },        // m/s -> µm/s
    kVperM:  function (E) { return E / 1000; },       // V/m -> kV/m
    kPa:     function (p) { return p / 1000; },       // Pa -> kPa
    celsius: function (T) { return T - 273.15; },     // K -> °C
    zC:      function (q) { return q * 1e21; }        // C -> zC (zeptocoulomb)
  };

  /* ---------------------------------------------------------------
     7. Significant figures, done properly.

        Safeguard 27.5 "no false precision": the uncertainty gets one
        significant figure (two if it starts with a 1), and the estimate
        is rounded to the same decimal place. Nothing anywhere in the
        interface prints a derived value more precisely than this.
     ------------------------------------------------------------ */

  /** Decade of the first significant digit. 0.0023 -> -3. */
  function decade(x) {
    x = Math.abs(x);
    if (!isFinite(x) || x === 0) return 0;
    return Math.floor(Math.log10(x));
  }

  /**
   * Round an uncertainty to 1 significant figure, or 2 if the leading
   * digit is 1 (the usual metrological convention: 0.15 keeps both
   * digits, 0.25 becomes 0.3).
   * Returns { value, place } where place is the decimal exponent the
   * estimate should be rounded to.
   */
  function roundUncertainty(u) {
    if (!isFinite(u) || u <= 0) return { value: u, place: 0 };
    const d = decade(u);
    const lead = Math.floor(u / Math.pow(10, d));
    const sig = (lead === 1) ? 2 : 1;
    const place = d - (sig - 1);
    const p = Math.pow(10, place);
    return { value: Math.round(u / p) * p, place: place };
  }

  /**
   * "1.61 ± 0.04" style, with a shared power of ten pulled out front.
   * The single most important formatter in the program.
   *
   *   formatWithUncertainty(1.6134e-19, 4.1e-21, "C")
   *     -> "(1.61 ± 0.04) × 10⁻¹⁹ C"
   */
  function formatWithUncertainty(value, u, unit, opts) {
    opts = opts || {};
    if (!isFinite(value)) return "—";
    if (!isFinite(u) || u <= 0) {
      return sci(value, opts.sigFallback || 4) + (unit ? " " + unit : "");
    }
    const ru = roundUncertainty(u);
    const exp = opts.exp !== undefined ? opts.exp : decade(Math.abs(value));
    const scale = Math.pow(10, exp);
    const dp = Math.max(0, exp - ru.place);
    const v = (value / scale).toFixed(dp);
    const e = (ru.value / scale).toFixed(dp);
    const su = supExp(exp);
    return "(" + v + " ± " + e + ") × 10" + su + (unit ? " " + unit : "");
  }

  /** Scientific notation with a fixed number of significant figures. */
  function sci(x, sig) {
    if (!isFinite(x)) return "—";
    if (x === 0) return "0";
    sig = sig || 3;
    const d = decade(x);
    const m = x / Math.pow(10, d);
    return m.toFixed(Math.max(0, sig - 1)) + " × 10" + supExp(d);
  }

  const SUPS = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
                 "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

  function supExp(n) {
    return String(n).split("").map(function (c) { return SUPS[c] || c; }).join("");
  }

  /** A plain number with n significant figures, no exponent games. */
  function sigFigs(x, n) {
    if (!isFinite(x) || x === 0) return String(x);
    const d = decade(x);
    const p = Math.pow(10, n - 1 - d);
    return String(Math.round(x * p) / p);
  }

  /** Relative uncertainty as a percentage string, one or two figures. */
  function relPct(value, u) {
    if (!isFinite(value) || value === 0 || !isFinite(u)) return "—";
    const r = Math.abs(u / value) * 100;
    return (r < 1 ? r.toFixed(2) : r < 10 ? r.toFixed(1) : r.toFixed(0)) + " %";
  }

  /* Simulated seconds as mm:ss.s — the bench clock. */
  function clock(t) {
    if (!isFinite(t)) return "--:--";
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return String(m).padStart(2, "0") + ":" + (s < 10 ? "0" : "") + s.toFixed(1);
  }

  const API = {
    SI: SI, AIR: AIR, SLIP: SLIP, OIL: OIL, U: U, disp: disp,
    decade: decade, roundUncertainty: roundUncertainty,
    formatWithUncertainty: formatWithUncertainty,
    sci: sci, sigFigs: sigFigs, supExp: supExp, relPct: relPct, clock: clock
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.FC = root.FC || {};
  root.FC.units = API;

})(typeof globalThis !== "undefined" ? globalThis : this);
