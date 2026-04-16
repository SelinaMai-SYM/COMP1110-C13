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

1. `COMP-1110-C08` as the Python web service.
2. `comp-1110-c08-dashboard` as the static React site.

Current stable public URLs:

- Backend API: `https://comp-1110-c08.onrender.com`
- Frontend dashboard: `https://comp-1110-c08-dashboard.onrender.com`

You can deploy with either:

- a Render Blueprint that points at `web/render.yaml`, or
- two manually created Render services using the same settings from that file

Suggested steps:

1. Push the repository to GitHub.
2. Create or sync the Render services from `web/render.yaml`.
3. Keep the service names unchanged so the `.onrender.com` URLs stay stable.
4. Redeploy the backend service from `code/` and the frontend static site from `web/` whenever you ship updates.

After that, anyone with the frontend URL can open the dashboard and use both the official case studies and the guided custom scenario builder.

## Notes

- CORS is enabled in the FastAPI app to support separate frontend hosting.
- `VITE_API_BASE_URL` is already pinned in `web/render.yaml`, so production redeploys do not rely on manually typing the API URL into the Render dashboard.
- If you rename or delete either Render service, Render can assign a different public subdomain. Keep the current service names if you want the URLs above to remain your fixed entry points.
- The main custom workflow is guided by preset selectors sourced from `data/restaurant_configs/`, `data/policies/`, and `data/arrival_scenarios/`.
- Raw JSON and CSV are still available in an advanced preview section for transparency and debugging, but they are no longer the primary user flow.
- `code/outputs/case_study_metrics.csv` and `code/outputs/case_study_comparisons.json` can be used directly in the final report.
