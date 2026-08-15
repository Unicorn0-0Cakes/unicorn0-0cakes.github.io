# Governance Model

Code: `engine/cce_engine/government.py`. Identical in all three arms so that government is
not an uncontrolled confounding variable. Implemented as a swappable module so later
studies can compare political systems without touching the kernel.

## 1. Presidency

* The citizen with the **highest valid relative official score** at the most recent
  civilization-wide assessment becomes president.
* Scores are capped at 150; anything above the measurable ceiling is *reported* as 150
  while the latent capability is retained internally and separately (`g_abs`, `latent`).
* **Ties.** When several citizens share the highest official score, only those tied
  citizens vote, and only among themselves. The candidate with the most votes wins.
* **Tie after the vote.** Deterministic and documented: the tied finalist with the lowest
  citizen id wins. Because ids are assigned deterministically from the run seed, this is
  reproducible; the resolution method used is recorded in every
  `presidential_selection` event (`unique_high_score` / `tied_vote` /
  `deterministic_lowest_cid`).
* **Term.** Until the next five-year assessment.
* **Succession.** Death or medically verified severe cognitive decline (dementia)
  triggers a logged succession; the highest valid score among living classified citizens
  fills the vacancy until the next assessment.
* **Eligibility is not competence.** A president's `competence` and `ethics` are drawn
  with configurable correlations to `g` — `leader_competence_iq_link = 0.20`,
  `leader_ethics_iq_link = 0.0` by default. Both are assumptions, both are swept, and H7
  may only be reported jointly with that sweep.

## 2. Representative Assembly

* Bands are **configurable** (`iq_bands`), not hard-coded. Default:
  `<70, 70–79, 80–89, 90–99, 100–109, 110–119, 120–129, 130–139, 140–149, 150`.
* **Every populated band receives at least one seat** (`seats_base = 1`), regardless of
  how few citizens it contains. A small band can never be erased.
* Additional seats (`seats_proportional = 90`) are distributed proportionally by band
  population using largest-remainder.
* Representation is recalculated after each five-year assessment.
* Representatives are elected **within their band** by a documented process: candidate
  visibility is a mix of demonstrated performance, adaptive functioning and chance — not
  of test score.
* The guarantee holds **continuously**, not only on election day: deaths, removals and
  successions trigger by-elections in the affected band. The annual log carries
  `unrepresented_populated_bands`, which the invariant suite asserts is zero
  (`test_every_populated_band_is_represented`).

## 3. Emergent political behaviour

The model permits, and does not script: corruption onset and persistence, institutional
capture, coalition formation **[M2]**, disagreement and legislative gridlock **[M2]**,
poor judgment, altruism, competence and incompetence. Corruption hazard falls with
individual ethics; audits detect active corruption at `audit_effectiveness` per year.

`gov_quality` = f(mean competence, mean ethics, share corrupt) and feeds preparedness,
safeguarding effectiveness and (M2) budget allocation. Nothing in the model makes a
higher-scoring government automatically benevolent or effective.

## 4. Law and accountability

All citizens are subject to investigation and legal accountability regardless of score,
office, wealth, occupation, support status or social rank. **No band receives immunity.**
A president found corrupt is removed and charged exactly as a representative is
(`presidential_removal`, reason `legal_accountability`); this is asserted by
`test_government_officials_are_accountable`.

The legal model distinguishes — in specification now, in code at **[M2]** — whether an act
occurred, responsibility, intent, capacity, vulnerability, coercion, appropriate
safeguards, sentencing or rehabilitation, and public protection. Score alone never
determines guilt or innocence, and capacity findings affect *process and safeguards*, not
liability for the act.

Harm categories are modelled abstractly at research level, with counts and durations
only — no graphic content: assault, neglect, exploitation, fraud, corruption, coercive
control, trafficking, unlawful confinement, institutional abuse, abuse of dependent
persons, organised criminal activity. Milestone 0 implements corruption, exploitation and
the severe-abuse composite (`SAFEGUARDING_MODEL.md`); the remainder is **[M2]**.

## 5. Logged government outputs

`presidential_selection` (with tie method, score, cid) · `presidential_succession` ·
`presidential_removal` · `assembly_elected` (populated bands, bands with seats, total
seats) · `by_election` · `succession` · `corruption_begins` · `corruption_detected`
(with duration) · annual `gov_quality`, `corrupt_officials`, `offences`,
`populated_bands`, `bands_represented`, `unrepresented_populated_bands`,
`orphan_seat_bands`.

## 6. Limitations

* No explicit legislation objects, party structure, coalitions or voting on policy yet;
  governance acts on outcomes through a single quality index. **[M2]**
* Elections use a visibility heuristic rather than campaigns or platforms.
* Corruption is individual; organised capture across officials is **[M2]**.
