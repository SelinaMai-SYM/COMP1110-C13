# Arrival Scenario Schema

Each CSV row represents one indivisible customer group. The data is intentionally rich enough to support walk-ins, reservations, no-shows, late arrivals, and optional abandonment behaviour.

## Required Columns

| Column | Type | Description | Constraints |
| --- | --- | --- | --- |
| `group_id` | string | Unique group identifier | Unique within file |
| `arrival_time` | string | Actual or expected arrival slot used by the scenario | `HH:MM`, sorted ascending |
| `group_size` | integer | Number of diners in the group | `>= 1` |
| `dining_duration` | integer | Planned dining duration in minutes | `> 0` |
| `group_type` | string | Customer type | `walkin` or `reservation` |
| `reservation_time` | string | Reserved booking time | Required for reservations, blank for walk-ins |
| `grace_period` | integer | Minutes before a late reservation loses protected status | `>= 0` |
| `no_show_flag` | boolean | Whether the reservation never arrives | `true` or `false` |
| `abandon_tolerance` | integer | Maximum acceptable waiting time if abandonment is enabled | `>= 0` |
| `notes` | string | Small scenario note for interpretation | Optional but strongly recommended |

## Interpretation Rules

- `arrival_time` must be present for every row because the file is used as an exact scenario input and must remain chronologically ordered.
- If `no_show_flag=true`, the row still stays in the dataset so the scenario preserves reservation demand and possible hold effects. A simulator should treat it as a booking that never becomes a seatable arrival.
- `reservation_time` is blank for walk-ins and required for reservations.
- `grace_period` is typically `0` for walk-ins.
- `abandon_tolerance` is still included even when abandonment is disabled so the same dataset can be reused in paired comparisons.

## Design Notes

- Keeping arrival files separate from restaurant configs ensures the same demand stream can be reused when only one factor changes.
- This is essential for the paired-case requirement in the final report, especially when comparing table mix, queue design, cleaning capacity, or abandonment policy.
