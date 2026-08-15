"use strict";
/* =====================================================================
   INSIDE THE ATOM — config.js

   Constants, target table, control ranges and presets. Loaded first;
   everything here is global to the later scripts, and also exported for
   node so the model can be tested without a browser.

   UNITS, stated once so the rest of the code can stay terse:

     energy .............. MeV (alpha-particle kinetic energy)
     charge product ...... via k·e² = 1.439964 MeV·fm
     b ................... fm   (head-on distance of closest approach)
     foil thickness ...... cm internally, nm in the interface
     n ................... atoms cm⁻³
     n·t ................. atoms cm⁻² (areal density — the only combination
                           the scattering law actually cares about)
     impact parameter .... cm
     angles .............. radians internally, degrees everywhere on screen
     solid angle ......... steradian

   PROVENANCE TAGS used throughout: every number below is one of
     documented  — read off a primary source or a standard constant table
     pedagogical — chosen so the instrument is operable, not historical
   ===================================================================== */

var VERSION = "0.1.0";
var UPDATED = "Aug 2026";

/* ---------------- tiny helpers ---------------- */
var $ = function (id) { return (typeof document !== "undefined") ? document.getElementById(id) : null; };
var clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
var DEG = 180 / Math.PI;
var RAD = Math.PI / 180;

/* Guard used at every boundary where a number leaves the model. A screen
   should never be asked to render NaN, and an export should never carry
   one out of the instrument. */
function finite(v, fallback) {
  return (typeof v === "number" && isFinite(v)) ? v : (fallback === undefined ? 0 : fallback);
}

function fmt(v, d) {
  if (!isFinite(v)) return "—";
  var p = Math.pow(10, d || 0);
  return String(Math.round(v * p) / p);
}

/* Significant-figure formatting for quantities spanning many decades. */
function sig(v, n) {
  if (!isFinite(v) || v === 0) return v === 0 ? "0" : "—";
  n = n || 3;
  var e = Math.floor(Math.log10(Math.abs(v)));
  if (e < -3 || e >= 6) {
    var m = v / Math.pow(10, e);
    return (Math.round(m * Math.pow(10, n - 1)) / Math.pow(10, n - 1)) + "e" + e;
  }
  var p = Math.pow(10, Math.max(0, n - 1 - e));
  return String(Math.round(v * p) / p);
}

/* ---------------- physical constants ---------------- */

/* k·e² — the Coulomb constant times the elementary charge squared, in the
   units that make Rutherford's b come out in femtometres directly.
   CODATA-derived standard value.                          [documented] */
var K_E2_MEV_FM = 1.439964;

var N_AVOGADRO   = 6.02214076e23;   /* mol⁻¹, exact by SI definition  [documented] */
var Z_ALPHA      = 2;               /* charge number of the α particle [documented] */
var M_ALPHA_MEV  = 3727.3794;       /* α rest energy, MeV              [documented] */
var C_CM_S       = 2.99792458e10;   /* cm s⁻¹, exact                   [documented] */
var FM_PER_CM    = 1e13;

/* The α particle of radium C′ (²¹⁴Po) — the source Geiger and Marsden
   used for the quantitative work of 1913. The decay Q-value is
   7.833 MeV; the α carries 7.833 × 210/214 = 7.687 MeV and the recoiling
   ²¹⁰Pb takes the rest.                                    [documented] */
var E_RAC_PRIME = 7.687;

/* The velocity Geiger and Marsden themselves quote for that particle,
   2.06 × 10⁹ cm s⁻¹, implies 8.80 MeV on the modern α mass. Their
   velocity scale came from Geiger's range–velocity relation u³ = aR and
   the constants of 1913. Both numbers are offered; the difference is
   real and is discussed on the methods page.               [documented] */
var U_GM1913_CM_S = 2.06e9;

/* ---------------- targets ---------------- */
/* Z and A are modern values. Densities are standard reference values at
   room temperature. Every metal listed here appears in the Geiger and
   Marsden reflector table of 1909, the foil table of 1913, or both.

   `gm1909` is the observed scintillation rate per minute from a thick
   plate of that metal, Geiger and Marsden 1909, Table on p. 497. It is
   carried here so the instrument can show the historical ordering
   beside its own; it is data, not a model parameter.       [documented] */
var TARGETS = [
  { key: "au", name: "Gold",      sym: "Au", Z: 79, A: 196.967, density: 19.32, gm1909: 67,   in1913: true },
  { key: "pt", name: "Platinum",  sym: "Pt", Z: 78, A: 195.084, density: 21.45, gm1909: 63,   in1913: true },
  { key: "pb", name: "Lead",      sym: "Pb", Z: 82, A: 207.2,   density: 11.34, gm1909: 62,   in1913: false },
  { key: "sn", name: "Tin",       sym: "Sn", Z: 50, A: 118.710, density: 7.287, gm1909: 34,   in1913: true },
  { key: "ag", name: "Silver",    sym: "Ag", Z: 47, A: 107.868, density: 10.49, gm1909: 27,   in1913: true },
  { key: "cu", name: "Copper",    sym: "Cu", Z: 29, A: 63.546,  density: 8.96,  gm1909: 14.5, in1913: true },
  { key: "fe", name: "Iron",      sym: "Fe", Z: 26, A: 55.845,  density: 7.874, gm1909: 10.2, in1913: false },
  { key: "al", name: "Aluminium", sym: "Al", Z: 13, A: 26.982,  density: 2.699, gm1909: 3.4,  in1913: true },
  { key: "c",  name: "Carbon",    sym: "C",  Z: 6,  A: 12.011,  density: 2.10,  gm1909: null, in1913: true }
];

function targetByKey(k) {
  for (var i = 0; i < TARGETS.length; i++) if (TARGETS[i].key === k) return TARGETS[i];
  return TARGETS[0];
}

/* ---------------- the two models ---------------- */
/* Non-colour distinctions carry the model identity everywhere: a line
   style, a marker glyph and a hatch pattern, so the two are separable in
   greyscale, in either theme, and for a colour-blind reader. */
var MODELS = {
  rutherford: {
    key: "rutherford", name: "Rutherford nuclear",
    short: "Nuclear",
    dash: [], marker: "circle", token: "orange",
    note: "Charge and mass concentrated in a centre small compared with the atom. Single close encounters produce the large deflections."
  },
  thomson: {
    key: "thomson", name: "Thomson diffuse charge",
    short: "Diffuse",
    dash: [6, 4], marker: "square", token: "teal",
    note: "Positive charge spread through the whole atomic volume. Deflection accumulates from many tiny encounters."
  }
};
var MODEL_KEYS = ["rutherford", "thomson"];

/* ---------------- control ranges ---------------- */
/* `step` is also the keyboard increment. Every slider is operable from
   the keyboard with arrow keys, and Home/End go to the ends. */
var CONTROLS = {
  /* Exposure size is logarithmic. Geiger and Marsden counted about
     100,000 scintillations in total across the whole 1913 programme,
     over several weeks, from a source of 100 millicuries; the number of
     α particles that actually crossed the foil in that time was many
     orders of magnitude larger. An exposure here is a number of
     particles delivered, not a length of time.                         */
  particles:  { log: true, min: 4, max: 10, step: 0.1, def: 8,
                label: "Particles per exposure", unit: "" },
  energy:     { min: 3.0,  max: 10.0,   step: 0.1,  def: E_RAC_PRIME, label: "Alpha energy", unit: "MeV" },
  thickness:  { min: 20,   max: 4000,   step: 10,   def: 210,   label: "Foil thickness", unit: "nm" },
  detAngle:   { min: 0,    max: 180,    step: 1,    def: 45,    label: "Detector angle", unit: "°" },
  detWidth:   { min: 1,    max: 20,     step: 0.5,  def: 5,     label: "Detector angular radius", unit: "°" },
  efficiency: { min: 0.1,  max: 1.0,    step: 0.01, def: 0.85,  label: "Detector efficiency", unit: "" },
  background: { min: 0,    max: 20,     step: 0.1,  def: 2.0,   label: "Background rate", unit: "per 10⁹ fired" },
  beamSpread: { min: 0,    max: 5,      step: 0.1,  def: 0.5,   label: "Beam angular spread", unit: "°" },
  seed:       { min: 1,    max: 999999, step: 1,    def: 1909,  label: "Seed", unit: "" },
  speed:      { min: 1,    max: 5,      step: 1,    def: 3,     label: "Simulation speed", unit: "" },
  trajDensity:{ min: 0,    max: 100,    step: 5,    def: 40,    label: "Trajectories drawn", unit: "" }
};

/* Detector efficiency of 0.85 is not arbitrary: Geiger and Marsden state
   that with the particular zinc-sulphide screens used, only about 85 per
   cent of the incident α particles were counted (1913, p. 622).
                                                            [documented] */

/* The default thickness, 210 nm = 2.1 × 10⁻⁵ cm, is the gold foil of the
   1913 absolute measurement — "air equivalent 1 mm, actual thickness
   2.1 × 10⁻⁵ cm".                                          [documented] */

/* Beam spread, background rate and simulation speed have no counterpart
   in the papers. They exist so that the instrument can be operated and
   so that a count can be ambiguous.                       [pedagogical] */

var DEFAULTS = {
  model: "rutherford",
  target: "au",
  zOverride: null,
  particles: 1e8,
  energy: CONTROLS.energy.def,
  thickness: CONTROLS.thickness.def,
  detAngle: CONTROLS.detAngle.def,
  detWidth: CONTROLS.detWidth.def,
  efficiency: CONTROLS.efficiency.def,
  background: CONTROLS.background.def,
  beamSpread: CONTROLS.beamSpread.def,
  seed: CONTROLS.seed.def
};

/* ---------------- thresholds ---------------- */
var LARGE_ANGLE_DEG = 90;    /* "turned back" — Geiger and Marsden's own criterion */
var BACKSCATTER_DEG = 150;   /* beyond the largest angle the 1913 apparatus could reach */

/* Single-scattering validity. Rutherford's thin-foil result assumes the
   chance of a second large deflection is negligible. We monitor the
   predicted fraction deflected beyond 5° and warn when it stops being
   small; beyond the hard limit the run is labelled approximate rather
   than refused, because seeing the model fail is instructive. */
var SS_WARN = 0.05;
var SS_FAIL = 0.20;

/* ---------------- presets ---------------- */
/* Every preset declares exactly which fields it sets, so the interface can
   show the changes before they are applied. Nothing is set silently. */
var PRESETS = [
  {
    key: "gold1913", name: "Gold Foil Reconstruction",
    why: "The 1913 configuration: radium C′ alphas on the gold foil of the absolute measurement, 2.1 × 10⁻⁵ cm thick, detector at 45°.",
    set: { model: "rutherford", target: "au", energy: E_RAC_PRIME, thickness: 210,
           detAngle: 45, detWidth: 5, particles: 1e8, efficiency: 0.85, background: 2.0, beamSpread: 0.5 }
  },
  {
    key: "thomson", name: "Thomson Prediction",
    why: "The same foil under the diffuse-charge model. Take a count at five degrees, then at forty-five.",
    set: { model: "thomson", target: "au", energy: E_RAC_PRIME, thickness: 210,
           detAngle: 45, detWidth: 5, particles: 1e8 }
  },
  {
    key: "nuclear", name: "Rutherford Nuclear Scattering",
    why: "The nuclear model at settings matched to the Thomson preset, so the two can be compared directly.",
    set: { model: "rutherford", target: "au", energy: E_RAC_PRIME, thickness: 210,
           detAngle: 45, detWidth: 5, particles: 1e8 }
  },
  {
    key: "large", name: "Large-Angle Search",
    why: "Detector swung past ninety degrees, wide aperture, ten times the exposure. Expect tens of counts, not thousands.",
    set: { model: "rutherford", target: "au", energy: E_RAC_PRIME, thickness: 210,
           detAngle: 135, detWidth: 8, particles: 1e9, background: 2.0 }
  },
  {
    key: "thin", name: "Thin Foil",
    why: "A tenth of the reference thickness. Fewer interactions per particle, and single scattering holds comfortably.",
    set: { target: "au", thickness: 20, particles: 1e9, detAngle: 30, detWidth: 6 }
  },
  {
    key: "thick", name: "Thick Foil",
    why: "Twenty times the reference thickness. More counts — and the single-scattering assumption starts to fail.",
    set: { target: "au", thickness: 4000, particles: 1e8, detAngle: 30, detWidth: 6 }
  },
  {
    key: "lowE", name: "Low-Energy Beam",
    why: "3 MeV. Slower particles turn more easily: b goes as 1/E, so the scattered fraction goes as 1/E².",
    set: { energy: 3.0, target: "au", thickness: 210, detAngle: 60, detWidth: 6, particles: 1e8 }
  },
  {
    key: "highE", name: "High-Energy Beam",
    why: "10 MeV. The same foil, the same detector, roughly an order of magnitude fewer large deflections.",
    set: { energy: 10.0, target: "au", thickness: 210, detAngle: 60, detWidth: 6, particles: 1e8 }
  }
];

function presetByKey(k) {
  for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].key === k) return PRESETS[i];
  return null;
}

/* Human labels for preset diffs. */
var FIELD_LABEL = {
  model: "Atomic model", target: "Foil material", zOverride: "Target charge Z",
  particles: "Particles", energy: "Alpha energy (MeV)", thickness: "Thickness (nm)",
  detAngle: "Detector angle (°)", detWidth: "Detector radius (°)",
  efficiency: "Efficiency", background: "Background (per 10⁵)",
  beamSpread: "Beam spread (°)", seed: "Seed"
};

/* ---------------- historical data carried for overlay ---------------- */
/* Geiger and Marsden 1913, Table II, collected results. Column I is the
   angle of deflexion; the gold and silver columns are the numbers of
   scintillations counted, and the ratio to 1/sin⁴(φ/2) is the constant
   the experiment was testing. Reproduced exactly as published, including
   the fact that the two blocks were taken with different diaphragms and
   are on different arbitrary scales.                       [documented] */
var GM1913_TABLE2 = {
  source: "Geiger & Marsden 1913, Phil. Mag. 25, Table II (p. 610)",
  note: "Two diaphragm settings, on different arbitrary scales. Angles 150°–15° are the wide-beam block; 30°–5° the narrow-beam block.",
  wide: [
    { deg: 150, inv: 1.15,   gold: 33.1,   silver: 22.2 },
    { deg: 135, inv: 1.38,   gold: 43.0,   silver: 27.4 },
    { deg: 120, inv: 1.79,   gold: 51.9,   silver: 33.0 },
    { deg: 105, inv: 2.53,   gold: 69.5,   silver: 47.3 },
    { deg: 75,  inv: 7.25,   gold: 211,    silver: 136 },
    { deg: 60,  inv: 16.0,   gold: 477,    silver: 320 },
    { deg: 45,  inv: 46.6,   gold: 1435,   silver: 989 },
    { deg: 37.5,inv: 93.7,   gold: 3300,   silver: 1760 },
    { deg: 30,  inv: 223,    gold: 7800,   silver: 5260 },
    { deg: 22.5,inv: 690,    gold: 27300,  silver: 20300 },
    { deg: 15,  inv: 3445,   gold: 132000, silver: 105400 }
  ],
  narrow: [
    { deg: 30,  inv: 223,    gold: 3.1,   silver: 5.3 },
    { deg: 22.5,inv: 690,    gold: 8.4,   silver: 16.6 },
    { deg: 15,  inv: 3445,   gold: 48.2,  silver: 93.0 },
    { deg: 10,  inv: 17330,  gold: 200,   silver: 508 },
    { deg: 7.5, inv: 54650,  gold: 607,   silver: 1710 },
    { deg: 5,   inv: 276300, gold: 3320,  silver: null }
  ]
};

/* The single absolute number in the 1913 paper, used as the model's one
   external check. "The fraction of incident Ra C α particles
   (u = 2.06 × 10⁹ cm/sec) scattered through an angle of 45° and observed
   on an area of 1 sq. mm. placed normally at a distance of 1 cm from the
   point of incidence of the beam, was 3.7 × 10⁻⁷", using a gold foil of
   actual thickness 2.1 × 10⁻⁵ cm.                          [documented] */
var GM1913_ABSOLUTE = {
  fraction: 3.7e-7,
  angleDeg: 45,
  areaCm2: 0.01,
  distanceCm: 1,
  foilCm: 2.1e-5,
  target: "au",
  uCmS: U_GM1913_CM_S,
  quotedAccuracy: 0.20,
  cite: "Geiger & Marsden 1913, Phil. Mag. 25, p. 622"
};

/* And the 1909 result, quoted by Rutherford in 1911: "about 1/8000 of the
   α particles from radium C falling on a thick plate of platinum are
   scattered back in the direction of the incidence." A thick-plate,
   multiple-scattering measurement — outside this model's validity, and
   carried only so the instrument can say so.               [documented] */
var GM1909_REFLECTION = {
  fraction: 1 / 8000,
  target: "pt",
  cite: "Geiger & Marsden 1909, Proc. Roy. Soc. A 82, p. 499"
};

/* ---------------- guided-reconstruction script ---------------- */
var GUIDED = [
  {
    key: "apparatus", title: "The apparatus",
    body: "A glass tube of radium emanation sits behind a lead shield. Alpha particles leave through a mica window, pass a diaphragm that cuts them into a narrow pencil, and strike a foil a fraction of a micrometre thick. A zinc-sulphide screen and a microscope, mounted together on a graduated platform, can be swung to any angle around the foil. An observer sitting in the dark counts flashes.",
    aside: "The trajectories drawn on the apparatus view are the simulation showing you its own working. Geiger and Marsden saw nothing but the flashes."
  },
  {
    key: "predict", title: "Before you look",
    body: "The foil is roughly two thousand atoms thick and the alpha particles arrive with about eight million electron-volts each. Of the particles that reach the foil, what fraction do you expect to come back out on the side they went in — turned through more than ninety degrees?",
    aside: "Commit to an answer. It is recorded, and you will be shown it again at the end."
  },
  {
    key: "collect", title: "Collect",
    body: "Take counts at several angles. Small angles first — they are quick and they establish that the beam is doing what you think. Then swing the detector out past ninety degrees and give it a large exposure.",
    aside: "Each exposure is entered in the ledger with its settings and its seed, so any of them can be repeated exactly."
  },
  {
    key: "compare", title: "Compare",
    body: "Both models are now drawn over your points. Small angles do not separate them: a diffuse charge and a concentrated one both scatter forward. The models part company at large angles, where one predicts a small number and the other predicts none at all.",
    aside: "Look at where your uncertainty bars are large. Those are the points that decide nothing."
  },
  {
    key: "why", title: "Why the rare events matter",
    body: "A theory that says a thing is rare and a theory that says it is impossible make the same prediction at every angle where the count is large. They differ only where the count is small — which is exactly where the statistics are worst and the observation costs the most. That is the whole difficulty of the 1909 result, and the reason it took four more years to make it quantitative.",
    aside: "Rutherford's own note is worth keeping: the chance of a second deflection large enough to matter is the square of the chance of the first. That is why a thin foil is the right instrument."
  }
];

/* ---------------- exports ---------------- */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    VERSION: VERSION, UPDATED: UPDATED,
    clamp: clamp, finite: finite, fmt: fmt, sig: sig, DEG: DEG, RAD: RAD,
    K_E2_MEV_FM: K_E2_MEV_FM, N_AVOGADRO: N_AVOGADRO, Z_ALPHA: Z_ALPHA,
    M_ALPHA_MEV: M_ALPHA_MEV, C_CM_S: C_CM_S, FM_PER_CM: FM_PER_CM,
    E_RAC_PRIME: E_RAC_PRIME, U_GM1913_CM_S: U_GM1913_CM_S,
    TARGETS: TARGETS, targetByKey: targetByKey,
    MODELS: MODELS, MODEL_KEYS: MODEL_KEYS,
    CONTROLS: CONTROLS, DEFAULTS: DEFAULTS,
    LARGE_ANGLE_DEG: LARGE_ANGLE_DEG, BACKSCATTER_DEG: BACKSCATTER_DEG,
    SS_WARN: SS_WARN, SS_FAIL: SS_FAIL,
    PRESETS: PRESETS, presetByKey: presetByKey, FIELD_LABEL: FIELD_LABEL,
    GM1913_TABLE2: GM1913_TABLE2, GM1913_ABSOLUTE: GM1913_ABSOLUTE,
    GM1909_REFLECTION: GM1909_REFLECTION, GUIDED: GUIDED
  };
}
