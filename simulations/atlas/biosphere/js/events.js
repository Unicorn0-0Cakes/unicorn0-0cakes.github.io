"use strict";
/* =====================================================================
   BIOSPHERE: CLOSED WORLD — events.js
   Alerts, decision cards and the hypothesis machinery.

   Two rules govern everything in this file:
     1. Never state a cause. State the evidence and let the player argue.
     2. Never pretend to certainty the model does not have.
   ===================================================================== */

var Events = (function () {

  /* ---------------- alerts ---------------- */

  function evaluate(w) {
    var h = w.history, n = h.length;
    if (n < 2) return;
    var o2 = Sim.o2frac(w) * 100, ppm = Sim.co2ppm(w);
    var nut = Sim.nutritionForecast(w);
    var conf = Math.round(w.sensors.confidence * 100);

    /* --- oxygen, told as a trend before it is told as a level --- */
    var falling = 0;
    for (var i = n - 1; i > 0 && n - i < 90; i--) { if (h[i].o2 < h[i - 1].o2) falling++; else break; }
    if (falling >= 21 && o2 > 18.5) {
      Sim.pushAlert(w, ALERT_LEVEL.WATCH, "atmosphere",
        "Oxygen has fallen for " + falling + " consecutive days",
        "Concentration is " + o2.toFixed(2) + " per cent, down " +
        (h[Math.max(0, n - falling - 1)].o2 - o2).toFixed(2) + " points across that period. " +
        "Carbon dioxide has " + (ppm > h[Math.max(0, n - falling - 1)].co2 ? "risen" : "not risen") +
        " proportionally.",
        "Compare daytime gain against night-time loss on the atmosphere screen before changing anything.");
    }
    if (o2 < 18.0 && !w.flags.o2_18) {
      w.flags.o2_18 = true;
      Sim.pushAlert(w, ALERT_LEVEL.WATCH, "atmosphere", "Oxygen below 18 per cent",
        "Equivalent to standing at roughly 1,200 metres. Nobody will notice yet, but the trend has not turned.",
        "This is the cheapest moment to find the cause. It gets dearer from here.");
    }
    if (o2 < 16.5 && !w.flags.o2_165) {
      w.flags.o2_165 = true;
      Sim.pushAlert(w, ALERT_LEVEL.ACTION, "crew", "Oxygen below 16.5 per cent",
        "Crew are working more slowly and sleeping badly. Task completion has dropped measurably.",
        "Reduce workload, or accept slower maintenance, or open the oxygen reserve.");
    }
    if (o2 < 15.0) {
      Sim.pushAlert(w, ALERT_LEVEL.EMERGENCY, "crew", "Oxygen below 15 per cent",
        "Comparable to 2,700 metres of altitude, sustained, with no acclimatisation break. " +
        "Cognitive performance is measurably impaired.",
        "The medical officer will not let this continue much longer.");
    }
    if (ppm > 4500) {
      Sim.pushAlert(w, ALERT_LEVEL.ACTION, "atmosphere", "Carbon dioxide above 4,500 ppm",
        "Headaches and poor sleep are likely. Plants are not limited by carbon at this level; people are.",
        "Run the scrubber, add light to pull carbon into biomass, or check whether a sink has saturated.");
    }
    if (w.concrete.absorbed / w.concrete.capacity > 0.85 && !w.flags.concreteFull) {
      w.flags.concreteFull = true;
      Sim.pushAlert(w, ALERT_LEVEL.WATCH, "atmosphere", "A carbon sink appears to be saturating",
        "Carbon dioxide is now rising faster than respiration alone accounts for, while oxygen continues to fall " +
        "at its previous rate. Something that was absorbing carbon has largely stopped.",
        "If a sink has filled, the atmosphere will behave differently from here even with no change in biology.");
    }

    /* --- food --- */
    if (nut.kcalDays < 30 && nut.kcalDays >= 12) {
      Sim.pushAlert(w, ALERT_LEVEL.WATCH, "food", "Food horizon under thirty days",
        "Stores cover " + Math.round(nut.kcalDays) + " days at the current ration. " +
        (nut.nextHarvest != null ? "Next harvest in " + nut.nextHarvest + " days." : "No harvest is close."),
        "Reduce the ration now and the decision is yours; wait and it will not be.");
    }
    if (nut.kcalDays < 12) {
      Sim.pushAlert(w, ALERT_LEVEL.ACTION, "food", "Food horizon critical",
        "Under " + Math.round(nut.kcalDays) + " days of stored calories.",
        "Reduce the ration, open the imported reserve, or move labour to agriculture.");
    }
    if (nut.proteinDays < 20) {
      Sim.pushAlert(w, ALERT_LEVEL.WATCH, "food", "Protein reserve thin",
        "About " + Math.round(nut.proteinDays) + " days of protein in store. Calories alone will not hold weight.",
        "Beans and peanuts take three months. Planting them next week is not the same as planting them today.");
    }

    /* --- water --- */
    if (w.water.potable < 4000) {
      Sim.pushAlert(w, ALERT_LEVEL.ACTION, "water", "Potable water below 4,000 litres",
        "Treatment is not keeping pace with use and losses. Unaccounted losses total " +
        Math.round(w.water.unaccounted) + " litres so far.",
        "Check the water treatment unit's condition, and remember unaccounted is not the same as leaked.");
    }
    var desert = Sim.biome(w, "desert");
    if (desert.water / desert.waterHold > 0.42 && !w.flags.wetDesert) {
      w.flags.wetDesert = true;
      Sim.pushAlert(w, ALERT_LEVEL.ADVISORY, "water", "The desert is wetter than designed",
        "Soil moisture is " + Math.round(desert.water / desert.waterHold * 100) +
        " per cent against a design target of " + Math.round(desert.moistOpt * 100) + ". " +
        "Condensation is not falling where it was meant to.",
        "Reducing atmospheric mixing keeps moisture in the wet biomes, at a cost in temperature control.");
    }

    /* --- ecology --- */
    if (w.ecology.ants > 0.45 && !w.flags.ants45) {
      w.flags.ants45 = true;
      Sim.pushAlert(w, ALERT_LEVEL.WATCH, "ecology", "One ant species now dominates the samples",
        "A tramp species has gone from a trace presence to " + Math.round(w.ecology.ants * 100) +
        " per cent of collected individuals. Pollinator counts have fallen to " +
        Math.round(w.ecology.pollinators * 100) + " per cent of baseline.",
        "There is no pesticide option that does not also enter the air, the water and the food.");
    }
    if (w.ecology.pollinators < 0.35) {
      Sim.pushAlert(w, ALERT_LEVEL.ACTION, "ecology", "Pollination is failing",
        "Bean, peanut and papaya set is dropping. This shows up in the harvest three months from now, not today.",
        "Hand pollination costs labour you may not have. Switching to self-fertile crops costs variety.");
    }
    if (w.ocean.reef < 0.45 && !w.flags.reef) {
      w.flags.reef = true;
      Sim.pushAlert(w, ALERT_LEVEL.WATCH, "ecology", "Reef condition below half",
        "Ocean pH is " + w.ocean.ph.toFixed(2) + ". The sea has been absorbing the carbon the air is not holding.",
        "The reef is both an ecosystem and an instrument. Losing it costs a measurement as well as a species.");
    }

    /* --- crew --- */
    var crew = Sim.liveCrew(w);
    var fatigue = crew.length ? sum(crew, function (p) { return p.fatigue; }) / crew.length : 0;
    var morale  = crew.length ? sum(crew, function (p) { return p.morale; }) / crew.length : 0;
    if (fatigue > 0.68) {
      Sim.pushAlert(w, ALERT_LEVEL.ACTION, "crew", "Crew fatigue is compounding",
        "Average fatigue " + Math.round(fatigue * 100) + " per cent. Labour demand exceeds available hours, " +
        "so maintenance is being deferred, which will create more work later.",
        "Something has to be dropped on purpose. Choosing badly is still better than not choosing.");
    }
    if (morale < 0.3 && !w.flags.morale30) {
      w.flags.morale30 = true;
      Sim.pushAlert(w, ALERT_LEVEL.WATCH, "crew", "Morale has fallen sharply",
        "Diet monotony, workload and thin air are all contributing. Two crew have stopped attending the evening meeting.",
        "There is no morale control. There are workloads, rations, privacy and who gets to decide.");
    }

    /* --- instruments --- */
    if (conf < 70 && !w.flags.sensors70) {
      w.flags.sensors70 = true;
      Sim.pushAlert(w, ALERT_LEVEL.WATCH, "science", "Measurement confidence has fallen to " + conf + " per cent",
        "The sensor network has drifted since its last calibration on day " + w.sensors.lastCalibration + ". " +
        "Readings may be biased rather than merely noisy.",
        "Calibrate before you trust a trend you are about to act on.");
    }

    /* --- machinery --- */
    if (w.tech.power > w.tech.powerCap * 0.95) {
      Sim.pushAlert(w, ALERT_LEVEL.WATCH, "tech", "Power demand is at the limit",
        Math.round(w.tech.power) + " kW against " + w.tech.powerCap + " kW available.",
        "Lights and the scrubber are the two large discretionary loads.");
    }
  }

  /* ---------------- decision cards ---------------- */

  var CARDS = [
    {
      id: "medical_review",
      when: function (w) { return Sim.o2frac(w) * 100 < 15.6 && !w.flags.card_med; },
      build: function (w) {
        w.flags.card_med = true;
        var o2 = (Sim.o2frac(w) * 100).toFixed(1);
        return {
          id: "medical_review", title: "Medical review", kicker: "DAY " + w.day,
          body: "Three crew show reduced cognitive performance on the standard battery. Oxygen is " + o2 +
                " per cent and still falling. The medical officer recommends intervention within seven days " +
                "and has said so in writing.",
          options: [
            { label: "Inject emergency oxygen now",
              detail: "Raises the atmosphere immediately. Breaks atmospheric closure, permanently and visibly.",
              uncertainty: "Expected to reduce immediate medical risk. The cause of the decline is unaffected.",
              act: function (w) { Sim.injectOxygen(w, 60000); } },
            { label: "Reduce labour and continue observing",
              detail: "Cuts maintenance and science hours to protect the crew's oxygen budget.",
              uncertainty: "Buys perhaps three weeks. Deferred maintenance tends to return as failures.",
              act: function (w) {
                w.controls.priorities.sci = 0.2; w.controls.priorities.mech = 0.6;
                Sim.logEvent(w, w.day, "decision", "Workload cut to protect the crew.",
                  "Science and maintenance hours reduced by direction of the medical officer.");
              } },
            { label: "Run lights and the scrubber at full",
              detail: "Push photosynthesis and pull carbon out of the air with machinery.",
              uncertainty: "Addresses carbon, not oxygen. The two are not the same problem here.",
              act: function (w) {
                w.controls.lights = Math.min(w.stores.lightBanks, 4);
                w.controls.scrubber = Math.min(w.stores.scrubbers, 2);
                Sim.logEvent(w, w.day, "decision", "Lights and scrubber to maximum.", "Power demand rises sharply.");
              } },
            { label: "Request an outside ruling",
              detail: "Send the data out and let an external panel decide.",
              uncertainty: "Breaks informational closure. The decision stops being yours.",
              needs: function (w) { return w.closure.allowOutsideExperts; },
              act: function (w) {
                w.ledger.expertCalls++;
                Sim.logEvent(w, w.day, "closure", "External medical ruling requested.",
                  "Informational closure broken. The panel recommends oxygen within ten days.");
              } }
          ]
        };
      }
    },
    {
      id: "ant_outbreak",
      when: function (w) { return w.ecology.ants > 0.6 && !w.flags.card_ants; },
      build: function (w) {
        w.flags.card_ants = true;
        return {
          id: "ant_outbreak", title: "The ants have won the argument", kicker: "DAY " + w.day,
          body: "A single tramp ant species now accounts for most individuals in every terrestrial sample. " +
                "They are farming scale insects on the crops, displacing other decomposers, and getting into " +
                "the kitchen. The entomologist wants a decision recorded before anyone acts unilaterally.",
          options: [
            { label: "Live with them and adapt the farm",
              detail: "Accept the new assemblage. Move to crops that tolerate scale insects.",
              uncertainty: "Yield falls perhaps a tenth. The ecosystem stops being the one you designed.",
              act: function (w) {
                w.farm.pest = Math.min(w.farm.pest, 0.35);
                Sim.logEvent(w, w.day, "ecology", "The ant population is accepted as resident.",
                  "Crop selection shifts. The species list will not recover.");
              } },
            { label: "Sustained manual control",
              detail: "Bait stations, nest destruction, hand removal. Ongoing labour, forever.",
              uncertainty: "Suppresses but does not eliminate. Costs about eight crew-hours a day indefinitely.",
              act: function (w) {
                w.controls.priorities.eco = 1.6;
                w.ecology.ants = Math.max(0.2, w.ecology.ants - 0.25);
                Sim.logEvent(w, w.day, "ecology", "Standing ant control programme begins.",
                  "Ecology labour priority raised. Other ecological work will be deferred.");
              } },
            { label: "Introduce a targeted pesticide",
              detail: "Fast, effective, and it enters a closed atmosphere, a closed water cycle and the food.",
              uncertainty: "Ant numbers collapse within a fortnight. Pollinators and decomposers are also affected, " +
                           "and the residue does not leave the building.",
              act: function (w) {
                w.ecology.ants *= 0.25; w.ecology.pollinators *= 0.55; w.ecology.decomposers *= 0.8;
                w.ledger.organismsImported += 0;
                Sim.logEvent(w, w.day, "ecology", "Pesticide applied inside a closed system.",
                  "Ant numbers fall sharply. So do pollinators. Nothing applied here ever leaves.");
              } }
          ]
        };
      }
    },
    {
      id: "seed_dispute",
      when: function (w) { return Sim.nutritionForecast(w).kcalDays < 14 && !w.flags.card_seed; },
      build: function (w) {
        w.flags.card_seed = true;
        return {
          id: "seed_dispute", title: "The seed store", kicker: "DAY " + w.day,
          body: "Stored food is nearly gone and the next harvest is weeks away. The seed reserve is edible. " +
                "The agriculture lead has physically stood in the doorway of the seed room.",
          options: [
            { label: "Hold the seed reserve",
              detail: "Go hungry now to keep the farm viable next season.",
              uncertainty: "Weight loss continues for several weeks. The planting schedule survives.",
              act: function (w) {
                w.controls.ration = 0.7;
                Sim.logEvent(w, w.day, "decision", "Seed reserve held. Emergency ration declared.", "");
              } },
            { label: "Eat a third of the seed",
              detail: "Immediate calories at the cost of next season's planting density.",
              uncertainty: "Buys roughly twelve days. Future harvests fall by around a quarter.",
              act: function (w) {
                for (var k in w.stores.seeds) w.stores.seeds[k] *= 0.66;
                Sim.addFood(w, "wheat", 140); Sim.addFood(w, "beans", 60);
                Sim.logEvent(w, w.day, "decision", "Part of the seed reserve eaten.",
                  "The farm's next cycle will be thinner. Nobody is happy about it.");
              } },
            { label: "Open the imported ration",
              detail: "Sealed food from outside. Breaks food closure and is recorded as such.",
              uncertainty: "Solves the immediate problem entirely. Changes what the mission can claim.",
              needs: function (w) { return w.closure.allowFood && w.stores.foodReserveKcal > 0; },
              act: function (w) {
                Sim.logEvent(w, w.day, "closure", "Imported ration opened by decision, not by drift.", "");
              } }
          ]
        };
      }
    },
    {
      id: "chiller_summer",
      when: function (w) {
        var ch = Sim.machine(w, "chiller");
        return ch.broken && w.atm.temp > 28 && !w.flags.card_chill;
      },
      build: function (w) {
        w.flags.card_chill = true;
        return {
          id: "chiller_summer", title: "Chillers down in the heat", kicker: "DAY " + w.day,
          body: "The chillers have failed with the enclosure already at " + w.atm.temp.toFixed(1) +
                " degrees. Soil respiration roughly doubles for every ten degrees of warming, so the " +
                "oxygen budget is about to get worse as well as the working conditions.",
          options: [
            { label: "All hands to the repair",
              detail: "Everything else stops until the machine runs.",
              uncertainty: "Fastest route back. Crops go unwatered and unharvested meanwhile.",
              act: function (w) {
                w.controls.priorities = { farm: 0.3, mech: 3, sci: 0.1, eco: 0.2, dom: 0.6 };
                Sim.logEvent(w, w.day, "decision", "All available labour diverted to the chillers.", "");
              } },
            { label: "Shade the glass and wait",
              detail: "Cut incoming light to cut heat, and repair at a normal pace.",
              uncertainty: "Temperature rise slows. Photosynthesis falls with the light, so oxygen falls faster.",
              act: function (w) {
                w.flags.shaded = true;
                Sim.logEvent(w, w.day, "decision", "Glass shaded to control temperature.",
                  "Light to the plants is reduced by about a fifth.");
              } }
          ]
        };
      }
    }
  ];

  function checkCards(w) {
    if (w.pending) return;
    for (var i = 0; i < CARDS.length; i++) {
      if (CARDS[i].when(w)) { w.pending = CARDS[i].build(w); return; }
    }
  }

  /* ---------------- hypotheses ---------------- */
  /* Each is a real claim about the model that the player can test. The game
     scores explanation, not survival, so a refuted hypothesis honestly
     recorded is worth more than an unexamined one that happened to be right. */

  var TEMPLATES = [
    {
      id: "soil_resp",
      observation: "Night-time oxygen loss exceeds daytime recovery, and the gap widens when the soil is warm.",
      statement: "Microbial respiration in carbon-rich soil is the dominant oxygen sink.",
      test: "Compare the soil respiration flux against total oxygen consumption for fourteen days.",
      expect: "Soil respiration should account for more than half of all oxygen consumed.",
      risk: "None. This is an observation, not an intervention.",
      days: 14,
      evaluate: function (w) {
        var b = Sim.o2Budget(w);
        var share = b.soil / Math.max(1, b.soil + b.crew + b.other);
        return { supported: share > 0.5,
                 note: "Soil respiration accounted for " + Math.round(share * 100) +
                       " per cent of oxygen consumption across the test." };
      }
    },
    {
      id: "co2_sink",
      observation: "Oxygen is falling steadily while carbon dioxide is not rising by the matching amount.",
      statement: "Something other than the biology is removing carbon dioxide from the air.",
      test: "Track the carbon budget for twenty-one days and compare production against the change in the atmosphere.",
      expect: "Carbon dioxide removed by non-biological sinks should exceed a quarter of what respiration produces.",
      risk: "None, but it costs science hours that maintenance may need.",
      days: 21,
      evaluate: function (w) {
        var b = Sim.o2Budget(w);
        var share = (b.co2Concrete + Math.max(0, b.co2Ocean)) / Math.max(1, b.co2Prod);
        return { supported: share > 0.25,
                 note: "Non-biological sinks took " + Math.round(share * 100) +
                       " per cent of respired carbon. Concrete carbonation is the larger of the two." };
      }
    },
    {
      id: "leak",
      observation: "Total pressure is drifting downward.",
      statement: "The oxygen decline is caused by a leak in the envelope.",
      test: "Compare the rate of change of oxygen concentration against the rate of change of total pressure.",
      expect: "If leakage were the cause, oxygen concentration would hold while pressure fell.",
      risk: "None, beyond the time spent.",
      days: 10,
      evaluate: function (w) {
        return { supported: false,
                 note: "Leakage removes every gas in proportion, so it moves pressure and leaves composition " +
                       "almost untouched. Oxygen fell as a fraction of the air, not merely in absolute terms. " +
                       "The envelope is not the explanation." };
      }
    },
    {
      id: "irrigation",
      observation: "Night-time oxygen loss rose after agricultural irrigation was increased.",
      statement: "Higher soil moisture has increased microbial respiration in the farm.",
      test: "Cut farm irrigation hard for three weeks and watch soil respiration in that biome.",
      expect: "Farm soil respiration should fall by at least a few per cent as the soil dries.",
      risk: "Crop yield drops, and soil temperature moves at the same time, so the result is confounded.",
      days: 21,
      apply: function (w) { w.controls.irrigation.agriculture = 0.2; },
      applied: "Farm irrigation cut to 20 per cent for the duration of the test.",
      evaluate: function (w, base) {
        var now = Sim.biome(w, "agriculture").rh;
        var change = (now - base.farmRh) / Math.max(0.01, base.farmRh);
        var status = change < -0.03 ? "supported" : (change > 0.03 ? "refuted" : "inconclusive");
        return { supported: status === "supported", status: status,
                 note: "Farm soil respiration moved from " + base.farmRh.toFixed(1) + " to " + now.toFixed(1) +
                       " kg C a day, a change of " + (change >= 0 ? "+" : "") + Math.round(change * 100) +
                       " per cent. Soil moisture fell as intended, but soil temperature moved at the same time. " +
                       "Drying the soil pushes respiration one way and the season pushes it the other, and three " +
                       "weeks was not long enough to separate them." };
      }
    },
    {
      id: "sensor",
      observation: "Two oxygen sensors disagree by more than their stated tolerance.",
      statement: "The apparent decline is partly an instrument artefact.",
      test: "Calibrate the sensor network and compare before and after.",
      expect: "If the decline were an artefact, calibration would remove most of it.",
      risk: "Calibration consumes science hours.",
      days: 7,
      evaluate: function (w) {
        return { supported: false,
                 note: "Calibration shifted the reading by a fraction of a percentage point. The decline is " +
                       "in the atmosphere, not in the instrument, though the instrument was worth checking." };
      }
    },
    {
      id: "lights",
      observation: "Winter light is roughly half of summer light through the glass.",
      statement: "Supplemental lighting can offset the seasonal loss of photosynthesis.",
      test: "Run the light banks for fourteen days and measure the change in daily oxygen production.",
      expect: "Daily oxygen production should rise by more than ten per cent.",
      risk: "Large power draw, and heat that the chillers must then remove.",
      days: 14,
      apply: function (w) { w.controls.lights = Math.max(1, w.stores.lightBanks); },
      applied: "All available light banks switched on for the duration of the test.",
      evaluate: function (w, base) {
        var now = w.fluxDay.photosynthesis;
        var change = (now - base.production) / Math.max(1, base.production);
        return { supported: change > 0.10,
                 note: "Oxygen production changed by " + Math.round(change * 100) +
                       " per cent. Lighting works, but it does not touch the respiration side of the ledger." };
      }
    }
  ];

  function startTest(w, templateId) {
    var t = null;
    for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === templateId) t = TEMPLATES[i];
    if (!t) return null;
    var b = Sim.o2Budget(w);
    var h = {
      id: t.id + "_" + w.day, templateId: t.id, statement: t.statement, observation: t.observation,
      test: t.test, expect: t.expect, risk: t.risk, startDay: w.day, dueDay: w.day + t.days,
      status: "testing",
      baseline: { night: b.night, day: b.day, production: b.production, soil: b.soil,
                  farmRh: Sim.biome(w, "agriculture").rh },
      result: null
    };
    w.hypotheses.push(h);
    /* Some tests are interventions. Beginning them changes the world, which
       is the whole point and also the reason they carry a risk. */
    if (t.apply) { t.apply(w); h.applied = t.applied; }
    if (t.id === "sensor") { w.sensors.drift = 0; w.sensors.lastCalibration = w.day; w.sensors.confidence = 0.97; }
    Sim.logEvent(w, w.day, "science", "Test begun: " + t.statement,
      t.test + (t.applied ? " " + t.applied : "") + " Result expected on day " + h.dueDay + ".");
    return h;
  }

  function resolveTests(w) {
    for (var i = 0; i < w.hypotheses.length; i++) {
      var h = w.hypotheses[i];
      if (h.status !== "testing" || w.day < h.dueDay) continue;
      var t = null;
      for (var j = 0; j < TEMPLATES.length; j++) if (TEMPLATES[j].id === h.templateId) t = TEMPLATES[j];
      if (!t) { h.status = "abandoned"; continue; }
      var r = t.evaluate(w, h.baseline);
      /* Three outcomes, not two. A test that could not separate its variables
         is a real result and the notebook should say so rather than round it
         into a verdict the data does not support. */
      h.status = r.status || (r.supported ? "supported" : "refuted");
      h.result = r.note;
      var word = { supported: "Supported", refuted: "Not supported", inconclusive: "Inconclusive" }[h.status];
      Sim.logEvent(w, w.day, "science", word + ": " + h.statement, r.note);
      Sim.pushAlert(w, ALERT_LEVEL.ADVISORY, "science", "Experiment complete: " + word.toLowerCase(),
        h.statement + " — " + r.note, "Recorded in the mission notebook either way.");
    }
  }

  /* ---------------- guided mission chapters ---------------- */

  var CHAPTERS = [
    { id: 1, name: "The World Before Closure", at: function (w) { return w.day === 0; },
      text: "Eight people are inside. The outer door is shut and the pressure seal has rotated. " +
            "Everything they will use for a year is already in the building." },
    { id: 2, name: "The First Harvest", at: function (w) { return w.counters.harvests >= 4 && !w.flags.ch2; },
      text: "The first plots have come in. The farm will feed most of the crew but not all of them, " +
            "and the gap has to be closed by rationing, by planting, or by the reserve." },
    { id: 3, name: "Night Breath", at: function (w) { return w.day === 40; },
      text: "The atmosphere has a rhythm now. Oxygen climbs through the day and falls through the night. " +
            "The two are not equal, and the difference is small enough to miss and large enough to matter." },
    { id: 4, name: "The Missing Oxygen", at: function (w) { return Sim.o2frac(w) * 100 < 19 && !w.flags.ch4; },
      text: "Oxygen has passed 19 per cent. Carbon dioxide has not risen to match. Wherever the carbon is going, " +
            "it is not staying in the air." },
    { id: 5, name: "The Hungry Season", at: function (w) { return Sim.nutritionForecast(w).kcalDays < 20 && !w.flags.ch5; },
      text: "Stores are thin and the light is poor. Every hour spent on the farm is an hour not spent on the machinery." },
    { id: 6, name: "The Invasion", at: function (w) { return w.ecology.ants > 0.5 && !w.flags.ch6; },
      text: "The insect community has reorganised itself around one tolerant, opportunistic species. " +
            "It was never planted and it is not leaving." },
    { id: 7, name: "The Human System", at: function (w) {
        var c = Sim.liveCrew(w);
        return c.length && sum(c, function (p) { return p.morale; }) / c.length < 0.4 && !w.flags.ch7; },
      text: "The hardest system in the building is the one that argues back. Fatigue, monotony and thin air " +
            "are doing what they always do to a small group with no way out." },
    { id: 8, name: "Day 365", at: function (w) { return w.day >= w.missionLength - 1; },
      text: "The year is nearly up. What the mission can claim now depends less on whether everyone survived " +
            "than on whether anyone can explain why." }
  ];

  function checkChapters(w) {
    for (var i = 0; i < CHAPTERS.length; i++) {
      var c = CHAPTERS[i];
      if (w.flags["ch" + c.id]) continue;
      if (c.at(w)) {
        w.flags["ch" + c.id] = true;
        w.chapter = c;
        Sim.logEvent(w, w.day, "chapter", "Chapter " + c.id + ": " + c.name, c.text);
      }
    }
  }

  function tick(w) {
    evaluate(w);
    resolveTests(w);
    checkChapters(w);
    checkCards(w);
  }

  return { tick: tick, TEMPLATES: TEMPLATES, startTest: startTest, CHAPTERS: CHAPTERS };
})();
