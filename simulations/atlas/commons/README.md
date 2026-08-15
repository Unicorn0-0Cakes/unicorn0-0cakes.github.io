# The Commons — A Cooperation Collapse Simulator

A single-file, browser-based agent simulation of the classic **public-goods dilemma**: a
population of 24 people each receive private resources every year, but their long-term
survival depends on a shared system — the *commons* — that no one is forced to maintain.
You don't command the people. You write the rules of their society and watch what kind of
world emerges, and what its survival costs.

Open `commons.html` in any modern browser. Nothing to install, no dependencies, no network.

## The core idea

Each year every person gets an endowment and privately decides how much to put into the
shared pool. The pool is multiplied by the society's productivity and split equally among
everyone — so the group is best off if all contribute, but each individual is *personally*
best off keeping their share while others give. That tension is the whole game.

A separate **infrastructure** stock represents the commons itself. It decays a little every
year and is only replenished when average contribution rises above a maintenance line.
Because production is wasted when infrastructure is broken, **private wealth alone cannot
save a society** — a town full of rich hoarders still collapses if the shared system fails.

The most interesting question the simulator poses is not *"did society survive?"* but
**"what kind of society survived, and what did survival cost it?"**

## The yearly loop

You choose how long the society runs — 4, 8, 20, 50, 100, 250, 500, or 1000 years — and
each year runs the sequence from the design spec:

1. **Endowment** — each living person receives resources scaled by *abundance*.
2. **Contribution** — each decides how much to give, weighing their dispositions, what they
   expect others to do, scarcity, resentment, the desire to be seen giving, and trust.
3. **Production** — total contributions are multiplied by *productivity*, damped by how
   functional the infrastructure currently is.
4. **Distribution** — the grown pool is shared equally; each person keeps what they withheld.
5. **Update** — reputations, trust, resentment and strategies all shift. Exploited
   cooperators harden; free riders surrounded by a giving, punishing world soften.
6. **Reward / punishment** — willing punishers pay a cost to sanction people they *believe*
   are free-riding (belief that can be wrong), and visible top contributors may be rewarded.
7. **Shocks & upkeep** — infrastructure decays, and emergencies may strike; the dashboard
   records everything.

## What you control

The setup drawer exposes the full control set. The highest-signal ones:

- **Resource abundance** and **regeneration** — how much people get and how fast the commons renews.
- **Productivity ×** — the return on the shared pool. Higher makes cooperation pay more.
- **Initial inequality** — the spread of starting wealth.
- **Contribution visibility** and **information accuracy** — how openly choices are seen, and
  how *true* people's beliefs about each other are.
- **Reputation memory**, **punishment cost & severity**, **reward strength**.
- **Factions**, **social mobility**, **emergency frequency**, and toggles for
  **communication**, **leadership**, **exit**, and **perceived (vs. real) scarcity**.

The most revealing control is **information accuracy**. A healthy society can collapse
because people *falsely believe* others are cheating — punishing honest contributors until
trust unravels — while a fragile one can hold together simply because its contribution
records are trusted. Try the **Rumor Mill** preset to see this directly.

## The people

Agents are not fixed caricatures. Each is drawn with probabilities along ten dimensions:
conditional cooperation, self-preservation, fairness sensitivity, status desire, willingness
to punish, forgiveness, conformity, subgroup loyalty, scarcity response, and memory length.
Behavior then *evolves*: a cooperator who is repeatedly exploited becomes defensive; a free
rider embedded in stable cooperation may start to contribute. Click any person in the world
to inspect their dispositions and how far their behavior has drifted from where it started.

## Reading the dashboard

The right panel tracks cooperation rate, infrastructure health, private wealth, wealth
concentration (Gini), trust, punishment frequency, **false accusations** (honest people
wrongly punished), factional polarization, wellbeing, population, and recovery after shocks.
The **Verdict** tab, shown when a run ends, names the archetype of society that emerged —
a high-trust cooperative, an order held by punishment, a stratified survivor, a polarized
standoff, a tragedy of the commons — and breaks down what survival cost it.

## Scenarios

Six presets seed different starting worlds: **Fragile Balance** (a genuine coin-flip),
**Abundance** (a stable near-utopia), **Harsh Scarcity** (a near-certain tragedy of the
commons), **Rumor Mill** (collapse through false accusation), **Gilded Start** (deep initial
inequality), and **Strong Leader** (order sustained by a leader with little coercion).

## A note on interpretation

The Commons is a **model**, not an experiment. It dramatizes mechanisms described in
cooperation research — public-goods dilemmas, conditional cooperation, reciprocity,
reputation, and altruistic punishment (Ostrom; Fehr & Gächter; Axelrod) — but its numbers
are illustrative of those mechanisms, not measurements of any real population. It shows how
*a* society built on certain rules *could* behave; it does not demonstrate how any actual
group *must* behave.

## Files

- `commons.html` — the entire simulation (engine, controls, visualization, dashboard).
- `USER_MANUAL.md` — a hands-on walkthrough of the controls and what to look for.
- `.nojekyll` — lets the folder serve as-is on static hosts.

Part of the [Simulations](../index.html) collection.
