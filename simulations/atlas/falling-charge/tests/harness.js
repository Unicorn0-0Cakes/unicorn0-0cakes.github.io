/* Minimal test harness. No dependencies, consistent with flask/js/test.js. */
"use strict";
const state = { pass: 0, fail: 0, failures: [], suite: "" };

function suite(name) { state.suite = name; console.log("\n── " + name + " " + "─".repeat(Math.max(0, 58 - name.length))); }

function ok(cond, msg) {
  if (cond) { state.pass++; console.log("  ✓ " + msg); }
  else { state.fail++; state.failures.push(state.suite + " :: " + msg);
         console.log("  ✗ " + msg); }
}
function near(a, b, tol, msg) {
  const d = Math.abs(a - b);
  const rel = (b !== 0) ? d / Math.abs(b) : d;
  const good = isFinite(a) && rel <= tol;
  ok(good, msg + "  (got " + fmt(a) + ", expected " + fmt(b) +
     ", rel " + (isFinite(rel) ? rel.toExponential(2) : "NaN") + " ≤ " + tol + ")");
  return good;
}
function throws(fn, msg) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  ok(threw, msg);
}
function fmt(x) {
  if (!isFinite(x)) return String(x);
  const a = Math.abs(x);
  return (a !== 0 && (a < 1e-3 || a >= 1e5)) ? x.toExponential(4) : String(Math.round(x * 1e6) / 1e6);
}
function report() {
  console.log("\n" + "═".repeat(64));
  console.log("  " + state.pass + " passed, " + state.fail + " failed");
  if (state.fail) {
    console.log("\n  FAILURES:");
    state.failures.forEach(f => console.log("   · " + f));
  }
  console.log("═".repeat(64) + "\n");
  return state.fail === 0;
}
module.exports = { suite, ok, near, throws, report, state };
