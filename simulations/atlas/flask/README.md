# Evolution in a Flask

Twelve populations of *Escherichia coli*, the same thin sugar medium, one transfer a day, and fifty thousand
generations of nothing else happening.

Open `flask.html` in any modern browser. Nothing to install, no build step, no network access.

---

## What it is

A simulation of the long-term evolution experiment, built around one rule:

> **Fitness is not reported. It is measured.**

Nothing in the model decides who wins by comparing fitness numbers. Lineages grow, on a shared and finite
supply of carbon, and whoever ends the day with more cells has more cells at the next transfer. Relative
fitness exists in this simulation only as the outcome of a competition assay you have to set up, against a
sample you were careful enough to freeze, using bench hours you could have spent on something else.

That constraint drives everything. The bench shows a dash where you have not looked. The parallelism matrix
is built only from the genomes you paid to sequence. A flask that has quietly become forty per cent fitter
looks exactly like one that has not — unless it also became cloudier, which is the one thing that gives
itself away, and which is how the citrate population announced itself in the real experiment.

## The model

Growth is Monod kinetics on three carbon sources, integrated over each twenty-four hour cycle:

- **Glucose**, 25 µg/mL, exhausted about nine hours in. Most of a cell's life here is starvation.
- **Acetate**, which nobody adds — it is secreted during growth on glucose and eaten afterwards. Because the
  amount available to a specialist depends on how many specialists there are, this produces genuine negative
  frequency dependence, and stable two-lineage coexistence emerges without being written in anywhere.
- **Citrate**, 500 µg/mL, about twenty times the carbon of the glucose, and completely unavailable. The
  ancestor cannot bring it across the membrane in the presence of oxygen. It sits there for the entire
  experiment.

Chance enters at exactly two places, which is where it enters in the laboratory. Mutations arise at random.
And the daily transfer of one part in a hundred is a random sample of what was in the flask — which is where
drift lives, and why a mutation that arises late in the growth phase is usually lost no matter how good it is.

Seventeen heritable traits, twenty-six gene targets drawn from the real parallelism data, exponential
beneficial effects with diminishing-returns epistasis, mismatch repair that can break, and a three-stage
citrate innovation that needs a potentiated background before it becomes reachable at all.

### Calibration

The engine was tuned headlessly against published benchmarks before any interface existed
(`node js/calibrate.js`):

| | Model, mean of twelve, three seeds | The real experiment |
| --- | --- | --- |
| Fitness at 2,000 generations | 1.28 – 1.34 | ≈ 1.3 |
| Fitness at 10,000 | 1.52 – 1.57 | ≈ 1.55 |
| Fitness at 20,000 | 1.60 – 1.63 | ≈ 1.65 |
| Fitness at 50,000 | 1.71 – 1.73, spread 1.59 – 1.89 | ≈ 1.7 – 1.8 |
| Hypermutable by 50,000 | 3 – 4 of 12 | 6 of 12 |
| Aerobic citrate use by 50,000 | 0 – 1 of 12 | 1 of 12 |
| Generations per day | 6.64 | 6.64 |

Fitness is bounded because the traits are: each one has a physiological range it cannot leave, and a
lineage sitting at the floor for its lag phase gets nothing from a mutation that would have shortened it.
With every trait pushed to its limit at once, a Cit− lineage measures 2.14 and a Cit+ one 2.91. Nothing in
the model can go beyond that, which is the main reason its trajectory flattens a little earlier than the
real one does after twenty thousand generations.

## Historical position

The simulation is **historically informed**, not a reconstruction.

- Every screen labels its numbers as **documented**, **estimated**, **invented** or **emergent**.
- The *Assumptions* screen lists all four categories in full, including a section on where the model is
  deliberately wrong and why.
- Phage, antibiotics, spatial structure, alternating environments and the bench-hour budget were no part of
  the original design. They exist here because "what if it had been run differently" is worth being able
  to ask.

## Modes

**The experiment as it was run** — twelve populations, DM25, 37 °C, 1:100 daily transfer, a sample frozen
every 500 generations, target 50,000 generations. The recommended first run.

**Two thousand generations** — the same design on a shorter clock. One sitting.

**Design the experiment** — a five-stage wizard: medium, incubator, transfer regime, pressures, length. Every
knob, including the ones that turn this into a different experiment entirely.

**Blind bench** — the historical protocol with half the bench hours, so that deciding what is worth knowing
becomes the game.

## What you can do at the bench

| Procedure | Cost | What it tells you |
| --- | --- | --- |
| Competition assay | 3 h | Relative fitness against any frozen sample, three replicates, with error |
| Assay when rare | 5 h | The same competition started at 5 %, which is how you catch frequency dependence |
| Plate for colonies | 1 h | Cell size, density, and how many visibly different types there are |
| Sequence one clone | 8 h | Every mutation in one genome, drivers and passengers alike |
| Sequence the population | 18 h | Every lineage above five per cent |
| Reciprocal invasion | 6 h | Whether two lineages exclude each other or coexist |
| Replay | 26 h | Twenty restarts from one archived timepoint, two thousand generations each |

One bench hour accrues per simulated day, to a ceiling of 120. You cannot measure everything.

## Files

```
flask.html          the page
css/flask.css       two complete themes
js/config.js        constants, gene table, mutation parameters
js/model.js         the engine — no DOM, runs in node
js/charts.js        canvas charts
js/lineage.js       Muller plot and lineage tree
js/events.js        what the bench notices without an experiment
js/screens.js       every screen
js/main.js          boot, designer, run loop
js/calibrate.js     headless calibration harness      (development only)
js/test.js          39 assertions on the model        (development only)
js/smoke.js         renders every screen without a browser (development only)
```

Run the checks with `node js/test.js` and `node js/smoke.js`.

## Keyboard

`Space` pause and resume &middot; `1`–`5` speed &middot; the fastest speed is "as fast as this machine can
manage", budgeted per frame, rather than a fixed number.

---

*Part of the [Simulations and Interactive Experiences](../README.md) collection.*
