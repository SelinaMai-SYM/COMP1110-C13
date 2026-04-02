# Pair 06: No Abandonment vs Abandonment Enabled

This pair changes only the abandonment rule while keeping the stress-test arrivals, table layout, queue structure, reservation holding, and base service capacity fixed. Version A forces every group to remain in the system, while Version B allows departures once waiting exceeds tolerance. Compare `groups_abandoned`, `max_queue_length`, `average_wait_time`, `service_level_within_15_min`, and `groups_served` to highlight the trade-off between congestion reduction and customer loss.
