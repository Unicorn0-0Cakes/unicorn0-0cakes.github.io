"use strict";
/* =====================================================================
   BIOSPHERE: CLOSED WORLD — main.js
   Bootstrapping, the mission-design wizard, the clock, and all of the
   wiring between what the player touches and what the model does.
   ===================================================================== */

var Game = (function () {

  var W = null;
  var running = false;
  var speedIdx = 1;
  var screen = "command";
  var acc = 0, lastFrame = 0;
  var pauseOn = { emergency: true, action: false };
  var renderTimer = 0;

  /* ---------------- boot ---------------- */

  function boot() {
    /* Day/night is owned by the site-wide switch in assets/orbital.js. */
    window.addEventListener("orbital:theme", function () { if (W) requestRender(); });
    buildHome();
    document.addEventListener("keydown", function (ev) {
      if (!W || document.getElementById("home").style.display !== "none") return;
      if (ev.target.tagName === "INPUT" || ev.target.tagName === "SELECT" || ev.target.tagName === "TEXTAREA") return;
      if (ev.code === "Space") { ev.preventDefault(); togglePlay(); }
      if (ev.key >= "1" && ev.key <= "5") setSpeed(+ev.key - 1);
    });
    window.addEventListener("resize", function () { if (W) requestRender(); });
  }



  /* ---------------- home ---------------- */

  function buildHome() {
    var el = document.getElementById("homeModes");
    var modes = [
      { id: "guided", title: "Guided mission — 365 days",
        body: "The flagship scenario. A facility built to the historical specification closes with eight crew " +
              "and a rich agricultural soil. Somewhere in the first hundred days the oxygen starts to go missing.",
        tags: ["Recommended", "8 chapters", "The oxygen mystery"] },
      { id: "architect", title: "Architect mode",
        body: "Design the closed world first: biome areas, soil carbon, sealed or exposed concrete, crew, " +
              "reserves, and the rules governing outside intervention. Then live inside your decisions.",
        tags: ["Sandbox", "Full control", "Counterfactuals"] },
      { id: "quick", title: "Short mission — 120 days",
        body: "The same world on a shorter clock. Long enough for the atmosphere to establish a trend and for " +
              "one full crop cycle, short enough for a single sitting.",
        tags: ["Quick", "One crop cycle"] },
      { id: "hard", title: "No outside help — 365 days",
        body: "Identical to the guided mission except that no oxygen, food, parts or outside expertise may enter. " +
              "Whatever happens, happens inside.",
        tags: ["Strict closure", "Difficult"] }
    ];
    el.innerHTML = modes.map(function (m) {
      return '<div class="modecard" data-mode="' + m.id + '"><h3>' + m.title + '</h3><p>' + m.body + '</p>' +
             '<div class="tags">' + m.tags.map(function (t) { return '<span class="pill">' + t + '</span>'; }).join("") +
             '</div></div>';
    }).join("");
    el.onclick = function (ev) {
      var card = ev.target.closest(".modecard");
      if (!card) return;
      var m = card.dataset.mode;
      if (m === "architect") openWizard();
      else if (m === "guided") start({ missionLength: 365 });
      else if (m === "quick") start({ missionLength: 120 });
      else if (m === "hard") start({ missionLength: 365, closure: {
        allowOxygen: false, allowFood: false, allowParts: false,
        allowOutsideExperts: false, evacuationEndsMission: true, reportEverything: true },
        reserves: { o2: 0, food: 0, spares: 4, seeds: 100, medical: 5, lights: 2, scrub: 1 } });
    };
  }

  /* ---------------- architect wizard ---------------- */

  var wiz = null;

  function openWizard() {
    wiz = {
      step: 0,
      purpose: "earth",
      areas: {}, budget: 60,
      soilCarbon: 1.0, sealed: false, pollinators: 1.0, decomposers: 1.0, marine: 1.0,
      crew: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"],
      reserves: { o2: 120000, food: 600000, spares: 6, seeds: 100, medical: 6, lights: 2, scrub: 1 },
      closure: { allowOxygen: true, allowFood: true, allowParts: true,
                 allowOutsideExperts: true, evacuationEndsMission: true, reportEverything: true },
      missionLength: 365
    };
    for (var i = 0; i < BIOMES.length; i++) wiz.areas[BIOMES[i].id] = BIOMES[i].area;
    drawWizard();
    modal(true);
  }

  var STEPS = ["Purpose", "Structure", "Biology", "Crew", "Reserves", "Closure"];

  function drawWizard() {
    var body = "";
    var steps = '<div class="wizsteps">' + STEPS.map(function (s, i) {
      return '<div class="' + (i === wiz.step ? "on" : (i < wiz.step ? "done" : "")) + '">' + (i + 1) + ". " + s + '</div>';
    }).join("") + '</div>';

    if (wiz.step === 0) {
      var purposes = [
        ["earth", "Earth ecology research", "Understand how a closed terrestrial system behaves. 365 days."],
        ["space", "Space settlement research", "Treat this as a rehearsal for somewhere with no atmosphere at all. 365 days."],
        ["survival", "Survival demonstration", "The only question is whether eight people come out healthy. 240 days."],
        ["food", "Food production experiment", "Push the farm and see what a closed agriculture can really deliver. 300 days."]
      ];
      body = '<p class="dim">What is this mission for? It changes what the final report measures you against.</p>' +
        purposes.map(function (p) {
          return '<div class="choice ' + (wiz.purpose === p[0] ? "sel" : "") + '" data-purpose="' + p[0] + '">' +
                 '<h4>' + p[1] + '</h4><p>' + p[2] + '</p></div>';
        }).join("");
    }

    if (wiz.step === 1) {
      var total = 0;
      for (var k in wiz.areas) total += wiz.areas[k];
      body = '<p class="dim">Allocate the footprint. A larger farm feeds people; a larger rainforest fixes ' +
        'carbon but also holds more soil to respire it back. Predictions are ranges, not promises.</p>' +
        BIOMES.map(function (b) {
          return '<div class="allocrow"><span>' + b.name + '</span>' +
                 '<input type="range" class="area" data-b="' + b.id + '" min="200" max="4000" step="50" value="' +
                 wiz.areas[b.id] + '"><span class="mono" style="text-align:right">' + wiz.areas[b.id] + ' m²</span></div>';
        }).join("") +
        '<div class="assumption">Total footprint <b>' + Math.round(total).toLocaleString() + ' m²</b>. ' +
        'The historical facility was about 12,700 m². Going much larger is not free: every square metre of ' +
        'soil breathes.</div>';
    }

    if (wiz.step === 2) {
      body = '<p class="dim">The biology you install before closure is the biology you have afterwards.</p>' +
        choiceGroup("soilCarbon", "Agricultural and forest soil", [
          [1.0, "Rich organic soil", "High fertility and high respiration. This is what the historical facility used, " +
           "and it is the leading explanation for what happened to the oxygen."],
          [0.62, "Lean, low-carbon soil", "Less fertility, far less microbial respiration. Crops will need more " +
           "nutrient management and yields start lower."],
          [1.3, "Very rich soil", "Maximum fertility. An enormous carbon store sitting underneath everything you breathe."]
        ], wiz.soilCarbon) +
        choiceGroup("sealed", "Structural concrete", [
          [false, "Left exposed", "Concrete will absorb carbon dioxide as it cures and carbonates. Silent, large, finite."],
          [true, "Sealed before closure", "Removes the hidden carbon sink. Carbon dioxide will then behave the way " +
           "the respiration figures say it should — which is not necessarily comfortable."]
        ], wiz.sealed) +
        choiceGroup("pollinators", "Pollinator strategy", [
          [1.0, "Standard assemblage", "One or two effective pollinators per crop."],
          [1.35, "Redundant pollinators", "Several species covering the same role. Costs space and food."],
          [0.7, "Minimal", "Fewer mouths in the system. Fruit set depends on very few insects."]
        ], wiz.pollinators);
    }

    if (wiz.step === 3) {
      var cover = coverage(wiz.crew);
      body = '<p class="dim">Choose eight. The team matters more than any individual: you are buying coverage, ' +
        'not talent.</p><div class="crewpick">' +
        CREW_POOL.map(function (p) {
          var sel = wiz.crew.indexOf(p.id) >= 0;
          return '<div class="p ' + (sel ? "sel" : "") + '" data-crew="' + p.id + '"><b>' + p.name + '</b>' +
                 '<span class="r">' + p.role + '</span>' +
                 '<div class="tiny muted" style="margin-top:4px">' + p.needs + '</div></div>';
        }).join("") + '</div>' +
        '<div class="assumption"><b>' + wiz.crew.length + ' of 8 selected.</b><br>' + cover + '</div>';
    }

    if (wiz.step === 4) {
      var spent = cost(wiz.reserves);
      body = '<p class="dim">Finite mass, finite space, finite money. Everything here is a hedge against a ' +
        'failure you cannot yet name.</p>' +
        RESERVE_ITEMS.map(function (it) {
          var v = wiz.reserves[it.id] || 0;
          return '<div class="ctl"><label>' + it.name + '<b>' + v.toLocaleString() + ' ' + it.unit + '</b></label>' +
                 '<input type="range" class="res" data-r="' + it.id + '" min="0" max="' + it.max +
                 '" step="' + it.step + '" value="' + v + '">' +
                 '<div class="tiny muted">' + it.note + '</div></div>';
        }).join("") +
        '<div class="assumption">Budget used <b>' + spent + ' of ' + wiz.budget + '</b>. ' +
        (spent > wiz.budget ? '<span style="color:var(--danger)">Over budget. Something has to go.</span>' : 'Within budget.') +
        '</div>';
    }

    if (wiz.step === 5) {
      var c = wiz.closure;
      body = '<p class="dim">Define what counts as intervention. This does not stop you doing any of it; ' +
        'it decides what the final report is allowed to claim.</p>' +
        toggle("allowOxygen", "Outside oxygen may enter", c.allowOxygen,
               "Without this, the reserve is sealed and the atmosphere is on its own.") +
        toggle("allowFood", "Food may be imported", c.allowFood,
               "Sealed rations exist either way; this decides whether they may be opened.") +
        toggle("allowParts", "Replacement parts may enter", c.allowParts,
               "Otherwise a failed machine waits for improvisation.") +
        toggle("allowOutsideExperts", "Outside experts may see the data", c.allowOutsideExperts,
               "Informational closure. Convenient, and it changes whose mission this is.") +
        toggle("evacuationEndsMission", "Medical evacuation ends the mission", c.evacuationEndsMission,
               "If disabled, the mission continues with fewer people, which is its own kind of result.") +
        toggle("reportEverything", "Every intervention is publicly reported", c.reportEverything,
               "The historical experiment was criticised most sharply where this was in doubt.") +
        '<div class="assumption">The final screen will list exactly what was imported, why, and what would ' +
        'probably have happened without it. A justified medical intervention is not framed as a moral failure.</div>';
    }

    document.getElementById("modalTitle").textContent = "Design the closed world";
    document.getElementById("modalKicker").textContent = "Architect mode · step " + (wiz.step + 1) + " of 6";
    document.getElementById("modalBody").innerHTML = steps + body;
    document.getElementById("modalFoot").innerHTML =
      '<button class="btn ghost" id="wizCancel">Cancel</button>' +
      (wiz.step > 0 ? '<button class="btn" id="wizBack">Back</button>' : '') +
      '<button class="btn primary" id="wizNext">' + (wiz.step === 5 ? "Close the airlock" : "Continue") + '</button>';

    var mb = document.getElementById("modalBody");
    mb.onclick = function (ev) {
      var ch = ev.target.closest("[data-purpose]");
      if (ch) { wiz.purpose = ch.dataset.purpose; return drawWizard(); }
      var g = ev.target.closest("[data-group]");
      if (g) { wiz[g.dataset.group] = JSON.parse(g.dataset.val); return drawWizard(); }
      var cw = ev.target.closest("[data-crew]");
      if (cw) {
        var id = cw.dataset.crew, i = wiz.crew.indexOf(id);
        if (i >= 0) wiz.crew.splice(i, 1);
        else if (wiz.crew.length < 8) wiz.crew.push(id);
        return drawWizard();
      }
      var tg = ev.target.closest("[data-toggle]");
      if (tg) { wiz.closure[tg.dataset.toggle] = !wiz.closure[tg.dataset.toggle]; return drawWizard(); }
    };
    mb.oninput = function (ev) {
      var t = ev.target;
      if (t.classList.contains("area")) { wiz.areas[t.dataset.b] = +t.value; drawWizard(); }
      if (t.classList.contains("res")) { wiz.reserves[t.dataset.r] = +t.value; drawWizard(); }
    };
    document.getElementById("wizCancel").onclick = function () { modal(false); };
    if (document.getElementById("wizBack"))
      document.getElementById("wizBack").onclick = function () { wiz.step--; drawWizard(); };
    document.getElementById("wizNext").onclick = function () {
      if (wiz.step === 3 && wiz.crew.length !== 8) return;
      if (wiz.step === 4 && cost(wiz.reserves) > wiz.budget) return;
      if (wiz.step < 5) { wiz.step++; drawWizard(); }
      else {
        var len = { earth: 365, space: 365, survival: 240, food: 300 }[wiz.purpose] || 365;
        modal(false);
        start({
          missionLength: len, areas: wiz.areas, soilCarbonFactor: wiz.soilCarbon,
          sealedConcrete: wiz.sealed, crew: wiz.crew, reserves: wiz.reserves, closure: wiz.closure,
          pollinators: wiz.pollinators
        });
      }
    };
  }

  function choiceGroup(group, title, options, current) {
    return '<div class="upper dim" style="margin:14px 0 6px">' + title + '</div>' +
      options.map(function (o) {
        var sel = JSON.stringify(o[0]) === JSON.stringify(current);
        return '<div class="choice ' + (sel ? "sel" : "") + '" data-group="' + group +
               '" data-val=\'' + JSON.stringify(o[0]) + '\'><h4>' + o[1] + '</h4><p>' + o[2] + '</p></div>';
      }).join("");
  }
  function toggle(key, label, on, note) {
    return '<div class="choice ' + (on ? "sel" : "") + '" data-toggle="' + key + '">' +
           '<h4>' + (on ? "✓ " : "✗ ") + label + '</h4><p>' + note + '</p></div>';
  }
  function cost(r) {
    var t = 0;
    for (var i = 0; i < RESERVE_ITEMS.length; i++) {
      var it = RESERVE_ITEMS[i];
      t += (r[it.id] || 0) / it.step * it.cost / 10;
    }
    return Math.round(t);
  }
  function coverage(ids) {
    var s = { mech: 0, farm: 0, med: 0, sci: 0, eco: 0 };
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < CREW_POOL.length; j++) {
        if (CREW_POOL[j].id !== ids[i]) continue;
        for (var k in s) s[k] = Math.max(s[k], CREW_POOL[j].skills[k]);
      }
    }
    var deep = [], thin = [];
    var names = { mech: "engineering", farm: "agriculture", med: "medical", sci: "science", eco: "ecology" };
    for (var k2 in s) (s[k2] > 0.85 ? deep : thin).push(names[k2]);
    /* redundancy: how many people can cover each role adequately */
    var redundancy = [];
    for (var k3 in s) {
      var n = 0;
      for (var a = 0; a < ids.length; a++)
        for (var b = 0; b < CREW_POOL.length; b++)
          if (CREW_POOL[b].id === ids[a] && CREW_POOL[b].skills[k3] > 0.6) n++;
      if (n < 2) redundancy.push(names[k3]);
    }
    return (deep.length ? "Strong depth in " + deep.join(", ") + ". " : "") +
           (thin.length ? "Thin in " + thin.join(", ") + ". " : "") +
           (redundancy.length ? "<b>No redundancy in " + redundancy.join(", ") +
            "</b> — one illness removes the capability." : "Every role has a second occupant.");
  }

  /* ---------------- start ---------------- */

  function start(opts) {
    W = Sim.createWorld(opts);
    if (opts && opts.pollinators) W.ecology.pollinators = opts.pollinators;
    UI.setWorld(W);
    document.getElementById("home").style.display = "none";
    document.getElementById("app").classList.add("on");
    Dome.select("rainforest");
    UI.select("biome", "rainforest");
    wireShell();
    go("command");
    running = true; syncPlay(); setSpeed(speedIdx);
    lastFrame = performance.now();
    requestAnimationFrame(frame);
    openIntro();
  }

  function openIntro() {
    document.getElementById("modalTitle").textContent = "Material closure established";
    document.getElementById("modalKicker").textContent = "26 SEPTEMBER · DAY 0";
    document.getElementById("modalBody").innerHTML =
      '<table class="data"><tbody>' +
      ["Oxygen|20.90 %", "Carbon dioxide|520 ppm",
       "Stored food|" + Math.round(Sim.nutritionForecast(W).kcalDays) + " days",
       "Potable water|" + Math.round(W.water.potable).toLocaleString() + " L",
       "Crew health|Nominal",
       "Known atmospheric leakage|" + (ENC.LEAK_PER_DAY * 100).toFixed(3) + " % per day",
       "Mission duration|" + W.missionLength + " days"].map(function (r) {
        var p = r.split("|");
        return '<tr><td>' + p[0] + '</td><td class="n" style="text-align:right">' + p[1] + '</td></tr>';
      }).join("") + '</tbody></table>' +
      '<p style="margin:16px 0 0;font-size:15px">Everything you need is already inside. You hope.</p>';
    document.getElementById("modalFoot").innerHTML =
      '<button class="btn primary" id="introGo">Begin at sunrise</button>';
    document.getElementById("introGo").onclick = function () { modal(false); };
    modal(true);
  }

  /* ---------------- shell wiring ---------------- */

  function wireShell() {
    document.getElementById("rail").onclick = function (ev) {
      var it = ev.target.closest(".navitem");
      if (it) go(it.dataset.screen);
    };
    document.getElementById("playBtn").onclick = togglePlay;
    
    document.getElementById("speedSeg").onclick = function (ev) {
      var b = ev.target.closest("button"); if (b) setSpeed(+b.dataset.s);
    };
    document.getElementById("homeBtn").onclick = function () {
      if (!confirm("Abandon this mission and return to the start?")) return;
      running = false; W = null;
      document.getElementById("app").classList.remove("on");
      document.getElementById("home").style.display = "";
    };
    document.getElementById("speedSeg").innerHTML = SPEEDS.map(function (s, i) {
      return '<button data-s="' + i + '" class="' + (i === speedIdx ? "on" : "") + '">' + s.label + '</button>';
    }).join("");

    /* which alerts are allowed to stop the clock */
    var pb = document.getElementById("pauseBtn");
    var MODES = [
      { k: "emergency", label: "Pause: emergencies", e: true, a: false },
      { k: "action", label: "Pause: action & up", e: true, a: true },
      { k: "never", label: "Pause: never", e: false, a: false }
    ];
    var mi = 0;
    function syncPause() {
      pb.textContent = MODES[mi].label;
      pauseOn.emergency = MODES[mi].e; pauseOn.action = MODES[mi].a;
    }
    pb.onclick = function () { mi = (mi + 1) % MODES.length; syncPause(); };
    syncPause();

    var main = document.getElementById("main");
    main.addEventListener("input", onInput);
    main.addEventListener("change", onInput);
    main.addEventListener("click", onClick);
    var insp = document.getElementById("inspector");
    insp.addEventListener("input", onInput);

    var cv = document.getElementById("domeCanvas");
    if (cv) Dome.attach(cv, function (id) { if (id) { UI.select("biome", id); UI.inspector(); } });
  }

  function onInput(ev) {
    var t = ev.target;
    if (!W) return;
    /* Selects fire both input and change; acting on both would plant a plot
       twice and spend the seed for it twice. */
    var isSelect = t.tagName === "SELECT";
    if (isSelect && ev.type !== "change") return;
    if (!isSelect && ev.type === "change") return;
    if (t.id === "ctlLights") W.controls.lights = +t.value;
    else if (t.id === "ctlScrub") W.controls.scrubber = +t.value;
    else if (t.id === "ctlMix") W.controls.airMix = +t.value;
    else if (t.id === "ctlChill") W.controls.chillerSet = +t.value;
    else if (t.id === "ctlPrev") W.controls.preventive = +t.value;
    else if (t.classList.contains("irr")) W.controls.irrigation[t.dataset.b] = +t.value;
    else if (t.id && t.id.indexOf("pri_") === 0) W.controls.priorities[t.id.slice(4)] = +t.value;
    else if (t.classList.contains("plantsel")) {
      var pid = +t.dataset.p;
      for (var i = 0; i < W.farm.plots.length; i++) {
        if (W.farm.plots[i].id !== pid) continue;
        var pl = W.farm.plots[i];
        if (pl.planted && pl.biomass > 0) Sim.harvestPlot(W, pl);
        if (!Sim.plantPlot(W, pl, t.value))
          Sim.logEvent(W, W.day, "farm", "Not enough seed to plant " + (CROP_BY_ID[t.value] || {}).name + ".", "");
        else Sim.logEvent(W, W.day, "farm", "Plot " + pid + " planted with " + CROP_BY_ID[t.value].name + ".", "");
      }
      requestRender(true);
    }
    else if (t.classList.contains("dutysel")) {
      for (var j = 0; j < W.crew.length; j++) if (W.crew[j].id === t.dataset.c) W.crew[j].duty = t.value;
    }
    else return;
    requestRender();
  }

  function onClick(ev) {
    if (!W) return;
    var t = ev.target;
    var ration = t.closest("[data-ration]");
    if (ration) {
      var v = +ration.dataset.ration;
      if (v !== W.controls.ration) {
        W.controls.ration = v;
        Sim.logEvent(W, W.day, "decision", "Ration set to " + Math.round(v * 100) + " per cent.",
          v < 1 ? "Agreed at the evening meeting. Nobody pretended to be pleased." : "Returned to full ration.");
      }
      return requestRender(true);
    }
    var hyp = t.closest("[data-hyp]");
    if (hyp && !hyp.disabled) { Events.startTest(W, hyp.dataset.hyp); return requestRender(true); }
    var bio = t.closest("[data-biome]");
    if (bio) { UI.select("biome", bio.dataset.biome); Dome.select(bio.dataset.biome); return UI.inspector(); }
    var cr = t.closest("[data-crew]");
    if (cr) { UI.select("crew", cr.dataset.crew); return UI.inspector(); }

    if (t.id === "btnCalibrate") {
      W.sensors.drift = 0; W.sensors.lastCalibration = W.day; W.sensors.confidence = 0.97;
      Sim.logEvent(W, W.day, "science", "Sensor network calibrated.",
        "Six science hours spent. Readings before today should be treated with more suspicion than those after.");
      return requestRender(true);
    }
    if (t.id === "btnSeal") {
      if (W.concrete.sealed > 0.5) return;
      W.concrete.sealed = 0.8;
      Sim.logEvent(W, W.day, "decision", "Exposed concrete sealed.",
        "A large carbon sink has been closed off. Carbon dioxide will now accumulate closer to the rate " +
        "respiration implies, which is informative and uncomfortable in equal measure.");
      return requestRender(true);
    }
    if (t.id === "btnO2") return oxygenDialog();
    if (t.id === "btnCompare") {
      document.getElementById("cmpOut").innerHTML =
        UI.compare(+document.getElementById("cmpA").value, +document.getElementById("cmpB").value);
      return;
    }
  }

  function oxygenDialog() {
    if (!W.closure.allowOxygen) {
      Sim.logEvent(W, W.day, "closure", "Oxygen injection refused.",
        "This mission was declared closed to outside oxygen before the airlock shut.");
      return requestRender(true);
    }
    var before = Sim.o2frac(W) * 100;
    document.getElementById("modalTitle").textContent = "Inject oxygen";
    document.getElementById("modalKicker").textContent = "DAY " + W.day + " · ATMOSPHERIC CLOSURE";
    document.getElementById("modalBody").innerHTML =
      '<p>Oxygen is currently <b>' + before.toFixed(2) + ' per cent</b>. The reserve holds ' +
      Math.round(W.stores.o2Reserve).toLocaleString() + ' mol.</p>' +
      '<div class="ctl"><label>Amount<b><span id="o2amt">40,000</span> mol</b></label>' +
      '<input type="range" id="o2range" min="10000" max="' + Math.max(10000, Math.round(W.stores.o2Reserve)) +
      '" step="10000" value="40000"></div>' +
      '<div id="o2effect" class="assumption"></div>' +
      '<div class="assumption">This is not cheating and it is not free. The end-of-mission report will record ' +
      'the amount, the day, and what the atmosphere was doing before and after. The cause of the decline is ' +
      'unaffected by this action.</div>';
    document.getElementById("modalFoot").innerHTML =
      '<button class="btn ghost" id="o2cancel">Cancel</button>' +
      '<button class="btn danger" id="o2go">Inject</button>';
    var rangeEl = document.getElementById("o2range");
    function upd() {
      var mol = +rangeEl.value;
      document.getElementById("o2amt").textContent = mol.toLocaleString();
      var after = (W.atm.o2 + mol) / (Sim.totalMol(W) + mol) * 100;
      var rate = W.history.length > 8 ? (W.history[W.history.length - 1].o2 - W.history[W.history.length - 8].o2) / 7 : -0.01;
      var days = rate < 0 ? Math.round((after - before) / -rate) : 999;
      document.getElementById("o2effect").innerHTML =
        "Raises the atmosphere to <b>" + after.toFixed(2) + " per cent</b>. At the current rate of decline " +
        "this buys roughly <b>" + (days > 900 ? "an indefinite period" : days + " days") + "</b> before you are back where you started.";
    }
    rangeEl.oninput = upd; upd();
    document.getElementById("o2cancel").onclick = function () { modal(false); };
    document.getElementById("o2go").onclick = function () {
      Sim.injectOxygen(W, +rangeEl.value);
      modal(false); requestRender(true);
    };
    modal(true);
  }

  /* ---------------- decision cards ---------------- */

  function showPending() {
    var c = W.pending;
    running = false; syncPlay();
    document.getElementById("modalTitle").textContent = c.title;
    document.getElementById("modalKicker").textContent = c.kicker;
    var opts = c.options.filter(function (o) { return !o.needs || o.needs(W); });
    document.getElementById("modalBody").innerHTML =
      '<p>' + UI.esc(c.body) + '</p>' +
      opts.map(function (o, i) {
        return '<div class="choice" data-opt="' + i + '"><h4>' + (i + 1) + ". " + UI.esc(o.label) + '</h4>' +
               '<p>' + UI.esc(o.detail) + '</p>' +
               '<div class="con">' + UI.esc(o.uncertainty) + '</div></div>';
      }).join("") +
      '<div class="assumption">The game does not pretend you have perfect foresight. Every consequence above ' +
      'is what is expected, not what is guaranteed.</div>';
    document.getElementById("modalFoot").innerHTML = "";
    document.getElementById("modalBody").onclick = function (ev) {
      var el = ev.target.closest("[data-opt]");
      if (!el) return;
      var o = opts[+el.dataset.opt];
      Sim.logEvent(W, W.day, "decision", c.title + " — " + o.label, o.uncertainty);
      if (o.act) o.act(W);
      W.pending = null;
      modal(false); running = true; syncPlay(); requestRender(true);
    };
    modal(true);
  }

  /* ---------------- ending ---------------- */

  function showEnding() {
    var e = W.ending;
    running = false; syncPlay();
    var crew = Sim.liveCrew(W);
    var nut = Sim.nutritionForecast(W);
    var sinks = Sim.carbonSinks(W);
    var supported = W.hypotheses.filter(function (h) { return h.status === "supported"; });
    var refuted = W.hypotheses.filter(function (h) { return h.status === "refuted"; });

    function block(title, rows) {
      return '<h3 style="margin-top:16px">' + title + '</h3><table class="data"><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + r[0] + '</td><td class="n" style="text-align:right">' + r[1] + '</td></tr>';
        }).join("") + '</tbody></table>';
    }

    document.getElementById("modalTitle").textContent = e.classification;
    document.getElementById("modalKicker").textContent = "END OF MISSION · DAY " + e.day;
    document.getElementById("modalBody").innerHTML =
      '<p class="dim">Not a victory and not a failure. A classification, and a record of how you got there.</p>' +

      block("Survival", [
        ["Mission duration", e.day + " of " + W.missionLength + " days"],
        ["Crew remaining", crew.length + " of " + W.crew.length],
        ["Mean crew health", UI.pct(e.avgHealth)],
        ["Mean body mass", UI.pct(crew.length ? sum(crew, function (p) { return p.weight; }) / crew.length : 0) + " of pre-closure"],
        ["Medical events", String(W.log.filter(function (l) { return l.kind === "medical"; }).length)]
      ]) +

      block("Atmosphere", [
        ["Oxygen at closure", "20.90 %"],
        ["Oxygen at end", UI.n2(Sim.o2frac(W) * 100) + " %"],
        ["Carbon dioxide at end", UI.n0(Sim.co2ppm(W)) + " ppm"],
        ["Soil carbon lost", UI.n0(sinks.soilLost) + " kg C"],
        ["Carbon absorbed by concrete", UI.n0(sinks.concrete) + " mol"],
        ["Ocean pH", W.ocean.ph.toFixed(2) + " (8.12 at closure)"]
      ]) +

      block("Material closure", [
        ["Oxygen imported", UI.n0(W.ledger.o2Imported) + " mol"],
        ["Food imported", UI.n0(W.ledger.foodImportedKcal) + " kcal"],
        ["Replacement parts imported", String(W.ledger.partsImported)],
        ["Outside expert consultations", String(W.ledger.expertCalls)],
        ["Carbon removed by machinery", UI.n0(W.ledger.carbonScrubbed) + " mol"]
      ]) +

      block("Ecological outcome", [
        ["Species richness retained", UI.pct(W.ecology.richness)],
        ["Functional redundancy", UI.pct(W.ecology.redundancy)],
        ["Invasive dominance", UI.pct(W.ecology.invasive)],
        ["Pollinators", UI.pct(W.ecology.pollinators) + " of baseline"],
        ["Reef condition", UI.pct(W.ocean.reef)]
      ]) +

      block("Scientific record", [
        ["Hypotheses tested", String(W.hypotheses.length)],
        ["Supported", String(supported.length)],
        ["Not supported", String(refuted.length)],
        ["Inconclusive", String(W.hypotheses.filter(function (h) { return h.status === "inconclusive"; }).length)],
        ["Unresolved anomalies", String(W.alerts.filter(function (a) { return a.level >= 1 && !a.cleared; }).length)],
        ["Measurement confidence at end", UI.pct(W.sensors.confidence)]
      ]) +

      block("The human system", [
        ["Mean morale", UI.pct(e.social)],
        ["Mean fatigue", UI.pct(crew.length ? sum(crew, function (p) { return p.fatigue; }) / crew.length : 0)],
        ["Recorded decisions", String(W.log.filter(function (l) { return l.kind === "decision"; }).length)],
        ["Trust in leadership", UI.pct(crew.length ? sum(crew, function (p) { return p.trust; }) / crew.length : 0)]
      ]) +

      '<h3 style="margin-top:16px">What this run can and cannot claim</h3>' +
      '<p style="font-size:12.5px;color:var(--ink-dim)">' +
      (supported.length
        ? "You established " + supported.length + " supported finding" + (supported.length > 1 ? "s" : "") +
          ", including: " + UI.esc(supported[0].statement) + " "
        : "No hypothesis was tested to a conclusion, so the mission has an outcome but not an explanation. ") +
      (e.closureBroken
        ? "Material closure was broken, so nothing here is evidence about what a fully closed system would do."
        : "Closure held, so the atmospheric record is internally consistent.") +
      " Everything above is a property of this model. It is not a historical finding about the real facility.</p>";

    document.getElementById("modalFoot").innerHTML =
      '<button class="btn" id="endStay">Stay and look around</button>' +
      '<button class="btn primary" id="endHome">Return to the start</button>';
    document.getElementById("endStay").onclick = function () { modal(false); };
    document.getElementById("endHome").onclick = function () {
      modal(false); W = null;
      document.getElementById("app").classList.remove("on");
      document.getElementById("home").style.display = "";
    };
    modal(true);
  }

  /* ---------------- clock ---------------- */

  function frame(now) {
    var dt = Math.min(250, now - lastFrame); lastFrame = now;
    Dome.tick();
    if (W) {
      if (running && !W.ended) {
        acc += dt / 1000 * SPEEDS[speedIdx].hpr;
        var steps = Math.floor(acc);
        acc -= steps;
        for (var i = 0; i < steps && i < 200; i++) {
          var dayBefore = W.day;
          Sim.step(W);
          if (W.day !== dayBefore) {
            Events.tick(W);
            if (W.pending) { showPending(); break; }
            if (interrupt()) break;
          }
          if (W.ended) break;
        }
        if (W.ended && !W.endShown) { W.endShown = true; showEnding(); }
      }
      var cv = document.getElementById("domeCanvas");
      if (cv && screen === "command") Dome.draw(cv, W);
      renderTimer += dt;
      if (renderTimer > 700) { renderTimer = 0; softRender(); }
    }
    requestAnimationFrame(frame);
  }

  /* Pause the clock when something demands attention. */
  function interrupt() {
    var fresh = W.alerts.filter(function (a) { return !a.cleared && a.day === W.day; });
    for (var i = 0; i < fresh.length; i++) {
      if (fresh[i].level === ALERT_LEVEL.EMERGENCY && pauseOn.emergency) {
        running = false; syncPlay(); go(systemScreen(fresh[i].system)); return true;
      }
      if (fresh[i].level === ALERT_LEVEL.ACTION && pauseOn.action) {
        running = false; syncPlay(); return true;
      }
    }
    return false;
  }
  function systemScreen(s) {
    return { atmosphere: "atmosphere", water: "water", food: "agriculture", ecology: "ecology",
             crew: "crew", tech: "tech", science: "science" }[s] || "command";
  }

  function togglePlay() { if (W && !W.ended) { running = !running; syncPlay(); } }
  function syncPlay() {
    var b = document.getElementById("playBtn");
    b.textContent = running ? "⏸ Pause" : "▶ Run";
    b.className = "btn " + (running ? "" : "primary");
  }
  function setSpeed(i) {
    speedIdx = clamp(i, 0, SPEEDS.length - 1);
    var seg = document.getElementById("speedSeg");
    var bs = seg.querySelectorAll("button");
    for (var k = 0; k < bs.length; k++) bs[k].className = (k === speedIdx ? "on" : "");
  }

  /* ---------------- rendering ---------------- */

  function go(id) {
    screen = id;
    var items = document.querySelectorAll(".navitem");
    for (var i = 0; i < items.length; i++) items[i].classList.toggle("on", items[i].dataset.screen === id);
    var screens = document.querySelectorAll(".screen");
    for (var j = 0; j < screens.length; j++) screens[j].classList.toggle("on", screens[j].id === "screen-" + id);
    requestRender(true);
    if (id === "command") {
      setTimeout(function () {
        var cv = document.getElementById("domeCanvas");
        if (cv) { Dome.attach(cv, function (bid) { if (bid) { UI.select("biome", bid); UI.inspector(); } }); Dome.draw(cv, W); }
      }, 0);
    }
  }

  /* A full redraw blows away focus, so only do it when asked or when the
     player is not currently holding a control. */
  function requestRender(force) {
    if (!W) return;
    var a = document.activeElement;
    var busy = a && (a.tagName === "INPUT" || a.tagName === "SELECT" || a.tagName === "TEXTAREA");
    UI.setWorld(W);
    UI.missionBar();
    if (force || !busy) {
      UI.render(screen);
      if (screen === "command") {
        setTimeout(function () {
          var cv = document.getElementById("domeCanvas");
          if (cv) { Dome.attach(cv, function (bid) { if (bid) { UI.select("biome", bid); UI.inspector(); } }); Dome.draw(cv, W); }
        }, 0);
      }
    }
    UI.inspector();
    UI.timeRail();
  }
  function softRender() { requestRender(false); }

  function modal(on) {
    document.getElementById("veil").classList.toggle("on", !!on);
    if (!on) document.getElementById("modalBody").onclick = null;
  }

  return { boot: boot, start: start };
})();

document.addEventListener("DOMContentLoaded", Game.boot);
