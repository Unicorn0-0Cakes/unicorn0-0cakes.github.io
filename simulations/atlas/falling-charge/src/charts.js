/* =====================================================================
   THE FALLING CHARGE — charts
   ---------------------------------------------------------------------
   Every chart returns { summary, table } alongside drawing itself, so a
   text alternative and a data table always exist. A chart that cannot
   describe itself does not ship. docs/ACCESSIBILITY.md.

   Drawing takes a 2D context and a palette; no document access.
   ===================================================================== */
(function (root) {
  "use strict";
  const isNode = (typeof module !== "undefined" && module.exports);
  const U = isNode ? require("./units.js") : root.FC.units;

  const PAD = { l: 58, r: 14, t: 16, b: 34 };

  /* ---------------- frame ------------------------------------------- */

  function frame(g, L, pal, xLab, yLab, xr, yr, opts) {
    opts = opts || {};
    g.save();
    g.clearRect(L.x, L.y, L.w, L.h);
    const p = { x: L.x + PAD.l, y: L.y + PAD.t,
                w: L.w - PAD.l - PAD.r, h: L.h - PAD.t - PAD.b };

    g.strokeStyle = pal.gridSoft;
    g.lineWidth = 0.5;
    g.font = "9px ui-monospace, monospace";
    g.fillStyle = pal.muted;

    const xt = ticks(xr[0], xr[1], 5), yt = ticks(yr[0], yr[1], 4);
    g.textAlign = "center"; g.textBaseline = "top";
    xt.forEach(function (t) {
      const px = p.x + (t - xr[0]) / (xr[1] - xr[0]) * p.w;
      g.beginPath(); g.moveTo(px, p.y); g.lineTo(px, p.y + p.h); g.stroke();
      g.fillText(fmtTick(t, opts.xScale), px, p.y + p.h + 5);
    });
    g.textAlign = "right"; g.textBaseline = "middle";
    yt.forEach(function (t) {
      const py = p.y + p.h - (t - yr[0]) / (yr[1] - yr[0]) * p.h;
      g.beginPath(); g.moveTo(p.x, py); g.lineTo(p.x + p.w, py); g.stroke();
      g.fillText(fmtTick(t, opts.yScale), p.x - 6, py);
    });

    g.strokeStyle = pal.rule; g.lineWidth = 1;
    g.strokeRect(p.x + 0.5, p.y + 0.5, p.w, p.h);

    g.fillStyle = pal.muted;
    g.font = "9px ui-monospace, monospace";
    g.textAlign = "center"; g.textBaseline = "bottom";
    g.fillText(xLab, p.x + p.w / 2, L.y + L.h - 2);
    g.save();
    g.translate(L.x + 11, p.y + p.h / 2);
    g.rotate(-Math.PI / 2);
    g.textBaseline = "top";
    g.fillText(yLab, 0, 0);
    g.restore();
    g.restore();
    return {
      p: p,
      X: function (v) { return p.x + (v - xr[0]) / (xr[1] - xr[0]) * p.w; },
      Y: function (v) { return p.y + p.h - (v - yr[0]) / (yr[1] - yr[0]) * p.h; }
    };
  }

  function ticks(lo, hi, n) {
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return [lo];
    const raw = (hi - lo) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const stepN = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
    const step = stepN * mag;
    const out = [];
    for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) out.push(t);
    return out;
  }

  function fmtTick(t, scale) {
    const v = scale ? t * scale : t;
    const a = Math.abs(v);
    if (a === 0) return "0";
    if (a >= 1e4 || a < 1e-3) return v.toExponential(1);
    return String(Math.round(v * 1000) / 1000);
  }

  function extent(arr, padFrac) {
    let lo = Infinity, hi = -Infinity;
    arr.forEach(function (v) { if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } });
    if (!isFinite(lo)) return [0, 1];
    if (lo === hi) { lo -= Math.abs(lo) * 0.1 + 1e-30; hi += Math.abs(hi) * 0.1 + 1e-30; }
    const pad = (hi - lo) * (padFrac === undefined ? 0.08 : padFrac);
    return [lo - pad, hi + pad];
  }

  /* ================================================================
     1. Position versus time — raw track and fitted line
     ============================================================= */
  function positionTime(g, L, pal, samples, fit) {
    if (!samples || samples.length < 2) return empty("No tracked samples yet.");
    const ts = samples.map(function (s) { return s[0]; });
    const ys = samples.map(function (s) { return s[1] * 1e6; });   // µm
    const xr = extent(ts, 0.02), yr = extent(ys);
    const f = frame(g, L, pal, "time / s", "position / µm", xr, yr);

    if (fit && fit.ok) {
      g.strokeStyle = pal.fit; g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(f.X(xr[0]), f.Y((fit.intercept + fit.slope * xr[0]) * 1e6));
      g.lineTo(f.X(xr[1]), f.Y((fit.intercept + fit.slope * xr[1]) * 1e6));
      g.stroke();
    }
    g.fillStyle = pal.point;
    samples.forEach(function (s) {
      g.beginPath(); g.arc(f.X(s[0]), f.Y(s[1] * 1e6), 1.5, 0, Math.PI * 2); g.fill();
    });

    const v = fit && fit.ok ? fit.slope : NaN;
    return {
      summary: samples.length + " tracked positions over " +
        (ts[ts.length - 1] - ts[0]).toFixed(1) + " seconds, spanning " +
        (Math.abs(ys[ys.length - 1] - ys[0])).toFixed(0) + " micrometres. " +
        (isFinite(v)
          ? "The fitted velocity is " + (v * 1e6).toFixed(2) + " micrometres per second " +
            (v < 0 ? "downward" : "upward") + ", with a standard error of " +
            (fit.se * 1e6).toFixed(2) + " and R-squared " + fit.r2.toFixed(3) + "."
          : "No velocity fit is available.") +
        " Scatter about the line is Brownian motion.",
      table: { head: ["t / s", "y / µm"],
               rows: samples.map(function (s) { return [s[0].toFixed(3), (s[1] * 1e6).toFixed(2)]; }) }
    };
  }

  /* ================================================================
     2. Measured charges with uncertainty bars
     ============================================================= */
  function chargeDistribution(g, L, pal, items) {
    if (!items.length) return empty("No measurements yet.");
    const qs = items.map(function (m) { return m.charge * 1e19; });
    const us = items.map(function (m) { return (m.uCharge || 0) * 1e19; });
    const yr = extent(qs.map(function (q, i) { return q + us[i]; })
                 .concat(qs.map(function (q, i) { return q - us[i]; })));
    const xr = [-0.5, items.length - 0.5];
    const f = frame(g, L, pal, "measurement index", "charge / 10⁻¹⁹ C", xr, yr);

    items.forEach(function (m, i) {
      const x = f.X(i), y = f.Y(qs[i]);
      const rejected = m.status === "rejected";
      g.strokeStyle = rejected ? pal.muted : pal.point;
      g.lineWidth = 1;
      if (us[i] > 0) {
        g.beginPath();
        g.moveTo(x, f.Y(qs[i] - us[i])); g.lineTo(x, f.Y(qs[i] + us[i]));
        g.moveTo(x - 2.5, f.Y(qs[i] - us[i])); g.lineTo(x + 2.5, f.Y(qs[i] - us[i]));
        g.moveTo(x - 2.5, f.Y(qs[i] + us[i])); g.lineTo(x + 2.5, f.Y(qs[i] + us[i]));
        g.stroke();
      }
      /* accepted = filled disc, rejected = hollow square. Never colour alone. */
      if (rejected) {
        g.strokeRect(x - 2.5, y - 2.5, 5, 5);
      } else {
        g.fillStyle = pal.point;
        g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill();
      }
    });

    const acc = items.filter(function (m) { return m.status !== "rejected"; }).length;
    return {
      summary: items.length + " measured charges, of which " + acc +
        " are accepted (filled circles) and " + (items.length - acc) +
        " rejected (hollow squares). They range from " +
        Math.min.apply(null, qs).toFixed(2) + " to " + Math.max.apply(null, qs).toFixed(2) +
        " times ten to the minus nineteen coulombs. Bars are one standard " +
        "deviation of the propagated uncertainty.",
      table: { head: ["measurement", "droplet", "charge / 1e-19 C", "± / 1e-19 C", "status"],
               rows: items.map(function (m, i) {
                 return [m.measId, m.dropletId, qs[i].toFixed(3), us[i].toFixed(3), m.status];
               }) }
    };
  }

  /* ================================================================
     3. Charge versus assigned integer, with the fitted line
     ============================================================= */
  function chargeVsInteger(g, L, pal, charges, ns, eHat) {
    if (!charges.length) return empty("No analysis yet.");
    const absN = ns.map(Math.abs), absQ = charges.map(Math.abs).map(function (q) { return q * 1e19; });
    const xr = [0, Math.max.apply(null, absN) + 1];
    const yr = [0, Math.max.apply(null, absQ) * 1.1];
    const f = frame(g, L, pal, "assigned integer charge count |n|", "|charge| / 10⁻¹⁹ C", xr, yr);

    g.strokeStyle = pal.fit; g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(f.X(0), f.Y(0));
    g.lineTo(f.X(xr[1]), f.Y(xr[1] * Math.abs(eHat) * 1e19));
    g.stroke();

    g.fillStyle = pal.point;
    absN.forEach(function (n, i) {
      g.beginPath(); g.arc(f.X(n), f.Y(absQ[i]), 2.6, 0, Math.PI * 2); g.fill();
    });

    return {
      summary: "Measured charge magnitude against the integer count assigned " +
        "to it. The line passes through the origin with slope " +
        (Math.abs(eHat) * 1e19).toFixed(3) + " times ten to the minus nineteen " +
        "coulombs, which is the estimate of the elementary unit. Integers run " +
        "from " + Math.min.apply(null, absN) + " to " + Math.max.apply(null, absN) +
        ". Points falling off the line are the residuals shown in the next chart.",
      table: { head: ["|n|", "|q| / 1e-19 C", "n·ê / 1e-19 C"],
               rows: absN.map(function (n, i) {
                 return [n, absQ[i].toFixed(3), (n * Math.abs(eHat) * 1e19).toFixed(3)];
               }) }
    };
  }

  /* ================================================================
     4. Residuals against any covariate
     ============================================================= */
  function residuals(g, L, pal, xs, res, sigmas, xLabel) {
    if (!xs.length) return empty("No analysis yet.");
    const rr = res.map(function (r) { return r * 1e19; });
    const xr = extent(xs), yr = extent(rr.concat([0]));
    const f = frame(g, L, pal, xLabel, "q − n·ê  /  10⁻¹⁹ C", xr, yr);

    g.strokeStyle = pal.zero; g.lineWidth = 1;
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(f.p.x, f.Y(0)); g.lineTo(f.p.x + f.p.w, f.Y(0)); g.stroke();
    g.setLineDash([]);

    xs.forEach(function (x, i) {
      const px = f.X(x), py = f.Y(rr[i]);
      if (sigmas && sigmas[i] > 0) {
        g.strokeStyle = pal.point; g.lineWidth = 1;
        g.beginPath();
        g.moveTo(px, f.Y(rr[i] - sigmas[i] * 1e19));
        g.lineTo(px, f.Y(rr[i] + sigmas[i] * 1e19));
        g.stroke();
      }
      g.fillStyle = pal.point;
      g.beginPath(); g.arc(px, py, 2.4, 0, Math.PI * 2); g.fill();
    });

    const within = sigmas
      ? rr.filter(function (r, i) { return Math.abs(r) <= sigmas[i] * 1e19; }).length
      : null;
    return {
      summary: "Residuals about the fitted lattice, plotted against " + xLabel +
        ". " + (within !== null
          ? within + " of " + rr.length + " residuals lie within one standard " +
            "deviation, against about " + Math.round(0.68 * rr.length) + " expected " +
            "if the uncertainties are right. "
          : "") +
        "Structure here — a trend, a fan, a step — is evidence that something " +
        "in the model or the apparatus depends on " + xLabel + ". A flat, " +
        "featureless scatter is what an adequate model looks like.",
      table: { head: [xLabel, "residual / 1e-19 C"],
               rows: xs.map(function (x, i) {
                 return [typeof x === "number" ? x.toPrecision(4) : x, rr[i].toFixed(4)];
               }) }
    };
  }

  /* ================================================================
     5. The candidate objective curve
     ============================================================= */
  function objectiveCurve(g, L, pal, A) {
    if (!A || !A.ok) return empty("No analysis yet.");
    const curve = A.curve;
    const es = curve.map(function (c) { return c[0] * 1e19; });
    const gs = curve.map(function (c) { return c[2]; });
    const xr = extent(es, 0.01);
    const lo = Math.min.apply(null, gs), hi = percentileOf(gs, 0.97);
    const yr = [lo - (hi - lo) * 0.05, hi];
    const f = frame(g, L, pal, "candidate elementary charge / 10⁻¹⁹ C",
                    "penalised objective", xr, yr);

    g.strokeStyle = pal.fit; g.lineWidth = 1.2;
    g.beginPath();
    curve.forEach(function (c, i) {
      const x = f.X(c[0] * 1e19), y = f.Y(Math.min(c[2], yr[1]));
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    });
    g.stroke();

    /* every local minimum marked, including sub-multiples */
    A.localMinima.forEach(function (m, i) {
      const x = f.X(m.e * 1e19);
      g.strokeStyle = (i === 0) ? pal.selected : pal.muted;
      g.setLineDash(i === 0 ? [] : [2, 3]);
      g.beginPath(); g.moveTo(x, f.p.y); g.lineTo(x, f.p.y + f.p.h); g.stroke();
      g.setLineDash([]);
    });

    return {
      summary: "The penalised objective across candidate values of the " +
        "elementary charge. It has " + A.localMinima.length + " local " +
        "minimum" + (A.localMinima.length === 1 ? "" : "a") + "; the chosen one " +
        "is at " + (A.eHat * 1e19).toFixed(3) + " times ten to the minus " +
        "nineteen coulombs (solid line), the others are dashed. " +
        "The objective is chi-squared plus a penalty of two N times the log " +
        "of the charge range over the candidate. Without that penalty the " +
        "unpenalised minimum would sit at " + (A.unpenalisedMinimum.e * 1e19).toFixed(3) +
        ", a factor of " + (A.selection.subMultipleRatio || 1).toFixed(2) +
        " away, because a finer lattice always fits noisy data better.",
      table: { head: ["local minimum", "candidate / 1e-19 C", "χ²", "penalised"],
               rows: A.localMinima.map(function (m, i) {
                 return [i === 0 ? "chosen" : String(i + 1),
                         (m.e * 1e19).toFixed(4), m.chi2.toFixed(2), m.g.toFixed(2)];
               }) }
    };
  }

  /* ================================================================
     6. The quantisation ladder
     ============================================================= */
  function ladder(g, L, pal, charges, ns, eHat) {
    if (!charges.length) return empty("No analysis yet.");
    const absQ = charges.map(function (q) { return Math.abs(q) * 1e19; });
    const maxN = Math.max.apply(null, ns.map(Math.abs));
    const yr = [0, Math.max(Math.max.apply(null, absQ), maxN * Math.abs(eHat) * 1e19) * 1.08];
    const f = frame(g, L, pal, "measurement index", "|charge| / 10⁻¹⁹ C",
                    [-0.5, charges.length - 0.5], yr);

    for (let k = 1; k <= maxN; k++) {
      const y = f.Y(k * Math.abs(eHat) * 1e19);
      g.strokeStyle = pal.gridSoft; g.lineWidth = k % 5 === 0 ? 1 : 0.6;
      g.beginPath(); g.moveTo(f.p.x, y); g.lineTo(f.p.x + f.p.w, y); g.stroke();
      if (k % 2 === 1 || maxN < 8) {
        g.fillStyle = pal.muted; g.font = "8px ui-monospace, monospace";
        g.textAlign = "left"; g.textBaseline = "bottom";
        g.fillText(k + "ê", f.p.x + 3, y - 1);
      }
    }
    g.fillStyle = pal.point;
    absQ.forEach(function (q, i) {
      g.beginPath(); g.arc(f.X(i), f.Y(q), 2.6, 0, Math.PI * 2); g.fill();
    });

    return {
      summary: "The inferred lattice. Horizontal lines mark integer multiples " +
        "of the estimate, from one to " + maxN + " units. Each point is a " +
        "measured charge. The elementary charge is not visible anywhere in the " +
        "apparatus; it is visible here, as the spacing that keeps recurring.",
      table: { head: ["rung", "n·ê / 1e-19 C"],
               rows: range(1, maxN).map(function (k) {
                 return [k, (k * Math.abs(eHat) * 1e19).toFixed(3)];
               }) }
    };
  }

  /* ================================================================
     7. Exclusion sensitivity — leave one out
     ============================================================= */
  function exclusionSensitivity(g, L, pal, loo, base) {
    if (!loo || !loo.length) return empty("No analysis yet.");
    const d = loo.map(function (r) { return r.relDelta * 100; });
    const xr = [-0.5, loo.length - 0.5], yr = extent(d.concat([0]));
    const f = frame(g, L, pal, "droplet removed", "change in ê / per cent", xr, yr);

    g.strokeStyle = pal.zero; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(f.p.x, f.Y(0)); g.lineTo(f.p.x + f.p.w, f.Y(0)); g.stroke();
    g.setLineDash([]);

    loo.forEach(function (r, i) {
      const x = f.X(i), y = f.Y(d[i]);
      g.strokeStyle = pal.point; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, f.Y(0)); g.lineTo(x, y); g.stroke();
      g.fillStyle = pal.point;
      g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill();
    });

    let worst = 0, worstId = "—";
    loo.forEach(function (r, i) {
      if (Math.abs(d[i]) > Math.abs(worst)) { worst = d[i]; worstId = r.id; }
    });
    return {
      summary: "How the estimate moves when each droplet is removed in turn. " +
        "The largest single effect is " + worst.toFixed(2) + " per cent, from " +
        worstId + ". A dataset where one droplet moves the answer a long way " +
        "is a dataset whose conclusion rests on that droplet. This chart says " +
        "nothing about which exclusions are justified — only how much they " +
        "would matter.",
      table: { head: ["droplet removed", "ê without it / 1e-19 C", "change / %"],
               rows: loo.map(function (r, i) {
                 return [r.id, (r.estimate * 1e19).toFixed(4), d[i].toFixed(3)];
               }) }
    };
  }

  /* ================================================================
     8. Uncertainty budget
     ============================================================= */
  function uncertaintyBudget(g, L, pal, budget) {
    if (!budget || !budget.rows.length) return empty("No budget computed.");
    const rows = budget.rows.filter(function (r) { return r.contribution > 0; });
    if (!rows.length) return empty("All contributions are zero.");
    const maxC = Math.max.apply(null, rows.map(function (r) { return r.contribution * 100; }));
    const p = { x: L.x + 150, y: L.y + 10, w: L.w - 165, h: L.h - 26 };
    g.save();
    g.clearRect(L.x, L.y, L.w, L.h);
    const bh = Math.min(18, p.h / rows.length);
    rows.forEach(function (r, i) {
      const y = p.y + i * bh;
      const w = (r.contribution * 100) / maxC * p.w;
      g.fillStyle = r.kind === "random" ? pal.point : pal.fit;
      g.fillRect(p.x, y + 2, Math.max(1, w), bh - 5);
      g.fillStyle = pal.ink;
      g.font = "9px ui-monospace, monospace";
      g.textAlign = "right"; g.textBaseline = "middle";
      g.fillText(r.label.slice(0, 22), p.x - 6, y + bh / 2);
      g.textAlign = "left";
      g.fillStyle = pal.muted;
      g.fillText((r.contribution * 100).toFixed(2) + " %  " +
                 (r.kind === "random" ? "(random)" : "(systematic)"),
                 p.x + Math.max(1, w) + 5, y + bh / 2);
    });
    g.restore();

    return {
      summary: "Contribution of each source to the relative uncertainty in a " +
        "single charge, computed by numerically perturbing this model rather " +
        "than from an analytic table. The dominant source is " + budget.dominant +
        ". Random sources total " + (budget.randomRelative * 100).toFixed(2) +
        " per cent, systematic sources " + (budget.systematicRelative * 100).toFixed(2) +
        " per cent. Only the random part falls as more droplets are measured.",
      table: { head: ["source", "kind", "elasticity ∂ln q/∂ln x", "relative u", "contribution %", "% of variance"],
               rows: budget.rows.map(function (r) {
                 return [r.label, r.kind,
                         isFinite(r.elasticity) ? r.elasticity.toFixed(3) : "—",
                         (r.relativeU * 100).toFixed(3) + " %",
                         (r.contribution * 100).toFixed(3) + " %",
                         r.variancePct.toFixed(1)];
               }) }
    };
  }

  /* ---------------- helpers ----------------------------------------- */
  function empty(msg) { return { summary: msg, table: { head: [], rows: [] }, empty: true }; }
  function range(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }
  function percentileOf(arr, q) {
    const s = arr.slice().filter(isFinite).sort(function (a, b) { return a - b; });
    if (!s.length) return 1;
    return s[Math.min(s.length - 1, Math.floor(s.length * q))];
  }

  const API = {
    frame: frame, extent: extent, ticks: ticks,
    positionTime: positionTime, chargeDistribution: chargeDistribution,
    chargeVsInteger: chargeVsInteger, residuals: residuals,
    objectiveCurve: objectiveCurve, ladder: ladder,
    exclusionSensitivity: exclusionSensitivity, uncertaintyBudget: uncertaintyBudget
  };
  if (isNode) module.exports = API;
  root.FC = root.FC || {};
  root.FC.charts = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
