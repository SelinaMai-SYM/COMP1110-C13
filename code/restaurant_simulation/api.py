from __future__ import annotations

# What it does:
#   Exposes the simulator through FastAPI routes used by the dashboard.
# Inputs:
#   HTTP requests, configured data roots, and scenario payloads.
# Outputs:
#   JSON-compatible dictionaries or HTTP errors.

from dataclasses import asdict
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .loading import (
    discover_case_studies,
    load_case_study,
    load_builder_presets,
    load_case_study_inputs,
    load_custom_scenario,
    load_schema_documents,
    resolve_data_root,
)
from .runners import run_case_pair, run_scenario


# What it does:
#   Performs the data root step.
# Inputs:
#   The arguments declared by the function signature.
# Outputs:
#   The return value or state mutation described by the function body.

def _data_root() -> Path:
    return resolve_data_root()


# What it does:
#   Defines the API body for official case-study simulation requests.
# Inputs:
#   JSON sent to the case-study simulation endpoint.
# Outputs:
#   Validated fields for the route handler.

class CaseStudyRequest(BaseModel):
    case_study: str = Field(..., description="Case-study directory name.")
    version: Literal["A", "B"] | None = Field(
        default=None,
        description="Scenario version to run. Omit when compare_both is true.",
    )
    compare_both: bool = Field(
        default=False,
        description="When true, run both A and B and return a comparison payload.",
    )


# What it does:
#   Defines the API body for custom scenario simulation requests.
# Inputs:
#   JSON strings and a scenario name sent by the dashboard.
# Outputs:
#   Validated raw inputs for custom scenario loading.

class CustomScenarioRequest(BaseModel):
    config_json: str
    arrivals_csv: str
    policy_json: str
    scenario_name: str = "custom_scenario"


app = FastAPI(
    title="Restaurant Queue Simulation API",
    description="Discrete-event simulator and dashboard backend for Topic C.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# What it does:
#   Reports whether the API process is reachable.
# Inputs:
#   A GET request to the health endpoint.
# Outputs:
#   A simple status dictionary.

@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


# What it does:
#   Lists official case studies available under the configured data root.
# Inputs:
#   A GET request and the current data-root setting.
# Outputs:
#   A dictionary containing case-study metadata records.

@app.get("/case-studies")
def list_case_studies() -> dict[str, object]:
    case_studies = [asdict(metadata) for metadata in discover_case_studies(data_root=_data_root())]
    return {"case_studies": case_studies}


# What it does:
#   Returns the raw input files for one case-study version.
# Inputs:
#   A case-study id and version label.
# Outputs:
#   Config, arrivals, and policy inputs or an HTTP error.

@app.get("/case-studies/{case_study}/{version}/inputs")
def case_study_inputs(case_study: str, version: Literal["A", "B"]) -> dict[str, object]:
    try:
        return load_case_study_inputs(case_study, version, data_root=_data_root())
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


# What it does:
#   Returns schema documents used by clients to understand accepted input shapes.
# Inputs:
#   A GET request and the current data-root setting.
# Outputs:
#   A dictionary of schema text keyed by schema name.

@app.get("/schemas")
def schemas() -> dict[str, object]:
    return {"schemas": load_schema_documents(data_root=_data_root())}


# What it does:
#   Returns preset data used by the custom scenario builder.
# Inputs:
#   A GET request and the current data-root setting.
# Outputs:
#   Grouped layout, policy, and arrival preset records.

@app.get("/builder-presets")
def builder_presets() -> dict[str, object]:
    return load_builder_presets(data_root=_data_root())


# What it does:
#   Runs an official case-study version or compares both versions.
# Inputs:
#   A validated CaseStudyRequest body.
# Outputs:
#   A simulation result or pair comparison dictionary.

@app.post("/simulate/case-study")
def simulate_case_study(request: CaseStudyRequest) -> dict[str, object]:
    try:
        if request.compare_both:
            return run_case_pair(request.case_study, data_root=_data_root())
        if request.version is None:
            raise ValueError("A specific version is required when compare_both is false.")
        scenario = load_case_study(
            request.case_study,
            request.version,
            data_root=_data_root(),
        )
        return run_scenario(scenario).to_dict()
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# What it does:
#   Runs a scenario assembled from user-supplied raw inputs.
# Inputs:
#   A CustomScenarioRequest body containing config JSON, arrivals CSV, and policy JSON.
# Outputs:
#   A simulation result dictionary or a validation HTTP error.

@app.post("/simulate/custom")
def simulate_custom(request: CustomScenarioRequest) -> dict[str, object]:
    try:
        scenario = load_custom_scenario(
            config_json=request.config_json,
            arrivals_csv=request.arrivals_csv,
            policy_json=request.policy_json,
            scenario_name=request.scenario_name,
        )
        return run_scenario(scenario).to_dict()
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
