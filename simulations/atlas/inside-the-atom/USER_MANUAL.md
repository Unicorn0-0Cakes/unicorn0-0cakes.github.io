# Inside the Atom — User Manual

A hands-on guide to operating the instrument. Open `inside-the-atom.html` in a browser to follow along.

## Getting started in 30 seconds

1. Choose **Guided reconstruction** from the four cards on the opening screen.
2. Press **▶ Expose** in the top bar, or the space bar. One exposure of 10⁸ alpha particles is fired at
   the foil and whatever lands in the detector is counted.
3. Drag the **Detector angle** slider in the right-hand panel, or press `→`, and expose again. Do it at
   5°, then at 45°, then at 135°.
4. Open **Distribution** in the left rail to see your points with both models drawn over them.

That is the whole loop. Everything else is about deciding where to point and how much to spend.

## Reading the apparatus view

A plan view, schematic, not to scale.

| What you see | What it is |
| --- | --- |
| Grey block, left | The lead shield, with the radium-emanation tube inside it as a gold wedge |
| Two grey blocks with a gap | The collimating diaphragm. The gap widens with the beam-spread control |
| Gold wedge across the middle | The incident beam. Its opening angle is the beam spread |
| Thick teal bar at the centre | The foil, labelled with its material and thickness |
| Graduated arc | The angular scale. Long ticks every 30°, medium every 15°, short every 5° |
| Orange wedge | The detector aperture — its width is the detector's angular radius |
| Small box and barrel | The zinc-sulphide screen and the microscope, rotated to face the foil |
| Amber dots on the screen | Scintillations. They fade over 900 ms |
| Faint gold lines | Sampled trajectories that passed nearly straight through |
| Bright orange lines | Sampled trajectories turned through more than 90° |

**The trajectories are not data.** They are drawn from the same laws that produce the counts, but no
number in the ledger comes from them, and no one has ever seen an alpha particle in flight. The view
says so in the corner. What Geiger and Marsden saw was the flashes, one at a time, in the dark.

Under reduced motion the whole sampled set is drawn statically instead of animating, and the counts
update the same way. Nothing measured depends on the animation.

## Reading the distribution

The vertical axis is **yield per steradian per incident particle** — the corrected count divided by the
exposure, by the aperture solid angle, and by the detector efficiency. That is exactly the quantity both
models predict, so measurements and models share an axis with nothing extrapolated between them.

| Mark | Meaning |
| --- | --- |
| Solid line | The nuclear model |
| Dashed line | The diffuse model |
| Filled dot with a vertical bar | A measurement, with its one-sigma counting error |
| Open arrow pointing down | An upper limit — a count that could not be told apart from background |
| Dotted vertical line | Where the detector is pointing now |

The two models are distinguished by line style as well as colour, so the plot reads correctly in
greyscale. Every chart has a written summary underneath it, and the distribution plot also has a
**"The same chart as a table"** disclosure for the exact numbers.

An upper limit is not a zero. It means the exposure was too small to see anything there, which is a fact
about your exposure and not about the atom.

## The controls

### Beam and target

| Control | Range | Notes |
| --- | --- | --- |
| Particles per exposure | 10⁴ – 10¹⁰, logarithmic | An exposure is a quantity of particles, not a length of time |
| Alpha energy | 3 – 10 MeV | Radium C′ gives 7.687 MeV. Scattering goes as 1/E² |
| Foil material | 9 metals | Every one appears in the 1909 or 1913 tables. Scattering goes as Z² per atom |
| Foil thickness | 20 – 4000 nm | The 1913 reference gold foil was 210 nm. Scattering goes as thickness |

### Detector

| Control | Range | Notes |
| --- | --- | --- |
| Detector angle | 0 – 180° | Arrow keys move it a degree at a time, `Shift` ten |
| Detector angular radius | 1 – 20° | Wider catches more and resolves less. The solid angle is shown |

### Advanced

Hidden behind a **Show** button, because none of it is needed for a first run.

| Control | Notes |
| --- | --- |
| Seed | The session seed. Every exposure derives its own from this and its position in the ledger |
| Detector efficiency | 0.85 by default, the figure Geiger and Marsden give for their screens |
| Background rate | Stray counts, per 10⁹ particles fired. The panel shows what that is per exposure |
| Beam angular spread | Convolved onto the exit distribution |
| Override target charge Z | Set it to A/2 to see the value Rutherford deduced |
| Simulation speed | Animation only. No count depends on it |
| Trajectories drawn | How many sampled paths the apparatus view shows |

### Readout

Below the controls: **b** (the head-on distance of closest approach), **n·t** (the only combination of
thickness and density that enters the scattering law), the beam velocity, the acceptance at the current
detector setting, the counts you should expect, and the background you should expect. Use the last two
to decide whether an exposure is worth taking before you take it.

## The screens

| Rail | Key | What is on it |
| --- | --- | --- |
| **Apparatus** | `1` | The bench, the last exposure in full, the derived geometry, and whether single scattering still holds |
| **Counts** | `2` | Particles fired and detected, large-angle and backscatter tallies, the detector sweep, predicted fractions beyond each angle, and measured-against-predicted row by row |
| **Distribution** | `3` | The angular distribution with model overlays, the polar view, and Geiger and Marsden's own Table II |
| **Evidence** | `4` | Every exposure with its settings and its seed, and all the exports |
| **Models** | `5` | Matched conditions through both models. Locked while a model is hidden |
| **Conclusion** | `6` | Blind verdict, guided wrap-up, or a plain statement of what a free session supports |
| **Assumptions** | `7` | Provenance of every number in play, what is left out, and what the instrument cannot establish |

## Presets

Every preset shows you exactly which values it will change, in a table, before it changes anything. None
of them clears the ledger — exposures taken before and after sit side by side, each carrying its own
settings.

| Preset | What it is for |
| --- | --- |
| **Gold Foil Reconstruction** | The 1913 configuration: radium C′ on the 210 nm gold foil, detector at 45° |
| **Thomson Prediction** | The same foil under the diffuse model. Count at 5°, then at 45° |
| **Rutherford Nuclear Scattering** | The nuclear model at settings matched to the above |
| **Large-Angle Search** | 135°, wide aperture, ten times the exposure. Tens of counts, not thousands |
| **Thin Foil** | A tenth of the reference thickness. Single scattering holds comfortably |
| **Thick Foil** | Twenty times the reference. Watch the validity flag turn |
| **Low-Energy Beam** | 3 MeV. Slower particles turn more easily |
| **High-Energy Beam** | 10 MeV. Roughly an order of magnitude fewer large deflections |

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` or `E` | Run one exposure at the current setting |
| `S` | Run a full detector sweep — fourteen angles from 5° to 150° |
| `←` `→` | Move the detector one degree · hold `Shift` for ten |
| `↑` `↓` | Widen or narrow the aperture |
| `1` – `7` | Switch screens, in rail order |
| `R` | Reset the session |
| `T` | Switch between the day and night themes |
| `?` or `/` | The full list |
| `Esc` | Close a dialogue |
| `Tab` | Every control, in reading order, with a visible focus ring |

## What to try first

**Find out where the models actually differ.** Load **Rutherford Nuclear Scattering** and take an
exposure at 5°. Load **Thomson Prediction** and take one at 5° as well. The counts will be within a
factor of a few. Now do both at 45°. One of them stops producing counts entirely.

**Watch a null result mean nothing.** Set the detector to 135° with a small exposure — 10⁷ particles —
and expose half a dozen times. Most will come back empty. That is what the nuclear model predicts there:
a fraction of a count. An empty detector is not evidence that nothing can arrive.

**Then make it mean something.** Raise the exposure to 10⁹ and take one more. If counts appear, no
diffuse-charge model in this instrument can produce them at any exposure whatsoever.

**Break the model on purpose.** Load **Thick Foil**. The apparatus screen will tell you that single
scattering has failed and that the small-angle end of the distribution is now understated. The
instrument does not stop you; it tells you what it has stopped being able to do.

**Reproduce Rutherford's mistake.** Open the advanced controls and set the Z override to 98.5 — half
gold's atomic weight, the value the 1913 paper deduced. Compare the acceptance at 45° against the same
setting with Z = 79. The factor between them is (98.5/79)² = 1.55, and it is the whole distance between
their conclusion and the right answer.

**Do the blind test more than once.** One correct answer at 90 per cent confidence tells you nothing
about your calibration, and the instrument says so on the results screen. Reset with a new seed, do it
five times, and see how often you are right at the confidence you claimed.
