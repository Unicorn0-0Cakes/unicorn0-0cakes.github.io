"use strict";
/* =====================================================================
   EVOLUTION IN A FLASK — screens.js

   Everything the player looks at. Each screen tries to answer the same
   four questions in the same order: what is this, what can I see, what
   have I actually measured, and what could I do next.

   The distinction between the third and the second is the point of the
   whole interface. Anything the model knows but the player has not paid
   to find out is shown as a dash.
   ===================================================================== */

var UI = (function () {

  var W = null;
  var sel = 0;                 // selected population
  var selGeno = null;          // selected lineage within it
  var mullerState = null, treeState = null;

  function setWorld(w) { W = w; sel = 0; selGeno = null; }
  function selectPop(i) { sel = clamp(i, 0, W.pops.length - 1); selGeno = null; }
  function selectedPop() { return W.pops[sel]; }

  /* ---------------- formatting ---------------- */
  function n0(v) { return Math.round(v).toLocaleString(); }
  function n1(v) { return (Math.round(v * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1 }); }
  function n2(v) { return (Math.round(v * 100) / 100).toFixed(2); }
  function n3(v) { return v.toFixed(3); }
  function pct(v, d) { return (v * 100).toFixed(d == null ? 0 : d) + "%"; }
  function sci(v) {
    if (v <= 0) return "0";
    var e = Math.floor(Math.log10(v));
    return (v / Math.pow(10, e)).toFixed(1) + "&times;10<sup>" + e + "</sup>";
  }
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; });
  }
  function prov(kind) {
    var p = PROVENANCE[kind];
    return '<span class="prov ' + p.tone + '" title="' + p.note + '">' + p.label + '</span>';
  }
  function sw(c) { return '<span class="swatch" style="background:' + c + '"></span>'; }

  /* The most recent assay a population has, or nothing. This is the only
     fitness figure the player is ever shown on the bench. */
  function lastAssay(P) { return P.assays.length ? P.assays[P.assays.length - 1] : null; }

  /* ============================================================
     TOP BAR
     ============================================================ */
  function benchBar() {
    var assayed = W.pops.filter(function (P) { return P.assays.length; });
    var ws = assayed.map(function (P) { return lastAssay(P).W; });
    var meanW = ws.length ? ws.reduce(function (a, b) { return a + b; }, 0) / ws.length : null;
    var alive = W.pops.filter(function (P) { return P.extinctAt == null; }).length;
    var totalN = W.pops.reduce(function (a, P) { return a + P.N; }, 0);
    var known = { mut: 0, cit: 0 };
    for (var i = 0; i < W.pops.length; i++) {
      var P = W.pops[i];
      for (var j = 0; j < P.genotypes.length; j++) {
        var g = P.genotypes[j];
        if (g.muts.some(function (m) { return m.known && m.kind === "mutator"; })) { known.mut++; break; }
      }
      if (P.sequenced.length && P.genotypes.some(function (x) { return x.cit && x.muts.some(function (m) { return m.known; }); })) known.cit++;
    }

    var stats = [
      { k: "Flasks", v: alive + "/" + W.pops.length, cls: alive < W.pops.length ? "warn" : "" },
      { k: "Mean fitness", v: meanW ? n3(meanW) : "—",
        t: meanW ? "of " + assayed.length + " assayed" : "not measured", cls: "" },
      { k: "Cells on the bench", v: sci(totalN), cls: "" },
      { k: "Bench hours", v: n1(W.lab.hours), t: "of " + LAB.CAP,
        cls: W.lab.hours < 4 ? "warn" : "good" },
      { k: "Hypermutable", v: known.mut ? known.mut + " found" : "—",
        t: known.mut ? "" : "sequence to find out", cls: "" },
      { k: "Archive", v: n0(W.pops.reduce(function (a, P) { return a + P.snapshots.length; }, 0)),
        t: "samples", cls: "" }
    ];
    document.getElementById("bbStats").innerHTML = stats.map(function (s) {
      return '<div class="stat ' + (s.cls || "") + '" title="' + (s.t || "") + '"><span class="k">' + s.k + '</span>' +
             '<span class="v">' + s.v + '</span>' + (s.t ? '<span class="t">' + s.t + '</span>' : '') + '</div>';
    }).join("");

    var years = (W.day / 365);
    document.getElementById("bbClock").innerHTML =
      "GEN <b>" + n0(W.gen) + "</b> &middot; day " + n0(W.day) +
      " &middot; " + (years < 1 ? Math.round(W.day / 30.4) + " months" : n1(years) + " years");

    var unseen = W.events.filter(function (e) { return !e.seen && (e.kind === "note" || e.kind === "observation"); }).length;
    setBadge("notebook", unseen, "q");
  }

  function setBadge(screen, n, cls) {
    var el = document.querySelector('.navitem[data-screen="' + screen + '"]');
    if (!el) return;
    var b = el.querySelector(".badge");
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("span"); b.className = "badge " + (cls || ""); el.appendChild(b); }
    b.textContent = n > 99 ? "99+" : n;
  }

  /* ============================================================
     BENCH
     ============================================================ */
  function bench() {
    var h = '<div class="screenhead"><h2>The bench</h2><p>' +
      'Twelve flasks in one incubator. Cloudiness is free to look at; everything else is not. ' +
      'A dash means you have not measured it.</p></div>';

    h += '<div class="bench" id="benchGrid">';
    for (var i = 0; i < W.pops.length; i++) {
      var P = W.pops[i];
      var a = lastAssay(P);
      var flags = "";
      var seqKnown = P.sequenced.length > 0;
      if (seqKnown && P.genotypes.some(function (g) { return g.mutator && g.muts.some(function (m) { return m.known; }); }))
        flags += '<span class="flag mut" title="Mismatch repair lost">mut</span>';
      if (seqKnown && P.genotypes.some(function (g) { return g.cit && g.muts.some(function (m) { return m.known; }); }))
        flags += '<span class="flag cit" title="Aerobic citrate use">cit+</span>';
      if (P.plateSeen && P.plateSeen.types > 1)
        flags += '<span class="flag div" title="More than one colony type on the plate">' + P.plateSeen.types + ' types</span>';
      if (P.phage > 1e6) flags += '<span class="flag phg">phage</span>';

      var dens = P.N / FLASK.VOLUME;
      h += '<div class="flaskcard' + (i === sel ? " sel" : "") + (P.extinctAt != null ? " dead" : "") +
             '" data-pop="' + i + '">' +
        '<div class="nm">' + P.name + '</div>' +
        Lineage.flaskIcon(P, 52, 64) +
        '<div class="fit' + (a ? "" : " unknown") + '">' + (a ? n2(a.W) + "&times;" : "—") + '</div>' +
        '<div class="sub2">' + (a ? "assayed gen " + n0(a.gen) : "no fitness assay") + '</div>' +
        '<div class="sub2 mono">' + sci(dens) + '/mL</div>' +
        '<div class="flagrow">' + flags + '</div>' +
      '</div>';
    }
    h += '</div>';

    /* observation: density, which is free */
    h += '<div class="cols two" style="margin-top:14px">';
    h += '<div class="card"><h3>Cell density through time</h3>' +
      '<div class="sub">Free to watch: how cloudy each flask gets by the end of a day. ' +
      'Anything that lets a lineage make more cells out of the same medium shows up here first. ' + prov("emergent") + '</div>' +
      '<canvas id="cvDens"></canvas></div>';
    h += '<div class="card"><h3>Measured fitness</h3>' +
      '<div class="sub">Only competitions you have actually run. The dashed line is the published ' +
      'power-law fit to the real experiment, for comparison. ' + prov("documented") + '</div>' +
      '<canvas id="cvFitAll"></canvas></div>';
    h += '</div>';

    var last = W.events.slice(-6).reverse();
    h += '<div class="card"><h3>Latest from the bench</h3><div class="sub">Things visible without an experiment.</div>';
    h += last.length ? last.map(function (e) {
      return '<div class="logitem"><span class="when">gen ' + n0(e.gen) + '</span><span>' + esc(e.text) + '</span></div>';
    }).join("") : '<div class="empty">Nothing yet.</div>';
    h += '</div>';
    return h;
  }

  function benchPost() {
    var cv = document.getElementById("cvDens");
    if (cv) {
      var series = W.pops.map(function (P, i) {
        return {
          vals: P.history.map(function (r) { return { x: r.gen, y: r.N / FLASK.VOLUME }; }),
          colour: i === sel ? Chart.css("--accent") : Chart.css("--muted"),
          width: i === sel ? 2 : 1,
          alpha: i === sel ? 1 : 0.42
        };
      });
      Chart.line(cv, series, { height: 200, yLabel: "cells / mL at 24 h", xLabel: "generations", legend: false, min: 0 });
    }
    var cv2 = document.getElementById("cvFitAll");
    if (cv2) {
      var pts = [], maxGen = Math.max(100, W.gen);
      for (var i = 0; i < W.pops.length; i++) {
        for (var j = 0; j < W.pops[i].assays.length; j++) {
          var a = W.pops[i].assays[j];
          if (a.ratio !== 0.5) continue;
          pts.push({ x: a.gen, y: a.W, err: a.sem,
                     colour: i === sel ? Chart.css("--accent") : Chart.css("--ink-dim") });
        }
      }
      var pl = [];
      for (var g = 0; g <= maxGen; g += Math.max(1, maxGen / 60)) pl.push({ x: g, y: Sim.powerLaw(g) });
      Chart.line(cv2, [{ vals: pl, colour: Chart.css("--muted"), dash: [5, 4], width: 1.3,
                         label: "published fit to the real experiment" }],
        { height: 200, points: pts, yLabel: "relative fitness", xLabel: "generations",
          min: 0.95, xmin: 0, xmax: maxGen });
    }
    var grid = document.getElementById("benchGrid");
    if (grid) grid.onclick = function (ev) {
      var c = ev.target.closest(".flaskcard");
      if (!c) return;
      selectPop(+c.dataset.pop);
      Game.requestRender();
    };
  }

  /* ============================================================
     POPULATION
     ============================================================ */
  function population() {
    var P = selectedPop();
    var freqs = Sim.frequencies(P).filter(function (x) { return x.f > 0.005; });
    var h = '<div class="screenhead"><h2>' + P.name + '</h2><p>' +
      'One flask, in detail. The band chart is what was in it and in what proportion; bands nest ' +
      'inside their ancestors, so a clade physically contains its own descendants. ' +
      'Only lineages that once passed two per cent appear, because below that nobody would have seen them.</p></div>';

    h += '<div class="card"><h3>Who is in the flask</h3>' +
      '<div class="sub">Frequencies come from the model, not from an assay; in a real laboratory you ' +
      'would be inferring this from plates and sequencing. ' + prov("emergent") + '</div>' +
      '<canvas id="cvMuller"></canvas>' +
      '<div class="tiny muted" id="mullerRead" style="min-height:16px;margin-top:6px"></div></div>';

    h += '<div class="cols two">';
    h += '<div class="card"><h3>The last twenty-four hours</h3>' +
      '<div class="sub">One transfer cycle: cells against the two carbon sources the ancestor can reach, ' +
      'and the one it cannot. ' + prov("estimated") + '</div>' +
      '<canvas id="cvCycle"></canvas>' +
      '<div class="tiny muted" style="margin-top:6px">' +
        sw(Chart.css("--accent")) + 'cells &nbsp; ' +
        sw(Chart.css("--c-glucose")) + 'glucose &nbsp; ' +
        sw(Chart.css("--c-acetate")) + 'acetate &nbsp; ' +
        sw(Chart.css("--c-citrate")) + 'citrate' +
      '</div></div>';

    h += '<div class="card"><h3>Standing lineages</h3><div class="sub">' +
      freqs.length + ' above half a per cent. Click one to inspect it.</div>' +
      '<table class="t"><thead><tr><th>Lineage</th><th class="num">Share</th>' +
      '<th class="num">Born</th><th>Known changes</th></tr></thead><tbody>';
    for (var i = 0; i < Math.min(freqs.length, 16); i++) {
      var g = freqs[i].g;
      var knownMuts = g.muts.filter(function (m) { return m.known; });
      h += '<tr class="clickable" data-geno="' + g.id + '">' +
        '<td>' + sw(g.colour && g.colour !== "#8a9099" ? g.colour : Chart.css("--muted")) +
          (g.name || ("unnamed " + g.id)) + '</td>' +
        '<td class="num">' + pct(freqs[i].f, 1) + '</td>' +
        '<td class="num">' + n0(g.born) + '</td>' +
        '<td class="tiny muted">' + (knownMuts.length
            ? knownMuts.map(function (m) { return esc(m.gene); }).join(", ")
            : "not sequenced") + '</td></tr>';
    }
    h += '</tbody></table></div>';
    h += '</div>';

    /* what is observable without paying */
    var hist = P.history.length ? P.history[P.history.length - 1] : null;
    h += '<div class="card"><h3>Free observations</h3><div class="sub">' +
      'Things you can read off the flask or a cheap plate.</div><div class="cols three">';
    h += '<div><div class="kv"><span class="k">Density at 24 h</span><span class="v">' + sci(P.N / FLASK.VOLUME) + '/mL</span></div>' +
      '<div class="kv"><span class="k">Generations here</span><span class="v">' + n0(P.gen) + '</span></div>' +
      '<div class="kv"><span class="k">Glucose gone by</span><span class="v">' +
        (P.glucoseGoneAt >= 0 ? n1(P.glucoseGoneAt) + " h" : "not exhausted") + '</span></div></div>';
    h += '<div><div class="kv"><span class="k">Archived samples</span><span class="v">' + P.snapshots.length + '</span></div>' +
      '<div class="kv"><span class="k">Assays run</span><span class="v">' + P.assays.length + '</span></div>' +
      '<div class="kv"><span class="k">Clones sequenced</span><span class="v">' +
        P.sequenced.reduce(function (a, r) { return a + r.clones.length; }, 0) + '</span></div></div>';
    h += '<div><div class="kv"><span class="k">Colony types seen</span><span class="v">' +
        (P.plateSeen ? P.plateSeen.types : "—") + '</span></div>' +
      '<div class="kv"><span class="k">Mean cell size</span><span class="v">' +
        (P.plateSeen ? "+" + Math.round((P.plateSeen.size - 1) * 100) + "%" : "—") + '</span></div>' +
      '<div class="kv"><span class="k">Last plated</span><span class="v">' +
        (P.plateSeen ? "gen " + n0(P.plateSeen.gen) : "never") + '</span></div></div>';
    h += '</div></div>';
    return h;
  }

  function populationPost() {
    var P = selectedPop();
    var cv = document.getElementById("cvMuller");
    if (cv) {
      mullerState = Lineage.muller(cv, P, { height: 250 });
      cv.onmousemove = function (ev) {
        var r = cv.getBoundingClientRect();
        var hit = Lineage.mullerHit(mullerState, ev.clientX - r.left, ev.clientY - r.top);
        var out = document.getElementById("mullerRead");
        if (!out) return;
        out.innerHTML = hit
          ? '<b>' + (hit.node.g.name || ("lineage " + hit.node.id)) + '</b> &middot; generation ' +
            n0(hit.gen) + ' &middot; clade ' + pct(hit.freq, 1) +
            ' of the flask, of which this exact genotype ' + pct(hit.own, 1)
          : "";
      };
      cv.onclick = function (ev) {
        var r = cv.getBoundingClientRect();
        var hit = Lineage.mullerHit(mullerState, ev.clientX - r.left, ev.clientY - r.top);
        if (hit) { selGeno = hit.node.g.id; Game.requestRender(); }
      };
    }
    var cv2 = document.getElementById("cvCycle");
    if (cv2) Chart.cycleCurve(cv2, traceCycle(P), { height: 150, showCit: true });

    var rows = document.querySelectorAll('tr[data-geno]');
    for (var i = 0; i < rows.length; i++) {
      rows[i].onclick = function () { selGeno = +this.dataset.geno; Game.requestRender(); };
    }
  }

  /* Re-run the current population's day at low resolution purely to draw
     it. Nothing here feeds back into the simulation. */
  function traceCycle(P) {
    var groups = Sim.frequencies(P).slice(0, 8).map(function (x) {
      return { tr: x.g.tr, n: [Math.max(1, x.f * P.N / W.env.dilution)] };
    });
    if (!groups.length) return [{ t: 0, N: 1, S: 0, A: 0, C: 0 }];
    var out = [];
    var env = {}; for (var k in W.env) env[k] = W.env[k];
    env.patches = 1;
    var steps = 24;
    /* step the cycle one slice at a time by re-running with a growing
       horizon; cheap enough at this size and keeps cycle() as the only
       place growth is defined */
    for (var s = 1; s <= steps; s++) {
      var copy = groups.map(function (g) { return { tr: g.tr, n: [g.n[0]] }; });
      var e2 = {}; for (var k2 in env) e2[k2] = env[k2];
      e2.transferEvery = (env.transferEvery || 1) * (s / steps);
      var info = Sim.cycle(copy, e2, Math.max(4, Math.round(30 * s / steps)), {});
      out.push({
        t: FLASK.HOURS * (env.transferEvery || 1) * s / steps,
        N: info.finalN, S: info.glucoseLeft / FLASK.VOLUME,
        A: info.acetateLeft / FLASK.VOLUME,
        C: (MEDIUM.citrate * FLASK.VOLUME - info.citrateLeft) / FLASK.VOLUME
      });
    }
    return out;
  }

  /* ============================================================
     TREE
     ============================================================ */
  function treeScreen() {
    var P = selectedPop();
    return '<div class="screenhead"><h2>Lineage tree of ' + P.name + '</h2><p>' +
      'Horizontal position is the generation a lineage first appeared. Thickness is the highest ' +
      'frequency it ever reached. A line that stops, stopped. Squares mark the loss of mismatch ' +
      'repair; circles mark the citrate rearrangement.</p></div>' +
      '<div class="card"><canvas id="cvTree"></canvas>' +
      '<div class="tiny muted" id="treeRead" style="min-height:16px;margin-top:6px"></div></div>' +
      '<div class="card"><h3>What the tree is not telling you</h3><div class="sub">' +
      'The tree is drawn from the model\'s own bookkeeping. In the laboratory you would be ' +
      'reconstructing it from sequenced clones, and you would get it partly wrong — which is why ' +
      'the genomes screen only shows what you have paid to look at.' + prov("invented") + '</div></div>';
  }

  function treePost() {
    var P = selectedPop();
    var cv = document.getElementById("cvTree");
    if (!cv) return;
    treeState = Lineage.tree(cv, P, { height: Math.max(320, Math.min(760, 40 + P.genotypes.length * 16)) });
    cv.onmousemove = function (ev) {
      var r = cv.getBoundingClientRect();
      var n = Lineage.treeHit(treeState, ev.clientX - r.left, ev.clientY - r.top);
      var out = document.getElementById("treeRead");
      if (!out) return;
      out.innerHTML = n ? describeLineage(n.g, P) : "";
    };
    cv.onclick = function (ev) {
      var r = cv.getBoundingClientRect();
      var n = Lineage.treeHit(treeState, ev.clientX - r.left, ev.clientY - r.top);
      if (n) { selGeno = n.g.id; Game.requestRender(); }
    };
  }

  function describeLineage(g, P) {
    var f = Sim.totalN(g) / Math.max(1, P.N);
    var known = g.muts.filter(function (m) { return m.known; });
    return '<b>' + (g.name || ("lineage " + g.id)) + '</b> &middot; born generation ' + n0(g.born) +
      ' &middot; ' + (g.extinct != null ? "lost at generation " + n0(g.extinct) : "currently " + pct(f, 2)) +
      ' &middot; peak ' + pct(g.peak, 1) +
      ' &middot; ' + (known.length ? known.length + " sequenced change" + (known.length === 1 ? "" : "s")
                                   : "never sequenced");
  }

  /* ============================================================
     FITNESS
     ============================================================ */
  function fitness() {
    var h = '<div class="screenhead"><h2>Fitness</h2><p>' +
      'Relative fitness is not a property the simulation reports. It is the outcome of a competition: ' +
      'mix a population one-to-one with something out of the freezer, grow both for a day, and compare ' +
      'how much each one multiplied. Three replicates, because one is a rumour.</p></div>';

    var all = [];
    for (var i = 0; i < W.pops.length; i++)
      for (var j = 0; j < W.pops[i].assays.length; j++) all.push(W.pops[i].assays[j]);
    all.sort(function (a, b) { return b.day - a.day; });

    h += '<div class="card"><h3>Every assay you have run</h3>' +
      '<div class="sub">Points are measurements with their standard error; the dashed line is the ' +
      'published fit to the real experiment. ' + prov("documented") + '</div>' +
      '<canvas id="cvFit2"></canvas></div>';

    h += '<div class="cols two">';
    h += '<div class="card"><h3>Assay log</h3><div class="sub">' + all.length + ' competitions.</div>';
    if (!all.length) h += '<div class="empty">Nothing measured yet. The inspector on the right will run one.</div>';
    else {
      h += '<table class="t"><thead><tr><th>Population</th><th class="num">Gen</th>' +
        '<th class="num">W</th><th class="num">&plusmn;</th><th>Against</th><th>Start</th></tr></thead><tbody>';
      for (var k = 0; k < Math.min(all.length, 26); k++) {
        var a = all[k];
        h += '<tr><td>' + W.pops[a.pop].name + (a.clone ? ' <span class="tiny muted">clone</span>' : '') + '</td>' +
          '<td class="num">' + n0(a.gen) + '</td>' +
          '<td class="num"><b>' + n3(a.W) + '</b></td>' +
          '<td class="num tiny muted">' + n3(a.sem) + '</td>' +
          '<td class="tiny">gen ' + n0(a.refGen) + '</td>' +
          '<td class="tiny muted">' + Math.round(a.ratio * 100) + '%</td></tr>';
      }
      h += '</tbody></table>';
    }
    h += '</div>';

    h += '<div class="card"><h3>Reading a competition</h3><div class="sub">What the number is and is not.</div>' +
      '<p class="tiny dim" style="margin-top:0">A relative fitness of 1.30 means that over one full ' +
      'transfer cycle the evolved population multiplied itself 1.30 times as many <i>doublings\' worth</i> ' +
      'as the reference did in the same flask. It is a ratio of Malthusian parameters, not of growth rates, ' +
      'and it folds together everything: how long each one waits before starting, how fast it goes, how ' +
      'well it scavenges the last of the sugar, and how well it survives the eighteen hours after the ' +
      'sugar runs out.</p>' +
      '<p class="tiny dim">It is also specific to these conditions. A lineage that is 1.4 in this medium ' +
      'may be worse than its own ancestor in any other. If you want to know whether it has specialised, ' +
      'you have to assay it somewhere else, which the conditions screen will let you do.</p>' +
      '<p class="tiny dim">And it can depend on how common the thing being measured is. If two lineages ' +
      'are living off different parts of the same medium, each will look fitter when rare. The reciprocal ' +
      'invasion assay is the way to catch that.</p></div>';
    h += '</div>';
    return h;
  }

  function fitnessPost() {
    var cv = document.getElementById("cvFit2");
    if (!cv) return;
    var pts = [], maxGen = Math.max(100, W.gen), i, j;
    var byPop = {};
    for (i = 0; i < W.pops.length; i++) {
      byPop[i] = [];
      for (j = 0; j < W.pops[i].assays.length; j++) {
        var a = W.pops[i].assays[j];
        if (a.ratio !== 0.5) continue;
        pts.push({ x: a.gen, y: a.W, err: a.sem, colour: i === sel ? Chart.css("--accent") : Chart.css("--ink-dim") });
        byPop[i].push({ x: a.gen, y: a.W });
      }
    }
    var series = [];
    for (i = 0; i < W.pops.length; i++) {
      if (byPop[i].length > 1) series.push({ vals: byPop[i], colour: i === sel ? Chart.css("--accent") : Chart.css("--line"),
                                             width: i === sel ? 1.8 : 1, alpha: i === sel ? 1 : 0.6 });
    }
    var pl = [];
    for (var g = 0; g <= maxGen; g += Math.max(1, maxGen / 80)) pl.push({ x: g, y: Sim.powerLaw(g) });
    series.push({ vals: pl, colour: Chart.css("--muted"), dash: [5, 4], width: 1.3, label: "published fit" });
    Chart.line(cv, series, { height: 250, points: pts, yLabel: "relative fitness",
                             xLabel: "generations", min: 0.95, xmin: 0, xmax: maxGen });
  }

  /* ============================================================
     GENOMES
     ============================================================ */
  function genomes() {
    var par = Sim.parallelism(W);
    var h = '<div class="screenhead"><h2>Genomes</h2><p>' +
      'Only what you have sequenced. If a gene is blank in a column, it does not mean nothing ' +
      'happened there — it means you have not looked.</p></div>';

    h += '<div class="card"><h3>Parallelism</h3><div class="sub">' +
      'The same gene, hit independently in populations that have never been in contact. ' +
      'Shading is the frequency it has reached in that flask. ' + prov("emergent") + '</div>';
    if (!par.length) {
      h += '<div class="empty">Nothing sequenced yet. Eight bench hours buys one clone.</div>';
    } else {
      h += '<div class="matrix"><table><thead><tr><th></th>';
      for (var i = 0; i < W.pops.length; i++)
        h += '<th class="rot"><div><span>' + W.pops[i].name + '</span></div></th>';
      h += '<th></th></tr></thead><tbody>';
      for (var r = 0; r < par.length; r++) {
        var row = par[r];
        var nPops = Object.keys(row.pops).length;
        h += '<tr><td class="gene">' + esc(row.gene) +
          (nPops >= 3 ? ' <span class="tiny acc">&times;' + nPops + '</span>' : '') + '</td>';
        for (var p = 0; p < W.pops.length; p++) {
          var f = row.pops[p] || 0;
          var col = row.kind === "innovation" ? Chart.css("--c-cit")
                  : row.kind === "mutator" ? Chart.css("--danger")
                  : row.kind === "deleterious" ? Chart.css("--muted") : Chart.css("--accent");
          h += '<td class="cell" title="' + W.pops[p].name + (f ? ": " + pct(f, 1) : ": not found") + '"' +
            (f ? ' style="background:color-mix(in srgb,' + col + ' ' + Math.round(18 + f * 75) + '%, transparent)"' : '') +
            '></td>';
        }
        h += '<td class="note">' + esc(row.note || "") + '</td></tr>';
      }
      h += '</tbody></table></div>';
    }
    h += '</div>';

    /* sequencing records for the selected population */
    var P = selectedPop();
    h += '<div class="card"><h3>Sequencing records &mdash; ' + P.name + '</h3>';
    if (!P.sequenced.length) h += '<div class="empty">This population has never been sequenced.</div>';
    else {
      for (var s = P.sequenced.length - 1; s >= Math.max(0, P.sequenced.length - 4); s--) {
        var rec = P.sequenced[s];
        h += '<div style="margin-bottom:14px"><div class="upper muted">Generation ' + n0(rec.gen) +
          ' &middot; ' + (rec.whole ? "population sample" : "single clone") + '</div>';
        for (var c = 0; c < rec.clones.length; c++) {
          var cl = rec.clones[c];
          h += '<div style="margin:7px 0 0 0"><b>' + esc(cl.name) + '</b> ' +
            '<span class="tiny muted">' + pct(cl.f, 1) + ' of the flask &middot; ' +
            cl.nPassengers + ' point mutations total, ' + cl.drivers.length + ' of them in genes ' +
            'selection appears to care about</span>';
          h += '<table class="t" style="margin-top:5px"><tbody>';
          for (var d = 0; d < cl.drivers.length; d++) {
            var dv = cl.drivers[d];
            h += '<tr><td class="mono" style="width:120px">' + esc(dv.gene) + '</td>' +
              '<td class="tiny" style="width:70px">gen ' + n0(dv.gen) + '</td>' +
              '<td class="tiny muted">' + esc(dv.note || "") + '</td></tr>';
          }
          h += '</tbody></table></div>';
        }
        h += '</div>';
      }
    }
    h += '</div>';
    return h;
  }

  /* ============================================================
     FREEZER
     ============================================================ */
  function freezer() {
    var P = selectedPop();
    var h = '<div class="screenhead"><h2>The frozen record</h2><p>' +
      'Every five hundred generations a sample of each population goes into the freezer at minus ' +
      'eighty. Nothing else about this experiment would work without it: a fitness measurement needs ' +
      'something to measure against, and the only fair reference is the population\'s own past.</p></div>';

    h += '<div class="card"><h3>' + P.name + ' &mdash; ' + P.snapshots.length + ' samples</h3>' +
      '<div class="sub">Select two and the inspector will compete them. ' + prov("documented") + '</div>';
    h += '<table class="t"><thead><tr><th>Sample</th><th class="num">Generation</th><th class="num">Day</th>' +
      '<th class="num">Lineages</th><th>Contents</th></tr></thead><tbody>';
    for (var i = P.snapshots.length - 1; i >= 0; i--) {
      var s = P.snapshots[i];
      var tags = "";
      if (s.genotypes.some(function (g) { return g.cit; })) tags += '<span class="flag cit">cit+</span> ';
      if (s.genotypes.some(function (g) { return g.mutator; })) tags += '<span class="flag mut">mut</span> ';
      h += '<tr class="clickable' + (W.refTick === s.tick ? '" style="background:var(--panel2)' : '') + '" data-tick="' + s.tick + '">' +
        '<td>' + (s.tick === 0 ? "founding strain" : "sample " + s.tick) + '</td>' +
        '<td class="num">' + n0(s.gen) + '</td>' +
        '<td class="num">' + n0(s.day) + '</td>' +
        '<td class="num">' + s.genotypes.length + '</td>' +
        '<td>' + (tags || '<span class="tiny muted">nothing remarkable on the label</span>') + '</td></tr>';
    }
    h += '</tbody></table></div>';

    /* replays */
    var jobs = (W.completedJobs || []).filter(function (j) { return j.pop === sel; });
    h += '<div class="card"><h3>Replay experiments</h3><div class="sub">' +
      'Thaw one archived timepoint, restart it twenty times over, and count how often the same thing ' +
      'happens. It is the only way to tell an adaptation that was always going to appear from one that ' +
      'needed a particular history first. ' + prov("documented") + '</div>';
    if (W.jobs.length) {
      var j0 = W.jobs[0];
      h += '<div class="logitem big"><span class="when">running</span><span>' + esc(j0.label) +
        ' &mdash; ' + Math.round(j0.done * 100) + '% complete</span></div>';
    }
    if (!jobs.length && !W.jobs.length) h += '<div class="empty">No replays yet.</div>';
    for (var q = jobs.length - 1; q >= 0; q--) {
      var jb = jobs[q];
      var nCit = jb.results.filter(function (x) { return x.cit; }).length;
      h += '<div class="logitem"><span class="when">gen ' + n0(jb.fromGen) + '</span><span>' +
        '<b>' + nCit + ' of ' + jb.reps.length + '</b> replays from generation ' + n0(jb.fromGen) +
        ' produced a citrate user within ' + n0(jb.targetGen) + ' further generations.' +
        (nCit === 0
          ? ' Nothing in this sample was ready for it.'
          : ' Something in this sample had already made the innovation reachable.') +
        '</span></div>';
    }
    h += '</div>';
    return h;
  }

  function freezerPost() {
    var rows = document.querySelectorAll('tr[data-tick]');
    for (var i = 0; i < rows.length; i++) {
      rows[i].onclick = function () { W.refTick = +this.dataset.tick; Game.requestRender(); };
    }
  }

  /* ============================================================
     CONDITIONS
     ============================================================ */
  function conditions() {
    var e = W.env;
    var locked = !W.sandbox;
    var h = '<div class="screenhead"><h2>Conditions</h2><p>' +
      (locked
        ? 'This run is following the historical protocol, so the conditions are fixed. Everything below ' +
          'is shown for reference. Start an experiment in design mode if you want the knobs.'
        : 'Everything the incubator and the medium can be made to do. Changing something mid-run is a ' +
          'perfectly good experiment, as long as you remember afterwards that you did it.') +
      '</p></div>';

    h += '<div class="cols two">';

    h += '<div class="card"><h3>The medium</h3><div class="sub">What there is to eat.</div>';
    h += ctlSelect("carbon", "Carbon source", e.carbon,
      Object.keys(CARBON).map(function (k) { return [k, CARBON[k].label]; }), CARBON[e.carbon].note, locked);
    h += ctlRange("glucose", "Concentration", e.glucose, 2, 250, 1, e.glucose + " µg/mL",
      "Twenty-five is the historical figure. More sugar means a larger population and a longer growth " +
      "phase; it also means less of the day spent starving, which is most of the day.", locked);
    h += '</div>';

    h += '<div class="card"><h3>The incubator</h3><div class="sub">Physical conditions.</div>';
    h += ctlRange("temperature", "Temperature", e.temperature, 20, 46, 0.5, n1(e.temperature) + " °C",
      "Thirty-seven is the historical figure and the ancestor’s optimum. Move it and you are running " +
      "a different experiment, in which thermal tolerance is suddenly worth something.", locked);
    h += ctlRange("pH", "Acidity", e.pH, 4.5, 9, 0.1, n1(e.pH),
      "The ancestor is happiest near neutral. Its descendants need not be.", locked);
    h += ctlRange("oxygen", "Aeration", e.oxygen, 0.02, 1, 0.02, pct(e.oxygen),
      "Below saturation, carbon is burned less completely and more of it leaves the cell as acetate — " +
      "which makes the acetate niche larger for anyone who can use it.", locked);
    h += '</div>';

    h += '<div class="card"><h3>The transfer</h3><div class="sub">' +
      'The single most consequential thing about this design, and the least obvious.</div>';
    h += ctlRange("dilution", "Dilution", e.dilution, 2, 1000, 1, "1 : " + Math.round(e.dilution),
      "A hundredfold dilution is 6.64 generations a day and a bottleneck of about five million cells. " +
      "A harsher dilution means more generations per day and a much smaller bottleneck, so drift gets " +
      "louder and selection gets quieter.", locked);
    h += ctlRange("transferEvery", "Days between transfers", e.transferEvery, 1, 7, 1,
      e.transferEvery + (e.transferEvery === 1 ? " day" : " days"),
      "Leaving the flask longer does not add growth — the sugar is gone by hour nine. It adds " +
      "starvation, which selects for surviving it.", locked);
    h += ctlRange("patches", "Spatial structure", e.patches, 1, 8, 1,
      e.patches === 1 ? "well mixed" : e.patches + " patches",
      "More than one patch means the medium is divided and lineages compete mostly with their " +
      "neighbours. Mixing happens only at transfer. Diversity survives much longer this way, and the " +
      "simulation gets slower in proportion.", locked);
    h += '</div>';

    h += '<div class="card"><h3>Pressures</h3><div class="sub">Things that are not food.</div>';
    h += ctlRange("antibiotic", "Antibiotic", e.antibiotic, 0, 6, 0.1,
      e.antibiotic === 0 ? "none" : n1(e.antibiotic) + " × MIC",
      "Expressed as a multiple of the ancestor’s minimum inhibitory concentration. Resistance is " +
      "reachable and is not free.", locked);
    h += ctlSwitch("phage", "Introduce a lytic phage", e.phage,
      "The phage adsorbs to a surface receptor. Losing the receptor confers resistance and costs a " +
      "little growth. The phage can answer by broadening its host range, which it will.", locked);
    h += ctlRange("mutagen", "Mutation rate", e.mutagen, 0.1, 20, 0.1, n1(e.mutagen) + " ×",
      "Multiplies the whole mutation supply. Turning it up does not simply speed evolution up: it also " +
      "raises the load of everything else a mutation can do.", locked);
    h += ctlSelect("drift", "Environmental change", e.drift,
      [["none", "Constant"], ["gradual", "Gradual drift"], ["abrupt", "Abrupt alternation"]],
      e.drift === "none" ? "Conditions never change. This is the historical design and it is why the " +
        "experiment can say anything at all about repeatability."
      : e.drift === "gradual" ? "Conditions creep towards a target, slowly enough that adaptation can " +
        "keep up. Populations track a moving optimum instead of climbing a fixed one."
      : "Conditions flip between two states on a fixed schedule. Specialists lose; generalists and " +
        "switchers win.", locked);
    h += '</div>';

    h += '</div>';

    h += '<div class="card"><h3>What one day costs</h3><div class="sub">' +
      'For the conditions as they stand, integrating the ancestor alone.</div>';
    var np = W.env.patches || 1;
    var start = FLASK.VOLUME * 5e5;
    var g0 = { tr: Sim.copyTr(ANCESTOR), n: new Array(np).fill(start / np) };
    var info = Sim.cycle([g0], W.env, 30, {});
    var fold = info.finalN / start;
    h += '<div class="cols three">' +
      '<div><div class="kv"><span class="k">Ancestor reaches</span><span class="v">' + sci(info.finalN / FLASK.VOLUME) + '/mL</span></div>' +
      '<div class="kv"><span class="k">Fold increase</span><span class="v">' + n1(fold) + '&times;</span></div></div>' +
      '<div><div class="kv"><span class="k">Generations per cycle</span><span class="v">' + n2(Math.log2(Math.max(1, fold))) + '</span></div>' +
      '<div class="kv"><span class="k">Glucose exhausted</span><span class="v">' +
        (info.glucoseGoneAt >= 0 ? n1(info.glucoseGoneAt) + " h" : "never") + '</span></div></div>' +
      '<div><div class="kv"><span class="k">Citrate untouched</span><span class="v">' +
        pct(info.citrateLeft / (MEDIUM.citrate * FLASK.VOLUME * (W.env.carbon === "citrate-rich" ? 10 : 1)), 1) + '</span></div>' +
      '<div class="kv"><span class="k">Bottleneck</span><span class="v">' + sci(info.finalN / W.env.dilution) + ' cells</span></div></div>' +
      '</div></div>';
    return h;
  }

  function ctlRange(key, label, val, lo, hi, step, disp, hint, locked) {
    return '<div class="ctl"><label><span>' + label + '</span><b>' + disp + '</b></label>' +
      '<input type="range" data-env="' + key + '" min="' + lo + '" max="' + hi + '" step="' + step +
      '" value="' + val + '"' + (locked ? " disabled" : "") + '>' +
      '<div class="hint">' + hint + '</div></div>';
  }
  function ctlSelect(key, label, val, opts, hint, locked) {
    return '<div class="ctl"><label><span>' + label + '</span></label>' +
      '<select data-env="' + key + '"' + (locked ? " disabled" : "") + '>' +
      opts.map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === val ? " selected" : "") + '>' + o[1] + '</option>';
      }).join("") + '</select><div class="hint">' + hint + '</div></div>';
  }
  function ctlSwitch(key, label, val, hint, locked) {
    return '<div class="ctl"><label class="switch"><input type="checkbox" data-env="' + key + '"' +
      (val ? " checked" : "") + (locked ? " disabled" : "") + '><span>' + label + '</span></label>' +
      '<div class="hint">' + hint + '</div></div>';
  }

  function conditionsPost() {
    var els = document.querySelectorAll("[data-env]");
    for (var i = 0; i < els.length; i++) {
      els[i].onchange = function () {
        var k = this.dataset.env;
        var v = this.type === "checkbox" ? this.checked : (isNaN(+this.value) ? this.value : +this.value);
        var old = W.env[k];
        W.env[k] = v;
        if (k === "patches") {
          for (var p = 0; p < W.pops.length; p++) resizePatches(W.pops[p], v);
        }
        if (k === "phage" && v && !old) {
          for (var q = 0; q < W.pops.length; q++) W.pops[q].phage = PHAGE.START;
        }
        if (k === "carbon" || k === "temperature" || k === "pH" || k === "oxygen" || k === "glucose") {
          W.sens = Sim.sensitivity(W.env);
        }
        Sim.pushEvent(W, null, "Conditions changed: " + k + " is now " + v + ".", "environment");
        Game.requestRender();
      };
    }
  }

  function resizePatches(P, np) {
    for (var i = 0; i < P.genotypes.length; i++) {
      var g = P.genotypes[i];
      var tot = Sim.totalN(g);
      g.n = new Array(np).fill(tot / np);
    }
  }

  /* ============================================================
     NOTEBOOK
     ============================================================ */
  function notebook() {
    var h = '<div class="screenhead"><h2>Notebook</h2><p>' +
      'Everything that happened, in the order it happened.</p></div>';
    var ev = W.events.slice().reverse();
    h += '<div class="card">';
    if (!ev.length) h += '<div class="empty">Nothing yet.</div>';
    for (var i = 0; i < Math.min(ev.length, 160); i++) {
      var e = ev[i];
      e.seen = true;
      h += '<div class="logitem' + (e.big ? " big" : "") + '">' +
        '<span class="when">gen ' + n0(e.gen) + (e.pop != null && W.pops[e.pop] ? " &middot; " + W.pops[e.pop].name : "") + '</span>' +
        '<span>' + esc(e.text) + '</span></div>';
    }
    h += '</div>';

    h += '<div class="card"><h3>Bench time</h3><div class="sub">' +
      n1(W.lab.spent) + ' hours spent, ' + n1(W.lab.hours) + ' in hand.</div>';
    var byKind = {};
    for (var j = 0; j < W.lab.log.length; j++) {
      var l = W.lab.log[j];
      byKind[l.what] = (byKind[l.what] || 0) + l.cost;
    }
    var keys = Object.keys(byKind).sort(function (a, b) { return byKind[b] - byKind[a]; });
    if (!keys.length) h += '<div class="empty">Nothing spent yet.</div>';
    else {
      h += '<table class="t"><thead><tr><th>Procedure</th><th class="num">Hours</th><th></th></tr></thead><tbody>';
      var max = byKind[keys[0]];
      for (var k = 0; k < keys.length; k++) {
        h += '<tr><td>' + keys[k] + '</td><td class="num">' + n1(byKind[keys[k]]) + '</td>' +
          '<td style="width:45%"><div class="bar"><i style="width:' + (byKind[keys[k]] / max * 100) +
          '%;background:var(--accent)"></i></div></td></tr>';
      }
      h += '</tbody></table>';
    }
    h += '</div>';
    return h;
  }

  /* ============================================================
     ASSUMPTIONS
     ============================================================ */
  function assumptions() {
    var rows = [
      ["Twelve populations, daily 1:100 transfer", "documented",
       "The design of the original experiment: twelve populations founded from one strain, propagated by hundredfold daily dilution."],
      ["25 µg/mL glucose in a citrate-buffered minimal medium", "documented",
       "DM25. The citrate is there as an iron chelator and the ancestor cannot use it as carbon under oxic conditions."],
      ["6.64 generations per transfer cycle", "documented",
       "Log base two of a hundredfold regrowth. Follows directly from the protocol."],
      ["Freezing every 500 generations", "documented",
       "The archive that makes competition against one’s own ancestor possible."],
      ["Fitness measured by one-day competition, three replicates", "documented",
       "The standard assay. The number reported is a ratio of Malthusian parameters."],
      ["Fitness rises and decelerates without stopping", "documented",
       "Observed over more than fifty thousand generations and fitted with a power law."],
      ["The same genes mutate in populations that never met", "documented",
       "Parallel evolution at pykF, nadR, spoT, topA and others."],
      ["Hypermutability evolves in roughly half the populations", "documented",
       "Loss of mismatch repair, hitchhiking on the beneficial mutations it produces."],
      ["Aerobic citrate use appeared once, after ~31,000 generations", "documented",
       "In one population only, and shown by replay experiments to require a potentiated background."],
      ["Evolved cells are larger than the ancestor", "documented",
       "A conspicuous and repeated correlated response."],
      ["Monod growth kinetics on glucose, acetate and citrate", "estimated",
       "Standard microbial growth modelling. Half-saturation constants and yields are typical values for E. coli, not measurements from this experiment."],
      ["Acetate cross-feeding as a secondary niche", "estimated",
       "Overflow metabolism is real and a stable acetate-specialist polymorphism did evolve in one population. The specific rates here are chosen, not measured."],
      ["Thermal, pH and oxygen performance curves", "estimated",
       "Gaussian tolerance curves of plausible width. Nothing in the original experiment varied these."],
      ["Exponential distribution of beneficial effects, mean 6 per cent", "invented",
       "Extreme-value theory says the tail should look roughly like this. The mean is tuned so the fitness trajectory matches the published one."],
      ["Diminishing returns as exp(-4.2 × (W-1))", "invented",
       "A single term standing in for a great deal of real epistasis. It is the reason the curve bends."],
      ["Only twelve per cent of the mutator’s rate increase reaches useful mutations", "invented",
       "Defensible — much of what adaptation uses here is structural and invisible to mismatch repair — but the number is chosen so hypermutators do not run away with the experiment."],
      ["Every trait has a physiological range it cannot leave", "estimated",
       "Maximum growth rate on glucose minimal medium tops out near 1.05 per hour, lag cannot fall below about a sixth of an hour, and carbon conservation caps the yield. With every trait at its limit simultaneously a lineage measures 2.14 against the ancestor, and 2.91 if it can also use citrate. Nothing in this model goes beyond that."],
      ["A cap of about 130 tracked lineages per flask", "invented",
       "A real flask contains billions of distinguishable genotypes. Below the cap the rarest are dropped, which is also roughly what happens to them."],
      ["Bench hours, and their cost per procedure", "invented",
       "There is no such currency in the real laboratory. It exists here so that measuring has to be chosen rather than assumed."],
      ["Phage, antibiotics, spatial patches, alternating environments", "invented",
       "None of these were part of the original design. They are here because the question ‘what if it had been run differently’ is worth being able to ask."]
    ];
    var h = '<div class="screenhead"><h2>Assumptions</h2><p>' +
      'Which of these numbers came from the published experiment, which are ordinary microbiology, ' +
      'and which were made up so that the thing would run. Nobody should leave this simulation ' +
      'believing something the experiment did not find.</p></div>';
    h += '<div class="card"><table class="t"><thead><tr><th>Claim</th><th>Standing</th><th>Note</th></tr></thead><tbody>';
    for (var i = 0; i < rows.length; i++) {
      h += '<tr><td style="width:34%">' + rows[i][0] + '</td><td style="width:12%">' + prov(rows[i][1]) +
        '</td><td class="tiny muted">' + rows[i][2] + '</td></tr>';
    }
    h += '</tbody></table></div>';

    h += '<div class="card"><h3>Where the model is deliberately wrong</h3>' +
      '<p class="tiny dim" style="margin-top:2px">Growth is deterministic. With half a billion cells in a ' +
      'flask that is a very good approximation, but it means the model has no demographic noise during ' +
      'the growth phase; all of its randomness lives in mutation and in the transfer.</p>' +
      '<p class="tiny dim">Recombination does not exist. These are asexual populations, which is true of ' +
      'the real experiment, so every lineage is a strict clone and clonal interference is the only way ' +
      'two good mutations can meet: one of them has to arise inside the other.</p>' +
      '<p class="tiny dim">The mutation supply is truncated. Beneficial mutations of very small effect are ' +
      'never instantiated, and neutral ones are counted rather than modelled. A real population carries ' +
      'far more standing variation than anything drawn here.</p>' +
      '<p class="tiny dim">Fitness assays are run in the founding conditions regardless of what the flask ' +
      'is currently being subjected to, which is what the laboratory does and is also a trap: a lineage ' +
      'can be improving in its actual environment while its assayed fitness goes nowhere.</p></div>';
    return h;
  }

  /* ============================================================
     INSPECTOR
     ============================================================ */
  function inspector() {
    var P = selectedPop();
    var h = '';

    h += '<div class="labbar"><div class="row"><span class="upper muted">Bench hours</span>' +
      '<span class="hrs">' + n1(W.lab.hours) + '</span></div>' +
      '<div class="meter"><i style="width:' + (W.lab.hours / LAB.CAP * 100) + '%"></i></div>' +
      '<div class="tiny muted" style="margin-top:5px">One hour accrues per simulated day, to a ceiling of ' +
      LAB.CAP + '. Everything below spends them.</div></div>';

    h += '<div class="insp-h">' + P.name + '</div>';
    h += '<div class="insp-sub">' + P.marker + ' marker &middot; generation ' + n0(P.gen) +
      (P.extinctAt != null ? ' &middot; <span class="danger">lost</span>' : '') + '</div>';

    var a = lastAssay(P);
    h += '<div class="kv"><span class="k">Measured fitness</span><span class="v">' +
      (a ? n3(a.W) + " ± " + n3(a.sem) : "—") + '</span></div>';
    h += '<div class="kv"><span class="k">Last assayed</span><span class="v">' +
      (a ? "gen " + n0(a.gen) : "never") + '</span></div>';
    h += '<div class="kv"><span class="k">Density</span><span class="v">' + sci(P.N / FLASK.VOLUME) + '/mL</span></div>';
    h += '<div class="kv"><span class="k">Archive</span><span class="v">' + P.snapshots.length + ' samples</span></div>';
    if (P.phage > 0) h += '<div class="kv"><span class="k">Phage titre</span><span class="v">' + sci(P.phage / FLASK.VOLUME) + '/mL</span></div>';

    var refTick = W.refTick != null ? W.refTick : 0;
    var refSnap = P.snapshots.find(function (s) { return s.tick === refTick; }) || P.snapshots[0];

    h += '<div class="sectitle upper">Reference for competition</div>';
    h += '<select id="refSel">' + P.snapshots.map(function (s) {
      return '<option value="' + s.tick + '"' + (s.tick === refTick ? " selected" : "") + '>' +
        (s.tick === 0 ? "founding strain" : "generation " + n0(s.gen)) + '</option>';
    }).join("") + '</select>';

    h += '<div class="sectitle upper">Measurements</div>';
    h += act("assay", "Competition assay", "population against the reference");
    h += act("assayFreq", "Assay when rare", "the same competition started at five per cent");
    h += act("plate", "Plate for colonies", "cell size, density and how many types there are");
    h += act("sequence", "Sequence one clone", "everything in a single genome");
    h += act("sequencePop", "Sequence the population", "every lineage above five per cent");
    h += act("invade", "Reciprocal invasion", "does either exclude the other");
    h += act("replay", "Replay from " + (refSnap ? "gen " + n0(refSnap.gen) : "archive"),
             "twenty restarts, two thousand generations each");

    /* selected lineage */
    if (selGeno && P.lineageIndex[selGeno]) {
      var g = P.lineageIndex[selGeno];
      h += '<div class="sectitle upper">Selected lineage</div>';
      h += '<div style="font-weight:620">' + sw(g.colour) + (g.name || ("lineage " + g.id)) + '</div>';
      h += '<div class="kv"><span class="k">Born</span><span class="v">gen ' + n0(g.born) + '</span></div>';
      h += '<div class="kv"><span class="k">Now</span><span class="v">' +
        (g.extinct != null ? "extinct" : pct(Sim.totalN(g) / Math.max(1, P.N), 2)) + '</span></div>';
      h += '<div class="kv"><span class="k">Peak</span><span class="v">' + pct(g.peak, 1) + '</span></div>';
      var known = g.muts.filter(function (m) { return m.known; });
      h += '<div class="kv"><span class="k">Sequenced changes</span><span class="v">' + known.length + '</span></div>';
      if (known.length) {
        h += '<div class="tiny muted" style="margin-top:7px">';
        for (var i = 0; i < known.length; i++) {
          h += '<div style="margin-bottom:5px"><b class="mono">' + esc(known[i].gene) + '</b> &middot; gen ' +
            n0(known[i].gen) + '<br>' + esc(known[i].note || "") + '</div>';
        }
        h += '</div>';
      } else {
        h += '<div class="tiny muted" style="margin-top:7px">Nothing is known about this lineage’s ' +
          'genome. Sequencing the population would reveal it if it is above five per cent.</div>';
      }
    }
    return h;
  }

  function act(kind, label, note) {
    var cost = LAB.COSTS[kind];
    var can = W.lab.hours >= cost && selectedPop().extinctAt == null;
    return '<button class="btn act" data-act="' + kind + '"' + (can ? "" : " disabled") + '>' +
      '<span>' + label + '<br><span class="tiny muted">' + note + '</span></span>' +
      '<span class="cost">' + cost + ' h</span></button>';
  }

  function inspectorPost() {
    var ref = document.getElementById("refSel");
    if (ref) ref.onchange = function () { W.refTick = +this.value; Game.requestRender(); };

    var btns = document.querySelectorAll("[data-act]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].onclick = function () { doAction(this.dataset.act); };
    }
  }

  function doAction(kind) {
    var P = selectedPop();
    var refTick = W.refTick != null ? W.refTick : 0;
    var r;
    if (kind === "assay" || kind === "assayFreq") {
      r = Sim.runAssay(W, sel, refTick, kind === "assayFreq" ? 0.05 : 0.5, false);
      if (r) Game.toast(P.name + ": W = " + n3(r.W) + " ± " + n3(r.sem) + ". " + Events.readAssay(r, P), true);
    } else if (kind === "sequence" || kind === "sequencePop") {
      r = Sim.sequence(W, sel, kind === "sequencePop");
      if (r) {
        var nd = r.clones.reduce(function (a, c) { return a + c.drivers.length; }, 0);
        Game.toast(P.name + ": " + r.clones.length + " genome" + (r.clones.length === 1 ? "" : "s") +
          " read, " + nd + " change" + (nd === 1 ? "" : "s") + " in genes selection cares about.");
      }
    } else if (kind === "plate") {
      r = Sim.plate(W, sel);
      if (r) {
        P.plateSeen = { types: Object.keys(r.types).length, size: r.size, gen: r.gen };
        Game.toast(P.name + ": " + Object.keys(r.types).length + " colony type" +
          (Object.keys(r.types).length === 1 ? "" : "s") + ", mean cell size +" +
          Math.round((r.size - 1) * 100) + " per cent against the ancestor.");
      }
    } else if (kind === "invade") {
      var top = Sim.frequencies(P).filter(function (x) { return x.f > 0.02; });
      if (top.length < 2) { Game.toast("There is only one lineage above two per cent. Nothing to compete."); return; }
      r = Sim.invasion(W, sel, top[0].g.id, top[1].g.id);
      if (r) Game.toast(P.name + ": " + (r.a.name || r.a.id) + " invades at " + n3(r.aRare) + ", " +
        (r.b.name || r.b.id) + " at " + n3(r.bRare) + ". " + Events.readInvasion(r), true);
    } else if (kind === "replay") {
      var job = Sim.replayStart(W, sel, refTick, 20, 2000);
      if (job) Game.toast("Replay started: " + job.label + ". It will run alongside the experiment.");
    }
    Game.requestRender();
  }

  /* ============================================================
     DISPATCH
     ============================================================ */
  var BUILD = {
    bench: bench, population: population, tree: treeScreen, fitness: fitness,
    genomes: genomes, freezer: freezer, conditions: conditions,
    notebook: notebook, assumptions: assumptions
  };
  var POST = {
    bench: benchPost, population: populationPost, tree: treePost,
    fitness: fitnessPost, freezer: freezerPost, conditions: conditionsPost
  };

  function render(screen) {
    benchBar();
    var el = document.getElementById("screen-" + screen);
    if (el && BUILD[screen]) {
      el.innerHTML = BUILD[screen]();
      if (POST[screen]) POST[screen]();
    }
    var insp = document.getElementById("inspector");
    if (insp) { insp.innerHTML = inspector(); inspectorPost(); }
  }

  return { setWorld: setWorld, render: render, selectPop: selectPop,
           selectedPop: selectedPop, benchBar: benchBar };
})();
