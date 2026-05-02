from __future__ import annotations

# What it does:
#   Coordinates simulator runs for one scenario, one A/B pair, or all official case studies.
# Inputs:
#   Scenario definitions, case-study ids, data roots, and optional output locations.
# Outputs:
#   Simulation result dictionaries plus CSV/JSON output files when running all cases.

import csv
import json
from pathlib import Path
from typing import Any

from .loading import DATA_ROOT, discover_case_studies, load_case_study
from .models import ScenarioDefinition
from .simulator import RestaurantSimulator


OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "outputs"


# What it does:
#   Runs one already-loaded scenario through the simulator.
# Inputs:
#   A ScenarioDefinition.
# Outputs:
#   A ScenarioResult.

def run_scenario(scenario: ScenarioDefinition):
    simulator = RestaurantSimulator(scenario)
    return simulator.run()


# What it does:
#   Runs both A and B versions of an official case study and compares metrics.
# Inputs:
#   A case-study id and optional data root.
# Outputs:
#   A dictionary containing both results and B-minus-A metric deltas.

def run_case_pair(case_study: str, *, data_root: str | Path | None = None) -> dict[str, Any]:
    result_a = run_scenario(load_case_study(case_study, "A", data_root=data_root))
    result_b = run_scenario(load_case_study(case_study, "B", data_root=data_root))

    metrics_a = result_a.metrics.to_dict()
    metrics_b = result_b.metrics.to_dict()
    metric_deltas = {}
    for key, value in metrics_b.items():
        if key in {"scenario_name", "notes"}:
            continue
        if isinstance(value, (int, float)):
            metric_deltas[key] = round(value - float(metrics_a[key]), 4)

    return {
        "case_study": case_study,
        "A": result_a.to_dict(),
        "B": result_b.to_dict(),
        "metric_deltas_b_minus_a": metric_deltas,
    }


# What it does:
#   Runs every discovered official case study pair and writes summary artifacts.
# Inputs:
#   Optional output directory and data root.
# Outputs:
#   Paths to generated artifacts plus all comparison payloads.

def run_all_case_studies(
    *,
    output_dir: str | Path | None = None,
    data_root: str | Path | None = None,
) -> dict[str, Any]:
    data_root = Path(data_root) if data_root else DATA_ROOT
    output_root = Path(output_dir) if output_dir else OUTPUT_ROOT
    output_root.mkdir(parents=True, exist_ok=True)

    metric_rows: list[dict[str, Any]] = []
    comparisons: list[dict[str, Any]] = []

    for case_study in discover_case_studies(data_root=data_root):
        comparison = run_case_pair(case_study.case_study, data_root=data_root)
        comparisons.append(comparison)
        metric_rows.append(comparison["A"]["metrics"])
        metric_rows.append(comparison["B"]["metrics"])

    metrics_csv_path = output_root / "case_study_metrics.csv"
    comparisons_json_path = output_root / "case_study_comparisons.json"

    if metric_rows:
        fieldnames = list(metric_rows[0].keys())
        with metrics_csv_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(metric_rows)

    comparisons_json_path.write_text(
        json.dumps(comparisons, indent=2),
        encoding="utf-8",
    )

    return {
        "metrics_csv": str(metrics_csv_path),
        "comparisons_json": str(comparisons_json_path),
        "comparisons": comparisons,
    }
