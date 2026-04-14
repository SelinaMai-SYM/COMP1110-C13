from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from restaurant_simulation.runners import run_all_case_studies


class RunnerTests(unittest.TestCase):
    def test_run_all_writes_batch_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            payload = run_all_case_studies(output_dir=temp_dir)
            self.assertEqual(len(payload["comparisons"]), 6)
            self.assertTrue(Path(payload["metrics_csv"]).exists())
            self.assertTrue(Path(payload["comparisons_json"]).exists())


if __name__ == "__main__":
    unittest.main()
