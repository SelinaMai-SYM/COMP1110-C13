from __future__ import annotations

# What it does:
#   Checks batch runner output generation.
# Inputs:
#   Temporary output directories and official case-study data.
# Outputs:
#   Assertions that comparisons and artifact files are produced.

import tempfile
import unittest
from pathlib import Path

from restaurant_simulation.runners import run_all_case_studies


# What it does:
#   Groups tests for batch runner side effects and payloads.
# Inputs:
#   Temporary filesystem locations.
# Outputs:
#   Test assertions that files and comparison data are produced.

class RunnerTests(unittest.TestCase):
    def test_run_all_writes_batch_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            payload = run_all_case_studies(output_dir=temp_dir)
            self.assertEqual(len(payload["comparisons"]), 7)
            self.assertTrue(Path(payload["metrics_csv"]).exists())
            self.assertTrue(Path(payload["comparisons_json"]).exists())


if __name__ == "__main__":
    unittest.main()
