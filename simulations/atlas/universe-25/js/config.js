"use strict";
/* =====================================================================
   config.js — shared constants, tuning, and small helpers.
   Loaded first; everything below is visible to the later scripts.
   ===================================================================== */

// Mental states an agent can occupy.
var STATE = { NORMAL:0, STRESSED:1, WITHDRAWN:2, AGGRESSIVE:3, BEAUTIFUL:4 };
var STATE_COLOR = { 0:"#3fb96b", 1:"#e8c447", 2:"#4a7bff", 3:"#e5484d", 4:"#c96bd8" };
var STATE_NAME  = { 0:"Normal", 1:"Stressed", 2:"Withdrawn", 3:"Aggressive", 4:"Beautiful One" };
// Reading order for the behaviour distribution / stacked history.
var STATE_ORDER = [0, 1, 3, 2, 4];

// Small helpers.
var rnd   = (a,b)=>a+Math.random()*(b-a);
var rndi  = (a,b)=>Math.floor(rnd(a,b+1));
var clamp = (v,lo,hi)=>Math.max(lo,Math.min(hi,v));
var $     = id=>document.getElementById(id);

// Time is compressed vs a real colony so a full rise-and-fall is watchable.
var CFG = {
  ADULT_AGE: 45,
  MAX_AGE: 260,
  HUNGER_RATE: 0.42,   // hunger rises per tick — must travel to a food source
  THIRST_RATE: 0.5,    // thirst rises per tick — must travel to a water source
  ENERGY_RATE: 0.3,
  SEEK_HUNGER: 55,     // hunger above this: go find food
  SEEK_THIRST: 50,     // thirst above this: go find water
  DEPRIVE: 88,         // hunger/thirst above this drains health (weaken then die)
  DEPRIVE_DMG: 0.9,    // health lost per tick while deprived
  RECOVER: 0.3,        // health regained per tick when fed & watered
  PREG_DURATION: 26,
  MAX_DENSITY: 0.85,
};
var FOOD_COLOR  = "#5fbf5a"; // vegetation green
var WATER_COLOR = "#2f86c9"; // water blue

// Terrain / resource tuning.
var TERR = {
  VEG_MAX: 100,
  VEG_EAT: 20,         // vegetation consumed per feeding (finite mode)
  VEG_GROW: 12,        // regrowth added per growth interval (finite)
  VEG_SPREAD: 0.4,     // chance a lush veg cell seeds a neighbour (finite)
  GROW_INTERVAL: 25,   // ticks between growth/recession updates
  RECEDE_RATE: 0.03,   // fraction of shoreline dried per interval (finite)
  EAT_GAIN: 55,        // hunger reduced by a feeding
  DRINK_GAIN: 60,      // thirst reduced by a drink
  RIVER_FLOW: 0.05,    // river level regained per interval (steady inflow)
  RIVER_USE: 0.0005,   // river level lost per drink (overuse depletes it)
};
var DIRS8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
var DIRS4 = [[1,0],[-1,0],[0,1],[0,-1]];

// Predator (cat) tuning — balanced by headless testing for coexistence.
var PRED = {
  ADULT_AGE: 60,
  MAX_AGE: 650,
  METAB: 0.7,          // food reserve burned per tick
  FOOD: 22,            // reserve gained per mouse eaten
  START_RESERVE: 55,
  BREED_RESERVE: 88,   // reserve needed to spawn a pup
  BREED_COST: 46,      // reserve spent breeding
  BREED_COOL: 70,      // ticks between births
  VISION: 7,           // detects prey within this many cells
  FLEE: 4,             // prey sense predators within this many cells
  CAP_FACTOR: 0.06,    // predator cap as fraction of world cells
  ACTIVATE: 80,        // predators stay dormant until colony reaches this size
  THIRST: 0.38,        // thirst rises per tick
  SEEK_THIRST: 55,     // thirst above this: break off to drink
  DEPRIVE: 88,         // thirst above this dehydrates (drains reserve)
  DEHYDRATE: 0.7,      // extra reserve lost per tick while parched
};
var PRED_COLOR = "#ff8c42";

// Fish — live only in water, food for cats. Optional mode.
var FISH = {
  ADULT: 30, MAX_AGE: 500, BREED_COOL: 75, BREED_CHANCE: 0.08, DEATH: 0.004,
  CAP_FACTOR: 0.5,     // soft ceiling; predation is the real limit
  CAT_GAIN: 16,        // reserve a cat gains from eating a fish
  CATCH_CHANCE: 0.28,  // a cat's odds of landing an adjacent fish
  MAX_PER_CELL: 2,     // fish won't stack deeper than this in one water cell
};
var FISH_COLOR = "#8fd9e6";

// Birds — nest in vegetation, fly anywhere, hunt mice AND cats. Optional mode.
var BIRD = {
  ADULT: 55, MAX_AGE: 520, METAB: 0.28,
  FOOD_MOUSE: 26,      // reserve gained from eating a mouse
  FISH_GAIN: 15,       // reserve gained from snatching a fish
  VISION: 8, FLEE: 5,
  START_RESERVE: 55, BREED_RESERVE: 88, BREED_COST: 46, BREED_COOL: 85,
  CAP_FACTOR: 0.03,    // soft ceiling; prey availability is the real limit
  ACTIVATE: 70,        // birds circle harmlessly until the colony establishes
};
var BIRD_COLOR = "#eef1f7";

/* ---------------------------------------------------------------------
   Phase model — a readable, six-stage arc of the colony's life. Unlike
   the old two-threshold scheme, this reacts to the population's actual
   trajectory (growth, saturation, social dysfunction, decline), so the
   label stays meaningful instead of pinned at "Settlement" forever.
   --------------------------------------------------------------------- */
var PHASES = [
  { name:"Exploration",     short:"Exploration",
    desc:"A few pioneers claim territory. Space is abundant and social bonds form.",
    rule:"Occupancy under ~10% of internal capacity." },
  { name:"Expansion",       short:"Expansion",
    desc:"The colony booms — births outpace deaths and every corner starts to fill.",
    rule:"Population climbing, occupancy roughly 10–28%." },
  { name:"Saturation",      short:"Saturation",
    desc:"Space runs short. Crowding stress spreads and growth stalls near the ceiling.",
    rule:"Occupancy ~28%+, or 12%+ of mice in a stressed/dysfunctional state." },
  { name:"Social fracture", short:"Social fracture",
    desc:"Density turns toxic. Withdrawal, aggression and neglect spread; Beautiful Ones emerge.",
    rule:"Occupancy ~50%+, or 30%+ of mice socially dysfunctional." },
  { name:"Decline",         short:"Decline",
    desc:"Births crater. The population falls from its peak and cannot recover.",
    rule:"After an established peak, population drops below ~70% of it and is still falling." },
  { name:"Aftermath",       short:"Aftermath / Equilibrium",
    desc:"The society is spent — a small remnant persists or fades toward extinction.",
    rule:"Population settles near or below its starting size after the collapse." },
];
var PHASE_TINT = [ // low-alpha background bands on the population graph, per phase
  "rgba(63,185,107,0.00)",  // exploration — no tint
  "rgba(110,168,254,0.06)", // expansion
  "rgba(232,196,71,0.08)",  // saturation
  "rgba(229,72,77,0.09)",   // social fracture
  "rgba(201,107,216,0.10)", // decline
  "rgba(139,149,167,0.10)", // aftermath
];
