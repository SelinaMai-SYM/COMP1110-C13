from __future__ import annotations

import unittest

from restaurant_simulation.loading import load_case_study
from restaurant_simulation.runners import run_case_pair, run_scenario


class SimulationTests(unittest.TestCase):
    def test_pair_01_runs_and_returns_metrics(self) -> None:
        result = run_scenario(load_case_study("pair_01_table_mix", "A"))
        self.assertEqual(result.metrics.scenario_name, "pair_01_table_mix_A")
        self.assertGreater(result.metrics.groups_served, 0)
        self.assertGreaterEqual(result.metrics.max_queue_length, 0)
        self.assertTrue(result.event_log)
        self.assertEqual(len(result.group_outcomes), 16)

    def test_pair_01_b_improves_wait_time(self) -> None:
        comparison = run_case_pair("pair_01_table_mix")
        wait_a = comparison["A"]["metrics"]["average_wait_time"]
        wait_b = comparison["B"]["metrics"]["average_wait_time"]
        self.assertLess(wait_b, wait_a)

    def test_pair_06_abandonment_changes_outcomes(self) -> None:
        comparison = run_case_pair("pair_06_no_abandonment_vs_abandonment")
        self.assertEqual(comparison["A"]["metrics"]["groups_abandoned"], 0)
        self.assertGreater(comparison["B"]["metrics"]["groups_abandoned"], 0)


if __name__ == "__main__":
    unittest.main()
