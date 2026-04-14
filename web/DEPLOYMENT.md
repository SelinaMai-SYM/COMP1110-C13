# Deployment Guide

This repository is set up for a public two-service deployment:

- a FastAPI backend from `code/`
- a React static site from `web/`

## Local Run

Backend:

```bash
cd code
python3 -m pip install --user --trusted-host pypi.org --trusted-host files.pythonhosted.org -r requirements.txt
python3 -m uvicorn restaurant_simulation.api:app --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd web
npm install
cp .env.example .env
npm run dev -- --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173`.

## Public Render Deployment

The Render service definition lives at `web/render.yaml` and defines:

1. `restaurant-simulation-api` as the Python web service.
2. `restaurant-simulation-dashboard` as the static React site.

You can deploy with either:

- a Render Blueprint that points at `web/render.yaml`, or
- two manually created Render services using the same settings from that file

Suggested steps:

1. Push the repository to GitHub.
2. Deploy the backend service from `code/`.
3. Wait for Render to assign the real backend URL.
4. Set the frontend static site's `VITE_API_BASE_URL` environment variable to that real backend URL.
5. Deploy or redeploy the frontend service from `web/`.

After that, anyone with the frontend URL can open the dashboard and use both the official case studies and the guided custom scenario builder.

## Notes

- CORS is enabled in the FastAPI app to support separate frontend hosting.
- The main custom workflow is guided by preset selectors sourced from `data/restaurant_configs/`, `data/policies/`, and `data/arrival_scenarios/`.
- Raw JSON and CSV are still available in an advanced preview section for transparency and debugging, but they are no longer the primary user flow.
- `code/outputs/case_study_metrics.csv` and `code/outputs/case_study_comparisons.json` can be used directly in the final report.
