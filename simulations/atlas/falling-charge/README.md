# The Falling Charge

*A Millikan Oil-Drop Experiment in Measurement, Uncertainty, and Scientific Inference*

**Version 0.1.0-milestone1 · Status: research prototype — not scientifically reviewed**

Nothing in the apparatus shows you a charge. You measure how fast a droplet falls
and how that changes when a field is applied. The elementary unit appears only as
a spacing that keeps recurring in careful measurements.

The accepted value is sealed until you lock your analysis.

## Run it

Open `index.html`. No build step, no server, no dependencies. Works from
`file://` and from GitHub Pages.

## Tests

```
node tests/run.js
```

176 tests: units, hand-calculated equation references, force balance and signs
for all four procedures, droplet generation, numerical stability and determinism,
inference, and a complete blind experiment run headlessly through the real
apparatus.

## What works

Calibration workflow · preregistered exclusion rules with amendments · droplet
generation with hidden integer charges · Cunningham slip correction · Brownian
motion · microscope tracking with velocity fits · radius and charge inversion
with the working shown · Monte Carlo uncertainty propagation · accept/reject with
required reasons · candidate-lattice search and weighted regression · seven
charts with text alternatives · analysis locking · ground-truth reveal · notebook
· CSV and JSON export · deterministic seeds.

## What does not

Model comparison (RQ2/H2), batch mode (RQ3/RQ5/H3/H4/H5), Analyst's Dilemma mode,
robust and likelihood estimators, charge-step analysis, PDF reports, checksums,
evaporation, edge fields, IndexedDB persistence, multi-transit measurement.

See `docs/LIMITATIONS.md` — it is long on purpose.

## Documentation

26 documents in `docs/`. Start with `RESEARCH_QUESTION.md`, then
`PHYSICS_MODEL.md` and `LIMITATIONS.md`. `PARAMETER_REGISTER.md` records the
provenance of every parameter: 5 exact SI definitions, 3 sourced, 8 from
secondary summaries, 24 **not yet calibrated**.

## Two things found by testing

**The lattice degeneracy.** Minimising χ² alone returns `e/2` on noiseless data
and `e/3` under realistic noise, because a finer lattice has more rungs to absorb
noise into. The instrument minimises `χ²(e) + 2N·ln(Q/e)`, the plug-in marginal
likelihood with a uniform prior over integer states.

**Correlated Brownian residuals.** Ordinary least squares understates the velocity
uncertainty by 13–50×. That let *neutral* droplets pass a three-sigma field-response
test and drag the inferred lattice onto a sub-multiple — a bad uncertainty produced
a wrong physical conclusion. The instrument now reports `√(2D/T)`.

Both are written up in `docs/LIMITATIONS.md` L-14 and L-1.
