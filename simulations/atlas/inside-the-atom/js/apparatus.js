"use strict";
/* =====================================================================
   INSIDE THE ATOM — apparatus.js

   The bench, drawn in plan. Source and lead shield on the left, a
   diaphragm cutting a narrow pencil, the foil at the centre of a
   graduated circle, and the screen-and-microscope assembly swinging
   around it.

   ---------------------------------------------------------------------
   WHAT IS AND IS NOT REAL HERE

   The trajectories are the simulation showing its own working. Geiger
   and Marsden could not see a single alpha particle in flight and
   neither could anyone else; what they saw was a flash of light on a
   zinc-sulphide screen, one particle at a time, in a darkened room after
   half an hour of getting their eyes in. The paths drawn here are drawn
   from the same laws that produce the counts, but they are an
   illustration, and the instrument says so on the view itself.

   The geometry is schematic. The 1913 apparatus had the source 2.5 cm
   from the foil and the screen moving on a circle of 1.6 cm radius, in
   an evacuated brass box; none of those dimensions is reproduced, and
   none of them would change a single count in this model, which depends
   on the foil only through n·t and on the detector only through its
   angle and solid angle.

   ---------------------------------------------------------------------
   FLASH SAFETY

   A scintillation mark fades over 900 ms and no new one is started
   within 400 ms of the last, so the view can never present more than
   two and a half transitions a second — comfortably below the three-per
   -second threshold for photosensitivity. Under reduced motion nothing
   animates at all: the paths are drawn once, statically, and the marks
   accumulate without fading.
   ===================================================================== */

var Apparatus = (function () {

  function col(n) { return Orbital.color(n); }
  var RADIUS_FRAC = 0.40;

  /* The animation picks which sampled path to launch next. That choice
     changes nothing that is measured or exported, but it still runs off
     a seeded generator rather than Math.random, so that "nothing in this
     instrument is unseeded" stays literally true. */
  var dice = new Atom.RNG(0x5C1);

  /* Live animation state, kept out of the model. */
  var anim = {
    flying: [],        /* particles currently in flight */
    marks: [],         /* scintillation marks on the screen */
    lastFlash: 0,
    spawnAcc: 0,
    running: false
  };

  function reset() { anim.flying = []; anim.marks = []; anim.lastFlash = 0; anim.spawnAcc = 0; }

  function reduced() {
    return document.documentElement.classList.contains("rf-paused") ||
      (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* ------------------------------------------------------------------
     Layout, recomputed each frame so the view is fully responsive.
     ------------------------------------------------------------------ */
  function layout(W, H) {
    var cx = W * 0.48, cy = H * 0.55;
    var R = Math.min(W * RADIUS_FRAC, H * 0.42);
    return { cx: cx, cy: cy, R: R, srcX: cx - R - 46, slitX: cx - R * 0.55 };
  }

  /* Detector centre for an angle in degrees. 0° is straight ahead
     (to the right, the way the beam is travelling); 180° is straight
     back toward the source. The detector is drawn in the upper half. */
  function detPos(L, deg) {
    var a = deg * Math.PI / 180;
    return { x: L.cx + L.R * Math.cos(a), y: L.cy - L.R * Math.sin(a), a: a };
  }

  /* ------------------------------------------------------------------
     DRAW
     ------------------------------------------------------------------ */
  function draw(cv, st) {
    var P = Charts.prep(cv, st.height || 380), g = P.g, W = P.w, H = P.h;
    var L = layout(W, H);
    var ink = col("ink"), dim = col("ink-dim"), muted = col("muted");
    var lineC = col("scope-line"), gold = col("gold"), accent = col("orange");

    g.fillStyle = col("scope"); g.fillRect(0, 0, W, H);

    /* ---- graduated circle ---- */
    g.strokeStyle = lineC; g.lineWidth = 1; g.globalAlpha = 0.85;
    g.beginPath(); g.arc(L.cx, L.cy, L.R, -Math.PI, 0); g.stroke();
    g.globalAlpha = 0.35;
    g.beginPath(); g.arc(L.cx, L.cy, L.R, 0, Math.PI); g.stroke();
    g.globalAlpha = 1;

    g.font = "500 9px IBM Plex Mono, monospace";
    for (var d = 0; d <= 180; d += 5) {
      var a = d * Math.PI / 180;
      var major = (d % 30 === 0), mid = (d % 15 === 0);
      var len = major ? 9 : (mid ? 6 : 3);
      var x1 = L.cx + (L.R - len) * Math.cos(a), y1 = L.cy - (L.R - len) * Math.sin(a);
      var x2 = L.cx + L.R * Math.cos(a), y2 = L.cy - L.R * Math.sin(a);
      g.strokeStyle = major ? dim : lineC; g.lineWidth = major ? 1.3 : 1;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      if (major) {
        var lx = L.cx + (L.R + 15) * Math.cos(a), ly = L.cy - (L.R + 15) * Math.sin(a);
        g.fillStyle = muted;
        g.textAlign = d === 0 ? "left" : (d === 180 ? "right" : "center");
        g.fillText(d + "°", lx, ly + 3);
      }
    }

    /* ---- source, shield and slit ---- */
    /* lead shield */
    g.fillStyle = col("panel3"); g.strokeStyle = dim; g.lineWidth = 1;
    g.beginPath(); g.rect(L.srcX - 16, L.cy - 34, 40, 68); g.fill(); g.stroke();
    /* the emanation tube inside it */
    g.fillStyle = gold; g.globalAlpha = 0.85;
    g.beginPath();
    g.moveTo(L.srcX - 8, L.cy - 8); g.lineTo(L.srcX + 16, L.cy - 2.5);
    g.lineTo(L.srcX + 16, L.cy + 2.5); g.lineTo(L.srcX - 8, L.cy + 8);
    g.closePath(); g.fill(); g.globalAlpha = 1;
    g.fillStyle = muted; g.textAlign = "center"; g.font = "500 8.5px IBM Plex Mono, monospace";
    g.fillText("SOURCE", L.srcX + 4, L.cy - 40);
    g.fillText("LEAD", L.srcX + 4, L.cy + 46);

    /* collimating diaphragm */
    var slitH = 4 + (st.beamSpread || 0) * 2.2;
    g.fillStyle = col("panel3"); g.strokeStyle = dim;
    g.beginPath(); g.rect(L.slitX - 5, L.cy - 30, 10, 30 - slitH); g.fill(); g.stroke();
    g.beginPath(); g.rect(L.slitX - 5, L.cy + slitH, 10, 30 - slitH); g.fill(); g.stroke();
    g.fillStyle = muted; g.textAlign = "center";
    g.fillText("SLIT", L.slitX, L.cy - 36);

    /* ---- the incident beam ---- */
    var spread = (st.beamSpread || 0) * Math.PI / 180;
    g.fillStyle = gold; g.globalAlpha = 0.16;
    g.beginPath();
    g.moveTo(L.srcX + 14, L.cy - 1.5); g.lineTo(L.cx, L.cy - slitH - L.R * Math.tan(spread));
    g.lineTo(L.cx, L.cy + slitH + L.R * Math.tan(spread)); g.lineTo(L.srcX + 14, L.cy + 1.5);
    g.closePath(); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = gold; g.lineWidth = 1.4; g.globalAlpha = 0.9;
    g.beginPath(); g.moveTo(L.srcX + 14, L.cy); g.lineTo(L.cx - 3, L.cy); g.stroke();
    g.globalAlpha = 1;

    /* ---- the foil ---- */
    var foilH = Math.min(L.R * 0.62, 96);
    g.strokeStyle = col("teal"); g.lineWidth = 3.4;
    g.beginPath(); g.moveTo(L.cx, L.cy - foilH / 2); g.lineTo(L.cx, L.cy + foilH / 2); g.stroke();
    g.strokeStyle = col("teal"); g.lineWidth = 1; g.globalAlpha = 0.4;
    g.beginPath(); g.moveTo(L.cx - 3, L.cy - foilH / 2); g.lineTo(L.cx - 3, L.cy + foilH / 2); g.stroke();
    g.beginPath(); g.moveTo(L.cx + 3, L.cy - foilH / 2); g.lineTo(L.cx + 3, L.cy + foilH / 2); g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = col("teal"); g.textAlign = "center"; g.font = "600 9px IBM Plex Mono, monospace";
    g.fillText(st.targetName.toUpperCase() + " · " + st.thicknessNm + " nm", L.cx, L.cy + foilH / 2 + 15);

    /* ---- the detector aperture wedge ---- */
    var dp = detPos(L, st.detAngle);
    var rho = (st.detWidth || 5) * Math.PI / 180;
    g.fillStyle = accent; g.globalAlpha = 0.13;
    g.beginPath(); g.moveTo(L.cx, L.cy);
    g.arc(L.cx, L.cy, L.R + 6, -(dp.a + rho), -(dp.a - rho));
    g.closePath(); g.fill(); g.globalAlpha = 1;

    /* ---- the screen and microscope ---- */
    g.save();
    g.translate(dp.x, dp.y); g.rotate(-dp.a);
    /* zinc-sulphide screen, face toward the foil */
    g.fillStyle = col("panel"); g.strokeStyle = accent; g.lineWidth = 1.6;
    g.beginPath(); g.rect(-6, -13, 7, 26); g.fill(); g.stroke();
    /* microscope barrel */
    g.fillStyle = col("panel3"); g.strokeStyle = dim; g.lineWidth = 1;
    g.beginPath(); g.rect(1, -7, 26, 14); g.fill(); g.stroke();
    g.beginPath(); g.rect(27, -4.5, 9, 9); g.fill(); g.stroke();

    /* scintillation marks, on the screen face */
    var now = st.now || 0;
    for (var mI = 0; mI < anim.marks.length; mI++) {
      var mk = anim.marks[mI];
      var age = now - mk.t;
      var life = reduced() ? 1 : Math.max(0, 1 - age / 900);
      if (life <= 0) continue;
      g.globalAlpha = reduced() ? 0.55 : (0.25 + 0.75 * life);
      g.fillStyle = col("amber");
      g.beginPath(); g.arc(-2.5, mk.y * 11, reduced() ? 1.6 : (1.6 + 2.6 * life), 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    g.restore();

    g.fillStyle = accent; g.textAlign = "center"; g.font = "600 9px IBM Plex Mono, monospace";
    var lx2 = L.cx + (L.R + 34) * Math.cos(dp.a), ly2 = L.cy - (L.R + 34) * Math.sin(dp.a);
    g.fillText(st.detAngle + "° ±" + st.detWidth + "°", lx2, ly2 + 3);

    /* ---- trajectories ---- */
    drawTrajectories(g, L, st, foilH);

    /* ---- captions ---- */
    g.fillStyle = muted; g.font = "500 9px IBM Plex Mono, monospace"; g.textAlign = "left";
    g.fillText("PLAN VIEW · SCHEMATIC, NOT TO SCALE", 10, 14);
    g.textAlign = "right";
    g.fillText("PATHS ARE SIMULATED, NOT OBSERVED", W - 10, 14);
    if (reduced()) {
      g.textAlign = "left"; g.fillStyle = col("info");
      g.fillText("REDUCED MOTION · STATIC SAMPLE", 10, H - 8);
    }
  }

  /* ------------------------------------------------------------------
     Trajectories. In reduced-motion mode the whole sampled set is drawn
     at once as static paths; otherwise particles are animated along
     them and the set is redrawn only as they arrive.
     ------------------------------------------------------------------ */
  function drawTrajectories(g, L, st, foilH) {
    var paths = st.paths || [];
    if (!paths.length) return;
    var gold = col("gold"), accent = col("orange"), okc = col("ok");

    if (reduced()) {
      for (var i = 0; i < paths.length; i++) {
        var p = paths[i];
        var yIn = L.cy + p.entry * foilH * 0.6;
        g.strokeStyle = Math.abs(p.deg) >= LARGE_ANGLE_DEG ? accent : gold;
        g.globalAlpha = Math.abs(p.deg) >= LARGE_ANGLE_DEG ? 0.85 : 0.24;
        g.lineWidth = Math.abs(p.deg) >= LARGE_ANGLE_DEG ? 1.5 : 0.9;
        g.beginPath();
        g.moveTo(L.srcX + 14, L.cy);
        g.lineTo(L.cx, yIn);
        g.lineTo(L.cx + L.R * Math.cos(p.plane), yIn - L.R * Math.sin(p.plane));
        g.stroke();
      }
      g.globalAlpha = 1;
      return;
    }

    for (var j = 0; j < anim.flying.length; j++) {
      var f = anim.flying[j];
      var yIn = L.cy + f.entry * foilH * 0.6;
      var big = Math.abs(f.deg) >= LARGE_ANGLE_DEG;
      g.strokeStyle = big ? accent : gold;
      g.globalAlpha = big ? 0.95 : 0.5;
      g.lineWidth = big ? 1.6 : 1;
      g.beginPath();
      if (f.t <= 1) {
        /* still on its way in */
        var x = L.srcX + 14 + (L.cx - L.srcX - 14) * f.t;
        var y = L.cy + (yIn - L.cy) * f.t;
        g.moveTo(Math.max(L.srcX + 14, x - 26), L.cy + (yIn - L.cy) * Math.max(0, f.t - 0.14));
        g.lineTo(x, y);
      } else {
        var s = Math.min(1, f.t - 1);
        var ex = L.cx + L.R * Math.cos(f.plane) * s;
        var ey = yIn - L.R * Math.sin(f.plane) * s;
        var s0 = Math.max(0, s - 0.20);
        g.moveTo(L.cx + L.R * Math.cos(f.plane) * s0, yIn - L.R * Math.sin(f.plane) * s0);
        g.lineTo(ex, ey);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------
     Advance the animation. `dt` in milliseconds. Returns true if a new
     scintillation was recorded, so the caller can update a counter.
     ------------------------------------------------------------------ */
  function step(st, dt, now) {
    if (reduced()) { anim.flying.length = 0; return false; }
    var speed = 0.0011 * (0.35 + 0.42 * (st.speed || 3));
    var i, flashed = false;

    for (i = anim.flying.length - 1; i >= 0; i--) {
      var f = anim.flying[i];
      f.t += dt * speed * f.v;
      if (f.t >= 2) {
        /* has left the circle: does it land in the detector? */
        var sepDeg = Math.abs(Math.abs(f.deg) - st.detAngle);
        var sameSide = (f.plane >= 0);
        if (sameSide && sepDeg <= st.detWidth && now - anim.lastFlash > 400) {
          anim.marks.push({ t: now, y: (f.entry || 0) });
          anim.lastFlash = now; flashed = true;
          if (anim.marks.length > 24) anim.marks.shift();
        }
        anim.flying.splice(i, 1);
      }
    }

    /* keep a population in flight proportional to the density control */
    var want = Math.round((st.trajDensity || 40) / 100 * 26);
    anim.spawnAcc += dt * speed * 26;
    while (anim.spawnAcc >= 1 && anim.flying.length < want && (st.paths || []).length) {
      anim.spawnAcc -= 1;
      var p = st.paths[(dice.next() * st.paths.length) | 0];
      anim.flying.push({
        t: 0, v: 0.8 + dice.next() * 0.5,
        deg: p.deg, plane: p.plane, entry: p.entry
      });
    }
    if (anim.spawnAcc > 4) anim.spawnAcc = 4;
    return flashed;
  }

  /* Marks are cleared when the ledger is, so the screen never shows
     flashes belonging to an exposure that has been discarded. */
  function clearMarks() { anim.marks.length = 0; }

  function burst(n, now) {
    /* On an exposure, drop a handful of marks straight onto the screen
       so a detected count is visible even in reduced-motion mode. */
    n = Math.min(n | 0, 12);
    for (var i = 0; i < n; i++) anim.marks.push({ t: now - i * 60, y: (i % 7) / 7 - 0.43 });
    while (anim.marks.length > 24) anim.marks.shift();
  }

  return { draw: draw, step: step, reset: reset, clearMarks: clearMarks, burst: burst, reduced: reduced };
})();
