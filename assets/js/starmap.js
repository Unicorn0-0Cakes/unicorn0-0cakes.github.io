/* =====================================================================
   CC / PORTFOLIO — STAR MAP
   ---------------------------------------------------------------------
   Draws the site as one figure, entirely from data/projects.js:

     core            the portfolio root
     site pages      About, Credentials, Archive — small satellites
     disciplines     one node per wing, on a ring around the core
     stars           one per curated project, fanned out from its wing
     offsite marks   dashed spurs to anything that leaves this site

   Nothing is hardcoded except the geometry. Add a project to the
   registry and a star appears; set it to "hidden" and the star goes.

   The same content is rendered as a nested list by index(), which is
   what a screen reader or a visitor without JavaScript relies on. The
   figure is the second view, not the only one.
   ===================================================================== */
(function () {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";

  /* ---- geometry ---------------------------------------------------- */
  var CX = 500, CY = 500;
  var R_PAGE   = 96;    /* site pages orbiting the core           */
  var R_DISC   = 250;   /* the discipline ring                    */
  var R_LABEL  = 208;   /* discipline labels, inside their nodes  */
  var R_ARC1   = 56;    /* first arc of stars around a discipline */
  var R_ARC2   = 98;    /* second arc, when a wing has many       */
  var ARC_MAX  = 62;    /* half-spread of a constellation, degrees*/
  var R_BEACON = 424;   /* offsite destinations                   */
  var SPUR     = 17;    /* star to its live-demo mark             */

  var STAR_R = { showcase: 7, prototype: 5.5, research: 5.5, workshop: 4.2 };

  function rad(deg) { return (deg - 90) * Math.PI / 180; }
  function px(cx, cy, r, deg) {
    return [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
  }
  function el(name, attrs) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) {
      if (attrs.hasOwnProperty(k) && attrs[k] != null) n.setAttribute(k, String(attrs[k]));
    }
    return n;
  }
  /* An accessible name for a node, spoken instead of its shapes. */
  function titled(node, text) {
    var t = el("title"); t.textContent = text;
    node.insertBefore(t, node.firstChild);
    return node;
  }
  function anchorFor(deg) {
    var a = ((deg % 360) + 360) % 360;
    if (a > 12 && a < 168) return "start";
    if (a > 192 && a < 348) return "end";
    return "middle";
  }
  /* Discipline labels sit between the core and their node, so they must
     read back towards the core — anchoring them outward would run the
     text straight through the constellation they belong to. */
  function anchorInward(deg) {
    var a = anchorFor(deg);
    return a === "start" ? "end" : a === "end" ? "start" : "middle";
  }

  var U = (window.CCShell && window.CCShell.url) || function (x) { return x; };
  var CC = window.CC || {};

  function catPath(c) { return (c && c.path) || "/" + (c && c.id) + "/"; }

  function projects(catId) {
    return CC.curated ? CC.curated(CC.byCategory(catId)) : [];
  }

  /* Where a star sends you: its case study if it has one, otherwise the
     best link it does have. Same rule the cards use, so the map and the
     wings never disagree about where a project lives. */
  function target(p) {
    if (p.caseStudy) return { href: U(p.caseStudy), kind: "case study" };
    if (p.links && p.links.live) return { href: p.links.live, kind: "live demo" };
    if (p.links && p.links.source) return { href: p.links.source, kind: "source" };
    return null;
  }
  function isOffsite(href) {
    return /^https?:\/\//.test(href) && href.indexOf(location.origin) !== 0;
  }

  var SITE_PAGES = [
    { href: "/about/", label: "About", deg: 90 },
    { href: "/about/credentials/", label: "Credentials", deg: 141 },
    { href: "/archive/", label: "Archive", deg: 39 }
  ];

  /* ------------------------------------------------------------------
     THE FIGURE
     ------------------------------------------------------------------ */
  function map(selector, readoutSelector) {
    var host = document.querySelector(selector);
    if (!host) return;
    var CATS = (window.CATEGORIES || []).filter(function (c) { return c.nav !== false; });
    if (!CATS.length) return;

    var svg = el("svg", {
      class: "starmap", viewBox: "0 0 1000 1000",
      role: "group", "aria-label": "Star map of the portfolio. Every destination on it is also listed below."
    });

    var gLines = el("g"), gNodes = el("g");

    /* guide ring */
    gLines.appendChild(el("circle", { class: "sm-ring", cx: CX, cy: CY, r: R_DISC }));

    var readout = document.querySelector(readoutSelector);
    function say(title, detail, where) {
      if (!readout) return;
      readout.innerHTML =
        '<dt>Selected</dt><dd>' + esc(title) + "</dd>" +
        '<dt>What it is</dt><dd>' + esc(detail) + "</dd>" +
        '<dt>Opens</dt><dd>' + esc(where) + "</dd>";
    }
    function clear() {
      if (!readout) return;
      readout.innerHTML =
        '<dt>Selected</dt><dd class="sm-readout__hint">Nothing yet</dd>' +
        '<dt>What it is</dt><dd class="sm-readout__hint">Point at or tab to a node to read it here.</dd>' +
        '<dt>Opens</dt><dd class="sm-readout__hint">—</dd>';
    }
    function esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function wire(a, title, detail, where) {
      a.addEventListener("mouseenter", function () { say(title, detail, where); });
      a.addEventListener("focus", function () { say(title, detail, where); });
      a.addEventListener("mouseleave", clear);
      a.addEventListener("blur", clear);
    }
    clear();

    /* ---- core ----------------------------------------------------- */
    var core = el("a", { class: "sm-core", href: U("/") });
    core.appendChild(el("circle", { class: "sm-focusable", cx: CX, cy: CY, r: 30 }));
    var coreLabel = el("text", { x: CX, y: CY });
    coreLabel.textContent = "SYSTEMS";
    core.appendChild(coreLabel);
    titled(core, "Portfolio home");
    wire(core, "Systems — the core", "The homepage. Every wing shares one shell, one status vocabulary and one registry.", "The portfolio home page");
    gNodes.appendChild(core);

    /* ---- site pages ----------------------------------------------- */
    SITE_PAGES.forEach(function (s) {
      var pt = px(CX, CY, R_PAGE, s.deg);
      gLines.appendChild(el("line", { class: "sm-tether", x1: CX, y1: CY, x2: pt[0], y2: pt[1] }));
      var a = el("a", { class: "sm-page", href: U(s.href) });
      a.appendChild(el("circle", { class: "sm-focusable", cx: pt[0], cy: pt[1], r: 5 }));
      var lp = px(CX, CY, R_PAGE + 15, s.deg);
      var t = el("text", { x: lp[0], y: lp[1] + 3, "text-anchor": anchorFor(s.deg) });
      t.textContent = s.label;
      a.appendChild(t);
      titled(a, s.label);
      wire(a, s.label, "A standing page of the site, not a project.", s.href);
      gNodes.appendChild(a);
    });

    /* ---- disciplines and their constellations ---------------------- */
    var step = 360 / CATS.length;

    CATS.forEach(function (c, i) {
      var deg = i * step;
      var node = px(CX, CY, R_DISC, deg);
      var accent = "var(" + c.accent + ")";
      var list = projects(c.id);

      gLines.appendChild(el("line", { class: "sm-spoke", x1: CX, y1: CY, x2: node[0], y2: node[1] }));

      /* the wing itself */
      var a = el("a", { class: "sm-disc", href: U(catPath(c)), style: "--sm-accent:" + accent });
      a.appendChild(el("circle", { class: "sm-focusable", cx: node[0], cy: node[1], r: 10 }));
      var lp = px(CX, CY, R_LABEL, deg);
      var anchor = anchorInward(deg);
      var name = el("text", { class: "sm-disc__name", x: lp[0], y: lp[1], "text-anchor": anchor });
      name.textContent = c.name;
      var n = el("text", { class: "sm-disc__n", x: lp[0], y: lp[1] + 13, "text-anchor": anchor });
      n.textContent = list.length + (list.length === 1 ? " project" : " projects");
      a.appendChild(name); a.appendChild(n);
      titled(a, c.name + " — " + list.length + " projects");
      wire(a, c.name, c.tagline, catPath(c));
      gNodes.appendChild(a);

      /* its stars */
      var split = list.length > 5;
      var inner = split ? list.slice(0, Math.ceil(list.length / 2)) : list;
      var outer = split ? list.slice(Math.ceil(list.length / 2)) : [];

      [[inner, R_ARC1], [outer, R_ARC2]].forEach(function (pair) {
        var arr = pair[0], r = pair[1];
        if (!arr.length) return;
        var spread = arr.length === 1 ? 0 : Math.min(ARC_MAX * 2, arr.length * 22);
        arr.forEach(function (p, j) {
          var off = arr.length === 1 ? 0 : -spread / 2 + (spread / (arr.length - 1)) * j;
          var sdeg = deg + off;
          var sp = px(node[0], node[1], r, sdeg);
          var tgt = target(p);
          var rr = STAR_R[p.portfolioStatus] || 5;

          gLines.appendChild(el("line", {
            class: "sm-tether", x1: node[0], y1: node[1], x2: sp[0], y2: sp[1]
          }));

          var sa = el("a", {
            class: "sm-star", style: "--sm-accent:" + accent,
            href: tgt ? tgt.href : U(catPath(c))
          });
          if (tgt && isOffsite(tgt.href)) { sa.setAttribute("rel", "noopener"); }
          sa.appendChild(el("circle", { class: "sm-star__hit", cx: sp[0], cy: sp[1], r: 15 }));
          sa.appendChild(el("circle", { class: "sm-star__dot", cx: sp[0], cy: sp[1], r: rr }));
          if (p.links && p.links.live) {
            sa.appendChild(el("circle", { class: "sm-star__halo", cx: sp[0], cy: sp[1], r: rr + 4.5 }));
          }
          var tp = px(node[0], node[1], r + rr + 9, sdeg);
          var st = el("text", { x: tp[0], y: tp[1] + 3, "text-anchor": anchorFor(sdeg) });
          st.textContent = p.title;
          sa.appendChild(st);
          titled(sa, p.title + " — " + c.name);
          wire(sa, p.title,
               (p.portfolioStatus || "").replace(/^./, function (m) { return m.toUpperCase(); }) +
                 " · " + c.name + (p.year ? " · " + p.year : ""),
               tgt ? (tgt.kind + (isOffsite(tgt.href) ? " (leaves this site)" : "")) : c.name + " wing");
          gNodes.appendChild(sa);

          /* the spur out to a live demo that is hosted elsewhere */
          if (p.links && p.links.live && isOffsite(p.links.live)) {
            var op = px(node[0], node[1], r + rr + SPUR, sdeg);
            gLines.appendChild(el("line", {
              class: "sm-offsite", x1: sp[0], y1: sp[1], x2: op[0], y2: op[1]
            }));
            var oa = el("a", { class: "sm-out", href: p.links.live, rel: "noopener" });
            oa.appendChild(el("rect", {
              class: "sm-focusable", x: op[0] - 3.6, y: op[1] - 3.6, width: 7.2, height: 7.2,
              transform: "rotate(45 " + op[0] + " " + op[1] + ")"
            }));
            titled(oa, "Run " + p.title + " — opens the live version, off this site");
            wire(oa, p.title + " — live", "The working version, hosted outside this site.", "Leaves the portfolio");
            gNodes.appendChild(oa);
          }
        });
      });
    });

    /* ---- offsite beacons ------------------------------------------- */
    var gap = step / 2;
    var beacons = [
      { deg: gap, from: 0, label: "Simulations atlas",
        href: (window.CCShell && window.CCShell.SIM_SITE) || "https://unicorn0-0cakes.github.io/simulations/",
        detail: "The instruments in their own repository, with every taxonomy and a methods page each." },
      { deg: 2.5 * step, label: "GitHub",
        href: (window.CCShell && window.CCShell.GITHUB) || "https://github.com/Unicorn0-0Cakes",
        detail: "Source repositories. Being public is not the same as being on this portfolio." },
      { deg: 4.5 * step, label: "LinkedIn",
        href: "https://www.linkedin.com/in/candice-cantrelle",
        detail: "Professional profile." }
    ];
    beacons.forEach(function (b) {
      var bp = px(CX, CY, R_BEACON, b.deg);
      /* Where the dashed line starts: at its own spoke normally, or at a
         discipline node when the destination belongs to that wing. */
      var edge = b.from != null
        ? px(CX, CY, R_DISC, b.from)
        : px(CX, CY, R_DISC + 12, b.deg);
      gLines.appendChild(el("line", {
        class: "sm-offsite", x1: edge[0], y1: edge[1], x2: bp[0], y2: bp[1]
      }));
      var a = el("a", { class: "sm-out", href: b.href, rel: "noopener" });
      a.appendChild(el("circle", { class: "sm-focusable", cx: bp[0], cy: bp[1], r: 6 }));
      var lp = px(CX, CY, R_BEACON + 14, b.deg);
      var t = el("text", { x: lp[0], y: lp[1] + 3, "text-anchor": anchorFor(b.deg) });
      t.textContent = b.label;
      a.appendChild(t);
      titled(a, b.label + " — leaves this site");
      wire(a, b.label, b.detail, "Leaves the portfolio");
      gNodes.appendChild(a);
    });

    svg.appendChild(gLines);
    svg.appendChild(gNodes);
    host.innerHTML = "";
    host.appendChild(svg);

    /* Fit the frame to what was actually drawn. The extent depends on how
       many projects each wing has and how long their names are, so it is
       measured rather than guessed — otherwise a lopsided registry leaves
       a band of empty sky on one side. Hover labels are laid out even
       while transparent, so they are counted here too. */
    try {
      var bb = svg.getBBox();
      var pad = 16;
      svg.setAttribute("viewBox", [
        Math.round(bb.x - pad), Math.round(bb.y - pad),
        Math.round(bb.width + pad * 2), Math.round(bb.height + pad * 2)
      ].join(" "));
    } catch (e) { /* no layout available; the square default still works */ }
  }

  /* ------------------------------------------------------------------
     THE SAME MAP, AS A LIST
     ------------------------------------------------------------------ */
  var LINK_LABEL = {
    live: "Live", methods: "Methods", source: "Source",
    docs: "Docs", notebook: "Notebook", upstream: "Upstream"
  };

  function index(selector) {
    var host = document.querySelector(selector);
    if (!host) return;
    var CATS = (window.CATEGORIES || []).filter(function (c) { return c.nav !== false; });
    var esc = CC.esc || function (s) { return String(s == null ? "" : s); };

    /* Appended, not assigned: the host already carries the site's standing
       pages as plain HTML, so those survive even if this never runs. */
    host.insertAdjacentHTML("beforeend", CATS.map(function (c) {
      var list = projects(c.id);
      return '<li style="--sm-accent: var(' + c.accent + ')">' +
        '<h3><a href="' + U(catPath(c)) + '">' + esc(c.name) + "</a></h3>" +
        "<ul>" + list.map(function (p) {
          var tgt = target(p);
          var links = Object.keys(p.links || {}).map(function (k) {
            var href = p.links[k];
            if (!href) return "";
            return '<a href="' + esc(href) + '"' +
                   (isOffsite(href) ? ' rel="noopener"' : "") + ">" +
                   esc(LINK_LABEL[k] || k) + "</a>";
          }).filter(Boolean).join("");
          return "<li>" +
            '<span class="sm-index__title">' +
              (tgt ? '<a href="' + esc(tgt.href) + '">' + esc(p.title) + "</a>" : esc(p.title)) +
            "</span>" +
            (links ? '<span class="sm-index__links">' + links + "</span>" : "") +
          "</li>";
        }).join("") + "</ul>" +
      "</li>";
    }).join(""));
  }

  window.CCStarMap = { map: map, index: index };
})();
