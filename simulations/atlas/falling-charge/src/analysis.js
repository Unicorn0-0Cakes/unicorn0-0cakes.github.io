/* =====================================================================
   THE FALLING CHARGE — inferring the elementary unit
   ---------------------------------------------------------------------
   SAFEGUARD: this module deliberately imports NOTHING that contains the
   accepted elementary charge. It has no reference to units.js, no access
   to the truth vault, and no constant of that magnitude anywhere in it.
   The candidate range is derived from the DATA. tests/test-no-circularity.js
   greps this file to keep it that way.

   Implemented: Method A (candidate-lattice search) and Method B
   (weighted regression through the origin).
   NOT implemented: Method C (robust), Method D (likelihood mixture),
   Method E (pairwise differences). The interface says so.

   A and B are NOT independent confirmations of each other: B consumes the
   integer assignments that A produced. Stated wherever both are shown.
   docs/UNCERTAINTY_ANALYSIS.md, docs/LIMITATIONS.md L-13, L-14.
   ===================================================================== */
(function (root) {
  "use strict";

  const isNode = (typeof module !== "undefined" && module.exports);

  const N_GRID = 4000;
  const N_MAX_DEFAULT = 25;

  /* =================================================================
     1. THE DATA-DRIVEN CANDIDATE RANGE
     ============================================================== */

  /**
   * Bounds for the search, from the measurements alone.
   *
   *   Every droplet carries at least one elementary unit, so
   *       e <= max |q_i|
   *   and if no droplet carries more than nMax units, then
   *       e >= max |q_i| / nMax
   *
   * The lower bound is what tames the degeneracy: chi-squared tends to
   * zero as e tends to zero, because a small enough unit fits anything.
   * That is a real property of the method, not a bug. docs/LIMITATIONS.md L-14.
   */
  function candidateRange(charges, nMax) {
    nMax = nMax || N_MAX_DEFAULT;
    let maxAbs = 0;
    for (let i = 0; i < charges.length; i++) {
      const a = Math.abs(charges[i]);
      if (isFinite(a) && a > maxAbs) maxAbs = a;
    }
    if (!(maxAbs > 0)) return null;
    return { lo: maxAbs / nMax, hi: maxAbs * 1.05, maxAbs: maxAbs, nMax: nMax };
  }

  /** Nearest NONZERO integer to x. */
  function nearestNonzeroInt(x) {
    const n = Math.round(x);
    if (n !== 0) return n;
    return x >= 0 ? 1 : -1;
  }

  /* =================================================================
     2. METHOD A — CANDIDATE-LATTICE SEARCH
     ============================================================== */

  /**
   * chi-squared for one candidate.
   *   n_i = nearest nonzero integer to q_i / e
   *   chi2 = sum (q_i - n_i e)^2 / sigma_i^2
   */
  function objectiveAt(eCand, charges, sigmas) {
    let chi2 = 0;
    for (let i = 0; i < charges.length; i++) {
      const s = (sigmas[i] > 0 && isFinite(sigmas[i])) ? sigmas[i] : 1;
      const n = nearestNonzeroInt(charges[i] / eCand);
      const r = charges[i] - n * eCand;
      chi2 += (r * r) / (s * s);
    }
    return chi2;
  }

  /* -----------------------------------------------------------------
     THE PENALTY, AND WHY THERE MUST BE ONE
     -----------------------------------------------------------------
     Raw chi-squared cannot select a lattice. Two things go wrong, and
     only the second is usually noticed:

     1. EXACT TIES AT SUB-MULTIPLES. If e explains the data then e/2
        explains it identically — every integer doubles and every
        residual q_i - n_i e is unchanged. chi-squared cannot tell them
        apart at all.

     2. FINER LATTICES GENUINELY FIT BETTER. Worse than a tie: once the
        measurement noise is comparable to e, a finer lattice has more
        rungs available and can absorb the noise into a different integer.
        chi-squared at e/3 is then strictly LOWER than at e. Minimising
        chi-squared alone drives the estimate toward zero.

     A finer lattice is a MORE FLEXIBLE MODEL and must be penalised for
     it, which is what the specification asks for in §16.

     The penalty is not invented for the purpose. It falls out of writing
     the honest marginal likelihood of Model Q, in which the integer
     assignments are nuisance parameters to be summed over rather than
     fitted for free:

         L(e) = prod_i sum_n P(n) * Normal(q_i ; n e, sigma_i^2)

     With a uniform prior over the integers that can occur in a data set
     spanning [0, Q], there are about Q/e of them, so P(n) ~ e/Q. Taking
     the dominant term of the sum,

         -2 ln L  ~  chi2(e) + 2 N ln(Q / e) + const

     which is the objective minimised below. It is a plug-in
     approximation to the marginal likelihood, not an exact one.

     Sanity check on the sub-multiple: the penalty difference between e
     and e/2 is 2 N ln 2, independent of the data, so the exact
     chi-squared tie is broken in favour of the coarser lattice by an
     amount that grows with the sample size. That is the correct
     behaviour — more droplets should make the ladder easier to see, not
     harder.

     This can still be wrong. If every droplet in a small sample happens
     to carry an even number of units, the coarsest lattice consistent
     with the data really is 2e, and the analysis will say so. That is a
     genuine failure mode and it is deliberately left in.
     ----------------------------------------------------------------- */

  /**
   * Penalised objective. `Q` is the charge range spanned by the data.
   */
  function penalisedAt(eCand, charges, sigmas, Q) {
    const chi2 = objectiveAt(eCand, charges, sigmas);
    return chi2 + 2 * charges.length * Math.log(Q / eCand);
  }

  /**
   * Method A. Scans the data-driven range, reports the whole curve, the
   * best candidate, every local minimum (including the sub-multiples at
   * e/2, e/3 ... which are genuine and are NOT hidden), the assignments
   * and the residuals.
   */
  function candidateLattice(charges, sigmas, opts) {
    opts = opts || {};
    const nMax = opts.nMax || N_MAX_DEFAULT;
    const grid = opts.grid || N_GRID;
    const range = candidateRange(charges, nMax);
    if (!range) {
      return { ok: false, reason: "no finite charges supplied" };
    }

    const Q = range.maxAbs;
    const step = (range.hi - range.lo) / (grid - 1);
    const curve = new Array(grid);       // [e, chi2, penalised]
    let best = { index: -1, g: Infinity };
    let bestChi2 = { index: -1, chi2: Infinity };

    for (let k = 0; k < grid; k++) {
      const e = range.lo + k * step;
      const chi2 = objectiveAt(e, charges, sigmas);
      const g = chi2 + 2 * charges.length * Math.log(Q / e);
      curve[k] = [e, chi2, g];
      if (g < best.g) best = { index: k, g: g };
      if (chi2 < bestChi2.chi2) bestChi2 = { index: k, chi2: chi2 };
    }

    /* refine on the PENALISED objective */
    const refined = refine(best.index, curve, charges, sigmas, Q);

    /* the unpenalised minimum, reported so the degeneracy is visible */
    const chi2Min = refine(bestChi2.index, curve, charges, sigmas, null);

    /* local minima of the penalised objective */
    let minima = [];
    for (let k = 2; k < grid - 2; k++) {
      if (curve[k][2] <= curve[k - 1][2] && curve[k][2] <= curve[k + 1][2] &&
          curve[k][2] <= curve[k - 2][2] && curve[k][2] <= curve[k + 2][2]) {
        minima.push(refine(k, curve, charges, sigmas, Q));
      }
    }
    minima = dedupe(minima);
    minima.sort(function (a, b) { return a.g - b.g; });

    const dof = Math.max(1, charges.length - 1);
    const assign = assignments(refined.e, charges, sigmas);

    /* Delta chi-squared = 1 interval. Assumes local quadratic behaviour,
       which fails near the sub-multiple minima — hence the bootstrap. */
    const interval = deltaChi2Interval(refined.e, refined.chi2, charges, sigmas, range);

    return {
      ok: true,
      method: "A — candidate-lattice search",
      eHat: refined.e,
      chi2: refined.chi2,
      dof: dof,
      chi2Reduced: refined.chi2 / dof,
      penalised: refined.g,
      curve: curve,
      range: range,
      localMinima: minima.slice(0, 12),
      unpenalisedMinimum: chi2Min,
      selection: {
        rule: "minimum of chi2(e) + 2 N ln(Q/e) — the plug-in marginal " +
              "likelihood of the quantised model with a uniform prior over " +
              "integer charge states",
        penaltyAtChosen: 2 * charges.length * Math.log(Q / refined.e),
        subMultipleRatio: chi2Min.e > 0 ? refined.e / chi2Min.e : NaN,
        unpenalisedWouldDiffer: Math.abs(refined.e - chi2Min.e) > refined.e * 1e-6
      },
      subMultipleWarning: minima.length > 1,
      interval: interval,
      assignments: assign.n,
      residuals: assign.residuals,
      normalisedResiduals: assign.normalised,
      ambiguous: assign.ambiguous,
      note: "The objective tends to zero as the candidate tends to zero: a " +
            "small enough unit fits any data. The search is therefore bounded " +
            "below by max|q| / nMax, with nMax = " + nMax + ". Sub-multiple " +
            "minima at half and a third of the chosen candidate tie EXACTLY " +
            "with it, so the selection rule is parsimony: the coarsest " +
            "lattice consistent with the data. All minima are plotted."
    };
  }

  /** Collapse minima that refined to the same candidate. */
  function dedupe(minima) {
    const out = [];
    minima.sort(function (a, b) { return a.e - b.e; });
    for (let i = 0; i < minima.length; i++) {
      const last = out[out.length - 1];
      if (last && Math.abs(minima[i].e - last.e) < last.e * 1e-6) {
        if (minima[i].chi2 < last.chi2) out[out.length - 1] = minima[i];
      } else {
        out.push(minima[i]);
      }
    }
    return out;
  }

  /**
   * Golden-section refinement inside the bracketing grid cell.
   * `Q` non-null refines the penalised objective; null refines chi-squared.
   */
  function refine(index, curve, charges, sigmas, Q) {
    const f = (Q === null || Q === undefined)
      ? function (e) { return objectiveAt(e, charges, sigmas); }
      : function (e) { return penalisedAt(e, charges, sigmas, Q); };
    const lo = curve[Math.max(0, index - 1)][0];
    const hi = curve[Math.min(curve.length - 1, index + 1)][0];
    const phi = (Math.sqrt(5) - 1) / 2;
    let a = lo, b = hi;
    let c = b - phi * (b - a), d = a + phi * (b - a);
    let fc = f(c), fd = f(d);
    for (let i = 0; i < 120 && (b - a) > Math.abs(b) * 1e-12; i++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = f(c); }
      else         { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = f(d); }
    }
    const e = 0.5 * (a + b);
    const chi2 = objectiveAt(e, charges, sigmas);
    return { e: e, chi2: chi2,
             g: chi2 + 2 * charges.length * Math.log((Q || charges.length) / e) };
  }

  function deltaChi2Interval(eHat, chi2Min, charges, sigmas, range) {
    const target = chi2Min + 1;
    const walk = function (dir) {
      let step = eHat * 1e-4, e = eHat;
      for (let i = 0; i < 20000; i++) {
        e += dir * step;
        if (e <= range.lo || e >= range.hi) return NaN;
        if (objectiveAt(e, charges, sigmas) > target) return e;
      }
      return NaN;
    };
    const lo = walk(-1), hi = walk(+1);
    return {
      lo: lo, hi: hi,
      halfWidth: (isFinite(lo) && isFinite(hi)) ? (hi - lo) / 2 : NaN,
      level: 0.68,
      basis: "Δχ² = 1; assumes local quadratic behaviour, which is not " +
             "reliable when sub-multiple minima are nearby"
    };
  }

  /** Integer assignments and residuals for a given candidate. */
  function assignments(eCand, charges, sigmas) {
    const n = [], residuals = [], normalised = [], ambiguous = [];
    for (let i = 0; i < charges.length; i++) {
      const ratio = charges[i] / eCand;
      const ni = nearestNonzeroInt(ratio);
      const r = charges[i] - ni * eCand;
      const s = (sigmas[i] > 0 && isFinite(sigmas[i])) ? sigmas[i] : 1;
      n.push(ni);
      residuals.push(r);
      normalised.push(r / s);
      /* An assignment is ambiguous when the charge sits near the midpoint
         between two rungs — the honest thing is to say so, not to pick. */
      const frac = Math.abs(ratio - Math.round(ratio));
      ambiguous.push(frac > 0.30);
    }
    return { n: n, residuals: residuals, normalised: normalised, ambiguous: ambiguous };
  }

  /* =================================================================
     3. METHOD B — WEIGHTED REGRESSION THROUGH THE ORIGIN
     ============================================================== */

  /**
   *   q_i = n_i e + eps_i,  weights w_i = 1 / sigma_i^2
   *   eHat = sum(w n q) / sum(w n^2)
   *   SE   = 1 / sqrt(sum(w n^2))     scaled by sqrt(chi2Red) if > 1
   *
   * Consumes the assignments from Method A. It is therefore NOT an
   * independent check of A, and the interface says so.
   */
  function weightedRegression(charges, sigmas, ns) {
    let swnq = 0, swnn = 0, used = 0;
    for (let i = 0; i < charges.length; i++) {
      const n = ns[i];
      if (!n) continue;
      const s = (sigmas[i] > 0 && isFinite(sigmas[i])) ? sigmas[i] : 1;
      const w = 1 / (s * s);
      swnq += w * n * charges[i];
      swnn += w * n * n;
      used++;
    }
    if (!(swnn > 0) || used < 2) {
      return { ok: false, reason: "fewer than two usable measurements" };
    }
    const eHat = swnq / swnn;
    const seRaw = 1 / Math.sqrt(swnn);

    let chi2 = 0;
    const residuals = [], leverage = [];
    for (let i = 0; i < charges.length; i++) {
      const n = ns[i];
      const s = (sigmas[i] > 0 && isFinite(sigmas[i])) ? sigmas[i] : 1;
      const r = charges[i] - n * eHat;
      residuals.push(r);
      chi2 += (r * r) / (s * s);
      leverage.push(n ? (n * n / (s * s)) / swnn : 0);
    }
    const dof = Math.max(1, used - 1);
    const chi2Red = chi2 / dof;
    /* Inflating the standard error when the scatter exceeds the declared
       uncertainties is the conservative choice, and it is the honest one
       here because we KNOW the declared sigmas are underestimates (L-1). */
    const se = seRaw * (chi2Red > 1 ? Math.sqrt(chi2Red) : 1);

    return {
      ok: true,
      method: "B — weighted regression through the origin",
      eHat: eHat, se: se, seRaw: seRaw,
      chi2: chi2, dof: dof, chi2Reduced: chi2Red,
      ci68: [eHat - se, eHat + se],
      ci95: [eHat - 1.96 * se, eHat + 1.96 * se],
      residuals: residuals, leverage: leverage, used: used,
      note: "Consumes the integer assignments from Method A, so it is not " +
            "an independent confirmation of it. The standard error is " +
            "inflated by sqrt(reduced chi-squared) when the scatter exceeds " +
            "the declared uncertainties."
    };
  }

  /* =================================================================
     4. SENSITIVITY OF THE ASSIGNMENTS
     ============================================================== */

  /**
   * How stable are the integer assignments? Re-run at candidates either
   * side of the best and count how many droplets change rung.
   */
  function assignmentStability(eHat, charges, sigmas, frac) {
    frac = frac || 0.03;
    const base = assignments(eHat, charges, sigmas).n;
    const out = [];
    [-frac, -frac / 2, frac / 2, frac].forEach(function (f) {
      const alt = assignments(eHat * (1 + f), charges, sigmas).n;
      let changed = 0;
      for (let i = 0; i < base.length; i++) if (alt[i] !== base[i]) changed++;
      out.push({ shift: f, changed: changed, fraction: base.length ? changed / base.length : 0 });
    });
    return out;
  }

  /* =================================================================
     5. THE FULL ANALYSIS
     ============================================================== */

  /**
   * Run the implemented methods over a set of measurements.
   * @param {Array} items  [{measId, charge, uCharge, ...}]
   */
  function run(items, opts) {
    opts = opts || {};
    const charges = items.map(function (m) { return m.charge; });
    const sigmas = items.map(function (m) {
      return (isFinite(m.uCharge) && m.uCharge > 0) ? m.uCharge : Math.abs(m.charge) * 0.1;
    });

    if (items.length < 2) {
      return { ok: false, reason: "at least two measurements are required",
               n: items.length };
    }

    const A = candidateLattice(charges, sigmas, opts);
    if (!A.ok) return { ok: false, reason: A.reason, n: items.length };
    const B = weightedRegression(charges, sigmas, A.assignments);

    return {
      ok: true,
      n: items.length,
      ids: items.map(function (m) { return m.measId; }),
      charges: charges, sigmas: sigmas,
      methodA: A,
      methodB: B,
      eHat: B.ok ? B.eHat : A.eHat,
      uncertainty: B.ok ? B.se : (A.interval.halfWidth || NaN),
      primary: B.ok ? "B" : "A",
      stability: assignmentStability(A.eHat, charges, sigmas),
      ladder: ladder(B.ok ? B.eHat : A.eHat, A.assignments),
      notImplemented: [
        "Method C — robust estimation",
        "Method D — likelihood over integer states",
        "Method E — pairwise differences and charge steps",
        "Model comparison (quantised versus continuous)"
      ]
    };
  }

  /** The inferred lattice, for the quantisation-ladder chart. */
  function ladder(eHat, ns) {
    let maxN = 1;
    for (let i = 0; i < ns.length; i++) maxN = Math.max(maxN, Math.abs(ns[i]));
    const rungs = [];
    for (let k = 1; k <= maxN; k++) rungs.push({ n: k, q: k * eHat });
    return rungs;
  }

  /**
   * The same estimator, as a plain function of an item array. Used by
   * the bootstrap and the leave-one-out analysis so that every quoted
   * interval comes from the same estimator as the point estimate.
   */
  function estimator(opts) {
    return function (items) {
      const r = run(items, opts);
      return r.ok ? r.eHat : NaN;
    };
  }

  const API = {
    N_GRID: N_GRID, N_MAX_DEFAULT: N_MAX_DEFAULT,
    candidateRange: candidateRange, nearestNonzeroInt: nearestNonzeroInt,
    objectiveAt: objectiveAt, penalisedAt: penalisedAt,
    candidateLattice: candidateLattice,
    assignments: assignments, weightedRegression: weightedRegression,
    assignmentStability: assignmentStability,
    run: run, ladder: ladder, estimator: estimator
  };

  if (isNode) module.exports = API;
  root.FC = root.FC || {};
  root.FC.analysis = API;

})(typeof globalThis !== "undefined" ? globalThis : this);
