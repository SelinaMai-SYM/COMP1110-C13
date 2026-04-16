# Restaurant Simulation Frontend

`web/` contains the React + Vite dashboard for the Topic C restaurant queue simulation platform.

## What the dashboard does

- compare the six official A/B case studies from the simulator backend
- build a custom scenario using guided preset selections instead of editing raw JSON and CSV in the main workflow
- preview the generated config, policy, and arrivals data in an optional advanced section
- inspect metrics, queue timeline, event log, group outcomes, and table activity
- read the backend schema reference documents exposed by the API

## Local development

1. Start the FastAPI backend from `../code`.
2. Copy the example environment file.
3. Run the Vite development server.

```bash
npm install
cp .env.example .env
npm run dev -- --host 127.0.0.1 --port 4173
```

The dashboard reads the backend base URL from `VITE_API_BASE_URL`. When unset, it falls back to `http://127.0.0.1:8000`.

## Production build

```bash
npm run build
npm run preview
```

## Deployment

Render deployment notes live in [DEPLOYMENT.md](./DEPLOYMENT.md). The repository includes a Render service definition at [`web/render.yaml`](./render.yaml).

Production URLs currently in use:

- Frontend: `https://comp-1110-c08-dashboard.onrender.com`
- Backend API: `https://comp-1110-c08.onrender.com`

As long as those Render service names stay unchanged, these `.onrender.com` URLs remain the fixed addresses for opening the dashboard and calling the API.
