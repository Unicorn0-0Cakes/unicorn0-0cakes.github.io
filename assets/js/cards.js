/* =====================================================================
   CC / PORTFOLIO — REGISTRY QUERIES AND CARD RENDERING
   ---------------------------------------------------------------------
   Reads data/projects.js. Renders the card system described in
   assets/css/cards.css.

   The single rule enforced here: a project whose portfolioStatus is
   "hidden" is filtered out at the query layer, before anything can
   render it. There is no code path that draws a hidden record.
   ===================================================================== */
(function () {
  "use strict";

  var P = window.PROJECTS || [];
  var CATS = window.CATEGORIES || [];

  /* Resolve site-absolute registry paths against wherever the site is
     mounted. shell.js works the base out from its own URL; if it failed
     to load, fall through unchanged rather than mangling anything. */
  var U = (window.CCShell && window.CCShell.url) || function (x) { return x; };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ------------------------------------------------------------------
     QUERIES
     ------------------------------------------------------------------ */
  function visible() {
    return P.filter(function (p) { return p.portfolioStatus !== "hidden"; });
  }
  function byCategory(cat) {
    return visible().filter(function (p) { return p.category === cat; });
  }
  function byId(id) {
    return visible().filter(function (p) { return p.id === id; })[0] || null;
  }
  function featured() {
    return visible().filter(function (p) { return p.featured; });
  }
  function countIn(cat) { return byCategory(cat).length; }
  function category(id) {
    return CATS.filter(function (c) { return c.id === id; })[0] || null;
  }

  /* Sort so the strongest work leads: showcase, then prototype,
     research, workshop. Within a tier, registry order is preserved —
     the order in the file is a curatorial decision, not an accident. */
  var TIER = { showcase: 1, prototype: 2, research: 2, workshop: 3 };
  function tier(p) { return TIER[p.portfolioStatus] || 9; }
  function curated(list) {
    /* Stable: equal tiers keep registry order, which is the curatorial
       decision. Array#sort is stable in every engine we target. */
    return list.slice().sort(function (a, b) { return tier(a) - tier(b); });
  }

  /* ------------------------------------------------------------------
     PIECES
     ------------------------------------------------------------------ */
  function statusChip(p) {
    var s = p.portfolioStatus;
    var copy = (window.STATUS_COPY || {})[s];
    if (!copy) return "";
    return '<span class="status status--' + s + '" title="' + esc(copy.desc) + '">' +
             esc(copy.label) + "</span>";
  }

  function primaryHref(p) {
    if (p.caseStudy) return U(p.caseStudy);
    if (p.links && p.links.live) return U(p.links.live);
    if (p.links && p.links.source) return U(p.links.source);
    return null;
  }

  /* The plate. Each treatment fills the same frame a different way. */
  function plate(p, index) {
    var cat = category(p.category);
    var t = p.treatment || "none";
    if (t === "none") return "";

    var capLeft = esc(p.plateCap || p.basis || (cat && cat.name) || "");
    var capRight = esc(p.year || "");
    var cap = '<span class="plate-cap"><span>' + capLeft + "</span><span>" + capRight + "</span></span>";

    if (p.image) {
      var fit = p.imageFit === "contain" ? ' style="object-fit:contain;padding:8%"' : "";
      return '<div class="plate-area plate-area--' + t + '">' +
               '<img src="' + esc(U(p.image)) + '" alt="' + esc(p.imageAlt || "") + '" loading="lazy" decoding="async"' + fit + ">" +
               cap +
             "</div>";
    }
    if (t === "scope")   return '<div class="plate-area plate-area--scope">' + scopeArt(p, index) + cap + "</div>";
    if (t === "diagram") return '<div class="plate-area plate-area--diagram">' + diagramArt(p) + cap + "</div>";
    if (t === "viz")     return '<div class="plate-area plate-area--diagram">' + vizArt(p, index) + cap + "</div>";
    if (t === "ui")      return '<div class="plate-area plate-area--ui">' + uiArt(p) + cap + "</div>";
    return "";
  }

  /* Generated plates. Deterministic from the project id, so a given
     project always draws the same figure — it reads as a diagram of
     that thing rather than as decoration that reshuffles on reload. */
  function seed(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) { h = (h * 31 + id.charCodeAt(i)) >>> 0; }
    return function () { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 8) / 16777216; };
  }

  /* Three scope figures rather than one. A grid of near-identical wave
     traces would make nine distinct instruments look like nine copies
     of the same thing — the opposite of what the section is for.
     Which figure a project gets is fixed by its id, so it never
     reshuffles between visits. */
  var SCOPE_MODES = ["trace", "colony", "phase"];

  function scopeGrid() {
    return '<g stroke="var(--rf-scope-line)" stroke-width=".5">' +
      '<path d="M0 27.5H200M0 55H200M0 82.5H200"/>' +
      '<path d="M50 0V110M100 0V110M150 0V110"/></g>';
  }
  function scopeSvg(label, inner) {
    return '<svg viewBox="0 0 200 110" role="img" aria-label="' + esc(label) + '"' +
      ' preserveAspectRatio="none" style="width:100%;height:100%">' + scopeGrid() + inner + "</svg>";
  }

  function scopeArt(p, index) {
    var r = seed(p.id);
    var mode = typeof index === "number"
      ? SCOPE_MODES[index % SCOPE_MODES.length]
      : SCOPE_MODES[Math.floor(r() * SCOPE_MODES.length)];
    var i, x, y;

    if (mode === "colony") {
      /* A population rising and falling under a filled envelope. */
      var top = [], bot = [], n = 40;
      for (i = 0; i < n; i++) {
        x = (i / (n - 1)) * 200;
        var t = i / (n - 1);
        var env = Math.sin(Math.PI * Math.pow(t, 0.72)) * 62;
        top.push(x.toFixed(1) + "," + (96 - env - r() * 5).toFixed(1));
        bot.push(x.toFixed(1) + "," + (96 - env * 0.42 - r() * 3).toFixed(1));
      }
      var swarm = "";
      for (i = 0; i < 26; i++) {
        swarm += '<circle cx="' + (r() * 200).toFixed(1) + '" cy="' + (24 + r() * 68).toFixed(1) +
                 '" r="' + (0.7 + r() * 1.4).toFixed(1) + '" fill="var(--rf-amber)" opacity="' +
                 (0.18 + r() * 0.45).toFixed(2) + '"/>';
      }
      return scopeSvg("Abstract population curve",
        '<polygon points="0,96 ' + top.join(" ") + ' 200,96" fill="var(--rf-orange)" opacity=".16"/>' +
        swarm +
        '<polyline points="' + top.join(" ") + '" fill="none" stroke="var(--rf-orange)" stroke-width="1.5"/>' +
        '<polyline points="' + bot.join(" ") + '" fill="none" stroke="var(--rf-teal)" stroke-width="1.1" opacity=".8"/>');
    }

    if (mode === "phase") {
      /* A scatter with the relationship a fitted line would claim. */
      var pts = "", m = -0.29, c = 82;
      for (i = 0; i < 34; i++) {
        x = 12 + r() * 176;
        y = m * x + c + (r() - 0.5) * 26;
        pts += '<circle cx="' + x.toFixed(1) + '" cy="' + Math.max(8, Math.min(100, y)).toFixed(1) +
               '" r="1.9" fill="var(--rf-amber)" opacity="' + (0.35 + r() * 0.5).toFixed(2) + '"/>';
      }
      return scopeSvg("Abstract measurement scatter",
        pts + '<path d="M8 ' + (m * 8 + c).toFixed(1) + ' L192 ' + (m * 192 + c).toFixed(1) +
        '" stroke="var(--rf-orange)" stroke-width="1.4" stroke-dasharray="5 3"/>');
    }

    /* Default: a noisy instrument trace. */
    var line = [], N = 46;
    for (i = 0; i < N; i++) {
      x = 4 + (i / (N - 1)) * 192;
      y = 55 + Math.sin(i * 0.38 + r() * 0.5) * (9 + r() * 18) + (r() - 0.5) * 8;
      line.push(x.toFixed(1) + "," + y.toFixed(1));
    }
    var dots = "";
    for (i = 0; i < 14; i++) {
      dots += '<circle cx="' + (r() * 200).toFixed(1) + '" cy="' + (10 + r() * 88).toFixed(1) +
              '" r="' + (0.7 + r() * 1.5).toFixed(1) + '" fill="var(--rf-amber)" opacity="' +
              (0.16 + r() * 0.44).toFixed(2) + '"/>';
    }
    return scopeSvg("Abstract instrument trace",
      dots + '<polyline points="' + line.join(" ") + '" fill="none" stroke="var(--rf-orange)" stroke-width="1.4"/>');
  }

  /* Pipeline diagram. Linear for a two- or three-stage system; tiered
     when the project describes stages that feed downward. */
  function diagramArt(p) {
    var r = seed(p.id);
    var n = p.diagramStages || 3;
    var tiered = p.diagramTiered === true;
    var out = "", i, bx, by, hgt = tiered ? 22 : 30;
    /* Fit to the 200-unit viewBox whatever the stage count, so a
       four-stage pipeline does not run off the plate. */
    var gapX = tiered ? 18 : 16;
    var w = tiered ? 108 : Math.min(48, (176 - gapX * (n - 1)) / n);
    var x0 = tiered ? 22 : (200 - (w * n + gapX * (n - 1))) / 2;

    for (i = 0; i < n; i++) {
      if (tiered) { bx = x0 + i * gapX; by = 12 + i * 30; }
      else        { bx = x0 + i * (w + gapX); by = 34 + (r() - 0.5) * 12; }

      out += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + w + '" height="' + hgt +
             '" rx="2" fill="var(--rf-panel)" stroke="var(--rf-ink)" stroke-width="1.1"/>' +
             '<rect x="' + (bx + 6).toFixed(1) + '" y="' + (by + 6).toFixed(1) + '" width="' + (10 + r() * (tiered ? 46 : (w - 20))).toFixed(0) +
             '" height="2.4" fill="var(--w-accent)" opacity=".85"/>' +
             '<rect x="' + (bx + 6).toFixed(1) + '" y="' + (by + 12.5).toFixed(1) + '" width="' + (8 + r() * (tiered ? 62 : (w - 18))).toFixed(0) +
             '" height="1.8" fill="var(--rf-line)"/>';
      if (!tiered) {
        out += '<rect x="' + (bx + 6).toFixed(1) + '" y="' + (by + 18).toFixed(1) + '" width="' + (6 + r() * (w - 22)).toFixed(0) +
               '" height="1.8" fill="var(--rf-line)"/>';
      }
      if (i < n - 1) {
        out += tiered
          ? '<path d="M' + (bx + 10).toFixed(1) + ' ' + (by + hgt) + 'v8" stroke="var(--w-accent)" stroke-width="1.2" marker-end="url(#ar-' + esc(p.id) + ')"/>'
          : '<path d="M' + (bx + w).toFixed(1) + ' ' + (by + hgt / 2).toFixed(1) + 'h' + (gapX - 2) + '" stroke="var(--w-accent)" stroke-width="1.2" marker-end="url(#ar-' + esc(p.id) + ')"/>';
      }
    }
    return '<svg viewBox="0 0 200 110" role="img" aria-label="Abstract system diagram">' +
      "<defs><marker id='ar-" + esc(p.id) + "' viewBox='0 0 8 8' refX='6' refY='4' markerWidth='5' markerHeight='5' orient='auto'>" +
      "<path d='M0 1 L6 4 L0 7 z' fill='var(--w-accent)'/></marker></defs>" + out + "</svg>";
  }

  /* Three result figures — a distribution, a confusion matrix and a
     training curve — so three model cards side by side do not read as
     the same chart three times. */
  var VIZ_MODES = ["bars", "matrix", "curve"];

  function vizArt(p, index) {
    var r = seed(p.id), i, j;
    var mode = p.vizMode || (typeof index === "number"
      ? VIZ_MODES[index % VIZ_MODES.length]
      : VIZ_MODES[Math.floor(r() * VIZ_MODES.length)]);
    var axes = '<path d="M12 92H190" stroke="var(--rf-ink)" stroke-width="1"/>' +
               '<path d="M12 14V92" stroke="var(--rf-ink)" stroke-width="1"/>';
    var open = '<svg viewBox="0 0 200 110" role="img" aria-label="';

    if (mode === "matrix") {
      /* A four-by-four confusion matrix: a strong diagonal, and the
         off-diagonal cells that are the actual finding. */
      var cells = "", n = 4, sz = 17, x0 = 62, y0 = 18;
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
        var v = i === j ? 0.62 + r() * 0.34 : r() * 0.26;
        cells += '<rect x="' + (x0 + j * sz) + '" y="' + (y0 + i * sz) + '" width="' + (sz - 1) +
                 '" height="' + (sz - 1) + '" fill="var(--w-accent)" opacity="' + v.toFixed(2) + '"/>';
      }
      var ticks = "";
      for (i = 0; i < n; i++) {
        ticks += '<rect x="' + (x0 - 16) + '" y="' + (y0 + i * sz + 6) + '" width="12" height="2" fill="var(--rf-line)"/>' +
                 '<rect x="' + (x0 + i * sz + 3) + '" y="' + (y0 + n * sz + 5) + '" width="10" height="2" fill="var(--rf-line)"/>';
      }
      return open + 'Abstract confusion matrix">' + cells + ticks + "</svg>";
    }

    if (mode === "curve") {
      /* Training and validation loss, diverging slightly — the shape
         an overfitting discussion is about. */
      var tr = [], va = [], N = 30;
      for (i = 0; i < N; i++) {
        var t = i / (N - 1);
        var x = 12 + t * 178;
        tr.push(x.toFixed(1) + "," + (22 + 64 * Math.exp(-3.1 * t) + r() * 2).toFixed(1));
        va.push(x.toFixed(1) + "," + (26 + 58 * Math.exp(-2.4 * t) + t * 9 + r() * 3).toFixed(1));
      }
      return open + 'Abstract training and validation curves">' + axes +
        '<path d="M12 40H190M12 66H190" stroke="var(--rf-line)" stroke-width=".5" stroke-dasharray="2 3"/>' +
        '<polyline points="' + tr.join(" ") + '" fill="none" stroke="var(--w-accent)" stroke-width="1.6"/>' +
        '<polyline points="' + va.join(" ") + '" fill="none" stroke="var(--rf-oxide)" stroke-width="1.3" stroke-dasharray="4 2.5"/>' +
        "</svg>";
    }

    var bars = "", h;
    for (i = 0; i < 14; i++) {
      h = 12 + r() * 66;
      bars += '<rect x="' + (14 + i * 13).toFixed(1) + '" y="' + (92 - h).toFixed(1) +
              '" width="8" height="' + h.toFixed(1) + '" fill="var(--w-accent)" opacity="' +
              (0.32 + (i / 14) * 0.62).toFixed(2) + '"/>';
    }
    return open + 'Abstract class distribution">' + axes +
      '<path d="M12 40H190M12 66H190" stroke="var(--rf-line)" stroke-width=".5" stroke-dasharray="2 3"/>' +
      bars + "</svg>";
  }

  function uiArt(p) {
    return '<div class="ui-shot" style="width:100%;background:var(--rf-panel);display:flex;flex-direction:column">' +
      '<div style="display:flex;gap:4px;padding:7px 9px;border-bottom:1px solid var(--rf-line)">' +
        '<span style="width:6px;height:6px;border-radius:50%;background:var(--rf-line)"></span>' +
        '<span style="width:6px;height:6px;border-radius:50%;background:var(--rf-line)"></span>' +
        '<span style="width:6px;height:6px;border-radius:50%;background:var(--rf-line)"></span>' +
      "</div>" +
      '<div style="flex:1;display:grid;place-items:center;padding:14px">' +
        '<span style="font-family:var(--rf-mono);font-size:26px;letter-spacing:.1em;color:var(--w-accent)">' +
          esc(p.uiGlyph || "00:00.00") + "</span>" +
      "</div></div>";
  }

  /* ------------------------------------------------------------------
     THE CARD
     ------------------------------------------------------------------ */
  function card(p, opts) {
    opts = opts || {};
    var cat = category(p.category);
    var href = primaryHref(p);
    var title = href
      ? '<a href="' + esc(href) + '">' + esc(p.title) + "</a>"
      : esc(p.title);

    var stampBits = [];
    if (p.role && opts.showRole !== false) stampBits.push(esc((p.tech || []).slice(0, 3).join(" · ")));
    else if (p.tech) stampBits.push(esc(p.tech.slice(0, 3).join(" · ")));
    if (p.evidence) stampBits.push(esc(p.evidence));
    if (!p.evidence && p.treatment === "scope") stampBits.push("Status pending");

    var chips = (p.chips || []).length
      ? '<ul class="chips">' + p.chips.map(function (c) {
          return '<li><span class="chip">' + esc(c) + "</span></li>";
        }).join("") + "</ul>"
      : "";

    return '<article class="card' + (p.treatment === "none" ? " card--flat" : "") + '">' +
      plate(p, opts.index) +
      '<div class="card__body">' +
        '<div class="card__top">' +
          '<p class="card__cat">' + esc(opts.categoryLabel || (cat && cat.name) || "") + "</p>" +
          statusChip(p) +
        "</div>" +
        '<h3 class="card__title">' + title + "</h3>" +
        '<p class="card__blurb">' + esc(p.summary) + "</p>" +
        headlineMetric(p) +
        chips +
        (stampBits.length ? '<p class="card__stamp">' + stampBits.map(function (b) {
          return "<span>" + b + "</span>";
        }).join("") + "</p>" : "") +
      "</div>" +
    "</article>";
  }

  /* One measured figure, promoted onto the card. Only ever drawn from
     p.metrics — a project with no verified numbers shows none. */
  function headlineMetric(p) {
    if (!p.metrics || !p.metrics.length) return "";
    var m = p.metrics[0];
    return '<p class="card__metric"><span class="card__metric-v">' + esc(m.v) +
           '</span><span class="card__metric-k">' + esc(m.k) + "</span></p>";
  }

  function renderInto(selector, list, opts) {
    var el = document.querySelector(selector);
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<p class="dim">Nothing published in this section yet.</p>';
      return;
    }
    el.innerHTML = list.map(function (p, i) {
      var o = {}; for (var k in opts) { if (opts.hasOwnProperty(k)) o[k] = opts[k]; }
      o.index = i;
      return card(p, o);
    }).join("");
  }

  /* ------------------------------------------------------------------
     THE DOORS
     ------------------------------------------------------------------ */
  function doors(selector) {
    var el = document.querySelector(selector);
    if (!el) return;
    var shown = CATS.filter(function (c) { return c.nav !== false; });
    var total = 0;
    var html = shown.map(function (c, i) {
      var n = countIn(c.id);
      total += n;
      return '<a class="door" href="' + U("/" + c.id + "/") + '" style="--door-accent: var(' + c.accent + ')">' +
        '<span class="door__n">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<span class="door__name">' + esc(c.name) + "</span>" +
        '<span class="door__desc">' + esc(c.tagline) + "</span>" +
        '<span class="door__count">' + n + (n === 1 ? " project" : " projects") + "</span>" +
      "</a>";
    }).join("");

    /* The eighth cell, so the grid resolves cleanly at four columns and
       the seven wings are given a total. */
    html += '<div class="door--note">' +
      '<p>Every project shown here is listed in a curated registry. A repository ' +
      'being public is not the same as it belonging on a portfolio.</p>' +
      '<span class="door__count">' + total + " projects · " + shown.length + " disciplines</span>" +
    "</div>";

    el.innerHTML = html;
  }

  window.CC = {
    esc: esc, visible: visible, byCategory: byCategory, byId: byId,
    featured: featured, countIn: countIn, category: category, curated: curated,
    card: card, renderInto: renderInto, doors: doors, statusChip: statusChip
  };
})();
