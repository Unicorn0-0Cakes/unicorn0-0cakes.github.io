"use strict";
/* =====================================================================
   BIOSPHERE: CLOSED WORLD — dome.js
   The cutaway. A schematic section through the whole enclosure, drawn so
   that the state of the world is legible at a glance: canopy height,
   soil moisture, condensation on the glass, rain falling where it is not
   wanted, machinery running in the basement.

   Overlays turn the same drawing into a different diagram — airflow,
   water, heat, carbon, labour, species pressure — rather than sending
   the player to a separate screen for each.
   ===================================================================== */

var Dome = (function () {

  var VW = 1000, VH = 430, GROUND = 336, BASE = 404;

  /* Left to right, in the order the enclosure is usually walked. */
  var SECTIONS = [
    { id: "rainforest",  x0: 34,  x1: 214, roof: 92,  apex: 46,  label: "Rainforest" },
    { id: "ocean",       x0: 214, x1: 328, roof: 150, apex: 128, label: "Ocean" },
    { id: "mangrove",    x0: 328, x1: 398, roof: 168, apex: 158, label: "Marsh" },
    { id: "savanna",     x0: 398, x1: 528, roof: 156, apex: 132, label: "Savanna" },
    { id: "desert",      x0: 528, x1: 668, roof: 170, apex: 146, label: "Desert" },
    { id: "agriculture", x0: 668, x1: 862, roof: 138, apex: 112, label: "Agriculture" },
    { id: "habitat",     x0: 862, x1: 966, roof: 118, apex: 100, label: "Habitat" }
  ];

  var state = {
    overlay: "none", hover: null, selected: null, t: 0,
    particles: [], rain: []
  };

  function css(n) { return Chart.css(n); }
  function colourOf(id) {
    var m = { rainforest: "--c-rainforest", savanna: "--c-savanna", desert: "--c-desert",
              mangrove: "--c-mangrove", ocean: "--c-ocean", agriculture: "--c-agriculture",
              habitat: "--c-habitat" };
    return css(m[id] || "--c-tech");
  }

  function sectionAt(vx, vy) {
    for (var i = 0; i < SECTIONS.length; i++) {
      var s = SECTIONS[i];
      if (vx >= s.x0 && vx <= s.x1 && vy >= s.apex - 10 && vy <= BASE) return s;
    }
    return null;
  }

  /* ---------------- drawing ---------------- */

  function draw(cv, w) {
    var dpr = window.devicePixelRatio || 1;
    var cw = cv.clientWidth || 900;
    var ch = Math.round(cw * VH / VW);
    cv.style.height = ch + "px";
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    var g = cv.getContext("2d");
    g.setTransform(dpr * cw / VW, 0, 0, dpr * cw / VW, 0, 0);
    g.clearRect(0, 0, VW, VH);

    var doy = (w.startDoy + w.day) % 365;
    var light = Sim.lightAt(doy, w.hour, 0.2);
    var night = light <= 0.01;
    var rh = Sim.relHumidity(w);

    sky(g, w, light, night);
    ground(g);
    for (var i = 0; i < SECTIONS.length; i++) drawSection(g, w, SECTIONS[i], light, night);
    basement(g, w);
    glassAndWeather(g, w, rh, light);
    if (state.overlay !== "none") overlay(g, w);
    labels(g, w);
    return { width: cw, height: ch };
  }

  function sky(g, w, light, night) {
    var grd = g.createLinearGradient(0, 0, 0, GROUND);
    if (night) { grd.addColorStop(0, css("--bg-tint")); grd.addColorStop(1, css("--bg")); }
    else {
      grd.addColorStop(0, mix(css("--info"), css("--bg"), 0.12 + light * 0.10));
      grd.addColorStop(1, css("--bg"));
    }
    g.fillStyle = grd; g.fillRect(0, 0, VW, GROUND + 4);

    /* sun or moon, tracking the hour */
    var dl = Sim.dayLength((w.startDoy + w.day) % 365), rise = 12 - dl / 2;
    var frac = (w.hour - rise) / dl;
    if (frac >= 0 && frac <= 1) {
      var sx = 60 + frac * (VW - 120), sy = 86 - Math.sin(frac * Math.PI) * 58;
      g.fillStyle = mix(css("--accent-2"), "#ffffff", 0.35);
      g.globalAlpha = 0.85; g.beginPath(); g.arc(sx, sy, 13, 0, 7); g.fill();
      g.globalAlpha = 0.16; g.beginPath(); g.arc(sx, sy, 26, 0, 7); g.fill(); g.globalAlpha = 1;
    } else {
      var nf = ((w.hour - rise - dl + 24) % 24) / (24 - dl);
      var mx = 60 + nf * (VW - 120), my = 76 - Math.sin(nf * Math.PI) * 40;
      g.fillStyle = css("--muted"); g.globalAlpha = 0.55;
      g.beginPath(); g.arc(mx, my, 9, 0, 7); g.fill(); g.globalAlpha = 1;
    }
  }

  function ground(g) {
    g.fillStyle = mix(css("--bg-tint"), css("--ink"), 0.06);
    g.fillRect(0, GROUND, VW, VH - GROUND);
  }

  function drawSection(g, w, s, light, night) {
    var b = Sim.biome(w, s.id);
    var col = colourOf(s.id);
    var moist = s.id === "ocean" ? 1 : clamp(b.water / b.waterHold, 0, 1.3);

    /* soil block, darker when wet */
    var soilTop = GROUND;
    g.fillStyle = mix(css("--c-desert"), css("--ink"), 0.25 + moist * 0.28);
    g.fillRect(s.x0, soilTop, s.x1 - s.x0, 26);

    /* the living community, drawn at its actual relative biomass */
    var fill = clamp(b.biomass / b.biomassMature, 0, 1.25);
    var span = s.x1 - s.x0;
    if (s.id === "ocean") {
      var water = clamp(b.water / b.waterHold, 0, 1);
      var top = GROUND - 52 * water;
      var og = g.createLinearGradient(0, top, 0, GROUND);
      og.addColorStop(0, mix(col, "#ffffff", 0.30)); og.addColorStop(1, col);
      g.fillStyle = og; g.fillRect(s.x0 + 3, top, span - 6, GROUND - top);
      /* reef */
      g.fillStyle = mix(w.ocean.reef > 0.5 ? css("--accent-2") : css("--muted"), col, 0.35);
      for (var r = 0; r < 7; r++) {
        var rx = s.x0 + 14 + r * (span - 28) / 6;
        var hgt = 5 + w.ocean.reef * 12 * (0.6 + 0.4 * Math.sin(r * 2.1));
        g.beginPath(); g.ellipse(rx, GROUND - 3, 6, hgt, 0, Math.PI, 0); g.fill();
      }
    } else if (s.id === "agriculture") {
      var pw = span / Math.max(1, w.farm.plots.length);
      for (var p = 0; p < w.farm.plots.length; p++) {
        var pl = w.farm.plots[p], crop = CROP_BY_ID[pl.cropId];
        var t = crop ? clamp(pl.age / crop.days, 0, 1) : 0;
        var hgt2 = pl.planted ? 4 + t * 30 * pl.health : 2;
        var shade = pl.cropId === "fallow" ? 0.5 : 0.05 + (1 - pl.health) * 0.35;
        g.fillStyle = mix(col, css("--muted"), shade);
        g.fillRect(s.x0 + p * pw + 0.8, GROUND - hgt2, pw - 1.6, hgt2);
      }
    } else if (s.id === "habitat") {
      g.fillStyle = mix(col, css("--ink"), 0.42);
      g.fillRect(s.x0 + 6, GROUND - 62, span - 12, 62);
      for (var f = 0; f < 3; f++) {
        for (var wi = 0; wi < 4; wi++) {
          var lit = night ? (wi + f) % 3 !== 0 : true;
          g.fillStyle = lit ? mix(css("--accent-2"), "#ffffff", night ? 0.15 : 0.55) : css("--line");
          g.fillRect(s.x0 + 14 + wi * (span - 28) / 4, GROUND - 54 + f * 19, 12, 10);
        }
      }
    } else {
      /* trees and grasses, sized by biomass, thinned when stressed */
      var count = s.id === "rainforest" ? 13 : (s.id === "desert" ? 11 : 15);
      for (var i = 0; i < count; i++) {
        var frac = (i + 0.5) / count;
        var x = s.x0 + 6 + frac * (span - 12);
        var jitter = Math.sin(i * 7.3 + s.x0) * 0.5 + 0.5;
        var maxH = s.id === "rainforest" ? 190 : (s.id === "mangrove" ? 76 : (s.id === "desert" ? 34 : 54));
        var hgt3 = (0.35 + jitter * 0.65) * maxH * clamp(fill, 0.12, 1.2) * (1 - b.stress * 0.32);
        var trunk = Math.max(1.4, hgt3 * 0.045);
        g.fillStyle = mix(col, css("--ink"), 0.45);
        g.fillRect(x - trunk / 2, GROUND - hgt3 * 0.42, trunk, hgt3 * 0.42);
        g.fillStyle = mix(col, css("--ink"), b.stress * 0.35);
        g.beginPath();
        g.ellipse(x, GROUND - hgt3 * 0.62, Math.max(4, hgt3 * 0.17), Math.max(5, hgt3 * 0.30), 0, 0, 7);
        g.fill();
      }
    }
  }

  function basement(g, w) {
    g.fillStyle = mix(css("--panel2"), css("--ink"), 0.08);
    g.fillRect(0, GROUND + 26, VW, BASE - GROUND - 26 + 12);
    g.strokeStyle = css("--line"); g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, GROUND + 26.5); g.lineTo(VW, GROUND + 26.5); g.stroke();

    var running = w.tech.machines.filter(function (m) { return m.running; }).length;
    var mx = 22;
    for (var i = 0; i < w.tech.machines.length; i++) {
      var m = w.tech.machines[i];
      var col = m.broken ? css("--danger") : (m.condition < 0.45 ? css("--watch") : css("--c-tech"));
      g.fillStyle = mix(col, css("--panel"), m.running ? 0.15 : 0.6);
      g.fillRect(mx, GROUND + 38, 62, 26);
      g.strokeStyle = col; g.lineWidth = m.broken ? 1.6 : 1; g.strokeRect(mx + .5, GROUND + 38.5, 61, 25);
      /* condition bar */
      g.fillStyle = col; g.fillRect(mx + 4, GROUND + 58, 54 * m.condition, 3);
      g.fillStyle = css("--ink-dim"); g.font = "8px " + css("--font");
      g.fillText(m.name.length > 15 ? m.name.slice(0, 14) + "…" : m.name, mx + 4, GROUND + 49);
      if (m.running && !m.broken) {
        g.fillStyle = css("--ok"); g.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(state.t * 0.06 + i));
        g.beginPath(); g.arc(mx + 56, GROUND + 43, 2.6, 0, 7); g.fill(); g.globalAlpha = 1;
      }
      mx += 68;
      if (mx > VW - 70) break;
    }
    g.fillStyle = css("--muted"); g.font = "700 9px " + css("--font");
    g.fillText("TECHNOSPHERE · " + running + " of " + w.tech.machines.length + " running · " +
               Math.round(w.tech.power) + " kW", 22, GROUND + 34);
  }

  function glassAndWeather(g, w, rh, light) {
    /* the glass shell, drawn over everything */
    for (var i = 0; i < SECTIONS.length; i++) {
      var s = SECTIONS[i];
      g.beginPath();
      g.moveTo(s.x0, GROUND);
      g.lineTo(s.x0, s.roof);
      g.lineTo((s.x0 + s.x1) / 2, s.apex);
      g.lineTo(s.x1, s.roof);
      g.lineTo(s.x1, GROUND);
      g.closePath();
      var sel = state.selected === s.id, hov = state.hover === s.id;
      g.fillStyle = mix(css("--info"), "transparent", 0.94);
      g.globalAlpha = sel ? 0.14 : (hov ? 0.09 : 0.05);
      g.fill(); g.globalAlpha = 1;
      g.strokeStyle = sel ? css("--accent") : css("--line");
      g.lineWidth = sel ? 2 : 1; g.stroke();

      /* space-frame members */
      g.strokeStyle = css("--line-soft"); g.lineWidth = 0.7; g.globalAlpha = 0.8;
      for (var k = 1; k < 6; k++) {
        var fx = s.x0 + (s.x1 - s.x0) * k / 6;
        var roofY = s.roof + (s.apex - s.roof) * (1 - Math.abs(k / 6 - 0.5) * 2);
        g.beginPath(); g.moveTo(fx, GROUND); g.lineTo(fx, roofY); g.stroke();
      }
      g.globalAlpha = 1;

      /* condensation beads once the air is close to saturation */
      if (rh > 0.72) {
        var n = Math.round((rh - 0.72) * 90);
        g.fillStyle = mix(css("--info"), "#ffffff", 0.4);
        for (var d = 0; d < n; d++) {
          var t = (d * 0.618 + i * 0.13) % 1;
          var dx = s.x0 + 6 + t * (s.x1 - s.x0 - 12);
          var dy = s.roof + ((d * 37 + i * 11) % 100) / 100 * (GROUND - s.roof - 8);
          g.globalAlpha = 0.20 + 0.4 * ((d % 3) / 3);
          g.beginPath(); g.arc(dx, dy, 1.1 + (d % 3) * 0.5, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
      }
    }
    /* rain, when condensation is running away from the crew */
    if (rh > 0.86) {
      g.strokeStyle = mix(css("--info"), css("--bg"), 0.25); g.lineWidth = 1;
      for (var r = 0; r < 60; r++) {
        var rx = (r * 61.8 + state.t * 3) % VW;
        var ry = ((r * 43 + state.t * 9) % (GROUND - 60)) + 40;
        g.globalAlpha = 0.35;
        g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx - 1.5, ry + 7); g.stroke();
      }
      g.globalAlpha = 1;
    }
    /* grow lights */
    if (w.controls.lights > 0) {
      var s2 = SECTIONS[5];
      g.fillStyle = css("--accent-2"); g.globalAlpha = 0.10 + 0.04 * w.controls.lights;
      g.beginPath(); g.moveTo(s2.x0 + 10, s2.roof); g.lineTo(s2.x1 - 10, s2.roof);
      g.lineTo(s2.x1 - 30, GROUND); g.lineTo(s2.x0 + 30, GROUND); g.fill(); g.globalAlpha = 1;
    }
  }

  /* ---------------- overlays ---------------- */

  function overlay(g, w) {
    var o = state.overlay;
    if (o === "air")     return airOverlay(g, w);
    if (o === "water")   return waterOverlay(g, w);
    if (o === "heat")    return heatOverlay(g, w);
    if (o === "carbon")  return carbonOverlay(g, w);
    if (o === "labour")  return labourOverlay(g, w);
    if (o === "species") return speciesOverlay(g, w);
  }

  function airOverlay(g, w) {
    var mix2 = w.controls.airMix;
    if (state.particles.length !== 90) {
      state.particles = [];
      for (var i = 0; i < 90; i++)
        state.particles.push({ x: Math.random() * VW, y: 60 + Math.random() * (GROUND - 90), v: 0.4 + Math.random() });
    }
    for (var p = 0; p < state.particles.length; p++) {
      var q = state.particles[p];
      q.x += q.v * (0.35 + mix2 * 2.4);
      q.y += Math.sin((q.x + state.t) * 0.02) * 0.35;
      if (q.x > VW) q.x = 0;
      g.fillStyle = css("--info"); g.globalAlpha = 0.30;
      g.beginPath(); g.arc(q.x, q.y, 1.6, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    caption(g, "Airflow — " + Math.round(mix2 * 100) + "% mixing between biomes");
  }

  function waterOverlay(g, w) {
    for (var i = 0; i < SECTIONS.length; i++) {
      var s = SECTIONS[i], b = Sim.biome(w, s.id);
      var m = s.id === "ocean" ? 1 : clamp(b.water / b.waterHold, 0, 1.4);
      var over = m > (b.moistOpt + 0.12);
      var under = m < (b.moistOpt - 0.15);
      g.fillStyle = over ? css("--info") : (under ? css("--action") : css("--ok"));
      g.globalAlpha = 0.18 + Math.abs(m - b.moistOpt) * 0.4;
      g.fillRect(s.x0, GROUND, s.x1 - s.x0, 26);
      g.globalAlpha = 1;
      g.fillStyle = css("--ink-dim"); g.font = "700 9px " + css("--mono"); g.textAlign = "center";
      g.fillText(Math.round(m * 100) + "%", (s.x0 + s.x1) / 2, GROUND + 17);
      g.textAlign = "left";
      /* evaporation rising */
      for (var e = 0; e < 5; e++) {
        var ex = s.x0 + 12 + e * (s.x1 - s.x0 - 24) / 4;
        var ey = GROUND - ((state.t * 1.4 + e * 24 + i * 13) % 110);
        g.globalAlpha = clamp(ey / GROUND, 0, 1) * 0.35;
        g.fillStyle = css("--info");
        g.beginPath(); g.arc(ex, ey, 2, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }
    caption(g, "Soil moisture against each biome's target, with evaporation rising");
  }

  function heatOverlay(g, w) {
    for (var i = 0; i < SECTIONS.length; i++) {
      var s = SECTIONS[i], b = Sim.biome(w, s.id);
      var d = clamp((b.temp - b.tempSet) / 6, -1, 1);
      g.fillStyle = d > 0 ? css("--danger") : css("--info");
      g.globalAlpha = Math.abs(d) * 0.32;
      g.fillRect(s.x0, s.apex, s.x1 - s.x0, GROUND - s.apex);
      g.globalAlpha = 1;
      g.fillStyle = css("--ink"); g.font = "700 11px " + css("--mono"); g.textAlign = "center";
      g.fillText(b.temp.toFixed(1) + "°", (s.x0 + s.x1) / 2, s.roof + 22);
      g.font = "9px " + css("--font"); g.fillStyle = css("--muted");
      g.fillText("set " + b.tempSet + "°", (s.x0 + s.x1) / 2, s.roof + 34);
      g.textAlign = "left";
    }
    caption(g, "Temperature against setpoint. Red is above, blue below.");
  }

  function carbonOverlay(g, w) {
    for (var i = 0; i < SECTIONS.length; i++) {
      var s = SECTIONS[i], b = Sim.biome(w, s.id);
      var net = (b.npp - b.rh);
      var mag = clamp(Math.abs(net) / 6, 0.12, 1);
      var up = net > 0;
      g.strokeStyle = up ? css("--ok") : css("--danger");
      g.lineWidth = 2 + mag * 5; g.globalAlpha = 0.55;
      var cx = (s.x0 + s.x1) / 2;
      var y0 = up ? GROUND - 10 : s.roof + 30, y1 = up ? s.roof + 30 : GROUND - 10;
      var off = (state.t * 1.6) % 26;
      g.beginPath();
      g.moveTo(cx, y0 + (up ? -off : off));
      g.lineTo(cx, y0 + (up ? -off - 18 : off + 18));
      g.stroke(); g.globalAlpha = 1;
      g.fillStyle = up ? css("--ok") : css("--danger");
      g.font = "700 9px " + css("--mono"); g.textAlign = "center";
      g.fillText((net >= 0 ? "+" : "") + net.toFixed(1), cx, y1 + (up ? -6 : 12));
      g.textAlign = "left";
    }
    caption(g, "Net carbon, kg C per day. Green fixes more than it respires; red is the other way.");
  }

  function labourOverlay(g, w) {
    var crew = Sim.liveCrew(w);
    var lab = w.lastLabour;
    var map = { farm: "agriculture", eco: "rainforest", sci: "habitat", dom: "habitat", mech: null };
    var counts = {};
    for (var d in map) counts[map[d] || "tech"] = 0;
    for (var i = 0; i < crew.length; i++) {
      var target = map[crew[i].duty] || "tech";
      counts[target] = (counts[target] || 0) + 1;
    }
    for (var k in counts) {
      var s = null;
      for (var j = 0; j < SECTIONS.length; j++) if (SECTIONS[j].id === k) s = SECTIONS[j];
      var cx = s ? (s.x0 + s.x1) / 2 : VW / 2, cy = s ? GROUND - 22 : GROUND + 50;
      for (var n = 0; n < counts[k]; n++) {
        g.fillStyle = css("--accent"); g.globalAlpha = 0.85;
        g.beginPath(); g.arc(cx - counts[k] * 5 + n * 10, cy, 3.6, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }
    if (lab) {
      var short = lab.totalDemand - lab.pool;
      caption(g, "Crew placement · demand " + Math.round(lab.totalDemand) + " h/day against " +
                 Math.round(lab.pool) + " h available" + (short > 0 ? " · short by " + Math.round(short) + " h" : ""));
    }
  }

  function speciesOverlay(g, w) {
    var e = w.ecology;
    for (var i = 0; i < SECTIONS.length; i++) {
      var s = SECTIONS[i];
      if (s.id === "habitat" || s.id === "ocean") continue;
      var pressure = e.ants * (s.id === "agriculture" ? 1.25 : 1);
      var n = Math.round(pressure * 34);
      g.fillStyle = css("--danger"); g.globalAlpha = 0.5;
      for (var d = 0; d < n; d++) {
        var dx = s.x0 + 6 + ((d * 73 + i * 17) % (s.x1 - s.x0 - 12));
        var dy = GROUND - 4 - ((d * 41) % 22);
        g.beginPath(); g.arc(dx, dy, 1.4, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }
    caption(g, "Invasive ant pressure " + Math.round(e.ants * 100) + "% · pollinators " +
               Math.round(e.pollinators * 100) + "% of baseline");
  }

  function caption(g, text) {
    g.fillStyle = css("--ink-dim"); g.font = "600 11px " + css("--font");
    g.fillText(text, 22, 22);
  }

  function labels(g, w) {
    g.font = "700 9px " + css("--font");
    for (var i = 0; i < SECTIONS.length; i++) {
      var s = SECTIONS[i];
      g.fillStyle = state.selected === s.id ? css("--accent") : css("--muted");
      g.textAlign = "center";
      g.fillText(s.label.toUpperCase(), (s.x0 + s.x1) / 2, GROUND + 20);
    }
    g.textAlign = "left";
  }

  /* ---------------- helpers ---------------- */

  function mix(a, b, t) {
    /* naive hex mixing, good enough for schematic fills */
    var pa = hex(a), pb = hex(b);
    if (!pa) return a; if (!pb) return a;
    var r = Math.round(pa[0] + (pb[0] - pa[0]) * t),
        gg = Math.round(pa[1] + (pb[1] - pa[1]) * t),
        bb = Math.round(pa[2] + (pb[2] - pa[2]) * t);
    return "rgb(" + r + "," + gg + "," + bb + ")";
  }
  function hex(c) {
    if (!c) return null;
    c = c.trim();
    if (c[0] === "#") {
      if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
    }
    var m = c.match(/rgba?\(([^)]+)\)/);
    if (m) { var p = m[1].split(","); return [+p[0], +p[1], +p[2]]; }
    if (c === "transparent") return [128, 128, 128];
    return null;
  }

  function attach(cv, onSelect) {
    function toVirtual(ev) {
      var r = cv.getBoundingClientRect();
      return { x: (ev.clientX - r.left) / r.width * VW, y: (ev.clientY - r.top) / r.width * VW };
    }
    cv.addEventListener("mousemove", function (ev) {
      var v = toVirtual(ev), s = sectionAt(v.x, v.y);
      state.hover = s ? s.id : null;
      cv.style.cursor = s ? "pointer" : "default";
    });
    cv.addEventListener("mouseleave", function () { state.hover = null; });
    cv.addEventListener("click", function (ev) {
      var v = toVirtual(ev), s = sectionAt(v.x, v.y);
      state.selected = s ? s.id : null;
      if (onSelect) onSelect(state.selected);
    });
  }

  return {
    draw: draw, attach: attach, state: state, SECTIONS: SECTIONS,
    tick: function () { state.t++; },
    setOverlay: function (o) { state.overlay = o; },
    select: function (id) { state.selected = id; }
  };
})();
