# The Commons — User Manual

A hands-on guide to operating the simulator. Open `commons.html` in a browser to follow along.

## Getting started in 30 seconds

1. Press **▶ Run** in the top toolbar. The society begins playing out year by year. Use the
   speed control (Slow / Normal / Fast / Turbo) — pick Turbo for long runs of many years.
2. Watch the **central reservoir** in the world view — its fill is the health of the shared
   infrastructure. Watch the **people** change color as they shift between contributing
   (green), hedging (yellow), and free-riding (red).
3. When the run ends, open the **Verdict** tab on the right to see what kind of society
   emerged and what it cost.
4. Press **↻ Reset** to run again, or open **⚙ Rules** to change the world first.

Use the speed control (Slow / 1× / Fast / Turbo) to slow things down or blast through a run.
**Step ▸** advances exactly one year so you can watch a single decision cycle. The **🌙 / ☀**
button toggles a night or day (dark or light) theme.

## Reading the world view

- **Dot color** — how much that person is currently contributing: green = generous,
  yellow = hedging, red = free-riding.
- **Dot size** — their private wealth. Watch hoarders swell while the commons drains.
- **Purple ring** — their reputation, i.e. what *others believe* about them. When
  information accuracy is low, the ring and the true color can disagree — that gap is where
  false accusations come from.
- **Colored halo** — which faction they belong to. Unhappy people may switch factions.
- **Lines to the center** — this year's contribution flowing into the commons; thicker
  means more given.
- **Faded gray dots** — people who have left or died.

Click any person to open the **Inspector**, which shows their fixed dispositions, how far
their behavior has drifted from where they started, and their history of being exploited or
punished.

## The controls, and what each one does

Open the **⚙ Rules** drawer. Sliders take effect on the next **Reset**.

**Resource abundance** — the endowment each person receives per year. Low abundance creates
real scarcity and squeezes cooperation.

**Regeneration** — how fast the commons and pool renew versus decay. Low regeneration means
the infrastructure erodes quickly and demands constant upkeep.

**Productivity ×** — the multiplier on the shared pool. Above roughly 1.5× cooperation
genuinely pays; push it up and generosity becomes self-sustaining.

**Initial inequality** — the spread of starting wealth. High values create a gilded few and
a struggling many from year one.

**Contribution visibility** — how openly each person's choices are seen. High visibility lets
reputation and status incentives work; low visibility hides free-riding.

**Information accuracy** — the single most revealing dial. It sets how *true* people's beliefs
about each other are. Drop it and honest contributors get misread as cheats, punished, and
embittered — a healthy society can tear itself apart over rumors that aren't true.

**Reputation memory** — how many years of history people carry about each other. Short
memory means yesterday's cooperator is quickly forgotten; long memory makes reputations
sticky.

**Punishment cost / severity** — what it costs a punisher to sanction someone, and how much
the sanction hurts. Severe, cheap punishment can force cooperation — at the price of
collateral damage to the wrongly accused.

**Reward strength** — a bonus paid to visible top contributors, an alternative to punishment
for sustaining cooperation.

**Number of factions** and **social mobility** — how many subgroups people feel loyal to,
and how readily the unhappy switch between them. More factions plus low mobility can lock in
polarization.

**Emergency frequency** — the odds each year of a shock that damages infrastructure. Shocks
test whether a society can surge to recover or hoards and collapses.

**Simulation length** — how many years the society runs: 4, 8, 20, 50, 100, 250, 500, or 1000.
Short runs show founding dynamics; long runs reveal whether a society is truly stable or just
slow to fail.

**Toggles** — whether people can *communicate* (coordinate expectations), whether a
*leadership structure* emerges (a leader pulls conformists toward its behavior), whether
people may *exit* the society, and whether *scarcity is only perceived* (resources are
actually ample, but people act as if they're scarce).

## Experiments worth running

- **Rumor vs. truth.** Load **Rumor Mill**, run it, and note the false-accusation count.
  Then raise **Information accuracy** to 100% and run again. Watch a society that was tearing
  itself apart become stable — nothing changed except what people could believe.

- **The cost of order.** Compare **Strong Leader** (order held by a leader with little
  punishment) against a high-punishment run of **Fragile Balance**. Both may survive, but the
  Verdict tab shows very different costs — coercion and injustice versus calm.

- **Rich but doomed.** Set high **Initial inequality** and low **Regeneration**. Watch some
  people accumulate large private wealth while the commons still collapses — proof that
  private riches can't substitute for a working shared system.

- **Perceived scarcity.** Turn on *Scarcity is only perceived* with high abundance. Resources
  are plentiful, yet people hoard as if starving — and can collapse a society that had no
  material reason to fail.

## What to watch on the dashboard

The **Trends** tab plots every metric across years; click legend items to toggle series, and
the red dashed lines mark emergencies. The **Dashboard** tab gives the live snapshot. The
number to watch most is not cooperation or even infrastructure, but the pairing on the
**Verdict** screen: *what kind of society survived, and what it cost.* Two runs can both
"survive" and be nothing alike.
