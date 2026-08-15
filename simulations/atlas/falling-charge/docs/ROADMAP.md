# Milestone roadmap

| milestone | contents | status |
|---|---|---|
| **M0 — Scientific specification** | research questions, hypotheses, equations, force model with signs, parameter register, units, uncertainty model, data model, numerical plan, UX flow, validation plan, architecture, risk register | **complete** (this `docs/` directory) |
| **M1 — Ideal apparatus** | apparatus visualisation, droplet generation, Stokes drag, field-off fall, voltage control, balanced suspension, tracking + timing, radius, charge, deterministic seed, notebook, CSV export | **complete** for the listed items, plus rise/slowed-fall methods, Cunningham correction, Brownian motion, blind mode, reveal, candidate-lattice + weighted regression, and JSON bundle export — because a slice that stops before an inference is not a vertical slice |
| **M2 — Measurement laboratory** | multiple droplets ✓, microscope tracking ✓, rise and fall methods ✓, calibration ✓, uncertainty propagation ✓ (Monte Carlo), accept/reject ✓, blind mode ✓, reveal ✓, core charts — **partial** | **partial** |
| **M3 — High-fidelity physics** | Cunningham ✓, Brownian ✓, temperature ✓, pressure ✓, viscosity ✓, voltage drift ✓, focus error ✓, timing error ✓, charge changes ✓, evaporation ✗, edge fields ✗, lateral tilt drift ✗ | **partial** |
| **M4 — Scientific inference** | candidate lattice ✓, weighted regression ✓, robust ✗, likelihood ✗, model comparison ✗, exclusion sensitivity ✓, uncertainty budget — partial | **partial** |
| **M5 — Reporting and reproducibility** | JSON + CSV export ✓, bundle ✓, PDF ✗, checksums ✗, deterministic replay driver ✗, manifests ✓, notebook export ✓, methods page ✓ | **partial** |
| **M6 — Batch experiment** | 100/1000-run modes, estimator validation, coverage, policy comparison, systematic-error experiments | **not started** |
| **M7 — Portfolio integration** | catalogue card ✓, filters ✓, methods link ✓, status badge ✓, version display ✓, accessibility audit ✗, Pages validation — partial | **partial** |

## Next three pieces of work, in order

1. ~~**Fix L-1**~~ — **done during Milestone 1 testing.** The Brownian-aware
   standard error is implemented and the recalibration it forced is recorded in
   `LIMITATIONS.md` L-1 and L-19.
1. **Multi-transit measurement (L-20)** — one fall and one field-on observation
   per droplet caps per-measurement precision at 5–10 %. Millikan reversed the
   field repeatedly and averaged over many transits of the same droplet. This is
   the single largest available improvement in data quality and it is also the
   historically correct technique.
2. **Mode G (batch)** — without it, six of the eight hypotheses and three of the
   five research questions cannot be addressed at all, and no claim about
   coverage can be made.
3. **Model comparison with its two-sided gate** — RQ2, and the risk that it is
   rigged by construction (R-S6) is best addressed by building the falsification
   test first and the feature second.
