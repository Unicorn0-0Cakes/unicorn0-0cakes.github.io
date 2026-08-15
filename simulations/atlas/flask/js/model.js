"use strict";
/* =====================================================================
   EVOLUTION IN A FLASK — model.js

   The evolutionary engine. No DOM, no globals beyond what config.js
   defines, so this file can be required in node and calibrated on its own.

   The shape of the thing:

     A flask holds a list of GENOTYPES. Each genotype owns a trait vector
     and a cell count. Growth is deterministic — with a hundred million
     cells, it may as well be — and is obtained by integrating Monod
     kinetics on three carbon sources for twenty-four simulated hours.
     Chance enters at exactly two places, which is where it enters in the
     real experiment: mutations arise at random, and the daily transfer of
     one part in a hundred is a random sample of what was in the flask.

     Nothing about who wins is decided by a fitness number. Fitness is a
     measurement the model makes of itself, in the same way and with the
     same assay the laboratory uses. If a lineage takes over, it is
     because it grew.
   ===================================================================== */

var Sim = (function () {

  /* ---- node compatibility ------------------------------------------ */
  if (typeof RNG === "undefined" && typeof require !== "undefined") {
    var C = require("./config.js");
    for (var k in C) if (Object.prototype.hasOwnProperty.call(C, k)) global[k] = C[k];
  }

  var TRAITS = Object.keys(ANCESTOR);

  function copyTr(t) {
    var o = {};
    for (var i = 0; i < TRAITS.length; i++) o[TRAITS[i]] = t[TRAITS[i]];
    return o;
  }

  /* =====================================================================
     ENVIRONMENTAL MODIFIERS
     Computed once per genotype per cycle. Conditions do not change inside
     a cycle, only between them, so there is nothing to recompute at every
     integration step.
     ===================================================================== */

  function envFactors(tr, env) {
    /* thermal performance: a Gaussian around the lineage's optimum */
    var dT = (env.temperature - tr.tOpt) / tr.tBreadth;
    var fT = Math.exp(-dT * dT);
    /* heat above 42 C does damage no optimum can shrug off */
    if (env.temperature > 42) fT *= Math.exp(-(env.temperature - 42) * 0.28);

    var dP = (env.pH - tr.pHopt) / tr.pHbreadth;
    var fP = Math.exp(-dP * dP);

    /* oxygen: aerobic growth saturates quickly, and a lineage can evolve
       to hold on further down. Below saturation, carbon is burned less
       completely, so more of it leaves the cell as acetate. */
    var o = Math.max(0.001, env.oxygen);
    var fO = Math.pow(o, 0.55) / (Math.pow(o, 0.55) + 0.075 / Math.max(0.3, tr.o2Aff));
    var overflow = 1 + (1 - fO) * 1.9;

    /* antibiotic, expressed as a multiple of the ancestral MIC */
    var fA = 1, kill = 0;
    if (env.antibiotic > 0) {
      var mic = 1 + 9 * tr.abxRes;
      var x = env.antibiotic / mic;
      fA = 1 / (1 + 3.2 * x * x);
      kill = 0.42 * Math.max(0, x - 0.55);
    }

    return {
      mu: fT * fP * fO * fA,
      yieldF: 0.72 + 0.28 * fO,        // incomplete oxidation wastes carbon
      overflow: overflow,
      kill: kill
    };
  }

  /* =====================================================================
     ONE GROWTH CYCLE
     `groups` is any array of objects carrying { tr, n } where n is an
     array of cell counts, one per patch. The same routine runs the twelve
     flasks, every competition assay and every replay, which is the only
     way an assay can be trusted to mean what it says.
     ===================================================================== */

  function cycle(groups, env, steps, opts) {
    opts = opts || {};
    var np = env.patches || 1;
    var vol = FLASK.VOLUME / np;              // mL per patch
    var carb = CARBON[env.carbon] || CARBON.glucose;
    var hours = FLASK.HOURS * (env.transferEvery || 1);
    var dt = hours / steps;
    var G = groups.length;
    var i, p, s;

    /* fresh medium, per patch, in micrograms */
    var Sug = new Float64Array(np), Aug = new Float64Array(np), Cug = new Float64Array(np);
    var gluConc = (opts.glucose != null ? opts.glucose : env.glucose);
    var citConc = MEDIUM.citrate * (env.carbon === "citrate-rich" ? 10 : 1);
    for (p = 0; p < np; p++) { Sug[p] = gluConc * vol; Cug[p] = citConc * vol; Aug[p] = 0; }

    /* A caller may hand us cell counts that do not match the current patch
       count — after the player changes the structure of the flask, or when
       an assay reuses a genotype from a structured world. Spread whatever
       is there evenly rather than reading past the end of the array. */
    for (i = 0; i < G; i++) {
      if (groups[i].n.length !== np) {
        var tot = 0;
        for (p = 0; p < groups[i].n.length; p++) tot += groups[i].n[p] || 0;
        groups[i].n = new Array(np);
        for (p = 0; p < np; p++) groups[i].n[p] = tot / np;
      }
    }

    /* per-genotype environmental factors, once */
    var EF = new Array(G);
    for (i = 0; i < G; i++) EF[i] = envFactors(groups[i].tr, env);

    /* phage, if any */
    var phage = opts.phage != null ? opts.phage : (env.phage ? (opts.phageN || PHAGE.START) : 0);
    var phageRange = opts.phageRange || 0;

    /* scratch */
    var dS = new Float64Array(G), dA = new Float64Array(G), dC = new Float64Array(G);
    var muG = new Float64Array(G), muA = new Float64Array(G), muC = new Float64Array(G);

    var ledgerIn = 0, ledgerOut = 0;
    for (p = 0; p < np; p++) ledgerIn += Sug[p] + Cug[p];

    var peakN = 0, glucoseGone = -1;

    for (s = 0; s < steps; s++) {
      var t = s * dt;
      var totalNow = 0;

      for (p = 0; p < np; p++) {
        var sc = Sug[p] / vol, ac = Aug[p] / vol, cc = Cug[p] / vol;
        var repress = sc > 0.35 ? 0.05 : 1;      // catabolite repression
        var demS = 0, demA = 0, demC = 0;

        for (i = 0; i < G; i++) {
          var n = groups[i].n[p];
          if (n <= 0) { muG[i] = muA[i] = muC[i] = 0; continue; }
          var tr = groups[i].tr, ef = EF[i];

          /* lag: a ramp rather than a switch, so the integration is smooth */
          var lagF = t < tr.lag ? 0 : Math.min(1, (t - tr.lag) / 0.4);
          var aceF = t < (tr.lag + tr.aceLag) ? 0 : 1;

          muG[i] = tr.mumax * carb.mu * ef.mu * lagF * (sc / (tr.Ks * carb.Ks + sc));
          muA[i] = tr.aceMu * ef.mu * aceF * repress * (ac / (HALF_SAT.acetate + ac));
          muC[i] = tr.citT * ef.mu * lagF * (sc > 0.35 ? 0.15 : 1) * (cc / (HALF_SAT.citrate + cc));

          var mu = muG[i] + muA[i] + muC[i];
          if (mu > 1.5) { var k = 1.5 / mu; muG[i] *= k; muA[i] *= k; muC[i] *= k; mu = 1.5; }

          var grow = n * (Math.exp(mu * dt) - 1);
          var yg = YIELD.glucose * tr.Yglu * carb.Y * ef.yieldF;
          dS[i] = mu > 0 ? grow * (muG[i] / mu) / yg : 0;
          dA[i] = mu > 0 ? grow * (muA[i] / mu) / (YIELD.acetate * ef.yieldF) : 0;
          dC[i] = mu > 0 ? grow * (muC[i] / mu) / (YIELD.citrate * ef.yieldF) : 0;
          demS += dS[i]; demA += dA[i]; demC += dC[i];
        }

        /* nobody may eat more than is there */
        var fS = demS > Sug[p] && demS > 0 ? Sug[p] / demS : 1;
        var fA = demA > Aug[p] && demA > 0 ? Aug[p] / demA : 1;
        var fC = demC > Cug[p] && demC > 0 ? Cug[p] / demC : 1;

        var usedS = 0, usedA = 0, usedC = 0, secreted = 0;

        for (i = 0; i < G; i++) {
          var nn = groups[i].n[p];
          if (nn <= 0) continue;
          var tri = groups[i].tr, efi = EF[i];
          var ygi = YIELD.glucose * tri.Yglu * carb.Y * efi.yieldF;

          var eS = dS[i] * fS, eA = dA[i] * fA, eC = dC[i] * fC;
          var born = eS * ygi + eA * YIELD.acetate * efi.yieldF + eC * YIELD.citrate * efi.yieldF;

          usedS += eS; usedA += eA; usedC += eC;
          secreted += eS * tri.aceSecr * efi.overflow;

          nn += born;

          /* starvation, and whatever the antibiotic is doing */
          var effMu = born / Math.max(1, groups[i].n[p]) / dt;
          if (effMu < 0.015) nn *= Math.exp(-tri.statDeath * dt);
          if (efi.kill > 0) nn *= Math.exp(-efi.kill * dt);

          groups[i].n[p] = nn;
          totalNow += nn;
        }

        Sug[p] -= usedS; Aug[p] += secreted - usedA; Cug[p] -= usedC;
        if (Sug[p] < 1e-12) Sug[p] = 0;
        if (Aug[p] < 1e-12) Aug[p] = 0;
        if (Cug[p] < 1e-12) Cug[p] = 0;
        ledgerOut += usedS + usedC;
        if (glucoseGone < 0 && Sug[p] <= 1e-9) glucoseGone = t;
      }

      /* phage, well mixed across patches because virions are small */
      if (phage > 0) {
        var burst = 0, adsorbed = 0;
        var pconc = phage / FLASK.VOLUME;
        for (i = 0; i < G; i++) {
          var res = groups[i].tr.phageRes * (1 - phageRange);
          var rate = PHAGE.ADSORB * pconc * (1 - res);
          if (rate <= 0) continue;
          for (p = 0; p < np; p++) {
            var lost = groups[i].n[p] * (1 - Math.exp(-rate * dt));
            groups[i].n[p] -= lost;
            adsorbed += lost;
          }
        }
        burst = adsorbed * PHAGE.BURST;
        phage = phage - adsorbed + burst;
        phage *= Math.exp(-PHAGE.DECAY * dt);
        if (phage < 1) phage = 0;
      }

      if (totalNow > peakN) peakN = totalNow;
    }

    var finalN = 0;
    for (i = 0; i < G; i++) for (p = 0; p < np; p++) finalN += groups[i].n[p];

    var leftS = 0, leftC = 0, leftA = 0;
    for (p = 0; p < np; p++) { leftS += Sug[p]; leftC += Cug[p]; leftA += Aug[p]; }

    return {
      finalN: finalN, peakN: peakN, phage: phage,
      glucoseLeft: leftS, citrateLeft: leftC, acetateLeft: leftA,
      glucoseGoneAt: glucoseGone,
      carbonIn: ledgerIn, carbonUsed: ledgerOut
    };
  }

  /* =====================================================================
     COMPETITION
     The measurement the laboratory actually performs. Two things are mixed
     at a chosen ratio into fresh medium, grown for one cycle, and counted.
     Relative fitness is the ratio of their realised Malthusian parameters.
     ===================================================================== */

  function compete(trA, trB, env, ratio, steps) {
    ratio = ratio == null ? 0.5 : ratio;
    var e = {};
    for (var q in env) e[q] = env[q];
    e.patches = 1;
    e.transferEvery = 1;

    var N0 = FLASK.VOLUME * 5e5;
    var a = { tr: trA, n: [N0 * ratio] };
    var b = { tr: trB, n: [N0 * (1 - ratio)] };
    cycle([a, b], e, steps || 20, {});
    var mA = Math.log(Math.max(1e-9, a.n[0]) / (N0 * ratio));
    var mB = Math.log(Math.max(1e-9, b.n[0]) / (N0 * (1 - ratio)));
    if (mB <= 0.001) return mA > 0.001 ? 3 : 1;
    return mA / mB;
  }

  /* Fitness of a trait vector against the ancestor, in the reference
     conditions of the experiment rather than whatever the flask is
     currently being subjected to. This is what "relative fitness" means
     in the literature and it is what the fitness charts show. */
  function fitnessOf(tr, refEnv, steps) {
    return compete(tr, ANCESTOR, refEnv, 0.5, steps || 18);
  }

  /* =====================================================================
     TRAIT SENSITIVITY
     How much fitness does a one per cent improvement in each trait buy,
     here, in this medium, at this temperature? Measured rather than
     assumed, so that changing the environment automatically changes which
     traits selection can see. Computed once when a world is made.
     ===================================================================== */

  function sensitivity(env) {
    var out = {};
    var base = ANCESTOR;
    for (var i = 0; i < TRAITS.length; i++) {
      var t = TRAITS[i];
      if (t === "mutMult" || t === "citT" || t === "abxRes" || t === "phageRes" ||
          t === "tOpt" || t === "pHopt" || t === "size") { out[t] = 0; continue; }
      var tr = copyTr(base);
      var dir = TRAIT_DIR[t] || 1;
      var step = 0.05 * dir;                    // five per cent, in the good direction
      tr[t] = base[t] * (1 + step);
      var w = compete(tr, base, env, 0.5, 26);
      out[t] = (w - 1) / 0.05;                  // fitness per unit relative improvement
      if (!isFinite(out[t]) || out[t] < 0.002) out[t] = 0.002;
    }
    /* traits that start at zero are handled with absolute steps */
    var trc = copyTr(base); trc.citT = 0.05;
    out.citT = (compete(trc, base, env, 0.5, 26) - 1) / 0.05;
    out.abxRes = 0.4; out.phageRes = 0.4; out.size = 0.02;
    out.tOpt = 0.05; out.pHopt = 0.05; out.mutMult = 0;
    return out;
  }

  /* =====================================================================
     MUTATION
     ===================================================================== */

  var gidSeq = 1;

  function applyGeneEffect(tr, gene, s, sens, rng) {
    /* Split the intended selection coefficient across the traits the gene
       touches, in proportion to its weights, and convert each share into a
       relative trait change using the measured sensitivity. */
    var keys = Object.keys(gene.tr);
    var tw = 0, i;
    for (i = 0; i < keys.length; i++) tw += Math.abs(gene.tr[keys[i]]);
    var changes = {};
    for (i = 0; i < keys.length; i++) {
      var t = keys[i], w = gene.tr[t];
      var share = s * (Math.abs(w) / tw) * (w < 0 ? -1 : 1);
      var sn = Math.max(0.01, sens[t] || 0.05);
      var rel = share / sn;
      rel = clamp(rel, -0.55, 0.9);
      var dir = TRAIT_DIR[t] || 1;
      var bnd = TRAIT_BOUNDS[t] || [1e-4, 1e9];
      var was = tr[t];
      if (t === "size") {
        tr.size = tr.size * (1 + Math.abs(rel) * 0.9);
      } else if (t === "phageRes" || t === "abxRes") {
        tr[t] = tr[t] + Math.abs(rel) * 0.55;
      } else {
        tr[t] = tr[t] * (1 + rel * (dir < 0 ? -1 : 1));
      }
      /* Nothing may leave the range physiology allows. A lineage that has
         already reached the floor for its lag phase gets nothing further
         from a mutation that would have shortened it. */
      tr[t] = clamp(tr[t], bnd[0], bnd[1]);
      changes[t] = tr[t] - was;
    }
    return changes;
  }

  function spawn(P, parent, kind, gene, s, W, rng) {
    var tr = copyTr(parent.tr);
    var changes = {};
    if (gene && gene.tr) changes = applyGeneEffect(tr, gene, s, W.sens, rng);

    var g = {
      id: gidSeq++,
      pop: P.index,
      parent: parent.id,
      born: P.gen,
      bornDay: P.day,
      tr: tr,
      n: new Array(W.env.patches).fill(0),
      muts: parent.muts.slice(),
      nNeutral: parent.nNeutral,
      mutator: parent.mutator,
      cit: parent.cit,
      citCopies: parent.citCopies,
      potCount: parent.potCount,
      W: 1, Wknown: null,
      peak: 0, extinct: null,
      name: null, depth: parent.depth + 1,
      colour: parent.colour
    };
    var rec = {
      gene: gene ? gene.id : "-", kind: kind, s: s, gen: P.gen, day: P.day,
      changes: changes, known: false, note: gene ? gene.note : ""
    };
    g.muts.push(rec);
    if (gene && gene.pot) g.potCount++;
    return g;
  }

  function mutateStep(P, W, births) {
    var rng = W.rng, env = W.env;
    var mult = env.mutagen;
    var made = [];
    var i;

    /* How many descendants a brand-new mutant has by the end of the cycle.
       A mutation is equally likely to occur at any cell division, so the
       population size at which it arises is uniform over the divisions
       that happened. One arising in the first hour leaves a hundred
       descendants; one arising in the last minute leaves one. This single
       distribution is why most beneficial mutations are lost to the
       transfer regardless of how good they are. */
    /* Losing mismatch repair multiplies the point-mutation rate about a
       hundredfold, but it does not multiply the supply of useful mutations
       by anything like that. Much of what adaptation in this medium
       actually uses — insertion sequences hopping, small deletions,
       whole operons being lost — is invisible to mismatch repair. The
       beneficial supply therefore rises by roughly twelvefold, not a
       hundred, and that difference is the difference between a model where
       hypermutators run away with the experiment and one where they merely
       do a little better. */
    function benMult(g) { return 1 + (g.tr.mutMult - 1) * MUT.BEN_FRACTION; }

    var Nf = Math.max(1, P.N), N0 = Math.max(1, Nf - births);
    function founding() {
      var arise = N0 + rng.next() * Math.max(1, Nf - N0);
      return Math.max(1, Math.round(Nf / arise));
    }
    function place(g) {
      var c = founding();
      g.n[rng.int(0, env.patches - 1)] = c;
      return g;
    }

    /* Passenger mutations accumulate along every lineage at the genomic
       rate, per generation, whatever the lineage's frequency. They are
       unseen until somebody pays to sequence, and they are most of what a
       sequencer finds. */
    var gensThisCycle = FLASK.GEN_PER_CYCLE * (env.transferEvery || 1);
    for (i = 0; i < P.genotypes.length; i++) {
      var g = P.genotypes[i];
      g.nNeutral += rng.poisson(MUT.U_TOTAL * gensThisCycle * mult * g.tr.mutMult);
    }

    /* Sampling a parent in proportion to the number of mutations it is
       expected to have produced: divisions multiplied by mutation rate.
       This is the whole reason a hypermutable lineage can take over a
       population without being any fitter — it simply generates a larger
       share of whatever good mutations turn up next, and rides them. */
    var wTot = 0;
    for (var wj = 0; wj < P.genotypes.length; wj++) {
      wTot += totalN(P.genotypes[wj]) * benMult(P.genotypes[wj]);
    }
    function drawParent() {
      var r = rng.next() * wTot, acc = 0;
      for (var j = 0; j < P.genotypes.length; j++) {
        acc += totalN(P.genotypes[j]) * benMult(P.genotypes[j]);
        if (acc >= r) return P.genotypes[j];
      }
      return P.genotypes[P.genotypes.length - 1];
    }

    function rateFor(u) {
      /* Mutators raise the supply for everything. Weighted by how much of
         the flask is hypermutable. */
      var w = 0;
      for (var j = 0; j < P.genotypes.length; j++) {
        var gg = P.genotypes[j];
        w += totalN(gg) * benMult(gg);
      }
      return births * u * mult * (w / Math.max(1, P.N));
    }

    /* --- the cryptic mutator pool -------------------------------------
       Mismatch repair is a large target and loses function often, but a
       lineage that loses it gains nothing directly, so it sits at a low
       frequency and is usually swept away by somebody else's success.
       Tracking hundreds of doomed hypermutable lineages every day would
       cost more than it is worth, so the model keeps their combined
       frequency as a single number and asks, each time a beneficial
       mutation turns up, whether it happened to occur in one of them.
       That is the mechanism by which mutators actually take over: not by
       being fitter, but by being where the next good idea comes from. */
    var realisedMut = 0;
    for (i = 0; i < P.genotypes.length; i++) if (P.genotypes[i].mutator) realisedMut += totalN(P.genotypes[i]);
    realisedMut /= Math.max(1, P.N);
    P.mutPool = realisedMut > 0.5 ? 0
      : (P.mutPool || 0) * Math.pow(0.9995, gensThisCycle / FLASK.GEN_PER_CYCLE)
        + MUT.U_MUTATOR * gensThisCycle * mult;

    /* --- beneficial --- */
    var nBen = rng.poisson(rateFor(MUT.U_BEN));
    for (i = 0; i < nBen && P.genotypes.length < W.cap; i++) {
      var par = drawParent();
      var gene = pickGene(rng, null);
      var raw = rng.exp(MUT.S_MEAN);
      var s = raw * Math.exp(-MUT.EPI * Math.max(0, par.W - 1));
      if (s < 0.0015) continue;
      var ng = spawn(P, par, "beneficial", gene, s, W, rng);

      if (!par.mutator) {
        var bx = 1 + (MUT.MUTATOR_X - 1) * MUT.BEN_FRACTION;
        var pMut = bx * P.mutPool / (1 + (bx - 1) * P.mutPool);
        if (rng.next() < pMut) {
          ng.mutator = true;
          ng.tr.mutMult = par.tr.mutMult * MUT.MUTATOR_X;
          ng.muts.push({
            gene: rng.pick(MUTATOR_GENES), kind: "mutator", s: 0, gen: P.gen, day: P.day,
            changes: {}, known: false,
            note: "Mismatch repair was already broken in the cell this mutation arose in. " +
                  "Everything descended from it mutates about a hundred times faster."
          });
          /* The cryptic pool is not emptied here. Most lineages flagged
             this way still die at the next transfer, like everything else
             that has just been born; the pool is only purged when a
             hypermutable lineage has actually taken the population over. */
        }
      }
      made.push(place(ng));
    }

    /* --- deleterious, mostly doomed, occasionally along for the ride --- */
    var nDel = rng.poisson(rateFor(MUT.U_DEL));
    for (i = 0; i < nDel && P.genotypes.length + made.length < W.cap; i++) {
      var pd = drawParent();
      var gd = pickGene(rng, null);
      var sd = -rng.exp(MUT.S_DEL_MEAN);
      var nd = spawn(P, pd, "deleterious", gd, sd, W, rng);
      made.push(place(nd));
    }

    /* --- antibiotic resistance, only worth instantiating under pressure --- */
    if (env.antibiotic > 0.05) {
      var nAbx = rng.poisson(rateFor(1.4e-9));
      for (i = 0; i < nAbx && P.genotypes.length + made.length < W.cap; i++) {
        var pa = drawParent();
        if (pa.tr.abxRes > 0.9) continue;
        var ga = spawn(P, pa, "resistance", null, 0, W, rng);
        ga.tr.abxRes = clamp(pa.tr.abxRes + rng.range(0.25, 0.5), 0, 0.985);
        ga.tr.mumax *= rng.range(0.94, 0.995);      // resistance is rarely free
        ga.muts[ga.muts.length - 1] = {
          gene: rng.pick(ABX_GENES), kind: "resistance", s: 0, gen: P.gen, day: P.day,
          changes: { abxRes: ga.tr.abxRes - pa.tr.abxRes }, known: false,
          note: "Raises the concentration this lineage can grow through, at a small cost to growth rate."
        };
        made.push(place(ga));
      }
    }

    /* --- the citrate innovation ---------------------------------------
       Three stages, in the order the real thing appears to have happened:
       a potentiated background, then a rare rearrangement that expresses
       a citrate transporter in the presence of oxygen, then refinement
       that turns a barely-viable trick into a way of life. */
    var potentiatedShare = 0;
    for (i = 0; i < P.genotypes.length; i++) {
      if (P.genotypes[i].potCount >= MUT.CIT_POT_NEEDED && !P.genotypes[i].cit) {
        potentiatedShare += totalN(P.genotypes[i]);
      }
    }
    var citRate = births * mult * (
      MUT.U_CIT_BASE + MUT.U_CIT_POT * (potentiatedShare / Math.max(1, P.N))
    );
    if (rng.poisson(citRate) > 0 && P.genotypes.length + made.length < W.cap) {
      var cands = P.genotypes.filter(function (x) { return !x.cit && x.potCount >= MUT.CIT_POT_NEEDED; });
      if (!cands.length) cands = P.genotypes.filter(function (x) { return !x.cit; });
      if (cands.length) {
        var pc = cands[rng.int(0, cands.length - 1)];
        var gc = spawn(P, pc, "innovation", null, 0, W, rng);
        gc.tr.citT = 0.052;
        gc.tr.mumax *= 0.97;
        gc.cit = true; gc.citCopies = 1;
        gc.muts[gc.muts.length - 1] = {
          gene: "citT", kind: "innovation", s: 0, gen: P.gen, day: P.day,
          changes: { citT: 0.052 }, known: false,
          note: "A rearrangement has put the citrate transporter behind a promoter that fires in air. " +
                "There is twenty times more carbon in this medium than anyone has been able to reach."
        };
        made.push(place(gc));
        P.citEvents.push({ gen: P.gen, day: P.day, id: gc.id });
      }
    }
    /* refinement: amplification of the new module */
    var citShare = 0;
    for (i = 0; i < P.genotypes.length; i++) if (P.genotypes[i].cit) citShare += totalN(P.genotypes[i]);
    if (citShare > 0) {
      var nRef = rng.poisson(births * mult * MUT.U_CIT_REFINE * (citShare / Math.max(1, P.N)));
      for (i = 0; i < nRef && P.genotypes.length + made.length < W.cap; i++) {
        var cc = P.genotypes.filter(function (x) { return x.cit && x.citCopies < 9; });
        if (!cc.length) break;
        var pr = cc[rng.int(0, cc.length - 1)];
        var gr = spawn(P, pr, "refinement", null, 0, W, rng);
        gr.citCopies = pr.citCopies + 1;
        gr.tr.citT = Math.min(0.42, pr.tr.citT * rng.range(1.35, 1.85));
        gr.muts[gr.muts.length - 1] = {
          gene: "citT amplification", kind: "refinement", s: 0, gen: P.gen, day: P.day,
          changes: { citT: gr.tr.citT - pr.tr.citT }, known: false,
          note: "Another copy of the citrate module. The trick works better each time it is duplicated."
        };
        made.push(place(gr));
      }
    }

    /* Every new lineage gets its fitness measured internally, by the same
       competition the laboratory would run. Nobody is told the number. */
    for (i = 0; i < made.length; i++) {
      made[i].W = fitnessOf(made[i].tr, W.refEnv, 14);
      P.genotypes.push(made[i]);
      P.lineageIndex[made[i].id] = made[i];
      P.everBorn++;
    }
    return made.length;
  }

  /* =====================================================================
     TRANSFER
     One part in a hundred, into fresh medium. This is where drift lives.
     ===================================================================== */

  function transfer(P, W) {
    var rng = W.rng, env = W.env, np = env.patches;
    var keep = 1 / env.dilution;
    var i, p;

    /* pool, dilute, redistribute — the equivalent of scraping and
       re-spreading when the environment is structured */
    for (i = 0; i < P.genotypes.length; i++) {
      var g = P.genotypes[i];
      var tot = 0;
      for (p = 0; p < np; p++) tot += g.n[p];
      var moved = rng.binomial(Math.round(Math.min(tot, 4e9)), keep);
      if (tot > 4e9) moved = Math.round(moved * (tot / 4e9));
      for (p = 0; p < np; p++) g.n[p] = 0;
      if (moved > 0) {
        var left = moved;
        for (p = 0; p < np - 1; p++) {
          var take = rng.binomial(Math.min(left, 4e8), 1 / (np - p));
          g.n[p] = take; left -= take;
        }
        g.n[np - 1] = left;
      }
    }

    /* extinction and pruning */
    var alive = [];
    for (i = 0; i < P.genotypes.length; i++) {
      var gg = P.genotypes[i];
      if (totalN(gg) >= 1) alive.push(gg);
      else { gg.extinct = P.gen; P.everLost++; }
    }
    /* if the flask is carrying more lineages than the model will track,
       the rarest go first — which is also what happens to them in reality */
    if (alive.length > W.cap) {
      alive.sort(function (a, b) { return totalN(b) - totalN(a); });
      for (i = W.cap; i < alive.length; i++) { alive[i].extinct = P.gen; P.everLost++; }
      alive.length = W.cap;
    }
    P.genotypes = alive;
  }

  function totalN(g) {
    var t = 0;
    for (var p = 0; p < g.n.length; p++) t += g.n[p];
    return t;
  }

  /* =====================================================================
     THE WORLD
     ===================================================================== */

  function makeAncestorGenotype(index, patches) {
    return {
      id: gidSeq++, pop: index, parent: null, born: 0, bornDay: 0,
      tr: copyTr(ANCESTOR),
      n: new Array(patches).fill(0),
      muts: [], nNeutral: 0,
      mutator: false, cit: false, citCopies: 0, potCount: 0,
      W: 1, Wknown: null, peak: 1, extinct: null,
      name: "ancestor", depth: 0, colour: "#8a9099"
    };
  }

  function newWorld(opts) {
    opts = opts || {};
    var env = {};
    for (var k in ENV_DEFAULT) env[k] = ENV_DEFAULT[k];
    if (opts.env) for (var k2 in opts.env) env[k2] = opts.env[k2];

    var refEnv = {};
    for (var k3 in ENV_DEFAULT) refEnv[k3] = ENV_DEFAULT[k3];
    refEnv.patches = 1;

    var W = {
      seed: opts.seed || 20260728,
      rng: new RNG(opts.seed || 20260728),
      env: env,
      refEnv: refEnv,
      sens: null,
      cap: opts.cap || 130,
      steps: FLASK.STEPS_FINE,
      day: 0, gen: 0,
      pops: [],
      lab: { hours: LAB.START_HOURS, spent: 0, log: [] },
      events: [],
      notes: [],
      target: opts.target || 50000,
      mode: opts.mode || "historical",
      sandbox: !!opts.sandbox,
      paused: false,
      jobs: []
    };
    W.sens = sensitivity(refEnv);

    var nPops = opts.nPops || FLASK.N_POPS;
    for (var i = 0; i < nPops; i++) {
      var anc = makeAncestorGenotype(i, env.patches);
      var N0 = FLASK.VOLUME * 5e5;
      for (var p = 0; p < env.patches; p++) anc.n[p] = N0 / env.patches;
      var P = {
        index: i,
        name: POP_NAMES[i] || ("Pop " + (i + 1)),
        marker: i < 6 ? "Ara-" : "Ara+",
        genotypes: [anc],
        lineageIndex: {},
        ancestorId: anc.id,
        gen: 0, day: 0, N: N0, peakN: N0,
        phage: env.phage ? env.phageStart || PHAGE.START : 0,
        phageRange: 0,
        history: [],
        samples: [],
        snapshots: [],
        assays: [],
        sequenced: [],
        citEvents: [],
        events: [],
        everBorn: 1, everLost: 0,
        extinctAt: null,
        glucoseGoneAt: null,
        cycleInfo: null,
        nameSeq: 0
      };
      P.lineageIndex[anc.id] = anc;
      W.pops.push(P);
    }
    freezeAll(W, "founding");
    sample(W);
    return W;
  }

  /* =====================================================================
     ONE SIMULATED DAY
     ===================================================================== */

  function stepDay(W) {
    var env = W.env;
    var steps = W.steps;

    /* environmental drift, if the player asked for a moving target */
    if (env.drift === "gradual" && env.driftTarget) {
      for (var t in env.driftTarget) {
        env[t] = env[t] + (env.driftTarget[t] - env[t]) * env.driftRate;
      }
    } else if (env.drift === "abrupt" && env.driftTarget && env.driftEvery) {
      if (W.day > 0 && W.day % env.driftEvery === 0) {
        for (var t2 in env.driftTarget) {
          var a = env[t2], b = env.driftTarget[t2];
          env[t2] = b; env.driftTarget[t2] = a;      // flip-flop between two worlds
        }
        pushEvent(W, null, "The conditions have been switched.", "environment");
      }
    }

    for (var i = 0; i < W.pops.length; i++) {
      var P = W.pops[i];
      if (P.extinctAt != null) continue;

      if (W.day > 0) transfer(P, W);

      var before = 0;
      for (var j = 0; j < P.genotypes.length; j++) before += totalN(P.genotypes[j]);
      if (before < 1) {
        P.extinctAt = P.gen;
        pushEvent(W, i, P.name + " has been lost. Nothing survived the last transfer.", "extinction");
        continue;
      }

      var info = cycle(P.genotypes, env, steps, { phage: P.phage, phageRange: P.phageRange });
      P.cycleInfo = info;
      P.phage = info.phage;
      P.N = info.finalN;
      P.peakN = Math.max(P.peakN, info.finalN);
      P.glucoseGoneAt = info.glucoseGoneAt;

      var grown = Math.log2(Math.max(1, info.finalN) / Math.max(1, before));
      P.gen += Math.max(0, grown);
      P.day = W.day + 1;

      var births = Math.max(0, info.finalN - before);
      mutateStep(P, W, births);

      /* phage can widen its host range once resistance is common */
      if (P.phage > 0) {
        var resShare = 0;
        for (var q = 0; q < P.genotypes.length; q++) resShare += totalN(P.genotypes[q]) * P.genotypes[q].tr.phageRes;
        resShare /= Math.max(1, P.N);
        if (resShare > 0.6 && P.phageRange < 0.9) {
          if (W.rng.next() < PHAGE.HOST_RANGE_U * P.phage) {
            P.phageRange = Math.min(0.9, P.phageRange + 0.35);
            pushEvent(W, i, "The phage in " + P.name + " has broadened its host range.", "phage");
          }
        }
      }

      naming(P);
    }

    W.day++;
    W.gen = W.pops.reduce(function (a, p) { return a + p.gen; }, 0) / W.pops.length;

    /* laboratory time accrues with the calendar */
    W.lab.hours = Math.min(LAB.CAP, W.lab.hours + LAB.HOURS_PER_DAY);

    if (W.day % 4 === 0) sample(W);
    checkFreezing(W);
    if (typeof Events !== "undefined") Events.scan(W);
    return W;
  }

  /* Lineage naming: a clade earns a letter the first time it is common
     enough that a laboratory would notice it on a plate. */
  function naming(P) {
    var LET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (var i = 0; i < P.genotypes.length; i++) {
      var g = P.genotypes[i];
      var f = totalN(g) / Math.max(1, P.N);
      if (f > g.peak) g.peak = f;
      if (!g.name && f > 0.05) {
        var anc = P.lineageIndex[g.parent];
        var base = null;
        while (anc && !base) { if (anc.name && anc.name !== "ancestor") base = anc.name; anc = P.lineageIndex[anc.parent]; }
        if (!base) { g.name = LET[P.nameSeq % 26] + (P.nameSeq >= 26 ? String(Math.floor(P.nameSeq / 26)) : ""); P.nameSeq++; }
        else {
          var kids = 1;
          for (var j = 0; j < P.genotypes.length; j++) if (P.genotypes[j].name && P.genotypes[j].name.indexOf(base + ".") === 0) kids++;
          g.name = base + "." + kids;
        }
        if (!g.colour || g.colour === "#8a9099") {
          g.colour = LINEAGE_COLOURS[(P.nameSeq + g.depth) % LINEAGE_COLOURS.length];
        }
      }
    }
  }

  /* =====================================================================
     SAMPLING AND THE FROZEN RECORD
     ===================================================================== */

  function sample(W) {
    for (var i = 0; i < W.pops.length; i++) {
      var P = W.pops[i];
      var N = Math.max(1, P.N);
      var trueW = 0, div = 0, mutShare = 0, citShare = 0, sizeMean = 0, detect = {};
      for (var j = 0; j < P.genotypes.length; j++) {
        var g = P.genotypes[j], f = totalN(g) / N;
        trueW += f * g.W;
        div += f * f;
        sizeMean += f * g.tr.size;
        if (g.mutator) mutShare += f;
        if (g.cit) citShare += f;
        if (f >= 0.02) detect[g.id] = Math.round(f * 1000) / 1000;
      }
      P.history.push({
        day: P.day, gen: Math.round(P.gen), N: P.N, W: trueW,
        div: 1 / Math.max(1e-9, div), mut: mutShare, cit: citShare,
        size: sizeMean, phage: P.phage, lineages: P.genotypes.length
      });
      P.samples.push({ gen: Math.round(P.gen), f: detect });
      if (P.history.length > 4000) { P.history.splice(0, 1000); }
      if (P.samples.length > 4000) { P.samples.splice(0, 1000); }
    }
  }

  function checkFreezing(W) {
    for (var i = 0; i < W.pops.length; i++) {
      var P = W.pops[i];
      var due = Math.floor(P.gen / FREEZE_EVERY_GEN);
      var have = P.snapshots.length ? P.snapshots[P.snapshots.length - 1].tick : 0;
      if (due > have) freezePop(W, P, "scheduled", due);
    }
  }

  function freezePop(W, P, why, tick) {
    var gs = [];
    var N = Math.max(1, P.N);
    for (var j = 0; j < P.genotypes.length; j++) {
      var g = P.genotypes[j], f = totalN(g) / N;
      if (f < 0.001) continue;
      gs.push({
        id: g.id, name: g.name, tr: copyTr(g.tr), f: f, W: g.W,
        muts: g.muts.slice(), nNeutral: g.nNeutral,
        mutator: g.mutator, cit: g.cit, citCopies: g.citCopies,
        potCount: g.potCount, colour: g.colour
      });
    }
    P.snapshots.push({
      tick: tick != null ? tick : Math.floor(P.gen / FREEZE_EVERY_GEN),
      gen: Math.round(P.gen), day: P.day, why: why,
      genotypes: gs, N: P.N,
      meanW: gs.reduce(function (a, x) { return a + x.f * x.W; }, 0) / Math.max(1e-9, gs.reduce(function (a, x) { return a + x.f; }, 0))
    });
  }

  function freezeAll(W, why) {
    for (var i = 0; i < W.pops.length; i++) freezePop(W, W.pops[i], why, 0);
  }

  /* =====================================================================
     THE LABORATORY
     Everything here costs bench hours and everything here returns a
     measurement with error on it, because that is what a measurement is.
     ===================================================================== */

  function canAfford(W, what) { return W.lab.hours >= LAB.COSTS[what]; }

  function charge(W, what, note) {
    var c = LAB.COSTS[what];
    if (W.lab.hours < c) return false;
    W.lab.hours -= c;
    W.lab.spent += c;
    W.lab.log.push({ day: W.day, what: what, cost: c, note: note || "" });
    return true;
  }

  /* Mean trait vector of a population sample, weighted by frequency. Used
     when the player assays the whole population rather than a clone. */
  function popMix(P) {
    var N = Math.max(1, P.N), out = [];
    for (var j = 0; j < P.genotypes.length; j++) {
      var g = P.genotypes[j], f = totalN(g) / N;
      if (f > 0.002) out.push({ tr: g.tr, f: f, g: g });
    }
    var tot = out.reduce(function (a, x) { return a + x.f; }, 0);
    for (var i = 0; i < out.length; i++) out[i].f /= tot;
    return out;
  }

  /* A competition assay against a frozen reference. Three replicates, with
     the sort of scatter a real plate count carries. */
  function runAssay(W, popIdx, refTick, ratio, clone) {
    var P = W.pops[popIdx];
    var kind = ratio === 0.5 ? "assay" : "assayFreq";
    if (!charge(W, kind, P.name)) return null;

    var refSnap = P.snapshots.find(function (s) { return s.tick === refTick; }) || P.snapshots[0];
    var refTr = refSnap.genotypes.length ? refSnap.genotypes.reduce(function (a, x) { return x.f > a.f ? x : a; }).tr : ANCESTOR;

    var mix = popMix(P);
    var reps = [], i;
    for (i = 0; i < 3; i++) {
      var w;
      if (clone) {
        var pick = mix[Math.min(mix.length - 1, Math.floor(W.rng.next() * mix.length))];
        w = compete(pick.tr, refTr, W.refEnv, ratio, 24);
      } else {
        /* whole-population assay: every genotype competes at once */
        var groups = [];
        var N0 = FLASK.VOLUME * 5e5;
        for (var j = 0; j < mix.length; j++) groups.push({ tr: mix[j].tr, n: [N0 * ratio * mix[j].f] });
        var ref = { tr: refTr, n: [N0 * (1 - ratio)] };
        groups.push(ref);
        var start = N0 * ratio, startR = N0 * (1 - ratio);
        cycle(groups, W.refEnv, 24, {});
        var endE = 0;
        for (var q = 0; q < groups.length - 1; q++) endE += groups[q].n[0];
        var mE = Math.log(Math.max(1e-9, endE) / start);
        var mR = Math.log(Math.max(1e-9, ref.n[0]) / startR);
        w = mR > 0.001 ? mE / mR : 1;
      }
      reps.push(w * (1 + W.rng.normal(0, 0.011)));
    }
    var mean = reps.reduce(function (a, b) { return a + b; }, 0) / reps.length;
    var sd = Math.sqrt(reps.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (reps.length - 1));
    var rec = {
      day: W.day, gen: Math.round(P.gen), pop: popIdx, ref: refTick, refGen: refSnap.gen,
      ratio: ratio, clone: !!clone, reps: reps, W: mean, sem: sd / Math.sqrt(reps.length)
    };
    P.assays.push(rec);
    return rec;
  }

  /* Sequencing. Reveals what is actually in a clone: the drivers, the
     passengers, and the number of each. */
  function sequence(W, popIdx, whole) {
    var P = W.pops[popIdx];
    if (!charge(W, whole ? "sequencePop" : "sequence", P.name)) return null;
    var mix = popMix(P);
    var out = [];
    if (whole) {
      for (var i = 0; i < mix.length; i++) if (mix[i].f >= 0.05) out.push(revealClone(mix[i].g, mix[i].f, W));
    } else {
      var r = W.rng.next(), acc = 0, chosen = mix[0];
      for (var j = 0; j < mix.length; j++) { acc += mix[j].f; if (acc >= r) { chosen = mix[j]; break; } }
      out.push(revealClone(chosen.g, chosen.f, W));
    }
    var rec = { day: W.day, gen: Math.round(P.gen), pop: popIdx, whole: !!whole, clones: out };
    P.sequenced.push(rec);
    return rec;
  }

  function revealClone(g, f, W) {
    for (var i = 0; i < g.muts.length; i++) g.muts[i].known = true;
    var passengers = [];
    var rng = W.rng;
    for (var j = 0; j < Math.min(g.nNeutral, 60); j++) passengers.push(rng.pick(PASSENGER_GENES));
    return {
      id: g.id, name: g.name || ("clone " + g.id), f: f,
      drivers: g.muts.map(function (m) {
        return { gene: m.gene, kind: m.kind, gen: m.gen, note: m.note, changes: m.changes };
      }),
      passengers: passengers, nPassengers: g.nNeutral,
      mutator: g.mutator, cit: g.cit, citCopies: g.citCopies
    };
  }

  /* Plating: cheap, and tells you cell size, density and whether the
     population has split into visibly different colony types. */
  function plate(W, popIdx) {
    var P = W.pops[popIdx];
    if (!charge(W, "plate", P.name)) return null;
    var mix = popMix(P);
    var types = {};
    for (var i = 0; i < mix.length; i++) {
      var g = mix[i].g;
      var key = g.cit ? "large, matte" : (g.tr.size > 1.55 ? "large" : (g.tr.aceMu > ANCESTOR.aceMu * 1.5 ? "small" : "typical"));
      types[key] = (types[key] || 0) + mix[i].f;
    }
    var rec = {
      day: W.day, gen: Math.round(P.gen), pop: popIdx,
      density: P.N / FLASK.VOLUME, size: mix.reduce(function (a, x) { return a + x.f * x.tr.size; }, 0),
      types: types
    };
    P.events.push({ gen: Math.round(P.gen), text: "Plated. " + Object.keys(types).length + " colony type" +
      (Object.keys(types).length === 1 ? "" : "s") + " visible.", kind: "lab" });
    return rec;
  }

  /* Reciprocal invasion. The test that distinguishes a lineage on its way
     to fixation from a stable coexistence. */
  function invasion(W, popIdx, idA, idB) {
    var P = W.pops[popIdx];
    if (!charge(W, "invade", P.name)) return null;
    var A = P.lineageIndex[idA], B = P.lineageIndex[idB];
    if (!A || !B) return null;
    var aRare = compete(A.tr, B.tr, W.refEnv, 0.05, 26);
    var bRare = compete(B.tr, A.tr, W.refEnv, 0.05, 26);
    var verdict = (aRare > 1.01 && bRare > 1.01) ? "stable coexistence"
                : (aRare > 1.01 && bRare <= 1.01) ? (A.name || idA) + " excludes " + (B.name || idB)
                : (bRare > 1.01 && aRare <= 1.01) ? (B.name || idB) + " excludes " + (A.name || idA)
                : "neither invades; the outcome depends on where they start";
    return { a: A, b: B, aRare: aRare, bRare: bRare, verdict: verdict };
  }

  /* =====================================================================
     REPLAY
     Blount's experiment: thaw an archived timepoint, restart it many
     times, and see how often history repeats. Run as a job so the browser
     stays responsive; a replay of twenty populations for a thousand
     generations is a real amount of computing.
     ===================================================================== */

  function replayStart(W, popIdx, tick, nRep, gens) {
    var P = W.pops[popIdx];
    if (!charge(W, "replay", P.name + " from generation " + (tick * FREEZE_EVERY_GEN))) return null;
    var snap = P.snapshots.find(function (s) { return s.tick === tick; });
    if (!snap) return null;

    var env = {};
    for (var k in W.refEnv) env[k] = W.refEnv[k];
    env.patches = 1;

    var reps = [];
    for (var i = 0; i < nRep; i++) {
      var gs = [];
      var N0 = FLASK.VOLUME * 5e5;
      for (var j = 0; j < snap.genotypes.length; j++) {
        var sg = snap.genotypes[j];
        gs.push({
          id: gidSeq++, pop: -1, parent: null, born: 0, bornDay: 0,
          tr: copyTr(sg.tr), n: [N0 * sg.f],
          muts: sg.muts.slice(), nNeutral: sg.nNeutral,
          mutator: sg.mutator, cit: sg.cit, citCopies: sg.citCopies,
          potCount: sg.potCount, W: sg.W, Wknown: null,
          peak: sg.f, extinct: null, name: sg.name, depth: 0, colour: sg.colour
        });
      }
      reps.push({
        index: i, genotypes: gs, gen: 0, day: 0, N: N0,
        lineageIndex: {}, citEvents: [], everBorn: gs.length, everLost: 0,
        phage: 0, phageRange: 0, nameSeq: 0, events: [], snapshots: [], history: [], samples: []
      });
      for (var q = 0; q < gs.length; q++) reps[i].lineageIndex[gs[q].id] = gs[q];
    }

    var job = {
      kind: "replay", pop: popIdx, tick: tick, fromGen: snap.gen,
      reps: reps, targetGen: gens, done: 0, cursor: 0,
      results: reps.map(function () { return { cit: false, citGen: null, W: 1 }; }),
      finished: false,
      label: "Replay of " + P.name + " from generation " + snap.gen
    };
    W.jobs.push(job);
    return job;
  }

  /* Advance a replay job by a budget of simulated days. Called from the
     run loop so the interface never blocks for long. */
  function jobStep(W, budgetDays) {
    if (!W.jobs.length) return;
    var job = W.jobs[0];
    if (job.finished) { W.jobs.shift(); return; }

    var subW = {
      rng: W.rng, env: W.refEnv, refEnv: W.refEnv, sens: W.sens,
      cap: 45, day: 0, gen: 0
    };
    var spent = 0;
    while (spent < budgetDays && !job.finished) {
      var r = job.reps[job.cursor];
      if (r.gen >= job.targetGen) {
        job.cursor++;
        if (job.cursor >= job.reps.length) { job.finished = true; break; }
        continue;
      }
      subW.day = r.day;
      var before = 0, i;
      for (i = 0; i < r.genotypes.length; i++) before += totalN(r.genotypes[i]);
      if (r.day > 0) transfer(r, subW);
      var b2 = 0;
      for (i = 0; i < r.genotypes.length; i++) b2 += totalN(r.genotypes[i]);
      if (b2 < 1) { r.gen = job.targetGen; continue; }
      var info = cycle(r.genotypes, W.refEnv, FLASK.STEPS_COARSE, {});
      r.N = info.finalN;
      r.gen += Math.max(0, Math.log2(Math.max(1, info.finalN) / Math.max(1, b2)));
      r.day++;
      mutateStep(r, subW, Math.max(0, info.finalN - b2));
      if (!job.results[r.index].cit) {
        for (i = 0; i < r.genotypes.length; i++) {
          if (r.genotypes[i].cit) {
            job.results[r.index].cit = true;
            job.results[r.index].citGen = Math.round(job.fromGen + r.gen);
            break;
          }
        }
      }
      spent++;
      job.done = (job.cursor + r.gen / job.targetGen) / job.reps.length;
    }
    if (job.finished) {
      var nCit = job.results.filter(function (x) { return x.cit; }).length;
      job.summary = nCit + " of " + job.reps.length + " replays produced a citrate user";
      pushEvent(W, job.pop, job.label + ": " + job.summary + ".", "replay");
      W.jobs.shift();
      W.completedJobs = W.completedJobs || [];
      W.completedJobs.push(job);
    }
  }

  /* =====================================================================
     REPORTING HELPERS
     ===================================================================== */

  function pushEvent(W, popIdx, text, kind, big) {
    var e = { day: W.day, gen: Math.round(W.gen), pop: popIdx, text: text,
              kind: kind || "note", big: !!big, seen: false };
    W.events.push(e);
    if (popIdx != null && W.pops[popIdx]) {
      W.pops[popIdx].events.push({ gen: Math.round(W.pops[popIdx].gen), text: text, kind: kind });
    }
    if (W.events.length > 900) W.events.splice(0, 300);
    return e;
  }

  function dominant(P) {
    var best = null, bn = -1;
    for (var i = 0; i < P.genotypes.length; i++) {
      var n = totalN(P.genotypes[i]);
      if (n > bn) { bn = n; best = P.genotypes[i]; }
    }
    return best;
  }

  function diversity(P) {
    var N = Math.max(1, P.N), d = 0;
    for (var i = 0; i < P.genotypes.length; i++) {
      var f = totalN(P.genotypes[i]) / N; d += f * f;
    }
    return 1 / Math.max(1e-9, d);
  }

  function frequencies(P) {
    var N = Math.max(1, P.N), out = [];
    for (var i = 0; i < P.genotypes.length; i++) {
      out.push({ g: P.genotypes[i], f: totalN(P.genotypes[i]) / N });
    }
    out.sort(function (a, b) { return b.f - a.f; });
    return out;
  }

  /* Which genes have been hit, in which populations, among what has been
     sequenced. The parallelism matrix is built only from what the player
     has actually paid to look at. */
  function parallelism(W) {
    var rows = {};
    for (var i = 0; i < W.pops.length; i++) {
      var P = W.pops[i];
      for (var j = 0; j < P.genotypes.length; j++) {
        var g = P.genotypes[j];
        for (var m = 0; m < g.muts.length; m++) {
          var mu = g.muts[m];
          if (!mu.known) continue;
          if (!rows[mu.gene]) rows[mu.gene] = { gene: mu.gene, pops: {}, kind: mu.kind, note: mu.note };
          var f = totalN(g) / Math.max(1, P.N);
          rows[mu.gene].pops[i] = Math.max(rows[mu.gene].pops[i] || 0, f);
        }
      }
    }
    var list = Object.keys(rows).map(function (k) { return rows[k]; });
    list.sort(function (a, b) { return Object.keys(b.pops).length - Object.keys(a.pops).length; });
    return list;
  }

  /* The published fit to the LTEE trajectory, for comparison on the chart.
     w = (bt + 1)^a, Wiser, Ribeck and Lenski 2013. */
  function powerLaw(gen) { return Math.pow(5.24e-4 * gen + 1, 0.0937) * 1.32 - 0.32; }

  return {
    newWorld: newWorld, stepDay: stepDay, cycle: cycle, compete: compete,
    fitnessOf: fitnessOf, sensitivity: sensitivity, totalN: totalN,
    runAssay: runAssay, sequence: sequence, plate: plate, invasion: invasion,
    replayStart: replayStart, jobStep: jobStep, freezePop: freezePop,
    canAfford: canAfford, charge: charge, popMix: popMix,
    dominant: dominant, diversity: diversity, frequencies: frequencies,
    parallelism: parallelism, powerLaw: powerLaw, pushEvent: pushEvent,
    copyTr: copyTr, TRAITS: TRAITS, envFactors: envFactors, revealClone: revealClone
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Sim;
