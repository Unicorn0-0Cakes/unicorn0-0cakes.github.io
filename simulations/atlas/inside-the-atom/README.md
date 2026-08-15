# Inside the Atom

A gold foil 210 nanometres thick — about two thousand atoms — a pencil of alpha particles at 7.687 MeV,
and a zinc-sulphide screen you can swing to any angle around it. Of the particles that cross the foil,
roughly one in nine thousand turns through more than ninety degrees and comes back out the side it went in.

Open `inside-the-atom.html` in any modern browser. Nothing to install, no build step, no network access.

---

## What it is

A scattering instrument built around one rule:

> **A theory that says a thing is rare and a theory that says it is impossible make the same
> prediction everywhere the counting is easy.**

Both models of the atom put almost the whole beam within a couple of degrees of straight ahead. At one
degree the diffuse-charge model predicts *more* scattering than the nuclear one. They agree, near enough,
out to about five degrees — and every exposure spent there is cheap, quick, and worth nothing.

Past thirty degrees they stop agreeing. Past ninety, one of them predicts a small number and the other
predicts zero to every decimal place a computer holds. That is where the answer is, and it is also where
the counts are single figures, the background is a real fraction of the total, and an exposure can come
back empty for no reason at all. You have to decide how long to look at nothing before nothing means
something.

## The model

Two competing angular distributions, both taken from Rutherford's 1911 paper, which sets them out side
by side precisely so they can be told apart.

**Nuclear** (Rutherford §§2–3). A single close encounter with a point charge. The particle follows a
hyperbola with the centre as external focus:

    b = Z₁Z₂ke²/E          cot(φ/2) = 2p/b
    P(> φ) = (π/4)·n·t·b²·cot²(φ/2)              Rutherford eq. (3)
    dP/dΩ  = n·t·(b/4)²·cosec⁴(φ/2)              Rutherford eq. (5)

The impact parameter is sampled uniformly in area out to `p_max = 1/√(πnt)`, the projected area per
atom, which reproduces equation (3) exactly. That bound does useful work: it cuts the distribution off
at a smallest possible deflection, 0.335° for the reference foil, so the cross-section's divergence at
zero angle never has to be regularised by hand and no probability can exceed one.

**Diffuse** (Thomson's atom, in the form Rutherford gives in §5). Many tiny deflections accumulating:

    θ_t = (π·b_T/8)·√(π·n·t)        P(> φ) = exp(−φ²/θ_t²)

The charge in `b_T` is Thomson's, not Rutherford's: on the diffuse picture the deflecting charge is the
atom's whole complement of corpuscles, which Crowther deduced from beta-ray scattering to be about three
times the atomic weight — 591 for gold. That choice is what makes it a fair opponent. Given N = Z it
would fail at both ends and the comparison would be a straw man; given N = 3A it reproduces roughly the
small-angle scattering that was actually observed, and still predicts nothing whatever past twenty degrees.

Chance enters at three places and nowhere else: the binomial draw of particles into the detector
aperture, the binomial draw of those the screen records, and the Poisson background. The acceptance
itself is computed by quadrature rather than by simulating particles one at a time, so an exposure of
10⁹ costs the same as one of 10³ and the counting statistics are exact rather than approximated by a
small sample. Everything is seeded: exposure *k* of a session seeded *S* derives its generator from
(*S*, *k*), so a run reproduces exactly while two exposures at the same settings remain independent
counts. In blind mode the hidden model comes from the seed too.

### Where it agrees with the papers

| Check | Published | This model |
| --- | --- | --- |
| b for Z = 100 at u = 2.09 × 10⁹ cm/s | ≈ 3.4 × 10⁻¹² cm | 3.18 × 10⁻¹² cm |
| N for gold, inverted from Geiger's most probable angle | 97 | 97.0 |
| Fraction to 45° on 1 mm² at 1 cm, gold 2.1 × 10⁻⁵ cm | 3.7 × 10⁻⁷ ± 20% | 3.17 × 10⁻⁷ |
| Scattering per atom against charge | ∝ Z² | (79/29)² to 2% |
| Scattering against energy | ∝ 1/E² | 4.00× from 4 to 8 MeV |
| Scattering against thickness | ∝ t, thin foils | 10.0× from 50 to 500 nm |

The 14 per cent shortfall in the third row is not noise. Geiger and Marsden deduced the central charge
of gold to be half its atomic weight, 98.5; the nuclear charge is 79. Put their number in and the
agreement becomes exact, which is how they got it.

## What it is not

The apparatus is schematic. The 1913 chamber was a brass ring 3.5 cm deep, evacuated with charcoal
cooled by liquid air, source 2.5 cm from the foil and screen on a circle of 1.6 cm radius; none of that
is reproduced, and none of it would change a count in a model that depends on the foil only through
`n·t` and on the detector only through its angle and its solid angle.

The trajectories drawn on the apparatus view were never visible to anyone. What Geiger and Marsden saw,
after half an hour in a dark room getting their eyes in, was a flash on a zinc-sulphide screen, one
particle at a time, counted by a person who could manage no more than ninety a minute and no fewer than
about five. The paths come from the same laws as the counts, but they are the simulation showing its
own working, and the view says so.

Multiple scattering is not implemented. Neither is energy loss in the foil, nuclear recoil, electron
screening, the nuclear force, or any quantum mechanics at all. The thickness control runs past the point
where single scattering holds; when it does the instrument says so on the apparatus screen and in the
exported configuration rather than refusing the setting.

And Rutherford's atom is not the modern one. The 1911 paper proposes a concentrated central charge,
declines to say whether it is positive or negative, and sets the question of the atom's stability aside
entirely. What the scattering experiment established is narrower and firmer than a model of the atom:
that almost all the positive charge and mass sits in a volume very much smaller than the atom itself.

Because of all this, anything you get by turning the controls is a statement about **this model**, not
about what Geiger and Marsden would have found. Fire the beam at carbon and the counts that come back
are what a classical point-charge law with no recoil predicts for carbon — and the recoil correction
Rutherford calculated for light atoms is precisely the term this model omits. The instrument is at its
most trustworthy in the regime it was built from: a thin foil of a heavy metal, a few MeV, single
scattering.

## Modes

**Guided reconstruction** — the 1909 experiment in five steps: the apparatus, a prediction you commit to
before you look, collection, comparison, and why the rare events are the ones that matter. The
recommended first run.

**Blind model identification** — one of the two models is chosen from the seed and hidden. You choose
where to point and how much exposure to spend, then state a model and a confidence. The answer appears
only after your conclusion is on the record, alongside a likelihood ratio computed from your actual
observations and a note on which of them did the work.

**Model comparison** — matched seeds, matched angles, matched exposure, both models at once, overlaid.

**Free laboratory** — every control unlocked, including the ones that take the model outside its
assumptions.

## Files

```
inside-the-atom.html      the page
methods.html              methods & limitations, seven sections
css/inside-the-atom.css   page-local styles over the --rf-* tokens
js/config.js              constants, target table, control ranges, presets, historical data
js/model.js               both scattering laws, the detector, the ledger — no DOM, runs in node
js/charts.js              distribution, polar and sweep plots
js/apparatus.js           the bench view and its animation
js/screens.js             every screen and the control inspector
js/events.js              input handling and the exports
js/main.js                boot, state, animation loop
js/test.js                53 assertions on the physics          (development only)
js/smoke.js               99 assertions on the interface        (development only)
```

Run the checks with `node js/test.js` and `node js/smoke.js`. Neither needs a browser or a package.

## Keyboard

`Space` or `E` exposure · `S` sweep · `←` `→` detector angle, `Shift` for ten degrees · `↑` `↓` aperture
· `1`–`7` screens · `R` reset · `T` theme · `?` the full list.

Reduced-motion preferences are respected automatically, and the Pause control in the bar at the top of
the page does the same on demand. In that state the apparatus draws a static sample of paths and the
counts update without animation. Nothing measured or exported depends on the animation.

## Sources

- Geiger, H. and Marsden, E. (1909). On a Diffuse Reflection of the α-Particles.
  *Proceedings of the Royal Society A* **82**, 495–500.
- Rutherford, E. (1911). The Scattering of α and β Particles by Matter and the Structure of the Atom.
  *Philosophical Magazine*, series 6, **21**(125), 669–688.
- Geiger, H. and Marsden, E. (1913). The Laws of Deflexion of α Particles through Large Angles.
  *Philosophical Magazine*, series 6, **25**(148), 604–623.

---

*Part of the [Simulations and Interactive Experiences](../README.md) collection.*
