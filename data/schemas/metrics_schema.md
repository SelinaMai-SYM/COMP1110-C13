# Metrics Schema

The notebook and helper modules use a standard metric record so scenario outputs can be compared consistently even before a full simulator is connected.

## Standard Fields

| Field | Type | Meaning | Notes |
| --- | --- | --- | --- |
| `scenario_name` | string | Unique scenario identifier | Usually `pair_xx_name_A` or `pair_xx_name_B` |
| `average_wait_time` | number | Mean waiting time in minutes | `seating_time - arrival_time` |
| `max_wait_time` | number | Maximum waiting time in minutes | Scenario-level maximum |
| `p90_wait_time` | number | 90th percentile waiting time in minutes | Robust tail metric |
| `max_queue_length` | integer | Largest observed queue length | May require simulator |
| `groups_served` | integer | Number of groups seated and completed service | May require simulator |
| `groups_abandoned` | integer | Number of groups leaving before seating | Depends on abandonment logic |
| `service_level_within_15_min` | number | Share of groups seated within 15 minutes | Ratio from `0` to `1` |
| `service_level_within_30_min` | number | Share of groups seated within 30 minutes | Ratio from `0` to `1` |
| `table_utilization_overall` | number | Aggregate table occupancy ratio | Ratio from `0` to `1` |
| `reservation_fulfillment_rate` | number | Share of reservation groups successfully honored | Ratio from `0` to `1` |
| `average_reservation_delay` | number | Average delay relative to scheduled reservation time in minutes | Reservation-only metric |
| `average_table_fit_efficiency` | number | Average `group_size / assigned_table_capacity` | Ratio from `0` to `1` |
| `notes` | string | Explanation of source, assumptions, or caveats | Required for placeholders |

## Placeholder Convention

- If a full simulator is not available yet, the schema still serves as the agreed target format for later output files.
- Any illustrative or manual example values should still use the standard column names.
- The `notes` field should state clearly when a row is illustrative rather than simulation-generated.

## Comparison Principle

Paired scenario analysis should compare exactly the same fields for both versions. This ensures the report can discuss operational trade-offs without changing the metric definitions across experiments.
