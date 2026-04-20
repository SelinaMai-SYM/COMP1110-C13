# Restaurant Queue Data Layer

This `data/` directory provides a structured, reproducible input framework for the COMP1110 Restaurant Queue Simulation project. The design separates restaurant configuration, customer arrival demand, and operating policy so that paired scenario analysis can mix and match shared presets while still making each guided comparison reproducible.

## Why The Data Is Split This Way

- `restaurant_configs/` stores fixed physical and structural settings such as table inventory, queue layout, reservation holding, and reset defaults.
- `arrival_scenarios/` stores exact customer-group demand streams, including walk-ins, reservations, late arrivals, no-shows, and abandonment tolerances.
- `policies/` stores reusable policy components so seating logic and service capacity can be combined consistently across case studies.
- `case_studies/` stores lightweight A/B manifests that reference the shared preset library rather than copying whole configs into each pair folder.
- `sample_outputs/` stores example metric tables using the same schema the notebook expects.

This separation matches the project assumptions closely:

- Customer groups are indivisible and carry fixed attributes.
- Queue rules are structural and therefore belong with the restaurant configuration.
- Reservation holding is treated as a restaurant-level decision because it changes table availability directly.
- Seating strategy and cleaning/service throughput are treated as policies because they describe how the same restaurant operates under a chosen rule set.

## Folder Guide

### `schemas/`

Reference documents describing the expected fields, types, and logical constraints for:

- restaurant configs
- arrival CSVs
- policy files
- metric outputs

### `restaurant_configs/`

Reusable preset JSON files split into two families:

- eight real restaurant layouts such as a near-takeaway bubble tea shop, dessert cafe, burger hall, ramen bar, family trattoria, Korean BBQ house, dim sum hall, and fine dining tasting room
- four abstract queue templates for a single line, balanced size-based queues, coarse bands, and fine-grained bands

Every file keeps `preset_id` and `preset_family` so case-study manifests and the builder can reference it reliably. The old `preset_order` field has been removed; presets are now sorted stably in code instead of by hand-authored numeric metadata.

### `arrival_scenarios/`

The project now keeps a tighter core library of five reusable demand files:

- `lunch_rush_base.csv` for dense midday service with office groups, solos, and a few reservations
- `dinner_peak_base.csv` for a compressed evening rush with mixed party sizes and some booked tables
- `large_party_heavy_base.csv` for family-heavy and banquet-style demand
- `reservation_mixed_base.csv` for late arrivals, no-shows, and reservation-heavy flow
- `stress_peak_base.csv` for compact high-pressure bursts with lower abandonment tolerance

Instead of adding many extra CSVs, each of these base files now carries more customer rows and a richer internal mix of demand patterns.

### `policies/`

Reusable policy library split into:

- seating policies such as FCFS, best-fit, and reservation-priority
- service policies such as default, low cleaning capacity, and high cleaning capacity
- reservation-control reference files documenting whether reservations are enabled

### `case_studies/`

Seven paired scenario folders. Each folder now contains:

- a short analytical README
- one `case_study.json` manifest

Each manifest points to existing restaurant layouts, queue presets, policies, and arrival scenarios. The loader resolves those references into the exact `config_json`, `policy_json`, and `arrivals_csv` payloads that the API, web app, and notebooks use.

### `sample_outputs/`

Example metric CSV files following the standard output schema. They now mirror simulator-generated snapshots from the current official scenario set, while `code/outputs/` stores the full regenerated batch.

## How The Paired Scenarios Are Designed

Each pair still highlights one main factor while drawing from a wider mix of venue types:

1. Dining-room footprint
2. Single queue vs multiple size-based queues
3. Coarse vs fine queue buckets
4. No reservation hold vs reservation hold
5. Low vs high cleaning capacity
6. No abandonment vs abandonment enabled
7. FCFS vs best-fit seating

This structure supports careful report writing because the team can state clearly what changed, what stayed fixed, and which metrics should be interpreted as evidence of the trade-off.

## Notes On Realism

- Small-footprint venues are no longer modeled as implausibly tiny dining rooms. The bubble-tea, ramen, dessert, and fine-dining presets now have materially more tables than before, while still staying smaller than the major dining halls.
- Larger formats such as the dim sum hall, family trattoria, burger hall, and Korean BBQ house now sit in a realistic high-capacity range, with table inventories broad enough to create meaningful seat-mix trade-offs.
- Queue-template presets are intentionally abstract. They are used to swap waitlist logic in case studies and the builder, not to represent real restaurants.

## How The Notebook Reads The Data

The notebooks in `notebook/` work from the shared preset library and case-study manifests:

1. They read the available `restaurant_configs`, `policies`, and `arrival_scenarios`.
2. They load each pair's `case_study.json` manifest.
3. They resolve a chosen A/B version into exact `config_json`, `policy_json`, and `arrivals_csv` inputs through the Python loader.
4. They preview the preset library and case-study references directly in notebook tables.
5. They visualise arrivals, table capacities, queue definitions, metrics, and A/B deltas using the same resolved inputs as the API and web dashboard.

By default, notebooks read the repository-local `data/` directory. If `SIM_DATA_ROOT` is set, the notebooks and API both resolve that environment variable before falling back to the repository default, which keeps interactive analysis aligned with deployed or alternate data roots.

## Reproducibility And Evaluation Support

This data framework supports reproducible comparison in four ways:

- The same arrival file can be reused when only one factor is changed.
- Pair manifests record exactly which presets each scenario version references, so readers can trace every assumption without duplicated files drifting out of sync.
- Metric outputs already have a shared schema, so later simulation outputs can remain consistent.
- The notebooks and web dashboard now resolve the same manifest definitions, so there is one source of truth for guided scenarios.

In short, the directory is designed to make scenario analysis transparent, defensible, and easy to extend for the final report.
