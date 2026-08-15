# Data dictionary

Every field in every export. SI units throughout, stated explicitly. `hidden`
means the column is empty until the ground-truth reveal.

---

## `droplets.csv`

| column | unit | hidden | definition |
|---|---|---|---|
| `experiment_id` | — | | experiment identifier |
| `seed` | — | | PRNG seed string |
| `mode` | — | | session mode |
| `droplet_id` | — | | `D-nnnn` |
| `t_birth_s` | s | | simulated time of entry |
| `true_radius_m` | m | **yes** | generated radius |
| `true_n` | — | **yes** | signed integer charge count |
| `true_charge_C` | C | **yes** | `n × e` |
| `true_mass_kg` | kg | **yes** | `ρ_oil (4/3)πr³` |
| `oil_density_kg_m3` | kg m⁻³ | | assumed oil density |
| `depth_m` | m | | optical depth in chamber |
| `focus_quality` | — | | 0–1 at the user's focal setting |
| `charge_events` | — | | count of ionisation events |
| `status` | — | | candidate / tracked / lost / retired |
| `notes` | — | | user text |

## `raw_observations.csv`

One row per observation. Sample series exported separately as
`samples/<obs_id>.csv` with columns `t_s`, `y_m`.

| column | unit | definition |
|---|---|---|
| `obs_id`, `droplet_id`, `experiment_id` | — | identifiers |
| `kind` | — | `field-off` or `field-on` |
| `t_start_s`, `t_end_s` | s | simulated times |
| `n_samples` | — | tracked points |
| `v_display_V` | V | voltage **as displayed**, not true |
| `polarity` | — | +1 or −1 |
| `field_on` | — | boolean |
| `temp_read_K` | K | sensor reading, includes bias |
| `press_read_Pa` | Pa | sensor reading, includes bias |
| `focus_set_m` | m | focal plane setting |
| `calibration_version`, `protocol_version` | — | records in force |
| `flags` | — | semicolon-separated quality flags |

## `derived_measurements.csv`

| column | unit | hidden | definition |
|---|---|---|---|
| `meas_id`, `droplet_id`, `fall_obs_id`, `field_obs_id` | — | | identifiers |
| `method`, `method_version`, `slip_model` | — | | analysis method that produced this row |
| `fall_distance_m`, `fall_time_s` | m, s | | span of the field-off track |
| `v_fall_m_s`, `se_v_fall_m_s` | m s⁻¹ | | fitted fall speed and its standard error |
| `rise_distance_m`, `rise_time_s` | m, s | | span of the field-on track |
| `v_field_m_s`, `se_v_field_m_s` | m s⁻¹ | | fitted field-on velocity, upward-positive |
| `balancing_voltage_V` | V | | present only for balance measurements |
| `plate_spacing_m` | m | | calibrated value used |
| `field_V_m` | V m⁻¹ | | `V_true_assumed / d` |
| `temperature_K`, `pressure_Pa` | K, Pa | | values used in the inversion |
| `viscosity_Pa_s` | Pa s | | `η(T)` |
| `air_density_kg_m3` | kg m⁻³ | | |
| `mean_free_path_m` | m | | |
| `slip_correction` | — | | `C_c` at the solved radius |
| `knudsen` | — | | `λ/r` |
| `est_radius_m`, `u_radius_m` | m | | estimate and 1σ |
| `est_charge_C`, `u_charge_C` | C | | estimate and 1σ |
| `true_radius_m`, `true_charge_C`, `true_n` | m, C, — | **yes** | for post-reveal comparison |
| `solver_iterations`, `solver_residual`, `solver_converged` | — | | radius inversion diagnostics |
| `focus_quality`, `brownian_rms_m`, `path_continuity`, `r_squared` | — | | quality indicators |
| `duration_s`, `n_samples` | s, — | | |
| `status` | — | | accepted / accepted_caution / rejected / unresolved / candidate |
| `rejection_reason` | — | | required when status is rejected |
| `followed_prereg_rule` | — | | whether the decision agreed with the rule |
| `decision_at`, `estimate_viewed_before_decision` | — | | for exclusion-order analysis |
| `notes` | — | | |

## `exclusions.csv`

Every non-accepted measurement, with `meas_id`, `status`, `rejection_reason`,
`decision_at`, `protocol_version`, `followed_prereg_rule`,
`estimate_viewed_before_decision`, `notes`, and — after reveal —
`was_actually_sound` (whether the underlying observation was in fact
uncompromised).

## `analysis.json`

The full analysis object from `DATA_MODEL.md`, including `locked`,
`outcome_aware`, the candidate-lattice curve, the assignments, the residuals,
the bootstrap distribution and the leave-one-out series.

## `manifest.json`

`experiment_id`, `seed`, `model_version`, `software_version`, `git_commit`,
`mode`, `apparatus_profile`, `physics` settings, `synthetic_charge_model`,
`created_at`, `locked_at`, `revealed`, `parameter_set`, `stream_design`,
`file_inventory`, and the standing disclaimer that simulated data are not
experimental evidence.

`checksums.json` is specified but **not implemented** (`LIMITATIONS.md` L-15).
