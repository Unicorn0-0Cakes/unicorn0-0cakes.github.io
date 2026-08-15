"use strict";
/* =====================================================================
   EVOLUTION IN A FLASK — lineage.js

   Two ways of looking at the same thing.

   The Muller plot answers "who was in the flask, and how much of it?".
   Bands are nested by descent, so a clade physically contains its own
   descendants and you can watch a sub-lineage eat its parent from the
   inside. Only clades that ever exceeded two per cent appear, because
   below that a laboratory would not have seen them either.

   The tree answers "who came from whom?". Horizontal position is the
   generation a lineage was born, thickness is the highest frequency it
   ever reached, and a lineage that died stops where it died.
   ===================================================================== */

var Lineage = (function () {

  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  /* ---------------------------------------------------------------
     Build a nested clade tree from a population's detectable history.
     Ancestors that never became detectable are collapsed away, so the
     tree shows the lineages an experimenter could actually have named.
     --------------------------------------------------------------- */
  function buildTree(P) {
    var seen = {}, i, id;
    for (i = 0; i < P.samples.length; i++) {
      for (id in P.samples[i].f) seen[id] = true;
    }
    for (i = 0; i < P.genotypes.length; i++) {
      var g = P.genotypes[i];
      if (Sim.totalN(g) / Math.max(1, P.N) >= 0.02) seen[g.id] = true;
    }
    seen[P.ancestorId] = true;

    var nodes = {};
    for (id in seen) {
      var gg = P.lineageIndex[id];
      if (!gg) continue;
      nodes[id] = { id: +id, g: gg, kids: [], parent: null, clade: [], own: [] };
    }
    for (id in nodes) {
      var node = nodes[id];
      var p = node.g.parent;
      while (p != null && !nodes[p]) p = P.lineageIndex[p] ? P.lineageIndex[p].parent : null;
      if (p != null && nodes[p] && +p !== +id) { node.parent = nodes[p]; nodes[p].kids.push(node); }
    }
    var root = nodes[P.ancestorId];
    if (!root) { for (id in nodes) { root = nodes[id]; break; } }
    /* stable ordering: oldest first, so bands do not jump about */
    (function order(n) {
      n.kids.sort(function (a, b) { return a.g.born - b.g.born || a.id - b.id; });
      for (var k = 0; k < n.kids.length; k++) order(n.kids[k]);
    })(root);
    return { root: root, nodes: nodes };
  }

  /* Clade frequency at every sample point: a node plus everything
     descended from it. */
  function cladeSeries(P, tree) {
    var S = P.samples, i;
    var list = [];
    (function walk(n) { list.push(n); for (var k = 0; k < n.kids.length; k++) walk(n.kids[k]); })(tree.root);

    for (i = 0; i < list.length; i++) { list[i].own = new Float64Array(S.length); list[i].clade = new Float64Array(S.length); }
    for (i = 0; i < S.length; i++) {
      for (var j = 0; j < list.length; j++) {
        var f = S[i].f[list[j].id];
        list[j].own[i] = f || 0;
      }
    }
    /* bottom-up accumulation */
    (function acc(n) {
      for (var k = 0; k < n.kids.length; k++) acc(n.kids[k]);
      for (var x = 0; x < S.length; x++) {
        var t = n.own[x];
        for (var k2 = 0; k2 < n.kids.length; k2++) t += n.kids[k2].clade[x];
        n.clade[x] = t;
      }
    })(tree.root);
    return list;
  }

  /* ---------------------------------------------------------------
     Muller plot
     --------------------------------------------------------------- */
  function muller(cv, P, opts) {
    opts = opts || {};
    var c = Chart.prep(cv, opts.height || 260), g = c.g;
    var padL = 8, padR = 8, padT = 8, padB = 24;
    var Wd = c.w - padL - padR, Hd = c.h - padT - padB;
    if (Wd < 10 || Hd < 10 || !P.samples.length) return null;

    var tree = buildTree(P);
    var list = cladeSeries(P, tree);
    var S = P.samples;
    var g0 = S[0].gen, g1 = Math.max(S[S.length - 1].gen, g0 + 1);
    var lx = function (i) { return padL + (S[i].gen - g0) / (g1 - g0) * Wd; };

    /* allocate a starting offset for every node at every sample */
    var offsets = {};
    for (var i = 0; i < list.length; i++) offsets[list[i].id] = new Float64Array(S.length);
    (function place(n, base) {
      for (var x = 0; x < S.length; x++) offsets[n.id][x] = base[x];
      var run = new Float64Array(S.length);
      for (var x2 = 0; x2 < S.length; x2++) run[x2] = base[x2] + n.own[x2] * 0.5;
      for (var k = 0; k < n.kids.length; k++) {
        place(n.kids[k], run.slice());
        for (var x3 = 0; x3 < S.length; x3++) run[x3] += n.kids[k].clade[x3];
      }
    })(tree.root, new Float64Array(S.length));

    /* background */
    g.fillStyle = css("--panel2");
    g.fillRect(padL, padT, Wd, Hd);

    var ly = function (f) { return padT + Hd - f * Hd; };
    var bands = [];

    for (var q = 0; q < list.length; q++) {
      var n = list[q];
      var col = n.g.colour && n.g.colour !== "#8a9099"
        ? n.g.colour
        : (n.id === tree.root.id ? css("--muted") : LINEAGE_COLOURS[q % LINEAGE_COLOURS.length]);
      var any = false;
      g.beginPath();
      for (var x = 0; x < S.length; x++) {
        var top = offsets[n.id][x] + n.clade[x];
        if (n.clade[x] > 0.0005) any = true;
        x ? g.lineTo(lx(x), ly(top)) : g.moveTo(lx(x), ly(top));
      }
      for (var x4 = S.length - 1; x4 >= 0; x4--) g.lineTo(lx(x4), ly(offsets[n.id][x4]));
      g.closePath();
      if (!any) continue;
      g.fillStyle = col; g.fill();
      g.strokeStyle = css("--panel"); g.lineWidth = 0.6; g.stroke();
      bands.push({ node: n, colour: col });

      /* label the wide ones */
      var lastF = n.clade[S.length - 1];
      if (lastF > 0.11 && n.g.name && n.g.name !== "ancestor") {
        g.fillStyle = css("--panel");
        g.font = "600 10px " + css("--font");
        g.textAlign = "right"; g.textBaseline = "middle";
        var yy = ly(offsets[n.id][S.length - 1] + lastF / 2);
        g.fillText(n.g.name, padL + Wd - 4, yy);
      }
    }

    /* citrate and mutator events marked on the time axis */
    g.font = "9px " + css("--font"); g.textAlign = "center"; g.textBaseline = "top";
    g.fillStyle = css("--muted");
    for (var t = 0; t <= 4; t++) {
      var gv = g0 + (g1 - g0) * t / 4;
      g.fillText(Chart.fmt(gv), padL + Wd * t / 4, padT + Hd + 5);
    }
    g.textAlign = "left";
    g.fillText("generations", padL, padT + Hd + 5);

    return { tree: tree, list: list, offsets: offsets, S: S, lx: lx, ly: ly,
             box: { x: padL, y: padT, w: Wd, h: Hd } };
  }

  /* Which band is under the pointer. */
  function mullerHit(state, mx, my) {
    if (!state) return null;
    var b = state.box;
    if (mx < b.x || mx > b.x + b.w || my < b.y || my > b.y + b.h) return null;
    var S = state.S;
    var idx = Math.round((mx - b.x) / b.w * (S.length - 1));
    idx = Math.max(0, Math.min(S.length - 1, idx));
    var f = (b.y + b.h - my) / b.h;
    var best = null;
    for (var i = 0; i < state.list.length; i++) {
      var n = state.list[i];
      var lo = state.offsets[n.id][idx], hi = lo + n.clade[idx];
      if (f >= lo && f <= hi) best = n;         // deepest match wins
    }
    return best ? { node: best, gen: S[idx].gen, freq: best.clade[idx], own: best.own[idx] } : null;
  }

  /* ---------------------------------------------------------------
     Tree
     --------------------------------------------------------------- */
  function tree(cv, P, opts) {
    opts = opts || {};
    var c = Chart.prep(cv, opts.height || 300), g = c.g;
    var padL = 10, padR = 84, padT = 12, padB = 24;
    var Wd = c.w - padL - padR, Hd = c.h - padT - padB;
    if (Wd < 20 || Hd < 20) return null;

    var t = buildTree(P);
    var leaves = [];
    (function count(n) {
      if (!n.kids.length) { leaves.push(n); n.slot = leaves.length - 1; return; }
      for (var k = 0; k < n.kids.length; k++) count(n.kids[k]);
      n.slot = (n.kids[0].slot + n.kids[n.kids.length - 1].slot) / 2;
    })(t.root);

    var maxGen = Math.max(1, P.gen);
    var nSlots = Math.max(1, leaves.length - 1);
    var lx = function (gen) { return padL + gen / maxGen * Wd; };
    var ly = function (slot) { return padT + (nSlots ? slot / nSlots : 0.5) * Hd; };

    var hits = [];
    g.lineCap = "round";

    (function draw(n) {
      var x0 = lx(n.g.born);
      var end = n.g.extinct != null ? n.g.extinct : P.gen;
      var x1 = lx(Math.max(end, n.g.born));
      var y = ly(n.slot);
      var alive = n.g.extinct == null;
      var col = n.g.colour && n.g.colour !== "#8a9099" ? n.g.colour : css("--muted");
      var f = Sim.totalN(n.g) / Math.max(1, P.N);
      var wgt = 0.8 + Math.sqrt(Math.max(n.g.peak, f)) * 4.5;

      g.globalAlpha = alive ? 1 : 0.42;
      g.strokeStyle = col; g.lineWidth = wgt;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();

      for (var k = 0; k < n.kids.length; k++) {
        var kid = n.kids[k];
        var ky = ly(kid.slot), kx = lx(kid.g.born);
        g.strokeStyle = col; g.lineWidth = Math.max(0.7, wgt * 0.35);
        g.globalAlpha = alive ? 0.65 : 0.3;
        g.beginPath(); g.moveTo(kx, y); g.lineTo(kx, ky); g.stroke();
      }
      g.globalAlpha = 1;

      /* markers for the two things worth interrupting the eye for */
      if (n.g.cit) {
        g.fillStyle = css("--accent-2");
        g.beginPath(); g.arc(x0, y, 4, 0, 6.284); g.fill();
      } else if (n.g.mutator) {
        g.fillStyle = css("--danger");
        g.beginPath(); g.rect(x0 - 3, y - 3, 6, 6); g.fill();
      }

      if (n.g.name && n.g.name !== "ancestor" && Math.max(n.g.peak, f) > 0.06) {
        g.fillStyle = alive ? css("--ink-dim") : css("--muted");
        g.font = "9.5px " + css("--mono");
        g.textAlign = "left"; g.textBaseline = "middle";
        g.fillText(n.g.name, x1 + 5, y);
      }
      hits.push({ node: n, x0: x0, x1: x1, y: y, w: wgt });
      for (var k2 = 0; k2 < n.kids.length; k2++) draw(n.kids[k2]);
    })(t.root);

    g.fillStyle = css("--muted"); g.font = "9px " + css("--font");
    g.textAlign = "center"; g.textBaseline = "top";
    for (var i = 0; i <= 4; i++) g.fillText(Chart.fmt(maxGen * i / 4), lx(maxGen * i / 4), padT + Hd + 6);
    g.textAlign = "left"; g.fillText("generations", padL, padT + Hd + 6);

    return { hits: hits };
  }

  function treeHit(state, mx, my) {
    if (!state) return null;
    for (var i = state.hits.length - 1; i >= 0; i--) {
      var h = state.hits[i];
      if (mx >= h.x0 - 3 && mx <= h.x1 + 60 && Math.abs(my - h.y) <= Math.max(4, h.w / 2 + 2)) return h.node;
    }
    return null;
  }

  /* ---------------------------------------------------------------
     The flask itself: a small, honest picture of turbidity, cell size
     and whatever else is going on in there.
     --------------------------------------------------------------- */
  function flaskIcon(P, w, h, phase) {
    var N = Math.max(1, P.N);
    var turb = Math.min(1, Math.log10(N / 5e6) / Math.log10(500));
    var mix = Sim.frequencies(P).slice(0, 5);
    var stops = "";
    var acc = 0;
    for (var i = 0; i < mix.length; i++) {
      var col = mix[i].g.colour && mix[i].g.colour !== "#8a9099" ? mix[i].g.colour : "#9aa3ad";
      stops += '<stop offset="' + (acc * 100).toFixed(1) + '%" stop-color="' + col + '"/>';
      acc += mix[i].f;
      stops += '<stop offset="' + (Math.min(1, acc) * 100).toFixed(1) + '%" stop-color="' + col + '"/>';
    }
    var uid = "fl" + P.index + "_" + (phase || 0);
    var lvl = 30 + (1 - 0.0) * 0;
    return '<svg viewBox="0 0 60 74" class="flaskicon">' +
      '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="1" y2="0">' + stops + '</linearGradient>' +
      '<clipPath id="c' + uid + '"><path d="M22 6 L22 26 L7 62 Q5 68 12 68 L48 68 Q55 68 53 62 L38 26 L38 6 Z"/></clipPath></defs>' +
      '<path d="M22 6 L22 26 L7 62 Q5 68 12 68 L48 68 Q55 68 53 62 L38 26 L38 6 Z" ' +
        'fill="none" stroke="currentColor" stroke-width="1.6" opacity=".55"/>' +
      '<g clip-path="url(#c' + uid + ')">' +
        '<rect x="0" y="' + (74 - 34) + '" width="60" height="34" fill="url(#' + uid + ')" opacity="' + (0.18 + 0.72 * turb).toFixed(2) + '"/>' +
      '</g>' +
      '<line x1="20" y1="6" x2="40" y2="6" stroke="currentColor" stroke-width="2.2" opacity=".55"/>' +
      '</svg>';
  }

  return { muller: muller, mullerHit: mullerHit, tree: tree, treeHit: treeHit,
           buildTree: buildTree, flaskIcon: flaskIcon };
})();
