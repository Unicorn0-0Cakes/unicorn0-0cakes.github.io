"use strict";
/* =====================================================================
   BIOSPHERE: CLOSED WORLD — charts.js
   Small canvas drawing helpers. Every chart carries units, a safe band
   where one exists, and markers for the player's own interventions, so a
   line is never just a shape.
   ===================================================================== */

var Chart = (function () {

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* Set up a canvas for the device pixel ratio and return its context. */
  function prep(cv, h) {
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth || cv.parentNode.clientWidth || 300;
    if (h) cv.style.height = h + "px";
    var hh = cv.clientHeight || h || 60;
    cv.width = Math.max(1, Math.round(w * dpr));
    cv.height = Math.max(1, Math.round(hh * dpr));
    var g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hh);
    return { g: g, w: w, h: hh };
  }

  function extent(vals) {
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < vals.length; i++) {
      if (!isFinite(vals[i])) continue;
      if (vals[i] < lo) lo = vals[i];
      if (vals[i] > hi) hi = vals[i];
    }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) { hi = lo + 1; }
    return [lo, hi];
  }

  /* ---- sparkline: a trend, nothing more ---- */
  function spark(cv, vals, colour, band) {
    var c = prep(cv), g = c.g;
    if (!vals.length) return;
    var e = extent(vals), lo = e[0], hi = e[1];
    if (band) { lo = Math.min(lo, band[0]); hi = Math.max(hi, band[1]); }
    var pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
    var x = function (i) { return i / Math.max(1, vals.length - 1) * c.w; };
    var y = function (v) { return c.h - (v - lo) / (hi - lo) * c.h; };

    if (band) {
      g.fillStyle = css("--ok") + "1f";
      g.fillRect(0, y(band[1]), c.w, Math.max(1, y(band[0]) - y(band[1])));
    }
    g.beginPath();
    for (var i = 0; i < vals.length; i++) { var px = x(i), py = y(vals[i]); i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.strokeStyle = colour || css("--accent"); g.lineWidth = 1.6; g.lineJoin = "round"; g.stroke();
    g.lineTo(c.w, c.h); g.lineTo(0, c.h); g.closePath();
    g.globalAlpha = 0.12; g.fillStyle = colour || css("--accent"); g.fill(); g.globalAlpha = 1;
  }

  /* ---- full line chart with axes, safe band and event markers ---- */
  function line(cv, series, opts) {
    opts = opts || {};
    var c = prep(cv, opts.height || 200), g = c.g;
    var padL = 46, padR = 10, padT = 12, padB = 22;
    var W = c.w - padL - padR, H = c.h - padT - padB;
    var all = [];
    for (var s = 0; s < series.length; s++) all = all.concat(series[s].vals);
    var e = extent(all), lo = opts.min != null ? opts.min : e[0], hi = opts.max != null ? opts.max : e[1];
    if (opts.band) { lo = Math.min(lo, opts.band[0]); hi = Math.max(hi, opts.band[1]); }
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    var n = series[0] ? series[0].vals.length : 0;
    var x = function (i) { return padL + i / Math.max(1, n - 1) * W; };
    var y = function (v) { return padT + H - (v - lo) / (hi - lo) * H; };

    /* grid */
    g.strokeStyle = css("--line-soft"); g.lineWidth = 1;
    g.fillStyle = css("--muted"); g.font = "10px " + css("--mono");
    for (var t = 0; t <= 4; t++) {
      var v = lo + (hi - lo) * t / 4, yy = Math.round(y(v)) + 0.5;
      g.beginPath(); g.moveTo(padL, yy); g.lineTo(padL + W, yy); g.stroke();
      g.fillText(fmtAxis(v), 4, yy + 3);
    }
    if (opts.band) {
      g.fillStyle = css("--ok") + "1a";
      g.fillRect(padL, y(opts.band[1]), W, Math.max(1, y(opts.band[0]) - y(opts.band[1])));
    }
    /* x labels */
    if (opts.xlabel) {
      g.fillStyle = css("--muted"); g.font = "10px " + css("--font");
      g.fillText(opts.xlabel, padL, c.h - 5);
    }
    if (n > 1 && opts.xTicks !== false) {
      g.fillStyle = css("--muted"); g.font = "10px " + css("--mono");
      for (var k = 0; k <= 4; k++) {
        var idx = Math.round((n - 1) * k / 4);
        var lab = opts.xFmt ? opts.xFmt(idx) : String(idx);
        var tx = x(idx); g.textAlign = k === 4 ? "right" : (k === 0 ? "left" : "center");
        g.fillText(lab, tx, c.h - 6);
      }
      g.textAlign = "left";
    }

    /* markers for player actions */
    if (opts.markers) {
      for (var m = 0; m < opts.markers.length; m++) {
        var mk = opts.markers[m];
        if (mk.i < 0 || mk.i >= n) continue;
        var mx = Math.round(x(mk.i)) + 0.5;
        g.strokeStyle = css("--accent-2"); g.setLineDash([3, 3]); g.lineWidth = 1;
        g.beginPath(); g.moveTo(mx, padT); g.lineTo(mx, padT + H); g.stroke(); g.setLineDash([]);
        g.fillStyle = css("--accent-2");
        g.beginPath(); g.moveTo(mx, padT); g.lineTo(mx - 3.5, padT - 5); g.lineTo(mx + 3.5, padT - 5); g.fill();
      }
    }

    for (var si = 0; si < series.length; si++) {
      var sr = series[si];
      g.beginPath();
      for (var i = 0; i < sr.vals.length; i++) {
        var px = x(i), py = y(sr.vals[i]);
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.strokeStyle = sr.colour || css("--accent");
      g.lineWidth = sr.width || 1.9; g.lineJoin = "round";
      if (sr.dash) g.setLineDash(sr.dash);
      g.stroke(); g.setLineDash([]);
    }
  }

  function fmtAxis(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (a >= 1e4) return Math.round(v / 1e3) + "k";
    if (a >= 100) return String(Math.round(v));
    if (a >= 10) return v.toFixed(1);
    return v.toFixed(2);
  }

  /* ---- gauge: one value against its safe operating range ---- */
  function gauge(cv, value, lo, hi, safeLo, safeHi, label, unit) {
    var c = prep(cv, 96), g = c.g;
    var cx = c.w / 2, cy = c.h - 12, r = Math.min(c.w / 2 - 8, c.h - 22);
    var a0 = Math.PI * 1.02, a1 = Math.PI * 1.98;
    var ang = function (v) { return a0 + (clampv(v, lo, hi) - lo) / (hi - lo) * (a1 - a0); };

    g.lineWidth = 9; g.lineCap = "round";
    g.strokeStyle = css("--bg-tint");
    g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();

    g.strokeStyle = css("--ok") + "66";
    g.beginPath(); g.arc(cx, cy, r, ang(safeLo), ang(safeHi)); g.stroke();

    var col = (value < safeLo || value > safeHi) ? css("--action") : css("--ok");
    if (value < lo + (hi - lo) * 0.06 || value > hi - (hi - lo) * 0.06) col = css("--danger");
    g.strokeStyle = col; g.lineWidth = 9;
    g.beginPath(); g.arc(cx, cy, r, a0, ang(value)); g.stroke();

    g.fillStyle = css("--ink"); g.textAlign = "center";
    g.font = "600 19px " + css("--mono");
    g.fillText(fmtAxis(value), cx, cy - 6);
    g.font = "10px " + css("--font"); g.fillStyle = css("--muted");
    g.fillText(unit || "", cx, cy + 7);
    g.font = "700 10px " + css("--font"); g.fillStyle = css("--ink-dim");
    g.fillText((label || "").toUpperCase(), cx, cy + 21);
    g.textAlign = "left";
  }
  function clampv(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---- diurnal chart: the day-night breathing of the atmosphere ---- */
  function diurnal(cv, hourly) {
    var c = prep(cv, 168), g = c.g;
    if (!hourly.length) return;
    var padL = 44, padB = 20, padT = 10, padR = 40;
    var W = c.w - padL - padR, H = c.h - padT - padB;
    var o2 = hourly.map(function (h) { return h.o2; });
    var co2 = hourly.map(function (h) { return h.co2; });
    var eo = extent(o2), ec = extent(co2);
    var po = (eo[1] - eo[0]) * 0.25 + 1e-4, pc = (ec[1] - ec[0]) * 0.25 + 1;
    var x = function (i) { return padL + i / Math.max(1, hourly.length - 1) * W; };
    var yo = function (v) { return padT + H - (v - eo[0] + po) / (eo[1] - eo[0] + po * 2) * H; };
    var yc = function (v) { return padT + H - (v - ec[0] + pc) / (ec[1] - ec[0] + pc * 2) * H; };

    /* night shading, which is where the story lives */
    for (var i = 0; i < hourly.length; i++) {
      if (hourly[i].light <= 0.005) {
        g.fillStyle = css("--bg-tint");
        g.fillRect(x(i) - W / hourly.length / 2, padT, W / hourly.length + 1, H);
      }
    }
    g.strokeStyle = css("--line-soft");
    g.beginPath(); g.moveTo(padL, padT + H + .5); g.lineTo(padL + W, padT + H + .5); g.stroke();

    var draw = function (vals, yf, colour, dash) {
      g.beginPath();
      for (var i = 0; i < vals.length; i++) { var px = x(i), py = yf(vals[i]); i ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.strokeStyle = colour; g.lineWidth = 1.9; if (dash) g.setLineDash(dash);
      g.stroke(); g.setLineDash([]);
    };
    draw(o2, yo, css("--info"));
    draw(co2, yc, css("--accent-2"), [4, 3]);

    g.font = "10px " + css("--mono"); g.fillStyle = css("--info");
    g.fillText(o2[o2.length - 1].toFixed(2) + "%", 3, yo(o2[o2.length - 1]) + 3);
    g.fillStyle = css("--accent-2"); g.textAlign = "right";
    g.fillText(Math.round(co2[co2.length - 1]) + " ppm", c.w - 3, yc(co2[co2.length - 1]) + 3);
    g.textAlign = "left";
    g.fillStyle = css("--muted"); g.font = "10px " + css("--font");
    g.fillText("shaded bands are night", padL, c.h - 5);
  }

  /* ---- flow bars: a Sankey without the spaghetti ---- */
  function flows(el, rows, total) {
    var max = total || Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); }).concat([1]));
    var html = "";
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var pct = Math.min(100, Math.abs(r.value) / max * 100);
      html += '<div class="barrow" title="' + (r.note || "") + '">' +
              '<span class="lbl">' + r.label + '</span>' +
              '<span class="track"><i style="width:' + pct.toFixed(1) + '%;background:' + r.colour + '"></i></span>' +
              '<span class="amt">' + r.display + '</span></div>';
    }
    el.innerHTML = '<div class="bararray">' + html + '</div>';
  }

  return { spark: spark, line: line, gauge: gauge, diurnal: diurnal, flows: flows,
           prep: prep, css: css, fmt: fmtAxis };
})();
