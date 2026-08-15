# Data Dictionary

Column-level documentation for every stored table. Completeness is enforced by
`analysis/check_data_dictionary.py`, which fails if the engine emits a column that is not
documented here.

## 1. `annual` — one row per simulated year

### Population
| Column | Type | Units | Meaning |
|---|---|---|---|
| `year` | int | years | Simulated year, 0-based |
| `population` | int | citizens | Living citizens at year end; ≤ `population_cap` by construction |
| `births` | int | citizens | Live births this year |
| `deaths` | int | citizens | Deaths this year |
| `births_denied` | int | citizens | Willing citizens refused a birth permit this year (waitlisted, not deleted) |
| `mean_age` | float | years | Mean age of the living |
| `collapsed` | int (0/1) | flag | Population fell below 10% of the cap |

### Health and longevity
| Column | Type | Units | Meaning |
|---|---|---|---|
| `life_expectancy` | float | years | Period life expectancy at birth (Sullivan life table) |
| `healthy_life_expectancy` | float | years | Sullivan HALE, weighted by health index ≥ `healthy_threshold` |
| `independent_life_expectancy` | float | years | Sullivan, weighted by adaptive ≥ threshold **and** support level ≤ 2 |
| `preventable_deaths` | int | citizens | Deaths before 75 with unmet need or severe mismatch present |
| `mean_health` | float | index 0–1 | Mean health index |
| `med_level` | float | proportion | Accumulated medical progress (hazard reduction) |

### Cognition
| Column | Type | Units | Meaning |
|---|---|---|---|
| `abs_capability_mean` | float | Year-0 points | Mean **absolute** capability of adults; never renormalised |
| `abs_capability_sd` | float | Year-0 points | SD of absolute capability |
| `iq_mean` | float | IQ points | Mean **relative** civic IQ of classified citizens (≈100 by construction) |
| `iq_sd` | float | IQ points | SD of relative civic IQ (≈15 by construction) |
| `iq_ceiling_frac` | float | proportion | Share of classified citizens at the 150 reporting ceiling |

### Function and support
| Column | Type | Units | Meaning |
|---|---|---|---|
| `mean_adaptive` | float | index 0–1 | Mean adaptive functioning |
| `frac_independent` | float | proportion | Share living independently (adaptive ≥ threshold and support ≤ 2) |
| `mean_support_level` | float | level 0–8 | Mean assigned support level |
| `unmet_need_rate` | float | proportion | Share with assessed need above assigned support |
| `over_support_rate` | float | proportion | Share with any accumulated over-support |
| `support_high_iq_frac` | float | proportion | Share of citizens with IQ ≥ 120 receiving any support — invariant monitor |
| `independent_low_iq_frac` | float | proportion | Share of citizens with IQ < 85 living with no support — invariant monitor |
| `mean_housing_restrictiveness` | float | type index 0–8 | Mean housing type index |

### Work and economy
| Column | Type | Units | Meaning |
|---|---|---|---|
| `employment_rate` | float | proportion | Share of adults holding a role |
| `mean_performance` | float | index | Mean job performance of the employed |
| `mean_mismatch` | float | SD units | Mean occupational mismatch (capability shortfall + unused capability) |
| `mismatch_rate` | float | proportion | Share of workers with mismatch > 1.0 |
| `output` | float | index | Total output after shock loss and accessibility cost |
| `output_per_capita` | float | index | `output / population` |
| `innovations` | int | count | Innovations generated this year |
| `tech_level` | float | index | Cumulative technology multiplier |
| `performance_gini` | float | 0–1 | Gini coefficient of performance among the employed |

### Government
| Column | Type | Units | Meaning |
|---|---|---|---|
| `gov_quality` | float | 0–1 | Composite of official competence, ethics and corruption share |
| `president_iq` | float | IQ points | Sitting president's official score. NaN only if no president is seated at year end; a NaN here otherwise indicates a broken office-identity check |
| `president_cid` | int | citizen id | Sitting president's citizen id, or −1 if the office is vacant. Officials are identified by `cid`, never by slot index, because slots are recycled after death |
| `assembly_seats` | int | seats | Total filled seats |
| `populated_bands` | int | bands | Bands with ≥1 classified living citizen |
| `bands_represented` | int | bands | Populated bands holding ≥1 seat |
| `unrepresented_populated_bands` | int | bands | **Invariant: must be 0** |
| `orphan_seat_bands` | int | bands | Seats held for bands that have become empty |
| `corrupt_officials` | int | officials | Officials in an active corruption episode |
| `offences` | int | count | Cumulative recorded offences among the living |

### Safeguarding
| Column | Type | Units | Meaning |
|---|---|---|---|
| `abuse_initiated` | int | cases | New severe-abuse situations |
| `abuse_detected` | int | cases | Situations detected this year |
| `abuse_forced_detected` | int | cases | Detected by the hard duration cap rather than by a check |
| `abuse_active_end` | int | cases | Active undetected situations at year end |
| `abuse_intervening` | int | cases | Situations under intervention |
| `abuse_resolved` | int | cases | Situations resolved |
| `mean_detection_delay_years` | float | years | Mean delay from initiation to detection |
| `max_detection_delay_years` | float | years | **Invariant: ≤ `max_undetected_duration`** |
| `welfare_checks` | int | checks | Checks conducted |
| `false_positive_findings` | int | findings | Incorrect safeguarding findings |
| `inspectors_compromised` | int | cases | Cases where a compromised inspector reduced detection |

### Environment
| Column | Type | Units | Meaning |
|---|---|---|---|
| `shock_events` | int | events | Events active this year (identical across arms at the same seed) |
| `mortality_burden` | float | proportion | Absorbed shock contribution to mortality |
| `output_loss` | float | proportion | Absorbed shock contribution to output loss, incl. climate drift |

## 2. `assessments` — one row per assessment cycle

`year` · `n_assessed` (adults assessed) · `children_assessed` (developmental only, never
civic) · `normalization_method` · and the relative-IQ diagnostics `mean`, `sd`, `median`,
`mad` (robust median absolute deviation), `trimmed_mean_5pct`, `iqr`, `skew`,
`ceiling_frac`, `floor_frac` · and the absolute-scale statistics `abs_mean`, `abs_sd`,
`abs_median`.

The relative statistics describe civic IQ after normalisation; the `abs_*` statistics
describe absolute capability on the fixed Year-0 scale. Reporting both is what allows a
reader to distinguish "the population changed" from "the scale was re-centred".

## 3. `snapshots` — distribution percentiles per cycle

`year · iq_p1 … iq_p99 · abs_p1 … abs_p99` (percentiles 1, 5, 25, 50, 75, 95, 99).

## 4. `events` — rare and critical events

Common fields: `year` · `type` · `category`, plus type-specific fields.

| Field | Appears in | Meaning |
|---|---|---|
| `severity` | environment events | Shock severity 0–1; identical across arms at the same seed |
| `count` | `birth_postponed`, `maternal_death`, `safeguarding_detection` | Number of affected citizens |
| `cid` | government, cognition events | Citizen id |
| `role` | government events | `president` or `representative` |
| `band` | `by_election` | Band the seat belongs to |
| `reason` | `succession`, `by_election`, `presidential_removal` | `death`, `medically_verified_decline`, `vacant_seat`, `vacancy`, `legal_accountability` |
| `duration` | `corruption_detected` | Years the episode lasted before detection |
| `method` | `presidential_selection` | `unique_high_score`, `tied_vote`, `deterministic_lowest_cid` |
| `top_score` | `presidential_selection` | Highest official score at that assessment |
| `n_tied` | `presidential_selection` | Citizens tied at the top score |
| `votes` | `presidential_selection` | Vote counts among the tied candidates only |
| `president_cid`, `president_iq` | `presidential_selection`, `presidential_succession` | Winner and their official score |
| `populated_bands`, `bands_with_seats`, `seats` | `assembly_elected` | Representation audit at election time |
| `from_band`, `to_band`, `from_iq`, `to_iq` | `classification_change` | Official reclassification at an assessment |
| `mean_delay`, `max_delay` | `safeguarding_detection` | Detection delay in years |

Categories: `environment` (11 shock types), `government` (`presidential_selection`,
`presidential_succession`, `presidential_removal`, `assembly_elected`, `by_election`,
`succession`, `corruption_begins`, `corruption_detected`), `safeguarding`
(`safeguarding_detection`), `cognition` (`classification_change`), `population`
(`birth_postponed`), `health` (`maternal_death`).

## 5. `panel` — one row per panel citizen per year

`year · cid · age · official_iq · official_se · abs_capability · band · health · adaptive ·
need_level · support_level · housing · occupation · performance · mismatch · abuse_state`

`official_se` is the standard error of the official score; any band-based analysis must
use it rather than treating band edges as sharp.

## 6. `deaths`

`year · cid · age · health · support_level · unmet · healthy_years · independent_years`
(panel citizens under standard logging; all deaths under forensic logging).

## 7. Batch summary tables

Written by `cce batch` into `<batch>/summaries/` (see `BATCH_EXECUTION.md`).

**`run_summary.csv`** — one row per completed run: `experiment_id · society ·
run_number · seed · status · years · population · tag · wall_seconds ·
worker_pid · model_version · git_commit · parameter_set_id · python_version ·
numpy_version · platform · machine · started_utc · completed_utc`, plus the
run-level outcomes: `healthy_life_expectancy`, `independent_life_expectancy`,
`life_expectancy` (each averaged over the final 100 years, or the whole run if
shorter), `mean_mismatch`, `final_population`, `output_per_capita`,
`unmet_need_rate`, `collapse_rate`, `max_abuse_detection_delay`,
`shock_events_total`, `mortality_burden_total`, `preventable_deaths_total`,
`population_peak`, `final_window`.

**`arm_summary.csv`** — per society × outcome: `n · mean · median · sd · iqr ·
min · max · p2_5 · p97_5 · mcse · ci95_low · ci95_high`. `sd` here is the
between-seed standard deviation.

**`paired_contrasts.csv`** — the treatment estimates, per outcome × contrast
(`B_minus_A`, `C_minus_A`, `C_minus_B`): `n_matched_seeds ·
n_seeds_excluded_incomplete · sesoi · mean_diff · median_diff · sd_diff ·
mcse_diff · ci95_low · ci95_high · min_diff · max_diff · p_diff_gt_0 ·
p_diff_gt_sesoi · p_diff_lt_neg_sesoi · precise_but_below_sesoi`.
`precise_but_below_sesoi` is 1 when the interval excludes zero *and* the estimate
is smaller than the SESOI — statistically unambiguous, scientifically trivial.

**`seed_paired_summary.csv`** — one row per seed: `seed · has_A · has_B · has_C`,
and `{outcome}__{contrast}` columns holding that seed's paired difference (blank
where the pair is incomplete).

**`shock_response.csv`** — `society · driver · outcome · n · pearson_r ·
driver_sd · outcome_sd`, correlating each outcome with that run's exposure to
external shocks.

**`failures.csv`** — `experiment_id · society · seed · status · stage ·
error_type · error · elapsed_seconds · traceback`.

**`runtime_summary.csv`** — `scope · n · mean_s · median_s · min_s · max_s ·
total_s`, per arm and overall.

## 8. `manifest.json`

Provenance and retention: `experiment_id · society · run_number · seed · model_version ·
git_commit · parameter_set_id · years · capacity · logging_level · run_tag · status ·
normalization_method · fertility_policy · births_denied_total · files{path, rows, bytes,
sha256} · retention{...} · written_utc`.
