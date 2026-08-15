# User Manual — The Cognitive Civilization Experiment

`cce.html` is a **results explorer**, not a playable simulation. It contains no model: it
displays real output from completed runs of the Python engine, embedded at build time by
`analysis/export_web_data.py`. Nothing on the page is hand-typed, and nothing on it can
disagree with the engine, because there is only one implementation of the model.

Open `cce/cce.html` directly, or reach it from the simulations index.

## The seven tabs

**Overview** — the research question, the mandatory disclaimer, the three societies in plain
language, and a causal diagram showing that cognition never touches an outcome directly.
Headline numbers come from one seed and are labelled as engineering output, not results.

**The three societies** — what is held identical across arms (population, government,
disasters, medicine, fertility policy, safeguarding) and what differs (the allocation rule,
accessibility and its cost, the housing weight). Also explains the nine support levels and
why over-support is treated as a failure, not a kindness.

**Dashboard** — 500-year time series at 100,000 citizens. Choose a seed, toggle societies,
pick from twenty metrics. Vertical grey lines are external shocks, drawn from a stream shared
by all three arms: the same disasters, in the same years, at the same severities. The final
panel shows why two cognitive measurements are kept — relative civic IQ sits at 100 forever
by construction, while absolute capability is free to drift.

**Results** — the matched-seed paired contrasts (B−A, C−A, C−B), which are the actual
treatment estimates. Each carries its 95% BCa interval, Monte Carlo standard error, and its
position relative to the preregistered smallest effect size of interest. The shaded band on
the chart marks differences too small to matter; an estimate inside it whose interval excludes
zero is flagged **precise but below SESOI**.

**Government** — presidential score across five centuries, how each presidency was decided
(ties at the reporting ceiling are common and are broken deterministically), representation of
every populated band, and the accountability event log.

**Methodology** — the ten constructs kept separate, the observation model, the testing
schedule, the structural population cap, the safeguarding position, and the known limitations.

**Provenance** — every run's model version, git commit, parameter fingerprint and per-file
checksums, plus the exact commands to reproduce them.

## Reading the numbers responsibly

* **No parameter is calibrated.** All 92 are marked `not yet calibrated`. Quantities that look
  like life expectancies are model artefacts.
* **The full-scale runs are single seeds**, tagged `exploratory`. They demonstrate that the
  instrument runs; they are not findings.
* **The paired contrasts come from a reduced-scale rehearsal** — 30 seeds at 10,000 citizens ×
  100 years, not the full 100,000 × 500 pilot. Directions are provisional; magnitudes do not
  transfer.
* **No preregistered campaign has been run.** Calibration, preregistration freeze, pattern
  validation and global sensitivity analysis all remain outstanding.

## Regenerating the page

```bash
cd cce
python3 analysis/export_web_data.py --pilot batches/rehearsal-30
```

The script verifies every run before exporting it — manifest, checksums, row counts,
population cap, band representation, safeguarding interval and non-finite values — and refuses
to publish a run that fails. It rewrites the payload between the `DATA_START` and `DATA_END`
markers in `cce.html`.

To point the page at new runs:

```bash
python3 analysis/export_web_data.py --runs runs --pilot batches/pilot-30 --check   # preview
python3 analysis/export_web_data.py --runs runs --pilot batches/pilot-30           # write
```
