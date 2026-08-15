#!/usr/bin/env node
/* =====================================================================
   CC / PORTFOLIO — VALIDATOR
   ---------------------------------------------------------------------
       node tools/validate-site.js

   Exit 0 if the site is internally consistent, 1 if it is not.

   This exists because every rule the portfolio makes about itself is a
   rule a future edit can quietly break: that the registry is the single
   source of truth, that nothing unlisted renders, that no page points at
   a file that is not there, that the old domain is gone. A promise the
   repository cannot check is a promise that decays.

   No dependencies. Node's standard library only, so it runs anywhere
   Node runs and needs no install step in CI.
   ===================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { ROOT, load, primaryHref } = require("./registry");

const SITE = "https://unicorn0-0cakes.github.io";
const VALID_STATUS = ["showcase", "prototype", "research", "workshop"];
const VALID_VISIBILITY = ["public", "unlisted"];

const problems = [];
const notes = [];
let checks = 0;

function fail(group, message) { problems.push({ group, message }); }
function ok() { checks++; }
function note(message) { notes.push(message); }

/* ------------------------------------------------------------------ */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
const allFiles = walk(ROOT);
const htmlFiles = allFiles.filter((f) => f.endsWith(".html") && !rel(f).startsWith("tools/"));
const exists = (p) => fs.existsSync(path.join(ROOT, p.replace(/^\//, "")));

/* Resolve a site path to something on disk, allowing directory URLs. */
function resolvesOnDisk(p) {
  const clean = p.split("#")[0].split("?")[0];
  if (!clean.startsWith("/")) return null;
  if (exists(clean)) return true;
  if (clean.endsWith("/") && exists(clean + "index.html")) return true;
  return false;
}

/* =====================================================================
   1. THE REGISTRY
   ===================================================================== */
const reg = load();
const { PROJECTS, CATEGORIES, SELECTED } = reg;
const catIds = new Set(CATEGORIES.map((c) => c.id));
const seen = new Map();

for (const p of PROJECTS) {
  const where = `project "${p.id || "(no id)"}"`;

  if (!p.id) fail("registry", "a project has no id");
  else if (seen.has(p.id)) fail("registry", `duplicate id "${p.id}"`);
  else seen.set(p.id, p);

  if (!p.title) fail("registry", `${where} has no title`);
  if (!p.summary) fail("registry", `${where} has no summary`);

  if (!catIds.has(p.category)) {
    fail("registry", `${where} has unknown category "${p.category}" ` +
      `(valid: ${[...catIds].join(", ")})`);
  }
  if (!VALID_STATUS.includes(p.portfolioStatus)) {
    fail("registry", `${where} has invalid portfolioStatus "${p.portfolioStatus}" ` +
      `(valid: ${VALID_STATUS.join(", ")})`);
  }
  if (!VALID_VISIBILITY.includes(p.visibility)) {
    fail("registry", `${where} has invalid visibility "${p.visibility}" ` +
      `(valid: ${VALID_VISIBILITY.join(", ")}) — a record without a valid ` +
      "visibility never renders, which is safe but almost certainly a typo");
  }
  if (p.visibility === "private") {
    fail("registry", `${where} uses visibility "private". This file is public; ` +
      'use "unlisted" and keep genuinely private material out of it entirely');
  }
}
ok();

/* Nothing unlisted may reach a visible collection. */
const visibleIds = new Set(reg.visible().map((p) => p.id));
for (const p of PROJECTS) {
  if (p.visibility !== "public" && visibleIds.has(p.id)) {
    fail("registry", `unlisted project "${p.id}" is in the visible collection`);
  }
}
ok();

/* Selected work */
for (const id of SELECTED) {
  const p = seen.get(id);
  if (!p) { fail("selected", `selected work lists "${id}", which is not in the registry`); continue; }
  if (p.visibility !== "public") {
    fail("selected", `selected work lists "${id}", which is not public (${p.visibility})`);
  }
}
if (new Set(SELECTED).size !== SELECTED.length) fail("selected", "selected work has duplicate ids");
ok();

/* Categories */
for (const c of CATEGORIES) {
  if (!c.id || !c.name || !c.accent) fail("registry", `category "${c.id}" is missing id, name or accent`);
  const p = reg.catPath(c);
  if (c.nav !== false && !resolvesOnDisk(p)) {
    fail("paths", `category "${c.id}" points at ${p}, which does not exist on disk`);
  }
}
ok();

/* =====================================================================
   2. PATHS THE REGISTRY POINTS AT
   ===================================================================== */
for (const p of reg.visible()) {
  if (p.caseStudy && !resolvesOnDisk(p.caseStudy)) {
    fail("paths", `"${p.id}" case study ${p.caseStudy} does not exist`);
  }
  if (p.image && !resolvesOnDisk(p.image)) {
    fail("paths", `"${p.id}" image ${p.image} does not exist`);
  }
  for (const [kind, href] of Object.entries(p.links || {})) {
    if (!href) continue;
    if (href.startsWith("/") && !resolvesOnDisk(href)) {
      fail("paths", `"${p.id}" ${kind} link ${href} does not exist on this site`);
    }
  }
  if (!primaryHref(p) && p.portfolioStatus !== "workshop") {
    note(`"${p.id}" has no case study and no links — its card will not be clickable`);
  }
}
ok();

/* =====================================================================
   3. PAGE METADATA
   ===================================================================== */
const REQUIRED_META = [
  ["<title>", /<title>[^<]+<\/title>/],
  ["meta description", /<meta name="description" content="[^"]+"/],
  ["canonical", /<link rel="canonical" href="[^"]+"/],
  ["og:title", /<meta property="og:title" content="[^"]+"/],
  ["og:description", /<meta property="og:description" content="[^"]+"/],
  ["og:url", /<meta property="og:url" content="[^"]+"/],
  ["og:image", /<meta property="og:image" content="[^"]+"/]
];

/* Self-contained builds served from this repo (the cube timer) are pages
   in their own right, not portfolio chrome, and are exempt. */
const META_EXEMPT = [/^projects\//];

for (const file of htmlFiles) {
  const name = rel(file);
  if (META_EXEMPT.some((re) => re.test(name))) continue;
  const src = fs.readFileSync(file, "utf8");
  for (const [label, re] of REQUIRED_META) {
    if (!re.test(src)) fail("metadata", `${name} is missing ${label}`);
  }

  /* The canonical must be this site, and must match the page's own path. */
  const canon = (src.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  if (canon) {
    if (!canon.startsWith(SITE)) {
      fail("metadata", `${name} canonical points off-site: ${canon}`);
    } else {
      let expect = "/" + name.replace(/index\.html$/, "");
      if (name === "404.html") expect = "/404";
      if (canon !== SITE + expect) {
        fail("metadata", `${name} canonical is ${canon}, expected ${SITE + expect}`);
      }
    }
  }
  const og = (src.match(/<meta property="og:url" content="([^"]+)"/) || [])[1];
  if (canon && og && og !== canon) {
    fail("metadata", `${name} og:url (${og}) does not match its canonical (${canon})`);
  }

  const ogImage = (src.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
  if (ogImage && ogImage.startsWith(SITE) && !resolvesOnDisk(ogImage.slice(SITE.length))) {
    fail("metadata", `${name} og:image points at a file that does not exist: ${ogImage}`);
  }
  if (/<meta name="twitter:card"/.test(src) && !/<meta name="twitter:image"/.test(src)) {
    fail("metadata", `${name} declares a twitter:card but no twitter:image`);
  }
}
ok();

/* The 404 must not be indexable. */
{
  const src = fs.readFileSync(path.join(ROOT, "404.html"), "utf8");
  if (!/<meta name="robots" content="noindex">/.test(src)) {
    fail("metadata", "404.html is missing <meta name=\"robots\" content=\"noindex\">");
  }
}
ok();

/* =====================================================================
   4. IMAGES
   ===================================================================== */
for (const file of htmlFiles) {
  const name = rel(file);
  const src = fs.readFileSync(file, "utf8");
  for (const tag of src.match(/<img\b[^>]*>/g) || []) {
    if (!/\balt\s*=/.test(tag)) {
      fail("images", `${name} has an <img> with no alt attribute: ${tag.slice(0, 70)}…`);
    }
    const s = (tag.match(/\bsrc="([^"]+)"/) || [])[1];
    if (!s || /^https?:|^data:/.test(s)) continue;
    const resolved = s.startsWith("/")
      ? s.replace(/^\//, "")
      : path.join(path.dirname(name), s);
    if (!fs.existsSync(path.join(ROOT, resolved))) {
      fail("images", `${name} references a missing image: ${s}`);
    }
  }
}
ok();

/* =====================================================================
   5. LEGACY DEPLOYMENT REFERENCES
   ===================================================================== */
const LEGACY = [
  [/candicecantrelle\.com/, "the retired custom domain candicecantrelle.com"],
  [/\/candicecantrelle\.github\.io\//, "the old project-site path /candicecantrelle.github.io/"]
];
/* Files a visitor is actually served. Markdown is documentation, not site
   content, and it has to be able to name these strings in order to explain
   them — the README describes this very check, and the backup repository is
   itself called candicecantrelle.github.io. tools/ is exempt for the same
   reason: og-card.html and this file both mention what they guard against. */
const SCANNED = /\.(html|css|js|json|xml|txt)$/;

for (const file of allFiles) {
  const name = rel(file);
  if (!SCANNED.test(name)) continue;
  if (name.startsWith("tools/")) continue;
  const src = fs.readFileSync(file, "utf8");
  for (const [re, label] of LEGACY) {
    if (re.test(src)) fail("legacy", `${name} still references ${label}`);
  }
}
ok();

if (fs.existsSync(path.join(ROOT, "CNAME"))) {
  fail("legacy", "a CNAME file exists. This is a github.io user site; a CNAME " +
    "silently redirects it to a custom domain. Delete it unless one was set up on purpose");
}
ok();

/* The archive was removed from production on purpose. */
if (fs.existsSync(path.join(ROOT, "archive"))) {
  fail("legacy", "/archive/ is back in production. The legacy site is preserved " +
    "at the legacy-site-archive tag and is not meant to be published");
}
for (const file of htmlFiles) {
  const src = fs.readFileSync(file, "utf8");
  if (/href="[^"]*\/archive\//.test(src)) {
    fail("legacy", `${rel(file)} links to /archive/, which is no longer published`);
  }
}
ok();

/* =====================================================================
   6. COUNTS AND GENERATED FILES
   ===================================================================== */
/* Any count typed into a page is drift waiting to happen. The pages are
   supposed to carry placeholders instead; this catches a stamp that has
   gone back to being hand-written. */
for (const c of reg.navCategories()) {
  const page = path.join(ROOT, reg.catPath(c).replace(/^\//, ""), "index.html");
  if (!fs.existsSync(page)) continue;
  const src = fs.readFileSync(page, "utf8");
  const stamp = (src.match(/<p class="stamp">([\s\S]*?)<\/p>/) || [])[1];
  if (!stamp) continue;
  if (!/data-cc-count=/.test(stamp)) {
    fail("counts", `${reg.catPath(c)} has a stamp with no data-cc-count placeholder — ` +
      "its number will drift from the registry");
    continue;
  }
  /* The static fallback inside the placeholder is what a reader without
     JavaScript sees, so it has to be true as well. */
  const fallback = (stamp.match(/data-cc-count="[^"]*"[^>]*><b>(\d+)<\/b>/) || [])[1];
  const actual = reg.byCategory(c.id).length;
  if (fallback !== undefined && Number(fallback) !== actual) {
    fail("counts", `${reg.catPath(c)} static fallback says ${fallback} projects, ` +
      `the registry has ${actual}`);
  }
}
ok();

/* map/index.html and sitemap.xml are generated. */
try {
  execFileSync(process.execPath, [path.join(ROOT, "tools", "sync-static.js"), "--check"],
    { stdio: "pipe" });
} catch (e) {
  fail("generated", "generated files are out of date — run: node tools/sync-static.js");
}
ok();

/* robots.txt and sitemap.xml should both be present and agree. */
if (!fs.existsSync(path.join(ROOT, "robots.txt"))) fail("seo", "robots.txt is missing");
if (!fs.existsSync(path.join(ROOT, "sitemap.xml"))) fail("seo", "sitemap.xml is missing");
else {
  const sm = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
  for (const loc of sm.match(/<loc>([^<]+)<\/loc>/g) || []) {
    const url = loc.replace(/<\/?loc>/g, "");
    if (!url.startsWith(SITE)) { fail("seo", `sitemap contains an off-site URL: ${url}`); continue; }
    if (!resolvesOnDisk(url.slice(SITE.length))) {
      fail("seo", `sitemap lists ${url}, which does not exist on disk`);
    }
  }
  if (/\/archive\//.test(sm)) fail("seo", "sitemap still lists archive pages");
  if (/\/404/.test(sm)) fail("seo", "sitemap lists the 404 page");
}
ok();

/* =====================================================================
   REPORT
   ===================================================================== */
const RESET = "[0m", RED = "[31m", GREEN = "[32m", DIM = "[2m";
const colour = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (colour ? code + s + RESET : s);

console.log("\nPortfolio validation\n");

if (notes.length) {
  console.log(c(DIM, "  Notes (not failures)"));
  notes.forEach((n) => console.log(c(DIM, "    · " + n)));
  console.log("");
}

if (!problems.length) {
  console.log(c(GREEN, `  PASS`) + `  ${checks} check groups, ${PROJECTS.length} registry records, ` +
    `${reg.visible().length} public, ${htmlFiles.length} pages\n`);
  process.exit(0);
}

const groups = [...new Set(problems.map((p) => p.group))];
for (const g of groups) {
  console.log("  " + c(RED, g.toUpperCase()));
  problems.filter((p) => p.group === g).forEach((p) => console.log("    · " + p.message));
  console.log("");
}
console.log(c(RED, `  FAIL`) + `  ${problems.length} problem(s)\n`);
process.exit(1);
