# Pair 04: No Reservation Hold vs Reservation Hold

This pair changes only the reservation holding behaviour while keeping arrivals, table layout, queue structure, and seating/service policy fixed. Version A releases tables immediately when a reservation has not yet arrived, while Version B holds tables for the configured grace window. Compare `reservation_fulfillment_rate`, `average_reservation_delay`, `average_wait_time`, `groups_served`, and `table_utilization_overall` to reveal the trade-off between protecting bookings and preserving walk-in throughput.
