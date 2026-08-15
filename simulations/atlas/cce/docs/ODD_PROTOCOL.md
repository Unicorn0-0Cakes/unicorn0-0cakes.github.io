# ODD Protocol

Overview, Design concepts, Details (Grimm et al. structure). This describes the
Milestone 0 reference kernel as implemented; items scheduled for later milestones are
marked **[M2]** or **[M3]**.

---

# 1. Overview

## 1.1 Purpose

To compare three institutional rules for allocating work, housing, assistance and
representation — IQ-based (A), universal cognitive support (B), multidimensional
competency (C) — on healthy lifespan, independence, productivity, innovation, safety,
inequality and institutional stability over 500 simulated years, holding government
structure, population cap, external events and measurement rules constant.

## 1.2 Entities, state variables and scales

| Entity | Key state | Where |
|---|---|---|
| **Citizen** | age, sex, parents, 11-dimensional latent cognitive profile (Year-0 absolute scale), absolute capability `g_abs`, education years and quality, childhood adversity, official score + standard error + band + sittings, health index, chronic conditions, disability, mental health, sensory impairment, dementia, physical capacity, acute illness, stress, adaptive functioning, assessed need, support level, unmet need, cumulative over-support, housing type, occupation, preference, experience, expertise, performance, mismatch, burnout, desired/actual children, permit, waiting time, pregnancy, vulnerability, abuse state, offence count, cumulative healthy and independent years | `state.py` |
| **Occupation** | demand share, complexity, 11-dim requirement vector + weights, physical/social demand, error consequence, training years, stress, novelty | `occupations.py` |
| **Household/housing unit** | one of nine housing types, from independent to high-supervision **[M2: explicit household objects]** | `models.HOUSING_TYPES` |
| **Government** | president (slot, band, competence, ethics, corruption), assembly seats by band, governance quality, succession and by-election history | `government.py` |
| **Society (environment)** | scaffolding strength and cost, allocation rule, housing preference weight, support capacity, medical level, technology level, climate drift | `params.py` |

**Scales.** Time step = 1 year; horizon = 500 years; assessment cycle = 5 years;
population = exactly 100,000 slots (hard cap). Space is not represented explicitly
(non-spatial model) **[M2: coarse regions for transport/housing access]**.

## 1.3 Process overview and scheduling

Each simulated year, in this fixed order (`kernel.Simulation.step`):

1. **Shared external history** — draw a fixed 24-value block from the `shocks` stream;
   decode into events; update medical progress. *Identical in A, B, C at the same seed.*
2. **Ageing and development** — age +1; schooling for ages 5–18; adversity applied;
   absolute capability recomputed from the latent profile.
3. **Function, support, housing** — adaptive functioning; noisy needs assessment; support
   assignment under a resource ceiling; housing review every 5 years.
4. **Work** — occupational (re)allocation on the reallocation cycle by the arm's rule;
   performance, mismatch, burnout, training, experience; output and innovation.
5. **Health and mortality** — chronic onset, dementia, injury, mental health, sensory
   decline, acute illness; health-literacy pathway; mortality hazard; deaths.
6. **Accumulators and life table** — healthy and independent person-years; age-specific
   death rates and prevalences for the Sullivan life table.
7. **Safeguarding** — abuse initiation, welfare checks, detection, hard duration cap,
   intervention.
8. **Fertility** — permits against available population openings, conception, delivery,
   inheritance, postponement logging.
9. **Assessment and government** — on assessment years: testing, normalisation, banding,
   presidential selection, assembly election. Every year: corruption, audits, legal
   accountability, succession, by-elections restoring the representation guarantee.
10. **Recording** — annual aggregate row; panel rows; events; five-year snapshots.

---

# 2. Design concepts

**Basic principles.** Institutional sorting under measurement error. Cognition is treated
as a multidimensional, partially observable, developmentally plastic construct; official
classification is an error-prone projection of it onto one number.

**Emergence.** Life expectancy, inequality, mismatch, institutional quality, corruption
persistence, band-population structure and collapse are all emergent. No arm is scripted
to win; the matched-seed triad at seeds 1–5 (10,000 citizens, 200 years) already produces
a non-uniform ordering across outcomes.

**Adaptation.** Citizens accumulate expertise and experience in their roles, express
occupational and housing preferences, and adjust fertility behaviour against permit
availability. **[M2: retraining and voluntary career change.]**

**Objectives.** Citizens do not optimise a global utility; they follow rule-based
behaviour with stochastic variation. Institutions optimise within their arm's rule.

**Learning.** Population-level only: technology and medical level accumulate.
**[M2: institutional learning from detected failures.]**

**Prediction.** None. Allocation uses current measured state.

**Sensing.** Institutions sense *observed* scores, *assessed* need and *demonstrated*
performance — never latent truth. This gap is the model's central mechanism.

**Interaction.** Through competition for finite job slots, housing stock and support
budget; through caregiving and dependence; through elections; through inheritance.

**Stochasticity.** Named, separated RNG streams (`rng.py`). Shared streams
(`population_init`, `shocks`) make baseline populations and external histories identical
across arms; all other processes use arm-specific streams.

**Collectives.** IQ bands (representation), occupational sectors, the assembly.

**Observation.** Tiered logging (`recorder.py`): annual aggregates, five-year
distribution snapshots, all rare/critical events, a reproducible citizen panel, and
optional forensic per-citizen annual state.

---

# 3. Details

## 3.1 Initialisation

100,000 citizens (10,000 in the vertical slice) drawn from the shared `population_init`
stream: gamma age structure, balanced sex, normal capability endowment mapped to an
11-dimensional profile through `g_loading`, beta-distributed adversity, age-consistent
education, age-graded chronic conditions and impairments, occupational and housing
preferences, desired family size. **Derived** state (adaptive functioning, support,
housing, occupation) is *not* initialised: it is computed in year 1 under each arm's
rules, so the three arms start from an identical population and diverge only through
their rules. This is tested
(`test_baseline_populations_are_identical_across_societies`).

## 3.2 Input data

None. The model uses no empirical input files. All parameters are stylised and marked
`not yet calibrated` in `PARAMETER_REGISTER.md`.

## 3.3 Submodels

| Submodel | File | Documented in |
|---|---|---|
| Latent capability, ageing, observation, normalisation, banding, inheritance | `cognition.py` | `COGNITIVE_MODEL.md` |
| Adaptive functioning, needs assessment, support rationing, housing | `models.py` | `SUPPORT_MODEL.md` |
| Occupational requirements, allocation rules, performance | `occupations.py`, `models.py` | `EXPERIMENTAL_DESIGN.md` §3 |
| Morbidity, health-literacy pathway, mortality, life table | `models.py`, `kernel.py` | `HEALTH_AND_MORTALITY_MODEL.md` |
| Population cap, permits, conception, birth, inheritance | `kernel._fertility` | `POPULATION_MODEL.md` |
| Presidency, assembly, corruption, accountability, succession | `government.py` | `GOVERNANCE_MODEL.md` |
| Abuse initiation, welfare checks, detection, intervention | `safeguarding.py` | `SAFEGUARDING_MODEL.md` |
| Shock decoding and absorption | `events.py` | `EXPERIMENTAL_DESIGN.md` §5 |
