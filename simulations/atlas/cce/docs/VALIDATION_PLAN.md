# Verification and Validation Plan

## 1. Invariant suite — implemented and passing

`python3 engine/tests/test_invariants.py` → **18/18 passing** at model version
0.1.0-milestone0.

| # | Invariant | Test |
|---|---|---|
| 1 | Population never exceeds the cap | `test_population_never_exceeds_cap` |
| 2 | No citizen has a negative age; dead citizens do not act | `test_no_negative_age_and_dead_do_not_act` |
| 3 | Births and deaths are logged and reconcile year to year | `test_births_and_deaths_are_logged` |
| 4 | Official IQ never exceeds 150 | `test_official_iq_never_exceeds_ceiling` |
| 5 | Civilization-wide testing occurs exactly every 5 years | `test_assessment_cadence_and_no_elective_retest` |
| 6 | No elective retesting (sittings ≤ cycles elapsed) | same |
| 7 | Every populated band receives representation, continuously | `test_every_populated_band_is_represented` |
| 8 | Presidential tie resolution is deterministic and labelled | `test_presidential_tie_resolution_is_deterministic` |
| 9 | Identical seeds reproduce identical results | `test_identical_seeds_reproduce_identical_results` |
| 10 | Different seeds produce different results | `test_different_seeds_differ` |
| 11 | Matched A/B/C seeds produce identical external shocks | `test_matched_seeds_produce_identical_external_shocks` |
| 12 | Matched A/B/C seeds produce identical baseline populations | `test_baseline_populations_are_identical_across_societies` |
| 13 | Support is not restricted to low-IQ citizens; high-IQ citizens receive assistance; low-IQ citizens live independently | `test_support_is_not_restricted_by_iq` (all three arms) |
| 14 | Government officials, including presidents, are legally accountable | `test_government_officials_are_accountable` |
| 15 | Severe hidden abuse cannot persist beyond the safeguard interval | `test_hidden_abuse_cannot_persist_beyond_safeguard_interval` (all three arms) |
| 16 | Checkpoint restoration reproduces the future trajectory exactly | `test_checkpoint_restore_reproduces_trajectory` |
| 17 | Reports/manifest match stored data; exported totals reconcile; checksums present | `test_manifest_and_exports_reconcile` |
| 18 | Normalisation respects ceiling/floor; bands are well-formed | `test_normalisation_ceiling_and_bands`, `test_shock_block_size_is_state_independent` |

Emergency testing occurs only after a valid trigger — **specified, test pending**
(the emergency-assessment event object is Milestone 2).

## 2. Test types and status

| Type | Status |
|---|---|
| Unit tests (submodel maths) | partial — via invariants; dedicated unit tests **[M1]** |
| Integration tests (full run, all arms) | done |
| Property-based tests (random parameter draws preserve invariants) | **[M1]** — hypothesis over the registered ranges |
| Statistical validation tests (pattern-level, §3) | **[M1]** |
| Regression tests (golden digests per model version) | harness present (`recorder.result_digest`), golden files **[M1]** |
| Determinism tests | done |
| Performance benchmarks | done (`cce_engine.benchmark`) |

## 3. Pattern-oriented validation targets **[M1/M4]**

The model is not calibrated to data. Validation is therefore *pattern-oriented*: the model
must reproduce qualitative regularities that any plausible demographic model should show,
and failures are diagnostic, not confirmatory.

1. Age structure is stable under a binding cap with births ≈ deaths.
2. Mortality rises approximately log-linearly with adult age.
3. Life expectancy responds monotonically to medical progress and to shock frequency.
4. Relative IQ has mean ≈100 and SD ≈15 by construction after each normalisation, while
   absolute capability is free to drift — verified by checking the two series diverge
   when education or adversity parameters are changed.
5. Ceiling effects appear as the ceiling is lowered.
6. Occupational mismatch falls as measurement reliability rises, in all arms.
7. Removing scaffolding widens the capability–mortality gradient.
8. Weakening safeguarding lengthens detection delay approximately as
   `1/checks_per_year`.

Each target has a tolerance band; a failure blocks the code freeze.

## 4. Cross-implementation validation **[M3, optional]**

If a compiled kernel is later added, the Python reference kernel becomes the oracle: both
must produce identical digests for a fixed seed set, or the difference must be explained
and documented before the compiled kernel is used for production.

## 5. Continuous checks

* Every run writes SHA-256 checksums for every output file plus a manifest checksum.
* `verify` command recomputes checksums and re-derives reported aggregates from stored
  data before a report is accepted.
* Model version, git commit and parameter fingerprint are stamped in every manifest;
  analysis refuses to pool runs with different model versions.
