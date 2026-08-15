/* =====================================================================
   CC / PORTFOLIO — SHELL
   ---------------------------------------------------------------------
   Loaded synchronously in <head> so the theme is resolved before first
   paint. Everything else waits for DOMContentLoaded.

   The header and footer are injected rather than duplicated into forty
   HTML files, so the navigation can never drift out of sync between
   wings. If JavaScript fails, the page content is still entirely
   readable — only the chrome is missing, and every page carries a
   plain-HTML fallback link home.
   ===================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------
     0. BASE — where this site is mounted on its host.
     ---------------------------------------------------------------------
     Derived from this script's own URL rather than hardcoded, so the same
     files work unchanged at a domain root, a user site, or a project
     subpath. Move the site and nothing
     here needs editing.
     ------------------------------------------------------------------ */
  var BASE = (function () {
    var s = document.currentScript;
    var src = s && s.src ? s.src : null;
    if (!src) {
      var all = document.getElementsByTagName("script");
      for (var i = all.length - 1; i >= 0; i--) {
        if (all[i].src && all[i].src.indexOf("assets/js/shell.js") !== -1) {
          src = all[i].src;
          break;
        }
      }
    }
    if (!src) return "/";
    try { return new URL("../../", src).pathname; } catch (e) { return "/"; }
  })();

  /* Resolve a site-absolute path ("/design/") against that base. */
  function U(p) {
    if (typeof p !== "string" || p.charAt(0) !== "/") return p;
    return BASE + p.slice(1);
  }

  /* ------------------------------------------------------------------
     1. THEME — resolved before paint, so no flash.
     ------------------------------------------------------------------ */
  var STORE = "cc-theme";

  function readStored() {
    try { return localStorage.getItem(STORE); } catch (e) { return null; }
  }
  function writeStored(v) {
    try { localStorage.setItem(STORE, v); } catch (e) { /* private mode */ }
  }
  function systemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "night" : "day";
  }

  var theme = readStored() || systemTheme();
  document.documentElement.setAttribute("data-theme", theme);

  function setTheme(next) {
    theme = next;
    document.documentElement.setAttribute("data-theme", next);
    writeStored(next);
    var btn = document.querySelector(".theme-btn");
    if (btn) btn.setAttribute("aria-label", next === "night" ? "Switch to day theme" : "Switch to night theme");
  }

  /* Follow the OS only while the visitor has not chosen for themselves. */
  if (!readStored() && window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function (e) { if (!readStored()) setTheme(e.matches ? "night" : "day"); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ------------------------------------------------------------------
     2. MARKUP
     ------------------------------------------------------------------ */
  var NAV = [
    { href: "/simulation/",  label: "Simulations" },
    { href: "/ai-ml/",       label: "AI + ML" },
    { href: "/software/",    label: "Software" },
    { href: "/research/",    label: "Research" },
    { href: "/games/",       label: "Games" },
    { href: "/design/",      label: "Design" },
    { href: "/workshop/",    label: "Workshop" },
    { href: "/about/",       label: "About" },
    { href: "/map/",         label: "Star map" }
  ];

  var GITHUB   = "https://github.com/Unicorn0-0Cakes";
  var SIM_SITE = "https://unicorn0-0cakes.github.io/simulations/";

  function wordmark(cls) {
    return '<a class="wordmark ' + (cls || "") + '" href="' + BASE + '">' +
             '<em>CC</em><span class="slash">/</span>' +
             '<span class="sub">Portfolio</span>' +
           "</a>";
  }

  function header(current) {
    var items = NAV.map(function (n) {
      var isCurrent = current === n.href;
      return '<li><a class="nav__link" href="' + U(n.href) + '"' +
             (isCurrent ? ' aria-current="page"' : "") + ">" + n.label + "</a></li>";
    }).join("");

    return '' +
      '<a class="skip-link" href="#main">Skip to content</a>' +
      '<header class="mast">' +
        '<div class="wrap mast__inner">' +
          wordmark() +
          '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">' +
            '<span class="bars" aria-hidden="true"><span></span></span>Menu' +
          "</button>" +
          '<nav class="nav" id="site-nav" aria-label="Primary">' +
            '<ul class="nav__list">' + items +
              '<li aria-hidden="true"><span class="nav__sep"></span></li>' +
              '<li><a class="nav__link" href="' + GITHUB + '" rel="noopener" data-ext>GitHub</a></li>' +
              '<li>' + themeButton() + "</li>" +
            "</ul>" +
          "</nav>" +
        "</div>" +
      "</header>";
  }

  function themeButton() {
    return '<button class="theme-btn" type="button" aria-label="' +
      (theme === "night" ? "Switch to day theme" : "Switch to night theme") + '">' +
      '<svg class="i-day" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/>' +
      "</svg>" +
      '<svg class="i-night" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
        '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z"/>' +
      "</svg>" +
    "</button>";
  }

  function footer() {
    return '' +
      '<footer class="foot">' +
        '<div class="wrap">' +
          '<div class="foot__grid">' +
            '<div class="foot__brand">' +
              wordmark() +
              "<p>The medium changes. The systems thinking does not.</p>" +
            "</div>" +
            "<div>" +
              "<h2>Work</h2><ul>" +
                '<li><a href="' + U("/simulation/") + '">Simulations</a></li>' +
                '<li><a href="' + U("/ai-ml/") + '">AI + ML</a></li>' +
                '<li><a href="' + U("/software/") + '">Software</a></li>' +
                '<li><a href="' + U("/research/") + '">Research</a></li>' +
                '<li><a href="' + U("/games/") + '">Games</a></li>' +
              "</ul>" +
            "</div>" +
            "<div>" +
              "<h2>More</h2><ul>" +
                '<li><a href="' + U("/design/") + '">Design</a></li>' +
                '<li><a href="' + U("/workshop/") + '">Workshop</a></li>' +
                '<li><a href="' + U("/about/") + '">About</a></li>' +
                '<li><a href="' + U("/about/#credentials") + '">Credentials</a></li>' +
                '<li><a href="' + U("/map/") + '">Star map</a></li>' +
              "</ul>" +
            "</div>" +
            "<div>" +
              "<h2>Elsewhere</h2><ul>" +
                '<li><a href="' + GITHUB + '" rel="noopener" data-ext>GitHub</a></li>' +
                '<li><a href="https://www.linkedin.com/in/candice-cantrelle" rel="noopener" data-ext>LinkedIn</a></li>' +
                '<li><a href="' + SIM_SITE + '" rel="noopener" data-ext>Simulations atlas</a></li>' +
              "</ul>" +
            "</div>" +
          "</div>" +
          '<div class="foot__bottom">' +
            "<span>© <span data-year></span> Candice Cantrelle</span>" +
            "<span>Built as static HTML. No framework, no tracking, no build step.</span>" +
          "</div>" +
        "</div>" +
      "</footer>";
  }

  /* ------------------------------------------------------------------
     3. MOUNT
     ------------------------------------------------------------------ */
  function currentSection() {
    var p = location.pathname;
    for (var i = 0; i < NAV.length; i++) {
      var full = U(NAV[i].href);
      if (p === full || p.indexOf(full) === 0) return NAV[i].href;
    }
    return null;
  }

  function mount() {
    var h = document.querySelector("[data-shell-header]");
    var f = document.querySelector("[data-shell-footer]");
    if (h) h.outerHTML = header(currentSection());
    if (f) f.outerHTML = footer();

    var y = document.querySelector("[data-year]");
    if (y) y.textContent = String(new Date().getFullYear());

    var btn = document.querySelector(".theme-btn");
    if (btn) btn.addEventListener("click", function () {
      setTheme(theme === "night" ? "day" : "night");
    });

    var toggle = document.querySelector(".nav-toggle");
    var nav = document.getElementById("site-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!open));
        nav.setAttribute("data-open", String(!open));
      });
      /* Escape closes it, and focus returns to the control that opened it. */
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
          toggle.setAttribute("aria-expanded", "false");
          nav.setAttribute("data-open", "false");
          toggle.focus();
        }
      });
    }

    /* Mark every off-site link, so the ↗ never has to be typed by hand. */
    var links = document.querySelectorAll('a[href^="http"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.hostname && a.hostname !== location.hostname && !a.hasAttribute("data-ext")) {
        a.setAttribute("data-ext", "");
        a.setAttribute("rel", "noopener");
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  window.CCShell = { setTheme: setTheme, NAV: NAV, GITHUB: GITHUB, SIM_SITE: SIM_SITE, base: BASE, url: U };
})();
