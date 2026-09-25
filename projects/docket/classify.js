/* =====================================================================
   DOCKET — CLASSIFIER
   ---------------------------------------------------------------------
   Turns one line of brain dump into a task draft: which quadrant, how
   sure, a due date if the line names one, an effort guess and any
   #tags. Deterministic, local, and short enough to read in one sitting
   — the rules below ARE the documentation of how sorting works.

   Nothing here leaves the page. There is no model and no network call.

   Two scores are kept, one per Eisenhower axis:
     u  urgency    — does this need attention soon?
     i  importance — does this move real work forward?
   plus two overrides that read more like intent than weight:
     low    "someday / if I have time / optional" — pushes to Delete
     route  "email X / ask X / forward / loop in" — a routing job,
            which is what the Automate quadrant is for

   A task is flagged for Review when the evidence is thin or pulls both
   ways. Review never blocks anything; it is a small marker saying
   "I guessed — check me".

   Works in the browser (window.DocketClassify) and in Node
   (module.exports), so the rules can carry a regression suite.
   ===================================================================== */
(function (root) {
  "use strict";

  var QUADS = ["do", "schedule", "delegate", "later"];

  /* ---- signal tables: [pattern, weight] ---------------------------- */
  var URGENT = [
    [/\b(asap|a\.s\.a\.p|urgent|urgently|immediately|right away|right now)\b/, 3],
    [/\b(outage|broken|blocking|blocker|blocked|emergency|critical|incident|sev ?[12]|p[01])\b/, 3],
    [/\b(is|are|went|goes|still) down\b|\bdown again\b/, 3],
    [/\b(overdue|past due|late)\b/, 3],
    [/\b(today|tonight|eod|end of (the )?day|this (morning|afternoon|evening)|by noon)\b/, 3],
    [/\bdeadline\b/, 2],
    [/\b(due|by)\b/, 1],
    [/\b(tomorrow|tmrw|tmr)\b/, 1],
    [/\bthis week\b/, 1],
    [/\b(meeting|standup|stand-up|call with|interview)\b/, 1],
    [/\b(follow[- ]?up|reply|respond|get back to|waiting on|chase)\b/, 1],
    [/\b(finish|wrap up|submit|ship|send off)\b/, 1],
    [/\b(report|deliverable|issue|problem|error|failing|failed)\b/, 1],
    [/\b(production|prod|live site|customers? (are|is) )\b/, 1],
    [/\b(manager|boss|director|vp|leadership)\b/, 1]
  ];

  var IMPORTANT = [
    [/\b(report|deliverable|deadline|proposal|presentation|deck)\b/, 2],
    [/\b(production|prod|outage|incident|critical|security)\b/, 2],
    [/\b(client|customer|contract|budget|invoice|payroll|compliance|audit)\b/, 2],
    [/\b(manager|boss|director|leadership|review with)\b/, 1],
    [/\b(fix|issue|bug|integration|migration|release|launch|deploy)\b/, 1],
    [/\b(plan|strategy|roadmap|prepare|prep|draft|write|design|build)\b/, 1],
    [/\b(review|documentation|docs|training|onboarding|hiring|interview)\b/, 1]
  ];

  var LOW = [
    [/\b(if i have time|when i have time|if time|time permitting|when i get a chance)\b/, 3],
    [/\b(someday|some day|eventually|one day|at some point|no rush|whenever)\b/, 3],
    [/\b(optional|nice to have|maybe|might|idea:?|consider)\b/, 2],
    [/\b(clean ?up|tidy|organi[sz]e|declutter|reorgani[sz]e|browse|skim|look at|read up)\b/, 1]
  ];

  /* Routing: the verb says "hand this to someone / ping someone". */
  var ROUTE = [
    [/^(email|e-mail|message|msg|ping|slack|text|call|ask|remind|tell|forward|fwd|cc|loop in|check with|book|reschedule|schedule a|set up a meeting|delegate|assign|hand off|route|send)\b/, 2],
    [/\b(delegate|hand off|handoff|assign to|forward to|loop in|route to|have \w+ (do|handle|take))\b/, 2]
  ];

  var QUICK = /\b(quick|quickly|5 ?min|five minutes|2 ?min|small|tiny|ping|reply|respond|forward|fwd|book|remind|rsvp)\b/;
  var DEEP = /\b(deep|draft|write|research|analy[sz]e|build|design|plan|strategy|migrat\w*|refactor|report|presentation|proposal|roadmap|overhaul|investigate)\b/;

  function score(table, s) {
    var total = 0, hits = [];
    for (var k = 0; k < table.length; k++) {
      var m = s.match(table[k][0]);
      if (m) { total += table[k][1]; hits.push(m[0]); }
    }
    return { total: total, hits: hits };
  }

  /* ---- dates, always local, always YYYY-MM-DD ------------------------ */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }

  var DAYS = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2,
               wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
               fri: 5, friday: 5, sat: 6, saturday: 6 };

  function parseDue(s, now) {
    var m;
    if (/\b(today|tonight|eod|end of (the )?day|this (morning|afternoon|evening)|by noon)\b/.test(s)) return iso(now);
    if (/\b(tomorrow|tmrw|tmr)\b/.test(s)) return iso(addDays(now, 1));
    if ((m = s.match(/\bin (\d{1,2}) days?\b/))) return iso(addDays(now, +m[1]));
    if ((m = s.match(/\b(next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|weds?|thu(?:rs?)?|fri|sat)\b/))) {
      /* "sat" and "sun" are ordinary words too; only trust the short
         forms when a date-ish word sits in front of them. */
      var word = m[2];
      if (word.length <= 4 && !/\b(by|on|due|before|until|next|this)\s+\w+$/.test(s.slice(0, m.index + m[0].length))) {
        /* fall through to m/d parsing */
      } else {
        /* The coming occurrence. "Friday" said on a Friday means today;
           "next Friday" said on a Friday means a week out. */
        var diff = (DAYS[word] - now.getDay() + 7) % 7;
        if (m[1] && diff === 0) diff = 7;
        return iso(addDays(now, diff));
      }
    }
    if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
      var mo = +m[1] - 1, da = +m[2], yr = m[3] ? +m[3] : now.getFullYear();
      if (yr < 100) yr += 2000;
      if (mo >= 0 && mo < 12 && da >= 1 && da <= 31) {
        var d = new Date(yr, mo, da);
        if (!m[3] && d < addDays(now, -30)) d = new Date(yr + 1, mo, da);
        return iso(d);
      }
    }
    return null;
  }

  function daysUntil(dueIso, now) {
    if (!dueIso) return null;
    var p = dueIso.split("-");
    var due = new Date(+p[0], +p[1] - 1, +p[2]);
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((due - today) / 86400000);
  }

  /* ---- the classification itself ------------------------------------ */
  function classify(line, now) {
    now = now || new Date();
    var raw = String(line || "").replace(/\s+/g, " ").trim();
    /* Strip list furniture people paste in: "- ", "* ", "1. ", "[ ] ". */
    raw = raw.replace(/^(\[[ xX]?\]\s*|[-*•·]\s+|\d{1,2}[.)]\s+)/, "").trim();

    var tags = [];
    var text = raw.replace(/(^|\s)#([\w-]{1,32})/g, function (_, sp, t) {
      tags.push(t.toLowerCase()); return sp;
    }).replace(/\s+/g, " ").trim();

    var s = " " + text.toLowerCase() + " ";
    var sTrim = s.trim();

    var u = score(URGENT, s), i = score(IMPORTANT, s), low = score(LOW, s), route = score(ROUTE, sTrim);
    var due = parseDue(s, now);
    var dd = daysUntil(due, now);

    /* A named date is evidence in its own right. */
    var uTotal = u.total;
    if (dd !== null) {
      if (dd <= 0) uTotal = Math.max(uTotal, 3);
      else if (dd === 1) uTotal = Math.max(uTotal, 1);
    }

    var urgent = uTotal >= 2;
    var important = (i.total - low.total) >= 0;   /* work is presumed to matter unless the line says otherwise */
    var quadrant, reasons = [];

    if (low.total >= 3 && uTotal < 3) {
      quadrant = "later"; reasons.push("marked as optional");
    } else if (route.total >= 2 && i.total < 2) {
      quadrant = "delegate"; reasons.push("a message or handoff");
    } else if (urgent && important) {
      quadrant = "do";
    } else if (!urgent && important) {
      quadrant = "schedule";
    } else if (urgent && !important) {
      quadrant = "delegate";
    } else {
      quadrant = "later";
    }

    var signals = u.hits.length + i.hits.length + low.hits.length + route.hits.length + (due ? 1 : 0);
    var review = false, why = null;
    if (signals === 0) { review = true; why = "No timing or priority words — filed as Schedule."; }
    else if (uTotal === 1 && quadrant !== "delegate" && quadrant !== "later") { review = true; why = "Some time pressure, not much. Could be Do."; }
    else if (low.total > 0 && uTotal >= 3) { review = true; why = "Says both urgent and optional."; }
    else if (route.total > 0 && i.total >= 2) { review = true; why = "A handoff about something important — kept it with you."; }
    else if (quadrant === "later" && low.total > 0 && low.total < 3 && i.total > 0) { review = true; why = "Sounds low-stakes, but mentions real work."; }

    var effort = DEEP.test(s) ? "deep" : QUICK.test(s) ? "quick" : "normal";
    if (route.total >= 2 && effort === "normal") effort = "quick";

    if (!why) {
      if (quadrant === "do") reasons.unshift(dd !== null && dd <= 0 ? "due today" : "time-sensitive and important");
      if (quadrant === "schedule") reasons.unshift("important, no hard deadline");
      if (quadrant === "delegate" && !reasons.length) reasons.unshift("urgent but routine");
      if (quadrant === "later" && !reasons.length) reasons.unshift("low stakes");
    }

    return {
      text: text || raw,
      quadrant: quadrant,
      review: review,
      why: why || reasons.join("; "),
      due: due,
      effort: effort,
      tags: tags,
      scores: { urgency: uTotal, importance: i.total, low: low.total, route: route.total }
    };
  }

  /* Split a pasted brain dump into lines worth keeping. */
  function splitDump(text) {
    return String(text || "").split(/\r?\n/)
      .map(function (l) { return l.replace(/\s+/g, " ").trim(); })
      .filter(function (l) { return l.length > 0 && !/^[-*•·#\s]*$/.test(l); });
  }

  var api = { classify: classify, splitDump: splitDump, parseDue: parseDue,
              daysUntil: daysUntil, iso: iso, addDays: addDays, QUADS: QUADS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DocketClassify = api;
})(typeof window !== "undefined" ? window : this);
