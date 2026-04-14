from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .loading import (
    DATA_ROOT,
    discover_case_studies,
    load_case_study,
    load_builder_presets,
    load_case_study_inputs,
    load_custom_scenario,
    load_schema_documents,
)
from .runners import run_case_pair, run_scenario


def _data_root() -> Path:
    configured = os.getenv("SIM_DATA_ROOT")
    return Path(configured) if configured else DATA_ROOT


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


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/case-studies")
def list_case_studies() -> dict[str, object]:
    case_studies = [metadata.__dict__ for metadata in discover_case_studies(data_root=_data_root())]
    return {"case_studies": case_studies}


@app.get("/case-studies/{case_study}/{version}/inputs")
def case_study_inputs(case_study: str, version: Literal["A", "B"]) -> dict[str, object]:
    try:
        return load_case_study_inputs(case_study, version, data_root=_data_root())
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/schemas")
def schemas() -> dict[str, object]:
    return {"schemas": load_schema_documents(data_root=_data_root())}


@app.get("/builder-presets")
def builder_presets() -> dict[str, object]:
    return load_builder_presets(data_root=_data_root())


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
