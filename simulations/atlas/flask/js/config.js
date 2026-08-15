"use strict";
/* =====================================================================
   EVOLUTION IN A FLASK — config.js
   Constants, reference tables and small helpers. Loaded first; everything
   here is global to the later scripts. Also loadable in node, so the model
   can be calibrated without a browser.

   Units, stated once so the rest of the code can stay terse:
     volume ......... mL
     glucose ........ ug/mL      (DM25 = 25 ug/mL glucose)
     acetate ........ ug/mL
     citrate ........ ug/mL
     cells .......... absolute counts per flask (not per mL)
     growth rate .... per hour
     time ........... simulated hours; 24 per transfer cycle
     generations .... log2 of the fold increase per cycle
   ===================================================================== */

/* ---------------- tiny helpers ---------------- */
var $     = function (id) { return (typeof document !== "undefined") ? document.getElementById(id) : null; };
var clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
var lerp  = function (a, b, t) { return a + (b - a) * t; };
var round = function (v, d) { var p = Math.pow(10, d || 0); return Math.round(v * p) / p; };
var sum   = function (a, f) { var t = 0; for (var i = 0; i < a.length; i++) t += f ? f(a[i], i) : a[i]; return t; };

/* A small, fast, seedable generator so a run can be reproduced exactly.
   Mulberry32. Every stochastic decision in the model draws from one of
   these, never from Math.random, so "same seed, same history" holds. */
function RNG(seed) {
  this.s = (seed >>> 0) || 1;
}
RNG.prototype.next = function () {
  this.s = (this.s + 0x6D2B79F5) >>> 0;
  var t = this.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
RNG.prototype.range = function (a, b) { return a + this.next() * (b - a); };
RNG.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
/* Box-Muller, one value at a time. Good enough and stateless. */
RNG.prototype.normal = function (mu, sd) {
  var u = 1 - this.next(), v = this.next();
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
RNG.prototype.exp = function (mean) { return -mean * Math.log(1 - this.next()); };
/* Poisson: Knuth below 30, normal approximation above (where it is
   indistinguishable and the loop would be slow). */
RNG.prototype.poisson = function (lam) {
  if (lam <= 0) return 0;
  if (lam < 30) {
    var L = Math.exp(-lam), k = 0, p = 1;
    do { k++; p *= this.next(); } while (p > L);
    return k - 1;
  }
  var g = this.normal(lam, Math.sqrt(lam));
  return Math.max(0, Math.round(g));
};
/* Binomial, used at every transfer. Exact for small n, normal for large. */
RNG.prototype.binomial = function (n, p) {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n < 40) {
    var k = 0;
    for (var i = 0; i < n; i++) if (this.next() < p) k++;
    return k;
  }
  if (n * p < 30) return Math.min(n, this.poisson(n * p));
  var sd = Math.sqrt(n * p * (1 - p));
  return clamp(Math.round(this.normal(n * p, sd)), 0, n);
};

/* =====================================================================
   THE FLASK
   ===================================================================== */

var FLASK = {
  VOLUME:        10,          // mL of medium per flask
  DILUTION:      100,         // 1:100 daily transfer
  GEN_PER_CYCLE: Math.log2(100),   // 6.6439 generations per day
  N_POPS:        12,          // six Ara-, six Ara+, as in the original
  HOURS:         24,          // one transfer cycle
  STEPS_FINE:    30,          // integration steps per cycle at normal speed
  STEPS_COARSE:  10           // ... and when the clock is being pushed
};

/* Davis-Mingioli minimal medium with 25 ug/mL glucose. The citrate is
   present as an iron chelator, not as a carbon source: the ancestor
   cannot bring it across the membrane under oxic conditions. It sits
   there, roughly twenty times the carbon of the glucose, untouched. */
var MEDIUM = {
  glucose:  25,      // ug/mL
  citrate:  500,     // ug/mL, unavailable to Cit- cells
  acetate:  0
};

/* Cells produced per ug of each substrate. Glucose yield is set so that a
   1:100 transfer of a stationary culture regrows to stationary in one day:
   5e5 cells/mL -> 5e7 cells/mL on 25 ug/mL. */
var YIELD = {
  glucose: 1.86e6,
  acetate: 0.75e6,
  citrate: 0.42e6
};

var HALF_SAT = {          // ug/mL, Monod half-saturation constants
  acetate: 4.0,
  citrate: 60.0
};

/* =====================================================================
   THE ANCESTOR
   REL606 as the model sees it. Everything an evolving lineage can change
   about itself appears in this vector; nothing else is heritable.
   ===================================================================== */

var ANCESTOR = {
  lag:       1.55,    // h before growth begins on fresh glucose
  mumax:     0.74,    // /h at 37 C, pH 7.0, full oxygen
  Ks:        0.32,    // ug/mL, glucose half-saturation
  Yglu:      1.00,    // multiplier on YIELD.glucose
  size:      1.00,    // relative cell volume; cosmetic, and a mild cost
  statDeath: 0.016,   // fraction dying per hour once carbon is gone
  aceMu:     0.085,   // /h max growth rate on acetate
  aceLag:    2.60,    // h diauxic lag before switching to acetate
  aceSecr:   0.40,    // ug acetate secreted per ug glucose consumed
  citT:      0.00,    // citrate uptake capacity, /h. Zero is the whole point
  tOpt:      37.0,    // C
  tBreadth:  8.5,     // C, width of the thermal performance curve
  pHopt:     7.0,
  pHbreadth: 1.05,
  o2Aff:     1.00,    // ability to keep growing as oxygen falls
  abxRes:    0.00,    // 0..1, shifts the tolerated concentration
  phageRes:  0.00,    // 0..1, probability of resisting adsorption
  mutMult:   1.00     // multiplier on the genomic mutation rate
};

/* Physiological limits. Selection can push a trait towards the good end of
   its range and no further, because there is nowhere further to go: a cell
   cannot start growing before it has any ribosomes to grow with, cannot
   exceed the maximum rate its own metabolism supports, and cannot get more
   biomass out of a molecule of glucose than the glucose contains. Without
   these, a population that gets lucky early keeps compounding and ends up
   two or three times fitter than anything the real experiment produced. */
var TRAIT_BOUNDS = {
  lag:       [0.28, 6.0],     // h; even a perfectly prepared cell takes a moment
  mumax:     [0.12, 1.05],    // /h; about the fastest E. coli manages on glucose minimal
  Ks:        [0.02, 5.0],     // ug/mL; transporter affinity has a floor
  Yglu:      [0.55, 1.32],    // multiplier; carbon conservation puts a ceiling here
  size:      [0.55, 3.40],
  statDeath: [0.0025, 0.25],  // /h; maintenance is never free
  aceMu:     [0.01, 0.52],
  aceLag:    [0.30, 6.0],
  aceSecr:   [0.04, 0.85],
  citT:      [0, 0.50],
  tOpt:      [14, 50],
  tBreadth:  [3.0, 17.0],
  pHopt:     [4.0, 10.0],
  pHbreadth: [0.45, 3.0],
  o2Aff:     [0.30, 4.0],
  abxRes:    [0, 0.985],
  phageRes:  [0, 0.985],
  mutMult:   [1, 400]
};

/* Traits where a larger number is better, used when describing a mutation
   in plain language without hard-coding a sentence per gene. */
var TRAIT_DIR = {
  lag: -1, mumax: +1, Ks: -1, Yglu: +1, size: 0, statDeath: -1,
  aceMu: +1, aceLag: -1, aceSecr: 0, citT: +1, tOpt: 0, tBreadth: +1,
  pHopt: 0, pHbreadth: +1, o2Aff: +1, abxRes: +1, phageRes: +1, mutMult: 0
};

var TRAIT_LABEL = {
  lag: "lag phase", mumax: "maximum growth rate", Ks: "glucose affinity",
  Yglu: "growth yield", size: "cell size", statDeath: "stationary survival",
  aceMu: "acetate growth rate", aceLag: "diauxic lag", aceSecr: "acetate secretion",
  citT: "citrate uptake", tOpt: "thermal optimum", tBreadth: "thermal breadth",
  pHopt: "pH optimum", pHbreadth: "pH breadth", o2Aff: "low-oxygen growth",
  abxRes: "antibiotic resistance", phageRes: "phage resistance",
  mutMult: "mutation rate"
};

/* =====================================================================
   MUTATION
   ===================================================================== */

var MUT = {
  /* Genomic point-mutation rate per cell per generation. Only mutations
     that do something are instantiated as objects; the rest accumulate on
     a lineage as a counter, which is both cheaper and closer to the truth
     — most of what a sequencer finds in an evolved clone is a passenger. */
  U_TOTAL:    1.0e-3,

  /* Rate at which beneficial mutations are instantiated as new lineages,
     per cell per generation, already discounted by the probability that a
     brand-new mutant survives the next transfer. Raising it produces
     faster adaptation and heavier clonal interference. Calibrated so that
     a non-mutator population fixes roughly five drivers in its first two
     thousand generations. */
  U_BEN:      7.0e-9,

  /* Deleterious mutations of large effect, instantiated so that they can
     be seen hitchhiking and dying. */
  U_DEL:      6.0e-9,

  /* Loss of mismatch repair. Six of the twelve original populations became
     hypermutable; this rate, over fifty thousand generations, gets close. */
  U_MUTATOR:  3.4e-7,
  MUTATOR_X:  95,          // fold increase in the point-mutation rate
  /* Fraction of that increase which reaches the supply of *useful*
     mutations. Much of what adaptation uses here is structural — insertion
     sequences, deletions, amplifications — and mismatch repair never saw
     any of it. */
  BEN_FRACTION: 0.12,

  /* Mean selection coefficient of a beneficial mutation in the ancestral
     background, before epistasis. The distribution is exponential, which
     is what extreme-value theory predicts for the tail of a fitness
     distribution and what the LTEE's early sweeps look like. */
  S_MEAN:     0.062,
  S_DEL_MEAN: 0.045,

  /* Diminishing returns. The realised effect of a beneficial mutation is
     scaled by exp(-EPI * (W - 1)) where W is the current fitness relative
     to the ancestor. This single term is what turns a straight line into
     the LTEE's decelerating, never-quite-flat trajectory. */
  EPI:        4.2,

  /* Citrate. A rare structural rearrangement that puts citT under an
     aerobically expressed promoter. Vanishingly unlikely in the ancestral
     background; merely very unlikely once the right potentiating changes
     are present. */
  U_CIT_BASE: 2.0e-16,
  U_CIT_POT:  1.1e-13,
  CIT_POT_NEEDED: 2,       // potentiating mutations required
  U_CIT_REFINE: 3.0e-9     // amplification of the new module, once it exists
};

/* =====================================================================
   GENES
   The targets the model is allowed to hit. Weights are loosely ordered by
   how often the real experiment found them; the point is not the exact
   numbers but that the same handful of genes keep coming up in populations
   that have never met each other.
   ===================================================================== */

var GENES = [
  /* id       weight  traits touched                                   note */
  { id: "pykF",  w: 10, tr: { mumax: +1.0 },                 note: "Pyruvate kinase. Disrupted in every one of the original twelve." },
  { id: "nadR",  w: 9,  tr: { mumax: +0.7, statDeath: +0.5 },note: "NAD salvage regulator. Another near-universal early target." },
  { id: "spoT",  w: 9,  tr: { lag: +0.9, mumax: +0.5 },      note: "Stringent response. Retunes the switch between growing and waiting." },
  { id: "topA",  w: 7,  tr: { mumax: +0.9 },                 note: "DNA topoisomerase I. Changes supercoiling, and so global expression." },
  { id: "fis",   w: 6,  tr: { mumax: +0.8 },                 note: "Nucleoid-associated regulator; works with topA on the same axis." },
  { id: "hslU",  w: 5,  tr: { mumax: +0.6, lag: +0.3 },      note: "Protease subunit. Hit repeatedly and early." },
  { id: "rbs",   w: 6,  tr: { mumax: +0.35 },                note: "Deletion of the ribose operon. Cheap to lose when there is no ribose." },
  { id: "mrdA",  w: 4,  tr: { size: +1.0, mumax: +0.3 },     note: "Cell shape. Evolved cells are conspicuously larger than the ancestor." },
  { id: "mreB",  w: 3,  tr: { size: +1.0, mumax: +0.2 },     note: "Cytoskeletal actin homologue; the other route to a rounder, bigger cell." },
  { id: "infB",  w: 3,  tr: { mumax: +0.6 },                 note: "Translation initiation factor 2." },
  { id: "arcA",  w: 5,  tr: { mumax: +0.7 },                 note: "Aerobic respiration control. Loosens a brake that costs nothing here." },
  { id: "iclR",  w: 4,  tr: { aceMu: +1.0, aceLag: +0.6 },   note: "Represses the glyoxylate shunt. Losing it helps a cell live on acetate." },
  { id: "atoC",  w: 3,  tr: { aceMu: +0.9 },                 note: "Acetoacetate regulator; another acetate specialist route." },
  { id: "malT",  w: 3,  tr: { phageRes: +0.9, mumax: -0.25 },note: "Maltose regulon activator. Losing it closes the door lambda comes in by." },
  { id: "ompF",  w: 3,  tr: { phageRes: +0.7, mumax: -0.15 },note: "Outer membrane porin. Resistance with a small permeability cost." },
  { id: "tsx",   w: 2,  tr: { phageRes: +0.6 },              note: "Nucleoside channel; a receptor for several phages." },
  { id: "rpoS",  w: 3,  tr: { statDeath: +0.9, mumax: -0.2 },note: "General stress sigma factor. Buys survival with growth." },
  { id: "ybaL",  w: 3,  tr: { mumax: +0.4, Ks: +0.4 },       note: "Putative transporter, repeatedly mutated." },
  { id: "yijC",  w: 2,  tr: { mumax: +0.4 },                 note: "Fatty acid biosynthesis regulator." },
  { id: "nagC",  w: 2,  tr: { mumax: +0.35, Ks: +0.3 },      note: "N-acetylglucosamine regulator with wider effects on uptake." },
  { id: "sfcA",  w: 2,  tr: { Yglu: +0.6 },                  note: "Malic enzyme. Shifts how much biomass a carbon buys." },
  { id: "ptsG",  w: 3,  tr: { Ks: +1.0 },                    note: "Glucose transporter. Sharpens the affinity for a scarce sugar." },
  { id: "mglB",  w: 3,  tr: { Ks: +0.9, mumax: +0.2 },       note: "High-affinity galactose/glucose binding protein." },
  { id: "gltA",  w: 4,  tr: { mumax: +0.4 }, pot: true,      note: "Citrate synthase. Also one of the changes that makes citrate use reachable." },
  { id: "dctA",  w: 3,  tr: { aceMu: +0.3 }, pot: true,      note: "C4-dicarboxylate transporter. Up-regulating it matters later, for reasons not yet apparent." },
  { id: "citG",  w: 2,  tr: { mumax: +0.2 }, pot: true,      note: "Citrate lyase accessory. Quiet on its own." }
];

/* Non-target genes, so a sequenced genome is mostly passengers, as a real
   one is. These never do anything; they are the noise a player has to see
   past when looking for parallelism. */
var PASSENGER_GENES = [
  "yaaH", "ydhJ", "ycgS", "yeeF", "yhiN", "ylbE", "ymgB", "yqiK", "ybjL",
  "insB", "insJ", "prfB", "menC", "cspC", "yfhM", "ftsK", "clpA", "rlmL",
  "narH", "hokB", "cheW", "flhD", "yghJ", "ECB_00510", "ECB_01992",
  "ECB_02816", "ECB_03362", "intergenic", "rrlA", "pflB", "adhE"
];

var MUTATOR_GENES = ["mutS", "mutL", "mutT", "uvrD", "mutH"];
var ABX_GENES     = ["marR", "acrR", "gyrA", "ompR", "rpoB"];

/* Weighted picker over GENES, prepared once. */
var GENE_TOTAL_W = sum(GENES, function (g) { return g.w; });
function pickGene(rng, filter) {
  var pool = filter ? GENES.filter(filter) : GENES;
  var tot = sum(pool, function (g) { return g.w; });
  var r = rng.next() * tot;
  for (var i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

/* =====================================================================
   ENVIRONMENT
   The knobs. Defaults reproduce the original conditions exactly.
   ===================================================================== */

var ENV_DEFAULT = {
  carbon:      "glucose",   // glucose | maltose | lactose | mixed | citrate-rich
  glucose:     25,          // ug/mL
  temperature: 37.0,        // C
  pH:          7.0,
  oxygen:      1.00,        // 0..1, fraction of full aeration
  transferEvery: 1,         // days between transfers
  dilution:    100,         // 1:N
  patches:     1,           // 1 = well mixed; >1 = spatially structured
  antibiotic:  0,           // 0..1 of the ancestral MIC
  phage:       false,
  phageStart:  0,
  mutagen:     1.0,         // multiplier on the whole mutation rate
  drift:       "none",      // none | gradual | abrupt
  driftTarget: null,        // filled in when drift is on
  driftRate:   0
};

/* Alternative carbon sources. Each is a scaling of the ancestor's ability
   to use it, so a switch of carbon source is an immediate fitness cliff
   followed by an adaptive climb. */
var CARBON = {
  "glucose":      { mu: 1.00, Ks: 1.00, Y: 1.00, label: "Glucose (DM25)",
                    note: "The historical condition. 25 ug/mL, exhausted in a few hours." },
  "maltose":      { mu: 0.86, Ks: 1.60, Y: 0.94, label: "Maltose",
                    note: "Enters through the maltoporin, which is also the lambda receptor." },
  "lactose":      { mu: 0.72, Ks: 2.40, Y: 0.90, label: "Lactose",
                    note: "Needs the lac operon induced; a slow, expensive start each cycle." },
  "mixed":        { mu: 0.93, Ks: 1.30, Y: 0.97, label: "Glucose + maltose",
                    note: "Two sugars, sequentially used. Rewards specialists and generalists differently." },
  "citrate-rich": { mu: 1.00, Ks: 1.00, Y: 1.00, label: "Glucose, citrate raised tenfold",
                    note: "Same glucose, far more of the carbon nobody can reach." }
};

/* =====================================================================
   PHAGE
   A deliberately small model: one lytic phage, adsorbing to a receptor the
   host can lose, with a host-range counter-mutation available to it.
   ===================================================================== */

var PHAGE = {
  ADSORB:     2.4e-9,    // per cell per phage per hour, per mL
  BURST:      45,
  LATENT:     0.9,       // h
  DECAY:      0.04,      // /h free-phage loss
  HOST_RANGE_U: 4e-9,    // per phage per burst, chance of broadening range
  START:      1e6
};

/* =====================================================================
   THE LABORATORY
   Measurement is not free. Bench hours accrue with the calendar and are
   spent on the things that turn a running simulation into an experiment.
   ===================================================================== */

var LAB = {
  HOURS_PER_DAY: 1.0,
  START_HOURS:   14,
  CAP:           120,
  COSTS: {
    assay:        3,    // one competition against a frozen ancestor
    assayFreq:    5,    // the same, at two starting ratios, to test frequency dependence
    sequence:     8,    // one clone, whole genome
    sequencePop:  18,   // population-level sequencing: everything above 5 per cent
    freeze:       0.5,  // an extra sample outside the automatic schedule
    revive:       2,    // thaw an archived sample and look at it
    replay:       26,   // twenty replicate replays from an archived timepoint
    plate:        1,    // colony morphology, cell size, density
    invade:       6     // reciprocal invasion assay between two lineages
  }
};

/* Automatic freezing schedule, in generations. The real experiment freezes
   every 500 generations, which is every 75 days. */
var FREEZE_EVERY_GEN = 500;

/* =====================================================================
   PROVENANCE
   Every number a player is shown carries one of these. The intent is that
   nobody leaves this simulation believing something the experiment did
   not actually find.
   ===================================================================== */

var PROVENANCE = {
  documented: { label: "documented", tone: "ok",
    note: "Taken from published descriptions of the long-term experiment." },
  estimated:  { label: "estimated", tone: "info",
    note: "Derived from general microbial physiology, not from this experiment specifically." },
  invented:   { label: "invented", tone: "watch",
    note: "Chosen so that the simulation behaves and plays; not a measurement of anything." },
  emergent:   { label: "emergent", tone: "accent",
    note: "Not set anywhere. It is whatever the model happened to produce." }
};

/* Population labels. The real experiment alternates an arabinose marker
   that is neutral in this medium and lets the two be told apart on a
   plate — which is exactly how a competition assay is scored. */
var POP_NAMES = [
  "Ara-1", "Ara-2", "Ara-3", "Ara-4", "Ara-5", "Ara-6",
  "Ara+1", "Ara+2", "Ara+3", "Ara+4", "Ara+5", "Ara+6"
];

var LINEAGE_COLOURS = [
  "#2f7d6a", "#b4732c", "#2c6ba0", "#a34b6e", "#5f7a2b", "#8a5fb0",
  "#c0631f", "#2f8f52", "#b3372f", "#3f6f8f", "#8d7130", "#6b4fa8",
  "#357f8a", "#a05a2c", "#4a7a4a", "#96436b", "#2e6f9e", "#7d6a2f"
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    RNG: RNG, FLASK: FLASK, MEDIUM: MEDIUM, YIELD: YIELD, HALF_SAT: HALF_SAT,
    ANCESTOR: ANCESTOR, MUT: MUT, GENES: GENES, PASSENGER_GENES: PASSENGER_GENES,
    MUTATOR_GENES: MUTATOR_GENES, ABX_GENES: ABX_GENES, ENV_DEFAULT: ENV_DEFAULT,
    CARBON: CARBON, PHAGE: PHAGE, LAB: LAB, POP_NAMES: POP_NAMES,
    TRAIT_DIR: TRAIT_DIR, TRAIT_LABEL: TRAIT_LABEL, TRAIT_BOUNDS: TRAIT_BOUNDS,
    pickGene: pickGene,
    clamp: clamp, lerp: lerp, round: round, sum: sum,
    FREEZE_EVERY_GEN: FREEZE_EVERY_GEN, PROVENANCE: PROVENANCE,
    LINEAGE_COLOURS: LINEAGE_COLOURS
  };
}
