# Restaurant Configuration Schema

This schema defines the fixed restaurant-level settings for one simulation run. It is designed to support both event-based and step-based simulation engines while keeping table layout, queue design, and reservation holding behaviour explicit and reproducible.

## Required Top-Level Fields

| Field | Type | Description | Constraints |
| --- | --- | --- | --- |
| `restaurant_name` | string | Human-readable scenario label for the restaurant layout | Non-empty |
| `simulation_start` | string | Opening time for the scenario window | `HH:MM` |
| `simulation_end` | string | Closing time for the scenario window | `HH:MM`, later than `simulation_start` |
| `queue_mode` | string | Queue design mode | `single` or `size_based` |
| `queue_definitions` | array | Queue ranges used by the restaurant | At least one queue |
| `tables` | array | Exact physical tables available in the restaurant | At least one table |
| `table_sharing_allowed` | boolean | Whether multiple groups may share a table | Must remain `false` |
| `table_combining_allowed` | boolean | Whether tables may be merged | Must remain `false` |
| `reservation_hold_policy` | object | Hold settings for reservations | See below |
| `default_reset_policy` | object | Default cleaning/reset behaviour | See below |
| `optional_operational_defaults` | object | Optional fixed defaults shared across runs | Optional |

## `queue_definitions`

Each queue definition is an object:

| Field | Type | Description | Constraints |
| --- | --- | --- | --- |
| `queue_id` | string | Queue identifier | Unique within file |
| `min_size` | integer | Minimum group size allowed in queue | `>= 1` |
| `max_size` | integer | Maximum group size allowed in queue | `>= min_size` |

Rules:
- In `single` mode, define exactly one queue covering the full supported range.
- In `size_based` mode, queue ranges must be non-overlapping.
- A group must match exactly one valid queue.

## `tables`

Each table object contains:

| Field | Type | Description | Constraints |
| --- | --- | --- | --- |
| `table_id` | string | Unique table identifier | Unique within file |
| `capacity` | integer | Maximum party size seated at this table | `>= 1` |
| `zone` | string | Optional operating zone or dining area label | Non-empty recommended |

Rules:
- One table serves one group at a time.
- No table sharing.
- No table combining.
- Group size must not exceed table capacity.

## `reservation_hold_policy`

| Field | Type | Description | Constraints |
| --- | --- | --- | --- |
| `enabled` | boolean | Whether reserved tables may be held temporarily | `true` or `false` |
| `hold_minutes` | integer | Maximum hold duration beyond scheduled time | `>= 0` |

## `default_reset_policy`

| Field | Type | Description | Constraints |
| --- | --- | --- | --- |
| `enabled` | boolean | Whether reset time is modeled | `true` or `false` |
| `default_reset_minutes` | integer | Default reset duration if no table-specific value overrides it | `>= 0` |

## Design Notes

- Queue design lives in the restaurant config because single-queue versus size-based queueing is a structural restaurant choice in this coursework.
- Reservation holding is also stored here because Pair 4 changes that factor while keeping seating/service policies fixed.
- Times remain in human-readable `HH:MM` form in JSON and are converted to minutes internally by the loader.
