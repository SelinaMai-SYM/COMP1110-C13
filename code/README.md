# Restaurant Simulation Backend

`code/` contains the Python simulation engine, CLI batch runner, and FastAPI service for the Topic C restaurant queue platform.

## Structure

- `restaurant_simulation/loading.py`: loads and validates restaurant configs, arrivals, and policy bundles.
- `restaurant_simulation/simulator.py`: discrete-event engine covering arrivals, seating, reservations, holds, resets, and abandonment.
- `restaurant_simulation/runners.py`: single-scenario and batch execution helpers for the six official case-study pairs.
- `restaurant_simulation/api.py`: FastAPI application for the web dashboard.
- `run_case_studies.py`: CLI entry point.

## Quick Start

```bash
python3 -m pip install -r requirements.txt
python3 -m restaurant_simulation.cli --run-all
python3 -m uvicorn restaurant_simulation.api:app --reload
```

## Outputs

Running `--run-all` writes:

- `outputs/case_study_metrics.csv`
- `outputs/case_study_comparisons.json`

These files follow the shared metric schema in `data/schemas/metrics_schema.md`.
