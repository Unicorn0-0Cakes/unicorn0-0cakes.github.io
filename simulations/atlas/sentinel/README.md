# SENTINEL — The Oversight Experiment

A spin-off of the Cognitive Civilization Experiment, built around the two metrics CCE
could not move: **abuse detection delay (D)** and **governance quality index (G)**.

> Not calibrated. No parameter is fitted to empirical data. This is an instrument for
> reasoning about model structure, not a claim about the world.

**Status: complete.** Open `sentinel.html` in any browser — the model runs live in the page,
no server and no build step. See §5 for verification.

---

## 1. Why those two metrics were noise in CCE

I was right that nothing I touched moved them. It isn't a tuning problem — both
metrics are structurally severed from the treatment variable.

**Governance quality.** In `cce/engine/cce_engine/government.py`:

```
gov.quality = 0.5 + 0.2*mean(competence) + 0.2*mean(ethics) - 0.6*corrupt_frac
```

`competence` and `ethics` are drawn in `_traits()` as `r*z + sqrt(1-r²)*N(0,1)`, with
`r = 0.20` for competence and `r = 0.0` for ethics. Over ~60 officials, the mean of those
draws is `N(0, 1/√n)` — so G is white noise centred on 0.5 with an SD around 0.03. That is
exactly the 0.389–0.630 band on my chart. The allocation rule never enters the
expression. There is also no state carried between years: G is redrawn from scratch
annually, which is why the trace has no trend, no memory and no regime.

**Detection delay.** In `safeguarding.py`, `p_detect = 1 - (1-eff)^checks_per_year` is
close to 1 under the default regime, and `max_undetected_duration` force-detects anything
that survives. Almost every situation is caught in the year it starts, so the metric is
the sampling noise on a near-zero mean — the 0.02–0.08 range on my chart. The governance
coupling that does exist is `eff * (0.85 + 0.3*gov_quality)`, and since G ≈ 0.5 always,
that multiplier is ≈ 1.0 forever. It is a wire that carries no signal.

## 2. What SENTINEL changes

Five structural changes, all upstream of the same two metrics:

1. **Institutional inertia** — `G_t = 0.84·G_{t−1} + 0.16·G_target`. G becomes a slow
   state with memory and regimes instead of an annual coin flip.
2. **Two-way coupling** — G multiplies detection capability through `0.30 + 1.35·G`
   (real leverage, versus CCE's `0.85 + 0.3·G`), and detection of official capture feeds
   back into G by clearing seats.
3. **Red Queen concealment** — perpetrators track detection pressure and invest in
   concealment, so raising raw capability is partly self-cancelling. This is why
   per-check yield ranks lower than I'd expect.
4. **Channel correlation** — effective channels = `1 + (k−1)(1−ρ)`. At ρ = 0.95, eight
   oversight bodies behave like one. This is the model's answer to "we added more
   oversight and nothing happened."
5. **Capture cascade** — captured officials shield each other via a logistic collapse of
   audit effectiveness past ~35% captured. G becomes **bimodal**, not noisy: a system is
   either in the clean basin or the captured basin, with a genuine tipping point.

## 3. Levers

Twelve continuous levers plus a categorical selection rule, in two blocks:

- **Detection** — channels, channel correlation, inspection interval, per-check yield,
  reporter protection, concealment adaptivity, hard duration cap.
- **Governance** — audit independence, term length, transparency lag, capture pressure,
  oversight budget, selection rule (highest score / sortition / peer election / track
  record).

Note two designed interactions: reporter protection is gated by G (nominal protection in
a weak institution is worth little), and track-record selection is gated by transparency
lag (you cannot select on a record nobody can read — at a 20-year lag it degrades to a
random draw).

**Three decoys** — CCE's `leader_competence_iq_link`, an allocation-rule weight, and a
population scale factor — are sampled by the sensitivity screen but read by nothing. If
they rank above the noise floor, the screen is broken. That's the validity check.

## 4. Three oversight regimes (replacing A/B/C)

| | Architecture |
|---|---|
| **I · CENTRAL** | One strong central inspectorate, well funded, long-serving, reporting to the body it inspects. |
| **II · DISTRIBUTED** | Many separate channels under separate authorities. Weaker per channel, hard to switch off all at once. |
| **III · ADVERSARIAL** | Audit answering to nobody it audits, protected reporting, short terms, near-immediate publication. |

External shocks (austerity, interest surges) come from a stream shared across regimes for
a given seed — same shocks, same years, same severities — exactly as in CCE.

## 5. Verification

Headless regression against the inlined kernel, all passing:

| Check | Result |
|---|---|
| Regime separation | D ordered III < II < I (0.53 / 1.11 / 1.86 yr); G ordered III > II > I (0.913 / 0.656 / 0.462) |
| Determinism | Exact replay under seed |
| Finiteness | Zero non-finite values across 40 seeds × 300 years |
| Channel correlation is live | 8 channels at ρ=0.00 → D 0.59; at ρ=0.95 → D 2.86 |
| Concealment adaptivity is live | λ=0 → concealment 0.000, D 1.22; λ=1 → concealment 0.293, D 1.95 |
| Screen validity | Decoy noise floor 0.068 vs theoretical 1/√n = 0.065; top levers exceed it by >2× |
| Bistability | Gap statistic 8–27 at boundary points, against 3.3 for a uniform control |

Two bugs the verification caught, both worth recording because they are the same
failure mode this instrument exists to detect:

- **Concealment adaptivity measured as null.** λ initially controlled only the *rate* of
  convergence, so every λ > 0 reached the same equilibrium and the lever did nothing. It
  now sets the ceiling. This is exactly CCE's governance-index problem in miniature — a
  parameter that is wired in, looks meaningful, and cannot move the outcome — and it was
  found by the sensitivity screen, not by reading the code.
- **The bifurcation wasn't one.** Without a contagion term the audit function is always
  restoring, so the system had a single basin and the tipping panel showed a smooth
  curve. Capture now spreads between officials, which turns the shield into a genuine
  saddle-node.

Also fixed in review: the kernel exported a global function named `screen`, colliding with
`window.screen`.

## 6. The interface

`sentinel.html` — self-contained, ~79 KB, no dependencies. 70s NASA palette: cream stock,
burnt orange, oxide red, hairline plotter rules.

- **Briefing** — the diagnosis above, with the CCE expressions that produce it.
- **Console** — all twelve levers plus the selection rule, live. Every drag re-simulates
  four 500-year runs in ~100 ms. The three regimes and your custom trace overlay on a
  shared shock stream.
- **Sensitivity** — the global screen. Latin hypercube, standardised regression
  coefficients for both outcomes, decoys marked and the noise floor drawn on the bars.
- **Tipping** — the collapse-probability basin map over (independence × capture pressure),
  with a fine slice showing every replicate so the bimodality is visible directly.
- **Method** — every equation, the selection-rule table, the full parameter register, and
  the limitations.

## Files

- `sentinel.html` — the instrument. Open it directly.
- `model.js` — the same kernel as a Node module, for headless batch work. Exports
  `simulate`, `sensitivityScreen`, `bifurcation`, `defaults`, `REGISTER`, `REGIMES`,
  `SELECTION_RULES`.
