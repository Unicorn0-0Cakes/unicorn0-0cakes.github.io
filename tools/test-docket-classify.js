#!/usr/bin/env node
/* =====================================================================
   DOCKET — classifier regression suite
   ---------------------------------------------------------------------
       node tools/test-docket-classify.js

   Every case below is a sorting decision someone relied on. If a rule
   change in projects/docket/classify.js moves one of them, this fails
   and says which, so the change is made on purpose or not at all.
   The clock is pinned (Friday 25 Sep 2026) so date parsing is stable.
   Add a case whenever a real line sorts wrongly and gets fixed.
   ===================================================================== */
"use strict";
const path = require("path");
const C = require(path.join(__dirname, "..", "projects", "docket", "classify.js"));
const NOW = new Date(2026, 8, 25);   /* a Friday */

/* [line, quadrant, review, due (or null), effort (or undefined = any)] */
const CASES = [
  /* the brief's own examples */
  ["Finish weekly report",                      "do",       false, null,         "deep"],
  ["Check Brazil integration issue",            "schedule", true,  null],
  ["Email Rick about replacement training",     "delegate", false, null,         "quick"],
  ["Clean up help desk categories",             "later",    false, null],
  ["Review documentation tomorrow",             "schedule", true,  "2026-09-26"],
  ["Update portfolio",                          "schedule", true,  null],
  ["Look at training material if I have time",  "later",    false, null],
  /* urgency */
  ["Prod login outage ASAP",                    "do",       false, null],
  ["Server is down",                            "do",       false, null],
  ["Blocking the release: fix auth bug",        "do",       false, null],
  ["Send invoice to client today",              "do",       true,  "2026-09-25"],
  /* false friends that must NOT read as urgent */
  ["Sat down with notes",                       "schedule", true,  null],
  ["Write down meeting ideas someday",          "later",    false, null],
  /* low stakes */
  ["maybe reorganize my desktop",               "later",    false, null],
  ["Eventually tidy the shared drive",          "later",    false, null],
  /* routing */
  ["Ping Sam about the badge reader",           "delegate", false, null,         "quick"],
  ["Forward the vendor quote to purchasing",    "delegate", false, null],
  /* dates */
  ["Prep slides for Monday meeting",            "schedule", true,  "2026-09-28"],
  ["next friday sync",                          "schedule", false, "2026-10-02"],
  ["Renew certificate by 10/3",                 "schedule", true,  "2026-10-03"],
  ["Submit expenses in 3 days",                 "schedule", true,  "2026-09-28"]
];

let fails = 0;
for (const [line, q, review, due, effort] of CASES) {
  const r = C.classify(line, NOW);
  const bad = [];
  if (r.quadrant !== q) bad.push(`quadrant ${r.quadrant} ≠ ${q}`);
  if (r.review !== review) bad.push(`review ${r.review} ≠ ${review}`);
  if (r.due !== due) bad.push(`due ${r.due} ≠ ${due}`);
  if (effort && r.effort !== effort) bad.push(`effort ${r.effort} ≠ ${effort}`);
  if (bad.length) { fails++; console.log(`  FAIL  "${line}"\n        ${bad.join("; ")}  (scores ${JSON.stringify(r.scores)})`); }
}

/* splitting */
const split = C.splitDump("- one\n\n* two\n1. three\n[ ] four; five\n   \n#\n");
if (split.length !== 4 || C.classify(split[3], NOW).text !== "four; five") { fails++; console.log(`  FAIL  splitDump gave ${JSON.stringify(split)}; one task per line, semicolons kept`); }
const tagged = C.classify("Draft Q4 plan #ops #later", NOW);
if (tagged.tags.join() !== "ops,later" || tagged.text !== "Draft Q4 plan") { fails++; console.log("  FAIL  tag extraction", tagged.tags, tagged.text); }

console.log(fails ? `\n  ${fails} failing of ${CASES.length + 2}\n` : `\n  PASS  ${CASES.length + 2} classifier cases\n`);
process.exit(fails ? 1 : 0);
