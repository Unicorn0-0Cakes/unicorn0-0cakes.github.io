/* =====================================================================
   THE FALLING CHARGE — uncertainty
   ---------------------------------------------------------------------
   Random and systematic are kept apart and never silently summed.
   docs/UNCERTAINTY_ANALYSIS.md.

   Propagation is Monte Carlo, because the radius inversion is implicit
   and analytic partials would require differentiating through a
   root-find. Analytic propagation is NOT implemented; the first-order
   elasticities are used only for ranking, and the ranking is computed
   numerically rather than asserted.

   Every draw uses a seeded stream, so an uncertainty is reproducible.
   ===================================================================== */
(function (root) {
  "use strict";

  const isNode = (typeof module !== "undefined" && module.exports);
  const U = isNode ? require("./units.js")   : root.FC.units;
  const P = isNode ? require("./physics.js") : root.FC.physics;
  const R = isNode ? require("./prng.js")    : root.FC.prng;

  const N_MC = 400;
  const N_BOOT = 2000;

  /* =================================================================
     1. PER-MEASUREMENT PROPAGATION
     ============================================================== */

  /**
   * Monte Carlo propagation for one measurement.
   *
   * Draws over the USER'S DECLARED uncertainties only — never over the
   * true instrument errors, which the analysis cannot see. So the
   * reported sigma is exactly as good as the user's calibration record,
   * which is the honest situation.
   *
   * @param {object} derived   output of measurement.derive()
   * @param {object} relU      calibration.relativeUncertainties()
   * @param {Stream} rng       the "mc:<measId>" stream
   * @param {object} settings  {slipModel, rhoOil, rhoOilRelU}
   * @param {number} n         draws
   */
  function propagate(derived, relU, rng, settings, n) {
    n = n || N_MC;
    const env = derived.environment;
    const slip = settings.slipModel === "none" ? null : U.SLIP[settings.slipModel];
    const rhoOilRelU = settings.rhoOilRelU === undefined ? 0.006 : settings.rhoOilRelU;

    const radii = new Array(n), charges = new Array(n);
    let okCount = 0;

    for (let i = 0; i < n; i++) {
      /* velocity fits — their own standard errors */
      const vFall = derived.vFall + rng.gauss(0, derived.seVFall || 0);
      const vSigned = derived.vSigned + rng.gauss(0, derived.seVField || 0);

      /* calibration quantities */
      const scaleF = 1 + rng.gauss(0, relU.scale || 0);
      const d = env.d * (1 + rng.gauss(0, relU.plateGap || 0));
      const V = env.V * (1 + rng.gauss(0, relU.voltage || 0));
      const T = env.T + rng.gauss(0, relU.temperatureAbs || 0);
      const p = env.p + rng.gauss(0, relU.pressureAbs || 0);
      const rhoOil = env.rhoOil * (1 + rng.gauss(0, rhoOilRelU));

      /* the scale enters both velocities coherently — it is one error,
         not two, and treating it as two would understate its effect */
      const vF = vFall * scaleF, vS = vSigned * scaleF;

      const eta = P.viscosity(T);
      const rhoAir = P.airDensity(p, T);
      const lambda = P.meanFreePath(p, T);

      if (!(vF > 0) || !(rhoOil > rhoAir) || V === 0) {
        radii[i] = NaN; charges[i] = NaN; continue;
      }
      const sol = P.solveRadius(vF, eta, rhoOil, rhoAir, lambda, slip);
      if (!sol.converged) { radii[i] = NaN; charges[i] = NaN; continue; }

      radii[i] = sol.radius;
      charges[i] = P.chargeFromVelocities(vF, vS, sol.radius, sol.Cc, eta, d, V);
      okCount++;
    }

    return {
      uRadius: sd(radii), uCharge: sd(charges),
      meanRadius: mean(radii), meanCharge: mean(charges),
      draws: n, converged: okCount,
      method: "Monte Carlo over declared calibration and fit uncertainties",
      note: "Does not include any error the user has not declared. " +
            "Does not correct for correlated Brownian residuals " +
            "(LIMITATIONS.md L-1), so this is an underestimate."
    };
  }

  /* =================================================================
     2. SENSITIVITY — computed, not asserted
     ============================================================== */

  /**
   * Perturb one input by a relative amount and recompute the charge.
   * Returns the empirical elasticity d(ln q)/d(ln x). This is what
   * populates the uncertainty budget, so the budget reflects THIS model
   * rather than a textbook ranking.
   */
  function elasticity(derived, settings, param, eps) {
    eps = eps || 0.01;
    const base = recompute(derived, settings, {});
    const bump = {};
    bump[param] = 1 + eps;
    const pert = recompute(derived, settings, bump);
    if (!isFinite(base) || !isFinite(pert) || base === 0) return NaN;
    return Math.log(Math.abs(pert / base)) / Math.log(1 + eps);
  }

  /** Recompute a charge with multiplicative perturbations applied. */
  function recompute(derived, settings, mult) {
    const env = derived.environment;
    const m = function (k) { return mult[k] === undefined ? 1 : mult[k]; };
    const slip = settings.slipModel === "none" ? null : U.SLIP[settings.slipModel];

    const T = env.T * m("T");
    const p = env.p * m("p");
    const eta = P.viscosity(T) * m("eta");
    const rhoAir = P.airDensity(p, T);
    const lambda = P.meanFreePath(p, T);
    const rhoOil = env.rhoOil * m("rhoOil");
    const d = env.d * m("d");
    const V = env.V * m("V");
    const vF = derived.vFall * m("scale") * m("vFall");
    const vS = derived.vSigned * m("scale") * m("vField");

    const sol = P.solveRadius(vF, eta, rhoOil, rhoAir, lambda, slip);
    return P.chargeFromVelocities(vF, vS, sol.radius, sol.Cc, eta, d, V);
  }

  const SENSITIVITY_PARAMS = [
    { key: "eta",    label: "Air viscosity η",        kind: "systematic" },
    { key: "scale",  label: "Reticle scale",          kind: "systematic" },
    { key: "d",      label: "Plate separation d",     kind: "systematic" },
    { key: "V",      label: "Voltage calibration",    kind: "systematic" },
    { key: "rhoOil", label: "Oil density ρ_oil",      kind: "systematic" },
    { key: "T",      label: "Temperature",            kind: "systematic" },
    { key: "p",      label: "Pressure",               kind: "systematic" },
    { key: "vFall",  label: "Fall velocity fit",      kind: "random" },
    { key: "vField", label: "Field-on velocity fit",  kind: "random" }
  ];

  /**
   * The uncertainty budget: elasticity times the declared relative
   * uncertainty, squared and normalised. Reported so the user can see
   * WHICH term dominates rather than being told.
   */
  function budget(derived, settings, relU) {
    const relFor = {
      eta: 0.005,                       // viscosity model, secondary source
      scale: relU.scale || 0,
      d: relU.plateGap || 0,
      V: relU.voltage || 0,
      rhoOil: settings.rhoOilRelU === undefined ? 0.006 : settings.rhoOilRelU,
      T: (relU.temperatureAbs || 0) / (derived.environment.T || 293.15),
      p: (relU.pressureAbs || 0) / (derived.environment.p || 101325),
      vFall: Math.abs((derived.seVFall || 0) / (derived.vFall || 1)),
      vField: derived.vField ? Math.abs((derived.seVField || 0) / derived.vField) : 0
    };

    const rows = SENSITIVITY_PARAMS.map(function (s) {
      const el = elasticity(derived, settings, s.key);
      const rel = relFor[s.key] || 0;
      const contrib = isFinite(el) ? Math.abs(el * rel) : 0;
      return { key: s.key, label: s.label, kind: s.kind,
               elasticity: el, relativeU: rel, contribution: contrib };
    });

    let sumSq = 0;
    rows.forEach(function (r) { sumSq += r.contribution * r.contribution; });
    rows.forEach(function (r) {
      r.variancePct = sumSq > 0 ? 100 * r.contribution * r.contribution / sumSq : 0;
    });
    rows.sort(function (a, b) { return b.contribution - a.contribution; });

    let ranSq = 0, sysSq = 0;
    rows.forEach(function (r) {
      const c2 = r.contribution * r.contribution;
      if (r.kind === "random") ranSq += c2; else sysSq += c2;
    });

    return {
      rows: rows,
      totalRelative: Math.sqrt(sumSq),
      randomRelative: Math.sqrt(ranSq),
      systematicRelative: Math.sqrt(sysSq),
      dominant: rows.length ? rows[0].label : "—",
      note: "Elasticities are computed by numerically perturbing this " +
            "model, not taken from an analytic table."
    };
  }

  /* =================================================================
     3. RESAMPLING
     ============================================================== */

  /**
   * Non-parametric bootstrap over droplets. Captures the random
   * component including non-normality of the lattice assignment, which
   * the chi-squared curvature does not.
   * @param {function} estimator  array of measurements -> number
   */
  function bootstrap(items, estimator, rng, B) {
    B = B || N_BOOT;
    const n = items.length;
    if (n < 2) return { estimates: [], lo: NaN, hi: NaN, sd: NaN, B: 0 };
    const out = [];
    for (let b = 0; b < B; b++) {
      const s = new Array(n);
      for (let i = 0; i < n; i++) s[i] = items[rng.int(0, n - 1)];
      const e = estimator(s);
      if (isFinite(e)) out.push(e);
    }
    out.sort(function (a, b2) { return a - b2; });
    return {
      estimates: out,
      lo: percentile(out, 0.16), hi: percentile(out, 0.84),
      lo95: percentile(out, 0.025), hi95: percentile(out, 0.975),
      median: percentile(out, 0.5),
      sd: sd(out), B: out.length
    };
  }

  /** Leave-one-out. Feeds the exclusion-sensitivity chart. */
  function leaveOneOut(items, estimator) {
    const base = estimator(items);
    return items.map(function (it, i) {
      const rest = items.slice(0, i).concat(items.slice(i + 1));
      const e = rest.length >= 2 ? estimator(rest) : NaN;
      return {
        id: it.measId || it.id || String(i),
        estimate: e,
        delta: isFinite(e) ? e - base : NaN,
        relDelta: isFinite(e) && base ? (e - base) / base : NaN
      };
    });
  }

  /* =================================================================
     4. HELPERS
     ============================================================== */

  function mean(a) {
    let s = 0, n = 0;
    for (let i = 0; i < a.length; i++) if (isFinite(a[i])) { s += a[i]; n++; }
    return n ? s / n : NaN;
  }

  function sd(a) {
    const m = mean(a);
    if (!isFinite(m)) return NaN;
    let s = 0, n = 0;
    for (let i = 0; i < a.length; i++) if (isFinite(a[i])) { s += (a[i] - m) * (a[i] - m); n++; }
    return n > 1 ? Math.sqrt(s / (n - 1)) : NaN;
  }

  function percentile(sorted, q) {
    if (!sorted.length) return NaN;
    const i = (sorted.length - 1) * q;
    const lo = Math.floor(i), hi = Math.ceil(i);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  const API = {
    N_MC: N_MC, N_BOOT: N_BOOT,
    SENSITIVITY_PARAMS: SENSITIVITY_PARAMS,
    propagate: propagate, elasticity: elasticity, recompute: recompute,
    budget: budget, bootstrap: bootstrap, leaveOneOut: leaveOneOut,
    mean: mean, sd: sd, percentile: percentile
  };

  if (isNode) module.exports = API;
  root.FC = root.FC || {};
  root.FC.uncertainty = API;

})(typeof globalThis !== "undefined" ? globalThis : this);
