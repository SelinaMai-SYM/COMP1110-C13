from __future__ import annotations

# What it does:
#   Checks representative simulation outcomes for official case studies.
# Inputs:
#   Loaded case-study scenarios and pair comparisons.
# Outputs:
#   Assertions about metrics, logs, and expected behavioural differences.

import unittest

from restaurant_simulation.loading import load_case_study
from restaurant_simulation.runners import run_case_pair, run_scenario


# What it does:
#   Groups tests for core simulator behaviour on official scenarios.
# Inputs:
#   Loaded case studies and runner helpers.
# Outputs:
#   Test assertions about metrics and outcomes.

class SimulationTests(unittest.TestCase):
    def test_pair_01_runs_and_returns_metrics(self) -> None:
        result = run_scenario(load_case_study("pair_01_table_mix", "A"))
        self.assertEqual(result.metrics.scenario_name, "pair_01_table_mix_A")
        self.assertGreater(result.metrics.groups_served, 0)
        self.assertGreaterEqual(result.metrics.max_queue_length, 0)
        self.assertTrue(result.event_log)
        self.assertEqual(len(result.group_outcomes), 36)

    # What it does:
    #   Verifies the intended wait-time improvement in pair_01 version B.
    # Inputs:
    #   The pair_01 A/B comparison payload.
    # Outputs:
    #   A lower average wait time for version B.

    def test_pair_01_b_improves_wait_time(self) -> None:
        comparison = run_case_pair("pair_01_table_mix")
        wait_a = comparison["A"]["metrics"]["average_wait_time"]
        wait_b = comparison["B"]["metrics"]["average_wait_time"]
        self.assertLess(wait_b, wait_a)

    # What it does:
    #   Verifies that enabling abandonment changes pair_06 outcomes.
    # Inputs:
    #   The pair_06 A/B comparison payload.
    # Outputs:
    #   No abandoned groups in A and at least one in B.

    def test_pair_06_abandonment_changes_outcomes(self) -> None:
        comparison = run_case_pair("pair_06_no_abandonment_vs_abandonment")
        self.assertEqual(comparison["A"]["metrics"]["groups_abandoned"], 0)
        self.assertGreater(comparison["B"]["metrics"]["groups_abandoned"], 0)


if __name__ == "__main__":
    unittest.main()
