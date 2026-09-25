/* =====================================================================
   DOCKET — APPLICATION
   ---------------------------------------------------------------------
   BRAIN DUMP → PRIORITISE → WORK → COMPLETE → EARN → SPEND ON A BREAK

   Local-first by construction: state lives in one localStorage key and
   nothing in this file makes a network request. Export/Import move that
   one object in and out as JSON.

   The points balance is never stored as a number. It is derived from an
   append-only ledger of earn and redeem entries, so it cannot drift from
   the history that explains it. Un-completing a task removes exactly
   the entry its completion added; deleting a finished task keeps its
   entry, because the work was still done.
   ===================================================================== */
(function () {
  "use strict";

  var C = window.DocketClassify;
  var KEY = "cc-docket-v1";

  var QUADS = {
    do:       { name: "Do",       axis: "Urgent + important",         empty: "Nothing urgent.",        key: "1" },
    schedule: { name: "Schedule", axis: "Important, not urgent",      empty: "Nothing waiting here.",  key: "2" },
    delegate: { name: "Automate", axis: "Urgent, not important",      empty: "Nothing to hand off.",   key: "3" },
    later:    { name: "Delete",   axis: "Neither urgent nor important", empty: "Clear.",               key: "4" }
  };
  var ORDER = ["do", "schedule", "delegate", "later"];
  var EFFORT = { quick: { label: "Quick", pts: 1 }, normal: { label: "Normal", pts: 3 }, deep: { label: "Deep", pts: 5 } };
  var DO_BONUS = 1;          /* finishing something urgent and important is worth a little more */
  var MATRIX_ROWS = 6;       /* tasks shown per quadrant on the matrix before "N more" */

  /* ------------------------------------------------------------------
     STATE
     ------------------------------------------------------------------ */
  function blank() {
    return { v: 1, tasks: [], rewards: [], ledger: [], settings: { sound: false } };
  }

  var storageOK = true;
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { storageOK = false; }
    if (!raw) return blank();
    try { return sanitize(JSON.parse(raw)) || blank(); } catch (e) { return blank(); }
  }

  var state = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      storageOK = true;
    } catch (e) {
      storageOK = false;
      toast("Could not save. Browser storage is full or blocked — export a backup now.");
    }
  }

  /* Another tab changed the docket: take its version rather than
     overwrite it with ours on the next save. */
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY) return;
    state = load();
    render();
  });

  /* Anything read from storage or an imported file passes through here,
     so a hand-edited or damaged backup cannot put the UI into a state it
     does not expect. */
  function str(v, max) { return typeof v === "string" ? v.slice(0, max) : ""; }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function isoOrNull(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; }

  function sanitize(o) {
    if (!o || typeof o !== "object" || !Array.isArray(o.tasks)) return null;
    var out = blank();
    o.tasks.forEach(function (t) {
      if (!t || typeof t !== "object" || !str(t.text, 280).trim()) return;
      out.tasks.push({
        id: str(t.id, 40) || uid(),
        text: str(t.text, 280).trim(),
        quadrant: QUADS[t.quadrant] ? t.quadrant : "schedule",
        review: t.review === true,
        why: str(t.why, 200),
        due: isoOrNull(t.due),
        effort: EFFORT[t.effort] ? t.effort : "normal",
        tag: str(t.tag, 40),
        notes: str(t.notes, 4000),
        created: num(t.created) || Date.now(),
        completed: num(t.completed),
        points: num(t.points)
      });
    });
    (Array.isArray(o.rewards) ? o.rewards : []).forEach(function (r) {
      if (!r || !str(r.name, 80).trim() || !(num(r.cost) > 0)) return;
      out.rewards.push({ id: str(r.id, 40) || uid(), name: str(r.name, 80).trim(), cost: Math.round(r.cost), created: num(r.created) || Date.now() });
    });
    (Array.isArray(o.ledger) ? o.ledger : []).forEach(function (l) {
      if (!l || (l.type !== "earn" && l.type !== "redeem") || !(num(l.pts) > 0) || !num(l.at)) return;
      out.ledger.push({ id: str(l.id, 40) || uid(), type: l.type, pts: Math.round(l.pts), at: l.at,
                        taskId: str(l.taskId, 40) || null, rewardId: str(l.rewardId, 40) || null, label: str(l.label, 280) });
    });
    out.settings.sound = !!(o.settings && o.settings.sound === true);
    return out;
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ------------------------------------------------------------------
     DERIVED FIGURES
     ------------------------------------------------------------------ */
  function todayIso() { return C.iso(new Date()); }
  function dayOf(ts) { return C.iso(new Date(ts)); }

  function openTasks(q) {
    return state.tasks.filter(function (t) { return !t.completed && (!q || t.quadrant === q); });
  }
  function doneToday(q) {
    var d = todayIso();
    return state.tasks.filter(function (t) { return t.completed && dayOf(t.completed) === d && (!q || t.quadrant === q); });
  }
  function balance() {
    return state.ledger.reduce(function (s, l) { return s + (l.type === "earn" ? l.pts : -l.pts); }, 0);
  }
  function earnedToday() {
    var d = todayIso();
    return state.ledger.reduce(function (s, l) { return s + (l.type === "earn" && dayOf(l.at) === d ? l.pts : 0); }, 0);
  }
  function pointsFor(t) {
    return EFFORT[t.effort].pts + (t.quadrant === "do" ? DO_BONUS : 0);
  }

  /* Due first (overdue at the top), then oldest. Undated work sorts
     after dated work, so a deadline is never buried under a backlog. */
  function byDueThenAge(a, b) {
    var ad = a.due || "9999-99-99", bd = b.due || "9999-99-99";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.created - b.created;
  }

  /* FOCUS — the whole rule, in order:
       1. Do, most pressing due date first
       2. Schedule items due within two days
       3. the rest of Schedule
     Automate and Delete never appear: they are not "what to work on". */
  function recommend() {
    var now = new Date();
    var doList = openTasks("do").sort(byDueThenAge).map(function (t) { return { t: t, why: dueWords(t) || "Do" }; });
    var sched = openTasks("schedule").sort(byDueThenAge);
    var soon = [], rest = [];
    sched.forEach(function (t) {
      var d = C.daysUntil(t.due, now);
      if (d !== null && d <= 2) soon.push({ t: t, why: dueWords(t) });
      else rest.push({ t: t, why: t.due ? "Scheduled, " + dueWords(t).toLowerCase() : "Important" });
    });
    return doList.concat(soon, rest).filter(function (x) { return skipped.indexOf(x.t.id) === -1; });
  }
  var skipped = [];   /* "Not now" in Focus — this session only, never saved */

  function dueWords(t) {
    if (!t.due) return "";
    var d = C.daysUntil(t.due, new Date());
    if (d < -1) return "Overdue " + (-d) + " days";
    if (d === -1) return "Overdue since yesterday";
    if (d === 0) return "Due today";
    if (d === 1) return "Due tomorrow";
    if (d < 7) return "Due " + new Date(t.due + "T12:00").toLocaleDateString(undefined, { weekday: "long" });
    return "Due " + new Date(t.due + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  function dueClass(t) {
    if (!t.due) return "";
    var d = C.daysUntil(t.due, new Date());
    return d < 0 ? " is-overdue" : d === 0 ? " is-today" : d <= 2 ? " is-soon" : "";
  }

  /* ------------------------------------------------------------------
     MUTATIONS — each one saves, then renders
     ------------------------------------------------------------------ */
  function addTask(draft, quadOverride) {
    var t = {
      id: uid(),
      text: draft.text,
      quadrant: quadOverride || draft.quadrant,
      review: quadOverride && quadOverride !== draft.quadrant ? false : !!draft.review,
      why: draft.why || "",
      due: draft.due || null,
      effort: draft.effort || "normal",
      tag: (draft.tags && draft.tags[0]) || "",
      notes: "",
      created: Date.now(),
      completed: null,
      points: null
    };
    state.tasks.push(t);
    return t;
  }

  function complete(id) {
    var t = find(id); if (!t || t.completed) return 0;
    t.completed = Date.now();
    t.points = pointsFor(t);
    t.review = false;
    state.ledger.push({ id: uid(), type: "earn", pts: t.points, at: t.completed, taskId: t.id, label: t.text });
    save();
    return t.points;
  }
  function uncomplete(id) {
    var t = find(id); if (!t || !t.completed) return;
    for (var i = state.ledger.length - 1; i >= 0; i--) {
      if (state.ledger[i].type === "earn" && state.ledger[i].taskId === id) { state.ledger.splice(i, 1); break; }
    }
    t.completed = null; t.points = null;
    save();
  }
  function move(id, q) {
    var t = find(id); if (!t || !QUADS[q]) return;
    var from = t.quadrant;
    t.quadrant = q; t.review = false;
    save(); render();
    if (from !== q) toast("Moved to " + QUADS[q].name + ".", "Undo", function () { t.quadrant = from; save(); render(); });
  }
  function remove(id) {
    var i = indexOf(id); if (i < 0) return;
    var t = state.tasks.splice(i, 1)[0];
    save(); render();
    toast("Deleted “" + clip(t.text, 40) + "”.", "Undo", function () { state.tasks.splice(i, 0, t); save(); render(); });
  }
  function find(id) { for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return state.tasks[i]; return null; }
  function indexOf(id) { for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return i; return -1; }

  /* ------------------------------------------------------------------
     HELPERS
     ------------------------------------------------------------------ */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clip(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------
     ROUTING — the hash is the view, so Back works and a view can be
     bookmarked (#/focus is a good one to keep open)
     ------------------------------------------------------------------ */
  function route() {
    var h = (location.hash || "#/").replace(/^#\/?/, "");
    if (QUADS[h] || h === "focus" || h === "rewards") return h;
    return "matrix";
  }
  var lastRoute = null;
  window.addEventListener("hashchange", function () {
    closeMove();
    render();
    var h = $("#main h1, #main h2");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  });

  /* ------------------------------------------------------------------
     RENDER
     ------------------------------------------------------------------ */
  var main = document.getElementById("main");

  function render() {
    var view = route();
    var active = document.activeElement && document.activeElement.getAttribute("data-key");

    document.body.setAttribute("data-view", view);
    $$(".dk-tabs a").forEach(function (a) {
      if (a.getAttribute("data-view") === view) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    ORDER.forEach(function (q) {
      var n = openTasks(q).length;
      $$('[data-count="' + q + '"]').forEach(function (el) { el.textContent = n ? String(n) : ""; });
    });

    if (view === "matrix") main.innerHTML = matrixView();
    else if (view === "focus") main.innerHTML = focusView();
    else if (view === "rewards") main.innerHTML = rewardsView();
    else main.innerHTML = quadView(view);

    if (!storageOK) main.insertAdjacentHTML("afterbegin",
      '<p class="dk-warn" role="alert">This browser is not letting Docket save. Tasks will be lost when the tab closes — use Export backup from the ⋯ menu.</p>');

    renderStrip();
    updateQuickChip();
    lastRoute = view;

    if (active) { var el = $('[data-key="' + active + '"]'); if (el) el.focus({ preventScroll: true }); }
  }

  var shownBank = null;
  function renderStrip() {
    var now = new Date();
    $('[data-stat="date"]').textContent = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    $('[data-stat="open"]').textContent = openTasks().length;
    $('[data-stat="done"]').textContent = doneToday().length;
    $('[data-stat="earned"]').textContent = earnedToday();
    var b = balance();
    if (shownBank === null) { $("#bank").textContent = b; shownBank = b; }
    else if (b !== shownBank) countTo($("#bank"), shownBank, b);
    shownBank = b;
  }

  function countTo(el, from, to) {
    el.classList.remove("is-ticking"); void el.offsetWidth; el.classList.add("is-ticking");
    if (reducedMotion) { el.textContent = to; return; }
    var t0 = null, dur = 520;
    function step(ts) {
      if (!t0) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---- a single task row, used everywhere ---- */
  function taskRow(t, opts) {
    opts = opts || {};
    var done = !!t.completed;
    var pts = done ? t.points : pointsFor(t);
    var meta = "";
    if (t.due) meta += '<span class="dk-due' + (done ? "" : dueClass(t)) + '">' + esc(done ? "Was due " + t.due : dueWords(t)) + "</span>";
    meta += '<span class="dk-effort dk-effort--' + t.effort + '" title="' + EFFORT[t.effort].label + ' effort">' +
              '<i></i><i></i><i></i><span class="sr-only">' + EFFORT[t.effort].label + " effort</span></span>";
    if (t.tag) meta += '<span class="dk-tag">#' + esc(t.tag) + "</span>";
    if (t.notes) meta += '<span class="dk-hasnotes" title="Has notes">Notes</span>';
    if (opts.showQuad) meta += '<span class="dk-qname" data-q="' + t.quadrant + '">' + QUADS[t.quadrant].name + "</span>";
    if (done) meta += '<span class="dk-when">Done ' + esc(whenText(t.completed)) + "</span>";

    return '<li class="task' + (done ? " is-done" : "") + '" data-id="' + t.id + '" data-q="' + t.quadrant + '"' +
             (done ? "" : ' draggable="true"') + ">" +
      '<button type="button" class="chk" role="checkbox" aria-checked="' + done + '" data-key="chk-' + t.id + '" data-act="toggle" ' +
        'aria-label="' + (done ? "Mark not done: " : "Complete: ") + esc(t.text) + '">' +
        '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.4l3 3 6.6-7"/></svg></button>' +
      '<div class="task__main">' +
        '<button type="button" class="task__text" data-act="edit" data-key="edit-' + t.id + '">' + esc(t.text) + "</button>" +
        '<div class="task__meta">' +
          (t.review && !done ? '<button type="button" class="dk-review" data-act="move" data-key="rev-' + t.id + '" title="' + esc(t.why || "Sorted by a guess") + '">Review</button>' : "") +
          meta +
        "</div>" +
      "</div>" +
      (done ? "" :
      '<div class="task__acts">' +
        '<button type="button" class="dk-act" data-act="move" data-key="move-' + t.id + '" aria-haspopup="menu" aria-label="Move ' + esc(t.text) + '">Move</button>' +
        '<button type="button" class="dk-act dk-act--x" data-act="delete" data-key="del-' + t.id + '" aria-label="Delete ' + esc(t.text) + '">' +
          '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>' +
      "</div>") +
      '<span class="task__pts" aria-label="' + plural(pts, "point") + '">+' + pts + "</span>" +
    "</li>";
  }

  function whenText(ts) {
    var d = new Date(ts), today = todayIso(), day = C.iso(d);
    var time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (day === today) return time;
    if (day === C.iso(C.addDays(new Date(), -1))) return "yesterday";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function progress(q) {
    var open = openTasks(q).length, done = doneToday(q).length, total = open + done;
    var pct = total ? Math.round((done / total) * 100) : 0;
    return '<div class="dk-prog" role="img" aria-label="' + done + " of " + total + ' done today">' +
             '<span style="width:' + pct + '%"></span></div>';
  }

  /* ---- MATRIX ---- */
  function matrixView() {
    var cells = ORDER.map(function (q) {
      var open = openTasks(q).sort(byDueThenAge);
      var done = doneToday(q).length;
      var list = open.slice(0, MATRIX_ROWS).map(function (t) { return taskRow(t); }).join("");
      var more = open.length - MATRIX_ROWS;
      var body = open.length
        ? '<ul class="dk-list">' + list + "</ul>"
        : '<p class="dk-empty">' + QUADS[q].empty + (done ? " <span>" + plural(done, "finished today", "finished today") + ".</span>" : "") + "</p>";
      return '<section class="quad" data-q="' + q + '" data-drop="' + q + '" aria-labelledby="qh-' + q + '">' +
        '<header class="quad__head">' +
          '<h2 id="qh-' + q + '"><a href="#/' + q + '">' + QUADS[q].name + "</a></h2>" +
          '<span class="quad__axis">' + QUADS[q].axis + "</span>" +
          '<span class="quad__n">' + open.length + " open" + (done ? " / " + done + " done" : "") + "</span>" +
        "</header>" +
        progress(q) +
        body +
        '<footer class="quad__foot"><a class="dk-open" href="#/' + q + '">' +
          (more > 0 ? "Open all " + open.length : "Open " + QUADS[q].name) + "</a>" +
          (more > 0 ? '<span class="dk-more">' + more + " more</span>" : "") +
        "</footer>" +
      "</section>";
    }).join("");

    return '<h1 class="sr-only">Matrix</h1>' +
      '<div class="mx">' +
        '<span class="mx__x mx__x--u" aria-hidden="true">Urgent</span>' +
        '<span class="mx__x mx__x--n" aria-hidden="true">Not urgent</span>' +
        '<span class="mx__y mx__y--i" aria-hidden="true">Important</span>' +
        '<span class="mx__y mx__y--n" aria-hidden="true">Not important</span>' +
        cells +
      "</div>" +
      (state.tasks.length ? "" :
        '<p class="dk-first">Start with everything on your mind. <button type="button" class="btn btn--solid" data-act="dump">Open brain dump</button></p>');
  }

  /* ---- ONE QUADRANT ---- */
  var showAllDone = false;
  function quadView(q) {
    var open = openTasks(q).sort(byDueThenAge);
    var review = open.filter(function (t) { return t.review; }).length;
    var done = state.tasks.filter(function (t) { return t.completed && t.quadrant === q; })
      .sort(function (a, b) { return b.completed - a.completed; });
    var shownDone = showAllDone ? done : done.slice(0, 12);

    return '<section class="qv" data-q="' + q + '" data-drop="' + q + '">' +
      '<header class="qv__head">' +
        '<div><p class="quad__axis">' + QUADS[q].axis + "</p>" +
        "<h1>" + QUADS[q].name + "</h1></div>" +
        '<p class="stamp"><b>' + open.length + "</b> open" +
          (review ? "<br>" + review + " to review" : "") +
          "<br>" + doneToday(q).length + " done today</p>" +
      "</header>" +
      progress(q) +
      (open.length
        ? '<ul class="dk-list dk-list--full">' + open.map(function (t) { return taskRow(t); }).join("") + "</ul>"
        : '<p class="dk-empty dk-empty--lg">' + QUADS[q].empty + "</p>") +
      (done.length
        ? '<details class="dk-done"' + (open.length ? "" : " open") + "><summary>Done <span>" + done.length + "</span></summary>" +
            '<ul class="dk-list">' + shownDone.map(function (t) { return taskRow(t); }).join("") + "</ul>" +
            (done.length > shownDone.length ? '<button type="button" class="btn btn--quiet" data-act="alldone">Show all ' + done.length + "</button>" : "") +
          "</details>"
        : "") +
      '<p class="dk-back"><a class="back-link" href="#/">Matrix</a></p>' +
    "</section>";
  }

  /* ---- FOCUS ---- */
  function focusView() {
    var recs = recommend();
    var head = '<header class="fv__head"><h1>What to work on next</h1>' +
      '<p class="dk-hint">Do first, then Schedule items due within two days, then the rest of Schedule. ' +
      "Earliest due date, then oldest, within each.</p></header>";
    if (!recs.length) {
      var msg = skipped.length
        ? 'You set everything aside for now. <button type="button" class="btn btn--quiet" data-act="unskip">Show them again</button>'
        : "Nothing important is waiting. Automate and Delete items are still on the <a href=\"#/\">matrix</a>.";
      return '<section class="fv">' + head + '<p class="dk-empty dk-empty--lg">' + msg + "</p></section>";
    }
    var first = recs[0], t = first.t;
    var next = recs.slice(1, 3);
    return '<section class="fv">' + head +
      '<article class="fv__now" data-id="' + t.id + '" data-q="' + t.quadrant + '">' +
        '<p class="fv__why"><span class="dk-qname" data-q="' + t.quadrant + '">' + QUADS[t.quadrant].name + "</span>" + esc(first.why && first.why !== "Do" ? first.why : "") + "</p>" +
        '<h2 class="fv__text">' + esc(t.text) + "</h2>" +
        (t.notes ? '<p class="fv__notes">' + esc(t.notes) + "</p>" : "") +
        '<div class="fv__acts">' +
          '<button type="button" class="btn btn--solid fv__done" data-act="focusdone" data-key="fdone-' + t.id + '">' +
            '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.4l3 3 6.6-7"/></svg>Done <span>+' + pointsFor(t) + "</span></button>" +
          '<button type="button" class="btn" data-act="skip">Not now</button>' +
          '<button type="button" class="btn btn--quiet" data-act="edit">Edit</button>' +
        "</div>" +
      "</article>" +
      (next.length
        ? '<p class="label">After that</p><ul class="dk-list">' + next.map(function (x) { return taskRow(x.t, { showQuad: true }); }).join("") + "</ul>"
        : "") +
      (recs.length > 3 ? '<p class="dk-hint">' + plural(recs.length - 3, "more item") + " behind these.</p>" : "") +
    "</section>";
  }

  /* ---- REWARDS ---- */
  var editingReward = null;
  function rewardsView() {
    var b = balance();
    var rows = state.rewards.slice().sort(function (a, c) { return a.cost - c.cost; }).map(function (r) {
      if (editingReward === r.id) {
        return '<li class="rw rw--edit"><form class="rw__form" data-reward-edit="' + r.id + '">' +
          '<label class="sr-only" for="rn-' + r.id + '">Reward</label><input id="rn-' + r.id + '" name="name" maxlength="80" required value="' + esc(r.name) + '">' +
          '<label class="sr-only" for="rc-' + r.id + '">Cost in points</label><input id="rc-' + r.id + '" name="cost" type="number" min="1" max="999" required value="' + r.cost + '">' +
          '<button class="btn btn--solid">Save</button><button type="button" class="btn btn--quiet" data-act="rcancel">Cancel</button></form></li>';
      }
      var short = r.cost - b;
      return '<li class="rw" data-rid="' + r.id + '">' +
        '<span class="rw__cost">' + r.cost + "</span>" +
        '<span class="rw__name">' + esc(r.name) + "</span>" +
        (short > 0 ? '<span class="rw__short">' + short + " to go</span>" : "") +
        '<button type="button" class="btn' + (short > 0 ? "" : " btn--solid") + '" data-act="redeem" data-key="rd-' + r.id + '"' + (short > 0 ? " disabled" : "") + ">Redeem</button>" +
        '<button type="button" class="dk-act" data-act="redit" aria-label="Edit ' + esc(r.name) + '">Edit</button>' +
        '<button type="button" class="dk-act dk-act--x" data-act="rdelete" aria-label="Delete ' + esc(r.name) + '"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>' +
      "</li>";
    }).join("");

    var history = state.ledger.filter(function (l) { return l.type === "redeem"; })
      .sort(function (a, c) { return c.at - a.at; }).slice(0, 10)
      .map(function (l) { return "<li><span>" + esc(l.label) + "</span><span>−" + l.pts + "</span><time>" + esc(whenText(l.at)) + "</time></li>"; }).join("");

    return '<section class="rv">' +
      '<header class="rv__head"><div><h1>Rewards</h1>' +
        '<p class="dk-hint">Finished work funds breaks you choose. You set what each one costs.</p></div>' +
        '<p class="rv__bank"><b>' + b + "</b> in the Break Bank<span>" + earnedToday() + " earned today</span></p>" +
      "</header>" +
      '<div class="rv__cols">' +
        "<div>" +
          (rows ? '<ul class="rw-list">' + rows + "</ul>"
                : '<div class="dk-empty dk-empty--lg"><p>No rewards yet. Add the breaks that are worth something to you.</p>' +
                  '<button type="button" class="btn" data-act="examples">Start from six examples</button></div>') +
          '<form class="rw__form rw__add" id="reward-add">' +
            '<label class="sr-only" for="rw-name">New reward</label><input id="rw-name" name="name" maxlength="80" required placeholder="New reward, e.g. Walk outside">' +
            '<label class="sr-only" for="rw-cost">Cost in points</label><input id="rw-cost" name="cost" type="number" min="1" max="999" required placeholder="Cost">' +
            '<button class="btn btn--solid">Add reward</button>' +
          "</form>" +
        "</div>" +
        '<aside class="rv__hist"><p class="label">Recent breaks</p>' +
          (history ? '<ul class="hist">' + history + "</ul>" : '<p class="dk-hint">Nothing redeemed yet.</p>') +
          '<p class="label">How points are earned</p>' +
          '<table class="dk-rates"><tbody>' +
            "<tr><td>Quick</td><td>1</td></tr><tr><td>Normal</td><td>3</td></tr><tr><td>Deep</td><td>5</td></tr>" +
            "<tr><td>Do bonus</td><td>+" + DO_BONUS + "</td></tr>" +
          "</tbody></table>" +
        "</aside>" +
      "</div>" +
    "</section>";
  }

  var EXAMPLES = [
    ["Coffee refill", 5], ["5-minute reset", 8], ["Read for 10 minutes", 10],
    ["Walk outside", 15], ["Watch something during break", 20], ["Longer personal project break", 25]
  ];

  /* ------------------------------------------------------------------
     COMPLETION — the moment the whole app is built around
     ------------------------------------------------------------------ */
  var pending = {};   /* id → timer, while a finished row is still visible */

  function toggle(row) {
    var id = row.getAttribute("data-id"), t = find(id);
    if (!t) return;
    if (t.completed) {
      if (pending[id]) { clearTimeout(pending[id]); delete pending[id]; }
      uncomplete(id);
      row.classList.remove("is-completing", "is-collapsing");
      render();
      return;
    }
    var pts = complete(id);
    var chk = $(".chk", row);
    chk.setAttribute("aria-checked", "true");
    row.classList.add("is-completing");
    floatPoints(chk, pts);
    renderStrip();
    chime();
    announce("Done. " + plural(pts, "point") + " to the Break Bank.");
    /* Leave the struck-through row in place long enough to be seen and
       undone with a second click, then fold it away. */
    pending[id] = setTimeout(function () {
      /* If focus is still on this row, hand it to the neighbouring task
         so a keyboard user can keep ticking down the list. */
      var hadFocus = row.contains(document.activeElement);
      var nb = row.nextElementSibling || row.previousElementSibling;
      var nbKey = nb && nb.getAttribute("data-id") ? "chk-" + nb.getAttribute("data-id") : null;
      row.classList.add("is-collapsing");
      pending[id] = setTimeout(function () {
        delete pending[id]; render();
        if (hadFocus && nbKey) { var n = $('[data-key="' + nbKey + '"]'); if (n) n.focus({ preventScroll: true }); }
      }, reducedMotion ? 0 : 260);
    }, reducedMotion ? 400 : 900);
  }

  function floatPoints(fromEl, pts) {
    if (reducedMotion) return;
    var r = fromEl.getBoundingClientRect(), bank = $("#bank").getBoundingClientRect();
    var f = document.createElement("span");
    f.className = "dk-float";
    f.textContent = "+" + pts;
    f.style.left = (r.left + r.width / 2) + "px";
    f.style.top = (r.top) + "px";
    document.body.appendChild(f);
    var dx = bank.left + bank.width / 2 - (r.left + r.width / 2), dy = bank.top - r.top;
    f.animate([
      { transform: "translate(-50%, 0) scale(1)", opacity: 0 },
      { transform: "translate(-50%, -18px) scale(1.15)", opacity: 1, offset: 0.25 },
      { transform: "translate(calc(-50% + " + dx + "px), " + dy + "px) scale(.7)", opacity: 0.2 }
    ], { duration: 820, easing: "cubic-bezier(.22,.7,.28,1)" }).onfinish = function () { f.remove(); };
  }

  var audio = null;
  function chime() {
    if (!state.settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var now = audio.currentTime;
      [[880, 0], [1318.5, 0.07]].forEach(function (n) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = "sine"; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, now + n[1]);
        g.gain.exponentialRampToValueAtTime(0.07, now + n[1] + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + n[1] + 0.22);
        o.connect(g).connect(audio.destination);
        o.start(now + n[1]); o.stop(now + n[1] + 0.25);
      });
    } catch (e) { /* sound is optional */ }
  }

  /* ------------------------------------------------------------------
     MOVE MENU
     ------------------------------------------------------------------ */
  var movePop = $("#move-pop"), moveFor = null, moveReturn = null;

  function openMove(btn, id) {
    var t = find(id); if (!t) return;
    moveFor = id; moveReturn = btn;
    var html = (t.review && t.why ? '<p class="dk-pop__note">' + esc(t.why) + "</p>" : "");
    if (t.review) html += '<button type="button" role="menuitem" data-mv="' + t.quadrant + '" class="is-keep">Keep in ' + QUADS[t.quadrant].name + "</button>";
    ORDER.forEach(function (q) {
      if (q === t.quadrant) return;
      html += '<button type="button" role="menuitem" data-mv="' + q + '"><i data-q="' + q + '"></i>' + QUADS[q].name + "<kbd>" + QUADS[q].key + "</kbd></button>";
    });
    movePop.innerHTML = html;
    movePop.hidden = false;
    var r = btn.getBoundingClientRect(), w = movePop.offsetWidth, h = movePop.offsetHeight;
    var left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w));
    var top = r.bottom + 6 + h > window.innerHeight ? r.top - h - 6 : r.bottom + 6;
    movePop.style.left = left + "px";
    movePop.style.top = Math.max(8, top) + "px";
    var first = $("button", movePop); if (first) first.focus();
  }
  function closeMove(restore) {
    if (movePop.hidden) return;
    movePop.hidden = true; moveFor = null;
    if (restore && moveReturn && document.body.contains(moveReturn)) moveReturn.focus();
  }
  movePop.addEventListener("click", function (e) {
    var b = e.target.closest("[data-mv]"); if (!b || !moveFor) return;
    var id = moveFor, q = b.getAttribute("data-mv"), t = find(id);
    closeMove();
    if (t && q === t.quadrant) { t.review = false; save(); render(); toast("Kept in " + QUADS[q].name + "."); }
    else move(id, q);
  });
  movePop.addEventListener("keydown", function (e) {
    var items = $$("button", movePop), i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (e.key === "Escape") { e.preventDefault(); closeMove(true); }
    if (/^[1-4]$/.test(e.key)) { var hit = $('[data-mv="' + ORDER[+e.key - 1] + '"]', movePop); if (hit) hit.click(); }
  });
  document.addEventListener("pointerdown", function (e) {
    if (!movePop.hidden && !movePop.contains(e.target) && !e.target.closest('[data-act="move"]')) closeMove();
    if (!menuPop.hidden && !e.target.closest(".dk-menu")) closeMenu();
  });

  /* ------------------------------------------------------------------
     CLICK DELEGATION for everything rendered into <main>
     ------------------------------------------------------------------ */
  main.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]"); if (!el) return;
    var act = el.getAttribute("data-act");
    var row = el.closest("[data-id]"), id = row && row.getAttribute("data-id");

    if (act === "toggle") return toggle(row);
    if (act === "edit") return openSheet(id);
    if (act === "move") { e.stopPropagation(); return moveFor === id ? closeMove() : openMove(el, id); }
    if (act === "delete") return remove(id);
    if (act === "dump") return openDump();
    if (act === "alldone") { showAllDone = true; return render(); }

    if (act === "focusdone") {
      var pts = complete(id);
      floatPoints(el, pts); chime();
      announce("Done. " + plural(pts, "point") + " to the Break Bank.");
      var card = el.closest(".fv__now"); card.classList.add("is-completing");
      renderStrip();
      setTimeout(function () { render(); var b = $(".fv__done"); if (b) b.focus(); }, reducedMotion ? 200 : 700);
      return;
    }
    if (act === "skip") { skipped.push(id); render(); var nb = $(".fv__done"); if (nb) nb.focus(); return; }
    if (act === "unskip") { skipped = []; return render(); }

    var rrow = el.closest("[data-rid]"), rid = rrow && rrow.getAttribute("data-rid");
    if (act === "redeem") return redeem(rid);
    if (act === "redit") { editingReward = rid; render(); var inp = $("#rn-" + rid); if (inp) inp.focus(); return; }
    if (act === "rcancel") { editingReward = null; return render(); }
    if (act === "rdelete") {
      var ri = -1; state.rewards.forEach(function (r, i) { if (r.id === rid) ri = i; });
      var gone = state.rewards.splice(ri, 1)[0]; save(); render();
      return toast("Removed “" + gone.name + "”.", "Undo", function () { state.rewards.splice(ri, 0, gone); save(); render(); });
    }
    if (act === "examples") {
      EXAMPLES.forEach(function (x) { state.rewards.push({ id: uid(), name: x[0], cost: x[1], created: Date.now() }); });
      save(); render();
      return toast("Six examples added. Edit or delete any of them — they are yours now.");
    }
  });

  main.addEventListener("submit", function (e) {
    var f = e.target;
    e.preventDefault();
    var name = (f.elements.name.value || "").trim(), cost = Math.round(+f.elements.cost.value);
    if (!name || !(cost > 0)) return;
    if (f.id === "reward-add") {
      state.rewards.push({ id: uid(), name: name, cost: cost, created: Date.now() });
      save(); render();
      var n = $("#rw-name"); if (n) n.focus();
      return;
    }
    var rid = f.getAttribute("data-reward-edit");
    if (rid) {
      state.rewards.forEach(function (r) { if (r.id === rid) { r.name = name; r.cost = cost; } });
      editingReward = null; save(); render();
    }
  });

  function redeem(rid) {
    var r = null; state.rewards.forEach(function (x) { if (x.id === rid) r = x; });
    if (!r || balance() < r.cost) return;
    var entry = { id: uid(), type: "redeem", pts: r.cost, at: Date.now(), rewardId: r.id, label: r.name };
    state.ledger.push(entry); save(); render();
    toast("Enjoy it: " + r.name + ".", "Undo", function () {
      var i = state.ledger.indexOf(entry); if (i >= 0) state.ledger.splice(i, 1); save(); render();
    });
  }

  /* ------------------------------------------------------------------
     DRAG AND DROP — desktop convenience; Move does the same job
     ------------------------------------------------------------------ */
  var dragId = null;
  document.addEventListener("dragstart", function (e) {
    var row = e.target.closest && e.target.closest(".task[draggable]");
    if (!row) return;
    dragId = row.getAttribute("data-id");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", dragId); } catch (err) { /* IE */ }
    row.classList.add("is-dragging");
    document.body.classList.add("is-dragging");
  });
  document.addEventListener("dragend", function () {
    dragId = null;
    document.body.classList.remove("is-dragging");
    $$(".is-dragging, .is-drop").forEach(function (el) { el.classList.remove("is-dragging", "is-drop"); });
  });
  function dropTarget(e) { return e.target.closest && e.target.closest("[data-drop], .dk-tabs a[data-q]"); }
  document.addEventListener("dragover", function (e) {
    var z = dragId && dropTarget(e); if (!z) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "move";
    $$(".is-drop").forEach(function (el) { if (el !== z) el.classList.remove("is-drop"); });
    z.classList.add("is-drop");
  });
  document.addEventListener("drop", function (e) {
    var z = dragId && dropTarget(e); if (!z) return;
    e.preventDefault();
    var q = z.getAttribute("data-drop") || z.getAttribute("data-q");
    var id = dragId; dragId = null;
    var t = find(id);
    if (t && t.quadrant !== q) move(id, q);
  });

  /* ------------------------------------------------------------------
     QUICK ADD — classified as you type; in a quadrant view the task
     lands where you are, because that is what you meant
     ------------------------------------------------------------------ */
  var quickForm = $("#quick-add"), quickInput = $("#quick-input"), quickChip = $("#quick-chip");
  var quickOverride = null;

  function quickDraft() {
    var v = quickInput.value.trim();
    return v ? C.classify(v) : null;
  }
  function quickTarget(d) {
    if (quickOverride) return quickOverride;
    var v = route();
    if (QUADS[v]) return v;
    return d ? d.quadrant : null;
  }
  function updateQuickChip() {
    var d = quickDraft(), q = quickTarget(d);
    if (!d || !q) { quickChip.hidden = true; return; }
    quickChip.hidden = false;
    quickChip.setAttribute("data-q", q);
    quickChip.innerHTML = '<i data-q="' + q + '"></i>' + QUADS[q].name +
      (d.review && !quickOverride && !QUADS[route()] ? '<span class="dk-qchip__r">?</span>' : "");
    quickChip.setAttribute("aria-label", "Will be added to " + QUADS[q].name + ". Click to change.");
    quickChip.title = quickOverride || QUADS[route()] ? "Click to change" : (d.why || "Click to change");
  }
  quickInput.addEventListener("input", function () { if (!quickInput.value.trim()) quickOverride = null; updateQuickChip(); });
  quickChip.addEventListener("click", function () {
    var d = quickDraft(), q = quickTarget(d);
    quickOverride = ORDER[(ORDER.indexOf(q) + 1) % ORDER.length];
    updateQuickChip();
    quickInput.focus();
  });
  quickForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var d = quickDraft(); if (!d) return;
    var q = quickTarget(d);
    var t = addTask(d, q !== d.quadrant ? q : null);
    save();
    quickInput.value = ""; quickOverride = null;
    render();
    flash(t.id);
    if (!QUADS[route()] || route() !== t.quadrant) {
      toast("Added to " + QUADS[t.quadrant].name + (t.review ? " — marked for review" : "") + ".", "Move", function () {
        var row = $('.task[data-id="' + t.id + '"] [data-act="move"]');
        if (row) openMove(row, t.id); else openSheet(t.id);
      });
    }
  });

  function flash(id) {
    var row = $('.task[data-id="' + id + '"]');
    if (row) { row.classList.add("is-new"); setTimeout(function () { row.classList.remove("is-new"); }, 1200); }
  }

  /* ------------------------------------------------------------------
     BRAIN DUMP
     ------------------------------------------------------------------ */
  var dump = $("#dump"), dumpText = $("#dump-text"), dumpPreview = $("#dump-preview"), dumpSubmit = $("#dump-submit");
  var dumpOverrides = {};   /* line text → quadrant chosen by hand */
  var dumpDrafts = [];

  function openDump() {
    closeMove(); closeMenu();
    if (typeof dump.showModal === "function") dump.showModal(); else dump.setAttribute("open", "");
    renderDump();
    dumpText.focus();
  }
  function renderDump() {
    dumpDrafts = C.splitDump(dumpText.value).map(function (line) { return C.classify(line); });
    dumpSubmit.disabled = !dumpDrafts.length;
    dumpSubmit.textContent = dumpDrafts.length ? "Add " + plural(dumpDrafts.length, "task") : "Add tasks";
    if (!dumpDrafts.length) {
      dumpPreview.innerHTML = '<li class="dk-preview__empty">Each line becomes a task.</li>';
      return;
    }
    dumpPreview.innerHTML = dumpDrafts.map(function (d, i) {
      var q = dumpOverrides[d.text] || d.quadrant, byHand = !!dumpOverrides[d.text];
      return '<li data-q="' + q + '">' +
        '<button type="button" class="dk-qchip" data-cycle="' + i + '" data-q="' + q + '" title="' + esc(byHand ? "Set by hand" : d.why) + '" ' +
          'aria-label="' + esc(d.text) + ': ' + QUADS[q].name + '. Click to change.">' +
          '<i data-q="' + q + '"></i>' + QUADS[q].name + (d.review && !byHand ? '<span class="dk-qchip__r">?</span>' : "") + "</button>" +
        '<span class="dk-preview__t">' + esc(d.text) + "</span>" +
        (d.tags.length ? '<span class="dk-tag">#' + esc(d.tags[0]) + "</span>" : '<span></span>') +
        (d.due ? '<span class="dk-due">' + esc(dueWords({ due: d.due })) + "</span>" : "<span></span>") +
        '<span class="dk-effort dk-effort--' + d.effort + '" title="' + EFFORT[d.effort].label + ' effort"><i></i><i></i><i></i></span>' +
      "</li>";
    }).join("");
  }
  var dumpTimer = null;
  dumpText.addEventListener("input", function () { clearTimeout(dumpTimer); dumpTimer = setTimeout(renderDump, 90); });
  dumpText.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitDump(); }
  });
  dumpPreview.addEventListener("click", function (e) {
    var b = e.target.closest("[data-cycle]"); if (!b) return;
    var d = dumpDrafts[+b.getAttribute("data-cycle")];
    var cur = dumpOverrides[d.text] || d.quadrant;
    dumpOverrides[d.text] = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
    renderDump();
    var again = $('[data-cycle="' + b.getAttribute("data-cycle") + '"]', dumpPreview); if (again) again.focus();
  });
  $("#dump-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (e.submitter && e.submitter.value === "cancel") return closeDialog(dump);
    submitDump();
  });
  function submitDump() {
    if (!dumpDrafts.length) return;
    var added = dumpDrafts.map(function (d) {
      var o = dumpOverrides[d.text];
      return addTask(d, o && o !== d.quadrant ? o : null);
    });
    save();
    dumpText.value = ""; dumpOverrides = {}; dumpDrafts = [];
    closeDialog(dump);
    if (route() !== "matrix") location.hash = "#/"; else render();
    added.forEach(function (t) { flash(t.id); });
    var rv = added.filter(function (t) { return t.review; }).length;
    toast("Added " + plural(added.length, "task") + (rv ? ", " + rv + " marked for review" : "") + ".");
  }

  /* ------------------------------------------------------------------
     TASK SHEET (edit)
     ------------------------------------------------------------------ */
  var sheet = $("#sheet"), sheetForm = $("#sheet-form"), sheetId = null, sheetReturn = null;

  function openSheet(id) {
    var t = find(id); if (!t) return;
    closeMove();
    sheetId = id; sheetReturn = document.activeElement;
    var f = sheetForm.elements;
    f.text.value = t.text;
    f.due.value = t.due || "";
    f.tag.value = t.tag || "";
    f.notes.value = t.notes || "";
    $$('input[name="quadrant"]', sheetForm).forEach(function (r) { r.checked = r.value === t.quadrant; });
    $$('input[name="effort"]', sheetForm).forEach(function (r) { r.checked = r.value === t.effort; });
    var why = $("#sheet-why");
    why.hidden = !(t.review && t.why);
    why.textContent = t.review && t.why ? "Sorted by a guess: " + t.why : "";
    sheetMeta(t);
    if (typeof sheet.showModal === "function") sheet.showModal(); else sheet.setAttribute("open", "");
    f.text.focus();
    f.text.setSelectionRange(f.text.value.length, f.text.value.length);
  }
  function sheetMeta(t) {
    var eff = (sheetForm.querySelector('input[name="effort"]:checked') || {}).value || t.effort;
    var q = (sheetForm.querySelector('input[name="quadrant"]:checked') || {}).value || t.quadrant;
    var pts = t.completed ? t.points : EFFORT[eff].pts + (q === "do" ? DO_BONUS : 0);
    $("#sheet-meta").textContent =
      "Created " + new Date(t.created).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) +
      (t.completed ? ". Completed " + new Date(t.completed).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + ", earned " + plural(pts, "point") + "."
                   : ". Worth " + plural(pts, "point") + " when done.");
  }
  sheetForm.addEventListener("change", function () { var t = find(sheetId); if (t) sheetMeta(t); });
  sheetForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (e.submitter && e.submitter.value !== "save") return closeDialog(sheet);
    var t = find(sheetId); if (!t) return closeDialog(sheet);
    var f = sheetForm.elements;
    var text = f.text.value.replace(/\s+/g, " ").trim();
    if (!text) { f.text.focus(); return; }
    var q = (sheetForm.querySelector('input[name="quadrant"]:checked') || {}).value || t.quadrant;
    if (q !== t.quadrant) t.review = false;
    t.text = text; t.quadrant = q;
    t.effort = (sheetForm.querySelector('input[name="effort"]:checked') || {}).value || t.effort;
    t.due = isoOrNull(f.due.value);
    t.tag = f.tag.value.replace(/^#/, "").trim().slice(0, 40);
    t.notes = f.notes.value.slice(0, 4000);
    save();
    closeDialog(sheet);
    render();
  });
  $("#sheet-delete").addEventListener("click", function () {
    var id = sheetId; closeDialog(sheet); remove(id);
  });

  function closeDialog(d) {
    if (typeof d.close === "function" && d.open) d.close(); else d.removeAttribute("open");
  }
  $$("[data-close]").forEach(function (b) { b.addEventListener("click", function () { closeDialog(b.closest("dialog")); }); });
  $$("dialog").forEach(function (d) {
    d.addEventListener("close", function () {
      if (d === sheet && sheetReturn && document.body.contains(sheetReturn)) sheetReturn.focus();
    });
    /* Click on the backdrop closes. */
    d.addEventListener("click", function (e) { if (e.target === d) closeDialog(d); });
  });

  /* ------------------------------------------------------------------
     MENU: backup, sound, shortcuts
     ------------------------------------------------------------------ */
  var menuBtn = $("#menu-btn"), menuPop = $("#menu-pop");
  function closeMenu() { menuPop.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }
  menuBtn.addEventListener("click", function () {
    var open = menuPop.hidden;
    menuPop.hidden = !open; menuBtn.setAttribute("aria-expanded", String(open));
    if (open) $("button", menuPop).focus();
  });
  menuPop.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeMenu(); menuBtn.focus(); } });
  menuPop.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.getAttribute("data-act");
    if (act === "export") { exportBackup(); closeMenu(); }
    if (act === "import") { $("#import-file").click(); closeMenu(); }
    if (act === "sound") {
      state.settings.sound = !state.settings.sound; save(); syncSound();
      if (state.settings.sound) chime();
    }
    if (act === "keys") { closeMenu(); var k = $("#keys"); if (k.showModal) k.showModal(); else k.setAttribute("open", ""); }
  });
  function syncSound() {
    var b = $('[data-act="sound"]', menuPop);
    b.setAttribute("aria-pressed", String(state.settings.sound));
    $("[data-sound-state]", b).textContent = state.settings.sound ? "on" : "off";
  }

  function exportBackup() {
    var payload = { app: "docket", format: 1, exported: new Date().toISOString(),
                    tasks: state.tasks, rewards: state.rewards, ledger: state.ledger, settings: state.settings };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "docket-backup-" + todayIso() + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast("Backup saved: " + plural(state.tasks.length, "task") + ", " + plural(state.rewards.length, "reward") + ".");
  }

  $("#import-file").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0]; e.target.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed = null;
      try { parsed = sanitize(JSON.parse(reader.result)); } catch (err) { parsed = null; }
      if (!parsed) { toast("That file is not a Docket backup. Nothing was changed."); return; }
      var msg = "Replace the current docket (" + plural(state.tasks.length, "task") + ", " + balance() + " points) with this backup (" +
                plural(parsed.tasks.length, "task") + ")?";
      if (state.tasks.length && !window.confirm(msg)) return;
      var before = state;
      state = parsed; save(); syncSound(); render();
      toast("Backup restored.", "Undo", function () { state = before; save(); syncSound(); render(); });
    };
    reader.readAsText(file);
  });

  /* ------------------------------------------------------------------
     TOAST + LIVE ANNOUNCEMENTS
     ------------------------------------------------------------------ */
  var toastEl = $("#toast"), toastMsg = $("#toast-msg"), toastAct = $("#toast-act"), toastTimer = null, toastFn = null;
  function toast(msg, actLabel, fn) {
    toastMsg.textContent = msg;
    toastFn = fn || null;
    toastAct.hidden = !fn;
    toastAct.textContent = actLabel || "";
    toastEl.hidden = false;
    toastEl.classList.remove("is-in"); void toastEl.offsetWidth; toastEl.classList.add("is-in");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, fn ? 6500 : 3500);
  }
  function hideToast() { toastEl.hidden = true; toastFn = null; }
  toastAct.addEventListener("click", function () { var f = toastFn; hideToast(); if (f) f(); });
  toastEl.addEventListener("mouseenter", function () { clearTimeout(toastTimer); });
  toastEl.addEventListener("mouseleave", function () { toastTimer = setTimeout(hideToast, 2500); });

  /* Completions are announced to screen readers without a visible toast:
     the checkbox is its own undo, and a toast per tick would be noise. */
  var live = $("#live");
  function announce(msg) { live.textContent = ""; setTimeout(function () { live.textContent = msg; }, 30); }

  /* ------------------------------------------------------------------
     KEYBOARD
     ------------------------------------------------------------------ */
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) {
      if (e.key === "Escape" && e.target === quickInput) { quickInput.value = ""; quickOverride = null; updateQuickChip(); quickInput.blur(); }
      return;
    }
    if (document.querySelector("dialog[open]") || !movePop.hidden) return;
    var k = e.key.toLowerCase();
    if (k === "n" || k === "/") { e.preventDefault(); quickInput.focus(); }
    else if (k === "b") { e.preventDefault(); openDump(); }
    else if (k === "m") location.hash = "#/";
    else if (k === "f") location.hash = "#/focus";
    else if (k === "r") location.hash = "#/rewards";
    else if (/^[1-4]$/.test(k)) location.hash = "#/" + ORDER[+k - 1];
    else if (k === "?") { var d = $("#keys"); if (d.showModal) d.showModal(); }
  });

  $("#dump-btn").addEventListener("click", openDump);

  /* A tab left open overnight should roll over to the new day. */
  var shownDay = todayIso();
  setInterval(function () {
    if (todayIso() !== shownDay) { shownDay = todayIso(); if (!document.querySelector("dialog[open]")) render(); }
  }, 60000);

  /* ------------------------------------------------------------------
     GO
     ------------------------------------------------------------------ */
  syncSound();
  render();
})();
