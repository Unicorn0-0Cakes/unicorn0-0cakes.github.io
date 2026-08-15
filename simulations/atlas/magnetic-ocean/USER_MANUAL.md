# The Magnetic Ocean — User Manual

A hands-on guide to operating the instrument. Open `magnetic-ocean.html` in a browser to follow along.

## Getting started in 30 seconds

1. Pick **Guided discovery** from the four mode cards.
2. Press **Begin survey** in the top bar (or hit `Space`). The ship steams along the line and the trace
   draws itself, one station at a time.
3. When the line finishes, drag **Ridge axis** and **Half-spreading rate** in the left rail until the
   dashed predicted curve sits on the orange observed one and the residual below it goes flat.
4. Press **Commit interpretation** in the right-hand inspector, fill in the form, and commit. The hidden
   crust appears only then.

## Reading the four scopes

### Plan view — the chart table

The view from above. Vertical hairlines are echo-sounder contours at 200 m intervals: they show that the
seafloor rises somewhere, and nothing else. The orange line is the part of the trackline already run; the
dashed grey line is where the ship is going. The orange triangle is the ship, the gold dot behind it on a
thin line is the towed magnetometer. `L1`, `L2`… label completed lines. A teal vertical line marks the
axis you have proposed. A dashed oxide-red line marks the **true** axis, and it appears only after you
commit.

### Survey profile — the magnetometer record

The instrument's centre of gravity. Vertical axis is total-field anomaly in nT, horizontal is along-track
distance in km. Short ticks along the baseline are stations. **Red vertical bars are lost readings** —
the trace breaks there rather than being bridged, and the value is never replaced with a zero. Beneath
the trace, in teal, is the sounding profile on its own scale.

Hover, or focus the chart and use `← →`, to move the cursor. The exact value appears as text in the
scope header *and* in the Readout panel — never only in a tooltip.

### Interpretation workbench — observed, predicted, residual

Appears once a line is in the ledger. The orange curve is what you measured. The dashed teal curve is
what your current axis, rates and chronology predict, with amplitude and regional trend fitted by least
squares. Small violet ticks along the top edge are the polarity boundaries your model implies. The gold
vertical line is your axis.

Below, on its own zeroed axis, is the **residual** — observed minus predicted. The pale green band is
±1σ of the instrument noise you set. A residual that wanders inside that band has nothing left to
explain. A residual that swings in long smooth arcs outside it is telling you the model is wrong in a
structured way, not merely imprecise.

### Reveal — the hidden crust

Only after commitment. Top: your observed trace in orange against the crustal signal alone, without
noise or trend, in dashed gold. Middle: the magnetised blocks. **Normal crust is hatched one way and
lettered `N`; reversed crust is hatched the other way and lettered `R`** — the two never differ by
colour alone, so the panel reads correctly in greyscale. Below that, in violet, crustal age against
distance. The dashed oxide line is the true axis; the teal line is where you put it.

## The controls

### Run

**Mode** switches between the four modes and restarts. **Preset** picks a generic world (guided and
laboratory modes only; blind and comparison draw theirs from the seed). **Seed** is editable — type a
number and the world rebuilds deterministically.

- **Restart same seed** — identical seafloor, identical noise, ledger cleared.
- **New seed** — a new world.
- **Reset controls** — survey settings back to defaults; the hidden world is untouched.

### Survey design

**Track start** slides the line east or west on the chart. **Track length** costs ship-hours in
proportion. **Track angle to ridge** is 90° for a perpendicular crossing; the panel tells you the stretch
factor and refuses anything under 15°. **Sample spacing** is free — it costs no ship-hours. **Sensor
altitude** is the vertical distance from the fish down to the top of the magnetised layer. **Ship speed**
sets how fast the budget burns.

The panel states what the next line will cost before you run it.

### Instrument & sea state

An accordion, open until you have run something. Noise, regional trend, navigation uncertainty and
dropout rate. The **echo sounder** can be switched off, which removes the bathymetric hint entirely and
leaves you with magnetics alone.

### Laboratory — the true world

Visible only in Laboratory mode, in a warning-bordered panel. The true axis, both half rates and the
effective inclination, exposed as sliders. Moving one rebuilds the world *and* re-collects any line
already run, because the seafloor it was collected over has just changed. Nothing you infer in this mode
is a test of anything, and the panel says so.

### Interpretation

**Ridge axis**, **Symmetry**, one or two **half-rate** sliders, and the **polarity chronology** selector,
which names its source underneath. The implied full spreading rate is shown as you go — it is the *sum*
of the two half rates, never one of them.

- **Fit symmetric** / **Fit asymmetric** run the automatic search, with a progress bar. It works outward
  from the axis, the way a person does. It is a search, not an oracle: it reports what fits best under
  the assumptions you have set and cannot tell you those assumptions are right.
- **Compare four explanations** scores symmetric spreading with reversals, asymmetric spreading with
  reversals, stationary crust with correlated magnetisation, and spreading with a constant-polarity
  field. With two or more lines run, the models are fitted on the earlier ones and scored on the last,
  which none of them has seen.

## The screens

**Readout** — seed, ship-hours, lines run, current station, along-track and chart position, the anomaly
at the cursor, readings lost, ridge-normal span, and the apparent stretch factor if the track is oblique.

**Your current interpretation** — axis, both half rates, full rate, profile RMSE against the instrument
noise, correlation and residual lag-1 autocorrelation, with a note when the residual is at the noise
floor or is strongly structured.

**Candidate explanations** — one card per model with RMSE, correlation, parameter count, ΔAICc and, where
available, held-out RMSE. Each structural model offers **Adopt these numbers**. Beneath them, a verdict
written in the language the evidence supports: *better supported under this survey*, or *unable to
distinguish*, never *proved*.

**Lines run** — the ledger. **View** switches which line the scopes show. **Export observations**
downloads a CSV with a commented header carrying the seed, every setting, the units of every column, and
the model version. Before commitment the hidden world is *not* in that file; after commitment it is.

**Text equivalent** — a plain-language block below the scopes stating the same numbers the charts show:
how many good readings, over what distance, at what spacing and angle, the anomaly range and mean, how
many readings were lost, how many times the trace crosses its own mean, and — once you have one — your
current interpretation and its residual. It is not a description of a picture. Everything the instrument
concludes can be read here.

**Explanation** — three levels. *Quick* explains the mechanism without geology. *Mechanism* covers
remanent magnetisation, the width–duration–rate arithmetic, and why the measured signal is smoother than
the blocks. *Methods* opens the full page with equations, sources, assumptions, tests and limits.

## Presets

| Preset | Try it for |
|---|---|
| Clean symmetric ridge | Learning what a good fit looks like |
| Slow-spreading ridge | Watching the short subchrons blur together at 0.9 cm/yr |
| Fast-spreading ridge | The same chronology laid out five times wider |
| Asymmetric ridge | Switching **Symmetry** to asymmetric and seeing the residual collapse |
| Oblique survey | Reading a rate off the trace, then dividing by 1/sin 35° |
| Noisy old instrument | Finding out how much noise it takes before the answer stops being recoverable |
| Null world | Being told there is no rate to find — and reporting that |
| Spreading, no reversals | Seeing that spreading alone makes no stripes |

## Keyboard shortcuts

| Key | Does |
|---|---|
| `Space` | Begin a line, or pause and resume one |
| `S` | Step one station |
| `R` | Restart on the same seed |
| `N` | New seed |
| `E` | Export observations |
| `?` | Quick explanation |
| `T` | Day / night |
| `Esc` | Close a dialogue |
| `← →` | Move the profile cursor (focus the chart first; `Shift` for ten) |
| `Home` / `End` | Jump the cursor to the ends of the line |

Every control is reachable by `Tab` with a visible focus ring, every slider has a label, and the commit
form is an ordinary form that can be completed without ever looking at a chart.

## What to try first

1. **Guided discovery, clean preset.** Run the line. Before touching anything, look at the trace and
   pick, by eye, the position it seems to be symmetric about. Set the axis there. Then move the rate
   slider slowly from 1 to 4 cm/yr and watch the residual. The point where it drops to the noise band is
   sharp — much sharper than you would expect — and that sharpness is the whole reason a chronology with
   two dozen boundaries is such a good ruler.
2. **Oblique survey.** Fit it as if the track were perpendicular. Note the rate. Now divide by 1.74.
3. **Null world.** Fit it as hard as you can, then press **Compare four explanations**. Read the verdict.
4. **Blind survey.** Spend your sixty ship-hours however you like — one long line, or two short ones plus
   a held-out third. Then commit, and read the last section of the report: *would another transect have
   helped?*
