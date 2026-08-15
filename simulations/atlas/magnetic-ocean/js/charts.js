"use strict";
/* =====================================================================
   THE MAGNETIC OCEAN — charts.js

   All canvas drawing. Four scopes:

     plan       the chart table: bathymetric contours, the trackline,
                the ship and its towed fish, a distance scale
     profile    the magnetometer record: anomaly in nT against along-track
                distance in km, with the sounding trace beneath it
     workbench  observed against predicted, and the residual below
     reveal     the hidden crust, its age, and where the operator put the
                axis compared with where it is

   Two rules hold everywhere in this file:

   1. Colours come from Orbital tokens, read at draw time, and every
      scope is repainted on a theme change. There is not one hex here.
   2. Normal and reversed polarity are never distinguished by colour
      alone. Each carries a hatch direction, a letter and a label.
   ===================================================================== */

var Charts = (function () {

  /* ---- device-pixel-ratio-aware sizing ---------------------------- */
  function fit(canvas, cssHeight) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || canvas.parentNode.clientWidth || 640;
    var h = cssHeight;
    canvas.style.height = h + "px";
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function pal() {
    var c = Orbital.color;
    return {
      scope: c("scope"), grid: c("scope-line"),
      ink: c("ink"), dim: c("ink-dim"), muted: c("muted"),
      accent: c("orange"), teal: c("teal"), gold: c("gold"),
      oxide: c("oxide"), ok: c("ok"), danger: c("danger"),
      line: c("line"), panel: c("panel"), violet: c("violet"),
      info: c("info")
    };
  }

  function mono(px) { return (px || 10) + "px " + "IBM Plex Mono, ui-monospace, monospace"; }

  /* A scope face: dark instrument glass in both worlds, with a hairline
     grid. Keeps the six chart panels reading as one console. */
  function face(ctx, w, h, P, stepX, stepY) {
    ctx.fillStyle = P.scope;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = P.grid;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.85;
    var x, y;
    for (x = stepX; x < w; x += stepX) {
      ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, h); ctx.stroke();
    }
    for (y = stepY; y < h; y += stepY) {
      ctx.beginPath(); ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(w, Math.round(y) + .5); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* registration marks in the corners, the printer's crosshair */
  function regmarks(ctx, w, h, P) {
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.globalAlpha = .9;
    [[8, 8], [w - 8, 8], [8, h - 8], [w - 8, h - 8]].forEach(function (p) {
      ctx.beginPath();
      ctx.moveTo(p[0] - 5, p[1]); ctx.lineTo(p[0] + 5, p[1]);
      ctx.moveTo(p[0], p[1] - 5); ctx.lineTo(p[0], p[1] + 5);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  function label(ctx, text, x, y, colour, size, align) {
    ctx.fillStyle = colour; ctx.font = mono(size || 9.5);
    ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
    ctx.textAlign = "left";
  }

  /* Diagonal hatching. The direction is the whole point: normal crust is
     hatched one way and reversed the other, so the two are separable in
     greyscale. */
  function hatch(ctx, x0, y0, x1, y1, colour, dir, gap) {
    gap = gap || 5;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    ctx.strokeStyle = colour; ctx.lineWidth = 1; ctx.globalAlpha = .85;
    var h = y1 - y0, start = x0 - h, end = x1 + h;
    for (var x = start; x < end; x += gap) {
      ctx.beginPath();
      if (dir > 0) { ctx.moveTo(x, y1); ctx.lineTo(x + h, y0); }
      else { ctx.moveTo(x, y0); ctx.lineTo(x + h, y1); }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ==================================================================
     1. PLAN VIEW — the chart table
     =============================================================== */
  function drawPlan(canvas, S) {
    var g = fit(canvas, canvas.dataset.h ? +canvas.dataset.h : 210);
    var ctx = g.ctx, w = g.w, h = g.h, P = pal();
    face(ctx, w, h, P, 34, 34);

    var padL = 34, padR = 12, padT = 10, padB = 26;
    var view = S.planView;               /* {x0,x1,y0,y1} in km */
    var sx = function (x) { return padL + (x - view.x0) / (view.x1 - view.x0) * (w - padL - padR); };
    var sy = function (y) { return padT + (view.y1 - y) / (view.y1 - view.y0) * (h - padT - padB); };

    /* --- bathymetric contours ------------------------------------
       Drawn from the depth-age relation, sounded along the tracks the
       ship has actually run and interpolated between them. It shows a
       rise. It does not show a spreading rate, a polarity or an age. */
    if (S.sounded) {
      var levels = [2.6, 2.8, 3.0, 3.2, 3.4];
      ctx.lineWidth = 1;
      for (var li = 0; li < levels.length; li++) {
        var d = levels[li];
        ctx.strokeStyle = P.grid; ctx.globalAlpha = .95;
        ctx.beginPath();
        var started = false;
        for (var px = padL; px <= w - padR; px += 3) {
          var kx = view.x0 + (px - padL) / (w - padL - padR) * (view.x1 - view.x0);
          var depth = MagOcean.bathymetryKm(kx, S.world);
          /* contour crossing: draw the level where the modelled depth
             passes it, wobbled a little so the chart does not look
             machined */
          if (Math.abs(depth - d) < 0.055) {
            var jitter = Math.sin(kx * 0.7 + li * 2.1) * 4;
            if (!started) { ctx.moveTo(px, padT + jitter); started = true; }
            ctx.lineTo(px, padT + jitter);
            ctx.moveTo(px, h - padB + jitter);
            ctx.lineTo(px, h - padB + jitter);
            /* vertical contour: the ridge runs north-south */
            ctx.moveTo(px + jitter, padT); ctx.lineTo(px + jitter * 1.3, h - padB);
          }
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      label(ctx, "ECHO SOUNDER — CONTOURS AT 200 m", padL + 4, padT + 12, P.muted, 8.5);
    } else {
      label(ctx, "SOUNDER OFF — NO BATHYMETRY YET", padL + 4, padT + 12, P.muted, 8.5);
    }

    /* --- completed tracklines ------------------------------------- */
    for (var t = 0; t < S.transects.length; t++) {
      var tr = S.transects[t];
      ctx.strokeStyle = P.dim; ctx.lineWidth = 1.4; ctx.globalAlpha = .8;
      ctx.beginPath();
      ctx.moveTo(sx(tr.x[0]), sy(tr.chartY[0]));
      ctx.lineTo(sx(tr.x[tr.n - 1]), sy(tr.chartY[tr.n - 1]));
      ctx.stroke();
      ctx.globalAlpha = 1;
      label(ctx, "L" + (t + 1), sx(tr.x[0]) + 3, sy(tr.chartY[0]) - 4, P.dim, 9);
    }

    /* --- the line being run --------------------------------------- */
    var a = S.active;
    if (a) {
      ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sx(a.x[0]), sy(a.chartY[0]));
      ctx.lineTo(sx(a.x[a.n - 1]), sy(a.chartY[a.n - 1]));
      ctx.stroke(); ctx.setLineDash([]);

      var k = Math.max(0, Math.min(a.n - 1, S.cursor));
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx(a.x[0]), sy(a.chartY[0]));
      ctx.lineTo(sx(a.x[k]), sy(a.chartY[k]));
      ctx.stroke();

      /* the ship, and the fish on its tow cable behind it */
      var shipX = sx(a.x[k]), shipY = sy(a.chartY[k]);
      var back = Math.max(0, k - Math.round(3 / (a.survey.sampleSpacingKm || 1)));
      var fishX = sx(a.x[back]), fishY = sy(a.chartY[back]);
      ctx.strokeStyle = P.gold; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(shipX, shipY); ctx.lineTo(fishX, fishY); ctx.stroke();
      ctx.fillStyle = P.gold;
      ctx.beginPath(); ctx.arc(fishX, fishY, 2.6, 0, 6.283); ctx.fill();
      ctx.fillStyle = P.accent;
      ctx.beginPath();
      ctx.moveTo(shipX, shipY - 5); ctx.lineTo(shipX + 4, shipY + 4);
      ctx.lineTo(shipX - 4, shipY + 4); ctx.closePath(); ctx.fill();
    }

    /* --- the truth, only after the reveal -------------------------- */
    if (S.revealed) {
      ctx.strokeStyle = P.oxide; ctx.lineWidth = 1.6; ctx.setLineDash([7, 4]);
      ctx.beginPath(); ctx.moveTo(sx(S.world.ridgeAxisKm), padT); ctx.lineTo(sx(S.world.ridgeAxisKm), h - padB); ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, "TRUE AXIS", sx(S.world.ridgeAxisKm) + 4, padT + 24, P.oxide, 9);
    }
    if (S.claimAxis !== null && S.claimAxis !== undefined) {
      ctx.strokeStyle = P.teal; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(sx(S.claimAxis), padT); ctx.lineTo(sx(S.claimAxis), h - padB); ctx.stroke();
      label(ctx, "YOUR AXIS", sx(S.claimAxis) + 4, h - padB - 6, P.teal, 9);
    }

    /* --- scale and axis ------------------------------------------- */
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, h - padB + .5); ctx.lineTo(w - padR, h - padB + .5); ctx.stroke();
    var tick = niceStep((view.x1 - view.x0) / 6);
    for (var xv = Math.ceil(view.x0 / tick) * tick; xv <= view.x1; xv += tick) {
      var px2 = sx(xv);
      ctx.beginPath(); ctx.moveTo(px2, h - padB); ctx.lineTo(px2, h - padB + 4); ctx.stroke();
      label(ctx, String(Math.round(xv)), px2, h - padB + 15, P.muted, 9, "center");
    }
    label(ctx, "CHART EAST, km", w - padR, h - 5, P.muted, 8.5, "right");
    regmarks(ctx, w, h, P);
  }

  function niceStep(raw) {
    var pow = Math.pow(10, Math.floor(Math.log(Math.max(raw, 1e-6)) / Math.LN10));
    var n = raw / pow;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
  }

  /* ==================================================================
     2. THE MAGNETOMETER RECORD
     =============================================================== */
  function drawProfile(canvas, S) {
    var g = fit(canvas, canvas.dataset.h ? +canvas.dataset.h : 260);
    var ctx = g.ctx, w = g.w, h = g.h, P = pal();
    face(ctx, w, h, P, 40, 26);

    var padL = 46, padR = 12, padT = 12, padB = 46;
    var bathH = 40;
    var plotB = h - padB - bathH;

    var tr = S.active || S.transects[S.viewTransect] || null;
    if (!tr) {
      label(ctx, "NO LINE RUN YET", w / 2, h / 2, P.muted, 11, "center");
      regmarks(ctx, w, h, P);
      return;
    }
    var upto = S.active ? Math.max(1, Math.min(tr.n, S.cursor + 1)) : tr.n;

    /* --- vertical scale from what has been collected so far -------- */
    var lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < upto; i++) {
      if (tr.missing[i]) continue;
      if (tr.values[i] < lo) lo = tr.values[i];
      if (tr.values[i] > hi) hi = tr.values[i];
    }
    if (!isFinite(lo)) { lo = -100; hi = 100; }
    var padY = Math.max(20, (hi - lo) * 0.12);
    lo -= padY; hi += padY;
    if (S.fixedScale) { lo = S.fixedScale[0]; hi = S.fixedScale[1]; }

    var sLen = tr.s[tr.n - 1] || 1;
    var sx = function (s) { return padL + s / sLen * (w - padL - padR); };
    var sy = function (v) { return padT + (hi - v) / (hi - lo) * (plotB - padT); };

    /* --- axes ------------------------------------------------------ */
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    var vt = niceStep((hi - lo) / 5);
    for (var v = Math.ceil(lo / vt) * vt; v <= hi; v += vt) {
      var py = sy(v);
      ctx.globalAlpha = (Math.abs(v) < 1e-9) ? .9 : .45;
      ctx.beginPath(); ctx.moveTo(padL, py + .5); ctx.lineTo(w - padR, py + .5); ctx.stroke();
      ctx.globalAlpha = 1;
      label(ctx, String(Math.round(v)), padL - 5, py + 3, P.muted, 9, "right");
    }
    label(ctx, "nT", 6, padT + 8, P.dim, 9);

    var ht = niceStep(sLen / 7);
    for (var sv = 0; sv <= sLen; sv += ht) {
      var px = sx(sv);
      ctx.strokeStyle = P.grid; ctx.globalAlpha = .4;
      ctx.beginPath(); ctx.moveTo(px + .5, padT); ctx.lineTo(px + .5, plotB); ctx.stroke();
      ctx.globalAlpha = 1;
      label(ctx, String(Math.round(sv)), px, h - 6, P.muted, 9, "center");
    }
    label(ctx, "ALONG-TRACK, km", padL, h - 20, P.muted, 8.5);

    /* --- station marks: one tick per observation ------------------- */
    ctx.strokeStyle = P.grid; ctx.globalAlpha = .5;
    var everyN = Math.max(1, Math.round(tr.n / 90));
    for (i = 0; i < upto; i += everyN) {
      ctx.beginPath(); ctx.moveTo(sx(tr.s[i]), plotB - 3); ctx.lineTo(sx(tr.s[i]), plotB); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* --- the trace, broken at every lost reading ------------------- */
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.6;
    ctx.beginPath();
    var pen = false;
    for (i = 0; i < upto; i++) {
      if (tr.missing[i]) { pen = false; continue; }
      var X = sx(tr.s[i]), Y = sy(tr.values[i]);
      if (!pen) { ctx.moveTo(X, Y); pen = true; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    /* gaps marked as gaps, never bridged and never zeroed */
    ctx.strokeStyle = P.danger; ctx.lineWidth = 1; ctx.globalAlpha = .8;
    for (i = 0; i < upto; i++) {
      if (!tr.missing[i]) continue;
      var gx = sx(tr.s[i]);
      ctx.beginPath(); ctx.moveTo(gx, padT + 2); ctx.lineTo(gx, plotB - 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* --- the sounding trace beneath, aligned to the same axis ------ */
    var bTop = plotB + 8, bBot = h - padB + 4;
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, bTop - 3); ctx.lineTo(w - padR, bTop - 3); ctx.stroke();
    if (S.sounded) {
      ctx.strokeStyle = P.teal; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (i = 0; i < upto; i++) {
        var dep = MagOcean.bathymetryKm(tr.x[i], S.world);
        var by = bTop + (dep - 2.4) / 1.3 * (bBot - bTop);
        if (i === 0) ctx.moveTo(sx(tr.s[i]), by); else ctx.lineTo(sx(tr.s[i]), by);
      }
      ctx.stroke();
      label(ctx, "SOUNDING 2.4–3.7 km", padL + 3, bBot - 2, P.muted, 8);
    }

    /* --- cursor ---------------------------------------------------- */
    if (S.hoverIndex !== null && S.hoverIndex !== undefined && S.hoverIndex < upto) {
      var hx = sx(tr.s[S.hoverIndex]);
      ctx.strokeStyle = P.gold; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, bBot); ctx.stroke();
      if (!tr.missing[S.hoverIndex]) {
        ctx.fillStyle = P.gold;
        ctx.beginPath(); ctx.arc(hx, sy(tr.values[S.hoverIndex]), 3, 0, 6.283); ctx.fill();
      }
    }
    regmarks(ctx, w, h, P);
  }

  /* ==================================================================
     3. THE INTERPRETATION WORKBENCH
     =============================================================== */
  function drawWorkbench(canvas, S) {
    var g = fit(canvas, canvas.dataset.h ? +canvas.dataset.h : 300);
    var ctx = g.ctx, w = g.w, h = g.h, P = pal();
    face(ctx, w, h, P, 40, 26);

    var padL = 46, padR = 12, padT = 12, padB = 30;
    var split = Math.round((h - padT - padB) * 0.62) + padT;
    var resTop = split + 16, resBot = h - padB;

    var D = S.fitData;
    if (!D || !D.pred) {
      label(ctx, "SET AN AXIS AND A RATE TO SEE A PREDICTION", w / 2, h / 2, P.muted, 10.5, "center");
      regmarks(ctx, w, h, P);
      return;
    }

    var xs = D.x, obs = D.y, pred = D.pred, msk = D.w;
    var xmin = Infinity, xmax = -Infinity, lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < xs.length; i++) {
      if (!msk[i]) continue;
      if (xs[i] < xmin) xmin = xs[i]; if (xs[i] > xmax) xmax = xs[i];
      if (obs[i] < lo) lo = obs[i]; if (obs[i] > hi) hi = obs[i];
      if (pred[i] < lo) lo = pred[i]; if (pred[i] > hi) hi = pred[i];
    }
    var padV = Math.max(20, (hi - lo) * .1); lo -= padV; hi += padV;
    var sx = function (x) { return padL + (x - xmin) / (xmax - xmin) * (w - padL - padR); };
    var sy = function (v) { return padT + (hi - v) / (hi - lo) * (split - padT); };

    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    var vt = niceStep((hi - lo) / 4);
    for (var v = Math.ceil(lo / vt) * vt; v <= hi; v += vt) {
      var py = sy(v);
      ctx.globalAlpha = .4; ctx.beginPath(); ctx.moveTo(padL, py + .5); ctx.lineTo(w - padR, py + .5); ctx.stroke();
      ctx.globalAlpha = 1;
      label(ctx, String(Math.round(v)), padL - 5, py + 3, P.muted, 9, "right");
    }

    /* observed */
    ctx.strokeStyle = P.accent; ctx.lineWidth = 1.5;
    strokeSeries(ctx, xs, obs, msk, sx, sy);
    /* predicted */
    ctx.strokeStyle = P.teal; ctx.lineWidth = 1.4; ctx.setLineDash([6, 4]);
    strokeSeries(ctx, xs, pred, msk, sx, sy);
    ctx.setLineDash([]);

    /* the candidate axis and its polarity boundaries, as tick marks on
       the top edge — the model's claim about where the boundaries are */
    if (D.boundaries) {
      ctx.strokeStyle = P.violet; ctx.lineWidth = 1; ctx.globalAlpha = .85;
      for (i = 0; i < D.boundaries.length; i++) {
        var bxp = sx(D.boundaries[i]);
        if (bxp < padL || bxp > w - padR) continue;
        ctx.beginPath(); ctx.moveTo(bxp, padT); ctx.lineTo(bxp, padT + 7); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (D.axisKm !== undefined) {
      var ax = sx(D.axisKm);
      if (ax >= padL && ax <= w - padR) {
        ctx.strokeStyle = P.gold; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(ax, padT); ctx.lineTo(ax, split); ctx.stroke();
        label(ctx, "AXIS", ax + 3, padT + 22, P.gold, 8.5);
      }
    }

    /* --- residual -------------------------------------------------- */
    var rlo = 0, rhi = 0;
    for (i = 0; i < xs.length; i++) {
      if (!msk[i]) continue;
      var r = obs[i] - pred[i];
      if (r < rlo) rlo = r; if (r > rhi) rhi = r;
    }
    var m = Math.max(Math.abs(rlo), Math.abs(rhi), 1) * 1.15;
    var ry = function (val) { return (resTop + resBot) / 2 - val / m * (resBot - resTop) / 2; };

    ctx.strokeStyle = P.grid; ctx.lineWidth = 1; ctx.globalAlpha = .8;
    ctx.beginPath(); ctx.moveTo(padL, ry(0) + .5); ctx.lineTo(w - padR, ry(0) + .5); ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = P.oxide; ctx.lineWidth = 1.1;
    ctx.beginPath();
    var pen = false;
    for (i = 0; i < xs.length; i++) {
      if (!msk[i]) { pen = false; continue; }
      var X = sx(xs[i]), Y = ry(obs[i] - pred[i]);
      if (!pen) { ctx.moveTo(X, Y); pen = true; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();

    /* the noise band the operator set, so "is this residual structure or
       is it the instrument" is answerable by looking */
    if (S.noiseBand) {
      ctx.fillStyle = P.ok; ctx.globalAlpha = .12;
      ctx.fillRect(padL, ry(S.noiseBand), w - padL - padR, ry(-S.noiseBand) - ry(S.noiseBand));
      ctx.globalAlpha = 1;
      label(ctx, "±1σ INSTRUMENT NOISE", w - padR - 3, resTop + 10, P.muted, 8, "right");
    }
    label(ctx, "RESIDUAL, nT", padL, resTop + 10, P.muted, 8.5);
    label(ctx, "RIDGE-NORMAL DISTANCE, km", padL, h - 8, P.muted, 8.5);

    var ht = niceStep((xmax - xmin) / 7);
    for (var xv = Math.ceil(xmin / ht) * ht; xv <= xmax; xv += ht) {
      label(ctx, String(Math.round(xv)), sx(xv), h - 20, P.muted, 9, "center");
    }
    regmarks(ctx, w, h, P);
  }

  function strokeSeries(ctx, xs, ys, msk, sx, sy) {
    ctx.beginPath();
    var pen = false;
    for (var i = 0; i < xs.length; i++) {
      if (!msk[i]) { pen = false; continue; }
      var X = sx(xs[i]), Y = sy(ys[i]);
      if (!pen) { ctx.moveTo(X, Y); pen = true; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();
  }

  /* ==================================================================
     4. THE REVEAL — the hidden crust
     =============================================================== */
  function drawReveal(canvas, S) {
    var g = fit(canvas, canvas.dataset.h ? +canvas.dataset.h : 320);
    var ctx = g.ctx, w = g.w, h = g.h, P = pal();
    face(ctx, w, h, P, 40, 30);

    var padL = 46, padR = 12, padT = 10, padB = 30;
    var W = S.world;
    var view = S.revealView;
    var sx = function (x) { return padL + (x - view.x0) / (view.x1 - view.x0) * (w - padL - padR); };

    var traceTop = padT, traceBot = padT + Math.round((h - padT - padB) * 0.40);
    var crustTop = traceBot + 22, crustBot = crustTop + 46;
    var ageTop = crustBot + 16, ageBot = h - padB;

    /* --- the two profiles: what was observed, and what the true world
       actually produces without any instrument in the way ---------- */
    var tr = S.transects[S.viewTransect] || S.transects[0];
    if (tr) {
      var lo = Infinity, hi = -Infinity, i;
      for (i = 0; i < tr.n; i++) {
        if (tr.missing[i]) continue;
        if (tr.values[i] < lo) lo = tr.values[i];
        if (tr.values[i] > hi) hi = tr.values[i];
        if (tr.cleanTrue[i] < lo) lo = tr.cleanTrue[i];
        if (tr.cleanTrue[i] > hi) hi = tr.cleanTrue[i];
      }
      var pv = Math.max(20, (hi - lo) * .1); lo -= pv; hi += pv;
      var sy = function (v) { return traceTop + (hi - v) / (hi - lo) * (traceBot - traceTop); };
      var msk = new Uint8Array(tr.n);
      for (i = 0; i < tr.n; i++) msk[i] = tr.missing[i] ? 0 : 1;

      ctx.strokeStyle = P.accent; ctx.lineWidth = 1.5;
      strokeSeries(ctx, tr.x, tr.values, msk, sx, sy);
      ctx.strokeStyle = P.gold; ctx.lineWidth = 1.1; ctx.setLineDash([5, 3]);
      strokeSeries(ctx, tr.x, tr.cleanTrue, msk, sx, sy);
      ctx.setLineDash([]);
      label(ctx, "OBSERVED", padL + 3, traceTop + 10, P.accent, 8.5);
      label(ctx, "CRUSTAL SIGNAL ALONE, NO NOISE OR TREND", padL + 62, traceTop + 10, P.gold, 8.5);
    }

    /* --- the crust ------------------------------------------------- */
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    ctx.strokeRect(padL + .5, crustTop + .5, w - padL - padR - 1, crustBot - crustTop - 1);
    for (var b = 0; b < W.blocks.length; b++) {
      var bl = W.blocks[b];
      var x0 = Math.max(padL, sx(bl.x1)), x1 = Math.min(w - padR, sx(bl.x2));
      if (x1 <= x0 || bl.J === 0) continue;
      var normal = bl.J > 0;
      var col = normal ? P.teal : P.oxide;
      ctx.fillStyle = col; ctx.globalAlpha = normal ? .22 : .13;
      ctx.fillRect(x0, crustTop, x1 - x0, crustBot - crustTop);
      ctx.globalAlpha = 1;
      hatch(ctx, x0, crustTop, x1, crustBot, col, normal ? 1 : -1, normal ? 5 : 7);
      ctx.strokeStyle = P.grid; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(x0 + .5, crustTop); ctx.lineTo(x0 + .5, crustBot); ctx.stroke();
      if (x1 - x0 > 13) {
        label(ctx, normal ? "N" : "R", (x0 + x1) / 2, crustTop + 15, col, 10, "center");
      }
    }
    label(ctx, "MAGNETISED CRUST — N NORMAL / R REVERSED", padL + 3, crustTop - 5, P.muted, 8.5);

    /* --- age ------------------------------------------------------- */
    var maxAge = W.chronology.spanMa;
    ctx.strokeStyle = P.violet; ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (var px = padL; px <= w - padR; px += 2) {
      var kx = view.x0 + (px - padL) / (w - padL - padR) * (view.x1 - view.x0);
      var age = Math.min(MagOcean.ageAtPosition(kx, W), maxAge);
      var y = ageBot - (age / maxAge) * (ageBot - ageTop);
      if (px === padL) ctx.moveTo(px, y); else ctx.lineTo(px, y);
    }
    ctx.stroke();
    label(ctx, "CRUSTAL AGE, 0 to " + maxAge.toFixed(2) + " Ma", padL + 3, ageTop + 9, P.violet, 8.5);

    /* --- axes: true and claimed ------------------------------------ */
    ctx.strokeStyle = P.oxide; ctx.lineWidth = 1.6; ctx.setLineDash([7, 4]);
    ctx.beginPath(); ctx.moveTo(sx(W.ridgeAxisKm), traceTop); ctx.lineTo(sx(W.ridgeAxisKm), ageBot); ctx.stroke();
    ctx.setLineDash([]);
    label(ctx, "TRUE AXIS " + W.ridgeAxisKm.toFixed(1) + " km", sx(W.ridgeAxisKm) + 4, crustBot + 12, P.oxide, 9);

    if (S.claimAxis !== null && S.claimAxis !== undefined) {
      ctx.strokeStyle = P.teal; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(sx(S.claimAxis), traceTop); ctx.lineTo(sx(S.claimAxis), ageBot); ctx.stroke();
      label(ctx, "YOURS " + S.claimAxis.toFixed(1), sx(S.claimAxis) + 4, crustBot + 24, P.teal, 9);
    }

    var ht = niceStep((view.x1 - view.x0) / 7);
    for (var xv = Math.ceil(view.x0 / ht) * ht; xv <= view.x1; xv += ht) {
      label(ctx, String(Math.round(xv)), sx(xv), h - 8, P.muted, 9, "center");
    }
    label(ctx, "RIDGE-NORMAL DISTANCE, km", padL, h - 20, P.muted, 8.5);
    regmarks(ctx, w, h, P);
  }

  return {
    fit: fit, pal: pal, niceStep: niceStep,
    drawPlan: drawPlan, drawProfile: drawProfile,
    drawWorkbench: drawWorkbench, drawReveal: drawReveal
  };
})();
