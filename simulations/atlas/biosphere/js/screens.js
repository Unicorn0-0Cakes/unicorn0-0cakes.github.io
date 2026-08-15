"use strict";
/* =====================================================================
   BIOSPHERE: CLOSED WORLD — screens.js
   Everything the player looks at. Each screen answers the same four
   questions in the same order: what is this, what is happening, why
   might it be happening, and what could you do about it.
   ===================================================================== */

var UI = (function () {

  var W = null;                       // current world, set by main.js
  var selected = { kind: "biome", id: "rainforest" };

  function setWorld(w) { W = w; }
  function select(kind, id) { selected = { kind: kind, id: id }; }
  function getSelection() { return selected; }

  /* ---------------- small formatters ---------------- */
  function n0(v) { return Math.round(v).toLocaleString(); }
  function n1(v) { return (Math.round(v * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1 }); }
  function n2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function pct(v) { return Math.round(v * 100) + "%"; }
  function signed(v, d) { return (v >= 0 ? "+" : "") + (d ? v.toFixed(d) : Math.round(v)); }
  function trendArrow(now, then) {
    var d = now - then;
    if (Math.abs(d) < 1e-9) return "→";
    return d > 0 ? "↑" : "↓";
  }
  function daysAgo(k) {
    var h = W.history;
    return h[Math.max(0, h.length - 1 - k)];
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function prov(kind) {
    var p = PROVENANCE[kind];
    return '<span class="prov ' + p.tone + '" title="' + p.note + '">' + p.label + '</span>';
  }

  /* ---------------- mission bar ---------------- */

  function missionBar() {
    var o2 = Sim.o2frac(W) * 100, ppm = Sim.co2ppm(W);
    var y = daysAgo(7) || W.history[0];
    var nut = Sim.nutritionForecast(W);
    var crew = Sim.liveCrew(W);
    var fit = crew.filter(function (p) { return p.health > 0.6 && p.illness < 0.4; }).length;
    var o2rate = W.history.length > 8 ? (o2 - y.o2) / 7 : 0;
    var closure = closureIntegrity();
    var unresolved = W.alerts.filter(function (a) { return !a.cleared; });

    var stats = [
      { k: "Oxygen", v: n2(o2) + "%", t: trendArrow(o2, y.o2) + " " + n2(Math.abs(o2rate)) + "/day",
        cls: o2 < 15 ? "bad" : (o2 < 17.5 ? "warn" : "") },
      { k: "Carbon dioxide", v: n0(ppm) + " ppm", t: trendArrow(ppm, y.co2),
        cls: ppm > 4500 ? "warn" : "" },
      { k: "Food horizon", v: Math.round(nut.kcalDays) + " d", t: trendArrow(nut.kcalDays, y.kcalDays),
        cls: nut.kcalDays < 14 ? "bad" : (nut.kcalDays < 30 ? "warn" : "") },
      { k: "Potable water", v: n0(W.water.potable) + " L", t: trendArrow(W.water.potable, y.potable),
        cls: W.water.potable < 4000 ? "warn" : "" },
      { k: "Power", v: Math.round(W.tech.power) + " kW", t: "of " + W.tech.powerCap,
        cls: W.tech.power > W.tech.powerCap ? "bad" : "" },
      { k: "Crew fit", v: fit + "/" + W.crew.length, t: "", cls: fit < W.crew.length ? "warn" : "good" },
      { k: "Closure", v: n1(closure) + "%", t: "", cls: closure < 99 ? "warn" : "good" }
    ];
    document.getElementById("mbStats").innerHTML = stats.map(function (s) {
      return '<div class="stat ' + s.cls + '"><span class="k">' + s.k + '</span>' +
             '<span class="v">' + s.v + '</span><span class="t">' + s.t + '</span></div>';
    }).join("");

    var doy = (W.startDoy + W.day) % 365;
    document.getElementById("mbClock").innerHTML =
      "DAY <b>" + W.day + "</b> / " + W.missionLength + " &middot; " +
      String(W.hour).padStart(2, "0") + ":00 &middot; " + monthName(doy);

    /* alert badges on the rail */
    var counts = { atmosphere: 0, water: 0, food: 0, ecology: 0, crew: 0, tech: 0, science: 0 };
    for (var i = 0; i < unresolved.length; i++) {
      var a = unresolved[i];
      if (counts[a.system] != null) counts[a.system] += (a.level >= 2 ? 1 : 0);
    }
    setBadge("navAtmosphere", counts.atmosphere);
    setBadge("navWater", counts.water);
    setBadge("navAgriculture", counts.food);
    setBadge("navEcology", counts.ecology);
    setBadge("navCrew", counts.crew);
    setBadge("navTech", counts.tech);
    var ready = W.hypotheses.filter(function (h) { return h.status !== "testing" && !h.seen; }).length;
    setBadge("navScience", ready, "q");
  }

  function setBadge(id, n, cls) {
    var el = document.getElementById(id);
    if (!el) return;
    var b = el.querySelector(".badge");
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("span"); b.className = "badge"; el.appendChild(b); }
    b.className = "badge" + (cls ? " " + cls : "");
    b.textContent = n;
  }

  function monthName(doy) {
    var m = ["January", "February", "March", "April", "May", "June", "July",
             "August", "September", "October", "November", "December"];
    var cum = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
    for (var i = 11; i >= 0; i--) if (doy >= cum[i]) return m[i] + " " + (doy - cum[i] + 1);
    return "January 1";
  }

  function closureIntegrity() {
    var pen = 0;
    if (W.ledger.o2Imported > 0) pen += 0.6 + W.ledger.o2Imported / 400000 * 1.4;
    if (W.ledger.foodImportedKcal > 0) pen += 0.3 + W.ledger.foodImportedKcal / 3e6 * 0.9;
    if (W.ledger.partsImported > 0) pen += W.ledger.partsImported * 0.15;
    if (W.ledger.expertCalls > 0) pen += W.ledger.expertCalls * 0.1;
    return Math.max(90, 100 - pen);
  }

  /* ---------------- command centre ---------------- */

  function commandScreen() {
    var o2 = Sim.o2frac(W) * 100, ppm = Sim.co2ppm(W);
    var b = Sim.o2Budget(W);
    var nut = Sim.nutritionForecast(W);
    var crew = Sim.liveCrew(W);
    var lab = W.lastLabour;
    var y = daysAgo(14) || W.history[0];

    var cards = [
      { id: "cc_atm", title: "Atmospheric balance",
        big: n2(o2), unit: "% oxygen",
        pill: o2 < 15 ? ["danger", "Emergency"] : o2 < 17.5 ? ["action", "Action"] : b.net < -400 ? ["watch", "Watch"] : ["ok", "Stable"],
        say: b.night < 0 && b.day > 0
             ? "Oxygen is produced faster than it is consumed by day and lost faster than it is replaced by night. " +
               "The night is currently winning by " + n0(Math.abs(b.net)) + " mol a day."
             : "Net atmospheric oxygen change is " + signed(b.net) + " mol a day.",
        series: W.history.map(function (h) { return h.o2; }), colour: Chart.css("--info") },

      { id: "cc_food", title: "Food horizon",
        big: Math.round(nut.kcalDays), unit: "days stored",
        pill: nut.kcalDays < 14 ? ["danger", "Critical"] : nut.kcalDays < 30 ? ["action", "Short"] : ["ok", "Adequate"],
        say: "Stored calories cover " + Math.round(nut.kcalDays) + " days at the current ration" +
             (nut.nextHarvest != null ? ", with the next harvest in " + nut.nextHarvest + " days." : ". No harvest is imminent.") +
             " Protein covers " + Math.round(nut.proteinDays) + " days.",
        series: W.history.map(function (h) { return h.kcalDays; }), colour: Chart.css("--c-agriculture") },

      { id: "cc_water", title: "Water cycle",
        big: n0(W.water.potable), unit: "L potable",
        pill: W.water.potable < 4000 ? ["action", "Low"] : ["ok", "Holding"],
        say: "Condensate storage is " + pct(W.water.condensate / W.water.condensateCap) + " full. " +
             n0(W.water.unaccounted) + " litres are unaccounted for since closure, which is not the same as leaked.",
        series: W.history.map(function (h) { return h.potable; }), colour: Chart.css("--c-ocean") },

      { id: "cc_crew", title: "Crew capacity",
        big: lab ? Math.round(lab.pool) : 0, unit: "h/day available",
        pill: !lab ? ["ok", "—"] : lab.totalDemand > lab.pool * 1.15 ? ["action", "Overcommitted"] :
              lab.totalDemand > lab.pool ? ["watch", "Tight"] : ["ok", "Sufficient"],
        say: lab ? "Demand is " + Math.round(lab.totalDemand) + " hours against " + Math.round(lab.pool) +
                   " available. Average morale " + pct(crew.length ? sum(crew, function (p) { return p.morale; }) / crew.length : 0) +
                   ", fatigue " + pct(crew.length ? sum(crew, function (p) { return p.fatigue; }) / crew.length : 0) + "."
                 : "No labour figures yet.",
        series: W.history.map(function (h) { return h.health * 100; }), colour: Chart.css("--accent") },

      { id: "cc_eco", title: "Ecological stability",
        big: pct(W.ecology.richness), unit: "species retained",
        pill: W.ecology.invasive > 0.5 ? ["action", "Reorganising"] : W.ecology.invasive > 0.25 ? ["watch", "Shifting"] : ["ok", "Stable"],
        say: "One introduced ant species is at " + pct(W.ecology.ants) + " of terrestrial samples. " +
             "Pollinators are at " + pct(W.ecology.pollinators) + " of baseline and the reef is at " +
             pct(W.ocean.reef) + ".",
        series: W.history.map(function (h) { return h.pollinators * 100; }), colour: Chart.css("--c-mangrove") }
    ];

    var html = '<div class="cols c3" id="ccCards">';
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      html += '<div class="card statuscard"><div class="top">' +
              '<h3 style="flex:1">' + c.title + '</h3>' +
              '<span class="pill ' + c.pill[0] + '">' + c.pill[1] + '</span></div>' +
              '<div class="top"><span class="big">' + c.big + '</span><span class="unit">' + c.unit + '</span></div>' +
              '<canvas id="' + c.id + '"></canvas>' +
              '<div class="say">' + c.say + '</div></div>';
    }
    html += '</div>';

    /* the cutaway */
    html += '<div class="card"><div class="canvaswrap"><canvas id="domeCanvas"></canvas>' +
            '<div class="overlaybar" id="domeOverlays"></div></div>' +
            '<div class="legend">' +
            BIOMES.map(function (b2) {
              return '<span><i style="background:' + b2.colour + '"></i>' + b2.name + '</span>';
            }).join("") +
            '<span class="muted">Click any section to inspect it</span></div></div>';

    /* what needs a decision */
    var open = W.alerts.filter(function (a) { return !a.cleared; })
                       .sort(function (a, b3) { return b3.level - a.level || b3.day - a.day; });
    html += '<div class="cols wide"><div class="card"><h3>Open alerts</h3>' +
            '<div class="sub">Four levels. Only the top one stops the clock.</div>' +
            (open.length ? open.slice(0, 8).map(alertHTML).join("")
                         : '<div class="emptyish">Nothing is outside its expected range today.</div>') +
            '</div>' +
            '<div class="card"><h3>Mission log</h3><div class="sub">The record, as it will be read afterwards.</div>' +
            '<div class="scrollbox">' + logHTML(14) + '</div></div></div>';

    document.getElementById("screen-command").innerHTML = html;

    for (var j = 0; j < cards.length; j++) {
      var cv = document.getElementById(cards[j].id);
      if (cv) Chart.spark(cv, cards[j].series.slice(-180), cards[j].colour);
    }
    buildOverlayBar();
  }

  function alertHTML(a) {
    return '<div class="alert l' + a.level + '"><div class="ah">' +
           '<span class="pill ' + ["", "watch", "action", "danger"][a.level] + '">' + ALERT_NAME[a.level] + '</span>' +
           '<h4>' + esc(a.title) + '</h4>' +
           '<span class="tiny muted">day ' + a.day + ' &middot; confidence ' + Math.round(a.confidence * 100) + '%</span>' +
           '</div><div class="why">' + esc(a.why) + '</div>' +
           (a.suggestion ? '<div class="sug">' + esc(a.suggestion) + '</div>' : '') + '</div>';
  }

  function logHTML(limit) {
    var l = W.log.slice(-limit).reverse();
    if (!l.length) return '<div class="emptyish">Nothing recorded yet.</div>';
    return l.map(function (e) {
      return '<div class="logline"><span class="d">d' + e.day + '</span><div><b>' + esc(e.title) + '</b>' +
             (e.body ? '<p>' + esc(e.body) + '</p>' : '') + '</div></div>';
    }).join("");
  }

  function buildOverlayBar() {
    var bar = document.getElementById("domeOverlays");
    if (!bar) return;
    var opts = [["none", "Plain"], ["air", "Airflow"], ["water", "Water"], ["heat", "Heat"],
                ["carbon", "Carbon"], ["labour", "Labour"], ["species", "Species"]];
    bar.innerHTML = opts.map(function (o) {
      return '<button data-ov="' + o[0] + '" class="' + (Dome.state.overlay === o[0] ? "on" : "") + '">' + o[1] + '</button>';
    }).join("");
    bar.onclick = function (ev) {
      var b = ev.target.closest("button"); if (!b) return;
      Dome.setOverlay(b.dataset.ov);
      buildOverlayBar();
    };
  }

  /* ---------------- atmosphere ---------------- */

  function atmosphereScreen() {
    var o2 = Sim.o2frac(W) * 100, ppm = Sim.co2ppm(W);
    var b = Sim.o2Budget(W);
    var sinks = Sim.carbonSinks(W);
    var rh = Sim.relHumidity(W);

    var html = '<div class="screenhead"><h2>Atmosphere laboratory</h2>' +
      '<p>A concentration is a level. A flux is a rate. Almost every atmospheric mistake in a closed system ' +
      'comes from reading one as though it were the other.</p></div>';

    /* Layer A: gauges */
    html += '<div class="card"><h3>Current atmosphere</h3><div class="sub">Measured values, with sensor confidence at ' +
            Math.round(W.sensors.confidence * 100) + ' per cent.</div>' +
            '<div class="cols c4">' +
            '<canvas id="gO2"></canvas><canvas id="gCO2"></canvas>' +
            '<canvas id="gRH"></canvas><canvas id="gT"></canvas></div>' +
            '<div class="assumption"><b>Model assumptions.</b> Air volume is treated as one well-mixed reservoir of ' +
            n0(ENC.AIR_MOL) + ' mol. Trace gases are aggregated rather than tracked individually. ' +
            prov("estimated") + '</div></div>';

    /* Layer B: the daily rhythm */
    html += '<div class="cols wide"><div class="card"><h3>The last four days, hour by hour</h3>' +
            '<div class="sub">Oxygen solid, carbon dioxide dashed. Shading marks the hours without light.</div>' +
            '<canvas id="diurnal"></canvas>' +
            '<div class="say tiny dim" style="margin-top:8px">' +
            (b.day > 0 && b.night < 0
              ? "Across yesterday the atmosphere gained " + n0(b.day) + " mol of oxygen in daylight and lost " +
                n0(Math.abs(b.night)) + " mol overnight. The difference is the mission."
              : "Daylight gain " + n0(b.day) + " mol, night loss " + n0(Math.abs(b.night)) + " mol.") +
            '</div></div>';

    /* Layer C: sources and sinks */
    html += '<div class="card"><h3>Where the oxygen went yesterday</h3>' +
            '<div class="sub">mol per day</div><div id="o2flows"></div>' +
            '<h3 style="margin-top:14px">Where the carbon went</h3>' +
            '<div class="sub">mol of CO<sub>2</sub> per day</div><div id="cFlows"></div></div></div>';

    /* long trend */
    html += '<div class="cols c2"><div class="card"><h3>Oxygen since closure</h3>' +
            '<div class="sub">per cent by volume &middot; green band is the comfortable working range</div>' +
            '<canvas id="o2Long"></canvas></div>' +
            '<div class="card"><h3>Carbon dioxide since closure</h3>' +
            '<div class="sub">ppm &middot; note whether it rises as fast as oxygen falls</div>' +
            '<canvas id="co2Long"></canvas></div></div>';

    /* Layer D: investigation and intervention */
    html += '<div class="cols c2"><div class="card"><h3>Standing carbon sinks</h3>' +
            '<div class="sub">where respired carbon has ended up since day zero</div>' +
            '<table class="data"><tbody>' +
            row("Absorbed by concrete", n0(sinks.concrete) + " mol",
                "Carbonation of exposed structural concrete. " + Math.round(sinks.concreteRemaining * 100) +
                " per cent of the estimated capacity remains.") +
            row("Dissolved in the ocean", n0(sinks.oceanDIC) + " mol",
                "pH is now " + W.ocean.ph.toFixed(2) + ", against 8.12 at closure.") +
            row("Removed by the scrubber", n0(sinks.scrubbed) + " mol", "Precipitated to stored carbonate.") +
            row("Lost from soil organic carbon", n0(sinks.soilLost) + " kg C",
                "Soil is the source, not a sink. This is the carbon that became gas.") +
            row("Standing plant biomass", n0(sinks.biomassGain) + " kg C", "Carbon currently held in living tissue.") +
            '</tbody></table>' +
            '<div class="assumption"><b>Model assumptions.</b> Concrete carbonation capacity is a single lumped ' +
            'number rather than a depth-resolved diffusion model. The historical mission did lose oxygen while ' +
            'carbon dioxide failed to accumulate proportionally ' + prov("historical") +
            '; the split between sinks used here is a simplification ' + prov("estimated") + '.</div></div>';

    html += '<div class="card"><h3>Interventions</h3><div class="sub">Each has a cost somewhere else.</div>' +
            ctlRange("ctlLights", "Supplemental light banks", W.controls.lights, 0, W.stores.lightBanks, 1,
                     W.controls.lights + " of " + W.stores.lightBanks + " · " + (W.controls.lights * 18) + " kW") +
            ctlRange("ctlScrub", "Carbon dioxide scrubber", W.controls.scrubber, 0, W.stores.scrubbers, 1,
                     W.controls.scrubber + " of " + W.stores.scrubbers + " · " + (W.controls.scrubber * 75) + " kW") +
            ctlRange("ctlMix", "Air mixing between biomes", W.controls.airMix, 0, 1, 0.05, pct(W.controls.airMix)) +
            ctlRange("ctlChill", "Climate control effort", W.controls.chillerSet, 0, 1.4, 0.05, pct(W.controls.chillerSet)) +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' +
            '<button class="btn" id="btnCalibrate">Calibrate sensors</button>' +
            '<button class="btn" id="btnSeal">Seal exposed concrete</button>' +
            '<button class="btn danger" id="btnO2">Inject oxygen (' + n0(W.stores.o2Reserve) + ' mol left)</button>' +
            '</div>' +
            '<div class="assumption">Injecting oxygen is not cheating. It is an intervention with a scientific, ' +
            'operational and reputational cost, and the end-of-mission report will say exactly what it bought.</div>' +
            '</div></div>';

    document.getElementById("screen-atmosphere").innerHTML = html;

    Chart.gauge(document.getElementById("gO2"), o2, 10, 22, 19.5, 21.0, "Oxygen", "% vol");
    Chart.gauge(document.getElementById("gCO2"), ppm, 0, 8000, 300, 3000, "Carbon dioxide", "ppm");
    Chart.gauge(document.getElementById("gRH"), rh * 100, 0, 100, 45, 80, "Humidity", "% RH");
    Chart.gauge(document.getElementById("gT"), W.atm.temp, 5, 40, 20, 28, "Mean temperature", "°C");
    Chart.diurnal(document.getElementById("diurnal"), W.hourly);

    Chart.flows(document.getElementById("o2flows"), [
      { label: "Photosynthesis", value: b.production, display: "+" + n0(b.production), colour: Chart.css("--ok"),
        note: "All biomes including the farm" },
      { label: "Soil respiration", value: b.soil, display: "−" + n0(b.soil), colour: Chart.css("--danger"),
        note: "Microbial breakdown of soil organic carbon" },
      { label: "Crew", value: b.crew, display: "−" + n0(b.crew), colour: Chart.css("--action") },
      { label: "Animals & oxidation", value: b.other, display: "−" + n0(b.other), colour: Chart.css("--watch") },
      { label: "Envelope leakage", value: b.leak, display: "−" + n0(b.leak), colour: Chart.css("--muted"),
        note: "Proportional to every gas, so it barely moves composition" },
      { label: "Net", value: Math.abs(b.net), display: signed(b.net), colour: Chart.css("--info") }
    ]);
    Chart.flows(document.getElementById("cFlows"), [
      { label: "Respiration", value: b.co2Prod, display: "+" + n0(b.co2Prod), colour: Chart.css("--danger") },
      { label: "Photosynthesis", value: b.co2Cons - b.co2Concrete - Math.max(0, b.co2Ocean),
        display: "−" + n0(b.co2Cons - b.co2Concrete - Math.max(0, b.co2Ocean)), colour: Chart.css("--ok") },
      { label: "Concrete", value: b.co2Concrete, display: "−" + n0(b.co2Concrete), colour: Chart.css("--c-tech"),
        note: "Carbonation. Silent, large and finite." },
      { label: "Ocean", value: Math.abs(b.co2Ocean), display: signed(-b.co2Ocean), colour: Chart.css("--c-ocean") }
    ]);

    var markers = W.log.filter(function (e) { return e.kind === "closure" || e.kind === "decision"; })
                       .map(function (e) { return { i: e.day }; });
    Chart.line(document.getElementById("o2Long"), [{ vals: W.history.map(function (h) { return h.o2; }),
      colour: Chart.css("--info") }], { height: 190, band: [19.5, 21], markers: markers,
      xFmt: function (i) { return "d" + i; } });
    Chart.line(document.getElementById("co2Long"), [{ vals: W.history.map(function (h) { return h.co2; }),
      colour: Chart.css("--accent-2") }], { height: 190, markers: markers,
      xFmt: function (i) { return "d" + i; } });
  }

  function row(k, v, note) {
    return '<tr><td>' + k + (note ? '<div class="tiny muted">' + note + '</div>' : '') +
           '</td><td class="n" style="text-align:right;white-space:nowrap">' + v + '</td></tr>';
  }
  function ctlRange(id, label, value, min, max, step, display) {
    return '<div class="ctl"><label>' + label + '<b>' + display + '</b></label>' +
           '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step +
           '" value="' + value + '"></div>';
  }

  /* ---------------- water ---------------- */

  function waterScreen() {
    var Wa = W.water;
    var soil = W.biomes.filter(function (b) { return b.id !== "ocean"; });
    var totalSoil = sum(soil, function (b) { return b.water; });
    var ocean = Sim.biome(W, "ocean");

    var html = '<div class="screenhead"><h2>Water cycle</h2>' +
      '<p>There is no drain. Water moves between the air, the soil, the sea, the tanks and the crew, and the ' +
      'only real question is which of those it is sitting in this week.</p></div>';

    html += '<div class="cols wide"><div class="card"><h3>Reservoirs</h3>' +
            '<div class="sub">litres &middot; sized against the largest store</div><div id="wFlows"></div></div>';

    html += '<div class="card"><h3>Balance</h3><table class="data"><tbody>' +
            row("Into potable treatment", n0(Wa.grey + Wa.waste) + " L held") +
            row("Potable storage", n0(Wa.potable) + " / " + n0(Wa.potableCap) + " L") +
            row("Condensate storage", n0(Wa.condensate) + " / " + n0(Wa.condensateCap) + " L") +
            row("Unaccounted since closure", n0(Wa.unaccounted) + " L",
                "Not necessarily leaked. Water sits in plants, soil, filters and measurement error.") +
            row("Measurement confidence", Math.round(W.sensors.confidence * 100) + "%") +
            '</tbody></table>' +
            '<div class="assumption"><b>Model assumptions.</b> Condensation is driven by relative humidity and by ' +
            'the chillers, and recovery is capped by the condensate machinery rather than by how wet the air is. ' +
            'Salinity is not modelled. ' + prov("designed") + '</div></div></div>';

    html += '<div class="cols c2"><div class="card"><h3>Soil moisture by biome</h3>' +
            '<div class="sub">against each biome\'s design target</div>' +
            '<table class="data"><thead><tr><th>Biome</th><th>Moisture</th><th>Target</th><th>Irrigation</th></tr></thead><tbody>' +
            soil.map(function (b) {
              var m = b.water / b.waterHold;
              var off = Math.abs(m - b.moistOpt) > 0.15;
              return '<tr><td><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' +
                     b.colour + ';margin-right:6px"></i>' + b.name + '</td>' +
                     '<td class="n" style="color:' + (off ? Chart.css("--action") : "inherit") + '">' + pct(m) + '</td>' +
                     '<td class="n muted">' + pct(b.moistOpt) + '</td>' +
                     '<td><input type="range" class="irr" data-b="' + b.id + '" min="0" max="2" step="0.1" value="' +
                     (W.controls.irrigation[b.id] || 0) + '"></td></tr>';
            }).join("") + '</tbody></table></div>';

    html += '<div class="card"><h3>Potable water since closure</h3><canvas id="wLong"></canvas>' +
            '<h3 style="margin-top:12px">Ocean</h3>' +
            '<table class="data"><tbody>' +
            row("Volume", n0(ocean.water) + " L") +
            row("pH", W.ocean.ph.toFixed(2), "8.12 at closure. The sea has been absorbing what the air is not holding.") +
            row("Dissolved inorganic carbon", n1(W.ocean.dic) + " mmol/L") +
            row("Reef condition", pct(W.ocean.reef)) +
            '</tbody></table></div></div>';

    document.getElementById("screen-water").innerHTML = html;

    Chart.flows(document.getElementById("wFlows"), [
      { label: "Ocean", value: ocean.water, display: n0(ocean.water), colour: Chart.css("--c-ocean") },
      { label: "Soil (all biomes)", value: totalSoil, display: n0(totalSoil), colour: Chart.css("--c-agriculture") },
      { label: "Potable tanks", value: Wa.potable, display: n0(Wa.potable), colour: Chart.css("--info") },
      { label: "Condensate", value: Wa.condensate, display: n0(Wa.condensate), colour: Chart.css("--accent") },
      { label: "Atmosphere (vapour)", value: W.atm.vapour, display: n0(W.atm.vapour), colour: Chart.css("--c-tech") },
      { label: "Greywater", value: Wa.grey, display: n0(Wa.grey), colour: Chart.css("--watch") },
      { label: "Wastewater", value: Wa.waste, display: n0(Wa.waste), colour: Chart.css("--action") }
    ]);
    Chart.line(document.getElementById("wLong"), [
      { vals: W.history.map(function (h) { return h.potable; }), colour: Chart.css("--info") },
      { vals: W.history.map(function (h) { return h.condensate; }), colour: Chart.css("--accent"), dash: [4, 3] }
    ], { height: 150, xFmt: function (i) { return "d" + i; } });
  }

  /* ---------------- agriculture ---------------- */

  function agricultureScreen() {
    var nut = Sim.nutritionForecast(W);
    var crew = Sim.liveCrew(W).length || 1;
    var farmB = Sim.biome(W, "agriculture");

    var html = '<div class="screenhead"><h2>Agriculture</h2>' +
      '<p>The farm is not a food factory bolted onto an ecosystem. It exchanges gas, water, labour, nutrients ' +
      'and risk with everything else in the building.</p></div>';

    html += '<div class="cols c3">' +
      statCard("Meal horizon", Math.round(nut.kcalDays) + " days",
        "At full ration. " + Math.round(nut.kcal / (crew * 2350 * 0.85)) + " days at reduced, " +
        Math.round(nut.kcal / (crew * 2350 * 0.7)) + " days at emergency ration.") +
      statCard("Protein", Math.round(nut.proteinDays) + " days",
        "Calories alone will not hold body mass. " + (nut.proteinDays < 30 ? "This is the binding constraint." : "Adequate for now.")) +
      statCard("Dietary variety", nut.kinds + " crops in store",
        nut.kinds < 4 ? "Monotony is measurably eroding morale." : "Enough range to keep meals different.") +
      '</div>';

    /* planting calendar */
    html += '<div class="card"><h3>Field map</h3><div class="sub">' +
            'Farm soil moisture ' + pct(farmB.water / farmB.waterHold) + ', nitrogen ' + pct(W.farm.nitrogen) +
            ', pest pressure ' + pct(W.farm.pest) + '. Click a plot to replant it.</div>' +
            '<table class="data"><thead><tr><th>Plot</th><th>Crop</th><th>Stage</th><th>Days left</th>' +
            '<th>Expected yield</th><th>Health</th><th>Pest</th><th></th></tr></thead><tbody>' +
            W.farm.plots.map(function (p) {
              var c = CROP_BY_ID[p.cropId] || CROP_BY_ID.fallow;
              var left = Math.max(0, c.days - p.age);
              var expected = c.yield * FARM_FACTOR * p.area * p.health * (1 - p.pest * 0.8);
              var stage = !p.planted ? "empty" : p.age >= c.days ? "ready" :
                          p.age < c.days * 0.3 ? "establishing" : p.age < c.days * 0.75 ? "growing" : "filling";
              return '<tr><td class="n">' + p.id + '</td><td>' + c.name + '</td>' +
                     '<td>' + stage + '</td><td class="n">' + (p.planted ? left : "—") + '</td>' +
                     '<td class="n">' + (c.kcal ? n0(expected) + " kg" : "—") + '</td>' +
                     '<td class="n">' + pct(p.health) + '</td>' +
                     '<td class="n">' + pct(p.pest) + '</td>' +
                     '<td><select class="plantsel" data-p="' + p.id + '">' +
                     CROPS.map(function (cc) {
                       return '<option value="' + cc.id + '"' + (cc.id === p.cropId ? " selected" : "") + '>' +
                              cc.name + '</option>';
                     }).join("") + '</select></td></tr>';
            }).join("") + '</tbody></table></div>';

    html += '<div class="cols c2"><div class="card"><h3>Ration</h3>' +
            '<div class="sub">A ration change is a crew decision, not a slider you move quietly.</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
            [["1", "Full", 1], ["0.85", "Reduced", 0.85], ["0.7", "Emergency", 0.7]].map(function (r) {
              return '<button class="btn ' + (Math.abs(W.controls.ration - r[2]) < 0.01 ? "primary" : "") +
                     '" data-ration="' + r[0] + '">' + r[1] + '</button>';
            }).join("") + '</div>' +
            '<div class="sub" style="margin-top:10px">Currently ' + Math.round(W.controls.ration * 2350) +
            ' kcal per person per day. The historical crew averaged closer to 1,780 ' + prov("historical") + '.</div>' +
            '<h3 style="margin-top:14px">Seed reserve</h3>' +
            '<table class="data"><tbody>' +
            CROPS.filter(function (c) { return c.kcal > 0; }).map(function (c) {
              var s = W.stores.seeds[c.id] || 0;
              return '<tr><td>' + c.name + '</td><td style="width:100px"><span class="meter"><i style="width:' +
                     Math.min(100, s * 100) + '%;background:' + (s < 0.15 ? Chart.css("--action") : Chart.css("--accent")) +
                     '"></i></span></td><td class="n" style="text-align:right">' + pct(s) + '</td></tr>';
            }).join("") + '</tbody></table></div>';

    html += '<div class="card"><h3>Food stores</h3>' +
            (W.stores.food.length
              ? '<table class="data"><thead><tr><th>Crop</th><th>Mass</th><th>Calories</th><th>Keeps</th></tr></thead><tbody>' +
                W.stores.food.map(function (f) {
                  var c = CROP_BY_ID[f.cropId];
                  return '<tr><td>' + (c ? c.name : f.cropId) + '</td><td class="n">' + n0(f.kg) + ' kg</td>' +
                         '<td class="n">' + n0(f.kg * (c ? c.kcal : 0)) + '</td>' +
                         '<td class="n muted">' + (c ? c.store : "—") + ' d</td></tr>';
                }).join("") + '</tbody></table>'
              : '<div class="emptyish">The store is empty.</div>') +
            '<div class="sub" style="margin-top:10px">Imported reserve remaining: ' +
            n0(W.stores.foodReserveKcal) + ' kcal' + (W.ledger.foodImportedKcal > 0
              ? '. <b>' + n0(W.ledger.foodImportedKcal) + ' kcal already used, which is recorded as a break in food closure.</b>'
              : '.') + '</div>' +
            '<h3 style="margin-top:14px">Stored calories since closure</h3><canvas id="fLong"></canvas></div></div>';

    document.getElementById("screen-agriculture").innerHTML = html;
    Chart.line(document.getElementById("fLong"), [{ vals: W.history.map(function (h) { return h.kcal; }),
      colour: Chart.css("--c-agriculture") }], { height: 140, xFmt: function (i) { return "d" + i; } });
  }

  function statCard(title, big, say) {
    return '<div class="card statuscard"><h3>' + title + '</h3>' +
           '<div class="top"><span class="big">' + big + '</span></div>' +
           '<div class="say">' + say + '</div></div>';
  }

  /* ---------------- ecology ---------------- */

  function ecologyScreen() {
    var e = W.ecology;
    var html = '<div class="screenhead"><h2>Ecology</h2>' +
      '<p>Species are managed as functional roles, not as individuals. A community with twenty species can be ' +
      'more fragile than one with twelve if every pollination event depends on the same insect.</p></div>';

    html += '<div class="cols wide"><div class="card"><h3>The relationship that is currently deciding things</h3>' +
      '<div class="sub">simplified food web, expanded around the dominant interaction</div>' +
      '<pre class="mono" style="line-height:1.6;font-size:12px;color:var(--ink-dim);margin:0">' +
      'Crop plants\n' +
      '   ↓ sap\n' +
      'Scale insects  ' + bar(e.ants) + '\n' +
      '   ↓ honeydew\n' +
      'Tramp ants     ' + bar(e.ants) + '   ' + pct(e.ants) + ' of samples\n' +
      '   ↓ displace\n' +
      'Other insects  ' + bar(1 - e.ants) + '\n' +
      '   ↓\n' +
      'Pollination    ' + bar(e.pollinators) + '   ' + pct(e.pollinators) + ' of baseline\n' +
      'Decomposition  ' + bar(e.decomposers / 1.35) + '   ' + pct(e.decomposers / 1.35) +
      '</pre>' +
      '<div class="assumption">Decomposer activity is a multiplier on soil respiration. When it rises, the ' +
      'oxygen budget worsens without anything visible changing above ground. ' + prov("designed") + '</div></div>';

    html += '<div class="card"><h3>Biodiversity</h3><table class="data"><tbody>' +
      row("Species richness", pct(e.richness), "Fraction of the founding species list still present") +
      row("Functional redundancy", pct(e.redundancy), "How many roles have a second occupant") +
      row("Invasive dominance", pct(e.invasive)) +
      row("Pollinators", pct(e.pollinators)) +
      row("Decomposers", pct(e.decomposers / 1.35)) +
      row("Herbivore pressure", pct(e.herbivores)) +
      row("Reef condition", pct(W.ocean.reef)) +
      '</tbody></table>' +
      '<div class="assumption">The historical mission saw its ant community come to be dominated by an ' +
      'introduced tramp species ' + prov("historical") + '. The population dynamics here are a simplification ' +
      prov("designed") + '.</div></div></div>';

    html += '<div class="cols c2"><div class="card"><h3>Populations since closure</h3><canvas id="ecoLong"></canvas>' +
      '<div class="legend"><span><i style="background:' + Chart.css("--danger") + '"></i>Invasive ants</span>' +
      '<span><i style="background:' + Chart.css("--ok") + '"></i>Pollinators</span>' +
      '<span><i style="background:' + Chart.css("--c-ocean") + '"></i>Reef</span></div></div>';

    html += '<div class="card"><h3>Biome condition</h3><table class="data">' +
      '<thead><tr><th>Biome</th><th>Biomass</th><th>Stress</th><th>Net carbon</th></tr></thead><tbody>' +
      W.biomes.filter(function (b) { return b.id !== "habitat"; }).map(function (b) {
        var net = b.npp - b.rh;
        return '<tr class="click" data-biome="' + b.id + '"><td><i style="display:inline-block;width:8px;height:8px;' +
               'border-radius:2px;background:' + b.colour + ';margin-right:6px"></i>' + b.name + '</td>' +
               '<td class="n">' + n0(b.biomass) + ' kg C</td>' +
               '<td class="n">' + pct(b.stress) + '</td>' +
               '<td class="n" style="color:' + (net >= 0 ? Chart.css("--ok") : Chart.css("--danger")) + '">' +
               signed(net, 1) + ' kg/d</td></tr>';
      }).join("") + '</tbody></table></div></div>';

    document.getElementById("screen-ecology").innerHTML = html;
    Chart.line(document.getElementById("ecoLong"), [
      { vals: W.history.map(function (h) { return h.ants * 100; }), colour: Chart.css("--danger") },
      { vals: W.history.map(function (h) { return h.pollinators * 100; }), colour: Chart.css("--ok") },
      { vals: W.history.map(function (h) { return h.reef * 100; }), colour: Chart.css("--c-ocean") }
    ], { height: 190, min: 0, max: 100, xFmt: function (i) { return "d" + i; } });
  }
  function bar(v) {
    var n = Math.round(clamp(v, 0, 1) * 12);
    return "▇".repeat(n) + "·".repeat(12 - n);
  }

  /* ---------------- crew ---------------- */

  function crewScreen() {
    var lab = W.lastLabour;
    var html = '<div class="screenhead"><h2>Crew</h2>' +
      '<p>Eight people are both inhabitants and components. There is no morale button; there are workloads, ' +
      'rations, schedules and who gets to decide.</p></div>';

    html += '<div class="cols wide"><div class="card"><h3>Duty matrix</h3>' +
      '<div class="sub">What each person is doing, and what is worrying them</div>' +
      '<table class="data"><thead><tr><th>Crew</th><th>Health</th><th>Fatigue</th><th>Morale</th>' +
      '<th>Duty</th><th>Main concern</th></tr></thead><tbody>' +
      W.crew.map(function (p) {
        var hcol = p.health > 0.75 ? "" : p.health > 0.5 ? Chart.css("--watch") : Chart.css("--danger");
        return '<tr class="click" data-crew="' + p.id + '"><td><b>' + p.name + '</b>' +
               '<div class="tiny muted">' + p.role + '</div></td>' +
               '<td class="n" style="color:' + hcol + '">' + pct(p.health) + (p.illness > 0.2 ? " ⚕" : "") + '</td>' +
               '<td class="n">' + pct(p.fatigue) + '</td>' +
               '<td class="n">' + pct(p.morale) + '</td>' +
               '<td><select class="dutysel" data-c="' + p.id + '">' +
               DUTIES.map(function (d) {
                 return '<option value="' + d.id + '"' + (d.id === p.duty ? " selected" : "") + '>' + d.name + '</option>';
               }).join("") + '</select></td>' +
               '<td class="tiny dim">' + concern(p) + '</td></tr>';
      }).join("") + '</tbody></table>' +
      '<div class="assumption">Private thoughts are not shown as truth. What you see is what the person has said, ' +
      'what has been observed, and what the medical measurements record.</div></div>';

    html += '<div class="card"><h3>Labour</h3>';
    if (lab) {
      html += '<div class="sub">' + Math.round(lab.pool) + ' productive hours available against ' +
              Math.round(lab.totalDemand) + ' hours of demand</div><div id="labFlows"></div>' +
              '<h3 style="margin-top:14px">Priorities</h3>' +
              '<div class="sub">You set what matters, not who stands where.</div>' +
              DUTIES.map(function (d) {
                return ctlRange("pri_" + d.id, d.name, W.controls.priorities[d.id], 0, 2.5, 0.1,
                                n1(W.controls.priorities[d.id]) + "×");
              }).join("");
    }
    html += '</div></div>';

    html += '<div class="cols c2"><div class="card"><h3>Health and morale since closure</h3>' +
      '<canvas id="crewLong"></canvas><div class="legend">' +
      '<span><i style="background:' + Chart.css("--ok") + '"></i>Mean health</span>' +
      '<span><i style="background:' + Chart.css("--accent") + '"></i>Mean morale</span>' +
      '<span><i style="background:' + Chart.css("--action") + '"></i>Mean fatigue</span></div></div>' +
      '<div class="card"><h3>Yesterday\'s meal</h3>' +
      (W.lastMeal ? '<table class="data"><tbody>' +
        row("Calories delivered", n0(W.lastMeal.kcal) + " / " + n0(W.lastMeal.need)) +
        row("Protein", n0(W.lastMeal.protein) + " g across the crew") +
        row("Distinct crops eaten", String(W.lastMeal.variety)) +
        row("Carbon consumed", n1(W.lastMeal.carbon || 0) + " kg C",
            "Which is also the carbon the crew breathed back into the air.") +
        '</tbody></table>' : '<div class="emptyish">No meal recorded yet.</div>') + '</div></div>';

    document.getElementById("screen-crew").innerHTML = html;

    if (lab) {
      Chart.flows(document.getElementById("labFlows"), DUTIES.map(function (d) {
        var dem = lab.demand[d.id] || 0, done = lab.done[d.id] || 0;
        return { label: d.name, value: dem, display: Math.round(done) + " / " + Math.round(dem) + " h",
                 colour: done >= dem * 0.98 ? Chart.css("--ok") : Chart.css("--action"), note: d.note };
      }));
    }
    Chart.line(document.getElementById("crewLong"), [
      { vals: W.history.map(function (h) { return h.health * 100; }), colour: Chart.css("--ok") },
      { vals: W.history.map(function (h) { return h.morale * 100; }), colour: Chart.css("--accent") },
      { vals: W.history.map(function (h) { return h.fatigue * 100; }), colour: Chart.css("--action") }
    ], { height: 180, min: 0, max: 100, xFmt: function (i) { return "d" + i; } });
  }

  function concern(p) {
    if (p.illness > 0.2) return "unwell, off duty";
    if (p.fatigue > 0.7) return "exhausted; has asked for the schedule to change";
    if (p.morale < 0.3) return "has stopped attending the evening meeting";
    if (Sim.o2frac(W) * 100 < 16.5) return "short of breath on the stairs";
    return p.needs;
  }

  /* ---------------- technosphere ---------------- */

  function techScreen() {
    var html = '<div class="screenhead"><h2>Technosphere</h2>' +
      '<p>Technology does not sit outside the ecosystem. Humidity corrodes it, roots invade it, salt eats it, ' +
      'and a hungry crew repairs it more slowly.</p></div>';

    html += '<div class="card"><h3>Machinery</h3><div class="sub">' +
      W.tech.spares + ' spare sets remaining &middot; ' + Math.round(W.tech.power) + ' kW of ' + W.tech.powerCap +
      ' drawn</div>' +
      '<table class="data"><thead><tr><th>Machine</th><th>Condition</th><th>State</th><th>Power</th>' +
      '<th>If it stops</th></tr></thead><tbody>' +
      W.tech.machines.map(function (m) {
        var col = m.broken ? Chart.css("--danger") : m.condition < 0.45 ? Chart.css("--watch") : Chart.css("--ok");
        return '<tr><td><b>' + m.name + '</b></td>' +
               '<td style="width:120px"><span class="meter"><i style="width:' + (m.condition * 100) +
               '%;background:' + col + '"></i></span><span class="tiny muted">' + pct(m.condition) + '</span></td>' +
               '<td style="color:' + col + '">' + (m.broken ? "failed" : m.running ? "running" : "idle") + '</td>' +
               '<td class="n">' + (m.variablePower ? "variable" : m.power + " kW") + '</td>' +
               '<td class="tiny dim">' + m.affects + '</td></tr>';
      }).join("") + '</tbody></table></div>';

    html += '<div class="cols c2"><div class="card"><h3>Dependencies</h3>' +
      '<pre class="mono" style="font-size:12px;line-height:1.65;color:var(--ink-dim);margin:0">' +
      'Main power\n' +
      '   ├─ Air handling ────── gas mixing, hot spots\n' +
      '   ├─ Chillers ────────── temperature, and so soil respiration\n' +
      '   ├─ Condensate ──────── irrigation water\n' +
      '   ├─ Water treatment ─── potable supply\n' +
      '   ├─ Waste marsh ─────── farm nutrients\n' +
      '   ├─ Ocean pumps ─────── reef, ocean gas exchange\n' +
      '   ├─ Grow lights ─────── photosynthesis on demand\n' +
      '   └─ Sensors ─────────── whether you can trust any of the above' +
      '</pre>' +
      '<div class="assumption">The chillers are the quiet lever on the oxygen budget. Soil respiration roughly ' +
      'doubles for every ten degrees of warming, so a cooling failure is an atmospheric event as well as a ' +
      'comfort one. ' + prov("estimated") + '</div></div>';

    html += '<div class="card"><h3>Maintenance policy</h3>' +
      ctlRange("ctlPrev", "Preventive maintenance effort", W.controls.preventive, 0, 1, 0.05, pct(W.controls.preventive)) +
      '<div class="sub">Preventive work consumes crew hours even when nothing appears to be wrong. ' +
      'It is the first thing sacrificed and the most expensive thing to have sacrificed.</div>' +
      '<h3 style="margin-top:14px">Power draw since closure</h3><canvas id="pLong"></canvas></div></div>';

    document.getElementById("screen-tech").innerHTML = html;
    Chart.line(document.getElementById("pLong"), [{ vals: W.history.map(function (h) { return h.power; }),
      colour: Chart.css("--c-tech") }], { height: 150, xFmt: function (i) { return "d" + i; } });
  }

  /* ---------------- science ---------------- */

  function scienceScreen() {
    var html = '<div class="screenhead"><h2>Science workbench</h2>' +
      '<p>The mission is scored on explanation, not only on survival. A hypothesis that turns out to be wrong ' +
      'and is honestly recorded is worth more than a lucky year nobody can account for.</p></div>';

    var active = W.hypotheses.filter(function (h) { return h.status === "testing"; });
    var done = W.hypotheses.filter(function (h) { return h.status !== "testing"; });

    html += '<div class="cols wide"><div class="card"><h3>Open a new line of enquiry</h3>' +
      '<div class="sub">Each of these is a real claim about this world. Some of them are wrong.</div>' +
      Events.TEMPLATES.map(function (t) {
        var running = W.hypotheses.some(function (h) { return h.templateId === t.id; });
        return '<div class="hyp"><b>' + esc(t.statement) + '</b>' +
               '<div class="tiny muted" style="margin:4px 0"><b>Observation.</b> ' + esc(t.observation) + '</div>' +
               '<div class="tiny dim"><b>Test.</b> ' + esc(t.test) + '</div>' +
               '<div class="tiny dim"><b>Expected.</b> ' + esc(t.expect) + '</div>' +
               '<div class="tiny muted"><b>Risk.</b> ' + esc(t.risk) + '</div>' +
               '<button class="btn sm" style="margin-top:7px" data-hyp="' + t.id + '"' +
               (running ? " disabled" : "") + '>' + (running ? "Already recorded" : "Begin test · " + t.days + " days") +
               '</button></div>';
      }).join("") + '</div>';

    html += '<div class="card"><h3>Notebook</h3>';
    if (active.length) {
      html += '<div class="sub">In progress</div>' + active.map(function (h) {
        return '<div class="hyp"><span class="pill info st">day ' + (h.dueDay - W.day) + ' to go</span>' +
               '<b>' + esc(h.statement) + '</b><div class="tiny dim">' + esc(h.test) + '</div></div>';
      }).join("");
    }
    if (done.length) {
      html += '<div class="sub" style="margin-top:10px">Concluded</div>' + done.map(function (h) {
        h.seen = true;
        var cls = h.status === "supported" ? "ok" : (h.status === "inconclusive" ? "watch" : "action");
        return '<div class="hyp"><span class="pill ' + cls + ' st">' + h.status + '</span>' +
               '<b>' + esc(h.statement) + '</b>' +
               '<div class="tiny dim" style="margin-top:4px">' + esc(h.result || "") + '</div></div>';
      }).join("");
    }
    if (!active.length && !done.length) html += '<div class="emptyish">Nothing recorded yet.</div>';
    html += '</div></div>';

    /* comparison tool */
    html += '<div class="card"><h3>Compare two dates</h3>' +
      '<div class="sub">The system reports what changed. It does not claim to know why.</div>' +
      '<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:120px"><label class="tiny muted">From day</label>' +
      '<input type="number" id="cmpA" min="0" max="' + W.day + '" value="' + Math.max(0, W.day - 60) + '"></div>' +
      '<div style="flex:1;min-width:120px"><label class="tiny muted">To day</label>' +
      '<input type="number" id="cmpB" min="0" max="' + W.day + '" value="' + W.day + '"></div>' +
      '<button class="btn" id="btnCompare">Compare</button></div>' +
      '<div id="cmpOut" style="margin-top:10px"></div></div>';

    document.getElementById("screen-science").innerHTML = html;
  }

  function compare(a, b) {
    var h = W.history;
    var A = h[Math.min(h.length - 1, Math.max(0, a))], B = h[Math.min(h.length - 1, Math.max(0, b))];
    if (!A || !B) return '<div class="emptyish">Not enough record.</div>';
    var rows = [
      ["Oxygen", n2(A.o2) + "%", n2(B.o2) + "%", signed(B.o2 - A.o2, 2) + " points"],
      ["Carbon dioxide", n0(A.co2), n0(B.co2), signed(B.co2 - A.co2) + " ppm"],
      ["Soil organic carbon", n0(A.soilC) + " kg", n0(B.soilC) + " kg", signed(B.soilC - A.soilC) + " kg"],
      ["Standing biomass", n0(A.biomass) + " kg", n0(B.biomass) + " kg", signed(B.biomass - A.biomass) + " kg"],
      ["Carbon in concrete", n0(A.concrete), n0(B.concrete), signed(B.concrete - A.concrete) + " mol"],
      ["Mean temperature", n1(A.temp) + "°", n1(B.temp) + "°", signed(B.temp - A.temp, 1) + "°"],
      ["Daily photosynthesis", n1(A.npp) + " kg C", n1(B.npp) + " kg C", signed(B.npp - A.npp, 1)],
      ["Daily soil respiration", n1(A.rh_soil) + " kg C", n1(B.rh_soil) + " kg C", signed(B.rh_soil - A.rh_soil, 1)],
      ["Stored calories", n0(A.kcal), n0(B.kcal), signed(B.kcal - A.kcal)],
      ["Invasive ants", pct(A.ants), pct(B.ants), signed((B.ants - A.ants) * 100) + " points"]
    ];
    return '<table class="data"><thead><tr><th>Variable</th><th>Day ' + A.day + '</th><th>Day ' + B.day +
           '</th><th>Change</th></tr></thead><tbody>' +
           rows.map(function (r) {
             return '<tr><td>' + r[0] + '</td><td class="n">' + r[1] + '</td><td class="n">' + r[2] +
                    '</td><td class="n">' + r[3] + '</td></tr>';
           }).join("") +
           '</tbody></table><div class="assumption"><b>Confidence that these changes are causally linked: ' +
           'unresolved.</b> Several of them share a driver, and the model will not pretend to separate them for you.</div>';
  }

  /* ---------------- timeline & archive ---------------- */

  function timelineScreen() {
    var html = '<div class="screenhead"><h2>Mission timeline</h2>' +
      '<p>Every threshold, harvest, failure, dispute, intervention and experiment, in the order it happened.</p></div>' +
      '<div class="card">' + logHTML(400) + '</div>';
    document.getElementById("screen-timeline").innerHTML = html;
  }

  function archiveScreen() {
    var html = '<div class="screenhead"><h2>Model assumptions</h2>' +
      '<p>This simulation becomes more useful by showing its seams. Three categories are kept strictly apart.</p></div>';

    html += '<div class="cols c3">' +
      '<div class="card"><h3>' + prov("historical") + ' Historical fact</h3>' +
      '<ul style="margin:8px 0 0 16px;padding:0;font-size:12.5px;color:var(--ink-dim);line-height:1.6">' +
      '<li>The first closure began on 26 September 1991 with eight participants and ran two years.</li>' +
      '<li>Oxygen fell from a normal atmospheric level to roughly 14 per cent over about sixteen months.</li>' +
      '<li>Carbon dioxide did not accumulate in proportion to the oxygen lost.</li>' +
      '<li>Published work attributes the decline largely to microbial respiration in carbon-rich soils, ' +
      'with concrete carbonation absorbing much of the resulting carbon dioxide.</li>' +
      '<li>The facility contained rainforest, ocean, mangrove, savanna, desert, agricultural, residential ' +
      'and technical systems within about 3.14 acres.</li>' +
      '<li>The agricultural system supplied roughly four-fifths of the crew\'s food during the first mission.</li>' +
      '<li>An introduced tramp ant species came to dominate the terrestrial invertebrate community.</li>' +
      '<li>The coastal fog desert received more water than intended and shifted toward denser scrub and grasses.</li>' +
      '<li>Oxygen was eventually added from outside, and the mission included medical monitoring throughout.</li>' +
      '</ul></div>' +

      '<div class="card"><h3>' + prov("estimated") + ' Model interpretation</h3>' +
      '<ul style="margin:8px 0 0 16px;padding:0;font-size:12.5px;color:var(--ink-dim);line-height:1.6">' +
      '<li>Soil organic carbon is initialised at about ' + n0(sum(W.biomes, function (b) { return b.soilC0; })) +
      ' kg C across all biomes, derived from published soil depths and organic fractions.</li>' +
      '<li>Soil respiration follows a temperature response that doubles per ten degrees, modified by moisture.</li>' +
      '<li>Concrete carbonation is a single lumped capacity of ' + n0(W.concrete.capacity) +
      ' mol rather than a depth-resolved model.</li>' +
      '<li>Photosynthesis is net primary production driven by light, carbon dioxide, temperature, moisture ' +
      'and canopy development.</li>' +
      '<li>Envelope leakage is ' + (ENC.LEAK_PER_DAY * 100).toFixed(3) + ' per cent of the atmosphere per day, ' +
      'applied to every gas in proportion.</li>' +
      '<li>Currently, soil respiration accounts for about ' +
      Math.round(Sim.o2Budget(W).soil / Math.max(1, Sim.o2Budget(W).soil + Sim.o2Budget(W).crew +
        Sim.o2Budget(W).other) * 100) + ' per cent of oxygen consumption in this run.</li>' +
      '</ul></div>' +

      '<div class="card"><h3>' + prov("designed") + ' Invented for play</h3>' +
      '<ul style="margin:8px 0 0 16px;padding:0;font-size:12.5px;color:var(--ink-dim);line-height:1.6">' +
      '<li>All crew members are fictional. They are not portrayals of the historical participants.</li>' +
      '<li>Crew morale, conflict style and trust are game constructs with no published counterpart.</li>' +
      '<li>Machine failure is a probability driven by condition, humidity and temperature.</li>' +
      '<li>Ecology is aggregated into functional roles and population bands, not individual organisms.</li>' +
      '<li>The specific numbers a counterfactual produces are properties of this model, never evidence ' +
      'about the real facility.</li>' +
      '</ul>' +
      '<div class="assumption">Anything you discover by changing a starting condition is a statement about ' +
      'this simulation. It is not a historical finding, and the end-of-mission report will say so.</div></div></div>';

    html += '<div class="card"><h3>Not represented</h3><div class="sub">Worth knowing before you trust a result</div>' +
      '<p style="font-size:12.5px;color:var(--ink-dim);margin:0">Trace gas chemistry beyond a single aggregate; ' +
      'nitrogen cycling below a single farm-wide index; salinity; individual insect populations; disease ' +
      'transmission between crew; genetic change in any population; soil structure and compaction; ' +
      'the pressure lungs as a mechanical system rather than an assumption; and the psychological effect ' +
      'of being watched from outside, which the historical participants described as considerable.</p></div>';

    document.getElementById("screen-archive").innerHTML = html;
  }

  /* ---------------- inspector ---------------- */

  function inspector() {
    var el = document.getElementById("inspector");
    var html = "";
    if (selected.kind === "biome") {
      var b = Sim.biome(W, selected.id);
      var m = b.id === "ocean" ? 1 : b.water / b.waterHold;
      var net = b.npp - b.rh;
      html = '<div class="insp-h"><span class="swatch" style="background:' + b.colour + '"></span>' +
        '<h3 style="flex:1">' + b.name + '</h3></div>' +
        '<div class="tiny muted" style="margin-bottom:10px">' + b.blurb + '</div>' +
        '<div class="upper dim" style="margin:10px 0 4px">Current state</div>' +
        kv("Area", n0(b.area) + " m²") +
        kv("Temperature", n1(b.temp) + " °C") +
        kv("Setpoint", b.tempSet + " °C") +
        kv("Soil moisture", pct(m)) +
        kv("Design target", pct(b.moistOpt)) +
        kv("Standing biomass", n0(b.biomass) + " kg C") +
        kv("Soil organic carbon", n0(b.soilC) + " kg C") +
        kv("Litter", n0(b.litter) + " kg C") +
        kv("Plant stress", pct(b.stress)) +
        '<div class="upper dim" style="margin:12px 0 4px">Carbon flows, kg C per day</div>' +
        kv("Photosynthesis", "+" + n1(b.npp)) +
        kv("Soil respiration", "−" + n1(b.rh)) +
        kv("Net", signed(net, 1)) +
        '<div class="upper dim" style="margin:12px 0 4px">Connected to</div>' +
        '<div class="tiny dim">' + connections(b.id) + '</div>' +
        '<div class="ctl" style="margin-top:12px"><label>Irrigation<b>' +
        n1(W.controls.irrigation[b.id] || 0) + '×</b></label>' +
        '<input type="range" class="irr" data-b="' + b.id + '" min="0" max="2" step="0.1" value="' +
        (W.controls.irrigation[b.id] || 0) + '"></div>' +
        '<div class="assumption tiny">Measurement confidence ' + Math.round(W.sensors.confidence * 100) +
        ' per cent. Values shown are what the sensors report, not ground truth.</div>';
    } else if (selected.kind === "crew") {
      var p = null;
      for (var i = 0; i < W.crew.length; i++) if (W.crew[i].id === selected.id) p = W.crew[i];
      if (p) {
        html = '<div class="insp-h"><h3 style="flex:1">' + p.name + '</h3></div>' +
          '<div class="tiny muted" style="margin-bottom:10px">' + p.role + '</div>' +
          kv("Health", pct(p.health)) + kv("Fatigue", pct(p.fatigue)) + kv("Morale", pct(p.morale)) +
          kv("Body mass", pct(p.weight) + " of pre-closure") +
          kv("Sleep debt", Math.round(p.sleepDebt) + " h") +
          kv("Illness", p.illness > 0 ? pct(p.illness) : "none") +
          kv("Trust in decisions", pct(p.trust)) +
          '<div class="upper dim" style="margin:12px 0 4px">Skills</div>' +
          Object.keys(p.skills).map(function (s) { return kv(skillName(s), pct(p.skills[s])); }).join("") +
          '<div class="upper dim" style="margin:12px 0 4px">Stated position</div>' +
          '<div class="tiny dim">' + esc(p.needs) + '</div>' +
          '<div class="assumption tiny">Conflict style: ' + p.conflict + '. This is how they argue, not whether ' +
          'they are right.</div>';
      }
    }
    el.innerHTML = html || '<div class="emptyish">Select a biome on the cutaway, or a crew member.</div>';
  }
  function kv(k, v) { return '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>'; }
  function skillName(s) {
    return { mech: "Mechanical", farm: "Agriculture", med: "Medical", sci: "Science", eco: "Ecology" }[s] || s;
  }
  function connections(id) {
    var map = {
      rainforest: "Atmosphere (largest single carbon store) · condensation · air handling · ecology labour",
      savanna: "Atmosphere · water distribution · seasonal light",
      desert: "Condensation and rainfall distribution · air mixing · ecology labour",
      mangrove: "Ocean · waste treatment · drainage from every other soil",
      ocean: "Atmosphere (carbon dissolution) · ocean pumps · reef · pH",
      agriculture: "Food stores · crew labour · soil respiration · nutrients from waste treatment",
      habitat: "Crew · power · water use · laboratory"
    };
    return map[id] || "";
  }

  /* ---------------- bottom time rail ---------------- */

  function timeRail() {
    var cv = document.getElementById("railCanvas");
    if (!cv) return;
    var c = Chart.prep(cv, 80), g = c.g;
    var h = W.hourly;
    if (!h.length) return;
    var padL = 8, padR = 8, W2 = c.w - padL - padR, H = 46, top = 16;

    /* 24-hour strip of the last four days */
    var o2 = h.map(function (x) { return x.o2; });
    var e = [Math.min.apply(null, o2), Math.max.apply(null, o2)];
    if (e[1] - e[0] < 1e-4) e[1] = e[0] + 1e-4;
    for (var i = 0; i < h.length; i++) {
      var x = padL + i / (h.length - 1) * W2;
      if (h[i].light <= 0.005) {
        g.fillStyle = Chart.css("--bg-tint");
        g.fillRect(x - W2 / h.length / 2, top, W2 / h.length + 1, H);
      }
    }
    g.beginPath();
    for (var j = 0; j < h.length; j++) {
      var px = padL + j / (h.length - 1) * W2;
      var py = top + H - (o2[j] - e[0]) / (e[1] - e[0]) * H;
      j ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.strokeStyle = Chart.css("--info"); g.lineWidth = 1.7; g.stroke();

    g.fillStyle = Chart.css("--muted"); g.font = "9px " + Chart.css("--font");
    g.fillText("OXYGEN, LAST " + h.length + " HOURS", padL, 11);
    g.fillText("day " + h[0].d + " " + String(h[0].h).padStart(2, "0") + ":00", padL, 74);
    g.textAlign = "right";
    g.fillText("now", c.w - padR, 74);
    g.textAlign = "left";

    /* what is coming */
    var up = [];
    var nut = Sim.nutritionForecast(W);
    if (nut.nextHarvest != null) up.push([("d+" + nut.nextHarvest), "Next harvest ready"]);
    for (var m = 0; m < W.tech.machines.length; m++) {
      var mm = W.tech.machines[m];
      if (mm.broken) up.push(["now", mm.name + " awaiting repair"]);
      else if (mm.condition < 0.4) up.push(["soon", mm.name + " condition " + pct(mm.condition)]);
    }
    for (var y = 0; y < W.hypotheses.length; y++) {
      var hy = W.hypotheses[y];
      if (hy.status === "testing") up.push(["d+" + (hy.dueDay - W.day), "Experiment concludes"]);
    }
    var doy = (W.startDoy + W.day) % 365;
    up.push(["today", "Day length " + n1(Sim.dayLength(doy)) + " h, light " + pct(Sim.seasonal(doy))]);
    if (W.controls.ration < 1) up.push(["ongoing", "Ration at " + pct(W.controls.ration)]);

    document.getElementById("railNext").innerHTML =
      '<div class="upper muted" style="margin-bottom:3px">Coming up</div>' +
      up.slice(0, 7).map(function (r) {
        return '<div class="row"><span class="when">' + r[0] + '</span><span>' + r[1] + '</span></div>';
      }).join("");
  }

  /* ---------------- dispatch ---------------- */

  var RENDER = {
    command: commandScreen, atmosphere: atmosphereScreen, water: waterScreen,
    agriculture: agricultureScreen, ecology: ecologyScreen, crew: crewScreen,
    tech: techScreen, science: scienceScreen, timeline: timelineScreen, archive: archiveScreen
  };

  function render(id) { if (RENDER[id]) RENDER[id](); }

  return { setWorld: setWorld, render: render, missionBar: missionBar, inspector: inspector,
           timeRail: timeRail, select: select, getSelection: getSelection, compare: compare,
           alertHTML: alertHTML, esc: esc, pct: pct, n0: n0, n1: n1, n2: n2, prov: prov };
})();
