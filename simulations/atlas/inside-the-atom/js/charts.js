"use strict";
/* =====================================================================
   INSIDE THE ATOM — charts.js

   Canvas plotting. Every colour is read through Orbital.color() at draw
   time rather than baked in, so a theme change is a repaint and not a
   rewrite; main.js re-runs the active screen on orbital:theme.

   Two rules hold everywhere in this file:

     · a measured point and a model curve never look alike. Observations
       are markers with uncertainty bars; models are lines. The nuclear
       model is a solid line with a round marker, the diffuse model a
       dashed line with a square one, so they are separable without
       colour;
     · a count that came out at or below its estimated background is
       drawn as an upper limit — a downward arrow at the one-sigma
       level — never as a point at zero on a logarithmic axis and never
       silently dropped.
   ===================================================================== */

var Charts = (function () {

  function col(n) { return Orbital.color(n); }

  /* Size the backing store for the display, once per draw. */
  function prep(cv, cssH) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = cv.clientWidth || cv.parentNode.clientWidth || 600;
    var h = cssH || Math.round(w * 0.52);
    cv.style.height = h + "px";
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    var g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    return { g: g, w: w, h: h };
  }

  function mono(px, weight) { return (weight || 400) + " " + px + "px " + "IBM Plex Mono, monospace"; }

  /* ------------------------------------------------------------------
     Observations reduced to a comparable yield.

     A raw count depends on the exposure, the aperture and the screen.
     Dividing by all three gives dP/dΩ per incident particle, which is
     exactly what the model curves are, so the two can share an axis.
     ------------------------------------------------------------------ */
  function yieldOf(o) {
    var denom = o.fired * o.omega * (o.efficiency || 1);
    if (!(denom > 0)) return null;
    var y = o.corrected / denom;
    var s = o.sigma / denom;
    return {
      deg: o.detAngleDeg, y: y, s: s,
      limit: (o.corrected <= o.sigma),      /* consistent with nothing */
      upper: (o.corrected + o.sigma) / denom,
      raw: o.raw, index: o.index, model: o.model
    };
  }

  /* ------------------------------------------------------------------
     THE ANGULAR DISTRIBUTION
     x: detector angle, linear or logarithmic
     y: yield per steradian, linear or logarithmic
     ------------------------------------------------------------------ */
  function distribution(cv, opt) {
    var P = prep(cv, opt.height), g = P.g, W = P.w, H = P.h;
    var logY = opt.logY !== false, logX = !!opt.logX;
    var pad = { l: 62, r: 14, t: 14, b: 34 };
    var pw = Math.max(10, W - pad.l - pad.r), ph = Math.max(10, H - pad.t - pad.b);

    var pts = (opt.observations || []).map(yieldOf).filter(Boolean);
    var curves = opt.curves || [];

    /* --- ranges --- */
    var xMin = logX ? 1 : 0, xMax = 180;
    var vals = [];
    curves.forEach(function (c) {
      c.points.forEach(function (p) { if (p.perSr > 0 && p.deg >= xMin) vals.push(p.perSr); });
    });
    pts.forEach(function (p) {
      var v = p.limit ? p.upper : p.y;
      if (v > 0) vals.push(v);
      if (p.y - p.s > 0) vals.push(p.y - p.s);
    });
    if (!vals.length) vals = [1e-9, 1];
    var yHi = Math.max.apply(null, vals), yLo = Math.min.apply(null, vals);
    if (!(yHi > 0)) yHi = 1;
    if (!(yLo > 0) || yLo >= yHi) yLo = yHi * 1e-10;
    if (logY) { yLo = Math.pow(10, Math.floor(Math.log10(yLo)) - 0.2); yHi = Math.pow(10, Math.ceil(Math.log10(yHi)) + 0.2); }
    else { yLo = 0; yHi = yHi * 1.12; }

    function X(d) {
      var t = logX
        ? (Math.log10(Math.max(xMin, d)) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin))
        : (d - xMin) / (xMax - xMin);
      return pad.l + t * pw;
    }
    function Y(v) {
      var t;
      if (logY) {
        if (!(v > 0)) return pad.t + ph + 40;
        t = (Math.log10(v) - Math.log10(yLo)) / (Math.log10(yHi) - Math.log10(yLo));
      } else t = (v - yLo) / (yHi - yLo);
      return pad.t + ph - t * ph;
    }

    /* --- frame and grid --- */
    g.fillStyle = col("scope"); g.fillRect(0, 0, W, H);
    var line = col("scope-line"), dim = col("muted"), ink = col("ink-dim");

    g.strokeStyle = line; g.lineWidth = 1; g.font = mono(9.5);
    var xt = logX ? [1, 2, 5, 10, 20, 45, 90, 180] : [0, 30, 60, 90, 120, 150, 180];
    xt.forEach(function (d) {
      var x = X(d);
      g.globalAlpha = 0.5; g.beginPath(); g.moveTo(x, pad.t); g.lineTo(x, pad.t + ph); g.stroke();
      g.globalAlpha = 1; g.fillStyle = dim; g.textAlign = "center";
      g.fillText(d + "°", x, pad.t + ph + 14);
    });

    if (logY) {
      var e0 = Math.ceil(Math.log10(yLo)), e1 = Math.floor(Math.log10(yHi));
      var stepE = Math.max(1, Math.ceil((e1 - e0) / 8));
      for (var e = e0; e <= e1; e += stepE) {
        var y = Y(Math.pow(10, e));
        g.strokeStyle = line; g.globalAlpha = 0.5;
        g.beginPath(); g.moveTo(pad.l, y); g.lineTo(pad.l + pw, y); g.stroke();
        g.globalAlpha = 1; g.fillStyle = dim; g.textAlign = "right";
        g.fillText("1e" + e, pad.l - 6, y + 3);
      }
    } else {
      for (var i = 0; i <= 4; i++) {
        var yy = pad.t + ph - (i / 4) * ph, v = yLo + (i / 4) * (yHi - yLo);
        g.strokeStyle = line; g.globalAlpha = 0.5;
        g.beginPath(); g.moveTo(pad.l, yy); g.lineTo(pad.l + pw, yy); g.stroke();
        g.globalAlpha = 1; g.fillStyle = dim; g.textAlign = "right";
        g.fillText(sig(v, 2), pad.l - 6, yy + 3);
      }
    }

    /* --- model curves --- */
    curves.forEach(function (c) {
      g.strokeStyle = col(c.token || "orange");
      g.lineWidth = 1.9;
      g.setLineDash(c.dash && c.dash.length ? c.dash : []);
      g.beginPath();
      var started = false;
      c.points.forEach(function (p) {
        if (p.deg < xMin) return;
        var v = p.perSr;
        if (logY && !(v > yLo * 0.5)) { started = false; return; }
        var x = X(p.deg), y = Y(Math.max(v, yLo * 0.51));
        if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
      });
      g.stroke();
      g.setLineDash([]);
    });

    /* --- the detector's current position --- */
    if (opt.markAngle !== null && opt.markAngle !== undefined) {
      var mx = X(Math.max(xMin, opt.markAngle));
      g.strokeStyle = col("gold"); g.globalAlpha = 0.75; g.lineWidth = 1;
      g.setLineDash([2, 4]);
      g.beginPath(); g.moveTo(mx, pad.t); g.lineTo(mx, pad.t + ph); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1;
    }

    /* --- observations --- */
    var accent = col("orange"), teal = col("teal"), okc = col("ok");
    pts.forEach(function (p) {
      if (p.deg < xMin) return;
      var x = X(p.deg);
      var c = okc;
      g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 1.4;
      if (p.limit) {
        /* upper limit: a downward arrow from the one-sigma level */
        var yt = Y(Math.max(p.upper, yLo * 1.01));
        g.beginPath(); g.moveTo(x - 4, yt); g.lineTo(x + 4, yt); g.stroke();
        g.beginPath(); g.moveTo(x, yt); g.lineTo(x, yt + 11); g.stroke();
        g.beginPath(); g.moveTo(x - 3.5, yt + 7); g.lineTo(x, yt + 12); g.lineTo(x + 3.5, yt + 7); g.stroke();
      } else {
        var yc = Y(p.y);
        var yhiV = p.y + p.s, yloV = p.y - p.s;
        var ytop = Y(yhiV), ybot = Y(logY ? Math.max(yloV, yLo * 1.01) : yloV);
        g.beginPath(); g.moveTo(x, ytop); g.lineTo(x, ybot); g.stroke();
        g.beginPath(); g.moveTo(x - 3, ytop); g.lineTo(x + 3, ytop); g.stroke();
        g.beginPath(); g.moveTo(x - 3, ybot); g.lineTo(x + 3, ybot); g.stroke();
        g.beginPath(); g.arc(x, yc, 3.1, 0, Math.PI * 2); g.fill();
        g.strokeStyle = col("scope"); g.lineWidth = 1;
        g.beginPath(); g.arc(x, yc, 3.1, 0, Math.PI * 2); g.stroke();
      }
    });

    /* --- axis labels --- */
    g.fillStyle = ink; g.font = mono(9.5, 500); g.textAlign = "left";
    g.fillText(opt.yLabel || "COUNTS PER STERADIAN PER PARTICLE", pad.l, pad.t - 3);
    g.textAlign = "right";
    g.fillText("DETECTOR ANGLE", pad.l + pw, pad.t + ph + 27);
  }

  /* ------------------------------------------------------------------
     POLAR SCATTERING PLOT
     Radius is the logarithm of the yield, so ten decades fit. The beam
     enters from the left; 0° is straight on, 180° is straight back.
     ------------------------------------------------------------------ */
  function polar(cv, opt) {
    var P = prep(cv, opt.height || 300), g = P.g, W = P.w, H = P.h;
    var cx = W * 0.5, cy = H * 0.5 + 6, R = Math.min(W * 0.42, H * 0.42);
    g.fillStyle = col("scope"); g.fillRect(0, 0, W, H);

    var curves = opt.curves || [];
    var pts = (opt.observations || []).map(yieldOf).filter(Boolean);
    var vals = [];
    curves.forEach(function (c) { c.points.forEach(function (p) { if (p.perSr > 0) vals.push(p.perSr); }); });
    pts.forEach(function (p) { var v = p.limit ? p.upper : p.y; if (v > 0) vals.push(v); });
    if (!vals.length) vals = [1e-9, 1];
    var hi = Math.max.apply(null, vals);
    var decades = opt.decades || 10;
    var lo = hi * Math.pow(10, -decades);

    function rad(v) {
      if (!(v > 0)) return 0;
      var t = (Math.log10(v) - Math.log10(lo)) / decades;
      return Math.max(0, Math.min(1, t)) * R;
    }
    /* 0° points right (the beam travels left to right) */
    function pos(deg, v) {
      var a = deg * Math.PI / 180, r = rad(v);
      return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
    }

    /* rings, one per decade */
    g.strokeStyle = col("scope-line"); g.lineWidth = 1; g.font = mono(8.5);
    for (var d = 0; d <= decades; d += 2) {
      var rr = (d / decades) * R;
      g.globalAlpha = 0.55;
      g.beginPath(); g.arc(cx, cy, rr, -Math.PI / 2, Math.PI / 2); g.stroke();
      g.globalAlpha = 1;
    }
    /* radial spokes with labels */
    [0, 30, 60, 90, 120, 150, 180].forEach(function (a) {
      var rr = a * Math.PI / 180;
      g.strokeStyle = col("scope-line"); g.globalAlpha = 0.5;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + R * Math.cos(rr), cy - R * Math.sin(rr)); g.stroke();
      g.globalAlpha = 1; g.fillStyle = col("muted");
      var lx = cx + (R + 13) * Math.cos(rr), ly = cy - (R + 13) * Math.sin(rr);
      g.textAlign = a === 0 ? "left" : (a === 180 ? "right" : "center");
      g.fillText(a + "°", lx, ly + 3);
    });

    /* the beam, coming in from the left along the axis */
    g.strokeStyle = col("gold"); g.lineWidth = 2; g.globalAlpha = 0.8;
    g.beginPath(); g.moveTo(cx - R - 10, cy); g.lineTo(cx - 8, cy); g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = col("gold"); g.font = mono(8.5, 500); g.textAlign = "left";
    g.fillText("BEAM", cx - R - 8, cy - 6);
    /* the foil */
    g.strokeStyle = col("ink-dim"); g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx, cy - 13); g.lineTo(cx, cy + 13); g.stroke();

    curves.forEach(function (c) {
      g.strokeStyle = col(c.token || "orange"); g.lineWidth = 1.9;
      g.setLineDash(c.dash && c.dash.length ? c.dash : []);
      g.beginPath();
      var started = false;
      c.points.forEach(function (p) {
        var r = rad(p.perSr);
        if (r <= 0) { started = false; return; }
        var q = pos(p.deg, p.perSr);
        if (!started) { g.moveTo(q[0], q[1]); started = true; } else g.lineTo(q[0], q[1]);
      });
      g.stroke(); g.setLineDash([]);
    });

    pts.forEach(function (p) {
      var v = p.limit ? p.upper : p.y;
      if (!(v > 0)) return;
      var q = pos(p.deg, v);
      g.fillStyle = col("ok");
      if (p.limit) {
        g.strokeStyle = col("ok"); g.lineWidth = 1.3;
        g.beginPath(); g.arc(q[0], q[1], 3.4, 0, Math.PI * 2); g.stroke();
      } else {
        g.beginPath(); g.arc(q[0], q[1], 3.2, 0, Math.PI * 2); g.fill();
      }
    });

    g.fillStyle = col("ink-dim"); g.font = mono(9, 500); g.textAlign = "left";
    g.fillText("RADIUS = LOG YIELD, " + decades + " DECADES", 8, 12);
  }

  /* ------------------------------------------------------------------
     THE SWEEP — raw counts by angle, with counting error, plus the
     estimated background as a shaded floor.
     ------------------------------------------------------------------ */
  function sweepChart(cv, opt) {
    var P = prep(cv, opt.height || 250), g = P.g, W = P.w, H = P.h;
    var pad = { l: 56, r: 12, t: 14, b: 32 };
    var pw = Math.max(10, W - pad.l - pad.r), ph = Math.max(10, H - pad.t - pad.b);
    var obs = opt.observations || [];
    g.fillStyle = col("scope"); g.fillRect(0, 0, W, H);

    if (!obs.length) {
      g.fillStyle = col("muted"); g.font = mono(11); g.textAlign = "center";
      g.fillText("NO EXPOSURES YET", W / 2, H / 2);
      return;
    }
    var logY = opt.logY !== false;
    var maxV = 1;
    obs.forEach(function (o) { maxV = Math.max(maxV, o.raw, o.backgroundMean); });
    var yHi = logY ? Math.pow(10, Math.ceil(Math.log10(maxV)) + 0.15) : maxV * 1.15;
    var yLo = logY ? 0.5 : 0;

    function Y(v) {
      if (logY) {
        var vv = Math.max(v, yLo);
        return pad.t + ph - (Math.log10(vv) - Math.log10(yLo)) / (Math.log10(yHi) - Math.log10(yLo)) * ph;
      }
      return pad.t + ph - (v / yHi) * ph;
    }
    var bw = Math.min(34, pw / Math.max(1, obs.length) * 0.72);

    g.strokeStyle = col("scope-line"); g.lineWidth = 1; g.font = mono(9.5);
    var ticks = logY ? [] : [0, 0.25, 0.5, 0.75, 1];
    if (logY) {
      for (var e = 0; e <= Math.ceil(Math.log10(yHi)); e++) ticks.push(e);
      ticks.forEach(function (e) {
        var y = Y(Math.pow(10, e));
        g.globalAlpha = 0.5; g.beginPath(); g.moveTo(pad.l, y); g.lineTo(pad.l + pw, y); g.stroke();
        g.globalAlpha = 1; g.fillStyle = col("muted"); g.textAlign = "right";
        g.fillText(e === 0 ? "1" : "1e" + e, pad.l - 6, y + 3);
      });
    } else {
      ticks.forEach(function (t) {
        var y = pad.t + ph - t * ph;
        g.globalAlpha = 0.5; g.beginPath(); g.moveTo(pad.l, y); g.lineTo(pad.l + pw, y); g.stroke();
        g.globalAlpha = 1; g.fillStyle = col("muted"); g.textAlign = "right";
        g.fillText(Math.round(t * yHi), pad.l - 6, y + 3);
      });
    }

    obs.forEach(function (o, i) {
      var x = pad.l + (i + 0.5) * pw / obs.length;
      var yTop = Y(Math.max(o.raw, logY ? yLo : 0));
      var yBase = pad.t + ph;
      g.fillStyle = col("orange"); g.globalAlpha = 0.72;
      g.fillRect(x - bw / 2, yTop, bw, Math.max(0, yBase - yTop));
      g.globalAlpha = 1;

      /* the estimated background, drawn over the bar as a hatch floor */
      if (o.backgroundMean > 0) {
        var yb = Y(Math.max(o.backgroundMean, logY ? yLo : 0));
        g.strokeStyle = col("muted"); g.lineWidth = 1; g.setLineDash([2, 3]);
        g.beginPath(); g.moveTo(x - bw / 2, yb); g.lineTo(x + bw / 2, yb); g.stroke();
        g.setLineDash([]);
      }
      /* counting error on the raw total */
      var s = Math.sqrt(Math.max(0, o.raw));
      if (s > 0) {
        var t1 = Y(o.raw + s), t2 = Y(Math.max(o.raw - s, logY ? yLo : 0));
        g.strokeStyle = col("ink"); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x, t1); g.lineTo(x, t2); g.stroke();
        g.beginPath(); g.moveTo(x - 3, t1); g.lineTo(x + 3, t1); g.stroke();
      }
      g.fillStyle = col("muted"); g.font = mono(9); g.textAlign = "center";
      g.fillText(o.detAngleDeg + "°", x, yBase + 13);
      g.fillStyle = col("ink-dim"); g.font = mono(9, 500);
      g.fillText(String(o.raw), x, Math.max(pad.t + 8, yTop - 4));
    });

    g.fillStyle = col("ink-dim"); g.font = mono(9.5, 500); g.textAlign = "left";
    g.fillText("RAW COUNTS · DASH = ESTIMATED BACKGROUND", pad.l, pad.t - 3);
  }

  /* ------------------------------------------------------------------
     Plain-language summary of whatever the chart shows. Rendered next to
     every canvas, so nothing on this instrument exists only as pixels.
     ------------------------------------------------------------------ */
  function describeDistribution(obs, curvesInfo) {
    if (!obs.length) return "No observations yet. The curves show what each model predicts before any counting has been done.";
    var pts = obs.map(yieldOf).filter(Boolean);
    pts.sort(function (a, b) { return a.deg - b.deg; });
    var lo = pts[0], hi = pts[pts.length - 1];
    var lim = pts.filter(function (p) { return p.limit; }).length;
    var s = pts.length + " exposure" + (pts.length === 1 ? "" : "s") +
      " between " + lo.deg + "° and " + hi.deg + "°. ";
    var strongest = pts.slice().sort(function (a, b) { return b.y - a.y; })[0];
    s += "The largest yield is at " + strongest.deg + "° (" + strongest.raw + " raw counts). ";
    if (lim) s += lim + " point" + (lim === 1 ? " is" : "s are") +
      " consistent with background alone and is drawn as an upper limit rather than a measurement. ";
    if (hi.deg >= LARGE_ANGLE_DEG) {
      s += hi.limit
        ? "Nothing has yet been detected beyond " + LARGE_ANGLE_DEG + "° — which is not the same as nothing being there."
        : "There are counts beyond " + LARGE_ANGLE_DEG + "°, which the diffuse-charge model cannot produce at any exposure.";
    } else {
      s += "Nothing has been looked at beyond " + hi.deg + "°, so the region where the models differ most is still unexamined.";
    }
    return s;
  }

  return {
    prep: prep, distribution: distribution, polar: polar, sweepChart: sweepChart,
    yieldOf: yieldOf, describeDistribution: describeDistribution, col: col
  };
})();
