/* =====================================================================
   ORBITAL — shared theme + site chrome
   ---------------------------------------------------------------------
   Load this in <head> WITHOUT defer, so the theme is set before the
   first paint and there is no flash of the wrong world.

     <link rel="stylesheet" href="../assets/orbital.css">
     <script src="../assets/orbital.js"
             data-title="EVOLUTION IN A FLASK"
             data-tag="LTEE / 12 POPULATIONS"></script>

   Options, all optional, read off the <script> tag:
     data-title   breadcrumb label for this page
     data-tag     small right-hand identifier
     data-chrome  "off" to suppress the injected bar

   Public API:
     Orbital.theme()          -> "day" | "night"
     Orbital.setTheme(t)
     Orbital.toggle()
     Orbital.color(name)      -> resolved value of --rf-<name>
     Orbital.onThemeChange(fn)
   Also dispatches "orbital:theme" on window.
   ===================================================================== */
(function () {
  "use strict";

  var KEY = "orbital-theme";
  var doc = document.documentElement;
  var script = document.currentScript;

  /* ---- 1. theme, applied immediately ---------------------------- */
  function preferred() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === "day" || saved === "night") return saved;
    } catch (e) {}
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
      ? "night" : "day";
  }

  function setTheme(t, persist) {
    t = (t === "night") ? "night" : "day";
    doc.setAttribute("data-theme", t);
    if (persist !== false) { try { localStorage.setItem(KEY, t); } catch (e) {} }
    paintSwitch(t);
    window.dispatchEvent(new CustomEvent("orbital:theme", { detail: { theme: t } }));
  }

  doc.classList.add("rf-page");
  doc.setAttribute("data-theme", preferred());

  /* ---- 2. helpers ------------------------------------------------ */
  function color(name) {
    return getComputedStyle(doc).getPropertyValue("--rf-" + name).trim();
  }

  function theme() { return doc.getAttribute("data-theme") === "night" ? "night" : "day"; }
  function toggle() { setTheme(theme() === "night" ? "day" : "night"); }

  function onThemeChange(fn) {
    window.addEventListener("orbital:theme", function (e) { fn(e.detail.theme); });
  }

  /* Badge helpers, shared by the catalogue, the methods pages and the
     status strip on each simulation. Kept here so there is exactly one
     definition of what a status looks like. */
  var EV_CLASS = {
    "Historical reconstruction":     "ev-historical",
    "Established mathematical model":"ev-established",
    "Exploratory agent-based model": "ev-exploratory",
    "Calibrated research model":     "ev-calibrated",
    "Uncalibrated prototype":        "ev-prototype"
  };
  var ST_CLASS = { "Playable": "st-playable", "Research preview": "st-preview", "Development": "st-dev" };

  function evidenceBadge(v) {
    return v
      ? '<span class="rf-badge ' + (EV_CLASS[v] || "") + '">' + v + '</span>'
      : '<span class="rf-badge ev-pending" title="No evidentiary status has been assigned yet">Status pending</span>';
  }
  function stateBadge(v) {
    return '<span class="rf-badge ' + (ST_CLASS[v] || "st-dev") + '">' + v + '</span>';
  }
  /* Names the documented work a model is built on. Absent by design for
     anything with no specific published basis — an empty string, not a
     placeholder, because "no source" is not a status worth a chip. */
  function basisBadge(b) {
    if (!b || !b.label) return "";
    var t = b.detail ? ' title="' + b.detail.replace(/"/g, "&quot;") + '"' : "";
    return '<span class="rf-badge basis"' + t + '>' + b.label + '</span>';
  }
  function flagChips(flags) {
    return (flags || []).map(function (f) {
      return '<span class="rf-flag ' + f.toLowerCase() + '">' + f + '</span>';
    }).join("");
  }

  window.Orbital = {
    theme: theme, setTheme: setTheme, toggle: toggle,
    color: color, onThemeChange: onThemeChange,
    evidenceBadge: evidenceBadge, stateBadge: stateBadge,
    basisBadge: basisBadge, flagChips: flagChips
  };

  /* ---- 3. chrome bar --------------------------------------------- */
  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 1.6v2.6M12 19.8v2.6M4.6 4.6l1.9 1.9M17.5 17.5l1.9 1.9M1.6 12h2.6M19.8 12h2.6M4.6 19.4l1.9-1.9M17.5 6.5l1.9-1.9"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.6A8.6 8.6 0 1 1 9.4 3.5a6.9 6.9 0 0 0 11.1 11.1z"/></svg>';
  var MARK = '<svg viewBox="0 0 22 22" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="4"/><ellipse cx="11" cy="11" rx="10" ry="4.2" transform="rotate(-28 11 11)"/></svg>';

  function paintSwitch(t) {
    var sw = document.getElementById("rf-switch");
    if (sw) sw.setAttribute("aria-label", "Switch to " + (t === "night" ? "day" : "night") + " mode");
  }

  function rootPath() {
    // Pages live either at the site root or one directory below it.
    var parts = location.pathname.split("/").filter(Boolean);
    var file = parts[parts.length - 1] || "";
    var depth = /\.html?$/i.test(file) ? parts.length - 1 : parts.length;
    // Heuristic: a simulation page sits in exactly one folder of its own.
    return /\//.test(location.pathname) && depth > 0 && !/^index\.html?$/i.test(file)
      ? "../" : "./";
  }

  /* ---- motion ---------------------------------------------------- */
  var PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  var PLAY  = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>';

  function motionPaused() { return doc.classList.contains("rf-paused"); }

  function toggleMotion() {
    var now = !motionPaused();
    doc.classList.toggle("rf-paused", now);
    var btn = document.getElementById("rf-motion");
    if (btn) {
      btn.innerHTML = (now ? PLAY : PAUSE) + (now ? "Resume" : "Pause");
      btn.setAttribute("aria-pressed", String(now));
      btn.setAttribute("aria-label", (now ? "Resume" : "Pause") + " animation on this page");
    }
    /* If the page has its own run/pause control, drive that too rather
       than leaving two controls disagreeing about the state. */
    var sel = script && script.getAttribute("data-pause-target");
    if (sel) { var t = document.querySelector(sel); if (t) t.click(); }
    window.dispatchEvent(new CustomEvent("orbital:motion", { detail: { paused: now } }));
  }

  /* ---- status strip ---------------------------------------------
     A simulation page states its own evidentiary standing, so the badge
     follows the reader through from the catalogue instead of being left
     behind on the homepage. Driven entirely by assets/catalogue.js.    */
  function buildSimStrip(after) {
    var id = script && script.getAttribute("data-sim");
    if (!id || !window.byId) return;
    var s = window.byId(id);
    if (!s) return;

    var strip = document.createElement("div");
    strip.className = "rf-simstrip";
    strip.innerHTML =
      '<span class="rf-ss-q">' + s.question + '</span>' +
      '<span class="rf-ss-badges">' +
        evidenceBadge(s.evidence) + basisBadge(s.basis) + stateBadge(s.state) + flagChips(s.flags) +
      '</span>' +
      '<span class="rf-ss-v">v' + s.version + ' · ' + s.updated + '</span>' +
      '<a class="rf-ss-m" href="' + s.methods.split("/").pop() + '">Methods &amp; limitations →</a>';

    after.parentNode.insertBefore(strip, after.nextSibling);
  }

  function build() {
    if (script && script.getAttribute("data-chrome") === "off") return;
    if (document.querySelector(".rf-chrome")) return;

    var title = (script && script.getAttribute("data-title")) || "";
    var tag = (script && script.getAttribute("data-tag")) || "";
    var wantsMotion = script && script.getAttribute("data-motion") === "on";
    var isIndex = /(^|\/)(index\.html?)?$/i.test(location.pathname);
    var home = isIndex ? "#top" : rootPath() + "index.html";

    var bar = document.createElement("div");
    bar.className = "rf-chrome";
    bar.innerHTML =
      '<a class="rf-home" href="' + home + '">' + MARK +
        '<span>' + (isIndex ? "Simulations" : "All simulations") + '</span></a>' +
      (title ? '<span class="rf-sep">/</span><span class="rf-here">' + title + '</span>' : '') +
      '<span class="rf-spacer"></span>' +
      (tag ? '<span class="rf-idtag">' + tag + '</span>' : '') +
      (wantsMotion
        ? '<button class="rf-btn rf-motion" id="rf-motion" type="button" aria-pressed="false"' +
          ' aria-label="Pause animation on this page" style="padding:4px 10px;font-size:9.5px">' +
          PAUSE + 'Pause</button>'
        : '') +
      '<button class="rf-switch" id="rf-switch" type="button">' +
        '<span class="rf-sw-day">' + SUN + 'Day</span>' +
        '<span class="rf-sw-night">' + MOON + 'Night</span>' +
      '</button>';

    document.body.insertBefore(bar, document.body.firstChild);
    buildSimStrip(bar);
    document.getElementById("rf-switch").addEventListener("click", toggle);
    var mb = document.getElementById("rf-motion");
    if (mb) {
      mb.addEventListener("click", toggleMotion);
      /* Someone who asked the OS for less motion gets it paused already. */
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        doc.classList.add("rf-paused");
        mb.innerHTML = PLAY + "Resume";
        mb.setAttribute("aria-pressed", "true");
      }
    }
    paintSwitch(theme());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }

  /* ---- 4. keyboard: press "t" to flip the world ------------------- */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "t" && e.key !== "T") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var el = document.activeElement;
    if (el && /^(input|textarea|select)$/i.test(el.tagName)) return;
    if (el && el.isContentEditable) return;
    toggle();
  });
})();
