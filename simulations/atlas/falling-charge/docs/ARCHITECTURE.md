# Software architecture

Version 0.1.0-milestone1.

Plain ES modules, no framework, no build step, no server. Runs from
`file://` and from GitHub Pages unchanged. This matches the rest of the
repository, which uses vanilla JS with a shared design system in `assets/`.

---

## 1. Modules

| file | responsibility | depends on |
|---|---|---|
| `src/prng.js` | seeded PRNG, named independent streams, Gaussian | — |
| `src/units.js` | SI constants, unit helpers, significant-figure formatting | — |
| `src/physics.js` | forces, viscosity, slip, integrator, radius inversion | units |
| `src/droplets.js` | droplet generation, charge model, focus, charge events | prng, units, physics |
| `src/apparatus.js` | instrument state, error models, chamber + scope rendering | units, physics |
| `src/calibration.js` | calibration record, versions, session error draws | prng, units |
| `src/measurement.js` | tracking, velocity fits, quality indicators, accept/reject | physics, units |
| `src/uncertainty.js` | Monte Carlo propagation, bootstrap, LOO, sensitivity | physics, prng |
| `src/analysis.js` | candidate lattice, weighted regression, assignments | units, uncertainty |
| `src/models.js` | **stub** — model comparison (Milestone 4) | — |
| `src/notebook.js` | notebook entries, auto-logging | — |
| `src/persistence.js` | stores, immutability guards, truth isolation | — |
| `src/charts.js` | canvas charts + accessible text summaries | — |
| `src/reporting.js` | session summary, CSV/JSON export, bundle | all |
| `src/accessibility.js` | reduced motion, text size, focus, live region | — |
| `src/app.js` | state machine, wiring, render loop | all |

Load order is explicit in `index.html`; the modules attach to a single `FC`
namespace rather than using ES module imports, matching the loading style used
by `flask/` and `biosphere/` in this repository and keeping `file://` working
without CORS complications.

## 2. Rendering

- **Chamber** and **microscope** are separate `<canvas>` elements, redrawn each
  animation frame from the current physics state. No DOM per droplet.
- **Charts** are canvas, redrawn on data change only, each with a `<figcaption>`
  text summary and a `<table>` alternative in a `<details>`.
- Device-pixel-ratio aware; both canvases resize with the container.

## 3. The loop

```js
function frame(now) {
  const wall = Math.min((now - last) / 1000, 0.25);   // clamp tab-switch jumps
  acc += wall * speedMultiplier;
  let steps = Math.floor(acc / DT);
  if (steps > MAX_STEPS) { droppedTime += (steps - MAX_STEPS) * DT; steps = MAX_STEPS; }
  acc -= steps * DT;
  for (let i = 0; i < steps; i++) FC.physics.step(world, DT);   // fixed
  render(world);                                                 // variable
  requestAnimationFrame(frame);
}
```

Physics advances only in whole `DT` steps of *simulated* time. Rendering
interpolates nothing that matters and reads no state the physics has not
already produced. See `PHYSICS_MODEL.md` §5.3.

## 4. Truth isolation — the safeguard that matters most

Hidden ground truth (`truth.radius`, `truth.n`, `truth.charge`, and the session's
drawn instrument errors) lives in `FC.persistence.truthVault`, a closure-scoped
`Map`. Access is via

```js
FC.persistence.readTruth(key, reason)
```

which throws unless `experiment.revealed === true`, and logs every read with its
reason to the notebook. The analysis module (`src/analysis.js`) is loaded before
the vault is populated and holds no reference to it; a grep-based test
(`tests/test-no-circularity.js`) asserts that neither `analysis.js` nor
`measurement.js` contains the identifiers `truth`, `SI.e`, or `readTruth`.

That test is crude, and it is meant to be. A subtle circularity could still slip
past it. It is recorded as an incomplete mitigation in `RISK_REGISTER.md` R-S2.

## 5. Web Workers

**Not used in this build.** With one tracked droplet and up to ~60 in the
chamber, a physics step costs well under 0.1 ms and the main thread is never
blocked. Bootstrap (B = 2000) runs in ~30 ms.

A worker becomes necessary for Mode G (1 000–10 000 synthetic experiments) and
the module boundary is drawn so that `physics.js`, `droplets.js`,
`measurement.js` and `analysis.js` have no DOM dependency and can be loaded into
a worker unchanged. That is asserted by the Node test suite, which loads exactly
those modules with no DOM present.

## 6. Testing

Tests are plain Node scripts (`node tests/run.js`), because the science modules
are DOM-free by construction. No test framework, no dependencies, consistent
with the repo's existing `flask/js/test.js`.
