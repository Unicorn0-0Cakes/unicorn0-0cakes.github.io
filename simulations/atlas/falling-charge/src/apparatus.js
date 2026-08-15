/* =====================================================================
   THE FALLING CHARGE — the apparatus
   ---------------------------------------------------------------------
   Instrument state, its imperfections, and the world stepper.

   The instrument's errors (voltage gain and offset, reticle scale, sensor
   biases, tilt) are drawn ONCE per session from the `apparatus` stream and
   held fixed. They are SYSTEMATIC: measuring more droplets does not average
   them away. That is the mechanism behind hypothesis H4.

   Rendering functions take a 2D context and a palette and never touch
   `document`, so this module loads in Node and in a Worker unchanged.
   See docs/APPARATUS_MODEL.md.
   ===================================================================== */
(function (root) {
  "use strict";

  const isNode = (typeof module !== "undefined" && module.exports);
  const U  = isNode ? require("./units.js")    : root.FC.units;
  const P  = isNode ? require("./physics.js")  : root.FC.physics;
  const DR = isNode ? require("./droplets.js") : root.FC.droplets;

  /* =================================================================
     1. GEOMETRY — all metres. docs/APPARATUS_MODEL.md §1
     ============================================================== */
  const GEOM = {
    plateGap:     6.00e-3,   // d, true plate separation
    chamberWidth: 8.00e-3,
    illumHeight:  4.00e-3,   // illuminated band, centred
    fov:          1.00e-3,   // microscope field of view, across
    reticleDiv:   1.00e-4,   // one reticle division
    depthOfField: 1.50e-4,
    rRef:         5.0e-7,    // reference radius for the visibility threshold
    visThreshold: 0.06
  };

  /* =================================================================
     2. APPARATUS PROFILES
     EVERY MAGNITUDE HERE IS "NOT YET CALIBRATED" — plausible
     instrument specifications, not values from a data sheet.
     ============================================================== */
  const PROFILES = {
    ideal: {
      label: "Ideal apparatus",
      warning: "IDEAL APPARATUS — not a physical instrument. Every instrument " +
               "error is exactly zero. For validation only.",
      vGain: 0, vOffset: 0, vDrift: 0, vNoise: 0, vResolution: 0.001,
      scaleGain: 0, tempBias: 0, tempRes: 0.001, pressBias: 0, pressRes: 0.1,
      posNoise: 0, timeQuant: 1e-4, timeJitter: 0, reactionMu: 0, reactionSd: 0,
      tilt: 0, envDrift: 0
    },
    modern: {
      label: "Modern teaching apparatus",
      warning: null,
      vGain: 0.002, vOffset: 0.1, vDrift: 2e-4, vNoise: 0.05, vResolution: 0.1,
      scaleGain: 0.005, tempBias: 0.3, tempRes: 0.1, pressBias: 120, pressRes: 10,
      posNoise: 4.0e-7, timeQuant: 1e-3, timeJitter: 5e-4,
      reactionMu: 0, reactionSd: 0, tilt: 0.3 * Math.PI / 180, envDrift: 1
    },
    teaching: {
      label: "Instructional laboratory",
      warning: null,
      vGain: 0.005, vOffset: 0.5, vDrift: 1e-3, vNoise: 0.1, vResolution: 1,
      scaleGain: 0.01, tempBias: 0.5, tempRes: 0.5, pressBias: 300, pressRes: 100,
      posNoise: 8.0e-7, timeQuant: 1e-2, timeJitter: 2e-3,
      reactionMu: 0, reactionSd: 0, tilt: 0.3 * Math.PI / 180, envDrift: 1
    },
    historical: {
      label: "Period-inspired apparatus (1913)",
      warning: "PERIOD-INSPIRED, NOT A RECONSTRUCTION. The apparatus " +
               "dimensions, oil density and reaction-time figures are " +
               "plausible inventions, not values read from Millikan's paper. " +
               "See docs/LIMITATIONS.md L-17.",
      vGain: 0.02, vOffset: 2, vDrift: 5e-3, vNoise: 1, vResolution: 5,
      scaleGain: 0.02, tempBias: 1.5, tempRes: 0.5, pressBias: 600, pressRes: 100,
      posNoise: 2.0e-6, timeQuant: 0.05, timeJitter: 0,
      reactionMu: 0.18, reactionSd: 0.06, tilt: 0.5 * Math.PI / 180, envDrift: 2
    }
  };

  /* =================================================================
     3. SESSION ERROR DRAW
     ============================================================== */

  /**
   * Draw this session's fixed instrument errors. Called ONCE. The result
   * belongs in the truth vault: revealing it early would reveal the bias.
   * @param {Stream} rng  the "apparatus" stream
   */
  function drawSessionErrors(rng, profileName) {
    const pr = PROFILES[profileName] || PROFILES.modern;
    const u = function (m) { return m === 0 ? 0 : rng.range(-m, m); };
    return {
      profile: profileName,
      vGain:     u(pr.vGain),        // fractional
      vOffset:   u(pr.vOffset),      // V
      scaleGain: u(pr.scaleGain),    // fractional, on the reticle
      tempBias:  u(pr.tempBias),     // K
      pressBias: u(pr.pressBias),    // Pa
      tilt:      u(pr.tilt),         // rad
      plateGapTrue: GEOM.plateGap * (1 + u(0.004))
    };
  }

  /* =================================================================
     4. WORLD
     ============================================================== */

  /**
   * Build a fresh world. `truthVault` is supplied by persistence.js and is
   * the only object that holds hidden values.
   */
  function createWorld(opts) {
    const errors = opts.errors;
    return {
      t: 0,                               // simulated seconds
      stepCount: 0,
      droplets: [],
      selectedId: null,
      profile: opts.profile,
      geom: Object.assign({}, GEOM, { plateGap: errors.plateGapTrue }),

      instrument: {
        vDial: 0,          // V, coarse setting as displayed
        vFine: 0,          // V, fine trim as displayed
        polarity: 1,       // +1 = upper plate positive
        fieldOn: false,
        focalPlane: 0,     // m, depth the microscope is focused at
        illumination: 0.8, // 0..1
        settleUntil: 0     // simulated time before which a track is refused
      },

      env: {               // TRUE environment
        T: 293.15,
        p: 101325,
        Twalk: 0,
        pWalk: 0
      },

      physics: {
        slipModel: opts.slipModel || "allen-raabe-1982",
        brownian: opts.brownian !== false,
        integrator: opts.integrator || "exponential",
        rhoOil: opts.rhoOil || U.OIL.modern.rho
      },

      /* Mode E toggles. Every one of these is a real switch on the model. */
      noise: Object.assign({
        brownian: true, timing: true, focus: true, scaleError: true,
        voltageDrift: true, plateSpacing: true, temperature: true,
        pressure: true, airCurrents: false, evaporation: false,
        chargeJumps: true, edgeField: false, slip: true, reaction: true
      }, opts.noise || {}),

      counters: { generated: 0, culled: 0, droppedTime: 0 },
      pendingEvents: []
    };
  }

  /* =================================================================
     5. INSTRUMENT READINGS
     ============================================================== */

  /** The voltage the user has DIALLED, as the display shows it. */
  function displayedVoltage(world) {
    const pr = PROFILES[world.profile];
    const raw = (world.instrument.vDial + world.instrument.vFine) * world.instrument.polarity;
    const res = pr.vResolution || 0.001;
    return Math.round(raw / res) * res;
  }

  /**
   * The voltage actually across the plates. Never shown to the user.
   *   V_true = V_display (1 + gain) + offset + drift
   * Field-off is a relay: it is exactly zero, not a dialled zero.
   */
  function trueVoltage(world, errors) {
    if (!world.instrument.fieldOn) return 0;
    const d = displayedVoltage(world);
    const gain = world.noise.voltageDrift ? errors.vGain : 0;
    const off  = world.noise.voltageDrift ? errors.vOffset : 0;
    return d * (1 + gain) + off + (world.env.vWalk || 0);
  }

  /** Temperature as the sensor reports it, including its fixed bias. */
  function readTemperature(world, errors) {
    const pr = PROFILES[world.profile];
    const bias = world.noise.temperature ? errors.tempBias : 0;
    const v = world.env.T + world.env.Twalk + bias;
    return Math.round(v / pr.tempRes) * pr.tempRes;
  }

  /** Pressure as the sensor reports it. */
  function readPressure(world, errors) {
    const pr = PROFILES[world.profile];
    const bias = world.noise.pressure ? errors.pressBias : 0;
    const v = world.env.p + world.env.pWalk + bias;
    return Math.round(v / pr.pressRes) * pr.pressRes;
  }

  /** Reticle scale as calibrated: nominal division times the optical gain. */
  function trueReticleDivision(world, errors) {
    const g = world.noise.scaleError ? errors.scaleGain : 0;
    return GEOM.reticleDiv * (1 + g);
  }

  /* =================================================================
     6. STEPPING THE WORLD
     ============================================================== */

  /** Cached per-droplet environment, refreshed when conditions move. */
  function dropletEnv(world, droplet, truth, vTrue) {
    return P.makeEnv({
      r: truth.radius, q: truth.charge, vPlate: vTrue,
      d: world.geom.plateGap, T: world.env.T + world.env.Twalk,
      p: world.env.p + world.env.pWalk,
      rhoOil: truth.rhoOil,
      slip: world.noise.slip ? U.SLIP[world.physics.slipModel] : null
    });
  }

  /**
   * Advance the world by exactly `h` seconds of SIMULATED time.
   * Called only in fixed steps. docs/PHYSICS_MODEL.md §5.3.
   *
   * @param {object} world
   * @param {number} h
   * @param {object} ctx  {streams, truthVault, eHidden, errors, onEvent}
   */
  function step(world, h, ctx) {
    const errors = ctx.errors;
    const vTrue = trueVoltage(world, errors);
    const cosTilt = Math.cos(world.noise.plateSpacing ? errors.tilt : 0);

    /* --- slow environmental drift (random walks) ------------------- */
    if (world.noise.temperature || world.noise.pressure || world.noise.voltageDrift) {
      const dr = ctx.streams.get("drift");
      const pr = PROFILES[world.profile];
      const k = Math.sqrt(h) * (pr.envDrift || 0);
      if (world.noise.temperature)  world.env.Twalk = clampWalk(world.env.Twalk + dr.gauss(0, 0.02 * k), 0.4);
      if (world.noise.pressure)     world.env.pWalk = clampWalk(world.env.pWalk + dr.gauss(0, 8 * k), 150);
      if (world.noise.voltageDrift) world.env.vWalk = clampWalk((world.env.vWalk || 0) + dr.gauss(0, 0.01 * k), 0.6);
    }

    /* --- droplets --------------------------------------------------- */
    const surviving = [];
    for (let i = 0; i < world.droplets.length; i++) {
      const dpl = world.droplets[i];
      const truth = ctx.truthVault.mutable(dpl.id);
      if (!truth) continue;

      /* charge events, explicit only */
      if (world.noise.chargeJumps) {
        const cs = ctx.streams.get("charge");
        const dn = DR.spontaneousEvent(cs, dpl, h);
        if (dn !== null) {
          DR.applyChargeEvent(dpl, truth, dn, ctx.eHidden, world.t, "spontaneous");
          if (ctx.onEvent) ctx.onEvent("charge_jump", dpl.id, { deltaN: dn });
        }
      }

      const env = dropletEnv(world, dpl, truth, vTrue);
      dpl._env = env;

      /* Brownian displacement for this step */
      let xi = 0, xiX = 0;
      if (world.physics.brownian && world.noise.brownian) {
        const bs = ctx.streams.get("brownian:" + dpl.id);
        xi  = P.brownianStep(bs, env.D, h);
        xiX = P.brownianStep(bs, env.D, h);
      }
      dpl.brownianY += xi;
      dpl.brownianX += xiX;

      const st = { y: dpl.y, v: dpl.vy };
      if (world.physics.integrator === "terminal") {
        P.stepTerminal(st, env, h, xi);
      } else {
        P.step(st, env, h, xi);
      }
      /* Apparatus tilt projects the motion onto the tracking axis.
         The lateral component is NOT rendered — LIMITATIONS.md L-4. */
      dpl.y = st.y * cosTilt + dpl.y * (1 - cosTilt);
      dpl.vy = st.v;
      dpl.x += xiX;

      /* optical state */
      dpl.focus = world.noise.focus
        ? DR.focusQuality(dpl.depth, world.instrument.focalPlane, GEOM.depthOfField)
        : 1;
      const sig = DR.signalStrength(dpl.focus, truth.radius, GEOM.rRef) * world.instrument.illumination;
      dpl.visible = sig > GEOM.visThreshold
        && dpl.y > 0 && dpl.y < world.geom.plateGap
        && Math.abs(dpl.x) < world.geom.chamberWidth / 2;

      /* culling: left the chamber, or outlived its observation window */
      const gone = dpl.y <= 0 || dpl.y >= world.geom.plateGap
        || (world.t - dpl.tBirth) > dpl.lifetime
        || Math.abs(dpl.x) > world.geom.chamberWidth / 2;

      if (gone) {
        dpl.status = "lost";
        world.counters.culled++;
        ctx.streams.release("brownian:" + dpl.id);
        if (world.selectedId === dpl.id) world.selectedId = null;
        if (ctx.onEvent) ctx.onEvent("droplet_lost", dpl.id, {});
      } else {
        surviving.push(dpl);
      }
    }
    world.droplets = surviving;

    world.t += h;
    world.stepCount++;
    return world;
  }

  function clampWalk(v, lim) { return v > lim ? lim : (v < -lim ? -lim : v); }

  /* =================================================================
     7. ATOMISER
     ============================================================== */

  /**
   * Spray droplets into the chamber. Their hidden properties are drawn
   * NOW, before the user can react to anything, so the apparatus cannot
   * adapt to the operator.
   */
  function atomise(world, ctx, count) {
    const rng = ctx.streams.get("droplets");
    const made = [];
    for (let i = 0; i < count; i++) {
      const pair = DR.create(rng, ctx.dropletConfig, {
        eHidden: ctx.eHidden,
        rhoOil: world.physics.rhoOil,
        chamberWidth: world.geom.chamberWidth,
        entryY: world.geom.plateGap * 0.93,
        now: world.t,
        synthetic: ctx.synthetic
      });
      ctx.truthVault.set(pair.truth.id, pair.truth);
      world.droplets.push(pair.droplet);
      world.counters.generated++;
      made.push(pair.droplet.id);
    }
    return made;
  }

  /** Operator ionisation pulse: an explicit physical event. */
  function ionisePulse(world, ctx, pPulse) {
    const rng = ctx.streams.get("charge");
    const hits = [];
    for (let i = 0; i < world.droplets.length; i++) {
      const dpl = world.droplets[i];
      if (!dpl.visible) continue;
      const dn = DR.pulseEvent(rng, pPulse === undefined ? 0.25 : pPulse);
      if (dn !== null) {
        const truth = ctx.truthVault.mutable(dpl.id);
        DR.applyChargeEvent(dpl, truth, dn, ctx.eHidden, world.t, "operator_pulse");
        hits.push(dpl.id);
      }
    }
    return hits;
  }

  /* =================================================================
     8. RENDERING — takes a context and a palette, never touches document
     ============================================================== */

  /**
   * The ONE place metres become pixels for the chamber. y is upward in
   * physics and downward on a canvas, and this is where that is handled,
   * so a rendering bug cannot silently invert the physics.
   */
  function toScreen(world, layout, x, y) {
    const sx = layout.x + layout.w / 2 + (x / world.geom.chamberWidth) * layout.w * 0.86;
    const sy = layout.y + layout.h - (y / world.geom.plateGap) * layout.h;
    return [sx, sy];
  }

  /** Draw the observation chamber as an instrument. */
  function drawChamber(ctx2d, world, layout, pal, opts) {
    opts = opts || {};
    const g = ctx2d, L = layout;
    const vTrue = displayedVoltage(world);
    const on = world.instrument.fieldOn;

    g.save();
    g.clearRect(L.x, L.y, L.w, L.h);

    /* chamber interior — a dark optical cavity */
    const grad = g.createLinearGradient(L.x, L.y, L.x, L.y + L.h);
    grad.addColorStop(0, pal.scope);
    grad.addColorStop(0.5, pal.scopeLit);
    grad.addColorStop(1, pal.scope);
    g.fillStyle = grad;
    g.fillRect(L.x, L.y, L.w, L.h);

    /* illuminated band */
    const bandTop = toScreen(world, L, 0, world.geom.plateGap / 2 + world.geom.illumHeight / 2)[1];
    const bandBot = toScreen(world, L, 0, world.geom.plateGap / 2 - world.geom.illumHeight / 2)[1];
    g.fillStyle = pal.beam;
    g.fillRect(L.x, bandTop, L.w, bandBot - bandTop);

    /* field arrows — direction shown by geometry, not only by colour */
    if (on && Math.abs(vTrue) > 0.5) {
      const down = vTrue > 0;              // positive V => field points down
      const n = Math.min(9, 3 + Math.floor(Math.abs(vTrue) / 70));
      g.strokeStyle = pal.field;
      g.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const fx = L.x + L.w * (i + 0.5) / n;
        const y0 = bandTop + 8, y1 = bandBot - 8;
        g.beginPath(); g.moveTo(fx, y0); g.lineTo(fx, y1); g.stroke();
        const ty = down ? y1 : y0, dir = down ? -1 : 1;
        g.beginPath();
        g.moveTo(fx, ty); g.lineTo(fx - 3, ty + dir * 6); g.lineTo(fx + 3, ty + dir * 6);
        g.closePath(); g.fillStyle = pal.field; g.fill();
      }
    }

    /* plates */
    const plateH = 9;
    const topY = toScreen(world, L, 0, world.geom.plateGap)[1];
    const botY = toScreen(world, L, 0, 0)[1];
    drawPlate(g, L.x, topY - plateH, L.w, plateH, pal);
    drawPlate(g, L.x, botY, L.w, plateH, pal);

    /* entry aperture in the upper plate */
    g.fillStyle = pal.scope;
    g.fillRect(L.x + L.w / 2 - 5, topY - plateH, 10, plateH);

    /* polarity marks — glyph AND word, never colour alone */
    g.font = "600 12px ui-monospace, monospace";
    g.textBaseline = "middle";
    const upperSign = on ? (world.instrument.polarity > 0 ? "+" : "−") : "·";
    const lowerSign = on ? (world.instrument.polarity > 0 ? "−" : "+") : "·";
    g.fillStyle = pal.ink;
    g.textAlign = "left";
    g.fillText(upperSign, L.x + 6, topY - plateH / 2);
    g.fillText(lowerSign, L.x + 6, botY + plateH / 2);

    /* droplets */
    for (let i = 0; i < world.droplets.length; i++) {
      const d = world.droplets[i];
      if (!d.visible) continue;
      const pt = toScreen(world, L, d.x, d.y);
      const sel = d.id === world.selectedId;
      const a = 0.25 + 0.75 * d.focus;
      g.beginPath();
      g.arc(pt[0], pt[1], sel ? 3.2 : 1.9, 0, Math.PI * 2);
      g.fillStyle = sel ? pal.selected : pal.droplet;
      g.globalAlpha = a;
      g.fill();
      g.globalAlpha = 1;
      if (sel) {
        g.strokeStyle = pal.selected;
        g.lineWidth = 1;
        g.beginPath(); g.arc(pt[0], pt[1], 9, 0, Math.PI * 2); g.stroke();
        g.beginPath();
        g.moveTo(pt[0] - 14, pt[1]); g.lineTo(pt[0] - 10, pt[1]);
        g.moveTo(pt[0] + 10, pt[1]); g.lineTo(pt[0] + 14, pt[1]);
        g.stroke();
      }
    }

    /* physical scale bar — 1 mm */
    const y0 = toScreen(world, L, 0, 0.0005)[1];
    const y1 = toScreen(world, L, 0, 0.0015)[1];
    g.strokeStyle = pal.rule; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(L.x + L.w - 18, y0); g.lineTo(L.x + L.w - 18, y1);
    g.moveTo(L.x + L.w - 22, y0); g.lineTo(L.x + L.w - 14, y0);
    g.moveTo(L.x + L.w - 22, y1); g.lineTo(L.x + L.w - 14, y1);
    g.stroke();
    g.fillStyle = pal.muted;
    g.font = "9px ui-monospace, monospace";
    g.textAlign = "right";
    g.fillText("1 mm", L.x + L.w - 26, (y0 + y1) / 2);

    g.restore();
  }

  function drawPlate(g, x, y, w, h, pal) {
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, pal.brass1);
    grad.addColorStop(0.45, pal.brass2);
    grad.addColorStop(1, pal.brass3);
    g.fillStyle = grad;
    g.fillRect(x, y, w, h);
    g.strokeStyle = pal.rule;
    g.lineWidth = 0.6;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  /**
   * The microscope view. Magnification is computed and returned so the
   * caller can label the view — the droplet is never enlarged silently.
   */
  function drawScope(ctx2d, world, layout, pal, track) {
    const g = ctx2d, L = layout;
    const sel = world.droplets.find(function (d) { return d.id === world.selectedId; });

    g.save();
    g.clearRect(L.x, L.y, L.w, L.h);
    g.fillStyle = pal.scope;
    g.fillRect(L.x, L.y, L.w, L.h);

    /* the field of view is GEOM.fov metres across */
    const pxPerM = L.w / GEOM.fov;
    const cx = L.x + L.w / 2;
    const cy = L.y + L.h / 2;

    /* reticle: fine divisions, heavier every fifth */
    const divPx = GEOM.reticleDiv * pxPerM;
    g.lineWidth = 1;
    for (let k = -20; k <= 20; k++) {
      const yy = cy - k * divPx;
      if (yy < L.y || yy > L.y + L.h) continue;
      const major = (k % 5 === 0);
      g.strokeStyle = major ? pal.reticleMaj : pal.reticleMin;
      g.beginPath();
      g.moveTo(cx - (major ? 34 : 16), yy);
      g.lineTo(cx + (major ? 34 : 16), yy);
      g.stroke();
      if (major && k !== 0) {
        g.fillStyle = pal.muted;
        g.font = "8px ui-monospace, monospace";
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.fillText((k / 10).toFixed(1) + " mm", cx + 38, yy);
      }
    }
    /* crosshair */
    g.strokeStyle = pal.reticleMaj;
    g.beginPath();
    g.moveTo(cx, L.y + 6); g.lineTo(cx, L.y + L.h - 6);
    g.stroke();

    if (sel) {
      /* the droplet sits at its offset from the view centre */
      const anchor = (track && track.anchorY !== undefined) ? track.anchorY
                   : world.geom.plateGap / 2;
      const dy = (sel.y - anchor) * pxPerM;
      const dx = sel.x * pxPerM * 0.4;
      const py = cy - dy, px = cx + dx;

      /* tracked path */
      if (track && track.samples && track.samples.length > 1) {
        g.strokeStyle = pal.path;
        g.lineWidth = 1;
        g.beginPath();
        for (let i = 0; i < track.samples.length; i++) {
          const s = track.samples[i];
          const sy = cy - (s[1] - anchor) * pxPerM;
          if (i === 0) g.moveTo(px, sy); else g.lineTo(px, sy);
        }
        g.stroke();
      }

      /* the droplet, blurred by focus */
      const blur = (1 - sel.focus) * 7;
      const rad = 4 + blur;
      const gr = g.createRadialGradient(px, py, 0, px, py, rad);
      gr.addColorStop(0, pal.dropletCore);
      gr.addColorStop(1, pal.dropletEdge);
      g.fillStyle = gr;
      g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.fill();

      /* centroid marker */
      g.strokeStyle = pal.selected;
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(px - 7, py); g.lineTo(px - 3, py);
      g.moveTo(px + 3, py); g.lineTo(px + 7, py);
      g.moveTo(px, py - 7); g.lineTo(px, py - 3);
      g.moveTo(px, py + 3); g.lineTo(px, py + 7);
      g.stroke();

      /* timing gates */
      if (track && track.gateStart !== undefined) {
        [track.gateStart, track.gateStop].forEach(function (gy, i) {
          if (gy === undefined || gy === null) return;
          const yy = cy - (gy - anchor) * pxPerM;
          g.strokeStyle = pal.gate;
          g.setLineDash([4, 3]);
          g.beginPath(); g.moveTo(L.x + 4, yy); g.lineTo(L.x + L.w - 4, yy); g.stroke();
          g.setLineDash([]);
          g.fillStyle = pal.gate;
          g.font = "8px ui-monospace, monospace";
          g.textAlign = "left";
          g.fillText(i === 0 ? "START" : "STOP", L.x + 6, yy - 5);
        });
      }
    } else {
      g.fillStyle = pal.muted;
      g.font = "11px ui-monospace, monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("NO DROPLET SELECTED", cx, cy - 16);
    }

    g.restore();
    return { pxPerM: pxPerM, magnification: pxPerM * 0.000264583 };
  }

  const API = {
    GEOM: GEOM, PROFILES: PROFILES,
    drawSessionErrors: drawSessionErrors,
    createWorld: createWorld,
    displayedVoltage: displayedVoltage, trueVoltage: trueVoltage,
    readTemperature: readTemperature, readPressure: readPressure,
    trueReticleDivision: trueReticleDivision,
    dropletEnv: dropletEnv,
    step: step, atomise: atomise, ionisePulse: ionisePulse,
    toScreen: toScreen, drawChamber: drawChamber, drawScope: drawScope
  };

  if (isNode) module.exports = API;
  root.FC = root.FC || {};
  root.FC.apparatus = API;

})(typeof globalThis !== "undefined" ? globalThis : this);
