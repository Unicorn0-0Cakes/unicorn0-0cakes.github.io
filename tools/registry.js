/* =====================================================================
   CC / PORTFOLIO — READING THE REGISTRY FROM NODE
   ---------------------------------------------------------------------
   data/projects.js is written for the browser: it assigns onto `window`
   and has no imports, so that a page can load it with a plain <script>
   tag and no build step. That is the right shape for the site and the
   wrong shape for a Node script, so this module evaluates it against a
   fake `window` and hands back the four collections.

   Nothing here parses the file with a regular expression. The registry
   is JavaScript, so it is executed as JavaScript — a syntax error in it
   fails loudly here rather than silently on the live site.
   ===================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

function load() {
  const src = fs.readFileSync(path.join(ROOT, "data", "projects.js"), "utf8");
  const sandbox = { window: {}, module: undefined, console };
  vm.createContext(sandbox);
  try {
    vm.runInContext(src, sandbox, { filename: "data/projects.js" });
  } catch (e) {
    throw new Error("data/projects.js did not evaluate: " + e.message);
  }
  const w = sandbox.window;
  for (const key of ["PROJECTS", "CATEGORIES", "SELECTED", "STATUS_COPY"]) {
    if (!w[key]) throw new Error("data/projects.js did not export " + key);
  }
  return {
    PROJECTS: w.PROJECTS,
    CATEGORIES: w.CATEGORIES,
    SELECTED: w.SELECTED,
    STATUS_COPY: w.STATUS_COPY,
    /* The same fail-closed rule the browser uses, so a tool can never
       report a project as published that the site would not render. */
    visible: () => w.PROJECTS.filter((p) => p.visibility === "public"),
    byCategory: (id) =>
      w.PROJECTS.filter((p) => p.visibility === "public" && p.category === id),
    navCategories: () => w.CATEGORIES.filter((c) => c.nav !== false),
    catPath: (c) => c.path || "/" + c.id + "/"
  };
}

/* Tier order matches cards.js: the strongest work leads. */
const TIER = { showcase: 1, prototype: 2, research: 2, workshop: 3 };
function curated(list) {
  return list.slice().sort((a, b) => (TIER[a.portfolioStatus] || 9) - (TIER[b.portfolioStatus] || 9));
}

function primaryHref(p) {
  if (p.caseStudy) return p.caseStudy;
  if (p.links && p.links.live) return p.links.live;
  if (p.links && p.links.source) return p.links.source;
  return null;
}

const escapeHtml = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

module.exports = { ROOT, load, curated, primaryHref, escapeHtml, TIER };
