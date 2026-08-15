"use strict";
/* =====================================================================
   THE MAGNETIC OCEAN — model.js

   The scientific kernel. No DOM, no timers, no rendering. Everything in
   this file can be required in node and tested on its own:

       node tests/model-tests.js

   ---------------------------------------------------------------------
   WHAT THIS COMPUTES, AND WHERE IT COMES FROM

   1. AGE FROM DISTANCE.  For a constant half-spreading rate,

          d = 10 * v_half * t

      d in km from the axis, v_half in cm/yr for ONE plate, t in Ma.
      The factor 10 is the unit conversion and nothing else:
      1 cm/yr = 10 mm/yr = 10 km per million years.

   2. POLARITY FROM AGE.  A lookup in a chronology — either the
      published one in data/polarity-timescale.js, or a seeded synthetic
      sequence which is labelled as such everywhere it appears.

   3. THE FIELD OVER THE BURIED CRUST.  This is the part that has to be
      right, because it is what separates a magnetic profile from a
      coloured stripe diagram.

      The magnetised layer is treated as a set of two-dimensional
      rectangular prisms, infinite along the ridge axis, uniformly
      magnetised, with the same top and bottom depth throughout. This is
      the classical marine-magnetics forward problem set out by

        Talwani, M. & Heirtzler, J.R. (1964). Computation of magnetic
        anomalies caused by two dimensional structures of arbitrary
        shape. Computers in the Mineral Industries, Part 1, Stanford
        Univ. Publ. Geol. Sci. 9, 464-480.

      and re-derived from first principles, with the errors in the 1964
      derivation identified and corrected, by

        Kravchinsky, V.A., Hnatyshin, D., Lysak, B. & Alemie, W. (2019).
        Computation of magnetic anomalies caused by two-dimensional
        structures of arbitrary shape: derivation and Matlab
        implementation. Geophys. Res. Lett. 46, 7345-7351.
        doi:10.1029/2019GL082767

      Their equations (4)-(6) are the ones used here. Let x and z be the
      position of a source element RELATIVE TO THE SENSOR, z positive
      downward. For a body infinite in the strike direction, the
      magnetic potential of an element is

          dOmega = (Jx*x + Jz*z) / (2*pi*(x^2 + z^2)) dx dz

      and the vertical and horizontal field components follow by
      differentiation:

          dV = [2*Jx*x*z - Jz*(x^2 - z^2)] / (2*pi*(x^2+z^2)^2) dx dz
          dH = [2*Jz*x*z + Jx*(x^2 - z^2)] / (2*pi*(x^2+z^2)^2) dx dz

      Integrating those two expressions over a rectangle x in [x1,x2],
      z in [z1,z2] is elementary, because

          Int Int (x^2 - z^2)/(x^2+z^2)^2 dx dz = atan(x/z)
          Int Int      x*z /(x^2+z^2)^2 dx dz = -(1/2) ln(x^2+z^2)

      Writing A(x,z) = atan(x/z) and R(x,z) = (1/2) ln(x^2 + z^2), and
      writing D[F] for the double difference

          D[F] = F(x2,z2) - F(x1,z2) - F(x2,z1) + F(x1,z1)

      the rectangle contributes

          V = (1/2pi) * D[ -Jx*R - Jz*A ]
          H = (1/2pi) * D[ -Jz*R + Jx*A ]

      The sensor is always above the layer, so z >= z1 > 0 throughout
      and atan(x/z) never crosses a branch cut. No special cases, no
      guards, no singularities inside the domain of use.

   4. TOTAL-FIELD ANOMALY.  A marine magnetometer measures the scalar
      total field. For an anomaly small against the main field the
      standard reduction is to project the anomalous vector onto the
      main-field direction (Kravchinsky et al. 2019, eq. 13):

          T = V sin(A) + H cos(A) cos(C - B)

      This instrument works in the reduced two-dimensional geometry used
      throughout marine magnetics, in which the strike azimuth and the
      declination are folded into a single EFFECTIVE INCLINATION I_eff
      shared by the magnetisation and the field
      (Schouten, H. & McCamy, K., 1972, Filtering marine magnetic
      anomalies, J. Geophys. Res. 77, 7089-7099). Setting

          Jx = J cos(I_eff),  Jz = J sin(I_eff)

      and projecting on the same direction collapses the whole thing to

          T = -sin(2 I_eff) * D[R] + cos(2 I_eff) * D[A]     (per unit J)

      which is the single line the code actually evaluates. At
      I_eff = 90 degrees — the magnetic pole case — this reduces to
      T = -D[A], the anomaly is symmetric about each block, and a
      symmetric world produces a symmetric profile. Below 90 degrees the
      anomalies skew, which is real and is why the control exists.

      What is NOT implemented: converting a latitude, a declination and
      a strike azimuth into I_eff. The operator sets I_eff directly.
      Anomalous skewness is not modelled either.

   5. THE OBSERVATIONS.  A finite track at an angle to the ridge, a
      sample spacing, Gaussian instrument noise, a regional trend,
      navigation jitter and dropout — all from one seeded generator, in
      a fixed draw order, so the same seed and the same settings return
      byte-identical arrays.

   ---------------------------------------------------------------------
   WHAT THE OPERATOR NEVER SEES BEFORE COMMITTING

   `makeWorld` returns an object whose `hidden` sub-object holds the
   axis, the rates, the blocks and the generating model. Nothing in the
   rendering layer is allowed to read `hidden` until `commit` has been
   called on the session. That is a convention, not an enforcement, and
   screens.js is where it is kept.
   ===================================================================== */

var MagOcean = (function () {

  /* ==================================================================
     0. SEEDED RANDOMNESS

     mulberry32. Chosen because it is short enough to read, has a stated
     algorithm, and produces the same stream in every browser and in
     node. Gaussians by Box-Muller, both values kept so the draw order
     is stable.
     =============================================================== */
  function mixSeed() {
    /* FNV-1a over the string form of every argument, so that
       (seed, "noise", 2) is a reproducible distinct stream. */
    var h = 2166136261 >>> 0;
    var s = Array.prototype.join.call(arguments, "|");
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function RNG(seed) {
    this.a = (seed >>> 0) || 1;
    this._spare = null;
  }
  RNG.prototype.next = function () {
    this.a = (this.a + 0x6D2B79F5) >>> 0;
    var t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.uniform = function (lo, hi) { return lo + (hi - lo) * this.next(); };
  RNG.prototype.normal = function () {
    if (this._spare !== null) { var v = this._spare; this._spare = null; return v; }
    var u = 0, w = 0, s = 0;
    do {
      u = this.next() * 2 - 1;
      w = this.next() * 2 - 1;
      s = u * u + w * w;
    } while (s >= 1 || s === 0);
    var f = Math.sqrt(-2 * Math.log(s) / s);
    this._spare = w * f;
    return u * f;
  };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length) % arr.length]; };

  /* ==================================================================
     1. CHRONOLOGY
     =============================================================== */

  /* Resolve the published chronology whether we are in a browser (where
     data/polarity-timescale.js set a global) or in node (where it is a
     module). Nothing else in this file reaches outside itself. */
  function publishedChronology() {
    if (typeof GPTS_PUBLISHED !== "undefined") return GPTS_PUBLISHED;
    if (typeof window !== "undefined" && window.GPTS_PUBLISHED) return window.GPTS_PUBLISHED;
    if (typeof require !== "undefined") return require("../data/polarity-timescale.js").GPTS_PUBLISHED;
    throw new Error("polarity timescale not loaded");
  }

  /* A seeded sequence of irregular intervals, starting normal at t = 0.
     Durations are drawn from an exponential with a floor, which gives
     the mix of long chrons and short subchrons that makes the pattern
     legible without any of the numbers being historical. Labelled
     synthetic in every place it is displayed. */
  function syntheticChronology(seed, spanMa) {
    spanMa = spanMa || 6.0;
    var rng = new RNG(mixSeed(seed, "chronology"));
    var normals = [], t = 0, polarity = 1, k = 0;
    while (t < spanMa && k < 400) {
      var d = 0.045 + (-Math.log(1 - rng.next())) * 0.30;
      var t1 = Math.min(t + d, spanMa);
      if (polarity === 1) {
        normals.push({ chron: "S" + (normals.length + 1), name: "synthetic " + (normals.length + 1),
                       t0: t, t1: t1, src: "synthetic" });
      }
      t = t1; polarity = -polarity; k++;
    }
    return {
      id: "synthetic-" + (seed >>> 0),
      label: "Synthetic chronology (seed " + (seed >>> 0) + ")",
      short: "Synthetic",
      synthetic: true,
      spanMa: spanMa,
      citation: "Generated by this instrument. No boundary in this sequence corresponds to a real geomagnetic reversal.",
      normalIntervals: normals,
      chrons: []
    };
  }

  function chronologyByKey(key, seed) {
    if (key === "synthetic") return syntheticChronology(seed, 6.0);
    return publishedChronology();
  }

  /* +1 normal, -1 reversed, 0 = older than the chronology covers. The
     third value matters: it is how the instrument refuses to invent
     rock it has no source for. */
  function polarityAtAge(ageMa, chron) {
    if (!(ageMa >= 0)) return 0;
    if (ageMa > chron.spanMa) return 0;
    var iv = chron.normalIntervals;
    for (var i = 0; i < iv.length; i++) {
      if (ageMa >= iv[i].t0 && ageMa < iv[i].t1) return 1;
    }
    return -1;
  }

  function chronNameAtAge(ageMa, chron) {
    var c = chron.chrons || [];
    for (var i = 0; i < c.length; i++) if (ageMa >= c[i].t0 && ageMa < c[i].t1) return c[i].name;
    return chron.synthetic ? "synthetic" : "";
  }

  /* ==================================================================
     2. THE HIDDEN CRUST
     =============================================================== */

  var KM_PER_CMYR_MA_ = 10;

  /* d = 10 * v_half * t, inverted. Positive on both sides. */
  function ageAtPosition(xKm, world) {
    var d = xKm - world.ridgeAxisKm;
    var rate = d >= 0 ? world.halfRateRightCmYr : world.halfRateLeftCmYr;
    if (!(rate > 0)) return Infinity;
    return Math.abs(d) / (KM_PER_CMYR_MA_ * rate);
  }

  function distanceForAge(ageMa, halfRateCmYr) {
    return KM_PER_CMYR_MA_ * halfRateCmYr * ageMa;
  }

  /* Signed magnetisation of the crust at a point, A/m. Zero where the
     chronology runs out. */
  function crustMagnetization(xKm, world) {
    if (world.generator === "staticCorrelated") return staticMagnetization(xKm, world);
    if (world.generator === "constantPolarity") {
      return Math.abs(xKm - world.ridgeAxisKm) <= world.outerHalfWidthKm ? world.magnetisationAm : 0;
    }
    var age = ageAtPosition(xKm, world);
    var p = polarityAtAge(age, world.chronology);
    return p * world.magnetisationAm;
  }

  /* The null world: a magnetisation profile with a characteristic
     length scale and nothing else. Built as a sum of sinusoids with
     seeded phases, then quantised at its zero crossings so that the
     forward model sees blocks of the same kind it sees everywhere else.
     It is deliberately capable of looking like stripes. */
  function staticField(xKm, world) {
    var comps = world._staticComponents, v = 0;
    for (var i = 0; i < comps.length; i++) {
      v += comps[i].a * Math.sin(2 * Math.PI * xKm / comps[i].lambda + comps[i].phase);
    }
    return v;
  }
  function staticMagnetization(xKm, world) {
    if (Math.abs(xKm - world.ridgeAxisKm) > world.outerHalfWidthKm) return 0;
    return (staticField(xKm, world) >= 0 ? 1 : -1) * world.magnetisationAm;
  }

  /* Blocks: contiguous intervals of constant magnetisation, left to
     right. This is the only representation the forward model consumes,
     so all three generating models produce the same kind of object. */
  function buildBlocks(world) {
    var out = [];
    var axis = world.ridgeAxisKm, half = world.outerHalfWidthKm;

    if (world.generator === "constantPolarity") {
      out.push({ x1: axis - half, x2: axis + half, J: world.magnetisationAm,
                 polarity: 1, label: "normal throughout", ageT0: 0, ageT1: NaN });
      return out;
    }

    if (world.generator === "staticCorrelated") {
      var dx = 0.05, prev = staticMagnetization(axis - half, world), start = axis - half;
      for (var x = axis - half + dx; x <= axis + half + 1e-9; x += dx) {
        var m = staticMagnetization(x, world);
        if (m !== prev) {
          out.push({ x1: start, x2: x, J: prev, polarity: prev >= 0 ? 1 : -1,
                     label: "correlated field", ageT0: NaN, ageT1: NaN });
          start = x; prev = m;
        }
      }
      out.push({ x1: start, x2: axis + half, J: prev, polarity: prev >= 0 ? 1 : -1,
                 label: "correlated field", ageT0: NaN, ageT1: NaN });
      return out;
    }

    /* Spreading with reversals. Build the polarity boundaries in age,
       map them to distance on each side with that side's own rate, and
       emit blocks. The two sides are built separately and never share a
       rate, so an asymmetric world cannot accidentally come out
       symmetric. */
    var chron = world.chronology;
    var bounds = [0];
    var iv = chron.normalIntervals;
    for (var i = 0; i < iv.length; i++) {
      if (iv[i].t0 > 0) bounds.push(iv[i].t0);
      bounds.push(iv[i].t1);
    }
    bounds.push(chron.spanMa);
    bounds.sort(function (a, b) { return a - b; });

    function sideBlocks(sign, rate) {
      var segs = [];
      for (var k = 0; k < bounds.length - 1; k++) {
        var t0 = bounds[k], t1 = bounds[k + 1];
        if (t1 <= t0) continue;
        var mid = 0.5 * (t0 + t1);
        var p = polarityAtAge(mid, chron);
        var d0 = distanceForAge(t0, rate), d1 = distanceForAge(t1, rate);
        if (d0 > half) break;
        d1 = Math.min(d1, half);
        var a = axis + sign * d0, b = axis + sign * d1;
        segs.push({ x1: Math.min(a, b), x2: Math.max(a, b), J: p * world.magnetisationAm,
                    polarity: p, ageT0: t0, ageT1: t1,
                    label: chronNameAtAge(mid, chron) });
      }
      return segs;
    }

    var right = sideBlocks(+1, world.halfRateRightCmYr);
    var left = sideBlocks(-1, world.halfRateLeftCmYr).reverse();
    return left.concat(right);
  }

  /* ==================================================================
     3. THE FORWARD MAGNETIC MODEL

     Talwani & Heirtzler (1964) as re-derived by Kravchinsky et al.
     (2019), reduced to the two-dimensional effective-inclination form.
     See the header for the derivation.
     =============================================================== */

  /* Geometry of the observation: z1 is the vertical distance from the
     sensor down to the TOP of the magnetised layer (the "sensor
     altitude"), z2 to its base. */
  function geometry(sensorAltitudeKm, layerThicknessKm, effInclinationDeg) {
    var z1 = sensorAltitudeKm;
    var z2 = sensorAltitudeKm + layerThicknessKm;
    var I = effInclinationDeg * Math.PI / 180;
    return {
      z1: z1, z2: z2,
      cos2I: Math.cos(2 * I),
      sin2I: Math.sin(2 * I),
      effInclinationDeg: effInclinationDeg,
      layerThicknessKm: layerThicknessKm
    };
  }

  /* Gt(xi) — the running total-field term for a source edge at
     horizontal offset xi from the sensor, per unit magnetisation, in
     units of (1/2pi). A block [x1,x2] contributes Gt(x2) - Gt(x1). */
  function edgeTerm(xi, g) {
    var A = Math.atan(xi / g.z2) - Math.atan(xi / g.z1);
    var R = 0.5 * Math.log((xi * xi + g.z2 * g.z2) / (xi * xi + g.z1 * g.z1));
    return g.cos2I * A - g.sin2I * R;
  }

  var NT_SCALE = 200;   /* mu0 * 1e9 / (2 pi) — see config.js */

  /* The exact profile. xs are sensor positions in ridge-normal km. */
  function forwardMagneticProfile(blocks, xs, g) {
    var n = xs.length, out = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var x = xs[i], sum = 0;
      for (var b = 0; b < blocks.length; b++) {
        var J = blocks[b].J;
        if (J === 0) continue;
        sum += J * (edgeTerm(blocks[b].x2 - x, g) - edgeTerm(blocks[b].x1 - x, g));
      }
      out[i] = NT_SCALE * sum;
    }
    return out;
  }

  /* ---- the same thing, tabulated -------------------------------
     edgeTerm depends only on the offset xi, so for a fixed geometry it
     can be sampled once and interpolated. Used for candidate-model
     scanning, where the same geometry is evaluated thousands of times.
     Verified against the exact routine in the test suite; it is never
     used to generate the observations themselves. */
  function edgeTable(g, halfRangeKm, stepKm) {
    halfRangeKm = halfRangeKm || 400;
    stepKm = stepKm || 0.02;
    var n = Math.ceil(2 * halfRangeKm / stepKm) + 1;
    var tbl = new Float64Array(n);
    for (var i = 0; i < n; i++) tbl[i] = edgeTerm(-halfRangeKm + i * stepKm, g);
    return { tbl: tbl, half: halfRangeKm, step: stepKm, n: n,
             lo: edgeTerm(-halfRangeKm, g), hi: edgeTerm(halfRangeKm, g) };
  }
  function edgeLookup(xi, T) {
    if (xi <= -T.half) return T.lo;
    if (xi >= T.half) return T.hi;
    var u = (xi + T.half) / T.step;
    var i = u | 0, f = u - i;
    return T.tbl[i] + f * (T.tbl[i + 1] - T.tbl[i]);
  }
  function forwardMagneticProfileFast(blocks, xs, T, mask) {
    var n = xs.length, out = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      if (mask && !mask[i]) continue;      /* candidate scanning only ever
                                              needs the samples it scores */
      var x = xs[i], sum = 0;
      for (var b = 0; b < blocks.length; b++) {
        var J = blocks[b].J;
        if (J === 0) continue;
        sum += J * (edgeLookup(blocks[b].x2 - x, T) - edgeLookup(blocks[b].x1 - x, T));
      }
      out[i] = NT_SCALE * sum;
    }
    return out;
  }

  /* ==================================================================
     4. BATHYMETRY  (displayed, not fed back into the magnetics)

     Parsons, B. & Sclater, J.G. (1977). An analysis of the variation of
     ocean floor bathymetry and heat flow with age. J. Geophys. Res. 82,
     803-827. For crust younger than about 70 Ma they give

         depth(t) = 2500 + 350 * sqrt(t)   metres, t in Ma

     The instrument uses this to draw the seafloor. It does NOT use it
     in the magnetic forward model, where the top of the source layer is
     held at a constant depth below the sensor. That inconsistency is a
     simplification and is listed as one.
     =============================================================== */
  function bathymetryKm(xKm, world) {
    var t = ageAtPosition(xKm, world);
    if (!isFinite(t)) t = 0;
    t = Math.min(t, 80);
    return (2500 + 350 * Math.sqrt(t)) / 1000;
  }

  /* ==================================================================
     5. BUILDING A WORLD
     =============================================================== */
  function makeWorld(spec) {
    var seed = (spec.seed >>> 0) || 1;
    var chron = chronologyByKey(spec.chronology || "published", seed);
    var maxRate = Math.max(spec.halfRateLeftCmYr, spec.halfRateRightCmYr);

    var world = {
      seed: seed,
      generator: spec.generator || "spreading",
      ridgeAxisKm: spec.ridgeAxisKm,
      halfRateLeftCmYr: spec.halfRateLeftCmYr,
      halfRateRightCmYr: spec.halfRateRightCmYr,
      effInclinationDeg: spec.effInclinationDeg,
      magnetisationAm: spec.magnetisationAm,
      layerThicknessKm: spec.layerThicknessKm,
      chronology: chron,
      chronologyKey: spec.chronology || "published",
      correlationKm: spec.correlationKm || 11,
      /* How far from the axis the model is willing to describe crust. */
      outerHalfWidthKm: 0
    };

    if (world.generator === "constantPolarity") {
      world.outerHalfWidthKm = 2000;
    } else if (world.generator === "staticCorrelated") {
      world.outerHalfWidthKm = 400;
      var rng = new RNG(mixSeed(seed, "static"));
      var comps = [];
      for (var i = 0; i < 26; i++) {
        var lam = world.correlationKm * Math.pow(3.2, rng.next() * 2 - 1);
        comps.push({ lambda: lam, phase: rng.next() * 2 * Math.PI, a: Math.sqrt(lam) });
      }
      world._staticComponents = comps;
    } else {
      /* The chronology runs out; beyond that the model has no source
         for the polarity and leaves the crust unmagnetised rather than
         inventing it. */
      world.outerHalfWidthKm = distanceForAge(chron.spanMa, maxRate);
    }

    world.blocks = buildBlocks(world);
    world.fullRateCmYr = world.halfRateLeftCmYr + world.halfRateRightCmYr;
    world.symmetric = Math.abs(world.halfRateLeftCmYr - world.halfRateRightCmYr) < 1e-9;
    return world;
  }

  /* Draw a plausible hidden world for blind and comparison modes.
     Deterministic in the seed, so "restart same seed" restores exactly
     the same geology. */
  function randomWorldSpec(seed, opts) {
    opts = opts || {};
    var rng = new RNG(mixSeed(seed, "world"));
    var gen = "spreading";
    var roll = rng.next();
    if (opts.allowNull !== false) {
      if (roll > 0.86) gen = "staticCorrelated";
      else if (roll > 0.78) gen = "constantPolarity";
    }
    var base = 0.9 + rng.next() * 4.2;
    var asym = rng.next() < 0.35 ? (0.45 + rng.next() * 0.6) : 1.0;
    var left = base, right = base * asym;
    if (rng.next() < 0.5) { var t = left; left = right; right = t; }
    return {
      generator: gen,
      seed: seed,
      ridgeAxisKm: Math.round((rng.next() * 60 - 30) * 2) / 2,
      halfRateLeftCmYr: Math.round(left * 10) / 10,
      halfRateRightCmYr: Math.round(right * 10) / 10,
      effInclinationDeg: rng.next() < 0.55 ? 90 : Math.round(35 + rng.next() * 50),
      chronology: rng.next() < 0.25 ? "synthetic" : "published",
      correlationKm: 6 + rng.next() * 12
    };
  }

  /* ==================================================================
     6. THE SURVEY

     alpha is the angle between the track and the ridge axis. A
     perpendicular crossing is 90 degrees. The ridge-normal displacement
     along a track of length s is

         x_normal = s * sin(alpha)

     so an oblique track stretches every band along the track by
     1/sin(alpha). At small alpha the ridge-normal coverage collapses
     and the survey stops constraining the rate at all; `geometryWarning`
     says so rather than letting the instrument pretend otherwise.
     =============================================================== */
  function sampleSurveyTrack(survey) {
    var alpha = survey.trackAngleDeg * Math.PI / 180;
    var sinA = Math.sin(alpha), cosA = Math.cos(alpha);
    var n = Math.max(2, Math.floor(survey.trackLengthKm / survey.sampleSpacingKm) + 1);
    var s = new Float64Array(n), xNom = new Float64Array(n),
        chartY = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      s[i] = i * survey.sampleSpacingKm;
      xNom[i] = survey.trackStartKm + s[i] * sinA;
      chartY[i] = (survey.trackStartYKm || 0) + s[i] * cosA;
    }
    return {
      n: n, s: s, xNominal: xNom, chartY: chartY,
      sinAlpha: sinA, cosAlpha: cosA,
      normalSpanKm: survey.trackLengthKm * sinA,
      apparentWidthFactor: sinA > 1e-6 ? 1 / sinA : Infinity
    };
  }

  function geometryWarning(survey) {
    var a = survey.trackAngleDeg;
    if (a < 15) return { level: "fail", text: "At " + a + "° to the ridge the track is very nearly along strike. The ridge-normal coverage is " + (Math.sin(a * Math.PI / 180)).toFixed(2) + " of the track length. This survey cannot constrain a spreading rate." };
    if (a < 30) return { level: "warn", text: "At " + a + "° the apparent band widths are stretched by a factor of " + (1 / Math.sin(a * Math.PI / 180)).toFixed(2) + ". A rate read straight off the trace will be too high by that factor." };
    if (a < 70) return { level: "note", text: "At " + a + "° the apparent band widths are stretched by " + (1 / Math.sin(a * Math.PI / 180)).toFixed(2) + "×. Correct for it before quoting a rate." };
    return null;
  }

  /* Instrument effects, all from one stream, drawn in a fixed order:
     navigation, then noise, then dropout, sample by sample. */
  function addInstrumentEffects(clean, survey, track, seed, transectIndex) {
    var n = clean.length;
    var rng = new RNG(mixSeed(seed, "obs", transectIndex));
    var values = new Float64Array(n);
    var missing = new Uint8Array(n);
    var trend = new Float64Array(n);
    var noise = new Float64Array(n);

    /* A regional field the survey cannot separate from the crustal
       signal without fitting it: a linear ramp with a gentle curvature
       and a constant offset, all in nT. */
    var slope = survey.trendNtPer100km / 100;
    var offRng = new RNG(mixSeed(seed, "trend", transectIndex));
    var offset = (offRng.next() * 2 - 1) * 80;
    var curv = (offRng.next() * 2 - 1) * survey.trendNtPer100km * 4e-5;

    for (var i = 0; i < n; i++) {
      var s = track.s[i];
      trend[i] = offset + slope * s + curv * s * s;
      var nv = rng.normal();                       /* drawn even at zero noise, */
      noise[i] = survey.noiseNt > 0 ? nv * survey.noiseNt : 0;  /* so the stream is stable */
      var drop = rng.next();
      missing[i] = (survey.dropoutRate > 0 && drop < survey.dropoutRate) ? 1 : 0;
      values[i] = clean[i] + trend[i] + noise[i];
    }
    return { values: values, missing: missing, trend: trend, noise: noise };
  }

  function navOffsets(survey, track, seed, transectIndex) {
    var n = track.n, off = new Float64Array(n);
    var rng = new RNG(mixSeed(seed, "nav", transectIndex));
    for (var i = 0; i < n; i++) {
      var d = rng.normal();
      off[i] = survey.navJitterKm > 0 ? d * survey.navJitterKm : 0;
    }
    return off;
  }

  /* One transect, start to finish. The returned object is everything
     the operator is allowed to know about this line. */
  function runTransect(world, survey, seed, transectIndex) {
    var track = sampleSurveyTrack(survey);
    var g = geometry(survey.sensorAltitudeKm, world.layerThicknessKm, world.effInclinationDeg);

    /* The reading is taken where the ship actually was ... */
    var offs = navOffsets(survey, track, seed, transectIndex);
    var xTrue = new Float64Array(track.n);
    for (var i = 0; i < track.n; i++) xTrue[i] = track.xNominal[i] + offs[i];

    var clean = forwardMagneticProfile(world.blocks, xTrue, g);
    var eff = addInstrumentEffects(clean, survey, track, seed, transectIndex);

    /* ... and logged where the ship thought it was. */
    var out = {
      index: transectIndex,
      n: track.n,
      s: track.s,
      x: track.xNominal,          /* recorded ridge-normal position, km   */
      xTrue: xTrue,               /* hidden: where the reading was taken  */
      chartY: track.chartY,
      values: eff.values,         /* nT, observed                         */
      missing: eff.missing,
      cleanTrue: clean,           /* hidden: crustal signal alone         */
      trendTrue: eff.trend,       /* hidden                               */
      noiseTrue: eff.noise,       /* hidden                               */
      track: track,
      survey: cloneSurvey(survey),
      geometry: g,
      costHours: survey.trackLengthKm / (survey.shipSpeedKn * 1.852)
    };
    checkFinite(out.values, "transect values");
    checkFinite(out.cleanTrue, "transect clean signal");
    return out;
  }

  function cloneSurvey(s) {
    var o = {};
    for (var k in s) if (s.hasOwnProperty(k)) o[k] = s[k];
    return o;
  }

  function checkFinite(arr, where) {
    for (var i = 0; i < arr.length; i++) {
      if (!isFinite(arr[i])) throw new Error("non-finite value at " + i + " in " + where);
    }
    return arr;
  }

  /* ==================================================================
     7. INFERENCE

     Candidate models generate their own predictions from the operator's
     data. Nothing is pre-written. Each candidate has:

       - a structural part, which builds a crust and computes the
         profile the forward model says it would produce;
       - a set of linear nuisance parameters (amplitude, and a quadratic
         regional trend) fitted by least squares, because no operator
         knows the absolute magnetisation or the regional field.

     Fitting the nuisance parameters by least squares for EVERY
     candidate is what makes the comparison fair. Fitting them for one
     candidate and not the others would decide the result in advance.
     =============================================================== */

  /* --- small dense least squares, normal equations with column
         scaling. Enough for the 4-30 columns used here, and it reports
         failure instead of returning a silent NaN. --- */
  function lstsq(cols, y, w) {
    var k = cols.length, n = y.length, i, j, r, c;
    var scale = new Float64Array(k);
    for (j = 0; j < k; j++) {
      var mx = 0;
      for (i = 0; i < n; i++) if (w[i]) { var v = Math.abs(cols[j][i]); if (v > mx) mx = v; }
      scale[j] = mx > 1e-12 ? mx : 1;
    }
    var A = [], b = new Float64Array(k);
    for (j = 0; j < k; j++) { A.push(new Float64Array(k + 1)); }
    for (j = 0; j < k; j++) {
      for (c = 0; c < k; c++) {
        var sum = 0;
        for (i = 0; i < n; i++) if (w[i]) sum += (cols[j][i] / scale[j]) * (cols[c][i] / scale[c]);
        A[j][c] = sum;
      }
      var sy = 0;
      for (i = 0; i < n; i++) if (w[i]) sy += (cols[j][i] / scale[j]) * y[i];
      A[j][k] = sy;
    }
    /* Tikhonov whisper on the diagonal: keeps a rank-deficient design
       (a candidate whose prediction is identically flat, for instance)
       from producing NaN. */
    for (j = 0; j < k; j++) A[j][j] += 1e-9 * (A[j][j] || 1);

    for (j = 0; j < k; j++) {
      var piv = j;
      for (r = j + 1; r < k; r++) if (Math.abs(A[r][j]) > Math.abs(A[piv][j])) piv = r;
      var tmp = A[j]; A[j] = A[piv]; A[piv] = tmp;
      if (Math.abs(A[j][j]) < 1e-14) return null;
      for (r = j + 1; r < k; r++) {
        var f = A[r][j] / A[j][j];
        for (c = j; c <= k; c++) A[r][c] -= f * A[j][c];
      }
    }
    var x = new Float64Array(k);
    for (j = k - 1; j >= 0; j--) {
      var s2 = A[j][k];
      for (c = j + 1; c < k; c++) s2 -= A[j][c] * x[c];
      x[j] = s2 / A[j][j];
    }
    for (j = 0; j < k; j++) { x[j] /= scale[j]; if (!isFinite(x[j])) return null; }
    return x;
  }

  /* Pool one or more transects into flat arrays, dropping missing
     samples. Missing samples are dropped from the FIT; they are never
     replaced with a value. */
  function poolData(transects) {
    var n = 0, t, i;
    for (t = 0; t < transects.length; t++) n += transects[t].n;
    var x = new Float64Array(n), y = new Float64Array(n), s = new Float64Array(n),
        w = new Uint8Array(n), tid = new Int32Array(n);
    var k = 0;
    for (t = 0; t < transects.length; t++) {
      var tr = transects[t];
      for (i = 0; i < tr.n; i++) {
        x[k] = tr.x[i]; y[k] = tr.values[i]; s[k] = tr.s[i];
        w[k] = tr.missing[i] ? 0 : 1; tid[k] = t; k++;
      }
    }
    var used = 0;
    for (i = 0; i < n; i++) if (w[i]) used++;
    return { n: n, used: used, x: x, y: y, s: s, w: w, tid: tid, transects: transects };
  }

  /* Nuisance columns: constant, along-track ramp, along-track
     curvature — one set per transect, because two lines run on
     different days do not share a regional offset. */
  function nuisanceColumns(data) {
    var cols = [], nT = data.transects.length, t, i;
    var maxS = 1;
    for (i = 0; i < data.n; i++) if (data.s[i] > maxS) maxS = data.s[i];
    for (t = 0; t < nT; t++) {
      var c0 = new Float64Array(data.n), c1 = new Float64Array(data.n), c2 = new Float64Array(data.n);
      for (i = 0; i < data.n; i++) {
        if (data.tid[i] !== t) continue;
        var u = data.s[i] / maxS;
        c0[i] = 1; c1[i] = u; c2[i] = u * u;
      }
      cols.push(c0, c1, c2);
    }
    return cols;
  }

  /* Structural prediction for a spreading candidate, per unit
     magnetisation, at the recorded positions. */
  function structuralColumn(data, cand, table, mask) {
    var spec = {
      generator: cand.generator || "spreading",
      seed: cand.seed || 1,
      ridgeAxisKm: cand.axisKm,
      halfRateLeftCmYr: cand.halfRateLeftCmYr,
      halfRateRightCmYr: cand.halfRateRightCmYr,
      effInclinationDeg: cand.effInclinationDeg,
      magnetisationAm: 1,
      layerThicknessKm: cand.layerThicknessKm,
      chronology: cand.chronology
    };
    var w = makeWorld(spec);
    return forwardMagneticProfileFast(w.blocks, data.x, table, mask);
  }

  /* A Fourier basis over the along-track coordinate: the "stationary
     crust with spatially correlated magnetisation" candidate. It has no
     axis, no rate and no chronology — it just has enough freedom to
     follow a wiggly line, which is exactly the point being made. */
  function fourierColumns(data, K) {
    var cols = [], i, k;
    var maxS = 1;
    for (i = 0; i < data.n; i++) if (data.s[i] > maxS) maxS = data.s[i];
    for (k = 1; k <= K; k++) {
      var cc = new Float64Array(data.n), ss = new Float64Array(data.n);
      for (i = 0; i < data.n; i++) {
        var th = Math.PI * k * data.s[i] / maxS;
        cc[i] = Math.cos(th); ss[i] = Math.sin(th);
      }
      cols.push(cc, ss);
    }
    return cols;
  }

  function fitLinear(data, structCols, mask) {
    var cols = nuisanceColumns(data).concat(structCols);
    var w = mask || data.w;
    var beta = lstsq(cols, data.y, w);
    if (!beta) return null;
    var pred = new Float64Array(data.n);
    for (var i = 0; i < data.n; i++) {
      var v = 0;
      for (var j = 0; j < cols.length; j++) v += beta[j] * cols[j][i];
      pred[i] = v;
    }
    return { beta: beta, pred: pred, k: cols.length };
  }

  /* ---- fit statistics --------------------------------------------
     RMSE, correlation, and the lag-1 autocorrelation of the residual,
     which is the one that tells you the model is wrong in a structured
     way rather than merely imprecise. */
  function evaluateCandidateModel(y, pred, w, tid) {
    var n = 0, i, rss = 0;
    var sy = 0, sp = 0;
    for (i = 0; i < y.length; i++) {
      if (!w[i]) continue;
      n++; sy += y[i]; sp += pred[i];
      var r = y[i] - pred[i];
      rss += r * r;
    }
    if (n < 4) return { n: n, rmse: NaN, r: NaN, lag1: NaN, rss: NaN };
    var my = sy / n, mp = sp / n;
    var sxy = 0, sxx = 0, spp = 0;
    for (i = 0; i < y.length; i++) {
      if (!w[i]) continue;
      sxy += (y[i] - my) * (pred[i] - mp);
      sxx += (y[i] - my) * (y[i] - my);
      spp += (pred[i] - mp) * (pred[i] - mp);
    }
    var corr = (sxx > 0 && spp > 0) ? sxy / Math.sqrt(sxx * spp) : 0;

    /* lag-1 autocorrelation, within a transect only */
    var num = 0, den = 0, prev = null, prevT = -1;
    for (i = 0; i < y.length; i++) {
      if (!w[i]) { prev = null; continue; }
      var res = y[i] - pred[i];
      var thisT = tid ? tid[i] : 0;
      if (prev !== null && thisT === prevT) num += prev * res;
      den += res * res;
      prev = res; prevT = thisT;
    }
    return {
      n: n,
      rmse: Math.sqrt(rss / n),
      rss: rss,
      r: corr,
      lag1: den > 0 ? num / den : 0
    };
  }

  /* AICc. Reported as a comparison aid and labelled as one. It is not a
     probability that a model is true and the interface never calls it
     one. */
  function aicc(rss, n, k) {
    if (!(n > k + 2) || !(rss > 0)) return NaN;
    return n * Math.log(rss / n) + 2 * k + (2 * k * (k + 1)) / (n - k - 1);
  }

  /* ==================================================================
     8. THE SEARCH

     Why this is not one grid over (axis, rate).

     A chronology with two dozen boundaries is a very long ruler. A rate
     error of one part in fifty displaces the outermost boundary of a
     100 km profile by four kilometres — wider than the short subchrons
     out there — and the residual jumps from the noise floor to the full
     variance of the data. The misfit surface is a needle. A grid coarse
     enough to be quick steps straight over it; a grid fine enough to
     catch it has of order a million nodes, and three million if the two
     flanks are allowed to differ.

     So the search works outward from the axis, the way a person works:

       A  For each candidate ridge position, treat the two flanks
          separately. On each flank, sweep the whole rate range against
          a window holding roughly 1.7 Ma of crust on that side, and
          keep that flank's best rate. Score the position by how much of
          the variance the two flanks together explain. Over that short
          a window the misfit is a smooth function of the rate, so a
          coarse sweep finds the neighbourhood.

          Because each candidate rate brings its own window with it, the
          scores are divided by the residual of a nuisance-only fit on
          exactly the same samples. Comparing a raw residual from a
          40 km window with one from a 100 km window would be
          meaningless, and the code never does it.

       B  Open the window to about seventy per cent of the profile and
          refine the axis and both rates together. Unequal flanks make
          those three strongly coupled: move the axis a kilometre and
          both rates want to follow, so refining them one at a time
          converges on a compromise that fits neither side.

       C  Open the window to the whole profile — the pass where the long
          ruler finally bites — and refine again, ten times finer.

       D  Rescore every survivor on the whole profile, so candidates that
          took different routes are compared on the same data.

       E  A last joint refinement of the winner.

     Every candidate WITHIN a stage is scored on the same samples, or on
     a normalised statistic when it cannot be.

     Exposed as a stepped object so the interface can run it across
     animation frames and never freeze the page.
     =============================================================== */
  function makeSearch(data, opts) {
    opts = opts || {};
    var g = geometry(opts.sensorAltitudeKm, opts.layerThicknessKm, opts.effInclinationDeg);
    var table = edgeTable(g, 420, 0.02);
    var chronKey = opts.chronology || "published";
    var baseMask = opts.fitMask || data.w;
    var asymmetric = !!opts.asymmetric;
    var TOPK = asymmetric ? 2 : 3;

    var RATE_MIN = 0.5, RATE_MAX = 8.0;

    var xmin = Infinity, xmax = -Infinity, i;
    for (i = 0; i < data.n; i++) {
      if (!baseMask[i]) continue;
      if (data.x[i] < xmin) xmin = data.x[i];
      if (data.x[i] > xmax) xmax = data.x[i];
    }
    var span = xmax - xmin;

    /* ---- masks --------------------------------------------------- */
    function windowMask(c, halfWidth, side, stride) {
      var m = new Uint8Array(data.n), k = 0;
      for (var j = 0; j < data.n; j++) {
        if (!baseMask[j]) continue;
        if (halfWidth > 0 && Math.abs(data.x[j] - c) > halfWidth) continue;
        if (side < 0 && data.x[j] >= c) continue;
        if (side > 0 && data.x[j] < c) continue;
        if (stride > 1 && (j % stride) !== 0) continue;
        m[j] = 1; k++;
      }
      return k >= 24 ? m : null;
    }

    /* ---- scoring -------------------------------------------------- */
    function scoreAt(axis, rL, rR, mask, normalise) {
      var cand = {
        generator: "spreading", axisKm: axis,
        halfRateLeftCmYr: rL, halfRateRightCmYr: rR,
        effInclinationDeg: opts.effInclinationDeg,
        layerThicknessKm: opts.layerThicknessKm,
        chronology: chronKey, seed: opts.chronologySeed || 1
      };
      var col = structuralColumn(data, cand, table, mask);
      var f = fitLinear(data, [col], mask);
      if (!f) return null;
      var st = evaluateCandidateModel(data.y, f.pred, mask, data.tid);
      if (!isFinite(st.rss)) return null;
      var rank = st.rss;
      if (normalise) {
        var f0 = fitLinear(data, [], mask);
        if (!f0) return null;
        var st0 = evaluateCandidateModel(data.y, f0.pred, mask, data.tid);
        if (!(st0.rss > 0)) return null;
        rank = st.rss / st0.rss;
      }
      return { cand: cand, fit: f, stats: st, rss: rank, rawRss: st.rss, column: col };
    }

    function geomSeq(lo, hi, ratio) {
      var out = [], v = lo;
      while (v <= hi * 1.0001 && out.length < 5000) { out.push(v); v *= ratio; }
      return out;
    }
    function linSeq(c, half, n) {
      var out = [];
      for (var k = 0; k < n; k++) out.push(c - half + (2 * half) * (n === 1 ? 0.5 : k / (n - 1)));
      return out;
    }
    function harvest(list, k, sepKm) {
      list.sort(function (a, b) { return a.rss - b.rss; });
      var keep = [];
      for (var j = 0; j < list.length && keep.length < k; j++) {
        var clash = false;
        for (var m = 0; m < keep.length; m++) {
          if (Math.abs(keep[m].cand.axisKm - list[j].cand.axisKm) < (sepKm || 0)) { clash = true; break; }
        }
        if (!clash) keep.push(list[j]);
      }
      return keep;
    }

    /* ---- state ---------------------------------------------------- */
    var stage = "A", queue = [], qi = 0, stageMask = null, stageBest = [],
        pool = [], best = null, done = false, seen = 0, planned = 1;
    var parentIndex = 0, pass = 0;

    /* Stage A is organised as one job per candidate ridge position; each
       job runs both flank sweeps itself, because the two sweeps have to
       be added together before the position means anything. */
    var A_RATES = geomSeq(RATE_MIN, RATE_MAX, 1.045);
    var A_STRIDE = data.used > 500 ? 3 : (data.used > 260 ? 2 : 1);

    function buildA() {
      var step = Math.max(1.0, span / 110);
      queue = [];
      for (var a = xmin + 0.04 * span; a <= xmax - 0.04 * span; a += step) queue.push({ kind: "A", axis: a });
      qi = 0; stageBest = [];
      planned = queue.length * A_RATES.length * 2 * 1.5;
    }

    function runA(job) {
      var a = job.axis, k, s;
      var bestL = null, bestR = null;
      for (k = 0; k < A_RATES.length; k++) {
        var r = A_RATES[k];
        var half = Math.max(25, Math.min(0.55 * span, 10 * r * 1.7));
        var mL = windowMask(a, half, -1, A_STRIDE);
        if (mL) { s = scoreAt(a, r, 2, mL, true); if (s && (!bestL || s.rss < bestL.rss)) bestL = s; }
        var mR = windowMask(a, half, +1, A_STRIDE);
        if (mR) { s = scoreAt(a, 2, r, mR, true); if (s && (!bestR || s.rss < bestR.rss)) bestR = s; }
        seen += 2;
      }
      if (!bestL && !bestR) return null;
      var rL = bestL ? bestL.cand.halfRateLeftCmYr : bestR.cand.halfRateRightCmYr;
      var rR = bestR ? bestR.cand.halfRateRightCmYr : rL;
      if (!asymmetric) {
        /* tie the flanks: take whichever side explained more, so a
           symmetric candidate is not handed the average of a good side
           and a bad one */
        var use = (!bestR || (bestL && bestL.rss <= bestR.rss)) ? rL : rR;
        rL = rR = use;
      }
      return {
        cand: { axisKm: a, halfRateLeftCmYr: rL, halfRateRightCmYr: rR },
        rss: (bestL ? bestL.rss : 1) + (bestR ? bestR.rss : 1)
      };
    }

    /* Refinement passes. Window as a fraction of the profile; rate
       tolerance and step chosen so that the step displaces the outermost
       boundary by roughly half a kilometre, and the range covers five
       steps of the pass before. */
    var PASS_FRAC = [0.36, 0.55];
    var PASS_AX   = [2.6, 0.9];
    var PASS_AXN  = [11, 9];
    var PASS_TOL  = [0.032, 0.005];
    var PASS_N    = [asymmetric ? 9 : 17, asymmetric ? 11 : 21];

    function buildRefine(p, frac, axHalf, axN, tol, nRate) {
      stageMask = windowMask(p.cand.axisKm, frac > 0 ? frac * span : 0, 0, 1) || baseMask;
      var axes = linSeq(p.cand.axisKm, axHalf, axN);
      var ls = linSeq(p.cand.halfRateLeftCmYr, tol * p.cand.halfRateLeftCmYr, nRate);
      var rs = asymmetric ? linSeq(p.cand.halfRateRightCmYr, tol * p.cand.halfRateRightCmYr, nRate) : null;
      queue = [];
      for (var a = 0; a < axes.length; a++) {
        for (var l = 0; l < ls.length; l++) {
          if (!asymmetric) queue.push({ kind: "R", axis: axes[a], rL: ls[l], rR: ls[l] });
          else for (var q = 0; q < rs.length; q++)
            queue.push({ kind: "R", axis: axes[a], rL: ls[l], rR: rs[q] });
        }
      }
      qi = 0; stageBest = [];
    }

    function buildB() {
      buildRefine(pool[parentIndex], PASS_FRAC[pass], PASS_AX[pass], PASS_AXN[pass],
                  PASS_TOL[pass], PASS_N[pass]);
    }

    function buildD() {
      stageMask = baseMask;
      queue = [];
      for (var j = 0; j < pool.length; j++) {
        queue.push({ kind: "R", axis: pool[j].cand.axisKm,
                     rL: pool[j].cand.halfRateLeftCmYr, rR: pool[j].cand.halfRateRightCmYr });
      }
      qi = 0; stageBest = [];
    }

    function buildE() {
      stageMask = baseMask;
      var axes = linSeq(best.cand.axisKm, 0.35, 9);
      var ls = linSeq(best.cand.halfRateLeftCmYr, 0.0012 * best.cand.halfRateLeftCmYr, 11);
      var rs = asymmetric ? linSeq(best.cand.halfRateRightCmYr, 0.0012 * best.cand.halfRateRightCmYr, 11) : null;
      queue = [];
      for (var a = 0; a < axes.length; a++)
        for (var l = 0; l < ls.length; l++) {
          if (!asymmetric) queue.push({ kind: "R", axis: axes[a], rL: ls[l], rR: ls[l] });
          else for (var q = 0; q < rs.length; q++)
            queue.push({ kind: "R", axis: axes[a], rL: ls[l], rR: rs[q] });
        }
      qi = 0; stageBest = [];
    }

    function run(job) {
      if (job.kind === "A") return runA(job);
      return scoreAt(job.axis, job.rL, job.rR, stageMask, false);
    }

    function advance() {
      var top;
      switch (stage) {
        case "A":
          pool = harvest(stageBest, TOPK, Math.max(6, 0.04 * span));
          if (!pool.length) { done = true; return; }
          parentIndex = 0; pass = 0; stage = "B"; buildB();
          return;
        case "B":
          top = harvest(stageBest, 1)[0];
          if (top) pool[parentIndex] = { cand: {
            axisKm: top.cand.axisKm,
            halfRateLeftCmYr: top.cand.halfRateLeftCmYr,
            halfRateRightCmYr: top.cand.halfRateRightCmYr }, rss: top.rss };
          pass++;
          if (pass < PASS_FRAC.length) { buildB(); return; }
          parentIndex++;
          if (parentIndex < pool.length) { pass = 0; buildB(); return; }
          stage = "D"; buildD();
          return;
        case "D":
          top = harvest(stageBest, 1)[0];
          if (!top) { done = true; return; }
          best = top; stage = "E"; buildE();
          return;
        default:
          top = harvest(stageBest, 1)[0];
          if (top && top.rss < best.rss) best = top;
          done = true;
          return;
      }
    }

    buildA();

    return {
      progress: function () { return done ? 1 : Math.min(0.98, seen / planned); },
      done: function () { return done; },
      best: function () { return best; },
      stage: function () { return stage; },
      step: function (budget) {
        var count = 0;
        while (!done && count < budget) {
          if (qi >= queue.length) { advance(); continue; }
          var job = queue[qi++];
          var s = run(job);
          count += (job.kind === "A") ? A_RATES.length * 2 : 1;
          if (job.kind !== "A") seen++;
          if (s) stageBest.push(s);
        }
        return done;
      },
      runToCompletion: function (maxIter) {
        var guard = maxIter || 100000;
        while (!done && guard-- > 0) this.step(600);
        return best;
      }
    };
  }

  /* ==================================================================
     9. CANDIDATE MODEL SET

     Four explanations, evaluated the same way. The verdicts are not
     written anywhere: they come out of the numbers.
     =============================================================== */
  function candidateSet(data, opts) {
    var g = geometry(opts.sensorAltitudeKm, opts.layerThicknessKm, opts.effInclinationDeg);
    var table = edgeTable(g, 420, 0.02);
    var out = [];

    function finishOne(key, label, detail, col, extraK, fitted) {
      var f = fitLinear(data, col ? [col] : [], opts.fitMask);
      if (!f) return null;
      var st = evaluateCandidateModel(data.y, f.pred, opts.fitMask || data.w, data.tid);
      var k = f.k + (extraK || 0);
      return {
        key: key, label: label, detail: detail,
        pred: f.pred, stats: st, k: k, fit: f, cols: col ? [col] : [],
        nNuisance: 3 * data.transects.length,
        aicc: aicc(st.rss, st.n, k),
        fitted: fitted || {}
      };
    }

    /* 1. symmetric spreading with reversals.
       The two structural searches are the expensive part. The interface
       runs them itself, stepped across animation frames, and hands the
       results in; node runs them here. Either way the candidates are
       assembled from the same code. */
    var s1 = opts.searchResults ? opts.searchResults.symmetric
      : makeSearch(data, { sensorAltitudeKm: opts.sensorAltitudeKm,
      layerThicknessKm: opts.layerThicknessKm, effInclinationDeg: opts.effInclinationDeg,
      chronology: opts.chronology, asymmetric: false, fitMask: opts.fitMask }).runToCompletion();
    if (s1) {
      var st1 = evaluateCandidateModel(data.y, s1.fit.pred, opts.fitMask || data.w, data.tid);
      out.push({
        key: "symmetric", label: "Symmetric spreading with field reversals",
        detail: "One axis, one half rate applied to both flanks, polarity from the selected chronology.",
        pred: s1.fit.pred, stats: st1, k: s1.fit.k + 2, fit: s1.fit,
        nNuisance: 3 * data.transects.length,
        aicc: aicc(st1.rss, st1.n, s1.fit.k + 2),
        cols: [s1.column],
        fitted: { axisKm: s1.cand.axisKm, halfRateLeftCmYr: s1.cand.halfRateLeftCmYr,
                  halfRateRightCmYr: s1.cand.halfRateRightCmYr }
      });
    }

    /* 2. asymmetric spreading with reversals */
    var s2 = opts.searchResults ? opts.searchResults.asymmetric
      : makeSearch(data, { sensorAltitudeKm: opts.sensorAltitudeKm,
      layerThicknessKm: opts.layerThicknessKm, effInclinationDeg: opts.effInclinationDeg,
      chronology: opts.chronology, asymmetric: true, fitMask: opts.fitMask }).runToCompletion();
    if (s2) {
      var st2 = evaluateCandidateModel(data.y, s2.fit.pred, opts.fitMask || data.w, data.tid);
      out.push({
        key: "asymmetric", label: "Asymmetric spreading with field reversals",
        detail: "One axis, two independent half rates, polarity from the selected chronology.",
        pred: s2.fit.pred, stats: st2, k: s2.fit.k + 3, fit: s2.fit,
        nNuisance: 3 * data.transects.length,
        aicc: aicc(st2.rss, st2.n, s2.fit.k + 3),
        cols: [s2.column],
        fitted: { axisKm: s2.cand.axisKm, halfRateLeftCmYr: s2.cand.halfRateLeftCmYr,
                  halfRateRightCmYr: s2.cand.halfRateRightCmYr }
      });
    }

    /* 3. stationary crust, spatially correlated magnetisation */
    var K = Math.max(4, Math.min(14, Math.round(data.used / 40)));
    var fcols = fourierColumns(data, K);
    var f3 = fitLinear(data, fcols, opts.fitMask);
    if (f3) {
      var st3 = evaluateCandidateModel(data.y, f3.pred, opts.fitMask || data.w, data.tid);
      out.push({
        key: "static", label: "Stationary crust, correlated magnetisation",
        detail: "No axis, no rate, no chronology. A smooth field with " + K + " spatial components, fitted directly to the trace. It can follow almost anything, which is why its parameter count matters.",
        pred: f3.pred, stats: st3, k: f3.k, fit: f3, cols: fcols,
        nNuisance: 3 * data.transects.length,
        aicc: aicc(st3.rss, st3.n, f3.k),
        fitted: { components: K }
      });
    }

    /* 4. spreading with a constant-polarity field */
    var c4 = { generator: "constantPolarity", axisKm: 0,
               halfRateLeftCmYr: 2, halfRateRightCmYr: 2,
               effInclinationDeg: opts.effInclinationDeg,
               layerThicknessKm: opts.layerThicknessKm, chronology: opts.chronology };
    var col4 = structuralColumn(data, c4, table);
    var r4 = finishOne("constant", "Spreading with a constant-polarity field",
      "Crust is manufactured and carried away, but the field never reverses. Uniform magnetisation contributes essentially nothing to the anomaly, so this model can only fit the regional trend.",
      col4, 1);
    if (r4) out.push(r4);

    /* rank by AICc, and record how close the field is */
    var bestA = Infinity;
    for (var i = 0; i < out.length; i++) if (isFinite(out[i].aicc) && out[i].aicc < bestA) bestA = out[i].aicc;
    for (i = 0; i < out.length; i++) out[i].dAICc = isFinite(out[i].aicc) ? out[i].aicc - bestA : NaN;
    out.sort(function (a, b) { return (isFinite(a.aicc) ? a.aicc : 1e18) - (isFinite(b.aicc) ? b.aicc : 1e18); });
    return out;
  }

  /* Held-out scoring for one candidate.

     The structural part of the fit is frozen at what the training
     transects produced. Only the regional nuisance terms — offset, ramp
     and curvature — are refitted on the held-out line, because a
     regional field is something every survey line has to have fitted for
     it and freezing it would penalise every model equally and tell us
     nothing. What is being tested is whether the STRUCTURE transfers.  */
  function heldOutScore(data, cand, holdMask) {
    if (!cand.fit || !cand.cols || !cand.cols.length) return null;
    var i, j, n = data.n;
    var beta = cand.fit.beta, nNu = cand.nNuisance;
    var structOnly = new Float64Array(n);
    for (j = 0; j < cand.cols.length; j++) {
      var b = beta[nNu + j];
      var col = cand.cols[j];
      for (i = 0; i < n; i++) structOnly[i] += b * col[i];
    }
    var resid = new Float64Array(n);
    for (i = 0; i < n; i++) resid[i] = data.y[i] - structOnly[i];
    var maxS = 1;
    for (i = 0; i < n; i++) if (data.s[i] > maxS) maxS = data.s[i];
    var c0 = new Float64Array(n), c1 = new Float64Array(n), c2 = new Float64Array(n);
    for (i = 0; i < n; i++) {
      if (!holdMask[i]) continue;
      var u = data.s[i] / maxS;
      c0[i] = 1; c1[i] = u; c2[i] = u * u;
    }
    var nb = lstsq([c0, c1, c2], resid, holdMask);
    if (!nb) return null;
    var pred = new Float64Array(n);
    for (i = 0; i < n; i++) pred[i] = structOnly[i] + nb[0] * c0[i] + nb[1] * c1[i] + nb[2] * c2[i];
    return evaluateCandidateModel(data.y, pred, holdMask, data.tid);
  }

  /* Held-out scoring: fit everything on all but the last transect,
     then score on the last. The most useful single number in the whole
     comparison, and the one that punishes the flexible model. */
  function heldOutMask(data, holdTransect) {
    var m = new Uint8Array(data.n);
    for (var i = 0; i < data.n; i++) m[i] = (data.w[i] && data.tid[i] !== holdTransect) ? 1 : 0;
    return m;
  }
  function holdMaskOnly(data, holdTransect) {
    var m = new Uint8Array(data.n);
    for (var i = 0; i < data.n; i++) m[i] = (data.w[i] && data.tid[i] === holdTransect) ? 1 : 0;
    return m;
  }

  /* How distinguishable are the two best models, really? If the
     difference in held-out RMSE is inside the noise on that difference,
     the honest answer is that this survey cannot tell them apart. */
  function distinguishability(a, b, noiseNt) {
    if (!a || !b) return { separable: false, reason: "only one model produced a usable fit" };
    var d = Math.abs(a.rmse - b.rmse);
    var scale = Math.max(noiseNt, 1) / Math.sqrt(Math.max(a.n, 1));
    return {
      separable: d > 2 * scale,
      delta: d,
      threshold: 2 * scale,
      reason: d > 2 * scale
        ? "the difference in held-out error is larger than the sampling noise on that difference"
        : "the difference in held-out error is inside the sampling noise on that difference"
    };
  }

  /* ==================================================================
     10. THE INFERENCE REPORT
     =============================================================== */
  function inferenceReport(world, claim, data, candidates, opts) {
    var truthAxis = world.ridgeAxisKm;
    var rep = {
      axisErrorKm: claim.axisKm - truthAxis,
      leftRateError: claim.halfRateLeftCmYr - world.halfRateLeftCmYr,
      rightRateError: claim.halfRateRightCmYr - world.halfRateRightCmYr,
      fullRateError: (claim.halfRateLeftCmYr + claim.halfRateRightCmYr) - world.fullRateCmYr,
      claimedSymmetric: !!claim.symmetric,
      trueSymmetric: world.symmetric,
      claimedChronology: claim.chronology,
      trueChronology: world.chronologyKey,
      claimedModel: claim.model,
      trueGenerator: world.generator,
      confidence: claim.confidence,
      rationale: claim.rationale || "",
      budgetUsedHours: opts.budgetUsedHours,
      budgetHours: opts.budgetHours,
      transectsRun: data.transects.length,
      candidates: candidates
    };

    /* The operator's own numbers, run forward and scored against their
       own data. This is the number that answers "was my answer any
       good", separately from "did I pick the right model". */
    var g = geometry(opts.sensorAltitudeKm, opts.layerThicknessKm, opts.effInclinationDeg);
    var table = edgeTable(g, 420, 0.02);
    var col = structuralColumn(data, {
      generator: world.generator === "constantPolarity" ? "spreading" : "spreading",
      axisKm: claim.axisKm,
      halfRateLeftCmYr: claim.halfRateLeftCmYr,
      halfRateRightCmYr: claim.halfRateRightCmYr,
      effInclinationDeg: opts.effInclinationDeg,
      layerThicknessKm: opts.layerThicknessKm,
      chronology: claim.chronology
    }, table);
    var f = fitLinear(data, [col], null);
    if (f) {
      rep.claimStats = evaluateCandidateModel(data.y, f.pred, data.w, data.tid);
      rep.claimPred = f.pred;
    }

    /* Polarity-boundary alignment: how far the boundaries the operator's
       rate implies land from the true ones, over the surveyed window. */
    rep.boundaryAlignment = boundaryAlignment(world, claim, data);

    /* Residual structure warning. */
    if (rep.claimStats && Math.abs(rep.claimStats.lag1) > 0.45) {
      rep.residualWarning = "The residual is strongly autocorrelated (lag-1 " +
        rep.claimStats.lag1.toFixed(2) + "). Whatever is left over is structured, not random: " +
        "the model is missing something rather than merely being imprecise.";
    }

    /* Would another transect have helped? Answer from the data, not
       from a rule: it would if the two leading candidates were not
       separable, or if the surveyed ridge-normal span is short compared
       with the band widths the claim implies. */
    var normalSpan = 0;
    for (var t = 0; t < data.transects.length; t++) {
      normalSpan = Math.max(normalSpan, data.transects[t].track.normalSpanKm);
    }
    var impliedBandKm = 10 * Math.max(claim.halfRateLeftCmYr, claim.halfRateRightCmYr) * 0.78;
    rep.spanInBands = impliedBandKm > 0 ? normalSpan / impliedBandKm : 0;
    rep.moreDataAdvice =
      rep.spanInBands < 4
        ? "The surveyed ridge-normal span covers only " + rep.spanInBands.toFixed(1) +
          " Brunhes-widths at the rate claimed. A longer line, not a denser one, is what this survey was short of."
        : (candidates && candidates.length > 1 && !distinguishability(candidates[0].stats, candidates[1].stats, opts.noiseNt).separable
            ? "The two leading models were not separable on these data. A second transect elsewhere along the ridge would test them against something they were not fitted to."
            : "The survey covered enough ridge-normal ground to constrain the rate at the noise level present.");

    /* Confidence calibration: stated confidence against the error
       actually made, on the full rate. Reported, not scored. */
    var relErr = world.fullRateCmYr > 0 ? Math.abs(rep.fullRateError) / world.fullRateCmYr : NaN;
    rep.relativeFullRateError = relErr;
    rep.calibration =
      !isFinite(relErr) ? "not applicable"
      : (claim.confidence >= 80 && relErr > 0.25) ? "overconfident"
      : (claim.confidence <= 40 && relErr < 0.10) ? "underconfident"
      : "consistent";
    return rep;
  }

  function boundaryAlignment(world, claim, data) {
    if (world.generator !== "spreading") {
      return { applicable: false,
               note: "The hidden world was not generated by spreading with reversals, so there are no true polarity boundaries to align against." };
    }
    var xmin = Infinity, xmax = -Infinity, i;
    for (i = 0; i < data.n; i++) {
      if (!data.w[i]) continue;
      if (data.x[i] < xmin) xmin = data.x[i];
      if (data.x[i] > xmax) xmax = data.x[i];
    }
    var truth = [];
    for (i = 0; i < world.blocks.length; i++) {
      var b = world.blocks[i];
      if (b.x1 >= xmin && b.x1 <= xmax) truth.push(b.x1);
    }
    var claimWorld = makeWorld({
      generator: "spreading", seed: world.seed,
      ridgeAxisKm: claim.axisKm,
      halfRateLeftCmYr: claim.halfRateLeftCmYr,
      halfRateRightCmYr: claim.halfRateRightCmYr,
      effInclinationDeg: world.effInclinationDeg,
      magnetisationAm: world.magnetisationAm,
      layerThicknessKm: world.layerThicknessKm,
      chronology: claim.chronology
    });
    var got = [];
    for (i = 0; i < claimWorld.blocks.length; i++) {
      var c = claimWorld.blocks[i];
      if (c.x1 >= xmin && c.x1 <= xmax) got.push(c.x1);
    }
    if (!truth.length || !got.length) {
      return { applicable: false, note: "No polarity boundaries fell inside the surveyed window." };
    }
    var sum = 0, worst = 0;
    for (i = 0; i < truth.length; i++) {
      var best = Infinity;
      for (var j = 0; j < got.length; j++) {
        var d = Math.abs(got[j] - truth[i]);
        if (d < best) best = d;
      }
      sum += best; if (best > worst) worst = best;
    }
    return { applicable: true, nBoundaries: truth.length,
             meanOffsetKm: sum / truth.length, worstOffsetKm: worst };
  }

  /* ==================================================================
     11. EXPORT

     Everything needed to reproduce the run from a cold start, in one
     text file with a header that says what each column is.
     =============================================================== */
  function exportObservations(session) {
    var w = session.world, lines = [];
    var i, t;
    lines.push("# The Magnetic Ocean — survey export");
    lines.push("# model_version: " + session.modelVersion);
    lines.push("# generated: run seed " + session.seed + ", mode " + session.mode);
    lines.push("# ");
    lines.push("# UNITS");
    lines.push("#   x_km             ridge-normal position as LOGGED by the ship, km east on the operator's chart");
    lines.push("#   s_km             along-track distance from the start of the transect, km");
    lines.push("#   anomaly_nT       total-field magnetic anomaly, nT. Blank where the reading was lost.");
    lines.push("#   missing          1 if the reading was lost. Lost readings are blank, never zero.");
    lines.push("# ");
    lines.push("# SETTINGS (identical seed + settings reproduce this file exactly)");
    lines.push("#   seed                 " + session.seed);
    lines.push("#   chronology           " + (session.revealed ? w.chronologyKey : "hidden until commitment"));
    lines.push("#   track_angle_deg      " + session.survey.trackAngleDeg);
    lines.push("#   sensor_altitude_km   " + session.survey.sensorAltitudeKm);
    lines.push("#   sample_spacing_km    " + session.survey.sampleSpacingKm);
    lines.push("#   track_length_km      " + session.survey.trackLengthKm);
    lines.push("#   ship_speed_kn        " + session.survey.shipSpeedKn);
    lines.push("#   noise_nt_1sigma      " + session.survey.noiseNt);
    lines.push("#   trend_nt_per_100km   " + session.survey.trendNtPer100km);
    lines.push("#   nav_jitter_km_1sigma " + session.survey.navJitterKm);
    lines.push("#   dropout_rate         " + session.survey.dropoutRate);
    lines.push("#   layer_thickness_km   " + w.layerThicknessKm);
    lines.push("#   magnetisation_A_per_m " + w.magnetisationAm);
    if (session.revealed) {
      lines.push("# ");
      lines.push("# HIDDEN WORLD (present only because this run has been committed and revealed)");
      lines.push("#   generator            " + w.generator);
      lines.push("#   ridge_axis_km        " + w.ridgeAxisKm);
      lines.push("#   half_rate_left_cmyr  " + w.halfRateLeftCmYr);
      lines.push("#   half_rate_right_cmyr " + w.halfRateRightCmYr);
      lines.push("#   full_rate_cmyr       " + w.fullRateCmYr);
      lines.push("#   eff_inclination_deg  " + w.effInclinationDeg);
    } else {
      lines.push("# ");
      lines.push("# The hidden world is not in this file. It is written out only after the run is committed.");
    }
    lines.push("# ");
    lines.push("transect,x_km,s_km,anomaly_nT,missing");
    for (t = 0; t < session.transects.length; t++) {
      var tr = session.transects[t];
      for (i = 0; i < tr.n; i++) {
        lines.push([
          t + 1,
          tr.x[i].toFixed(4),
          tr.s[i].toFixed(4),
          tr.missing[i] ? "" : tr.values[i].toFixed(3),
          tr.missing[i] ? 1 : 0
        ].join(","));
      }
    }
    return lines.join("\n") + "\n";
  }

  /* ==================================================================
     12. PUBLIC SURFACE
     =============================================================== */
  return {
    /* randomness */
    RNG: RNG, mixSeed: mixSeed,
    /* chronology */
    publishedChronology: publishedChronology, syntheticChronology: syntheticChronology,
    chronologyByKey: chronologyByKey, polarityAtAge: polarityAtAge,
    chronNameAtAge: chronNameAtAge,
    /* geology */
    ageAtPosition: ageAtPosition, distanceForAge: distanceForAge,
    crustMagnetization: crustMagnetization, buildBlocks: buildBlocks,
    makeWorld: makeWorld, randomWorldSpec: randomWorldSpec,
    bathymetryKm: bathymetryKm,
    /* forward model */
    geometry: geometry, edgeTerm: edgeTerm,
    forwardMagneticProfile: forwardMagneticProfile,
    forwardMagneticProfileFast: forwardMagneticProfileFast,
    edgeTable: edgeTable, edgeLookup: edgeLookup,
    /* survey */
    sampleSurveyTrack: sampleSurveyTrack, geometryWarning: geometryWarning,
    addInstrumentEffects: addInstrumentEffects, navOffsets: navOffsets,
    runTransect: runTransect,
    /* inference */
    poolData: poolData, fitLinear: fitLinear, lstsq: lstsq,
    structuralColumn: structuralColumn, fourierColumns: fourierColumns,
    evaluateCandidateModel: evaluateCandidateModel, aicc: aicc,
    makeSearch: makeSearch, candidateSet: candidateSet,
    heldOutMask: heldOutMask, holdMaskOnly: holdMaskOnly, heldOutScore: heldOutScore,
    distinguishability: distinguishability,
    inferenceReport: inferenceReport, boundaryAlignment: boundaryAlignment,
    /* io */
    exportObservations: exportObservations,
    checkFinite: checkFinite
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = MagOcean;
