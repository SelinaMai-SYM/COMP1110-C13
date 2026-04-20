# Policy Schema

This data layer separates seating behaviour from service constraints. Reusable policy components live in `data/policies/`, while each `data/case_studies/*/case_study.json` manifest references those shared components. At load time, the simulator resolves the manifest into one combined policy bundle containing both the seating and service sections used by the chosen A/B version.

## Seating Policy Section

The seating section determines how the queue is interpreted and how a table is selected when more than one group could be seated.

| Field | Type | Description | Constraints |
| --- | --- | --- | --- |
| `policy_name` | string | Human-readable seating policy name | Non-empty |
| `queue_rule` | string | FCFS interpretation rule within queues | Non-empty |
| `selection_rule` | string | Table/group selection logic | Non-empty |
| `reservation_priority` | boolean | Whether reservation groups may outrank walk-ins | `true` or `false` |
| `best_fit` | boolean | Whether the policy explicitly prefers the smallest suitable table | `true` or `false` |
| `late_reservation_behavior` | string | Behaviour once grace is exceeded | Non-empty |
| `no_show_handling` | object | Operational handling for no-show reservations | JSON object |

Typical values:
- `queue_rule`: `fcfs_within_queue`
- `selection_rule`: `earliest_suitable`, `best_fit`
- `late_reservation_behavior`: `downgrade_to_walkin_after_grace`, `lose_priority_after_grace`

## Service Policy Section

The service section captures cleaning/reset capacity and coarse operational load assumptions.

| Field | Type | Description | Constraints |
| --- | --- | --- | --- |
| `policy_name` | string | Human-readable service policy name | Non-empty |
| `reset_enabled` | boolean | Whether table reset is modeled | `true` or `false` |
| `reset_time_by_capacity` | object | Reset time lookup keyed by table capacity | Positive capacities only |
| `max_seating_actions_per_event_time` | integer | Maximum seating actions processed at one event time | `>= 1` |
| `max_cleaning_actions_per_event_time` | integer | Maximum reset actions processed at one event time | `>= 1` |
| `kitchen_load_mode` | string | Lightweight service-load approximation | Non-empty |
| `dining_duration_multiplier_under_load` | number | Multiplier applied under configured load mode | `> 0` |
| `abandonment_enabled` | boolean | Whether groups may leave after excessive waiting | `true` or `false` |

## Reusable Policy Components

`data/policies/` includes three kinds of reusable files:

- Seating components such as `seating_fcfs.json` and `seating_best_fit.json`
- Service components such as `service_default.json` and `service_low_cleaning_capacity.json`
- Reservation-control reference files such as `reservation_enabled.json`

The main runtime flow is:

1. `case_study.json` selects one seating component, one service component, and one reservation-control component.
2. `restaurant_simulation.loading` composes those inputs into a resolved policy bundle for version `A` or `B`.
3. The API, batch runner, and notebooks all consume that same resolved bundle, so there is one source of truth for guided scenario analysis.
