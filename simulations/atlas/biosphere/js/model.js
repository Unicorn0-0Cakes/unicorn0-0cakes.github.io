"use strict";
/* =====================================================================
   BIOSPHERE: CLOSED WORLD — model.js
   The world itself. No DOM access anywhere in this file, so the same
   code runs headless in node for calibration and regression testing.

   The organising idea: carbon has nowhere to go. Every gram fixed by a
   leaf is either standing biomass, soil, food, a person, a gas, or
   locked into the concrete. The oxygen budget is the mirror image of
   that ledger, which is why oxygen can fall for a year while carbon
   dioxide barely moves.
   ===================================================================== */

var Sim = (function () {

  /* ================= light ================= */

  /* Seasonal insolation at 32.6 N, normalised so an equinox day is 1.0. */
  function seasonal(doy) {
    return 0.72 + 0.28 * Math.sin(2 * Math.PI * (doy - 80) / 365);
  }
  function dayLength(doy) {
    return 12 + 2.7 * Math.sin(2 * Math.PI * (doy - 80) / 365);
  }
  /* Instantaneous light, 0 at night, peaking at solar noon. */
  function lightAt(doy, hour, cloud) {
    var dl = dayLength(doy), rise = 12 - dl / 2;
    if (hour < rise || hour > rise + dl) return 0;
    var s = Math.sin(Math.PI * (hour - rise) / dl);
    /* normalise so the hourly values across the day sum to `seasonal` */
    return s / (2 * dl / Math.PI) * seasonal(doy) * (1 - cloud) * 24;
  }

  /* ================= growth response curves ================= */

  function fCO2(ppm) {
    var f = 0.6 + 0.4 * ppm / (ppm + 800);
    return f / 0.757;                       // 1.0 at the 520 ppm start
  }
  function fTemp(t, opt) {
    var d = (t - opt) / 11;
    return Math.exp(-d * d);
  }
  function fMoistGrowth(m, opt) {
    var d = (m - opt) / 0.42;
    return clamp(1 - d * d, 0.03, 1);
  }
  /* Soil microbes: fastest in warm soil at about two-thirds field capacity,
     slow when bone dry, slow again when waterlogged and oxygen-starved. */
  function fMoistDecay(m) {
    if (m <= 0.65) return clamp(m / 0.65, 0.05, 1);
    return clamp(1 - (m - 0.65) * 1.5, 0.18, 1);
  }
  function q10(t) { return Math.pow(2.0, (t - 20) / 10); }

  /* Grams of water vapour a cubic metre of air holds at saturation. */
  function satDensity(t) {
    return 5.018 + 0.32321 * t + 0.0081847 * t * t + 0.00031243 * t * t * t;
  }

  /* ================= world construction ================= */

  function createWorld(opts) {
    opts = opts || {};
    var w = {
      /* clock */
      day: 0, hour: 0, missionLength: opts.missionLength || 365,
      startDoy: ENC.START_DOY, ended: false, ending: null,

      /* atmosphere, in moles */
      atm: {
        o2:  ENC.AIR_MOL * ENC.O2_START,
        co2: ENC.AIR_MOL * ENC.CO2_START_PPM / 1e6,
        n2:  ENC.AIR_MOL * (1 - ENC.O2_START - ENC.CO2_START_PPM / 1e6),
        vapour: 2600,                    // kg of water held as vapour
        temp: 25.4
      },

      /* the concrete: an enormous, silent, finite carbon sink */
      concrete: {
        capacity: (opts.concreteCapacity != null ? opts.concreteCapacity : 6.0e5),
        absorbed: 0,
        sealed: opts.sealedConcrete ? 0.85 : 0.0
      },

      /* ocean carbonate chemistry, coarse but directionally honest */
      ocean: { volume: 2650000, dic: 2.15, alk: 2.30, ph: 8.12, reef: 1.0 },

      biomes: [],
      farm: { plots: [], nitrogen: 1.0, pest: 0.12, nextPlotId: 1 },

      water: {
        potable: opts.potable || 18400, potableCap: opts.potableCap || 26000,
        condensate: 5200, condensateCap: opts.condensateCap || 6000,
        grey: 900, waste: 700,
        imported: 0, exported: 0, unaccounted: 0
      },

      crew: [], tech: { machines: [], power: 0, powerCap: opts.powerCap || 520,
                        spares: (opts.reserves && opts.reserves.spares) || 6 },

      stores: {
        food: [],                       // {cropId, kg, age}
        seeds: {},                      // cropId -> fraction of a full planting
        kcalImported: 0,
        o2Reserve: (opts.reserves && opts.reserves.o2) || 120000,
        foodReserveKcal: (opts.reserves && opts.reserves.food) || 600000,
        medical: (opts.reserves && opts.reserves.medical) || 6,
        lightBanks: (opts.reserves && opts.reserves.lights) || 2,
        scrubbers: (opts.reserves && opts.reserves.scrub) || 1
      },

      /* things the player sets and lives with */
      controls: {
        irrigation: {},                 // biomeId -> 0..2 multiplier
        priorities: { farm: 1, mech: 1, sci: 0.6, eco: 0.7, dom: 1 },
        ration: 1.0,                    // 1 full, 0.85 reduced, 0.7 emergency
        lights: 0,                      // banks running
        scrubber: 0,                    // units running
        chillerSet: 1.0,
        airMix: 0.5,                    // 0 isolate biomes .. 1 aggressive mixing
        preventive: 0.5
      },

      closure: opts.closure || {
        allowOxygen: true, allowFood: true, allowParts: true,
        allowOutsideExperts: true, evacuationEndsMission: true, reportEverything: true
      },

      /* ledgers */
      ledger: { o2Imported: 0, foodImportedKcal: 0, waterImported: 0, partsImported: 0,
                organismsImported: 0, wasteExported: 0, carbonScrubbed: 0, expertCalls: 0 },

      ecology: {
        pollinators: 1.0, decomposers: 1.0, ants: 0.06, herbivores: 0.35,
        richness: 1.0, redundancy: 0.78, invasive: 0.06
      },

      sensors: { drift: 0, confidence: 0.94, lastCalibration: 0, faulty: null },

      history: [],       // one entry per day
      hourly: [],        // last 96 hours, for the diurnal chart
      log: [],           // mission timeline
      alerts: [],
      hypotheses: [],
      pending: null,     // a decision card awaiting the player
      flags: {},
      counters: { harvests: 0, failures: 0, repairs: 0, interventions: 0 },
      flux: newFlux(), fluxDay: newFlux(), totals: newFlux(),
      crewFoodC: 2.4, crewDemandC: 2.4, bodyCarbon: 90, climateLoad: 0,
      rngSeed: 1
    };

    /* --- biomes --- */
    var areaScale = opts.areas || null;
    for (var i = 0; i < BIOMES.length; i++) {
      var b = BIOMES[i];
      var area = areaScale && areaScale[b.id] != null ? areaScale[b.id] : b.area;
      var scale = area / b.area;
      w.biomes.push({
        id: b.id, name: b.name, colour: b.colour, area: area,
        nppPotential: b.nppPotential,
        soilC: b.soilC * scale * (opts.soilCarbonFactor != null ? opts.soilCarbonFactor : 1),
        soilC0: b.soilC * scale * (opts.soilCarbonFactor != null ? opts.soilCarbonFactor : 1),
        soilDecay: b.soilDecay,
        biomass: b.biomass * scale, biomassMature: b.biomassMature * scale,
        litter: b.soilC * scale * 0.02,
        temp: b.temp, tempSet: b.tempSet, tempOpt: b.tempOpt,
        waterHold: b.waterHold * scale, water: b.water * scale,
        moistOpt: b.moistOpt, blurb: b.blurb,
        npp: 0, rh: 0, et: 0, stress: 0, nppAcc: 0, rhAcc: 0
      });
      w.controls.irrigation[b.id] = 1.0;
    }

    /* --- farm plots --- */
    var plan = opts.cropPlan || defaultCropPlan();
    var farmArea = 0;
    for (var k = 0; k < w.biomes.length; k++) if (w.biomes[k].id === "agriculture") farmArea = w.biomes[k].area;
    var plotArea = farmArea / plan.length;
    /* Plots are deliberately out of phase with one another. A farm planted all
       on the same day starves its crew for four months and then wastes half a
       harvest, which is a mistake worth letting the player make on purpose
       rather than one the game makes for them. */
    for (var p = 0; p < plan.length; p++) {
      var cr = CROP_BY_ID[plan[p]] || CROP_BY_ID.fallow;
      var phase = ((p * 0.6180339887) % 1);                  // spread evenly, no clumping
      w.farm.plots.push(makePlot(w, plan[p], plotArea, Math.floor(cr.days * phase)));
    }
    /* seed stock */
    for (var s = 0; s < CROPS.length; s++) w.stores.seeds[CROPS[s].id] = 1.0 +
      (((opts.reserves && opts.reserves.seeds) || 100) - 100) / 100;

    /* --- crew --- */
    var chosen = opts.crew || ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
    for (var c = 0; c < chosen.length; c++) {
      var src = null;
      for (var q = 0; q < CREW_POOL.length; q++) if (CREW_POOL[q].id === chosen[c]) src = CREW_POOL[q];
      if (!src) continue;
      w.crew.push({
        id: src.id, name: src.name, role: src.role, skills: src.skills,
        stressTol: src.stressTol, conflict: src.conflict, needs: src.needs,
        health: 1.0, fatigue: 0.15, morale: 0.78, sleepDebt: 0,
        weight: 1.0,                       // fraction of pre-closure body mass
        kcalToday: 0, proteinToday: 0, microToday: 0,
        duty: DUTIES[c % DUTIES.length].id, hoursToday: 0,
        illness: 0, trust: 0.8, present: true, notes: []
      });
    }

    /* --- machinery --- */
    for (var m = 0; m < MACHINES.length; m++) {
      var mm = MACHINES[m];
      w.tech.machines.push({
        id: mm.id, name: mm.name, power: mm.power, variablePower: mm.variablePower || 0,
        mtbf: mm.mtbf, repair: mm.repair, skill: mm.skill, affects: mm.affects,
        condition: 1.0, running: true, broken: false, lastService: 0, wear: 0
      });
    }

    /* --- starting food --- */
    addFood(w, "sweetpotato", 260);
    addFood(w, "rice", 90);
    addFood(w, "beans", 55);
    addFood(w, "wheat", 70);
    addFood(w, "beet", 40);

    logEvent(w, 0, "closure", "Material closure established.",
      "Eight crew inside. Oxygen 20.9 per cent, carbon dioxide 520 ppm, " +
      w.missionLength + " days to run.");
    snapshot(w);
    return w;
  }

  /* One day's worth of gas flows, kept separately from the concentrations so
     the player can see rates, not just levels. */
  function newFlux() {
    return { photosynthesis: 0, soil: 0, crew: 0, other: 0, concrete: 0, ocean: 0,
             leakO2: 0, co2Prod: 0, co2Cons: 0, nppC: 0, rhC: 0, dayO2: 0, nightO2: 0 };
  }

  function defaultCropPlan() {
    return ["sweetpotato", "sweetpotato", "sweetpotato", "sweetpotato",
            "rice", "rice", "wheat", "sorghum",
            "beans", "beans", "peanut", "peanut",
            "beet", "kale", "kale", "taro",
            "banana", "papaya", "fallow", "sweetpotato"];
  }

  function makePlot(w, cropId, area, age) {
    var crop = CROP_BY_ID[cropId] || CROP_BY_ID.fallow;
    age = age || 0;
    /* a plot that starts mid-cycle already carries the biomass it earned */
    var t = clamp(age / crop.days, 0, 1);
    var standing = crop.yield * FARM_FACTOR * area * Math.pow(t, 1.4);
    return {
      id: w.farm.nextPlotId++, cropId: cropId, area: area, age: age,
      biomass: standing, health: 1.0, pest: 0.05, watered: 1.0, planted: true, note: ""
    };
  }

  function addFood(w, cropId, kg) {
    for (var i = 0; i < w.stores.food.length; i++) {
      if (w.stores.food[i].cropId === cropId) { w.stores.food[i].kg += kg; return; }
    }
    w.stores.food.push({ cropId: cropId, kg: kg, age: 0 });
  }

  /* ================= the hourly step ================= */

  function step(w) {
    if (w.ended) return;
    var doy   = (w.startDoy + w.day) % 365;
    var cloud = clamp(0.18 + 0.22 * Math.sin(2 * Math.PI * (doy - 200) / 365) + noise(w.day * 3.1) * 0.18, 0, 0.6);
    var light = lightAt(doy, w.hour, cloud);

    /* supplemental lighting adds photosynthetically useful light at a cost */
    var lampLight = w.controls.lights * 0.14;
    var effLight  = light + (w.hour >= 6 && w.hour < 22 ? lampLight : 0);

    var ppm = co2ppm(w);
    var o2f = o2frac(w);

    /* Gas bookkeeping for this hour, in mol. "Prod" means entering the
       atmosphere, "Cons" means leaving it. Keeping the four words apart is
       worth the verbosity: a sign error here is invisible for months. */
    var o2Prod = 0, o2Cons = 0, co2Prod = 0, co2Cons = 0;

    /* ---- 1. plants ---- */
    var totalNpp = 0;
    for (var i = 0; i < w.biomes.length; i++) {
      var b = w.biomes[i];
      if (b.id === "habitat") continue;
      var potentialDaily = b.nppPotential * b.area / 365;          // kg C per day
      var lai = Math.pow(clamp(b.biomass / b.biomassMature, 0.05, 1.3), 0.5);
      var moist = b.id === "ocean" ? 1 : b.water / b.waterHold;
      var g = potentialDaily * (effLight / 24) *
              fCO2(ppm) * fTemp(b.temp, b.tempOpt) *
              (b.id === "ocean" ? 1 : fMoistGrowth(moist, b.moistOpt)) * lai;
      if (b.id === "agriculture") g = 0;      // the farm is grown plot by plot
      if (b.id === "ocean") g *= clamp(w.ocean.reef * 0.4 + 0.6, 0.3, 1);
      b.nppAcc += g;
      b.biomass += g;
      totalNpp += g;
      o2Prod += g * MOL_PER_KG_C; co2Cons += g * MOL_PER_KG_C;
      /* litterfall: mature stands shed carbon into the soil continuously,
         at roughly three per cent of standing biomass a year */
      var shed = b.biomass * 0.0000035 * (b.biomass > b.biomassMature ? 2.4 : 1);
      b.biomass -= shed; b.litter += shed;
      b.stress = 1 - clamp(fTemp(b.temp, b.tempOpt) *
                 (b.id === "ocean" ? 1 : fMoistGrowth(moist, b.moistOpt)), 0, 1);
    }

    /* farm plots grow individually */
    var farmB = biome(w, "agriculture");
    var farmNpp = growFarm(w, effLight, ppm, farmB);
    totalNpp += farmNpp;
    o2Prod += farmNpp * MOL_PER_KG_C; co2Cons += farmNpp * MOL_PER_KG_C;
    farmB.nppAcc += farmNpp;

    /* ---- 2. soil respiration: the quiet engine of the whole mystery ---- */
    var totalRh = 0;
    for (var j = 0; j < w.biomes.length; j++) {
      var s = w.biomes[j];
      var m = s.id === "ocean" ? 0.6 : clamp(s.water / s.waterHold, 0, 1.4);
      var rate = (s.soilC + s.litter * 3.2) * s.soilDecay * SOIL_DECAY_SCALE / 24 *
                 q10(s.temp) * fMoistDecay(m) * w.ecology.decomposers;
      /* Litter mineralises faster than humus. Respiration removes exactly
         `rate` from the pools; humification then transfers a little more
         litter into stable soil carbon without oxidising it. Getting this
         wrong quietly manufactures carbon out of nothing. */
      var fromLitter = Math.min(s.litter, rate * 0.55);
      s.litter -= fromLitter;
      s.soilC  -= Math.max(0, rate - fromLitter);
      var humified = Math.min(s.litter, fromLitter * 0.18);
      s.litter -= humified; s.soilC += humified;
      s.rhAcc += rate;
      totalRh += rate;
      o2Cons += rate * MOL_PER_KG_C; co2Prod += rate * MOL_PER_KG_C;
    }

    /* ---- 3. people ----
       A person's carbon dioxide comes out of the food they ate, not out of
       nowhere. Driving respiration from the meal rather than from a fixed
       metabolic constant keeps the carbon honest and has a pleasing side
       effect: a hungry crew consumes less oxygen. */
    var active = (w.hour >= 6 && w.hour < 22) ? 1.18 : 0.62;
    var crewC = (w.crewFoodC || 0) / 24 * active;                 // kg C oxidised this hour
    if (w.bodyCarbon > 0 && crewC < (w.crewDemandC || 0) / 24 * active) {
      var draw = Math.min(w.bodyCarbon, (w.crewDemandC || 0) / 24 * active - crewC);
      w.bodyCarbon -= draw; crewC += draw;                        // burning reserves
    }
    var crewO2 = crewC * MOL_PER_KG_C / 0.86;
    o2Cons += crewO2; co2Prod += crewC * MOL_PER_KG_C;

    /* Animals, insects and general oxidation. They eat litter, so the carbon
       they breathe out has to be taken from somewhere real. */
    var misc = 0.9 + w.ecology.herbivores * 1.4 + w.ecology.ants * 3.0;
    var miscC = misc * KG_C_PER_MOL;
    var pool = 0;
    for (var li = 0; li < w.biomes.length; li++) pool += w.biomes[li].litter;
    if (pool > miscC) {
      for (var lj = 0; lj < w.biomes.length; lj++) w.biomes[lj].litter -= miscC * w.biomes[lj].litter / pool;
    } else { misc = 0; miscC = 0; }
    o2Cons += misc; co2Prod += misc;

    /* ---- 4. the concrete ---- */
    var exposed = 1 - w.concrete.sealed;
    var remain  = clamp(1 - w.concrete.absorbed / w.concrete.capacity, 0, 1);
    var carb = 34 * (ppm / 1500) * Math.pow(remain, 0.7) * exposed *
               clamp(0.6 + w.atm.vapour / 4000, 0.4, 1.4);
    carb = Math.min(carb, w.atm.co2 * 0.02);
    w.concrete.absorbed += carb;
    co2Cons += carb;

    /* ---- 5. the ocean ---- */
    var pco2Ocean = 400 * Math.exp(9.5 * (w.ocean.dic / 2.15 - 1));
    var flux = 0.010 * (ppm - pco2Ocean);            // mol per hour, positive into the sea
    flux = clamp(flux, -90, 90);
    w.ocean.dic = clamp(w.ocean.dic + flux / w.ocean.volume * 1000, 1.2, 3.6);
    w.ocean.ph = clamp(8.12 - 2.6 * (w.ocean.dic / 2.15 - 1), 6.6, 8.4);
    if (flux > 0) co2Cons += flux; else co2Prod += -flux;
    var reefStress = clamp((7.90 - w.ocean.ph) * 1.5, 0, 1) +
                     clamp((biome(w, "ocean").temp - 27.5) * 0.2, 0, 1) +
                     (machine(w, "oceanpump").running ? 0 : 0.3);
    w.ocean.reef = clamp(w.ocean.reef - reefStress * 0.00016 + 0.00006, 0, 1);

    /* ---- 6. scrubber ---- */
    if (w.controls.scrubber > 0 && machine(w, "scrubber").running) {
      var scrub = 34 * w.controls.scrubber * clamp(ppm / 1200, 0.2, 2.2);
      scrub = Math.min(scrub, w.atm.co2 * 0.03);
      co2Cons += scrub;
      w.ledger.carbonScrubbed += scrub;
    }

    /* ---- 7. leakage: proportional, so it moves pressure and not composition ---- */
    var leak = ENC.LEAK_PER_DAY / 24;
    w.atm.o2  -= w.atm.o2 * leak;
    w.atm.co2 -= w.atm.co2 * leak;
    w.atm.n2  -= w.atm.n2 * leak;

    /* ---- 8. commit the gas budget ---- */
    w.atm.o2  += o2Prod - o2Cons;
    w.atm.co2 += co2Prod - co2Cons;
    w.atm.o2  = Math.max(0, w.atm.o2);
    w.atm.co2 = Math.max(20, w.atm.co2);

    /* running daily totals, so the atmosphere screen can show flows and not
       just concentrations — the distinction the whole mystery turns on */
    var each = [w.flux, w.totals];
    for (var fi = 0; fi < 2; fi++) {
      var F = each[fi];
      F.photosynthesis += o2Prod;
      F.soil           += totalRh * MOL_PER_KG_C;
      F.crew           += crewO2;
      F.other          += misc;
      F.concrete       += carb;
      F.ocean          += flux;
      F.leakO2         += w.atm.o2 * leak;
      F.co2Prod        += co2Prod;
      F.co2Cons        += co2Cons;
      F.nppC           += totalNpp;
      F.rhC            += totalRh;
      if (light > 0.01) F.dayO2 += o2Prod - o2Cons; else F.nightO2 += o2Prod - o2Cons;
    }

    /* ---- 9. water ---- */
    waterStep(w, effLight, totalNpp);

    /* ---- 10. temperature ---- */
    tempStep(w, light, cloud);

    /* ---- 11. machinery ---- */
    techStep(w);

    /* store the hourly trace for the diurnal chart */
    w.hourly.push({ d: w.day, h: w.hour, o2: o2frac(w) * 100, co2: co2ppm(w),
                    npp: totalNpp * 24, rh: totalRh * 24, light: light });
    if (w.hourly.length > 96) w.hourly.shift();

    /* ---- advance the clock ---- */
    w.hour++;
    if (w.hour >= 24) { w.hour = 0; w.day++; dailyStep(w); }
  }

  /* ================= farm ================= */

  function growFarm(w, light, ppm, farmB) {
    var moist = farmB.water / farmB.waterHold;
    var gained = 0;
    for (var i = 0; i < w.farm.plots.length; i++) {
      var pl = w.farm.plots[i];
      var crop = CROP_BY_ID[pl.cropId];
      if (!pl.planted || !crop) continue;
      var potential = crop.yield * FARM_FACTOR * pl.area / crop.days;   // kg fresh per day
      var f = (light / 24) * fCO2(ppm) * fTemp(farmB.temp, crop.tempOpt) *
              fMoistGrowth(moist, 0.60) * clamp(w.farm.nitrogen, 0.35, 1.25) *
              (1 - pl.pest * 0.85) * pl.health;
      /* young plants cannot use full light; a sigmoid over the cycle */
      var t = pl.age / crop.days;
      var canopy = clamp(1 / (1 + Math.exp(-9 * (t - 0.32))), 0.02, 1);
      var grow = potential * f * canopy;
      pl.biomass += grow;
      /* the harvestable part is only a share of the plant; stems, leaves and
         roots are carbon too, and all of it eventually reaches the soil */
      gained += grow * 0.11 * 2.4;
    }
    return gained;
  }

  function harvestPlot(w, pl) {
    var crop = CROP_BY_ID[pl.cropId];
    if (!crop || pl.biomass <= 0) return 0;
    var kg = pl.biomass;
    addFood(w, crop.id, kg);
    w.counters.harvests++;
    /* residue goes to the soil, which will breathe it back out later */
    var farmB = biome(w, "agriculture");
    farmB.litter += kg * 0.11 * 1.4;
    w.counters.harvestKcal = (w.counters.harvestKcal || 0) + kg * crop.kcal;
    w.farm.nitrogen = clamp(w.farm.nitrogen + crop.nitrogen * 0.012, 0.2, 1.4);
    w.stores.seeds[crop.id] = clamp((w.stores.seeds[crop.id] || 0) + 0.12 * crop.seedReturn, 0, 3);
    if (crop.perennial) { pl.age = crop.days * 0.72; pl.biomass = 0; }
    else { pl.biomass = 0; pl.age = 0; pl.planted = false; }
    return kg;
  }

  function plantPlot(w, pl, cropId) {
    var crop = CROP_BY_ID[cropId];
    if (!crop) return false;
    var seed = w.stores.seeds[cropId] || 0;
    if (seed < 0.08 && cropId !== "fallow") return false;
    w.stores.seeds[cropId] = Math.max(0, seed - 0.08);
    pl.cropId = cropId; pl.age = 0; pl.biomass = 0; pl.planted = true;
    pl.health = clamp(0.8 + w.farm.nitrogen * 0.2, 0.4, 1);
    pl.pest = clamp(w.farm.pest * crop.pest * 2, 0, 0.6);
    return true;
  }

  /* ================= water ================= */

  function waterStep(w, light, npp) {
    var W = w.water;
    var evapTotal = 0;

    for (var i = 0; i < w.biomes.length; i++) {
      var b = w.biomes[i];
      if (b.id === "ocean") {
        var oe = b.area * 0.16 * (0.4 + light / 24) * clamp(b.temp / 25, 0.6, 1.5);
        b.water -= oe; evapTotal += oe;
        b.et = oe * 24; continue;
      }
      var m = clamp(b.water / b.waterHold, 0, 1.4);
      var et = b.area * 0.11 * (0.25 + light / 20) * clamp(m / b.moistOpt, 0.05, 1.3) *
               clamp(b.temp / 24, 0.6, 1.6) * (b.id === "habitat" ? 0.15 : 1);
      et = Math.min(et, b.water * 0.02);
      b.water -= et; evapTotal += et; b.et = et * 24;

      /* irrigation, drawn from condensate first, then potable */
      var target = b.moistOpt * b.waterHold;
      var want = Math.max(0, (target - b.water)) * 0.06 * (w.controls.irrigation[b.id] || 0);
      if (b.id === "habitat") want = 0;
      var got = Math.min(want, W.condensate);
      W.condensate -= got;
      if (got < want) { var extra = Math.min(want - got, W.potable * 0.02); W.potable -= extra; got += extra; }
      b.water += got;

      /* drainage once past field capacity */
      if (b.water > b.waterHold) {
        var drain = (b.water - b.waterHold) * 0.35;
        b.water -= drain;
        if (b.id === "mangrove") { biome(w, "ocean").water += drain; }
        else { W.waste += drain * 0.35; biome(w, "mangrove").water += drain * 0.65; }
      }
    }

    /* vapour balance and condensation (one litre of water is one kg of vapour) */
    w.atm.vapour += evapTotal;
    var sat = satDensity(w.atm.temp) * ENC.AIR_VOLUME / 1000; // kg at saturation
    var rh  = w.atm.vapour / sat;
    var chiller = machine(w, "chiller");
    var recov   = machine(w, "condensate");
    var condense = 0;
    if (rh > 0.72) condense += (rh - 0.72) * sat * 0.35;
    condense += sat * 0.012 * w.controls.chillerSet * chiller.condition * (chiller.running ? 1 : 0);
    condense = Math.min(condense, w.atm.vapour * 0.4);
    w.atm.vapour -= condense;

    /* where the condensate goes: recovered, or it rains somewhere */
    /* recovery is limited by the machinery, not by how much water is in the air */
    var recovered = Math.min(condense * (recov.running ? 0.62 * recov.condition : 0.15),
                             recov.running ? 190 * recov.condition : 30);
    W.condensate += recovered;
    /* the tanks are finite; the surplus tops up potable storage and the rest
       simply falls somewhere, which is how the desert gets wet */
    var spill = 0;
    if (W.condensate > W.condensateCap) { spill = W.condensate - W.condensateCap; W.condensate = W.condensateCap; }
    var rain = condense - recovered + spill;
    /* Mixing pushes moisture around, and a well-mixed atmosphere rains on the
       desert. The farm sits under its own vault and is watered deliberately,
       so almost nothing falls on it — which makes irrigation a real decision
       rather than a slider with no consequence. */
    var wet = [["rainforest", 0.55], ["mangrove", 0.16], ["savanna", 0.16],
               ["desert", 0.09 + 0.25 * w.controls.airMix], ["agriculture", 0.02]];
    var tot = 0; for (var r = 0; r < wet.length; r++) tot += wet[r][1];
    for (var r2 = 0; r2 < wet.length; r2++) biome(w, wet[r2][0]).water += rain * wet[r2][1] / tot;

    /* crew water and treatment */
    var n = liveCrew(w).length;
    var use = n * (3 + 38) / 24;
    W.potable = Math.max(0, W.potable - use);
    W.grey += use * 0.82; W.waste += use * 0.18;
    var wt = machine(w, "watertreat");
    if (wt.running) {
      var treat = Math.min(W.grey, 110 * wt.condition);
      var eff = 0.965 * wt.condition;
      W.grey -= treat;
      W.potable = Math.min(W.potableCap, W.potable + treat * eff);
      W.unaccounted += treat * (1 - eff);
      W.waste += treat * (1 - eff) * 0.6;
    }
    var wst = machine(w, "wastetreat");
    if (wst.running) {
      var tw = Math.min(W.waste, 70 * wst.condition);
      W.waste -= tw;
      /* the marsh gives most of it back: some as irrigation, some fit to drink */
      W.potable = Math.min(W.potableCap, W.potable + tw * 0.45 * wst.condition);
      W.condensate = Math.min(W.condensateCap, W.condensate + tw * 0.45);
      W.unaccounted += tw * (1 - 0.45 * wst.condition - 0.45);
      /* nutrients return to the farm */
      w.farm.nitrogen = clamp(w.farm.nitrogen + 0.00012 * wst.condition, 0, 1.4);
    }
  }

  /* ================= temperature ================= */

  /* A glass building in the Arizona desert wants to cook. The chillers are a
     controller, not a constant: they work harder the further the biome runs
     above its setpoint, and when they fail the heat arrives immediately. */
  function tempStep(w, light, cloud) {
    var chiller = machine(w, "chiller");
    var air = machine(w, "airhandler");
    var capacity = w.controls.chillerSet * chiller.condition * (chiller.running && !chiller.broken ? 1 : 0);
    var mix  = w.controls.airMix * (air.running ? air.condition : 0.12);
    var outside = 18 + 10 * Math.sin(2 * Math.PI * ((w.startDoy + w.day) % 365 - 110) / 365)
                  + 6 * Math.sin(2 * Math.PI * (w.hour - 9) / 24);
    var mean = 0, area = 0;
    w.climateLoad = 0;
    for (var i = 0; i < w.biomes.length; i++) {
      var b = w.biomes[i];
      var solar = light * 0.62;                              // greenhouse gain
      var machineHeat = w.tech.power / 520 * 0.22;
      var envelope = (outside - b.temp) * 0.075;             // conduction through the glass
      /* Climate control cuts both ways. Arizona in January is as much of a
         problem as Arizona in July, and heating a rainforest costs power. */
      var cooling = capacity * 1.25 * clamp((b.temp - b.tempSet) * 0.55, 0, 1.4);
      var heating = capacity * 1.10 * clamp((b.tempSet - b.temp) * 0.55, 0, 1.4);
      w.climateLoad += cooling + heating;
      b.temp += (solar + machineHeat + envelope - cooling + heating) * 0.34;
      b.temp += (w.atm.temp - b.temp) * 0.10 * mix;
      b.temp = clamp(b.temp, 4, 52);
      mean += b.temp * b.area; area += b.area;
    }
    w.atm.temp = mean / area;
  }

  /* ================= machinery ================= */

  function techStep(w) {
    var power = 0;
    for (var i = 0; i < w.tech.machines.length; i++) {
      var m = w.tech.machines[i];
      if (m.broken) { m.running = false; continue; }
      if (m.id === "growlights") { m.running = w.controls.lights > 0; power += 18 * w.controls.lights; }
      else if (m.id === "scrubber") { m.running = w.controls.scrubber > 0; power += 75 * w.controls.scrubber; }
      else if (m.id === "chiller" && m.running) power += m.power * (0.3 + (w.climateLoad || 0) * 0.14);
      else if (m.running) power += m.power;

      if (!m.running) continue;
      /* wear accelerates in humid, salty, hot conditions — the biology bites back */
      var rh = w.atm.vapour / (satDensity(w.atm.temp) * ENC.AIR_VOLUME / 1000);
      var stress = 1 + clamp((rh - 0.7) * 1.6, 0, 1.2) + clamp((w.atm.temp - 27) * 0.08, 0, 0.6);
      m.condition -= (1 / (m.mtbf * 24)) * stress * 1.6;
      m.condition = clamp(m.condition, 0, 1);
      var pfail = (1 - m.condition) * 0.0014 * stress;
      if (Math.random() < pfail) {
        m.broken = true; m.running = false; w.counters.failures++;
        logEvent(w, w.day, "failure", m.name + " failed.",
          m.affects + " Repair needs " + m.repair + " hours" +
          (w.tech.spares > 0 ? " and one spare set." : ", and no spares remain."));
        pushAlert(w, ALERT_LEVEL.ACTION, "tech", m.name + " has failed",
          m.affects, "Assign maintenance labour, or run without it and watch what changes.");
      }
    }
    w.tech.power = power;
  }

  /* ================= the daily pass ================= */

  function dailyStep(w) {
    /* roll yesterday's accumulated flows into the reportable daily figures */
    w.fluxDay = w.flux; w.flux = newFlux();
    for (var bi = 0; bi < w.biomes.length; bi++) {
      var bb = w.biomes[bi];
      bb.npp = bb.nppAcc; bb.rh = bb.rhAcc; bb.nppAcc = 0; bb.rhAcc = 0;
    }

    /* --- crops age, ripen, and are harvested when the crew has the hours --- */
    var labour = allocateLabour(w);

    for (var i = 0; i < w.farm.plots.length; i++) {
      var pl = w.farm.plots[i];
      var crop = CROP_BY_ID[pl.cropId];
      if (!pl.planted || !crop) continue;
      pl.age++;
      pl.pest = clamp(pl.pest + (w.farm.pest * crop.pest - labour.eco * 0.02) * 0.05, 0, 0.85);
      var farmB = biome(w, "agriculture");
      var m = farmB.water / farmB.waterHold;
      if (m < 0.25 || m > 1.05) pl.health = clamp(pl.health - 0.02, 0.15, 1);
      else pl.health = clamp(pl.health + 0.006, 0.15, 1);
      if (pl.age >= crop.days && labour.farm > 0.35) harvestPlot(w, pl);
      else if (pl.age >= crop.days * 1.25) {           // overripe, losses mount
        pl.biomass *= 0.985;
      }
      if (!pl.planted && labour.farm > 0.45) {
        plantPlot(w, pl, chooseReplant(w, pl));
      }
    }
    w.farm.pest = clamp(w.farm.pest + (w.ecology.ants * 0.4 - labour.eco * 0.05) * 0.02, 0.02, 0.9);
    w.farm.nitrogen = clamp(w.farm.nitrogen - 0.0016, 0.15, 1.4);

    /* --- food spoilage --- */
    for (var f = w.stores.food.length - 1; f >= 0; f--) {
      var st = w.stores.food[f]; var cr = CROP_BY_ID[st.cropId];
      st.age++;
      if (cr && cr.store > 0) st.kg *= (1 - 0.9 / (cr.store * 3));
      if (st.kg < 0.5) w.stores.food.splice(f, 1);
    }

    /* --- eating --- */
    feedCrew(w);

    /* --- health, fatigue, morale --- */
    crewDay(w, labour);

    /* --- maintenance work --- */
    maintenanceDay(w, labour);

    /* --- ecology, weekly-ish but stepped daily for smoothness --- */
    ecologyDay(w);

    /* --- sensors drift until someone calibrates them --- */
    var sens = machine(w, "sensors");
    w.sensors.drift += (sens.running ? 0.0012 : 0.004) * (1 - labour.sci * 0.4);
    w.sensors.confidence = clamp(0.97 - w.sensors.drift * 2.4, 0.35, 0.97);

    snapshot(w);
    checkEnd(w);
  }

  function chooseReplant(w, pl) {
    /* the crew replant sensibly: protein and variety first if either is short */
    var need = nutritionForecast(w);
    if (need.proteinDays < 40 && (w.stores.seeds.beans || 0) > 0.1) return "beans";
    if (need.microScore < 0.5 && (w.stores.seeds.kale || 0) > 0.1) return "kale";
    if (w.farm.nitrogen < 0.45) return "fallow";
    if (need.kcalDays < 45) return "sweetpotato";
    return pl.cropId === "fallow" ? "sweetpotato" : pl.cropId;
  }

  /* ---- labour ---- */
  function allocateLabour(w) {
    var crew = liveCrew(w);
    var pool = 0;
    for (var i = 0; i < crew.length; i++) {
      var p = crew[i];
      var hours = 14 * p.health * (1 - p.fatigue * 0.45) * (1 - p.illness * 0.7);
      /* thin air makes everything slower, long before it becomes dangerous */
      hours *= clamp(0.55 + o2frac(w) / 0.209 * 0.45, 0.4, 1.02);
      p.hoursToday = hours;
      pool += hours;
    }
    var demand = {
      farm: farmLabourDemand(w),
      mech: mechLabourDemand(w),
      sci:  6 + w.hypotheses.filter(function (h) { return h.status === "testing"; }).length * 3,
      eco:  7 + w.farm.pest * 14 + (1 - w.ocean.reef) * 6,
      dom:  crew.length * 1.9 + foodProcessingHours(w)
    };
    var pri = w.controls.priorities;
    var weighted = {}, tw = 0;
    for (var d in demand) { weighted[d] = demand[d] * (pri[d] != null ? pri[d] : 1); tw += weighted[d]; }
    var result = { pool: pool, demand: demand, done: {}, deficit: 0 };
    for (var d2 in demand) {
      var share = tw > 0 ? pool * weighted[d2] / tw : 0;
      var frac = demand[d2] > 0 ? clamp(share / demand[d2], 0, 1.4) : 1;
      result[d2] = frac;
      result.done[d2] = Math.min(share, demand[d2]);
      if (frac < 1) result.deficit += demand[d2] - share;
    }
    result.totalDemand = demand.farm + demand.mech + demand.sci + demand.eco + demand.dom;
    w.lastLabour = result;
    return result;
  }

  function farmLabourDemand(w) {
    var h = 4;
    for (var i = 0; i < w.farm.plots.length; i++) {
      var pl = w.farm.plots[i]; var c = CROP_BY_ID[pl.cropId];
      if (!c || !pl.planted) { h += 1.2; continue; }
      h += c.labour * pl.area;
      if (pl.age >= c.days) h += 5;                    // harvest spike
    }
    return h;
  }
  function mechLabourDemand(w) {
    var h = 5;
    for (var i = 0; i < w.tech.machines.length; i++) {
      var m = w.tech.machines[i];
      h += (1 - m.condition) * 9;
      if (m.broken) h += m.repair;
    }
    return h * (0.6 + w.controls.preventive * 0.8);
  }
  function foodProcessingHours(w) {
    /* threshing, hulling, milling. Rice is famously punishing. */
    var h = 0;
    for (var i = 0; i < w.stores.food.length; i++) {
      var c = CROP_BY_ID[w.stores.food[i].cropId];
      if (!c) continue;
      if (c.id === "rice" || c.id === "wheat" || c.id === "sorghum") h += 3.2;
    }
    return h;
  }

  /* ---- eating ---- */
  function feedCrew(w) {
    var crew = liveCrew(w);
    var needKcal = crew.length * 2350 * w.controls.ration;
    var gotK = 0, gotP = 0, gotM = 0, variety = 0, eatenC = 0;
    /* eat down the stores, most perishable first */
    var order = w.stores.food.slice().sort(function (a, b) {
      var ca = CROP_BY_ID[a.cropId], cb = CROP_BY_ID[b.cropId];
      return (ca ? ca.store : 999) - (cb ? cb.store : 999);
    });
    for (var i = 0; i < order.length && gotK < needKcal; i++) {
      var st = order[i]; var c = CROP_BY_ID[st.cropId];
      if (!c || c.kcal <= 0 || st.kg <= 0) continue;
      var wantKg = Math.min(st.kg, (needKcal - gotK) / c.kcal);
      /* nobody eats 12 kg of one thing; the cook spreads it out */
      wantKg = Math.min(wantKg, needKcal / c.kcal * 0.55);
      st.kg -= wantKg;
      gotK += wantKg * c.kcal; gotP += wantKg * c.protein; gotM += wantKg * c.micro * 12;
      eatenC += wantKg * 0.11;
      if (wantKg > 0.4) variety++;
    }
    /* fall back on the imported reserve if the player permits it */
    if (gotK < needKcal * 0.82 && w.closure.allowFood && w.stores.foodReserveKcal > 0) {
      var take = Math.min(w.stores.foodReserveKcal, needKcal - gotK);
      w.stores.foodReserveKcal -= take; gotK += take;
      gotP += take / 3000 * 90; gotM += take / 3000 * 6;
      var importC = take / 3000 * 0.35;
      eatenC += importC; w.ledger.carbonImported = (w.ledger.carbonImported || 0) + importC;
      w.ledger.foodImportedKcal += take;
      if (!w.flags.foodImportLogged) {
        w.flags.foodImportLogged = true;
        logEvent(w, w.day, "closure", "Imported rations opened.",
          "Food closure is broken from this day. The atmosphere is untouched; the record is not.");
      }
    }
    /* A tenth of what goes in comes out as waste, reaches the treatment marsh,
       and eventually turns up in the farm soil. Nothing leaves. */
    var wasteC = eatenC * 0.10;
    biome(w, "agriculture").litter += wasteC;
    w.crewFoodC = eatenC - wasteC;
    w.crewDemandC = crew.length * 0.30;
    /* eating more than the body needs rebuilds the reserve it burns when short */
    if (w.crewFoodC > w.crewDemandC) {
      var spare = Math.min((w.crewFoodC - w.crewDemandC) * 0.5, 1.2);
      w.crewFoodC -= spare;
      w.bodyCarbon = Math.min((w.bodyCarbon || 0) + spare, crew.length * 12);
    }
    w.lastMeal = { kcal: gotK, need: needKcal, protein: gotP, micro: gotM,
                   variety: variety, carbon: eatenC };
    for (var c2 = 0; c2 < crew.length; c2++) {
      crew[c2].kcalToday = gotK / crew.length;
      crew[c2].proteinToday = gotP / crew.length;
      crew[c2].microToday = gotM / crew.length;
    }
  }

  /* ---- crew ---- */
  function crewDay(w, labour) {
    var o2 = o2frac(w) * 100, ppm = co2ppm(w);
    var crew = liveCrew(w);
    for (var i = 0; i < crew.length; i++) {
      var p = crew[i];
      var kcalRatio = p.kcalToday / 2350;
      /* body mass tracks the calorie balance with a long lag */
      p.weight += (kcalRatio - 1) * 0.0022;
      p.weight = clamp(p.weight, 0.68, 1.15);

      var strain = 0;
      if (o2 < 17.5) strain += (17.5 - o2) * 0.045;
      if (o2 < 15.0) strain += (15.0 - o2) * 0.09;
      if (ppm > 3500) strain += (ppm - 3500) / 6000 * 0.05;
      if (kcalRatio < 0.9) strain += (0.9 - kcalRatio) * 0.22;
      if (p.proteinToday < 48) strain += 0.02;
      if (p.microToday < 42) strain += 0.02;

      var workload = labour.totalDemand / Math.max(1, labour.pool);
      p.fatigue = clamp(p.fatigue + (workload - 0.92) * 0.05 + strain * 0.3 - 0.035, 0, 1);
      p.sleepDebt = clamp(p.sleepDebt + (workload > 1.05 ? 0.4 : -0.3), 0, 30);
      p.health = clamp(p.health - strain * 0.05 - p.fatigue * 0.006 + 0.008, 0.1, 1);

      /* morale: food variety, fairness, being listened to, and the reef */
      var moraleDrift = 0.005;
      /* eating the same root vegetable for the fourth month running is its own
         kind of attrition, and it is cumulative */
      var variety = w.lastMeal ? w.lastMeal.variety : 3;
      moraleDrift += (clamp(variety, 0, 5) - 2.5) * 0.0022;
      if (kcalRatio < 0.85) moraleDrift -= (0.85 - kcalRatio) * 0.04;
      if (w.controls.ration < 1) moraleDrift -= (1 - w.controls.ration) * 0.018;
      if (p.fatigue > 0.6) moraleDrift -= 0.008;
      if (o2 < 16.5) moraleDrift -= 0.006;
      if (w.ocean.reef < 0.5 && p.role === "Marine Biologist") moraleDrift -= 0.006;
      if (w.ledger.o2Imported > 0 && p.conflict === "argumentative") moraleDrift -= 0.002;
      p.morale = clamp(p.morale + moraleDrift * (0.6 + p.stressTol * 0.8), 0.05, 1);
      p.trust = clamp(p.trust + (p.morale - 0.5) * 0.006, 0.05, 1);

      if (p.illness > 0) p.illness = clamp(p.illness - 0.08 * (w.stores.medical > 0 ? 1.4 : 0.7), 0, 1);
      else if (Math.random() < 0.004 * (2 - p.health)) {
        p.illness = rnd(0.3, 0.8);
        logEvent(w, w.day, "medical", p.name + " is unwell.",
          p.role + " off duty. " + (w.stores.medical > 0 ? "Medical supplies used." : "No medical supplies left."));
        if (w.stores.medical > 0) w.stores.medical--;
      }
    }
  }

  function maintenanceDay(w, labour) {
    var hours = labour.done.mech || 0;
    var skill = bestSkill(w, "mech");
    for (var i = 0; i < w.tech.machines.length; i++) {
      var m = w.tech.machines[i];
      if (m.broken && hours >= m.repair) {
        if (w.tech.spares > 0 || Math.random() < 0.35) {
          if (w.tech.spares > 0) w.tech.spares--;
          else logEvent(w, w.day, "repair", m.name + " improvised back into service.",
            "No spare was available. The repair will not hold as well.");
          m.broken = false; m.running = true;
          m.condition = clamp(m.condition + 0.45 * skill, 0.2, 0.95);
          hours -= m.repair; w.counters.repairs++;
          logEvent(w, w.day, "repair", m.name + " restored.", "Condition " + Math.round(m.condition * 100) + " per cent.");
        }
      }
    }
    /* preventive work spread across whatever is left */
    var perMachine = hours * 0.02 * skill * w.controls.preventive;
    for (var j = 0; j < w.tech.machines.length; j++) {
      var mm = w.tech.machines[j];
      if (!mm.broken) mm.condition = clamp(mm.condition + perMachine * 0.06, 0, 1);
    }
  }

  function ecologyDay(w) {
    var e = w.ecology;
    var farmB = biome(w, "agriculture");
    var warmWet = clamp((w.atm.temp - 22) / 8, 0, 1) *
                  clamp(w.atm.vapour / (satDensity(w.atm.temp) * ENC.AIR_VOLUME / 1000) / 0.8, 0, 1.4);
    /* the tramp ant: opportunistic, tolerant, and very hard to reverse */
    e.ants = clamp(e.ants + (0.016 * warmWet + 0.004 - 0.006 * e.pollinators) * (1 - e.ants), 0, 1);
    e.pollinators = clamp(e.pollinators - e.ants * 0.010 + 0.0025 * (1 - e.pollinators), 0, 1);
    e.herbivores = clamp(e.herbivores + (w.farm.pest - 0.3) * 0.01, 0.05, 1);
    e.decomposers = clamp(0.8 + warmWet * 0.4 - e.ants * 0.15, 0.5, 1.35);
    e.invasive = clamp(e.ants * 0.8 + 0.05, 0, 1);
    e.richness = clamp(e.richness - e.invasive * 0.0016 - (1 - w.ocean.reef) * 0.0006, 0.2, 1);
    e.redundancy = clamp(e.richness * 0.85 - e.invasive * 0.25 + 0.12, 0.05, 1);
    /* pollination failure eventually shows up as poor fruit set */
    for (var i = 0; i < w.farm.plots.length; i++) {
      var c = CROP_BY_ID[w.farm.plots[i].cropId];
      if (c && (c.id === "beans" || c.id === "papaya" || c.id === "peanut")) {
        w.farm.plots[i].health = clamp(w.farm.plots[i].health * (0.995 + e.pollinators * 0.006), 0.15, 1);
      }
    }
  }

  /* ================= readouts ================= */

  function o2frac(w) { return w.atm.o2 / totalMol(w); }
  function co2ppm(w) { return w.atm.co2 / totalMol(w) * 1e6; }
  function totalMol(w) { return w.atm.o2 + w.atm.co2 + w.atm.n2; }
  function pressure(w) { return totalMol(w) / ENC.AIR_MOL; }
  function relHumidity(w) { return w.atm.vapour / (satDensity(w.atm.temp) * ENC.AIR_VOLUME / 1000); }

  function biome(w, id) {
    for (var i = 0; i < w.biomes.length; i++) if (w.biomes[i].id === id) return w.biomes[i];
    return w.biomes[0];
  }
  function machine(w, id) {
    for (var i = 0; i < w.tech.machines.length; i++) if (w.tech.machines[i].id === id) return w.tech.machines[i];
    return w.tech.machines[0];
  }
  function liveCrew(w) { return w.crew.filter(function (p) { return p.present; }); }
  function bestSkill(w, s) {
    var best = 0.2;
    var c = liveCrew(w);
    for (var i = 0; i < c.length; i++) if (c[i].skills[s] > best) best = c[i].skills[s] * c[i].health;
    return best;
  }

  /* A measured value, as opposed to a true one. The difference is the game. */
  function measured(w, trueValue, kind) {
    var conf = w.sensors.confidence;
    var jitter = (1 - conf) * 0.9;
    var bias = (w.sensors.faulty === kind) ? w.sensors.drift * 3.5 : 0;
    return trueValue * (1 + noise(w.day * 7.7 + w.hour) * jitter * 0.06 + bias * 0.05);
  }

  function nutritionForecast(w) {
    var crew = liveCrew(w).length || 1;
    var kcal = 0, protein = 0, micro = 0, kinds = 0;
    for (var i = 0; i < w.stores.food.length; i++) {
      var st = w.stores.food[i], c = CROP_BY_ID[st.cropId];
      if (!c) continue;
      kcal += st.kg * c.kcal; protein += st.kg * c.protein; micro += st.kg * c.micro;
      if (st.kg > 5) kinds++;
    }
    var dailyK = crew * 2350 * w.controls.ration;
    var dailyP = crew * 55;
    /* what is standing in the field, and when it lands */
    var pipeline = 0, next = 999;
    for (var p = 0; p < w.farm.plots.length; p++) {
      var pl = w.farm.plots[p], cr = CROP_BY_ID[pl.cropId];
      if (!cr || !pl.planted || cr.kcal <= 0) continue;
      var expected = cr.yield * FARM_FACTOR * pl.area * pl.health * (1 - pl.pest * 0.8);
      pipeline += expected * cr.kcal;
      var left = cr.days - pl.age;
      if (left >= 0 && left < next) next = left;
    }
    return {
      kcal: kcal, kcalDays: kcal / dailyK, protein: protein, proteinDays: protein / dailyP,
      microScore: clamp(micro / (crew * 3.2), 0, 1.5), kinds: kinds,
      pipelineKcal: pipeline, nextHarvest: next === 999 ? null : next,
      reserveKcal: w.stores.foodReserveKcal
    };
  }

  /* Where the oxygen actually went yesterday, in mol per day. */
  function o2Budget(w) {
    var F = w.fluxDay;
    return {
      production: F.photosynthesis,
      soil: F.soil, crew: F.crew, other: F.other, leak: F.leakO2,
      net: F.photosynthesis - F.soil - F.crew - F.other - F.leakO2,
      day: F.dayO2, night: F.nightO2,
      co2Prod: F.co2Prod, co2Cons: F.co2Cons,
      co2Concrete: F.concrete, co2Ocean: F.ocean,
      nppC: F.nppC, rhC: F.rhC
    };
  }
  function carbonSinks(w) {
    var d = w.history.length > 2 ? w.history[w.history.length - 1] : null;
    return {
      concrete: w.concrete.absorbed,
      concreteRemaining: clamp(1 - w.concrete.absorbed / w.concrete.capacity, 0, 1),
      oceanDIC: (w.ocean.dic - 2.15) * w.ocean.volume / 1000,
      scrubbed: w.ledger.carbonScrubbed,
      soilLost: sum(w.biomes, function (b) { return b.soilC0 - b.soilC; }),
      biomassGain: sum(w.biomes, function (b) { return b.biomass; })
    };
  }

  /* ================= history and logging ================= */

  function snapshot(w) {
    var nut = nutritionForecast(w);
    var crew = liveCrew(w);
    w.history.push({
      day: w.day,
      o2: o2frac(w) * 100,
      co2: co2ppm(w),
      pressure: pressure(w),
      rh: relHumidity(w),
      temp: w.atm.temp,
      soilC: sum(w.biomes, function (b) { return b.soilC; }),
      biomass: sum(w.biomes, function (b) { return b.biomass; }),
      concrete: w.concrete.absorbed,
      potable: w.water.potable,
      condensate: w.water.condensate,
      kcalDays: nut.kcalDays,
      kcal: nut.kcal,
      health: crew.length ? sum(crew, function (p) { return p.health; }) / crew.length : 0,
      morale: crew.length ? sum(crew, function (p) { return p.morale; }) / crew.length : 0,
      fatigue: crew.length ? sum(crew, function (p) { return p.fatigue; }) / crew.length : 0,
      ants: w.ecology.ants, pollinators: w.ecology.pollinators, reef: w.ocean.reef,
      power: w.tech.power, npp: sum(w.biomes, function (b) { return b.npp; }),
      rh_soil: sum(w.biomes, function (b) { return b.rh; })
    });
    if (w.history.length > 900) w.history.shift();
  }

  function logEvent(w, day, kind, title, body) {
    w.log.push({ day: day, kind: kind, title: title, body: body || "" });
    if (w.log.length > 600) w.log.shift();
  }

  function pushAlert(w, level, system, title, why, suggestion) {
    for (var i = 0; i < w.alerts.length; i++) {
      if (w.alerts[i].title === title && !w.alerts[i].cleared) return w.alerts[i];
    }
    var a = { id: "a" + (w.alerts.length + 1), level: level, system: system, title: title,
              why: why, suggestion: suggestion, day: w.day, cleared: false,
              confidence: w.sensors.confidence };
    w.alerts.push(a);
    return a;
  }

  /* ================= interventions ================= */

  function injectOxygen(w, mol) {
    mol = Math.min(mol, w.stores.o2Reserve);
    if (mol <= 0) return 0;
    w.stores.o2Reserve -= mol;
    w.atm.o2 += mol;
    w.ledger.o2Imported += mol;
    w.counters.interventions++;
    logEvent(w, w.day, "closure", Math.round(mol / 1000) + "k mol of oxygen injected.",
      "Atmospheric closure is broken. Oxygen now " + round(o2frac(w) * 100, 2) +
      " per cent. The cause of the decline is unchanged.");
    return mol;
  }

  function checkEnd(w) {
    var crew = liveCrew(w);
    var o2 = o2frac(w) * 100;
    if (crew.length === 0) { finish(w, "collapse"); return; }
    var worst = Math.min.apply(null, crew.map(function (p) { return p.health; }));
    if (o2 < 12.5 || worst < 0.22) {
      if (w.closure.evacuationEndsMission) { finish(w, "evacuation"); return; }
    }
    if (w.day >= w.missionLength) finish(w, "complete");
  }

  function finish(w, reason) {
    w.ended = true;
    var crew = liveCrew(w);
    var avgHealth = crew.length ? sum(crew, function (p) { return p.health; }) / crew.length : 0;
    var closureBroken = w.ledger.o2Imported > 0 || w.ledger.foodImportedKcal > 0 ||
                        w.ledger.partsImported > 0;
    var ecoOk = w.ecology.richness > 0.72 && w.ocean.reef > 0.45 && w.ecology.invasive < 0.5;
    var social = crew.length ? sum(crew, function (p) { return p.morale; }) / crew.length : 0;
    var science = w.hypotheses.filter(function (h) { return h.status === "supported"; }).length;

    var cls;
    if (reason === "collapse") cls = "Cascading systems collapse";
    else if (reason === "evacuation") cls = ecoOk ? "Ecological survival with mission evacuation" : "Cascading systems collapse";
    else if (!closureBroken && ecoOk && avgHealth > 0.6 && social > 0.45) cls = "Sustainable closed system";
    else if (!closureBroken && !ecoOk && avgHealth > 0.6) cls = "Human survival with ecological collapse";
    else if (closureBroken && ecoOk && avgHealth > 0.55 && social < 0.4) cls = "Biologically stable but socially fractured";
    else if (closureBroken && avgHealth > 0.55) cls = "Technically sustained system";
    else if (science >= 3) cls = "Scientifically valuable failure";
    else cls = "Unexplained survival";

    w.ending = {
      reason: reason, classification: cls, day: w.day,
      avgHealth: avgHealth, social: social, ecoOk: ecoOk,
      science: science, closureBroken: closureBroken
    };
    logEvent(w, w.day, "end", "Mission ended: " + cls, "");
  }

  /* ================= public surface ================= */

  return {
    createWorld: createWorld, step: step,
    o2frac: o2frac, co2ppm: co2ppm, pressure: pressure, relHumidity: relHumidity,
    totalMol: totalMol, biome: biome, machine: machine, liveCrew: liveCrew,
    nutritionForecast: nutritionForecast, o2Budget: o2Budget, carbonSinks: carbonSinks,
    measured: measured, addFood: addFood, harvestPlot: harvestPlot, plantPlot: plantPlot,
    injectOxygen: injectOxygen, logEvent: logEvent, pushAlert: pushAlert,
    allocateLabour: allocateLabour, satDensity: satDensity, lightAt: lightAt,
    dayLength: dayLength, seasonal: seasonal, makePlot: makePlot, finish: finish
  };
})();

if (typeof module !== "undefined") module.exports = Sim;
