from __future__ import annotations

import json
import unittest

from restaurant_simulation.loading import load_custom_scenario


MINIMAL_CONFIG = json.dumps(
    {
        "restaurant_name": "Validation Test Restaurant",
        "simulation_start": "11:30",
        "simulation_end": "13:00",
        "queue_mode": "single",
        "queue_definitions": [{"queue_id": "Q_ALL", "min_size": 1, "max_size": 10}],
        "tables": [{"table_id": "T01", "capacity": 4, "zone": "Main"}],
        "table_sharing_allowed": False,
        "table_combining_allowed": False,
        "reservation_hold_policy": {"enabled": True, "hold_minutes": 10},
        "default_reset_policy": {"enabled": True, "default_reset_minutes": 3},
    }
)

MINIMAL_POLICY = json.dumps(
    {
        "policy_name": "Validation Test Policy",
        "seating_policy": {
            "policy_name": "FCFS",
            "queue_rule": "fcfs_within_queue",
            "selection_rule": "earliest_suitable",
            "reservation_priority": False,
            "best_fit": False,
            "late_reservation_behavior": "downgrade_to_walkin_after_grace",
            "no_show_handling": {"release_hold_after_grace": True, "record_no_show": True},
        },
        "service_policy": {
            "policy_name": "Default Service",
            "reset_enabled": True,
            "reset_time_by_capacity": {"4": 3},
            "max_seating_actions_per_event_time": 1,
            "max_cleaning_actions_per_event_time": 1,
            "kitchen_load_mode": "moderate_peak",
            "dining_duration_multiplier_under_load": 1.0,
            "abandonment_enabled": False,
        },
    }
)


class ValidationTests(unittest.TestCase):
    def test_reservation_without_reservation_time_is_rejected(self) -> None:
        arrivals_csv = """group_id,arrival_time,group_size,dining_duration,group_type,reservation_time,grace_period,no_show_flag,abandon_tolerance,notes
X001,11:40,2,45,reservation,,10,false,30,missing booking time
"""
        with self.assertRaises(ValueError):
            load_custom_scenario(
                config_json=MINIMAL_CONFIG,
                arrivals_csv=arrivals_csv,
                policy_json=MINIMAL_POLICY,
            )


if __name__ == "__main__":
    unittest.main()
