#!/usr/bin/env node
/* THE FALLING CHARGE — test runner.  node tests/run.js  */
"use strict";
const H = require("./harness.js");
console.log("\nTHE FALLING CHARGE — automated tests");
console.log("Model version 0.1.0-milestone1\n");
["./test-units.js", "./test-physics.js", "./test-droplets.js",
 "./test-stability.js", "./test-inference.js", "./test-endtoend.js", "./test-boot.js"]
  .forEach(function (m) { require(m)(); });
process.exit(H.report() ? 0 : 1);
