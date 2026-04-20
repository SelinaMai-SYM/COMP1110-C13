from __future__ import annotations

import json
import unittest

from fastapi.testclient import TestClient

from restaurant_simulation.api import app


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_healthcheck(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_compare_case_study(self) -> None:
        response = self.client.post(
            "/simulate/case-study",
            json={
                "case_study": "pair_06_no_abandonment_vs_abandonment",
                "compare_both": True,
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("A", payload)
        self.assertIn("B", payload)

    def test_case_study_inputs(self) -> None:
        response = self.client.get("/case-studies/pair_01_table_mix/A/inputs")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("config_json", payload)
        self.assertIn("arrivals_csv", payload)
        self.assertIn("policy_json", payload)

    def test_builder_presets(self) -> None:
        response = self.client.get("/builder-presets")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("restaurant_layouts", payload)
        self.assertIn("queue_structures", payload)
        self.assertIn("seating_policies", payload)
        self.assertIn("service_policies", payload)
        self.assertIn("reservation_policies", payload)
        self.assertIn("arrival_scenarios", payload)
        self.assertGreaterEqual(len(payload["restaurant_layouts"]), 8)
        self.assertGreaterEqual(len(payload["queue_structures"]), 4)
        self.assertTrue(
            any(item["id"] == "layout_bubble_tea_express" for item in payload["restaurant_layouts"])
        )
        self.assertTrue(any(item["id"] == "queue_balanced_size" for item in payload["queue_structures"]))
        self.assertTrue(any(item["id"] == "service_default" for item in payload["service_policies"]))
        self.assertTrue(
            any(
                item["id"] == "reservation_disabled" and item["title"] == "No Reservation Hold"
                for item in payload["reservation_policies"]
            )
        )
        dinner_peak = next(item for item in payload["arrival_scenarios"] if item["id"] == "dinner_peak_base")
        self.assertGreaterEqual(dinner_peak["row_count"], 30)
        self.assertGreaterEqual(dinner_peak["max_group_size"], 6)
        self.assertIn("row_count", dinner_peak)
        self.assertIn("reservation_groups", dinner_peak)

    def test_custom_simulation_accepts_builder_style_payload(self) -> None:
        presets = self.client.get("/builder-presets").json()

        layout = next(
            item for item in presets["restaurant_layouts"] if item["id"] == "layout_family_trattoria"
        )
        self.assertNotIn("zone", layout["data"]["tables"][0])
        queue = next(item for item in presets["queue_structures"] if item["id"] == "queue_balanced_size")
        seating = next(item for item in presets["seating_policies"] if item["id"] == "seating_fcfs")
        service = next(item for item in presets["service_policies"] if item["id"] == "service_default")
        reservation = next(
            item for item in presets["reservation_policies"] if item["id"] == "reservation_enabled"
        )
        arrivals = next(item for item in presets["arrival_scenarios"] if item["id"] == "dinner_peak_base")

        config = {
            "restaurant_name": "Builder Smoke Test",
            "simulation_start": layout["data"]["simulation_start"],
            "simulation_end": layout["data"]["simulation_end"],
            "queue_mode": queue["data"]["queue_mode"],
            "queue_definitions": queue["data"]["queue_definitions"],
            "tables": layout["data"]["tables"],
            "table_sharing_allowed": layout["data"]["table_sharing_allowed"],
            "table_combining_allowed": layout["data"]["table_combining_allowed"],
            "reservation_hold_policy": {
                "enabled": reservation["data"]["hold_tables_for_reservations"],
                "hold_minutes": reservation["data"]["default_hold_minutes"],
            },
            "default_reset_policy": layout["data"]["default_reset_policy"],
            "optional_operational_defaults": {
                **layout["data"].get("optional_operational_defaults", {}),
                "notes": "Builder payload smoke test",
            },
        }
        policy = {
            "policy_name": f'{seating["data"]["policy_name"]} + {service["data"]["policy_name"]}',
            "source_components": {
                "restaurant_layout": layout["id"],
                "queue_structure": queue["id"],
                "reservation": reservation["id"],
                "seating": seating["id"],
                "service": service["id"],
                "arrivals": arrivals["id"],
            },
            "seating_policy": seating["data"],
            "service_policy": service["data"],
        }

        response = self.client.post(
            "/simulate/custom",
            json={
                "scenario_name": "builder_smoke_test",
                "config_json": json.dumps(config),
                "policy_json": json.dumps(policy),
                "arrivals_csv": arrivals["raw"],
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["scenario_name"], "builder_smoke_test")
        self.assertIn("metrics", payload)
        self.assertIn("queue_snapshots", payload)


if __name__ == "__main__":
    unittest.main()
