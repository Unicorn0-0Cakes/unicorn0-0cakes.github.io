"use strict";
/* =====================================================================
   EVOLUTION IN A FLASK — events.js

   What the bench notices on its own.

   The rule this file obeys: you are told only what somebody standing in
   front of the incubator could see without doing an experiment. A flask
   that has gone unusually cloudy is visible. A flask that has quietly
   become forty per cent fitter is not. Everything in the second category
   has to be measured, and measuring costs bench hours.

   The one exception is the milestone notices, which are the calendar
   talking rather than the biology.
   ===================================================================== */

var Events = (function () {

  var MILESTONES = [500, 1000, 2000, 5000, 10000, 15000, 20000, 25000,
                    30000, 35000, 40000, 45000, 50000, 60000, 75000];

  /* Guidance. Each fires once, when its condition first holds. These are
     prompts, not instructions; nothing in the simulation depends on
     following them. */
  var PROMPTS = [
    { id: "first-assay",
      when: function (W) { return W.day > 60 && !W.pops.some(function (P) { return P.assays.length; }); },
      text: "Two months in and nothing has been measured. The populations may well have changed, " +
            "but a change you have not measured is not a result. The freezer already holds a sample " +
            "of the founding strain; a competition against it is three bench hours." },
    { id: "first-freeze",
      when: function (W) { return W.pops[0].snapshots.length >= 2; },
      text: "The first scheduled samples are in the freezer. From here on, every population has a " +
            "past you can thaw and argue with. This is the part of the design that makes everything " +
            "else possible." },
    { id: "diverged",
      when: function (W) {
        var ws = W.pops.map(function (P) { return P.history.length ? P.history[P.history.length - 1].W : 1; });
        return Math.max.apply(null, ws) - Math.min.apply(null, ws) > 0.22 && W.day > 200;
      },
      text: "The twelve flasks are no longer interchangeable. They started identical and have been " +
            "treated identically, and they are now measurably different from one another. Whether " +
            "that difference is repeatable or accidental is a question you can only answer from the " +
            "freezer." },
    { id: "sequence-hint",
      when: function (W) { return W.day > 400 && !W.pops.some(function (P) { return P.sequenced.length; }); },
      text: "Nothing has been sequenced yet. Fitness tells you that something changed; only the " +
            "genome tells you whether the same thing changed twice in two flasks that never met." },
    { id: "parallel",
      when: function (W) {
        var par = Sim.parallelism(W);
        return par.some(function (r) { return Object.keys(r.pops).length >= 3; });
      },
      text: "The same gene has now been found mutated in three separate populations. They have no " +
            "contact with one another and never have. Either the medium is asking all of them the " +
            "same question, or you have contaminated something." },
    { id: "replay-hint",
      when: function (W) { return W.pops.some(function (P) { return P.snapshots.length > 10; }) && !(W.completedJobs || []).length; },
      text: "There is enough archive now to run a replay: thaw one timepoint, restart it twenty " +
            "times, and see how often the same thing happens. It is the only experiment that can " +
            "separate an adaptation that was bound to appear from one that needed a particular " +
            "history first." }
  ];

  function median(a) {
    var b = a.slice().sort(function (x, y) { return x - y; });
    return b[Math.floor(b.length / 2)];
  }

  function scan(W) {
    W._fired = W._fired || {};
    var i, P;

    /* ---- calendar milestones ---- */
    var g = Math.round(W.gen);
    for (i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      if (g >= m && !W._fired["ms" + m]) {
        W._fired["ms" + m] = true;
        Sim.pushEvent(W, null, "Generation " + m.toLocaleString() + ". Day " + W.day.toLocaleString() +
          " of the experiment.", "milestone");
      }
    }

    /* ---- turbidity: the one thing that gives itself away ----
       A flask that reaches a substantially higher cell density than its
       neighbours is visible from across the room. This is how the
       citrate population announced itself: it simply looked wrong. */
    var dens = W.pops.map(function (p) { return p.N; });
    var med = Math.max(1, median(dens));
    for (i = 0; i < W.pops.length; i++) {
      P = W.pops[i];
      if (P.extinctAt != null) continue;
      var ratio = P.N / med;
      P._turbRun = ratio > 1.7 ? (P._turbRun || 0) + 1 : 0;
      if (P._turbRun === 12 && !W._fired["turb" + i]) {
        W._fired["turb" + i] = true;
        Sim.pushEvent(W, i,
          P.name + " has been noticeably more turbid than the rest of the bench for a fortnight. " +
          "It is reaching roughly " + ratio.toFixed(1) + " times the cell density of a typical flask. " +
          "Nothing about the medium has changed.", "observation", true);
      }
      P._crashRun = ratio < 0.45 ? (P._crashRun || 0) + 1 : 0;
      if (P._crashRun === 10 && !W._fired["crash" + i]) {
        W._fired["crash" + i] = true;
        Sim.pushEvent(W, i, P.name + " has been running thin for over a week — well under half the " +
          "density of the others.", "observation", true);
      }
    }

    /* ---- phage ---- */
    for (i = 0; i < W.pops.length; i++) {
      P = W.pops[i];
      if (P.phage > 1e9 && !W._fired["ph" + i]) {
        W._fired["ph" + i] = true;
        Sim.pushEvent(W, i, P.name + " has cleared — the culture went from turbid to almost " +
          "transparent overnight. Phage.", "phage", true);
      }
    }

    /* ---- prompts ---- */
    for (i = 0; i < PROMPTS.length; i++) {
      var pr = PROMPTS[i];
      if (W._fired["p" + pr.id]) continue;
      var ok = false;
      try { ok = pr.when(W); } catch (e) { ok = false; }
      if (ok) {
        W._fired["p" + pr.id] = true;
        W.notes.push({ day: W.day, gen: Math.round(W.gen), text: pr.text });
        Sim.pushEvent(W, null, pr.text, "note", true);
      }
    }
  }

  /* Called by the interface after a measurement, to say in words what the
     numbers mean — without saying anything the numbers do not support. */
  function readAssay(rec, P) {
    var d = rec.W - 1;
    var resolvable = Math.abs(d) > 2 * rec.sem;
    if (!resolvable) {
      return "The three replicates do not separate this population from the reference. " +
             "Whatever the difference is, this assay cannot see it.";
    }
    var pct = (d * 100).toFixed(1);
    var s = (d > 0 ? "Grew " + pct + " per cent faster than the reference, per day, "
                   : "Grew " + Math.abs(pct) + " per cent slower than the reference, per day, ") +
            "with the replicates agreeing to about " + (rec.sem * 100).toFixed(1) + " per cent.";
    if (rec.ratio !== 0.5) {
      s += " Started at " + Math.round(rec.ratio * 100) + " per cent, so this is fitness when " +
           (rec.ratio < 0.5 ? "rare" : "common") + ".";
    }
    return s;
  }

  function readInvasion(r) {
    var s = "";
    if (r.aRare > 1.01 && r.bRare > 1.01) {
      s = "Each one grows when it is rare and loses ground when it is common. Neither can exclude " +
          "the other, so the two of them will sit together indefinitely. This is not one lineage on " +
          "its way to fixation; it is an ecosystem with two members.";
    } else if (r.aRare > 1.01 || r.bRare > 1.01) {
      s = "One of them invades and the other does not. Given enough transfers this ends with a " +
          "single lineage.";
    } else {
      s = "Neither invades from rare. Whichever happens to be common stays common, which means the " +
          "outcome was settled by an accident somewhere upstream.";
    }
    return s;
  }

  return { scan: scan, readAssay: readAssay, readInvasion: readInvasion, PROMPTS: PROMPTS };
})();
