# Biosphere: Closed World

A scientific systems simulation of a materially closed ecological world — eight people, seven biomes,
one atmosphere and a great deal of soil, sealed inside three acres of glass.

Open `biosphere.html` in any modern browser. Nothing to install, no build step, no network access.

---

## What it is

Most management games tell you what is wrong. This one shows you evidence:

> Oxygen concentration has declined for 31 consecutive days.
> Carbon dioxide is not rising proportionally.
> Night-time oxygen loss exceeds daytime recovery.
> Soil temperature in the agricultural biome has risen 1.7 °C.

The central mechanic is causal diagnosis, not resource accumulation. Everything is connected: human breath
becomes plant carbon, plant waste becomes soil, soil microbes change the air, rainforest humidity becomes
condensation, condensation becomes stored water, food shortages reduce labour, delayed labour damages the
machinery that keeps the food growing.

The first campaign is built around the documented atmospheric mystery of the 1991–1993 Biosphere 2 closure:
oxygen fell from a normal atmospheric level to roughly 14 per cent over about sixteen months, while carbon
dioxide conspicuously failed to rise in proportion.

## Historical position

The simulation is **historically informed**, not a reconstruction.

- The crew are fictional and are not portrayals of the historical participants.
- Every screen labels its numbers as **Historical**, **Estimated** or **Model**.
- The *Assumptions* screen lists what is documented, what is derived from published ranges, what was invented
  for playability, and what is not represented at all.
- A counterfactual result is a statement about this model. It is never presented as evidence about the real
  facility, and the end-of-mission report says so explicitly.

## Modes

**Guided mission (365 days)** — a facility built to the historical specification. The recommended first run.

**Architect mode** — a six-stage design wizard: purpose, biome areas, soil carbon, concrete sealing,
pollinator strategy, crew selection from a pool of twelve, reserves against a fixed budget, and the closure
protocol that defines what counts as intervention.

**Short mission (120 days)** — one full crop cycle, a single sitting.

**No outside help (365 days)** — strict closure. No oxygen, food, parts or outside expertise may enter.

## The systems

| System | What it models |
| --- | --- |
| Atmosphere | O₂, CO₂, pressure, humidity, diurnal and seasonal gas exchange, envelope leakage |
| Carbon | Photosynthesis, plant and soil respiration, litter, humification, concrete carbonation, ocean dissolution |
| Water | Evapotranspiration, condensation, rainfall distribution, irrigation, treatment, potable and grey streams |
| Agriculture | Twelve crops with real growth curves, nutrition, labour, seed stocks, pests, storage life |
| Ecology | Functional roles rather than individuals — pollinators, decomposers, herbivores, an invasive tramp ant, a reef |
| Crew | Eight people with health, fatigue, morale, body mass, skills, sleep debt and opinions |
| Technosphere | Ten machines with condition, wear driven by humidity and heat, failure, spares and repair skill |
| Closure | Separate ledgers for atmospheric, water, nutrient, food, biological, mechanical and informational closure |

## Files

```
biosphere.html          the whole application shell
css/biosphere.css       two complete themes: Sunlit Laboratory and Night Operations
js/config.js            constants, biome table, crop table, crew pool, machinery, calibration handles
js/model.js             the world. No DOM access, so it also runs headless in node
js/events.js            alerts, decision cards, hypothesis machinery, chapter triggers
js/charts.js            canvas helpers: sparkline, line chart, gauge, diurnal, flow bars
js/dome.js              the cutaway, with six diagnostic overlays
js/screens.js           every screen
js/main.js              wizard, clock, wiring, end-of-mission report
```

## Verification

`js/model.js` is deliberately free of DOM access so it can be driven from node. The model was calibrated
against three checks:

1. **Carbon conservation.** Total carbon across soil, litter, biomass, food, bodies, atmospheric CO₂,
   carbonated concrete and ocean DIC closes to within 0.03 per cent over 365 simulated days. Three separate
   carbon-creating bugs were found this way — humification returning more carbon than it moved, herbivores
   respiring carbon they had not eaten, and crew exhaling carbon that was never taken out of the food store.
2. **Historical pace.** A control run ends 365 days at 16.6 per cent oxygen, on the documented trajectory.
3. **Counterfactual behaviour.** Lean soil ends nearly two percentage points higher in oxygen; sealing the
   concrete before closure raises CO₂ roughly fivefold while leaving the oxygen curve almost untouched —
   which is the entire lesson of the scenario, arrived at by the model rather than scripted.

## Controls

`Space` pause and resume &middot; `1`–`5` simulation speed &middot; click any section of the cutaway to inspect it.

## Accessibility

Light theme is the default and is a first-class design rather than an inverted dark theme. Both themes use
tabular figures so numbers do not jitter as they change. Charts carry named units, safe operating bands and
markers for the player's own interventions. Colour never carries meaning alone — every state is also carried
by a label, a shape or a position.
