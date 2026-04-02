# Restaurant Queue Data Layer

This `data/` directory provides a structured, reproducible input framework for the COMP1110 Restaurant Queue Simulation project. The design separates restaurant configuration, customer arrival demand, and operating policy so that paired scenario analysis can change one factor at a time while keeping all other assumptions fixed.

## Why The Data Is Split This Way

- `restaurant_configs/` stores fixed physical and structural settings such as table inventory, queue layout, reservation holding, and reset defaults.
- `arrival_scenarios/` stores exact customer-group demand streams, including walk-ins, reservations, late arrivals, no-shows, and abandonment tolerances.
- `policies/` stores reusable policy components so seating logic and service capacity can be combined consistently across case studies.
- `case_studies/` stores exact A/B experiment packages so each paired comparison remains self-contained and reproducible.
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

Reusable restaurant layouts and queue structures, including:

- balanced base layout
- small-table-heavy and large-table-heavy layouts
- single-queue and multi-queue variants
- coarse and fine queue bucket variants

### `arrival_scenarios/`

Reusable demand files for several operating contexts:

- lunch rush
- dinner peak
- large-party-heavy dinner
- mixed reservation and walk-in dinner
- stress-test peak demand

### `policies/`

Reusable policy library split into:

- seating policies such as FCFS, best-fit, and reservation-priority
- service policies such as default, low cleaning capacity, and high cleaning capacity
- reservation-control reference files documenting whether reservations are enabled

### `case_studies/`

Six paired scenario folders. Each folder contains:

- a short analytical README
- `config_A.json` and `config_B.json`
- one exact `arrivals.csv`
- `policy_A.json` and `policy_B.json`

The pair directories are the main inputs used by the notebook because they make each comparison explicit and submission-ready.

### `sample_outputs/`

Example metric CSV files following the standard output schema. At the current stage they serve as output-format references for later implementation work.

## How The Paired Scenarios Are Designed

Each pair changes exactly one factor and holds the rest constant:

1. Table mix
2. Single queue vs multiple size-based queues
3. Coarse vs fine queue buckets
4. No reservation hold vs reservation hold
5. Low vs high cleaning capacity
6. No abandonment vs abandonment enabled

This structure supports careful report writing because the team can state clearly what changed, what stayed fixed, and which metrics should be interpreted as evidence of the trade-off.

## How The Notebook Reads The Data

The notebook in `notebooks/scenario_explorer.ipynb` works from a case-study pair and version:

1. It loads the exact `config_A.json` or `config_B.json`.
2. It loads the shared `arrivals.csv`.
3. It loads the matching resolved `policy_A.json` or `policy_B.json`.
4. It previews the input files directly in notebook tables.
5. It visualises arrivals, table capacities, queue definitions, and A/B structural differences.
6. It points readers to the metrics schema and sample outputs that later implementation work should follow.

## Reproducibility And Evaluation Support

This data framework supports reproducible comparison in four ways:

- The same arrival file can be reused when only one factor is changed.
- Exact A/B inputs are stored inside each pair folder, so a reader can inspect the full scenario without following cross-file references manually.
- Metric outputs already have a shared schema, so later simulation outputs can remain consistent.
- The notebook is now a transparent front end for browsing the data design before the full implementation is added.

In short, the directory is designed to make scenario analysis transparent, defensible, and easy to extend for the final report.
