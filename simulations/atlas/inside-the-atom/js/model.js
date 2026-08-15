"use strict";
/* =====================================================================
   INSIDE THE ATOM — model.js

   The scattering engine. No DOM, no timers, no globals beyond what
   config.js defines, so this file can be required in node and tested on
   its own (`node js/test.js`).

   ---------------------------------------------------------------------
   WHAT THIS COMPUTES

   Two competing angular distributions for an α particle leaving a thin
   foil, both taken from Rutherford's 1911 paper, which states them side
   by side precisely so they can be told apart.

   1. NUCLEAR (Rutherford 1911, §2–3). A single close encounter with a
      point charge. The particle follows a hyperbola with the centre as
      external focus, and

          cot(φ/2) = 2p / b ,          b = Z₁Z₂ke² / E_k

      where p is the impact parameter and b is the head-on distance of
      closest approach. Sampling p uniformly in area over the projected
      area per atom, p_max = 1/√(πnt), reproduces Rutherford's eq. (3),

          P(deflexion > φ) = (π/4) · n·t · b² · cot²(φ/2)

      exactly, and the corresponding density per unit solid angle is his
      eq. (5),

          dP/dΩ = n·t·(b/4)² · cosec⁴(φ/2).

      Because p is bounded by p_max the distribution is normalised on
      [φ_min, π] with φ_min = 2·arctan(b / 2p_max). There is no divergence
      to regularise by hand and no probability greater than one.

   2. DIFFUSE (Thomson's atom, in the form Rutherford gives in §5). Many
      tiny deflections accumulate; the resultant follows

          P(deflexion > φ) = exp(−φ² / θ_t²)

      with the characteristic angle built from the average single-atom
      deflection πb_T/8R and √(πR²nt) encounters, so that R cancels:

          θ_t = (π·b_T / 8) · √(π·n·t).

      The charge that appears in b_T is Thomson's, not Rutherford's. On
      the diffuse-charge picture the deflecting charge is the atom's
      whole complement of corpuscles, which Crowther deduced from β-ray
      scattering to be "about three times its atomic weight" (Rutherford
      1911, §1, citing Crowther 1910). Using N_T = 3A is what makes this
      a fair opponent: it reproduces the small-angle scattering that was
      actually observed, and still predicts nothing at all past twenty
      degrees. A Thomson atom with N = Z would fail at both ends.

   ---------------------------------------------------------------------
   WHERE RANDOMNESS ENTERS

   Exactly three places, all seeded:

     · the number of particles that enter the detector aperture
       (binomial in the number fired, with the model's acceptance);
     · the number of those the screen actually records (binomial in the
       detector efficiency);
     · the background count (Poisson).

   The acceptance itself is computed by quadrature, not by simulating
   individual particles, so a run of 10⁸ particles costs the same as a
   run of 10³ and the counting statistics are exact rather than
   approximated by a small sample. The individual trajectories drawn on
   the apparatus view are a separate, clearly-labelled subsample.
   ===================================================================== */

var Atom = (function () {

  /* Pull config either from node or from the global scope. */
  var C = (typeof module !== "undefined" && module.exports && typeof require === "function")
    ? require("./config.js") : null;
  var _K_E2       = C ? C.K_E2_MEV_FM : K_E2_MEV_FM;
  var _NA         = C ? C.N_AVOGADRO : N_AVOGADRO;
  var _ZA         = C ? C.Z_ALPHA : Z_ALPHA;
  var _MA         = C ? C.M_ALPHA_MEV : M_ALPHA_MEV;
  var _C          = C ? C.C_CM_S : C_CM_S;
  var _FMCM       = C ? C.FM_PER_CM : FM_PER_CM;
  var _targetByKey= C ? C.targetByKey : targetByKey;
  var _clamp      = C ? C.clamp : clamp;
  var _finite     = C ? C.finite : finite;
  var _DEG        = C ? C.DEG : DEG;
  var _RAD        = C ? C.RAD : RAD;
  var _LARGE      = C ? C.LARGE_ANGLE_DEG : LARGE_ANGLE_DEG;
  var _BACK       = C ? C.BACKSCATTER_DEG : BACKSCATTER_DEG;
  var _SS_WARN    = C ? C.SS_WARN : SS_WARN;
  var _SS_FAIL    = C ? C.SS_FAIL : SS_FAIL;
  var _VERSION    = C ? C.VERSION : VERSION;
  var _DEFAULTS   = C ? C.DEFAULTS : DEFAULTS;

  var TAU = Math.PI * 2;

  /* =================================================================
     1. RANDOMNESS
     ================================================================= */

  /* Mulberry32 — small, fast, and reproducible across engines. Every
     stochastic decision draws from one of these; nothing anywhere in the
     instrument calls Math.random. */
  function RNG(seed) {
    this.s = (seed >>> 0) || 1;
  }
  RNG.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    var t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /* Open interval, so log(0) can never happen downstream. */
  RNG.prototype.open = function () {
    var u = this.next();
    return u <= 0 ? 1e-12 : (u >= 1 ? 1 - 1e-12 : u);
  };
  RNG.prototype.normal = function () {
    /* Box–Muller, one value kept in reserve. */
    if (this._spare !== undefined && this._spare !== null) {
      var s = this._spare; this._spare = null; return s;
    }
    var u = this.open(), v = this.open();
    var r = Math.sqrt(-2 * Math.log(u));
    this._spare = r * Math.sin(TAU * v);
    return r * Math.cos(TAU * v);
  };

  /* Stir two integers into a new seed, so that exposure k of a session
     seeded S is reproducible from (S, k) alone. */
  function mixSeed(a, b) {
    var h = (a >>> 0) ^ 0x9E3779B9;
    h = Math.imul(h ^ (b >>> 0), 0x85EBCA6B) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xC2B2AE35) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0) || 1;
  }

  /* Poisson. Knuth below 30, normal approximation with a continuity
     correction above it. Never negative, never fractional, never NaN. */
  function poisson(rng, lambda) {
    lambda = _finite(lambda, 0);
    if (lambda <= 0) return 0;
    if (lambda < 30) {
      var L = Math.exp(-lambda), k = 0, p = 1;
      do { k++; p *= rng.next(); } while (p > L && k < 10000);
      return k - 1;
    }
    var v = Math.round(lambda + Math.sqrt(lambda) * rng.normal());
    return v < 0 ? 0 : v;
  }

  /* Binomial(n, p). Exact for small n·p by way of the Poisson limit,
     normal otherwise. The result is clamped into [0, n], which is what
     makes "detected can never exceed eligible" true by construction
     rather than by hope. */
  function binomial(rng, n, p) {
    n = Math.max(0, Math.round(_finite(n, 0)));
    p = _clamp(_finite(p, 0), 0, 1);
    if (n === 0 || p === 0) return 0;
    if (p >= 1) return n;
    var mean = n * p;
    if (mean < 25 && n > 40) return Math.min(n, poisson(rng, mean));
    if (n <= 40) {
      var k = 0;
      for (var i = 0; i < n; i++) if (rng.next() < p) k++;
      return k;
    }
    var sd = Math.sqrt(n * p * (1 - p));
    var v = Math.round(mean + sd * rng.normal());
    return _clamp(v, 0, n);
  }

  /* =================================================================
     2. GEOMETRY AND THE TWO KERNELS
     ================================================================= */

  /* Everything the scattering laws need, derived once from a settings
     object. All the quantities that appear on the parameters table of
     the methods page are computed here and nowhere else. */
  function geometry(cfg) {
    var tgt = _targetByKey(cfg.target);
    var Z = _clamp(_finite(cfg.zOverride || tgt.Z, tgt.Z), 1, 120);
    var A = tgt.A;
    var E = _clamp(_finite(cfg.energy, 7.687), 0.1, 60);

    /* b = Z₁Z₂ke²/E_k, in fm then cm. Rutherford's own arithmetic:
       Z = 100, u = 2.09 × 10⁹ cm/s gives b ≈ 3.4 × 10⁻¹² cm. */
    var b_fm = _ZA * Z * _K_E2 / E;
    var b = b_fm / _FMCM;                       /* cm */

    /* Areal density. Only n·t enters the scattering law; thickness and
       density never appear separately. */
    var t = _clamp(_finite(cfg.thickness, 210), 0.1, 1e6) * 1e-7;   /* nm → cm */
    var n = tgt.density / A * _NA;                                  /* cm⁻³ */
    var nt = n * t;                                                 /* cm⁻² */

    var pMax = 1 / Math.sqrt(Math.PI * nt);                         /* cm */
    var thetaMin = 2 * Math.atan(b / (2 * pMax));                   /* rad */

    /* Thomson's charge: the whole corpuscle complement, N_T = 3A. */
    var Zt = 3 * A;
    var bT = (_ZA * Zt * _K_E2 / E) / _FMCM;
    var thetaT = (Math.PI * bT / 8) * Math.sqrt(Math.PI * nt);      /* rad */

    /* Classical velocity, for the readout only. At 7.7 MeV β ≈ 0.064,
       so the classical value is within 0.2 per cent of the relativistic
       one; the model itself is non-relativistic throughout. */
    var beta = Math.sqrt(2 * E / _MA);
    var u = beta * _C;                                              /* cm s⁻¹ */

    /* How badly the single-scattering assumption is being strained.
       Rutherford: the theory holds while the chance of a second large
       deflexion is negligible. */
    var ss5 = pScatterRuth(nt, b, 5 * _RAD);
    var validity = ss5 < _SS_WARN ? "ok" : (ss5 < _SS_FAIL ? "warn" : "fail");

    return {
      target: tgt, Z: Z, A: A, E: E, b: b, b_fm: b_fm,
      thickness_cm: t, thickness_nm: cfg.thickness,
      n: n, nt: nt, pMax: pMax, thetaMin: thetaMin,
      Zt: Zt, bT: bT, thetaT: thetaT,
      beta: beta, u: u,
      ss5: ss5, validity: validity,
      /* layers of atoms the beam crosses, a useful sanity figure */
      layers: t * Math.pow(n, 1 / 3)
    };
  }

  /* Rutherford's eq. (3): the fraction deflected beyond φ. */
  function pScatterRuth(nt, b, phi) {
    if (phi <= 0) return 1;
    if (phi >= Math.PI) return 0;
    var c = 1 / Math.tan(phi / 2);
    var p = (Math.PI / 4) * nt * b * b * c * c;
    return _finite(p, 0);
  }

  /* Density per unit solid angle for each model, before the beam is
     folded in. Both are finite everywhere on [0, π]. */
  function kernel(geo, model) {
    if (model === "thomson") {
      var tt2 = geo.thetaT * geo.thetaT;
      /* mass beyond π is exp(−π²/θ_t²); renormalise so the total is
         exactly one even in the pathological case of a huge θ_t */
      var lost = Math.exp(-Math.PI * Math.PI / tt2);
      var norm = 1 / Math.max(1e-300, 1 - lost);
      return function (th) {
        if (th < 0 || th > Math.PI) return 0;
        if (th < 1e-9) return norm / (Math.PI * tt2);   /* limit as θ→0 */
        var v = th * Math.exp(-th * th / tt2) / (Math.PI * tt2 * Math.sin(th));
        return _finite(v * norm, 0);
      };
    }
    /* Rutherford. Zero below θ_min: no impact parameter in the foil is
       large enough to produce a smaller deflection. */
    var k = geo.nt * (geo.b / 4) * (geo.b / 4);
    var thMin = geo.thetaMin;
    return function (th) {
      if (th < thMin || th > Math.PI) return 0;
      var s = Math.sin(th / 2);
      if (s <= 0) return 0;
      var v = k / (s * s * s * s);
      return _finite(v, 0);
    };
  }

  /* Analytic survival function P(deflexion > φ), before the beam. */
  function survival(geo, model, phi) {
    if (model === "thomson") {
      if (phi <= 0) return 1;
      if (phi >= Math.PI) return 0;
      var tt = geo.thetaT;
      return _clamp(Math.exp(-phi * phi / (tt * tt)), 0, 1);
    }
    if (phi <= geo.thetaMin) return 1;
    return _clamp(pScatterRuth(geo.nt, geo.b, phi), 0, 1);
  }

  /* =================================================================
     3. THE EXIT DISTRIBUTION
     Beam spread convolved onto the kernel. The exit direction is the
     beam direction composed with the scattering deflexion; both are
     axially symmetric, so the composition is too, and the polar
     density is a two-dimensional integral.
     ================================================================= */

  /* Gauss–Legendre nodes on [-1,1], generated by Newton iteration on the
     Legendre polynomial. Deterministic, and avoids shipping a table. */
  var _glCache = {};
  function gauss(n) {
    if (_glCache[n]) return _glCache[n];
    var x = new Float64Array(n), w = new Float64Array(n);
    var m = (n + 1) >> 1;
    for (var i = 0; i < m; i++) {
      var z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), z1, pp = 1;
      for (var it = 0; it < 100; it++) {
        var p0 = 1, p1 = 0;
        for (var j = 0; j < n; j++) {
          var p2 = p1; p1 = p0;
          p0 = ((2 * j + 1) * z * p1 - j * p2) / (j + 1);
        }
        pp = n * (z * p0 - p1) / (z * z - 1);
        z1 = z; z = z1 - p0 / pp;
        if (Math.abs(z - z1) < 1e-14) break;
      }
      x[i] = -z; x[n - 1 - i] = z;
      w[i] = 2 / ((1 - z * z) * pp * pp);
      w[n - 1 - i] = w[i];
    }
    _glCache[n] = { x: x, w: w };
    return _glCache[n];
  }

  var GRID_N = 1600;

  /* Graded grid on [0, π] that resolves the near-forward peak. */
  function gridTheta() {
    var g = new Float64Array(GRID_N + 1);
    for (var i = 0; i <= GRID_N; i++) {
      var u = i / GRID_N;
      g[i] = Math.PI * u * u * u;
    }
    return g;
  }
  var THGRID = null;

  /* Build the exit distribution for a configuration.

     With no beam spread the exit density IS the kernel, and the kernel
     is analytic and analytically normalised — so no table is built and
     no quadrature error is introduced. A table is only made when the
     beam has a spread to convolve in, and then its integral is checked
     against one rather than being silently rescaled. */
  function exitTable(geo, model, sigmaBeam) {
    var K = kernel(geo, model);
    /* Angles where the density changes character. The cap integrator
       uses these as breakpoints so no feature is straddled. */
    var peaks = (model === "thomson")
      ? [geo.thetaT * 0.5, geo.thetaT, geo.thetaT * 2, geo.thetaT * 3.5]
      : [geo.thetaMin, geo.thetaMin * 2, geo.thetaMin * 5, geo.thetaMin * 20];

    if (!(sigmaBeam > 0)) {
      return {
        analytic: true, model: model, geo: geo, peaks: peaks,
        dens: K,
        beyond: function (th) { return survival(geo, model, th); },
        integralCheck: 1, norm: 1
      };
    }

    if (!THGRID) THGRID = gridTheta();
    var th = THGRID, N = GRID_N;
    var g = new Float64Array(N + 1);

    /* Rayleigh beam profile of scale σ, as a density per unit solid
       angle: p(β) = exp(−β²/2σ²)/(2πσ²). Integrated with Gauss–Legendre
       out to 5σ, beyond which 4 parts in 10⁵ remain. */
    var s2 = sigmaBeam * sigmaBeam;
    var bmax = Math.min(Math.PI, 5 * sigmaBeam);
    var GB = gauss(24), GP = gauss(32);
    var nb = GB.x.length, np = GP.x.length;
    var beta = new Float64Array(nb), wbeta = new Float64Array(nb);
    var wsum = 0, ib;
    for (ib = 0; ib < nb; ib++) {
      var bb = 0.5 * bmax * (GB.x[ib] + 1);
      beta[ib] = bb;
      wbeta[ib] = Math.exp(-bb * bb / (2 * s2)) / (2 * Math.PI * s2)
                * Math.sin(bb) * (0.5 * bmax * GB.w[ib]) * 2 * Math.PI;
      wsum += wbeta[ib];
    }
    for (ib = 0; ib < nb; ib++) wbeta[ib] /= (wsum || 1);

    var psi = new Float64Array(np), wpsi = new Float64Array(np);
    for (var ip = 0; ip < np; ip++) {
      psi[ip] = Math.PI * 0.5 * (GP.x[ip] + 1);
      wpsi[ip] = 0.5 * GP.w[ip];
    }

    for (var q = 0; q <= N; q++) {
      var ct = Math.cos(th[q]), st = Math.sin(th[q]), acc = 0;
      for (ib = 0; ib < nb; ib++) {
        var cb = Math.cos(beta[ib]), sb = Math.sin(beta[ib]), inner = 0;
        for (var jp = 0; jp < np; jp++) {
          var cc = _clamp(ct * cb + st * sb * Math.cos(psi[jp]), -1, 1);
          inner += wpsi[jp] * K(Math.acos(cc));
        }
        acc += wbeta[ib] * inner;
      }
      g[q] = _finite(acc, 0);
    }

    /* ∫ g dΩ, trapezoid in θ against the sinθ measure. */
    var tot = 0, m;
    for (m = 0; m < N; m++) {
      tot += 0.5 * (g[m] * Math.sin(th[m]) + g[m + 1] * Math.sin(th[m + 1]))
                 * (th[m + 1] - th[m]);
    }
    tot *= 2 * Math.PI;
    var norm = (tot > 0 && isFinite(tot)) ? 1 / tot : 1;
    for (m = 0; m <= N; m++) g[m] *= norm;

    var cum = new Float64Array(N + 1);
    for (m = 0; m < N; m++) {
      cum[m + 1] = cum[m] + Math.PI * (g[m] * Math.sin(th[m]) + g[m + 1] * Math.sin(th[m + 1]))
                          * (th[m + 1] - th[m]);
    }

    var tab = {
      analytic: false, model: model, geo: geo, N: N, th: th, g: g, cum: cum,
      integralCheck: tot, norm: norm,
      peaks: peaks.concat([sigmaBeam, sigmaBeam * 2, sigmaBeam * 4])
    };
    tab.dens = function (x) { return lookupG(tab, x); };
    tab.beyond = function (x) { return lookupBeyond(tab, x); };
    return tab;
  }

  function lookupG(tab, theta) {
    if (!(theta >= 0)) return 0;
    if (theta >= Math.PI) return tab.g[tab.N];
    var f = Math.cbrt(theta / Math.PI) * tab.N;
    var i = Math.floor(f);
    if (i < 0) i = 0;
    if (i >= tab.N) return tab.g[tab.N];
    var w = f - i;
    return tab.g[i] * (1 - w) + tab.g[i + 1] * w;
  }

  function lookupBeyond(tab, theta) {
    if (theta <= 0) return 1;
    if (theta >= Math.PI) return 0;
    var f = Math.cbrt(theta / Math.PI) * tab.N;
    var i = Math.floor(f);
    if (i < 0) i = 0;
    if (i >= tab.N) return 0;
    var w = f - i;
    return _clamp(1 - (tab.cum[i] * (1 - w) + tab.cum[i + 1] * w), 0, 1);
  }

  /* Public accessors that work on either kind of table. */
  function tableG(tab, theta) { return _finite(tab.dens(theta), 0); }
  function tableBeyond(tab, theta) { return _clamp(_finite(tab.beyond(theta), 0), 0, 1); }

  /* =================================================================
     4. THE DETECTOR

     A circular aperture of angular radius ρ whose axis makes an angle
     θ_d with the beam. The acceptance is the integral of the exit
     density over that cap.

     The integral is done the way round that works. Integrating over the
     cap directly fails: the density can vary by ten orders of magnitude
     inside a wide aperture, and no fixed quadrature rule on the cap will
     resolve a forward peak a third of a degree across. Instead we
     integrate over the polar angle θ — where the structure is, and where
     we know exactly where it is — and evaluate the azimuthal fraction of
     each ring that lies inside the cap in closed form:

        a point on the ring at polar θ and azimuth ψ (measured from the
        plane through the beam and the detector axis) is inside the cap
        when  cosθ cosθ_d + sinθ sinθ_d cosψ ≥ cos ρ,
        so the fraction of the ring inside is  arccos(X)/π  with
        X = (cos ρ − cosθ cosθ_d)/(sinθ sinθ_d),
        clipped to the whole ring or none of it.

     Only θ in [θ_d − ρ, θ_d + ρ] contributes at all, which bounds the
     range, and the model's own feature angles are inserted as
     breakpoints inside it.
     ================================================================= */

  function solidAngle(rhoRad) {
    return TAU * (1 - Math.cos(_clamp(rhoRad, 0, Math.PI)));
  }

  /* Fraction of the ring at polar angle θ that lies inside the cap. */
  function ringFraction(theta, thetaD, rho) {
    var st = Math.sin(theta), sd = Math.sin(thetaD);
    if (st < 1e-12 || sd < 1e-12) {
      /* degenerate: ring is a point, or the cap is centred on the axis */
      return Math.abs(theta - thetaD) <= rho ? 1 : 0;
    }
    var X = (Math.cos(rho) - Math.cos(theta) * Math.cos(thetaD)) / (st * sd);
    if (X <= -1) return 1;
    if (X >= 1) return 0;
    return Math.acos(X) / Math.PI;
  }

  var GL10 = null;

  /* ∫ over one segment [a,b] of  g(θ)·ringFrac(θ)·2π sinθ dθ.
     Sub-intervals are graded toward the low end when the segment spans
     more than a factor of a few, which is what the forward peak needs. */
  function segIntegral(tab, a, b, thetaD, rho) {
    if (!(b > a)) return 0;
    if (!GL10) GL10 = gauss(10);
    var K = 16, acc = 0, i, j;
    var graded = (a < 1e-9) || ((b - a) / Math.max(a, 1e-12) > 3);
    for (i = 0; i < K; i++) {
      var s0 = i / K, s1 = (i + 1) / K;
      if (graded) { s0 = s0 * s0 * s0; s1 = s1 * s1 * s1; }
      var lo = a + (b - a) * s0, hi = a + (b - a) * s1;
      var hw = 0.5 * (hi - lo), mid = 0.5 * (hi + lo);
      for (j = 0; j < 10; j++) {
        var x = mid + hw * GL10.x[j];
        var f = tab.dens(x) * ringFraction(x, thetaD, rho) * TAU * Math.sin(x);
        acc += hw * GL10.w[j] * _finite(f, 0);
      }
    }
    return acc;
  }

  function capFraction(tab, thetaD, rho) {
    rho = _clamp(_finite(rho, 0), 1e-7, Math.PI);
    thetaD = _clamp(_finite(thetaD, 0), 0, Math.PI);
    var lo = Math.max(0, thetaD - rho), hi = Math.min(Math.PI, thetaD + rho);
    if (!(hi > lo)) return 0;

    /* breakpoints: segment ends, model features, and the cap edges */
    var bp = [lo, hi], i;
    for (i = 0; i < tab.peaks.length; i++) {
      var p = tab.peaks[i];
      if (p > lo + 1e-12 && p < hi - 1e-12) bp.push(p);
    }
    bp.sort(function (x, y) { return x - y; });

    var total = 0;
    for (i = 0; i < bp.length - 1; i++) {
      if (bp[i + 1] - bp[i] > 1e-14) total += segIntegral(tab, bp[i], bp[i + 1], thetaD, rho);
    }
    return _clamp(_finite(total, 0), 0, 1);
  }

  /* =================================================================
     5. AN EXPOSURE
     ================================================================= */

  /* Cache the exit table: rebuilding it for every exposure at the same
     settings would be wasteful and would tempt the interface into
     rebuilding it inside a render loop. */
  var _tabCache = {}, _tabOrder = [], TAB_CACHE_MAX = 12;

  function tableFor(cfg, model) {
    var key = [model, cfg.target, cfg.zOverride, cfg.energy, cfg.thickness, cfg.beamSpread].join("|");
    if (_tabCache[key]) return _tabCache[key];
    var geo = geometry(cfg);
    var entry = { tab: exitTable(geo, model, _finite(cfg.beamSpread, 0) * _RAD), geo: geo };
    _tabCache[key] = entry;
    _tabOrder.push(key);
    while (_tabOrder.length > TAB_CACHE_MAX) delete _tabCache[_tabOrder.shift()];
    return entry;
  }

  /* Run one exposure. `model` overrides cfg.model, which is how blind
     mode keeps its secret without the interface ever holding it. */
  function expose(cfg, model, seed, index) {
    model = model || cfg.model;
    var got = tableFor(cfg, model);
    var tab = got.tab, geo = got.geo;

    var thetaD = _clamp(_finite(cfg.detAngle, 45), 0, 180) * _RAD;
    var rho = _clamp(_finite(cfg.detWidth, 5), 0.1, 60) * _RAD;
    var fired = Math.max(1, Math.round(_finite(cfg.particles, 1000)));
    var eff = _clamp(_finite(cfg.efficiency, 0.85), 0, 1);
    var bkgRate = Math.max(0, _finite(cfg.background, 0));

    var accept = capFraction(tab, thetaD, rho);
    var omega = solidAngle(rho);

    var rng = new RNG(mixSeed(seed, index));

    /* Two stages, in the order they happen: particles arrive at the
       aperture, then the screen either records them or does not. */
    var eligible = binomial(rng, fired, accept);
    var detected = binomial(rng, eligible, eff);

    var bkgMean = bkgRate * fired / 1e9;
    var bkg = poisson(rng, bkgMean);
    var raw = detected + bkg;

    /* The experimenter does not know `bkg`; they know the rate they
       measured with the foil removed, and subtract its expectation.
       That is why the corrected count can come out negative. */
    var corrected = raw - bkgMean;
    /* Counting error on the raw total, plus the error on the background
       estimate, added in quadrature. */
    var sigma = Math.sqrt(Math.max(0, raw) + Math.max(0, bkgMean));

    return {
      index: index, seed: seed, exposureSeed: mixSeed(seed, index),
      model: model,
      detAngleDeg: cfg.detAngle, detWidthDeg: cfg.detWidth,
      fired: fired, accept: accept, omega: omega,
      eligible: eligible, detected: detected,
      background: bkg, backgroundMean: bkgMean,
      raw: raw, corrected: corrected, sigma: sigma,
      perSr: omega > 0 ? corrected / omega : 0,
      efficiency: eff,
      settings: snapshot(cfg),
      geo: {
        Z: geo.Z, b_fm: geo.b_fm, nt: geo.nt, thetaMinDeg: geo.thetaMin * _DEG,
        thetaTDeg: geo.thetaT * _DEG, validity: geo.validity, E: geo.E
      },
      /* model predictions at this setting, for the comparison table */
      predicted: {
        rutherford: null, thomson: null
      }
    };
  }

  /* Both models' predicted acceptance at one detector setting, so an
     observation can be scored against each without re-running it. */
  function predictBoth(cfg) {
    var thetaD = _clamp(_finite(cfg.detAngle, 45), 0, 180) * _RAD;
    var rho = _clamp(_finite(cfg.detWidth, 5), 0.1, 60) * _RAD;
    var out = {};
    for (var i = 0; i < 2; i++) {
      var m = i === 0 ? "rutherford" : "thomson";
      var got = tableFor(cfg, m);
      out[m] = capFraction(got.tab, thetaD, rho);
    }
    return out;
  }

  function snapshot(cfg) {
    var s = {};
    var keys = ["model", "target", "zOverride", "particles", "energy", "thickness",
                "detAngle", "detWidth", "efficiency", "background", "beamSpread", "seed"];
    for (var i = 0; i < keys.length; i++) s[keys[i]] = cfg[keys[i]];
    return s;
  }

  /* =================================================================
     6. SWEEPS AND CURVES
     ================================================================= */

  /* A detector sweep: the same exposure repeated at a series of angles,
     each with its own exposure index so the seeds do not repeat. */
  function sweep(cfg, model, seed, startIndex, angles) {
    var out = [], c;
    for (var i = 0; i < angles.length; i++) {
      c = snapshot(cfg); c.detAngle = angles[i];
      out.push(expose(c, model, seed, startIndex + i));
    }
    return out;
  }

  function defaultSweepAngles() {
    return [5, 10, 15, 22.5, 30, 37.5, 45, 60, 75, 90, 105, 120, 135, 150];
  }

  /* The predicted counts-per-steradian curve for a model, on a log
     angular grid — what gets drawn over the observations. */
  function curve(cfg, model, nPoints) {
    nPoints = nPoints || 180;
    var got = tableFor(cfg, model);
    var pts = [];
    for (var i = 0; i <= nPoints; i++) {
      var deg = 0.5 + (179.5 - 0.5) * i / nPoints;
      var th = deg * _RAD;
      pts.push({ deg: deg, perSr: tableG(got.tab, th) });
    }
    return pts;
  }

  /* Fraction predicted beyond a set of angles, both models. */
  function beyond(cfg, degrees) {
    var out = [];
    for (var i = 0; i < degrees.length; i++) {
      var d = degrees[i], th = d * _RAD;
      var r = tableFor(cfg, "rutherford"), t = tableFor(cfg, "thomson");
      out.push({
        deg: d,
        rutherford: tableBeyond(r.tab, th),
        thomson: tableBeyond(t.tab, th)
      });
    }
    return out;
  }

  /* =================================================================
     7. TRAJECTORIES FOR THE APPARATUS VIEW
     A small subsample drawn from the same laws, purely so the apparatus
     has something to show. These are never counted and never exported
     as data — the ledger is built from §5, not from here.
     ================================================================= */

  function sampleDeflection(geo, model, rng) {
    if (model === "thomson") {
      var th = geo.thetaT * Math.sqrt(-Math.log(rng.open()));
      return _clamp(_finite(th, 0), 0, Math.PI);
    }
    /* p uniform in area up to p_max, then Rutherford's cot(φ/2) = 2p/b */
    var p = geo.pMax * Math.sqrt(rng.open());
    var th2 = Math.atan(geo.b / (2 * p));
    return _clamp(_finite(2 * th2, 0), 0, Math.PI);
  }

  function trajectories(cfg, model, seed, index, count) {
    var geo = geometry(cfg);
    var rng = new RNG(mixSeed(mixSeed(seed, index), 0x7A5C));
    var sig = _finite(cfg.beamSpread, 0) * _RAD;
    var out = [];
    count = _clamp(count | 0, 0, 400);
    for (var i = 0; i < count; i++) {
      var beamDev = sig > 0 ? sig * Math.sqrt(-Math.log(rng.open())) : 0;
      var beamAz = rng.next() < 0.5 ? 1 : -1;
      var th = sampleDeflection(geo, model, rng);
      /* Everything is drawn in the scattering plane; the sign is the
         projection of a uniform azimuth onto that plane. */
      var sgn = rng.next() < 0.5 ? 1 : -1;
      var outAngle = sgn * th + beamAz * beamDev;
      out.push({
        theta: th,
        deg: th * _DEG,
        plane: _clamp(outAngle, -Math.PI, Math.PI),
        entry: (rng.next() - 0.5),
        large: th * _DEG >= _LARGE
      });
    }
    return out;
  }

  /* =================================================================
     8. THE LEDGER AND ITS SUMMARIES
     ================================================================= */

  function newSession(cfg, mode) {
    var c = snapshot(cfg);
    return {
      version: _VERSION,
      mode: mode || "free",
      cfg: c,
      seed: c.seed,
      counter: 0,
      ledger: [],
      firedTotal: 0,
      detectedTotal: 0,
      hidden: null,        /* blind mode only */
      prediction: null,    /* guided mode only */
      verdict: null,
      guidedStep: 0
    };
  }

  function record(session, obs) {
    session.ledger.push(obs);
    session.firedTotal += obs.fired;
    session.detectedTotal += obs.detected;
    return obs;
  }

  function nextIndex(session) { return session.counter++; }

  /* Totals across the whole ledger. `largeAngle` and `backscatter` count
     observations, not particles — because an observation at 120° is the
     only evidence of a large-angle event the experimenter ever has. */
  function summary(session) {
    var L = session.ledger;
    var s = {
      exposures: L.length, fired: 0, detected: 0, raw: 0, background: 0,
      largeAngleCounts: 0, largeAngleExposures: 0,
      backscatterCounts: 0, backscatterExposures: 0,
      maxAngleWithCount: null, maxAngleSearched: null
    };
    for (var i = 0; i < L.length; i++) {
      var o = L[i];
      s.fired += o.fired; s.detected += o.detected;
      s.raw += o.raw; s.background += o.backgroundMean;
      var a = o.detAngleDeg;
      if (s.maxAngleSearched === null || a > s.maxAngleSearched) s.maxAngleSearched = a;
      if (o.detected > 0 && (s.maxAngleWithCount === null || a > s.maxAngleWithCount)) s.maxAngleWithCount = a;
      if (a >= _LARGE) { s.largeAngleExposures++; s.largeAngleCounts += o.detected; }
      if (a >= _BACK) { s.backscatterExposures++; s.backscatterCounts += o.detected; }
    }
    return s;
  }

  /* =================================================================
     9. BLIND MODE
     ================================================================= */

  /* The hidden model comes from the seed, so a session is reproducible
     end to end — including which model was hidden. */
  function chooseHidden(seed) {
    var r = new RNG(mixSeed(seed, 0xB11D));
    return r.next() < 0.5 ? "rutherford" : "thomson";
  }

  /* Score a blind conclusion. Deliberately plain: what was hidden, what
     was said, how much was collected, and one likelihood ratio computed
     from the observations rather than a manufactured "confidence score".

     The ratio is the product over exposures of Poisson likelihoods under
     each model's predicted mean, including background. It is a real
     quantity with a real meaning, and it is reported as an order of
     magnitude because that is all the precision it has. */
  function scoreBlind(session, choice, confidence) {
    var L = session.ledger, i;
    var logLR = 0, usable = 0, perObs = [];
    for (i = 0; i < L.length; i++) {
      var o = L[i];
      var c = o.settings;
      var pred = predictBoth(c);
      var muR = c.particles * pred.rutherford * o.efficiency + o.backgroundMean;
      var muT = c.particles * pred.thomson * o.efficiency + o.backgroundMean;
      /* guard against a zero mean: an exposure with no possible counts
         under a model is evidence, but log(0) is not a number */
      var floorMu = 1e-9;
      muR = Math.max(floorMu, muR); muT = Math.max(floorMu, muT);
      var k = o.raw;
      var lr = (k * Math.log(muR) - muR) - (k * Math.log(muT) - muT);
      if (isFinite(lr)) {
        logLR += lr; usable++;
        perObs.push({ index: o.index, deg: o.detAngleDeg, raw: k,
                      muR: muR, muT: muT, logLR: lr });
      }
    }
    perObs.sort(function (a, b) { return Math.abs(b.logLR) - Math.abs(a.logLR); });

    var s = summary(session);
    var correct = (choice === session.hidden);
    return {
      hidden: session.hidden, choice: choice, correct: correct,
      confidence: confidence,
      exposures: s.exposures, fired: s.fired,
      largeAngleExposures: s.largeAngleExposures,
      largeAngleCounts: s.largeAngleCounts,
      backscatterExposures: s.backscatterExposures,
      backscatterCounts: s.backscatterCounts,
      maxAngleSearched: s.maxAngleSearched,
      maxAngleWithCount: s.maxAngleWithCount,
      logLR: logLR, usable: usable,
      log10LR: logLR / Math.LN10,
      informative: perObs.slice(0, 4),
      /* calibration is a statement about one trial, so it is phrased as
         one: no percentage is invented from a single outcome */
      calibration: calibrationNote(confidence, correct)
    };
  }

  function calibrationNote(conf, correct) {
    if (conf === null || conf === undefined) return "No confidence was recorded.";
    if (correct) {
      if (conf >= 90) return "Confident and right. One trial cannot tell you whether that confidence was earned or lucky — it takes a run of them at the same stated confidence before calibration means anything.";
      if (conf <= 60) return "Right, but you said you were not sure. If that keeps happening you are underconfident, and you are paying for evidence you did not need.";
      return "Right, at a confidence you can live with.";
    }
    if (conf >= 90) return "Wrong at high confidence. This is the expensive kind of error: on a well-calibrated scale it should happen less than one time in ten.";
    if (conf <= 60) return "Wrong, but you said so. That is what a low confidence is for.";
    return "Wrong at moderate confidence.";
  }

  /* =================================================================
     10. VALIDATION HELPERS
     Used by js/test.js and by the validation panel in the instrument.
     ================================================================= */

  /* The single absolute check available: Geiger and Marsden's 1913
     measurement of the fraction scattered to 45° onto 1 mm² at 1 cm. */
  function absoluteCheck(energyMeV, Z) {
    var A = _targetByKey("au");
    Z = Z || A.Z;
    var E = energyMeV;
    var b = (_ZA * Z * _K_E2 / E) / _FMCM;
    var t = 2.1e-5;
    var n = A.density / A.A * _NA;
    var nt = n * t;
    var phi = 45 * _RAD;
    var s = Math.sin(phi / 2);
    var perSr = nt * (b / 4) * (b / 4) / (s * s * s * s);
    var omega = 0.01 / (1 * 1);              /* 1 mm² at 1 cm */
    return { fraction: perSr * omega, perSr: perSr, b_fm: b * _FMCM, nt: nt, Z: Z, E: E };
  }

  /* =================================================================
     exports
     ================================================================= */
  return {
    RNG: RNG, mixSeed: mixSeed, poisson: poisson, binomial: binomial,
    geometry: geometry, kernel: kernel, survival: survival,
    pScatterRuth: pScatterRuth,
    exitTable: exitTable, tableG: tableG, tableBeyond: tableBeyond,
    tableFor: tableFor, capFraction: capFraction, solidAngle: solidAngle,
    expose: expose, predictBoth: predictBoth, snapshot: snapshot,
    sweep: sweep, defaultSweepAngles: defaultSweepAngles,
    curve: curve, beyond: beyond,
    sampleDeflection: sampleDeflection, trajectories: trajectories,
    newSession: newSession, record: record, nextIndex: nextIndex,
    summary: summary,
    chooseHidden: chooseHidden, scoreBlind: scoreBlind,
    absoluteCheck: absoluteCheck,
    gauss: gauss
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Atom;
