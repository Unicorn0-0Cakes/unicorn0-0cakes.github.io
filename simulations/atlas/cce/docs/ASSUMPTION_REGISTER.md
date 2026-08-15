# Assumption Register

Every scientific decision that the brief left open, the defensible default chosen, and
where it is testable. All are configurable; all high-impact ones are in the sensitivity
plan. **None is calibrated to data.**

## A. Inferred from the brief

| # | Assumption | Basis |
|---|---|---|
| A1 | "IQ" in the government rules means the **relative civic IQ** (norm-referenced, ceiling 150), not absolute capability | The brief caps reported scores at 150 and requires renormalisation every cycle |
| A2 | Assistance is need-based in **all three** societies; Society A allocates occupation, housing and office by score, not assistance | Stated explicitly for A |
| A3 | The population cap is a hard invariant, not a target | "may never exceed"; "must enforce this as an invariant" |
| A4 | The primary A/B/C comparison uses one fertility policy in all arms | Stated |
| A5 | Government structure is common across arms and modular | Stated |
| A6 | Abuse must be possible but bounded in duration | "Do not simply set abuse to zero"; maximum undetected duration |
| A7 | Cognitive ability must not directly determine outcomes | Stated repeatedly; implemented as named pathways only |

## B. Chosen defaults where the brief left the decision open

| # | Decision | Default chosen | Rationale | Sensitivity |
|---|---|---|---|---|
| B1 | Time step | Annual, with event-driven sub-processes | Benchmarks show annual meets scale with 50× headroom; finer resolution buys nothing for 500-year outcomes | low |
| B2 | Normalisation reference | Previous completed cycle's observed scores; year 0 self-referenced | The brief specifies the prior cycle; year 0 has no prior | high |
| B3 | Primary normalisation method | Arithmetic mean and SD | Conventional for IQ scoring, as instructed | high |
| B4 | Adult civic classification age | 20 | The brief's stated default | high |
| B5 | Number of latent dimensions | 11 | Covers the 16 listed competency dimensions once experience, expertise, physical capacity, preference and demonstrated performance are stored separately | medium |
| B6 | Official battery measures 6 of 11 dimensions | Practical judgment, social understanding, emotional regulation and consistency are unmeasured | Makes "IQ is not everything" a mechanism rather than an assertion; it is the causal source of A's classification error | **high** |
| B7 | Emergency assessment changes support immediately, civic classification only at the next cycle | Configurable, default "support now, classification later" | The brief explicitly leaves this configurable | high |
| B8 | Leader competence link to g | 0.20; ethics link 0.00 | The brief forbids assuming high IQ implies good leadership; a modest positive planning link and a null ethics link is the least-assuming defensible choice. **H7 may only be reported with the sweep over both.** | **high** |
| B9 | Heritability of the latent endowment | 0.50 with regression to the contemporaneous mean, shared environment 0.20 | Mid-range; a model knob, not an empirical claim. Drives the sign of H10 | **high** |
| B10 | Gestation | One year at annual resolution, 85% completion | Annual time step; sub-annual gestation is M2 | low |
| B11 | Mate selection | Father drawn uniformly from in-window males (no assortative mating) | Least-assuming baseline; assortative mating is an M2 addition that matters for H10 | **high** |
| B12 | Healthy / independent thresholds | Health ≥ 0.55; adaptive ≥ 0.50 **and** support ≤ 2 | Independence requires both capability and the absence of heavy supervision | high |
| B13 | Life-expectancy method | Sullivan period life table on single-year ages | Standard for HALE; cross-checked against per-citizen cohort accumulators | medium |
| B14 | Mismatch definition | Weighted capability shortfall **plus** 0.25 × unused capability | A person far above a role's demands is also mismatched; penalising only shortfall would bias toward A | **high** |
| B15 | Scaffolding is costly | 3% / 11% / 7% of output for A / B / C | Accessibility is not free; without a cost B would win by construction | **high** |
| B16 | Support rationing | Highest-need-first under a budget | Any other rule (uniform cut, lottery) is a separate policy question | high |
| B17 | Preparedness caps shock absorption at 55% | Fixed | Prevents an arm from becoming shock-immune | medium |
| B18 | Collapse definition | Population below 10% of cap | Needs a threshold; arbitrary but declared | low |
| B19 | Retirement | Roles vacated at 70 | Simple, uniform across arms | low |
| B20 | Panel selection | Deterministic stride at initialisation, 1% of newborns | Reproducible without a separate stream | low |

## C. Known omissions (scope boundaries, not oversights)

Spatial structure · markets and prices · disease transmission · household objects ·
assortative mating · migration · 19 separate need domains · legislation and coalitions ·
strategic perpetrators · disability typing · cause-of-death taxonomy · cultural and
linguistic test bias · institutional evolution over 500 years.

Each is listed with its consequence in `ETHICS_AND_LIMITATIONS.md` §4 and, where
planned, in `ROADMAP.md`.

## D. Contradictions found in the brief and how they were resolved

| Tension | Resolution |
|---|---|
| "IQ allocates housing in A" vs "support must follow need, not IQ" | Separated: **allocation** of occupation/housing/office by score in A; **assistance** always by assessed need in all arms. Both invariants tested. |
| "Every populated band gets a seat" vs "seats proportional to population" | Guaranteed floor of 1 seat per populated band, then proportional seats on top; the floor cannot be diluted. |
| "President is the highest scorer" vs "IQ must not guarantee good leadership" | Score determines **eligibility**; competence and ethics are separately drawn with configurable, weak links. |
| "No retesting" vs "emergency assessment may change classification" | Retesting is never citizen-initiated; emergency assessment is medically triggered only, and whether it changes *civic* classification is a documented configurable. |
| "Detect essentially all hidden abuse" vs "do not set abuse to zero" | Abuse initiation is stochastic and non-zero; only its **duration** is capped, and the cap's cost (false positives, privacy, expense) is measured. |
| "1,000 runs give tight confidence intervals" vs "no result is indisputable" | 1,000 runs quantify stochastic uncertainty only; parameter uncertainty is handled separately and dominates. Stated in every report. |
| Population cap of exactly 100,000 vs births and deaths both allowed | Slot-based state: the cap is structural, births queue against openings, and every denial is logged. |
