"use strict";
/* =====================================================================
   THE MAGNETIC OCEAN — config.js

   Constants, control ranges, presets and the survey-budget accounting.
   Loaded first; everything here is global to the later scripts and also
   exported for node so the model can be tested without a browser.

   ---------------------------------------------------------------------
   UNITS, stated once so the rest of the code can stay terse

     horizontal distance ..... km
     depth / altitude ........ km, positive downward from the sea surface
     age ..................... Ma (millions of years before present)
     half-spreading rate ..... cm/yr, for ONE plate
     full spreading rate ..... cm/yr, the sum of the two half rates
     magnetic anomaly ........ nT
     magnetisation ........... A/m
     angles .................. degrees on screen, radians internally
     ship speed .............. knots
     survey budget ........... ship-hours

   The one conversion that everything else hangs off:

     1 cm/yr for 1 Ma = 10 km          (10 mm/yr x 1e6 yr = 1e4 m)

   so   distance_km = 10 * halfRate_cm_per_yr * age_Ma
   and  a polarity interval of duration D Ma is expressed on ONE side of
   the ridge as a band 10 * halfRate * D km wide.

   NEVER write a half rate where a full rate is meant. The variables
   here are suffixed so the mistake is visible: halfRateLeft,
   halfRateRight, fullRate.
   ===================================================================== */

var MO_VERSION = "0.1.0";
var MO_UPDATED = "Aug 2026";

var DEG = Math.PI / 180;
var RAD = 180 / Math.PI;

/* km of ridge-normal distance produced per (cm/yr) per Ma, on one side */
var KM_PER_CMYR_MA = 10;

/* mu0 * 1e9 / (2*pi): turns the 2-D potential-theory expression, with
   magnetisation in A/m and lengths in km, straight into nT. The length
   unit cancels because the 2-D expression is scale-free in x and z. */
var NT_PER_AM = 200;

var KM_PER_NAUTICAL_MILE = 1.852;

/* ------------------------------------------------------------------
   Small numeric helpers, shared by every later file.
   --------------------------------------------------------------- */
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function finite(v) { return typeof v === "number" && isFinite(v); }
function fmt(v, d) {
  if (!finite(v)) return "—";
  return v.toFixed(d === undefined ? 1 : d);
}
/* A visible failure is the point. Anything that reaches a chart has
   been through here first. */
function assertFinite(arr, where) {
  for (var i = 0; i < arr.length; i++) {
    if (!isFinite(arr[i])) {
      throw new Error("non-finite value at index " + i + " in " + (where || "array"));
    }
  }
  return arr;
}

/* ------------------------------------------------------------------
   THE MAGNETISED LAYER

   Oceanic layer 2A — the extrusive pillow basalts at the top of the
   crust — is the layer that published inversions find sufficient to
   account for marine magnetic anomalies. Half a kilometre thick and a
   few A/m is the standard forward-modelling choice. The exact number is
   PEDAGOGIC: it sets the anomaly amplitude and nothing else, and it is
   held fixed across every preset so that changing the noise level
   changes the signal-to-noise ratio and not the physics.
   --------------------------------------------------------------- */
var LAYER = {
  thicknessKm: 0.5,      /* layer 2A, pedagogic but conventional      */
  magnetisationAm: 6.0   /* A/m; published forward models use 5-10    */
};

/* ------------------------------------------------------------------
   CONTROL RANGES

   Every control the operator can touch, with the range it is allowed,
   the step, and one line saying where the range came from. `hidden`
   marks a parameter that belongs to the world rather than the survey:
   in blind mode the operator never sees it.
   --------------------------------------------------------------- */
var CONTROLS = {
  /* --- the survey: always the operator's --- */
  trackAngleDeg:   { min: 10,  max: 90,  step: 1,    def: 90,  unit: "°",
                     label: "Track angle to ridge",
                     note: "90° is a perpendicular crossing. Below about 25° the ridge-normal component of the track collapses and the survey stops constraining anything." },
  sensorAltitudeKm:{ min: 0.5, max: 5.0, step: 0.1,  def: 2.7, unit: "km",
                     label: "Sensor altitude",
                     note: "Vertical distance from the towed magnetometer down to the top of the magnetised layer. A surface tow over 2.7 km of water is the usual case." },
  sampleSpacingKm: { min: 0.1, max: 4.0, step: 0.1,  def: 0.5, unit: "km",
                     label: "Sample spacing",
                     note: "Along-track distance between readings." },
  trackLengthKm:   { min: 20,  max: 260, step: 5,    def: 160, unit: "km",
                     label: "Track length",
                     note: "Along-track, not ridge-normal. An oblique track covers less ridge-normal ground than its length suggests." },
  trackStartKm:    { min: -140,max: 140, step: 1,    def: -80, unit: "km",
                     label: "Track start (chart east)",
                     note: "Where the transect begins on the operator's chart. The chart origin is arbitrary; the ridge is not at zero." },
  shipSpeedKn:     { min: 4,   max: 14,  step: 0.5,  def: 9,   unit: "kn",
                     label: "Ship speed",
                     note: "Sets how fast the budget is spent and how fast the trace draws." },

  /* --- the instrument and the sea: the operator's, but they degrade data --- */
  noiseNt:         { min: 0,   max: 120, step: 1,    def: 15,  unit: "nT",
                     label: "Instrument noise (1σ)",
                     note: "Gaussian, independent between samples." },
  trendNtPer100km: { min: 0,   max: 400, step: 10,   def: 60,  unit: "nT/100km",
                     label: "Regional trend",
                     note: "A long-wavelength field the survey cannot separate from the crustal signal without fitting it." },
  navJitterKm:     { min: 0,   max: 3.0, step: 0.1,  def: 0.3, unit: "km",
                     label: "Navigation uncertainty (1σ)",
                     note: "The reading is taken where the ship actually was and logged where the ship thought it was." },
  dropoutRate:     { min: 0,   max: 0.30,step: 0.01, def: 0.02,unit: "",
                     label: "Dropout rate",
                     note: "Fraction of readings lost. Lost readings are marked missing, never filled with zero." },

  /* --- the world: hidden in blind mode --- */
  ridgeAxisKm:     { min: -60, max: 60,  step: 0.5,  def: 0,   unit: "km", hidden: true,
                     label: "True ridge axis" },
  halfRateLeftCmYr:{ min: 0.5, max: 8.0, step: 0.1,  def: 2.0, unit: "cm/yr", hidden: true,
                     label: "Left half-spreading rate" },
  halfRateRightCmYr:{min: 0.5, max: 8.0, step: 0.1,  def: 2.0, unit: "cm/yr", hidden: true,
                     label: "Right half-spreading rate" },
  effInclinationDeg:{min: 20,  max: 90,  step: 1,    def: 90,  unit: "°", hidden: true,
                     label: "Effective inclination",
                     note: "Sets how skewed the anomalies are. 90° is the magnetic pole case, where the anomaly is symmetric about each block." }
};

function controlDefaults() {
  var d = {};
  for (var k in CONTROLS) if (CONTROLS.hasOwnProperty(k)) d[k] = CONTROLS[k].def;
  return d;
}

/* ------------------------------------------------------------------
   GENERATING MODELS

   The four things the hidden world can actually be. The operator's job
   in comparison mode is to work out which, and the honest answer is
   sometimes that the survey cannot tell.
   --------------------------------------------------------------- */
var GENERATORS = {
  spreading: {
    key: "spreading",
    label: "Spreading with field reversals",
    short: "Spreading + reversals",
    detail: "New crust forms at an axis, cools through its Curie temperature in the field of the day, and moves away. The field reverses on the chronology in use."
  },
  constantPolarity: {
    key: "constantPolarity",
    label: "Spreading with a constant-polarity field",
    short: "Spreading, no reversals",
    detail: "The crust spreads, but the field never reverses, so every block is normally magnetised. Uniform magnetisation produces almost no anomaly away from the ends of the survey."
  },
  staticCorrelated: {
    key: "staticCorrelated",
    label: "Stationary crust, spatially correlated magnetisation",
    short: "Static correlated",
    detail: "No spreading at all. Magnetisation varies along the profile as a seeded correlated random field with a characteristic length scale. It can look strikingly like stripes."
  }
};

/* ------------------------------------------------------------------
   PRESETS

   None of these is named after a real ridge. Every one is a generic
   world built from the parameters above; nothing here claims to
   reproduce a measured survey. Rates are stated as HALF rates.
   --------------------------------------------------------------- */
var PRESETS = [
  {
    key: "clean",
    name: "Clean symmetric ridge",
    line: "Equal half rates, a perpendicular crossing, an instrument behaving itself.",
    world: { generator: "spreading", ridgeAxisKm: 0, halfRateLeftCmYr: 2.0, halfRateRightCmYr: 2.0,
             effInclinationDeg: 90, chronology: "published" },
    survey: { trackAngleDeg: 90, sensorAltitudeKm: 2.7, sampleSpacingKm: 0.5,
              trackLengthKm: 160, trackStartKm: -80, shipSpeedKn: 9,
              noiseNt: 12, trendNtPer100km: 30, navJitterKm: 0.1, dropoutRate: 0.0 }
  },
  {
    key: "slow",
    name: "Slow-spreading ridge",
    line: "0.9 cm/yr each side. The short subchrons are compressed into bands a few km wide and the sensor altitude blurs them together.",
    world: { generator: "spreading", ridgeAxisKm: 0, halfRateLeftCmYr: 0.9, halfRateRightCmYr: 0.9,
             effInclinationDeg: 90, chronology: "published" },
    survey: { trackAngleDeg: 90, sensorAltitudeKm: 2.7, sampleSpacingKm: 0.4,
              trackLengthKm: 80, trackStartKm: -40, shipSpeedKn: 9,
              noiseNt: 15, trendNtPer100km: 40, navJitterKm: 0.2, dropoutRate: 0.01 }
  },
  {
    key: "fast",
    name: "Fast-spreading ridge",
    line: "5 cm/yr each side. The same chronology, spread over five times the distance, at the same sample spacing.",
    world: { generator: "spreading", ridgeAxisKm: 0, halfRateLeftCmYr: 5.0, halfRateRightCmYr: 5.0,
             effInclinationDeg: 90, chronology: "published" },
    survey: { trackAngleDeg: 90, sensorAltitudeKm: 2.7, sampleSpacingKm: 0.8,
              trackLengthKm: 240, trackStartKm: -120, shipSpeedKn: 10,
              noiseNt: 15, trendNtPer100km: 40, navJitterKm: 0.2, dropoutRate: 0.01 }
  },
  {
    key: "asymmetric",
    name: "Asymmetric ridge",
    line: "1.4 cm/yr west, 2.8 cm/yr east. The same reversal sequence, drawn at two different scales either side of the axis.",
    world: { generator: "spreading", ridgeAxisKm: 0, halfRateLeftCmYr: 1.4, halfRateRightCmYr: 2.8,
             effInclinationDeg: 90, chronology: "published" },
    survey: { trackAngleDeg: 90, sensorAltitudeKm: 2.7, sampleSpacingKm: 0.5,
              trackLengthKm: 180, trackStartKm: -70, shipSpeedKn: 9,
              noiseNt: 15, trendNtPer100km: 50, navJitterKm: 0.2, dropoutRate: 0.02 }
  },
  {
    key: "oblique",
    name: "Oblique survey",
    line: "A 35° crossing. Every band is stretched along the track by 1/sin(35°) ≈ 1.74, and a rate read straight off the trace is wrong by that factor.",
    world: { generator: "spreading", ridgeAxisKm: 0, halfRateLeftCmYr: 2.2, halfRateRightCmYr: 2.2,
             effInclinationDeg: 90, chronology: "published" },
    survey: { trackAngleDeg: 35, sensorAltitudeKm: 2.7, sampleSpacingKm: 0.7,
              trackLengthKm: 250, trackStartKm: -70, shipSpeedKn: 10,
              noiseNt: 15, trendNtPer100km: 50, navJitterKm: 0.3, dropoutRate: 0.02 }
  },
  {
    key: "noisy",
    name: "Noisy old instrument",
    line: "A strong regional trend, 55 nT of noise, one reading in eight lost, and navigation good to about a kilometre.",
    world: { generator: "spreading", ridgeAxisKm: 0, halfRateLeftCmYr: 2.4, halfRateRightCmYr: 2.0,
             effInclinationDeg: 55, chronology: "published" },
    survey: { trackAngleDeg: 78, sensorAltitudeKm: 3.2, sampleSpacingKm: 1.2,
              trackLengthKm: 200, trackStartKm: -100, shipSpeedKn: 8,
              noiseNt: 55, trendNtPer100km: 260, navJitterKm: 1.0, dropoutRate: 0.12 }
  },
  {
    key: "null",
    name: "Null world",
    line: "A ridge in the bathymetry, and magnetisation that is correlated in space but organised by nothing. There is no spreading rate to find. Saying so is the correct answer.",
    world: { generator: "staticCorrelated", ridgeAxisKm: 0, halfRateLeftCmYr: 2.0, halfRateRightCmYr: 2.0,
             effInclinationDeg: 90, chronology: "published", correlationKm: 11 },
    survey: { trackAngleDeg: 90, sensorAltitudeKm: 2.7, sampleSpacingKm: 0.5,
              trackLengthKm: 180, trackStartKm: -90, shipSpeedKn: 9,
              noiseNt: 15, trendNtPer100km: 40, navJitterKm: 0.2, dropoutRate: 0.02 }
  },
  {
    key: "noreversals",
    name: "Spreading, no reversals",
    line: "Crust is manufactured at an axis and carried away, but the field holds one polarity throughout. Almost nothing happens on the magnetometer.",
    world: { generator: "constantPolarity", ridgeAxisKm: 0, halfRateLeftCmYr: 2.0, halfRateRightCmYr: 2.0,
             effInclinationDeg: 90, chronology: "published" },
    survey: { trackAngleDeg: 90, sensorAltitudeKm: 2.7, sampleSpacingKm: 0.5,
              trackLengthKm: 160, trackStartKm: -80, shipSpeedKn: 9,
              noiseNt: 12, trendNtPer100km: 30, navJitterKm: 0.1, dropoutRate: 0.0 }
  }
];

function presetByKey(k) {
  for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].key === k) return PRESETS[i];
  return PRESETS[0];
}

/* ------------------------------------------------------------------
   MODES
   --------------------------------------------------------------- */
var MODES = {
  guided: {
    key: "guided",
    name: "Guided discovery",
    tag: "Under 10 minutes",
    line: "One clean ridge, a perpendicular crossing, and an explanation at every step. You still have to commit to an interpretation before the geology is shown.",
    revealWorld: false,
    guided: true,
    budgetHours: 40,
    transects: 1,
    preset: "clean"
  },
  blind: {
    key: "blind",
    name: "Blind survey",
    tag: "The inverse problem",
    line: "The axis, the rates, the symmetry and the polarity history are all hidden. You have a finite budget of ship-hours and you decide where to spend it.",
    revealWorld: false,
    guided: false,
    budgetHours: 60,
    transects: 3,
    preset: "random"
  },
  compare: {
    key: "compare",
    name: "Model comparison",
    tag: "Which explanation survives",
    line: "Four candidate explanations, each generating its own prediction from your data. The point is that the best-looking fit is not automatically the best-supported model.",
    revealWorld: false,
    guided: false,
    budgetHours: 80,
    transects: 4,
    preset: "random"
  },
  lab: {
    key: "lab",
    name: "Laboratory",
    tag: "Nothing hidden",
    line: "Every parameter of the hidden world exposed, including the ones the other modes conceal. For checking how the forward model behaves, not for testing yourself.",
    revealWorld: true,
    guided: false,
    budgetHours: 999,
    transects: 6,
    preset: "clean"
  }
};
var MODE_KEYS = ["guided", "blind", "compare", "lab"];

/* ------------------------------------------------------------------
   BUDGET

   The trackline costs ship-hours. Sample spacing and sensor altitude do
   not: they are free choices about how to use a line you are paying for
   either way.
   --------------------------------------------------------------- */
function transectCostHours(lengthKm, speedKn) {
  var kmh = speedKn * KM_PER_NAUTICAL_MILE;
  if (!(kmh > 0)) return Infinity;
  return lengthKm / kmh;
}

/* ------------------------------------------------------------------
   GUIDED SCRIPT
   Seven steps, matching the seven stages of the instrument. Text only;
   screens.js decides when each is shown.
   --------------------------------------------------------------- */
var GUIDED_STEPS = [
  { id: "design", title: "Design the survey",
    body: "You have a chart, a ship and a magnetometer on a tow cable. The chart shows a rise in the seafloor running roughly north–south: an echo sounder found it, and that is all anyone knows about it. Set the track across it and decide how often to take a reading." },
  { id: "collect", title: "Collect the measurements",
    body: "The magnetometer reads the strength of the total magnetic field. Almost all of that is the Earth's main field, which has been subtracted already. What is left is the anomaly — the part contributed by rocks — plus whatever the instrument and the sea are adding." },
  { id: "inspect", title: "Inspect the profile",
    body: "This is not a picture of the seafloor. It is one number per kilometre. Look for a centre of symmetry, and for whether the wiggles either side of it are the same wiggles in the same order." },
  { id: "compare", title: "Compare explanations",
    body: "Pick a ridge axis and a half-spreading rate. The instrument builds the crust those numbers imply, computes what a magnetometer would have measured over it, and shows you the difference. Structure left in the residual is the model failing." },
  { id: "commit", title: "Commit",
    body: "Write down what you think before you are allowed to see. This is the only part that makes the exercise an experiment rather than a demonstration." },
  { id: "reveal", title: "Reveal",
    body: "The hidden crust, the true axis, the true rates. Compare them with what you wrote. The size of the gap is the result." },
  { id: "limits", title: "Read the limits",
    body: "What this instrument left out, and what a single transect can and cannot establish." }
];

/* ---------------- exports ---------------- */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MO_VERSION: MO_VERSION, MO_UPDATED: MO_UPDATED,
    DEG: DEG, RAD: RAD,
    KM_PER_CMYR_MA: KM_PER_CMYR_MA, NT_PER_AM: NT_PER_AM,
    KM_PER_NAUTICAL_MILE: KM_PER_NAUTICAL_MILE,
    clamp: clamp, finite: finite, fmt: fmt, assertFinite: assertFinite,
    LAYER: LAYER, CONTROLS: CONTROLS, controlDefaults: controlDefaults,
    GENERATORS: GENERATORS, PRESETS: PRESETS, presetByKey: presetByKey,
    MODES: MODES, MODE_KEYS: MODE_KEYS,
    transectCostHours: transectCostHours, GUIDED_STEPS: GUIDED_STEPS
  };
}
