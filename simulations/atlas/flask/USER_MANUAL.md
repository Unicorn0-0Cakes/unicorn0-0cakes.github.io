# Evolution in a Flask — player's manual

> A change you have not measured is not a result.

You run a bench with twelve flasks on it. The bacteria will do what they do whether you watch or not. Your
job is to decide what is worth finding out, and to pay for it.

---

## Your first hour

1. Choose **The experiment as it was run**.
2. Press **Run** and leave the speed at 10×. Watch the bench for a few simulated months.
3. When the first prompt appears telling you nothing has been measured, act on it: select **Ara-1**, and in
   the inspector press **Competition assay**.
4. Look at what came back. Then run the same assay again on the same population, immediately.

That second assay is the most useful three bench hours you will spend all game. The two numbers will not be
identical. The gap between them is the resolution of your instrument, and everything you conclude for the
rest of the run has to survive it.

---

## Reading the bench

**The flask cards** show three things. The picture is turbidity, which is free — a flask you can see across
the room is a flask you know something about. The number underneath is the last fitness you measured, and it
is a dash until you measure one. The tags below appear only once sequencing or plating has revealed them.

A flask that has become conspicuously cloudier than its neighbours is worth investigating. That is not a hint
the interface is giving you; it is the actual observation that led to the discovery of aerobic citrate use in
the real experiment. Somebody noticed a flask looked wrong.

**The top bar** deliberately refuses to give you a mean fitness for the bench until you have assayed some
populations, and then averages only those. If it says `1.34 · of 3 assayed`, that is a statement about three
flasks, not twelve.

---

## The three views of a population

**The band chart** on the *Population* screen shows who is in the flask. Bands nest inside their ancestors,
so a clade physically contains its descendants, and you can watch a sub-lineage eat its parent from the
inside. Only lineages that once passed two per cent appear — below that, nobody would have seen them either.

**The lineage tree** shows who came from whom. Horizontal position is the generation a lineage was born;
thickness is the highest frequency it ever reached; a line that stops, stopped. Squares mark the loss of
mismatch repair. Circles mark the citrate rearrangement.

**The growth curve** shows a single day. Watch where the glucose line hits zero — usually around hour nine —
and notice that the cells keep changing for the fifteen hours afterwards. Most of the selection in this
experiment happens after the food runs out.

---

## Spending bench hours

You get one hour per simulated day and can bank 120. At 10× speed that is one assay every twenty seconds, and
it is never enough.

**Competition assay (3 h)** — the core measurement. Mixes the current population one-to-one with whichever
frozen sample is selected in the inspector, grows both for a day, and compares how much each multiplied.
Three replicates. If the reported error bar overlaps 1.00, you have not found anything.

**Assay when rare (5 h)** — the same competition started at five per cent instead of fifty. If a lineage is
much fitter when rare than when common, it is living off something the others produce, and the population has
split into an ecosystem. Run this on any flask where plating shows more than one colony type.

**Plate for colonies (1 h)** — the cheapest thing on the menu and usually the right first move. Tells you mean
cell size and how many visibly different types are present.

**Sequence one clone (8 h)** — draws a genome at random, weighted by frequency. You will get mostly
passengers: point mutations that hitchhiked and mean nothing. The handful in genes selection cares about are
mixed in with them and are not labelled as such.

**Sequence the population (18 h)** — every lineage above five per cent. Expensive, and the only way to fill in
the parallelism matrix quickly.

**Reciprocal invasion (6 h)** — takes the two commonest lineages and asks whether each can invade the other
from rare. Three possible answers, and only one of them means "this is a sweep in progress".

**Replay (26 h)** — the expensive one, and the only experiment that can distinguish an adaptation that was
always going to appear from one that needed a particular history first. Thaws a chosen archive sample,
restarts it twenty times, and runs each for two thousand generations. It continues in the background while
the main experiment runs.

---

## The freezer

Every five hundred generations, each population deposits a sample. Nothing else about this experiment would
work without it.

The reference you select on the *Freezer* screen, or in the inspector dropdown, is what every subsequent
competition assay is run against. Against the founding strain you get cumulative fitness since the beginning.
Against generation 10,000 you get how much has been gained since generation 10,000, which is a different and
often more interesting number.

---

## What to actually try

**The repeatability question.** Assay all twelve populations at generation 2,000, then again at 10,000. Do
they stay in the same order? Sequence three of them and look at the parallelism matrix. How much of what
happened was inevitable?

**Find the acetate specialists.** Plate every flask every few thousand generations. When one shows two colony
types, run *assay when rare* and then *reciprocal invasion*. If both invade, you have found a stable
polymorphism, and the two lineages will still be there tens of thousands of generations later.

**Chase the cloudy flask.** If a flask goes conspicuously turbid, sequence it. If it has citrate uptake, go to
the freezer and run replays from an early sample and a late one. The difference between those two results is
the entire argument about historical contingency.

**Break the design on purpose.** Start a designed experiment at 1:1000 dilution. Ten generations a day instead
of 6.6 sounds like faster evolution. The bottleneck is ten times smaller, and you will watch good mutations
get thrown away.

**Ask an unfair question.** Run at 42 °C. Everything is worse for everybody, and the populations spend their
first thousands of generations recovering ground rather than gaining it. Then assay an evolved clone back at
37 °C and find out what it gave up.

---

## Things that are easy to get wrong

**Assaying too rarely.** A fitness trajectory with four points on it is a line you drew, not a curve you
measured.

**Trusting a single replicate.** The assay has real measurement error, deliberately. Two assays a week apart
on an unchanged population will differ by one or two per cent.

**Reading the parallelism matrix as complete.** A blank cell means you did not look there. It never means
nothing happened.

**Forgetting you changed something.** The notebook records every conditions change. When a trajectory bends,
check it before inventing a biological explanation.

**Assuming fitness measures adaptation.** Assays are always run in the founding conditions, which is what the
laboratory does. If you have moved the incubator to 42 °C, a population can be adapting hard and showing no
gain at all on the fitness chart.

---

## Keyboard

| Key | Does |
| --- | --- |
| `Space` | Pause and resume |
| `1`–`5` | Speed, from one day per second to as fast as the machine manages |

---

## Where the model is not the world

The *Assumptions* screen carries the full list. The four that matter most:

Growth is deterministic; all the randomness is in mutation and in the transfer. There is no recombination, so
two good mutations can only meet if one arises inside the other — which is true of these populations and is
the reason clonal interference dominates. The mutation supply is truncated, so a real flask carries far more
standing variation than anything drawn here. And the model tracks about 130 lineages per flask, dropping the
rarest, which is roughly what happens to them anyway but is not the same as it happening.
