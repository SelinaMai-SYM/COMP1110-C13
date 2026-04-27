# COMP-1110-C08 Restaurant Queue Simulation

This repository contains the COMP1110 C08 group project for **Topic C: Restaurant Queue Simulation**. The project models restaurant queue management as a data and simulation problem. It compares how restaurant layouts, queue structures, reservation rules, seating policies, cleaning capacity, and customer abandonment affect waiting time, queue length, service outcomes, and table utilization.

The implementation is intentionally file-based and reproducible. The Python simulator, notebooks, FastAPI backend, and React dashboard all read from the same shared `data/` library and official A/B case-study manifests.

## Project Scope

The system supports the main Topic C requirements:

- Load restaurant settings, queue definitions, arrival scenarios, and operating policies from JSON/CSV files.
- Simulate customer arrivals, queue assignment, seating, dining completion, table reset/cleaning, reservations, no-shows, and abandonment.
- Track metrics including average wait time, maximum wait time, p90 wait time, maximum queue length, groups served, groups abandoned, service levels, table utilization, reservation fulfillment, and table fit efficiency.
- Provide seven reproducible A/B case studies where each pair changes one main restaurant operation factor.
- Provide tests, sample outputs, notebook analysis, CLI execution, API execution, and an optional web dashboard.

## Repository Structure

```text
COMP-1110-C08/
├── code/                    # Python simulator, CLI runner, FastAPI backend, and tests
├── data/                    # Shared configs, arrivals, policies, case studies, schemas, sample outputs
├── notebook/                # Data catalog and guided scenario analysis notebooks
└── web/                     # React + Vite dashboard for interactive comparison
```

Important files:

- `code/restaurant_simulation/models.py`: data classes for configs, arrivals, policies, events, outputs, and metrics.
- `code/restaurant_simulation/loading.py`: file loading and validation for JSON/CSV inputs.
- `code/restaurant_simulation/simulator.py`: discrete-event simulation engine.
- `code/restaurant_simulation/runners.py`: helpers for running single scenarios and official A/B pairs.
- `code/restaurant_simulation/api.py`: FastAPI backend used by the web dashboard.
- `code/restaurant_simulation/cli.py`: command-line entry point.
- `data/README.md`: detailed explanation of the data layer and case-study design.

## Environment

The backend and notebooks use Python 3.11. The web dashboard uses Node.js/npm with React and Vite.

Install Python dependencies:

```bash
cd code
python3 -m pip install -r requirements.txt
```

Install notebook dependencies if you want to run the analysis notebooks:

```bash
cd code
python3 -m pip install -r ../notebook/requirements.txt
```

Install frontend dependencies:

```bash
cd web
npm install
```

## Running The Python Simulator

From the `code/` directory, run all official A/B case studies:

```bash
python3 -m restaurant_simulation.cli --run-all
```

This writes:

- `code/outputs/case_study_metrics.csv`
- `code/outputs/case_study_comparisons.json`

Run one specific case-study version:

```bash
python3 -m restaurant_simulation.cli --case-study pair_02_single_vs_multi_queue --version A
```

Print the full JSON output instead of only the metrics row:

```bash
python3 -m restaurant_simulation.cli --case-study pair_02_single_vs_multi_queue --version A --output-json
```

## Running The API Backend

From the `code/` directory:

```bash
python3 -m uvicorn restaurant_simulation.api:app --reload
```

Useful endpoints include:

- `GET /health`
- `GET /case-studies`
- `GET /builder-presets`
- `GET /schemas`
- `POST /simulate/case-study`
- `POST /simulate/custom`

By default, the backend reads from the repository-local `data/` directory. Set `SIM_DATA_ROOT` only if you want to point the simulator, API, and notebooks to a different data directory.

## Running The Web Dashboard

Start the backend first, then run the frontend:

```bash
cd web
cp .env.example .env
npm run dev -- --host 127.0.0.1 --port 4173
```

The dashboard supports:

- prepared official A/B scenario comparisons;
- custom Option A vs Option B comparisons;
- guided preset selection without editing raw JSON/CSV;
- metric cards, charts, event logs, queue snapshots, group outcomes, and table activity views.

Production URLs currently documented in `web/README.md`:

- Frontend: `https://comp-1110-c08-dashboard.onrender.com`
- Backend API: `https://comp-1110-c08.onrender.com`

## Running The Notebooks

The notebooks are in `notebook/`:

- `notebook/data_catalog.ipynb`: documents the shared data library, presets, policies, and official case-study mapping.
- `notebook/scenario_runner.ipynb`: runs the official A/B case studies and visualizes metrics, deltas, and deep dives.

Install notebook dependencies first:

```bash
cd code
python3 -m pip install -r requirements.txt
python3 -m pip install -r ../notebook/requirements.txt
```

Then open the notebooks in Jupyter or VS Code and run all cells.

## Testing

Run tests from the `code/` directory:

```bash
python3 -m unittest discover -s tests
```

Test coverage purpose:

- `tests/test_simulation.py`: verifies official scenario execution, metrics generation, A/B comparison behavior, and abandonment effects.
- `tests/test_validation.py`: verifies invalid custom input is rejected, such as reservation groups without reservation times.
- `tests/test_api.py`: verifies API health, official case-study simulation, builder presets, case-study input retrieval, and custom simulation payloads.
- `tests/test_runners.py`: verifies batch execution writes metrics and comparison outputs.

## Data And Case Studies

The `data/` directory is the shared source of truth:

- `restaurant_configs/`: restaurant layouts and queue templates.
- `arrival_scenarios/`: CSV demand streams.
- `policies/`: seating, service, and reservation-control policies.
- `case_studies/`: seven official A/B scenario manifests.
- `schemas/`: reference documents for input and output formats.
- `sample_outputs/`: example metric CSV outputs.

The seven official A/B pairs are:

1. Dining-room footprint.
2. Single queue vs multiple size-based queues.
3. Coarse vs fine queue buckets.
4. No reservation hold vs reservation hold.
5. Low vs high cleaning capacity.
6. No abandonment vs abandonment enabled.
7. FCFS vs best-fit seating.

Each pair keeps most inputs fixed and changes one main operational decision, so the output deltas are easier to explain in the final report.

## Output Metrics

The standard metric schema is documented in `data/schemas/metrics_schema.md`. The main metrics row includes overall `max_queue_length`. Per-queue queue sizes are also available in each `ScenarioResult.queue_snapshots` record through the `per_queue` field.

## Notes For Reproducibility

- The notebooks, CLI, API, and web dashboard all resolve official cases from the same `data/case_studies/*/case_study.json` manifests.
- Batch outputs in `code/outputs/` can be regenerated with `python3 -m restaurant_simulation.cli --run-all`.
- `SIM_DATA_ROOT` can be used to point all Python entry points to an alternate data root when needed.