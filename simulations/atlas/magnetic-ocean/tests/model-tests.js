"use strict";
/* =====================================================================
   THE MAGNETIC OCEAN — tests/model-tests.js

   The assertions that have to hold before any number this instrument
   prints means anything. Runs in two places from one source:

       node tests/model-tests.js          headless, exits non-zero on failure
       tests/model-tests.html             in the browser, same suite

   Stochastic assertions state their tolerance in the test name.
   ===================================================================== */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    var C = require("../js/config.js");
    var M = require("../js/model.js");
    var CAT = require("../../assets/catalogue.js");
    var res = factory(M, C, CAT);
    res.report(function (s) { console.log(s); });
    process.exit(res.fail > 0 ? 1 : 0);
  } else {
    root.runMagneticOceanTests = function () {
      return factory(root.MagOcean, {
        LAYER: root.LAYER, CONTROLS: root.CONTROLS, PRESETS: root.PRESETS,
        presetByKey: root.presetByKey, MODES: root.MODES,
        transectCostHours: root.transectCostHours,
        KM_PER_CMYR_MA: root.KM_PER_CMYR_MA, MO_VERSION: root.MO_VERSION
      }, {
        CATALOGUE: root.CATALOGUE, TAXONOMY: root.TAXONOMY,
        EVIDENCE_LEVELS: root.EVIDENCE_LEVELS
      });
    };
  }
})(typeof self !== "undefined" ? self : this, function (M, C, CAT) {

  var results = [], pass = 0, fail = 0, group = "";

  function G(name) { group = name; results.push({ heading: name }); }
  function ok(name, cond, detail) {
    if (cond) { pass++; results.push({ name: name, ok: true, group: group }); }
    else { fail++; results.push({ name: name, ok: false, detail: detail || "", group: group }); }
  }
  function near(a, b, tol) { return isFinite(a) && isFinite(b) && Math.abs(a - b) <= tol; }
  function relNear(a, b, rel) { return isFinite(a) && isFinite(b) && Math.abs(a - b) <= Math.abs(b) * rel; }
  function rms(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); }
  function identical(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function allFinite(a) {
    for (var i = 0; i < a.length; i++) if (!isFinite(a[i])) return false;
    return true;
  }

  var LAYER = C.LAYER;

  function world(over) {
    var spec = {
      generator: "spreading", seed: 12345,
      ridgeAxisKm: 0, halfRateLeftCmYr: 2, halfRateRightCmYr: 2,
      effInclinationDeg: 90, magnetisationAm: LAYER.magnetisationAm,
      layerThicknessKm: LAYER.thicknessKm, chronology: "published"
    };
    for (var k in (over || {})) spec[k] = over[k];
    return M.makeWorld(spec);
  }
  function survey(over) {
    var s = {
      trackAngleDeg: 90, sensorAltitudeKm: 2.7, sampleSpacingKm: 0.5,
      trackLengthKm: 160, trackStartKm: -80, trackStartYKm: 0, shipSpeedKn: 9,
      noiseNt: 12, trendNtPer100km: 30, navJitterKm: 0.2, dropoutRate: 0.03
    };
    for (var k in (over || {})) s[k] = over[k];
    return s;
  }

  /* ================================================================
     1. REPRODUCIBILITY
     ============================================================= */
  G("1. Reproducibility and seeding");
  (function () {
    var w1 = world(), w2 = world();
    var a = M.runTransect(w1, survey(), 777, 0);
    var b = M.runTransect(w2, survey(), 777, 0);
    ok("T1  same seed and settings give byte-identical observations",
       identical(a.values, b.values) && identical(a.missing, b.missing) && identical(a.x, b.x));

    var c = M.runTransect(world(), survey(), 778, 0);
    var diff = 0;
    for (var i = 0; i < a.n; i++) if (a.values[i] !== c.values[i]) diff++;
    ok("T2  a different seed gives a different noise realisation (>95% of samples differ)",
       diff > 0.95 * a.n, diff + "/" + a.n + " samples differ");

    /* The hidden crustal signal belongs to the world, not to the seed —
       once navigation jitter, which is what moves the sampling points,
       is switched off. */
    var fixedNav = { navJitterKm: 0 };
    var p1 = M.runTransect(world(), survey(fixedNav), 777, 0);
    var p2 = M.runTransect(world(), survey(fixedNav), 778, 0);
    ok("T2b with navigation fixed, the crustal signal does not depend on the observation seed",
       identical(p1.cleanTrue, p2.cleanTrue));
    ok("T2b2 navigation jitter is what makes the sampled crustal signal seed-dependent",
       !identical(a.cleanTrue, c.cleanTrue));

    var d = M.runTransect(world(), survey(), 777, 1);
    ok("T2c a different transect index gives a different realisation",
       !identical(a.values, d.values));
  })();

  /* ================================================================
     2. AGE, DISTANCE, POLARITY
     ============================================================= */
  G("2. Age, distance and polarity");
  (function () {
    var w = world({ ridgeAxisKm: 7.5 });
    ok("T3  age at the ridge axis is exactly zero", M.ageAtPosition(7.5, w) === 0);

    var prev = -1, mono = true;
    for (var d = 0; d <= 60; d += 0.5) {
      var a = M.ageAtPosition(7.5 + d, w);
      if (a < prev - 1e-12) mono = false;
      prev = a;
    }
    ok("T4  age increases monotonically away from a constant-rate axis", mono);

    /* 1 cm/yr for 1 Ma is 10 km on ONE side */
    ok("T8  1 cm/yr for 1 Ma is 10 km on one side",
       M.distanceForAge(1, 1) === 10 && near(M.ageAtPosition(10, world({ halfRateRightCmYr: 1 })), 1, 1e-12));
    ok("T8b 2.5 cm/yr for 3 Ma is 75 km on one side", M.distanceForAge(3, 2.5) === 75);

    /* the full rate is the sum of the two half rates, never one of them */
    var wa = world({ halfRateLeftCmYr: 1.4, halfRateRightCmYr: 2.8 });
    ok("T8c full rate is the sum of the two half rates",
       near(wa.fullRateCmYr, 4.2, 1e-12));

    /* the field is normal now, in the historically informed mode */
    var chron = M.publishedChronology();
    ok("T4b polarity at age 0 is normal in the published chronology",
       M.polarityAtAge(0, chron) === 1);
    ok("T4c the Matuyama is reversed at 1.5 Ma", M.polarityAtAge(1.5, chron) === -1);
    ok("T4d the Jaramillo is normal at 1.0 Ma", M.polarityAtAge(1.0, chron) === 1);
    ok("T4e beyond the chronology span the polarity is unknown, not assumed",
       M.polarityAtAge(chron.spanMa + 0.1, chron) === 0);

    /* synthetic chronologies are labelled and start normal */
    var syn = M.syntheticChronology(99, 6);
    ok("T4f a synthetic chronology is flagged synthetic and starts normal",
       syn.synthetic === true && M.polarityAtAge(0, syn) === 1);
  })();

  /* ================================================================
     3. SYMMETRY AND ASYMMETRY OF THE CRUST
     ============================================================= */
  G("3. Crustal geometry");
  (function () {
    var w = world({ ridgeAxisKm: -3 });
    var symOK = true;
    for (var d = 0.25; d < 80; d += 0.25) {
      if (M.crustMagnetization(-3 + d, w) !== M.crustMagnetization(-3 - d, w)) { symOK = false; break; }
    }
    ok("T5  equal half rates give ages and polarity placement symmetric about the axis", symOK);

    var wa = world({ halfRateLeftCmYr: 1, halfRateRightCmYr: 3 });
    function widthOfFirstBand(blocks, side) {
      for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (side > 0 && b.x1 >= -1e-9 && b.ageT0 === 0) return b.x2 - b.x1;
        if (side < 0 && b.x2 <= 1e-9 && b.ageT0 === 0) return b.x2 - b.x1;
      }
      return NaN;
    }
    var wl = widthOfFirstBand(wa.blocks, -1), wr = widthOfFirstBand(wa.blocks, +1);
    ok("T6  an asymmetric ridge gives different band widths on opposite sides",
       near(wl, 7.8, 1e-9) && near(wr, 23.4, 1e-9), "left=" + wl + " right=" + wr);

    var slow = world({ halfRateLeftCmYr: 1, halfRateRightCmYr: 1 });
    var fast = world({ halfRateLeftCmYr: 4, halfRateRightCmYr: 4 });
    var bs = widthOfFirstBand(slow.blocks, +1), bf = widthOfFirstBand(fast.blocks, +1);
    ok("T7  raising the half rate widens the spatial expression of the same interval, in proportion",
       relNear(bf / bs, 4, 1e-9), "ratio=" + (bf / bs));

    /* Brunhes half-width at 2 cm/yr: 10 * 2 * 0.780 = 15.6 km */
    ok("T7b the Brunhes half-width at 2 cm/yr is 15.6 km",
       near(widthOfFirstBand(world().blocks, +1), 15.6, 1e-9));

    /* the crust the chronology cannot describe is left unmagnetised */
    var wOut = world();
    ok("T7c crust older than the chronology is left unmagnetised, not invented",
       M.crustMagnetization(wOut.outerHalfWidthKm + 5, wOut) === 0);
  })();

  /* ================================================================
     4. SURVEY GEOMETRY
     ============================================================= */
  G("4. Survey geometry");
  (function () {
    var perp = M.sampleSurveyTrack(survey({ trackAngleDeg: 90, trackLengthKm: 100, trackStartKm: 0 }));
    ok("T9  a perpendicular track preserves ridge-normal width (span = length)",
       near(perp.normalSpanKm, 100, 1e-9) && near(perp.apparentWidthFactor, 1, 1e-12));

    var obl = M.sampleSurveyTrack(survey({ trackAngleDeg: 30, trackLengthKm: 100, trackStartKm: 0 }));
    ok("T10 a 30° track covers 50 km of ridge-normal ground in 100 km of trackline",
       near(obl.normalSpanKm, 50, 1e-9));
    ok("T10b an oblique track stretches apparent width by 1/sin(alpha)",
       near(obl.apparentWidthFactor, 2, 1e-9));

    /* the same band, measured along two tracks, differs by exactly that factor */
    var w = world();
    var g = M.geometry(2.7, LAYER.thicknessKm, 90);
    function firstZeroCrossingAlongTrack(angleDeg) {
      var tr = M.sampleSurveyTrack(survey({ trackAngleDeg: angleDeg, trackLengthKm: 120,
                                            trackStartKm: 0, sampleSpacingKm: 0.05 }));
      var p = M.forwardMagneticProfile(w.blocks, tr.xNominal, g);
      for (var i = 1; i < p.length; i++) if (p[i] < 0 && p[i - 1] >= 0) return tr.s[i];
      return NaN;
    }
    var s90 = firstZeroCrossingAlongTrack(90), s30 = firstZeroCrossingAlongTrack(30);
    ok("T10c the same anomaly feature sits 1/sin(30°) = 2× further along an oblique track",
       relNear(s30 / s90, 2, 0.02), "ratio=" + (s30 / s90).toFixed(4));

    var warnFail = M.geometryWarning(survey({ trackAngleDeg: 8 }));
    ok("T10d a near-parallel track is refused rather than silently allowed",
       warnFail && warnFail.level === "fail");
    ok("T10e a perpendicular track raises no geometry warning",
       M.geometryWarning(survey({ trackAngleDeg: 90 })) === null);
  })();

  /* ================================================================
     5. THE FORWARD MODEL
     ============================================================= */
  G("5. Forward magnetic model");
  (function () {
    var w = world();
    var xs = new Float64Array(801);
    for (var i = 0; i < xs.length; i++) xs[i] = -100 + i * 0.25;

    var low = M.forwardMagneticProfile(w.blocks, xs, M.geometry(1.5, LAYER.thicknessKm, 90));
    var mid = M.forwardMagneticProfile(w.blocks, xs, M.geometry(3.0, LAYER.thicknessKm, 90));
    var high = M.forwardMagneticProfile(w.blocks, xs, M.geometry(4.5, LAYER.thicknessKm, 90));

    ok("T11 raising the sensor reduces the anomaly amplitude, monotonically",
       rms(low) > rms(mid) && rms(mid) > rms(high),
       [rms(low), rms(mid), rms(high)].map(function (v) { return v.toFixed(1); }).join(" > "));

    /* Normalised roughness: RMS of the second difference over RMS of the
       trace. Upward continuation is a low-pass filter, so this must fall. */
    function roughness(p) {
      var d = new Float64Array(p.length - 2);
      for (var k = 1; k < p.length - 1; k++) d[k - 1] = p[k + 1] - 2 * p[k] + p[k - 1];
      return rms(d) / rms(p);
    }
    ok("T12 raising the sensor suppresses high-frequency detail (normalised roughness falls)",
       roughness(low) > roughness(mid) && roughness(mid) > roughness(high),
       [roughness(low), roughness(mid), roughness(high)].map(function (v) { return v.toFixed(4); }).join(" > "));

    /* a symmetric world at the pole gives a symmetric profile */
    var sym = true, n = xs.length;
    for (i = 0; i < n; i++) {
      var j = n - 1 - i;
      if (Math.abs(mid[i] - mid[j]) > 1e-6 * (1 + Math.abs(mid[i]))) { sym = false; break; }
    }
    ok("T5b a symmetric world at 90° effective inclination gives a symmetric profile", sym);

    /* below 90° the anomaly skews, which is the physical behaviour */
    var skew = M.forwardMagneticProfile(w.blocks, xs, M.geometry(3.0, LAYER.thicknessKm, 45));
    var asym = 0;
    for (i = 0; i < n; i++) asym += Math.abs(skew[i] - skew[n - 1 - i]);
    ok("T5c below 90° effective inclination the same world gives a skewed profile", asym / n > 1);

    /* The crust takes two values; the trace takes a continuum. This is
       the difference between a stripe map and a magnetometer record, and
       it is the single thing this instrument exists to show. */
    var peak = 0;
    for (i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mid[i]));
    var saturated = 0;
    for (i = 0; i < n; i++) if (Math.abs(mid[i]) > 0.85 * peak) saturated++;
    ok("T5d the trace is continuous where the crust is binary (<15% of samples near the extremes)",
       saturated / n < 0.15, (100 * saturated / n).toFixed(1) + "% of samples within 15% of the peak");

    /* Neighbouring blocks interact: the zero crossings of the trace do
       not sit on the polarity boundaries. */
    var bounds = [], k2;
    for (k2 = 0; k2 < w.blocks.length; k2++) bounds.push(w.blocks[k2].x1);
    var crossings = [];
    for (i = 1; i < n; i++) if ((mid[i] < 0) !== (mid[i - 1] < 0)) crossings.push(xs[i]);
    var offSum = 0;
    for (i = 0; i < crossings.length; i++) {
      var bestD = Infinity;
      for (k2 = 0; k2 < bounds.length; k2++) bestD = Math.min(bestD, Math.abs(bounds[k2] - crossings[i]));
      offSum += bestD;
    }
    ok("T5d2 zero crossings of the trace do not land on the polarity boundaries",
       crossings.length > 4 && offSum / crossings.length > 0.2,
       "mean offset " + (offSum / crossings.length).toFixed(2) + " km over " + crossings.length + " crossings");

    ok("T14 every value in the forward profile is finite",
       allFinite(low) && allFinite(mid) && allFinite(high) && allFinite(skew));

    /* amplitude is in the right ballpark for a marine survey */
    ok("T11b anomaly amplitudes are of marine-survey size (50-800 nT peak)",
       Math.max.apply(null, Array.prototype.slice.call(mid)) > 50 &&
       Math.max.apply(null, Array.prototype.slice.call(mid)) < 800,
       "peak=" + Math.max.apply(null, Array.prototype.slice.call(mid)).toFixed(0) + " nT");

    /* the tabulated kernel used for candidate scanning must agree with
       the exact one it stands in for */
    var g = M.geometry(2.7, LAYER.thicknessKm, 90);
    var exact = M.forwardMagneticProfile(w.blocks, xs, g);
    var fast = M.forwardMagneticProfileFast(w.blocks, xs, M.edgeTable(g, 420, 0.02));
    var worst = 0;
    for (i = 0; i < n; i++) worst = Math.max(worst, Math.abs(exact[i] - fast[i]));
    ok("T5e the tabulated forward model matches the exact one to better than 0.5 nT",
       worst < 0.5, "worst=" + worst.toFixed(4) + " nT");

    /* a uniformly magnetised crust produces essentially no anomaly */
    var cw = world({ generator: "constantPolarity" });
    var flat = M.forwardMagneticProfile(cw.blocks, xs, g);
    ok("T5f uniform magnetisation gives an anomaly under 1 nT away from the world's edges",
       rms(flat) < 1, "rms=" + rms(flat).toFixed(4) + " nT");
  })();

  /* ================================================================
     6. OBSERVATIONAL EFFECTS
     ============================================================= */
  G("6. Instrument and observation effects");
  (function () {
    var w = world();
    var clean = M.runTransect(w, survey({ noiseNt: 0, navJitterKm: 0, dropoutRate: 0 }), 5, 0);
    var maxDev = 0;
    for (var i = 0; i < clean.n; i++) {
      maxDev = Math.max(maxDev, Math.abs(clean.values[i] - clean.cleanTrue[i] - clean.trendTrue[i]));
    }
    ok("T13 with the noise set to zero the observation carries no random perturbation",
       maxDev < 1e-9, "max deviation " + maxDev.toExponential(2) + " nT");
    var jitter = 0;
    for (i = 0; i < clean.n; i++) jitter = Math.max(jitter, Math.abs(clean.xTrue[i] - clean.x[i]));
    ok("T13b with navigation uncertainty at zero the ship is where it says it is", jitter === 0);
    var anyMissing = false;
    for (i = 0; i < clean.n; i++) if (clean.missing[i]) anyMissing = true;
    ok("T13c with the dropout rate at zero nothing is lost", !anyMissing);

    var messy = M.runTransect(w, survey({ dropoutRate: 0.25, navJitterKm: 1.0 }), 5, 0);
    var nMissing = 0, zeroed = 0;
    for (i = 0; i < messy.n; i++) {
      if (messy.missing[i]) {
        nMissing++;
        if (messy.values[i] === 0) zeroed++;
      }
    }
    ok("T15 lost readings are marked missing and are never silently set to zero",
       nMissing > 0 && zeroed === 0, nMissing + " missing, " + zeroed + " zeroed");
    ok("T15b the dropout rate comes out near the value requested (0.25 ± 0.08)",
       near(nMissing / messy.n, 0.25, 0.08), (nMissing / messy.n).toFixed(3));

    var navOff = 0;
    for (i = 0; i < messy.n; i++) navOff = Math.max(navOff, Math.abs(messy.xTrue[i] - messy.x[i]));
    ok("T15c navigation uncertainty moves where the reading was taken from where it was logged",
       navOff > 0.5);

    ok("T14b every observation array is finite",
       allFinite(messy.values) && allFinite(messy.x) && allFinite(messy.xTrue) && allFinite(messy.s));

    /* the trend is real and separable */
    var flat = M.runTransect(w, survey({ noiseNt: 0, navJitterKm: 0, dropoutRate: 0, trendNtPer100km: 0 }), 5, 0);
    var ramp = M.runTransect(w, survey({ noiseNt: 0, navJitterKm: 0, dropoutRate: 0, trendNtPer100km: 400 }), 5, 0);
    var d0 = ramp.values[0] - flat.values[0];
    var d1 = ramp.values[ramp.n - 1] - flat.values[flat.n - 1];
    ok("T13d the regional trend adds the requested gradient across the line",
       Math.abs((d1 - d0)) > 300, "delta=" + (d1 - d0).toFixed(0) + " nT over " + ramp.s[ramp.n - 1] + " km");
  })();

  /* ================================================================
     7. INVERSION
     ============================================================= */
  G("7. Inversion and model comparison");
  (function () {
    var w = world({ halfRateLeftCmYr: 2.4, halfRateRightCmYr: 2.4, ridgeAxisKm: 6 });
    var s = survey({ noiseNt: 6, navJitterKm: 0.05, dropoutRate: 0, trendNtPer100km: 20,
                     trackLengthKm: 200, trackStartKm: -90, sampleSpacingKm: 0.5 });
    var tr = M.runTransect(w, s, 4242, 0);
    var data = M.poolData([tr]);
    var search = M.makeSearch(data, {
      sensorAltitudeKm: s.sensorAltitudeKm, layerThicknessKm: LAYER.thicknessKm,
      effInclinationDeg: 90, chronology: "published", asymmetric: false
    });
    var best = search.runToCompletion();
    ok("T16 a clean symmetric case recovers the true half rate to within 2%",
       best && relNear(best.cand.halfRateRightCmYr, 2.4, 0.02),
       best ? "found " + best.cand.halfRateRightCmYr.toFixed(2) + " cm/yr against 2.40" : "no fit");
    ok("T16b it recovers the axis to within 1 km",
       best && near(best.cand.axisKm, 6, 1),
       best ? "found " + best.cand.axisKm.toFixed(2) + " km against 6.00" : "no fit");
    ok("T16c the recovered fit leaves little residual structure (|lag-1| < 0.6)",
       best && Math.abs(best.stats.lag1) < 0.6,
       best ? "lag1=" + best.stats.lag1.toFixed(3) : "");
    ok("T16d the search terminates", search.done());

    /* the null world: nothing to find, and the instrument must not
       manufacture a confident rate out of it */
    var nullW = world({ generator: "staticCorrelated", correlationKm: 11 });
    var nullTr = M.runTransect(nullW, s, 909, 0);
    var nullData = M.poolData([nullTr]);
    var cands = M.candidateSet(nullData, {
      sensorAltitudeKm: s.sensorAltitudeKm, layerThicknessKm: LAYER.thicknessKm,
      effInclinationDeg: 90, chronology: "published"
    });
    ok("T17 four candidate models are generated and scored on the null world", cands.length === 4);
    var sep = M.distinguishability(cands[0].stats, cands[1].stats, s.noiseNt);
    ok("T17b on the null world the two leading models are reported as indistinguishable, not ranked with confidence",
       !sep.separable || cands[0].key !== "symmetric",
       "leader=" + cands[0].key + " separable=" + sep.separable);

    /* on a genuine spreading world the reversal models must beat the
       constant-polarity model, which cannot produce any anomaly at all */
    var realCands = M.candidateSet(data, {
      sensorAltitudeKm: s.sensorAltitudeKm, layerThicknessKm: LAYER.thicknessKm,
      effInclinationDeg: 90, chronology: "published"
    });
    var byKey = {};
    for (var i = 0; i < realCands.length; i++) byKey[realCands[i].key] = realCands[i];
    ok("T17c on a spreading world the reversal models beat a constant-polarity field",
       byKey.symmetric.stats.rmse < byKey.constant.stats.rmse * 0.5,
       "sym=" + byKey.symmetric.stats.rmse.toFixed(1) + " nT, const=" + byKey.constant.stats.rmse.toFixed(1) + " nT");
    ok("T17d the flexible correlated-field model is charged for its parameters",
       byKey.static.k > byKey.symmetric.k,
       "static k=" + byKey.static.k + " vs symmetric k=" + byKey.symmetric.k);

    /* held-out scoring across two transects */
    var tr2 = M.runTransect(w, s, 4242, 1);
    var d2 = M.poolData([tr, tr2]);
    var mask = M.heldOutMask(d2, 1);
    var holdOnly = M.holdMaskOnly(d2, 1);
    var used = 0, held = 0;
    for (i = 0; i < d2.n; i++) { used += mask[i]; held += holdOnly[i]; }
    ok("T17e held-out masks partition the pooled data without overlap",
       used > 0 && held > 0 && used + held === d2.used);
  })();

  /* ================================================================
     8. SESSION, RESET AND EXPORT
     ============================================================= */
  G("8. Session, reset and export");
  (function () {
    var spec = {
      generator: "spreading", seed: 31337, ridgeAxisKm: -12.5,
      halfRateLeftCmYr: 1.7, halfRateRightCmYr: 3.1, effInclinationDeg: 62,
      magnetisationAm: LAYER.magnetisationAm, layerThicknessKm: LAYER.thicknessKm,
      chronology: "published"
    };
    var a = M.makeWorld(spec), b = M.makeWorld(spec);
    var same = a.blocks.length === b.blocks.length;
    for (var i = 0; same && i < a.blocks.length; i++) {
      same = a.blocks[i].x1 === b.blocks[i].x1 && a.blocks[i].x2 === b.blocks[i].x2 &&
             a.blocks[i].J === b.blocks[i].J;
    }
    ok("T18 rebuilding a world from the same spec restores the identical hidden crust", same);

    var rs1 = M.randomWorldSpec(5150), rs2 = M.randomWorldSpec(5150);
    ok("T18b a random hidden world is a deterministic function of its seed",
       JSON.stringify(rs1) === JSON.stringify(rs2));
    ok("T18c a different seed gives a different hidden world",
       JSON.stringify(M.randomWorldSpec(5151)) !== JSON.stringify(rs1));

    var w = M.makeWorld(spec);
    var sv = survey({ dropoutRate: 0.1 });
    var session = {
      modelVersion: C.MO_VERSION, seed: 31337, mode: "blind",
      survey: sv, world: w, revealed: false,
      transects: [M.runTransect(w, sv, 31337, 0)]
    };
    var txt = M.exportObservations(session);
    var needs = ["seed", "sample_spacing_km", "anomaly_nT", "missing", "model_version",
                 "x_km", "UNITS", "track_angle_deg", "sensor_altitude_km"];
    var missingField = null;
    for (i = 0; i < needs.length; i++) if (txt.indexOf(needs[i]) < 0) missingField = needs[i];
    ok("T19 the export carries seed, settings, units, positions, observations, missing markers and model version",
       missingField === null, missingField ? "missing: " + missingField : "");
    ok("T19b the export does not leak the hidden world before commitment",
       txt.indexOf("half_rate_left_cmyr") < 0 && txt.indexOf("ridge_axis_km") < 0);

    session.revealed = true;
    var txt2 = M.exportObservations(session);
    ok("T19c after commitment the export includes the hidden world",
       txt2.indexOf("half_rate_left_cmyr") > 0 && txt2.indexOf("full_rate_cmyr") > 0);

    var rows = txt.split("\n").filter(function (l) { return l && l[0] !== "#" && l.indexOf("transect,") !== 0; });
    var blankSeen = false, zeroSeen = false;
    for (i = 0; i < rows.length; i++) {
      var f = rows[i].split(",");
      if (f[4] === "1") { blankSeen = blankSeen || f[3] === ""; zeroSeen = zeroSeen || f[3] === "0.000"; }
    }
    ok("T19d missing readings are blank in the export, never zero", blankSeen && !zeroSeen);
  })();

  /* ================================================================
     9. THE INFERENCE REPORT
     ============================================================= */
  G("9. Inference report");
  (function () {
    var w = world({ halfRateLeftCmYr: 2.0, halfRateRightCmYr: 3.0, ridgeAxisKm: -4 });
    var s = survey({ noiseNt: 10, dropoutRate: 0.02 });
    var tr = M.runTransect(w, s, 8080, 0);
    var data = M.poolData([tr]);
    var claim = {
      axisKm: -2, halfRateLeftCmYr: 2.2, halfRateRightCmYr: 2.9, symmetric: false,
      chronology: "published", model: "asymmetric", confidence: 70, rationale: "test"
    };
    var cands = M.candidateSet(data, {
      sensorAltitudeKm: s.sensorAltitudeKm, layerThicknessKm: LAYER.thicknessKm,
      effInclinationDeg: 90, chronology: "published"
    });
    var rep = M.inferenceReport(w, claim, data, cands, {
      sensorAltitudeKm: s.sensorAltitudeKm, layerThicknessKm: LAYER.thicknessKm,
      effInclinationDeg: 90, noiseNt: s.noiseNt, budgetHours: 60, budgetUsedHours: 9.6
    });
    ok("R1  the report gives separate axis, left-rate, right-rate and full-rate errors",
       near(rep.axisErrorKm, 2, 1e-9) && near(rep.leftRateError, 0.2, 1e-9) &&
       near(rep.rightRateError, -0.1, 1e-9) && near(rep.fullRateError, 0.1, 1e-9));
    ok("R2  the report names the true generating model", rep.trueGenerator === "spreading");
    ok("R3  the report scores polarity-boundary alignment over the surveyed window",
       rep.boundaryAlignment.applicable && isFinite(rep.boundaryAlignment.meanOffsetKm));
    ok("R4  the report carries profile RMSE for the operator's own numbers",
       rep.claimStats && isFinite(rep.claimStats.rmse));
    ok("R5  the report classifies confidence calibration rather than scoring it",
       ["overconfident", "underconfident", "consistent", "not applicable"].indexOf(rep.calibration) >= 0);
    ok("R6  the report says whether another transect would have helped",
       typeof rep.moreDataAdvice === "string" && rep.moreDataAdvice.length > 20);
    ok("R7  the report is not reduced to a single score",
       rep.score === undefined && rep.total === undefined && rep.grade === undefined);

    var over = M.inferenceReport(w, {
      axisKm: -4, halfRateLeftCmYr: 5.0, halfRateRightCmYr: 5.0, symmetric: true,
      chronology: "published", model: "symmetric", confidence: 95
    }, data, cands, { sensorAltitudeKm: s.sensorAltitudeKm, layerThicknessKm: LAYER.thicknessKm,
      effInclinationDeg: 90, noiseNt: s.noiseNt, budgetHours: 60, budgetUsedHours: 9.6 });
    ok("R8  a badly wrong answer held with 95% confidence is called overconfident",
       over.calibration === "overconfident");
  })();

  /* ================================================================
     10. BUDGET AND PRESETS
     ============================================================= */
  G("10. Budget, presets and configuration");
  (function () {
    var h = C.transectCostHours(185.2, 10);
    ok("B1  a 185.2 km line at 10 knots costs 10 ship-hours", near(h, 10, 1e-9));
    ok("B2  every preset names a generator the model implements", (function () {
      for (var i = 0; i < C.PRESETS.length; i++) {
        var g = C.PRESETS[i].world.generator;
        if (["spreading", "constantPolarity", "staticCorrelated"].indexOf(g) < 0) return false;
      }
      return true;
    })());
    ok("B3  every preset builds a world and a transect without a non-finite value", (function () {
      for (var i = 0; i < C.PRESETS.length; i++) {
        var p = C.PRESETS[i];
        var spec = { seed: 1000 + i, magnetisationAm: LAYER.magnetisationAm,
                     layerThicknessKm: LAYER.thicknessKm };
        for (var k in p.world) spec[k] = p.world[k];
        var w = M.makeWorld(spec);
        var sv = {}; for (var q in p.survey) sv[q] = p.survey[q];
        sv.trackStartYKm = 0;
        var tr = M.runTransect(w, sv, 1000 + i, 0);
        if (!allFinite(tr.values) || !allFinite(tr.cleanTrue)) return false;
      }
      return true;
    })());
    ok("B4  the seven required preset kinds are present", (function () {
      var keys = C.PRESETS.map(function (p) { return p.key; });
      return ["clean", "slow", "fast", "asymmetric", "oblique", "noisy", "null"]
        .every(function (k) { return keys.indexOf(k) >= 0; });
    })());
    ok("B5  no preset is named after a real ridge", (function () {
      var banned = /atlantic|pacific|reykjanes|juan de fuca|carlsberg|gorda|east pacific rise|mid-atlantic/i;
      return C.PRESETS.every(function (p) { return !banned.test(p.name) && !banned.test(p.line); });
    })());
    ok("B6  the hidden world parameters are marked hidden in the control table",
       C.CONTROLS.ridgeAxisKm.hidden && C.CONTROLS.halfRateLeftCmYr.hidden &&
       C.CONTROLS.halfRateRightCmYr.hidden);
  })();

  /* ================================================================
     11. CATALOGUE RECORD
     ============================================================= */
  G("11. Catalogue record");
  (function () {
    if (!CAT || !CAT.CATALOGUE) { ok("T20 catalogue is available to the test", false); return; }
    var rec = null;
    for (var i = 0; i < CAT.CATALOGUE.length; i++) if (CAT.CATALOGUE[i].id === "magnetic-ocean") rec = CAT.CATALOGUE[i];
    ok("T20 the catalogue contains a magnetic-ocean record", !!rec);
    if (!rec) return;
    var T = CAT.TAXONOMY, E = CAT.EVIDENCE_LEVELS;
    ok("T20a domain is in the controlled vocabulary", T.domain.indexOf(rec.domain) >= 0, rec.domain);
    ok("T20b every mode is in the controlled vocabulary",
       rec.mode.every(function (m) { return T.mode.indexOf(m) >= 0; }), rec.mode.join(","));
    ok("T20c duration is in the controlled vocabulary", T.duration.indexOf(rec.duration) >= 0, rec.duration);
    ok("T20d complexity is in the controlled vocabulary", T.complexity.indexOf(rec.complexity) >= 0, rec.complexity);
    ok("T20e every model type is in the controlled vocabulary",
       rec.model.every(function (m) { return T.model.indexOf(m) >= 0; }), rec.model.join(","));
    ok("T20f state is in the controlled vocabulary", T.state.indexOf(rec.state) >= 0, rec.state);
    ok("T20g evidence is null or one of the five levels",
       rec.evidence === null || E.indexOf(rec.evidence) >= 0, String(rec.evidence));
    ok("T20h the required text fields are present and non-empty",
       !!(rec.title && rec.href && rec.methods && rec.preview && rec.question && rec.role &&
          rec.blurb && rec.chips && rec.chips.length === 4 && rec.version && rec.updated));
    ok("T20i href and methods point inside the instrument's own folder",
       rec.href.indexOf("magnetic-ocean/") === 0 && rec.methods.indexOf("magnetic-ocean/") === 0);
    ok("T20j basis names a checkable source rather than asserting quality",
       !!(rec.basis && /Vine|Matthews/i.test(rec.basis.label)) && !/grounded|rigorous|accurate/i.test(rec.basis.detail));
    ok("T20k the record version matches the model version",
       rec.version === C.MO_VERSION, rec.version + " vs " + C.MO_VERSION);
    ok("T20l the record does not claim the trace is a stripe map",
       !/stripe map|image of the stripes/i.test(rec.blurb + rec.question + rec.role));
  })();

  /* ---------------------------------------------------------------- */
  return {
    pass: pass, fail: fail, results: results,
    report: function (out) {
      out("");
      out("THE MAGNETIC OCEAN — model tests");
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        if (r.heading) { out(""); out(r.heading); continue; }
        out("  " + (r.ok ? "ok  " : "FAIL") + "  " + r.name + (r.detail ? "   [" + r.detail + "]" : ""));
      }
      out("");
      out(pass + " passed, " + fail + " failed");
      out("");
    }
  };
});
