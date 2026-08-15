"use strict";
/* =====================================================================
   BIOSPHERE: CLOSED WORLD — config.js
   Shared constants, reference tables and small helpers.
   Loaded first. Everything here is global to the later scripts.

   Units, stated once so the rest of the code can stay terse:
     carbon .......... kg C
     gases ........... mol
     water ........... litres
     energy .......... kWh (power kW)
     food ............ kg fresh mass, kcal, g protein
     area ............ m2
     time ............ simulated hours; 24 per mission day
   ===================================================================== */

/* ---------- helpers ---------- */
var $      = function (id) { return document.getElementById(id); };
var clamp  = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
var lerp   = function (a, b, t) { return a + (b - a) * t; };
var rnd    = function (a, b) { return a + Math.random() * (b - a); };
var rndi   = function (a, b) { return Math.floor(rnd(a, b + 1)); };
var round  = function (v, d) { var p = Math.pow(10, d || 0); return Math.round(v * p) / p; };
var sum    = function (arr, f) { var t = 0; for (var i = 0; i < arr.length; i++) t += f ? f(arr[i], i) : arr[i]; return t; };
// deterministic-ish noise so sensor jitter is reproducible within a run
function noise(seed) { var x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x) - 0.5; }

/* ---------- the enclosure ---------- */
var ENC = {
  FOOTPRINT:      12700,      // m2 under glass, ~3.14 acres
  AIR_VOLUME:     180000,     // m3 of free atmosphere
  AIR_MOL:        7.356e6,    // mol of gas at 1 atm, 25 C  (PV/RT)
  O2_START:       0.209,      // mole fraction
  CO2_START_PPM:  520,
  LEAK_PER_DAY:   0.0003,     // fraction of the whole atmosphere lost per day
  GLASS_PAR:      0.50,       // fraction of outdoor light reaching the plants
  LATITUDE:       32.6,       // Oracle, Arizona
  START_DOY:      269         // 26 September
};

/* Global calibration handle for soil respiration. This one number decides
   whether the mission loses oxygen at the documented pace, survives
   comfortably, or suffocates by spring. Tuned against the historical decline
   from 20.9 to roughly 14.5 per cent across sixteen months. */
var SOIL_DECAY_SCALE = 0.40;

/* Conversions used constantly. */
var MOL_PER_KG_C = 1000 / 12.011;      // kg C -> mol CO2 (or mol O2 at RQ 1)
var KG_C_PER_MOL = 1 / MOL_PER_KG_C;

/* ---------- biomes ---------- */
/* nppPotential is kg C fixed per m2 per year under ideal light, water and
   temperature. soilC is the initial organic carbon stock — the single most
   consequential number in the whole simulation. */
var BIOMES = [
  { id: "rainforest", name: "Rainforest", area: 1900, colour: "#2f8f52",
    nppPotential: 1.30, soilC: 190000, soilDecay: 5.4e-5, tempOpt: 26, tempSet: 27,
    moistOpt: 0.68, moist: 0.66, temp: 26.5, biomass: 42000, biomassMature: 60000,
    waterHold: 1900 * 1000 * 0.42, water: 1900 * 1000 * 0.42 * 0.66,
    blurb: "Tallest, wettest and the largest single carbon store above ground." },

  { id: "savanna", name: "Savanna", area: 1300, colour: "#b9903f",
    nppPotential: 0.80, soilC: 82000, soilDecay: 4.6e-5, tempOpt: 24, tempSet: 24,
    moistOpt: 0.42, moist: 0.44, temp: 24.5, biomass: 9000, biomassMature: 14000,
    waterHold: 1300 * 900 * 0.34, water: 1300 * 900 * 0.34 * 0.44,
    blurb: "Seasonal grassland. Tolerates drought, resents standing water." },

  { id: "desert", name: "Coastal fog desert", area: 1400, colour: "#c98f6b",
    nppPotential: 0.26, soilC: 33000, soilDecay: 3.8e-5, tempOpt: 25, tempSet: 26,
    moistOpt: 0.18, moist: 0.22, temp: 26.0, biomass: 2600, biomassMature: 5200,
    waterHold: 1400 * 800 * 0.26, water: 1400 * 800 * 0.26 * 0.22,
    blurb: "Designed for fog, not rain. Condensation drifts here and stays." },

  { id: "mangrove", name: "Mangrove marsh", area: 450, colour: "#2f7f74",
    nppPotential: 1.00, soilC: 26000, soilDecay: 6.1e-5, tempOpt: 26, tempSet: 26,
    moistOpt: 0.95, moist: 0.95, temp: 26.2, biomass: 5200, biomassMature: 8000,
    waterHold: 450 * 1000 * 0.55, water: 450 * 1000 * 0.55 * 0.95,
    blurb: "Brackish transition between ocean and land. Anoxic soils, slow decay." },

  { id: "ocean", name: "Ocean", area: 850, colour: "#2f6fb0",
    nppPotential: 0.34, soilC: 9000, soilDecay: 3.0e-5, tempOpt: 25, tempSet: 25,
    moistOpt: 1.0, moist: 1.0, temp: 25.0, biomass: 1400, biomassMature: 2600,
    waterHold: 2650000, water: 2650000,
    blurb: "2.65 million litres, a coral reef, and the atmosphere's second sink." },

  { id: "agriculture", name: "Agriculture", area: 2000, colour: "#6faa3a",
    nppPotential: 1.60, soilC: 288000, soilDecay: 7.8e-5, tempOpt: 25, tempSet: 25,
    moistOpt: 0.60, moist: 0.62, temp: 25.2, biomass: 3000, biomassMature: 9000,
    waterHold: 2000 * 1200 * 0.40, water: 2000 * 1200 * 0.40 * 0.62,
    blurb: "Deliberately rich soil. Feeds eight people and breathes like a furnace." },

  { id: "habitat", name: "Human habitat", area: 1000, colour: "#c08b46",
    nppPotential: 0.02, soilC: 400, soilDecay: 2.0e-5, tempOpt: 23, tempSet: 23,
    moistOpt: 0.4, moist: 0.4, temp: 23.0, biomass: 100, biomassMature: 200,
    waterHold: 20000, water: 8000,
    blurb: "Kitchens, quarters, laboratory, library. Where the crew is a variable." }
];

/* Which biomes actually carry a plant community the player can manage. */
var VEGETATED = ["rainforest", "savanna", "desert", "mangrove", "ocean", "agriculture"];

/* ---------- crops ---------- */
/* yield is kg fresh mass per m2 across one full cycle at ideal conditions;
   the farm-wide FARM_FACTOR then knocks it down to what a glassed-in,
   half-light, pest-pressured farm really delivers. */
var FARM_FACTOR = 1.05;

var CROPS = [
  { id: "sweetpotato", name: "Sweet potato", days: 120, yield: 4.6, kcal: 860,  protein: 16,  fat: 0.5,
    micro: 0.75, water: 4.2, labour: 0.019, nitrogen: -1.0, seedReturn: 1.0, store: 90,  pest: 0.4,
    tempOpt: 26, note: "Reliable calories. The backbone crop, and monotonous." },
  { id: "rice", name: "Paddy rice", days: 115, yield: 0.80, kcal: 3600, protein: 71, fat: 6,
    micro: 0.25, water: 11.0, labour: 0.030, nitrogen: -1.2, seedReturn: 1.0, store: 400, pest: 0.5,
    tempOpt: 27, note: "Thirsty, labour-heavy, and it keeps almost indefinitely." },
  { id: "wheat", name: "Wheat", days: 130, yield: 0.52, kcal: 3400, protein: 123, fat: 15,
    micro: 0.30, water: 3.6, labour: 0.022, nitrogen: -1.3, seedReturn: 1.0, store: 500, pest: 0.35,
    tempOpt: 21, note: "Cool-season grain. Wants light the winter cannot give." },
  { id: "sorghum", name: "Sorghum", days: 118, yield: 0.62, kcal: 3290, protein: 108, fat: 33,
    micro: 0.28, water: 2.6, labour: 0.020, nitrogen: -1.0, seedReturn: 1.0, store: 450, pest: 0.3,
    tempOpt: 28, note: "Drought-tough grain that forgives an irrigation mistake." },
  { id: "beans", name: "Beans", days: 92, yield: 0.38, kcal: 3410, protein: 220, fat: 12,
    micro: 0.45, water: 3.1, labour: 0.026, nitrogen: 1.6, seedReturn: 1.0, store: 420, pest: 0.45,
    tempOpt: 24, note: "Protein and nitrogen fixation in the same plant." },
  { id: "peanut", name: "Peanut", days: 132, yield: 0.34, kcal: 5670, protein: 258, fat: 492,
    micro: 0.40, water: 3.4, labour: 0.028, nitrogen: 1.2, seedReturn: 1.0, store: 300, pest: 0.4,
    tempOpt: 27, note: "Nearly the only source of dietary fat inside the glass." },
  { id: "beet", name: "Beet", days: 88, yield: 3.4, kcal: 430, protein: 16, fat: 1,
    micro: 0.70, water: 3.0, labour: 0.018, nitrogen: -0.8, seedReturn: 1.0, store: 60, pest: 0.3,
    tempOpt: 21, note: "Fast root crop. Tops are edible greens as well." },
  { id: "kale", name: "Kale & greens", days: 58, yield: 2.4, kcal: 490, protein: 43, fat: 9,
    micro: 1.00, water: 2.8, labour: 0.024, nitrogen: -0.9, seedReturn: 0.9, store: 12, pest: 0.55,
    tempOpt: 20, note: "Micronutrient insurance. Will not keep for a week." },
  { id: "taro", name: "Taro", days: 195, yield: 2.5, kcal: 1120, protein: 15, fat: 2,
    micro: 0.35, water: 8.5, labour: 0.021, nitrogen: -0.9, seedReturn: 1.0, store: 70, pest: 0.25,
    tempOpt: 27, note: "Slow, wet, and unbothered by a flooded plot." },
  { id: "banana", name: "Banana", days: 300, yield: 5.2, kcal: 890, protein: 11, fat: 3,
    micro: 0.55, water: 6.0, labour: 0.015, nitrogen: -0.7, seedReturn: 1.0, store: 14, pest: 0.35,
    tempOpt: 28, perennial: true, note: "Occupies a plot for most of a year, then keeps giving." },
  { id: "papaya", name: "Papaya", days: 280, yield: 4.0, kcal: 430, protein: 5, fat: 2,
    micro: 0.85, water: 5.2, labour: 0.014, nitrogen: -0.6, seedReturn: 0.8, store: 10, pest: 0.3,
    tempOpt: 27, perennial: true, note: "Morale and vitamin A, bought with time." },
  { id: "fallow", name: "Fallow / green manure", days: 70, yield: 0, kcal: 0, protein: 0, fat: 0,
    micro: 0, water: 1.4, labour: 0.004, nitrogen: 2.2, seedReturn: 1.0, store: 0, pest: 0.1,
    tempOpt: 24, note: "Grows no food. Rebuilds nitrogen and soil structure." }
];
var CROP_BY_ID = {};
for (var ci = 0; ci < CROPS.length; ci++) CROP_BY_ID[CROPS[ci].id] = CROPS[ci];

/* ---------- crew ---------- */
/* Fictional personnel. They are not portrayals of the historical crew. */
var CREW_POOL = [
  { id: "c1", name: "R. Adeyemi", role: "Systems Engineer",
    skills: { mech: 0.92, farm: 0.42, med: 0.25, sci: 0.60, eco: 0.35 },
    stressTol: 0.72, conflict: "direct",     needs: "wants a written maintenance plan" },
  { id: "c2", name: "H. Vasquez", role: "Agriculture Lead",
    skills: { mech: 0.35, farm: 0.95, med: 0.30, sci: 0.55, eco: 0.62 },
    stressTol: 0.65, conflict: "absorbing",  needs: "protects the seed reserve above all" },
  { id: "c3", name: "N. Ferrante", role: "Medical Officer",
    skills: { mech: 0.22, farm: 0.45, med: 0.94, sci: 0.70, eco: 0.30 },
    stressTol: 0.80, conflict: "mediating",  needs: "will not trade crew health for data" },
  { id: "c4", name: "J. Okonkwo", role: "Marine Biologist",
    skills: { mech: 0.30, farm: 0.40, med: 0.28, sci: 0.85, eco: 0.88 },
    stressTol: 0.58, conflict: "withdrawing", needs: "the reef is a colleague, not an exhibit" },
  { id: "c5", name: "S. Lindqvist", role: "Terrestrial Ecologist",
    skills: { mech: 0.25, farm: 0.58, med: 0.25, sci: 0.88, eco: 0.92 },
    stressTol: 0.62, conflict: "argumentative", needs: "resists harvesting the rainforest" },
  { id: "c6", name: "D. Moreau", role: "Mechanical Technician",
    skills: { mech: 0.88, farm: 0.50, med: 0.20, sci: 0.40, eco: 0.28 },
    stressTol: 0.75, conflict: "direct",     needs: "hoards spares, and is usually right to" },
  { id: "c7", name: "P. Iwasaki", role: "Analytical Chemist",
    skills: { mech: 0.45, farm: 0.35, med: 0.40, sci: 0.95, eco: 0.50 },
    stressTol: 0.68, conflict: "precise",    needs: "distrusts any unduplicated measurement" },
  { id: "c8", name: "T. Bassey", role: "Mission Communications",
    skills: { mech: 0.38, farm: 0.55, med: 0.35, sci: 0.62, eco: 0.45 },
    stressTol: 0.70, conflict: "mediating",  needs: "believes the public record must be complete" },
  { id: "c9", name: "L. Marchetti", role: "Soil Scientist",
    skills: { mech: 0.30, farm: 0.72, med: 0.22, sci: 0.90, eco: 0.78 },
    stressTol: 0.60, conflict: "argumentative", needs: "warned about the soil carbon before closure" },
  { id: "c10", name: "K. Duong", role: "Water Systems Engineer",
    skills: { mech: 0.80, farm: 0.40, med: 0.25, sci: 0.68, eco: 0.42 },
    stressTol: 0.74, conflict: "absorbing",  needs: "measures every litre twice" },
  { id: "c11", name: "A. Solberg", role: "Physician & Nutritionist",
    skills: { mech: 0.20, farm: 0.60, med: 0.90, sci: 0.72, eco: 0.32 },
    stressTol: 0.78, conflict: "mediating",  needs: "keeps a private log of everyone's weight" },
  { id: "c12", name: "M. Oyelaran", role: "Entomologist",
    skills: { mech: 0.28, farm: 0.65, med: 0.24, sci: 0.82, eco: 0.94 },
    stressTol: 0.55, conflict: "withdrawing", needs: "wants pollinators counted weekly" }
];

/* ---------- machinery ---------- */
var MACHINES = [
  { id: "airhandler",  name: "Air handling units",     power: 42, mtbf: 520, repair: 6,  skill: "mech",
    affects: "Gas mixing between biomes, hot-spot control" },
  { id: "chiller",     name: "Chillers",               power: 96, mtbf: 430, repair: 9,  skill: "mech",
    affects: "Biome temperature, condensation rate" },
  { id: "condensate",  name: "Condensate recovery",    power: 14, mtbf: 640, repair: 4,  skill: "mech",
    affects: "Recovers water from cooling coils into storage" },
  { id: "watertreat",  name: "Water treatment",        power: 22, mtbf: 380, repair: 7,  skill: "mech",
    affects: "Potable water, greywater recycling, pathogens" },
  { id: "wastetreat",  name: "Waste treatment marsh",  power: 8,  mtbf: 760, repair: 5,  skill: "eco",
    affects: "Returns human and crop waste to the farm as nutrients" },
  { id: "oceanpump",   name: "Ocean circulation",      power: 31, mtbf: 340, repair: 8,  skill: "mech",
    affects: "Reef health, ocean gas exchange, algae control" },
  { id: "lung",        name: "Pressure lungs",         power: 6,  mtbf: 900, repair: 10, skill: "mech",
    affects: "Absorbs thermal expansion. Failure risks the glass." },
  { id: "growlights",  name: "Supplemental lighting",  power: 0,  mtbf: 700, repair: 3,  skill: "mech",
    affects: "Adds photosynthesis at a large power cost", variablePower: 180 },
  { id: "scrubber",    name: "CO2 scrubber",           power: 0,  mtbf: 600, repair: 6,  skill: "mech",
    affects: "Precipitates atmospheric carbon into stored carbonate", variablePower: 75 },
  { id: "sensors",     name: "Sensor network",         power: 5,  mtbf: 300, repair: 3,  skill: "sci",
    affects: "Measurement confidence. Drift is invisible until checked." }
];

/* ---------- reserves the player buys before closure ---------- */
var RESERVE_ITEMS = [
  { id: "o2",      name: "Emergency oxygen",     unit: "mol", step: 40000, cost: 9,  max: 400000,
    note: "Each 40,000 mol lifts the atmosphere by roughly 0.5 percentage points." },
  { id: "food",    name: "Imported food reserve", unit: "kcal", step: 200000, cost: 6, max: 3000000,
    note: "Sealed rations. Using them breaks food closure but not the atmosphere." },
  { id: "spares",  name: "Spare parts",          unit: "sets", step: 1, cost: 7, max: 20,
    note: "Without a spare set, a failed machine waits for improvisation." },
  { id: "seeds",   name: "Seed reserve",         unit: "%",   step: 10, cost: 4, max: 200,
    note: "Insurance against a failed crop cycle or a seed-borne disease." },
  { id: "medical", name: "Medical supplies",     unit: "kits", step: 1, cost: 5, max: 12,
    note: "Determines how many medical events can be handled internally." },
  { id: "lights",  name: "Supplemental lights",  unit: "banks", step: 1, cost: 8, max: 10,
    note: "Photosynthesis on demand, at 18 kW per bank." },
  { id: "scrub",   name: "Scrubber capacity",    unit: "units", step: 1, cost: 10, max: 6,
    note: "Removes CO2 without touching oxygen. Power hungry." }
];

/* ---------- interface ---------- */
var ALERT_LEVEL = { ADVISORY: 0, WATCH: 1, ACTION: 2, EMERGENCY: 3 };
var ALERT_NAME  = ["Advisory", "Watch", "Action required", "Emergency"];

var DUTIES = [
  { id: "farm",   name: "Agriculture",  skill: "farm", note: "Planting, weeding, harvest, seed saving" },
  { id: "mech",   name: "Maintenance",  skill: "mech", note: "Machinery, seals, plumbing, preventive work" },
  { id: "sci",    name: "Science",      skill: "sci",  note: "Sampling, analysis, keeping the record honest" },
  { id: "eco",    name: "Ecology",      skill: "eco",  note: "Pruning, pest work, reef and marsh care" },
  { id: "dom",    name: "Domestic",     skill: null,   note: "Cooking, cleaning, medical, food processing" }
];

/* Speeds, in simulated hours advanced per real second. */
var SPEEDS = [
  { label: "1×",  hpr: 1 },
  { label: "4×",  hpr: 4 },
  { label: "12×", hpr: 12 },
  { label: "24×", hpr: 24 },
  { label: "72×", hpr: 72 }
];

/* Model provenance labels, shown wherever a number could be mistaken for history. */
var PROVENANCE = {
  historical: { label: "Historical", tone: "hist", note: "Documented from the 1991–1993 closure." },
  estimated:  { label: "Estimated",  tone: "est",  note: "Derived from published ranges, simplified here." },
  designed:   { label: "Model",      tone: "mod",  note: "Invented for playability. Not a historical claim." }
};

if (typeof module !== "undefined") module.exports = { ENC: ENC, BIOMES: BIOMES, CROPS: CROPS };
