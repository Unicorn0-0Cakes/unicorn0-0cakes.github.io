"use strict";
/* =====================================================================
   EVOLUTION IN A FLASK — charts.js
   Canvas drawing. Every chart carries its units and, where one exists,
   the published curve to compare against, so a line is never just a
   shape. Nothing here knows anything about the model.
   ===================================================================== */

var Chart = (function () {

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function prep(cv, h) {
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth || cv.parentNode.clientWidth || 320;
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
      var v = vals[i];
      if (!isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) hi = lo + Math.max(1e-6, Math.abs(lo) * 0.1);
    return [lo, hi];
  }

  function fmt(v) {
    var a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k";
    if (a >= 10) return Math.round(v).toString();
    if (a >= 1) return v.toFixed(2);
    return v.toFixed(3);
  }

  /* ---- sparkline ---- */
  function spark(cv, vals, colour, h) {
    var c = prep(cv, h || 30), g = c.g;
    if (!vals || vals.length < 2) return;
    var e = extent(vals), lo = e[0], hi = e[1];
    var pad = (hi - lo) * 0.14; lo -= pad; hi += pad;
    var x = function (i) { return i / (vals.length - 1) * c.w; };
    var y = function (v) { return c.h - (v - lo) / (hi - lo) * c.h; };
    g.beginPath();
    for (var i = 0; i < vals.length; i++) { var px = x(i), py = y(vals[i]); i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.strokeStyle = colour || css("--accent"); g.lineWidth = 1.5; g.lineJoin = "round"; g.stroke();
    g.lineTo(c.w, c.h); g.lineTo(0, c.h); g.closePath();
    g.globalAlpha = 0.13; g.fillStyle = colour || css("--accent"); g.fill(); g.globalAlpha = 1;
  }

  /* ---- full line chart -------------------------------------------------
     series: [{ vals:[{x,y}], colour, label, dash, width, alpha }]
     opts:   { height, xLabel, yLabel, min, max, xmin, xmax, logX,
               markers:[{x,label,colour}], points:[{x,y,err,colour}] } */
  function line(cv, series, opts) {
    opts = opts || {};
    var c = prep(cv, opts.height || 210), g = c.g;
    var padL = 52, padR = 12, padT = 12, padB = 26;
    var W = c.w - padL - padR, H = c.h - padT - padB;
    if (W <= 4 || H <= 4) return;

    var xs = [], ys = [], i, j;
    for (i = 0; i < series.length; i++)
      for (j = 0; j < series[i].vals.length; j++) { xs.push(series[i].vals[j].x); ys.push(series[i].vals[j].y); }
    if (opts.points) for (i = 0; i < opts.points.length; i++) { xs.push(opts.points[i].x); ys.push(opts.points[i].y); }
    if (!xs.length) return;

    var ex = extent(xs), ey = extent(ys);
    var xmin = opts.xmin != null ? opts.xmin : ex[0], xmax = opts.xmax != null ? opts.xmax : ex[1];
    var ymin = opts.min != null ? opts.min : ey[0], ymax = opts.max != null ? opts.max : ey[1];
    if (opts.min == null) ymin -= (ymax - ymin) * 0.08;
    if (opts.max == null) ymax += (ymax - ymin) * 0.08;
    if (xmax - xmin < 1e-9) xmax = xmin + 1;

    var lx = function (v) {
      if (!opts.logX) return padL + (v - xmin) / (xmax - xmin) * W;
      var a = Math.log10(Math.max(1, xmin)), b = Math.log10(Math.max(10, xmax));
      return padL + (Math.log10(Math.max(1, v)) - a) / (b - a) * W;
    };
    var ly = function (v) { return padT + H - (v - ymin) / (ymax - ymin) * H; };

    /* grid */
    g.strokeStyle = css("--line-soft"); g.lineWidth = 1;
    g.fillStyle = css("--muted"); g.font = "10px " + css("--mono");
    for (i = 0; i <= 4; i++) {
      var yv = ymin + (ymax - ymin) * i / 4, py = Math.round(ly(yv)) + 0.5;
      g.beginPath(); g.moveTo(padL, py); g.lineTo(padL + W, py); g.stroke();
      g.textAlign = "right"; g.textBaseline = "middle";
      g.fillText(fmt(yv), padL - 6, py);
    }
    g.textAlign = "center"; g.textBaseline = "top";
    for (i = 0; i <= 4; i++) {
      var xv = opts.logX
        ? Math.pow(10, Math.log10(Math.max(1, xmin)) + (Math.log10(Math.max(10, xmax)) - Math.log10(Math.max(1, xmin))) * i / 4)
        : xmin + (xmax - xmin) * i / 4;
      g.fillText(fmt(xv), lx(xv), padT + H + 6);
    }

    /* markers */
    if (opts.markers) {
      for (i = 0; i < opts.markers.length; i++) {
        var m = opts.markers[i], mx = Math.round(lx(m.x)) + 0.5;
        if (mx < padL || mx > padL + W) continue;
        g.strokeStyle = m.colour || css("--accent-2");
        g.setLineDash([3, 3]); g.beginPath();
        g.moveTo(mx, padT); g.lineTo(mx, padT + H); g.stroke(); g.setLineDash([]);
        if (m.label) {
          g.fillStyle = m.colour || css("--accent-2");
          g.save(); g.translate(mx + 3, padT + 3); g.textAlign = "left"; g.textBaseline = "top";
          g.font = "9px " + css("--font"); g.fillText(m.label, 0, 0); g.restore();
        }
      }
    }

    /* series */
    for (i = 0; i < series.length; i++) {
      var s = series[i];
      if (s.vals.length < 2) continue;
      g.globalAlpha = s.alpha != null ? s.alpha : 1;
      g.strokeStyle = s.colour || css("--accent");
      g.lineWidth = s.width || 1.6;
      g.lineJoin = "round"; g.lineCap = "round";
      if (s.dash) g.setLineDash(s.dash);
      g.beginPath();
      for (j = 0; j < s.vals.length; j++) {
        var px = lx(s.vals[j].x), py = ly(s.vals[j].y);
        j ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    }

    /* measured points with error bars */
    if (opts.points) {
      for (i = 0; i < opts.points.length; i++) {
        var pt = opts.points[i], px2 = lx(pt.x), py2 = ly(pt.y);
        g.strokeStyle = pt.colour || css("--ink");
        g.fillStyle = pt.colour || css("--ink");
        g.lineWidth = 1.2;
        if (pt.err) {
          g.beginPath();
          g.moveTo(px2, ly(pt.y - pt.err)); g.lineTo(px2, ly(pt.y + pt.err));
          g.moveTo(px2 - 3, ly(pt.y - pt.err)); g.lineTo(px2 + 3, ly(pt.y - pt.err));
          g.moveTo(px2 - 3, ly(pt.y + pt.err)); g.lineTo(px2 + 3, ly(pt.y + pt.err));
          g.stroke();
        }
        g.beginPath(); g.arc(px2, py2, 3, 0, 6.284); g.fill();
      }
    }

    /* axis titles */
    g.fillStyle = css("--muted"); g.font = "10px " + css("--font");
    if (opts.xLabel) { g.textAlign = "right"; g.textBaseline = "bottom"; g.fillText(opts.xLabel, padL + W, c.h); }
    if (opts.yLabel) {
      g.save(); g.translate(11, padT); g.rotate(-Math.PI / 2);
      g.textAlign = "right"; g.textBaseline = "top"; g.fillText(opts.yLabel, 0, 0); g.restore();
    }

    /* legend */
    if (opts.legend !== false) {
      var lxp = padL + 8, lyp = padT + 4;
      g.font = "10px " + css("--font"); g.textAlign = "left"; g.textBaseline = "middle";
      for (i = 0; i < series.length; i++) {
        if (!series[i].label) continue;
        g.strokeStyle = series[i].colour; g.lineWidth = 2;
        if (series[i].dash) g.setLineDash(series[i].dash);
        g.beginPath(); g.moveTo(lxp, lyp + 5); g.lineTo(lxp + 14, lyp + 5); g.stroke(); g.setLineDash([]);
        g.fillStyle = css("--ink-dim");
        g.fillText(series[i].label, lxp + 19, lyp + 5);
        lyp += 13;
      }
    }
  }

  /* ---- a growth curve for a single cycle: cells and substrates ---- */
  function cycleCurve(cv, data, opts) {
    opts = opts || {};
    var c = prep(cv, opts.height || 150), g = c.g;
    var padL = 44, padR = 40, padT = 10, padB = 22;
    var W = c.w - padL - padR, H = c.h - padT - padB;
    if (W <= 4) return;
    var maxN = 1, maxS = 1, i;
    for (i = 0; i < data.length; i++) { maxN = Math.max(maxN, data[i].N); maxS = Math.max(maxS, data[i].S, data[i].A); }
    var t1 = data[data.length - 1].t;
    var lx = function (t) { return padL + t / t1 * W; };
    var lyN = function (n) {
      var a = Math.log10(Math.max(1e4, n)), lo = Math.log10(1e5), hi = Math.log10(maxN * 1.6);
      return padT + H - (a - lo) / (hi - lo) * H;
    };
    var lyS = function (s) { return padT + H - s / (maxS * 1.15) * H; };

    g.strokeStyle = css("--line-soft"); g.lineWidth = 1;
    for (i = 0; i <= 4; i++) {
      var py = Math.round(padT + H * i / 4) + 0.5;
      g.beginPath(); g.moveTo(padL, py); g.lineTo(padL + W, py); g.stroke();
    }
    g.font = "9px " + css("--mono"); g.fillStyle = css("--muted");
    g.textAlign = "right"; g.textBaseline = "middle";
    for (i = 0; i <= 3; i++) {
      var dec = Math.log10(1e5) + (Math.log10(maxN * 1.6) - Math.log10(1e5)) * i / 3;
      g.fillText("1e" + Math.round(dec), padL - 5, lyN(Math.pow(10, dec)));
    }

    function draw(key, ly, colour, dash, width) {
      g.strokeStyle = colour; g.lineWidth = width || 1.6;
      if (dash) g.setLineDash(dash);
      g.beginPath();
      for (var k = 0; k < data.length; k++) {
        var px = lx(data[k].t), py = ly(data[k][key]);
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke(); g.setLineDash([]);
    }
    draw("S", lyS, css("--c-glucose"), [4, 3], 1.4);
    draw("A", lyS, css("--c-acetate"), [2, 3], 1.4);
    if (opts.showCit) draw("C", lyS, css("--c-citrate"), [6, 3], 1.4);
    draw("N", lyN, css("--accent"), null, 2);

    g.font = "9px " + css("--font"); g.fillStyle = css("--muted");
    g.textAlign = "center"; g.textBaseline = "top";
    for (i = 0; i <= 4; i++) g.fillText(Math.round(t1 * i / 4) + "h", lx(t1 * i / 4), padT + H + 5);
  }

  return { line: line, spark: spark, cycleCurve: cycleCurve, prep: prep, css: css, fmt: fmt };
})();
