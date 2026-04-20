from __future__ import annotations

import copy
import csv
import json
import os
from io import StringIO
from pathlib import Path
from typing import Any, Callable

from .models import (
    ArrivalGroup,
    CaseStudyStarterVersion,
    CaseStudyMetadata,
    DefaultResetPolicy,
    GroupType,
    PolicyBundle,
    QueueDefinition,
    QueueMode,
    ReservationHoldPolicy,
    RestaurantConfig,
    ScenarioDefinition,
    SeatingPolicy,
    ServicePolicy,
    TableSpec,
)
from .time_utils import parse_clock


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = REPO_ROOT / "data"


def resolve_data_root(data_root: str | Path | None = None) -> Path:
    if data_root is not None:
        return Path(data_root)
    configured = os.getenv("SIM_DATA_ROOT")
    return Path(configured) if configured else DATA_ROOT


def _parse_bool(value: str | bool) -> bool:
    if isinstance(value, bool):
        return value
    normalized = value.strip().lower()
    if normalized in {"true", "1", "yes"}:
        return True
    if normalized in {"false", "0", "no", ""}:
        return False
    raise ValueError(f"Invalid boolean value: {value!r}")


def _require_keys(mapping: dict[str, Any], keys: list[str], label: str) -> None:
    missing = [key for key in keys if key not in mapping]
    if missing:
        raise ValueError(f"{label} missing required keys: {', '.join(missing)}")


def _load_json_file(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_config(raw: dict[str, Any]) -> RestaurantConfig:
    _require_keys(
        raw,
        [
            "restaurant_name",
            "simulation_start",
            "simulation_end",
            "queue_mode",
            "queue_definitions",
            "tables",
            "table_sharing_allowed",
            "table_combining_allowed",
            "reservation_hold_policy",
            "default_reset_policy",
        ],
        "restaurant config",
    )

    simulation_start = parse_clock(raw["simulation_start"])
    simulation_end = parse_clock(raw["simulation_end"])
    if simulation_end <= simulation_start:
        raise ValueError("Simulation end must be later than simulation start.")

    queue_mode = QueueMode(raw["queue_mode"])
    queue_definitions: list[QueueDefinition] = []
    queue_ids: set[str] = set()
    for entry in raw["queue_definitions"]:
        _require_keys(entry, ["queue_id", "min_size", "max_size"], "queue definition")
        queue = QueueDefinition(
            queue_id=str(entry["queue_id"]),
            min_size=int(entry["min_size"]),
            max_size=int(entry["max_size"]),
        )
        if queue.queue_id in queue_ids:
            raise ValueError(f"Duplicate queue id: {queue.queue_id}")
        if queue.min_size < 1 or queue.max_size < queue.min_size:
            raise ValueError(f"Invalid queue range for {queue.queue_id}")
        queue_ids.add(queue.queue_id)
        queue_definitions.append(queue)

    sorted_ranges = sorted(queue_definitions, key=lambda item: item.min_size)
    for previous, current in zip(sorted_ranges, sorted_ranges[1:]):
        if current.min_size <= previous.max_size:
            raise ValueError("Queue ranges must be non-overlapping.")

    if queue_mode == QueueMode.SINGLE and len(queue_definitions) != 1:
        raise ValueError("Single queue mode requires exactly one queue definition.")

    table_ids: set[str] = set()
    tables: list[TableSpec] = []
    for entry in raw["tables"]:
        _require_keys(entry, ["table_id", "capacity"], "table definition")
        table = TableSpec(
            table_id=str(entry["table_id"]),
            capacity=int(entry["capacity"]),
        )
        if table.capacity < 1:
            raise ValueError(f"Invalid table capacity for {table.table_id}")
        if table.table_id in table_ids:
            raise ValueError(f"Duplicate table id: {table.table_id}")
        table_ids.add(table.table_id)
        tables.append(table)

    if raw["table_sharing_allowed"] or raw["table_combining_allowed"]:
        raise ValueError("Table sharing and table combining must both remain false.")

    hold_raw = raw["reservation_hold_policy"]
    _require_keys(hold_raw, ["enabled", "hold_minutes"], "reservation hold policy")
    hold_policy = ReservationHoldPolicy(
        enabled=bool(hold_raw["enabled"]),
        hold_minutes=int(hold_raw["hold_minutes"]),
    )
    if hold_policy.hold_minutes < 0:
        raise ValueError("Hold minutes must be non-negative.")

    reset_raw = raw["default_reset_policy"]
    _require_keys(reset_raw, ["enabled", "default_reset_minutes"], "default reset policy")
    reset_policy = DefaultResetPolicy(
        enabled=bool(reset_raw["enabled"]),
        default_reset_minutes=int(reset_raw["default_reset_minutes"]),
    )
    if reset_policy.default_reset_minutes < 0:
        raise ValueError("Default reset minutes must be non-negative.")

    return RestaurantConfig(
        restaurant_name=str(raw["restaurant_name"]),
        simulation_start=simulation_start,
        simulation_end=simulation_end,
        queue_mode=queue_mode,
        queue_definitions=queue_definitions,
        tables=tables,
        table_sharing_allowed=bool(raw["table_sharing_allowed"]),
        table_combining_allowed=bool(raw["table_combining_allowed"]),
        reservation_hold_policy=hold_policy,
        default_reset_policy=reset_policy,
        optional_operational_defaults=dict(raw.get("optional_operational_defaults", {})),
    )


def _load_policy(raw: dict[str, Any], config: RestaurantConfig) -> PolicyBundle:
    _require_keys(raw, ["policy_name", "seating_policy", "service_policy"], "policy bundle")

    seating_raw = raw["seating_policy"]
    _require_keys(
        seating_raw,
        [
            "policy_name",
            "queue_rule",
            "selection_rule",
            "reservation_priority",
            "best_fit",
            "late_reservation_behavior",
            "no_show_handling",
        ],
        "seating policy",
    )
    seating = SeatingPolicy(
        policy_name=str(seating_raw["policy_name"]),
        queue_rule=str(seating_raw["queue_rule"]),
        selection_rule=str(seating_raw["selection_rule"]),
        reservation_priority=bool(seating_raw["reservation_priority"]),
        best_fit=bool(seating_raw["best_fit"]),
        late_reservation_behavior=str(seating_raw["late_reservation_behavior"]),
        no_show_handling=dict(seating_raw["no_show_handling"]),
    )

    service_raw = raw["service_policy"]
    _require_keys(
        service_raw,
        [
            "policy_name",
            "reset_enabled",
            "reset_time_by_capacity",
            "max_seating_actions_per_event_time",
            "max_cleaning_actions_per_event_time",
            "kitchen_load_mode",
            "dining_duration_multiplier_under_load",
            "abandonment_enabled",
        ],
        "service policy",
    )
    reset_time_by_capacity = {
        int(capacity): int(minutes)
        for capacity, minutes in service_raw["reset_time_by_capacity"].items()
    }
    service = ServicePolicy(
        policy_name=str(service_raw["policy_name"]),
        reset_enabled=bool(service_raw["reset_enabled"]),
        reset_time_by_capacity=reset_time_by_capacity,
        max_seating_actions_per_event_time=int(
            service_raw["max_seating_actions_per_event_time"]
        ),
        max_cleaning_actions_per_event_time=int(
            service_raw["max_cleaning_actions_per_event_time"]
        ),
        kitchen_load_mode=str(service_raw["kitchen_load_mode"]),
        dining_duration_multiplier_under_load=float(
            service_raw["dining_duration_multiplier_under_load"]
        ),
        abandonment_enabled=bool(service_raw["abandonment_enabled"]),
    )

    if service.max_seating_actions_per_event_time < 1:
        raise ValueError("max_seating_actions_per_event_time must be at least 1.")
    if service.max_cleaning_actions_per_event_time < 1:
        raise ValueError("max_cleaning_actions_per_event_time must be at least 1.")
    if service.dining_duration_multiplier_under_load <= 0:
        raise ValueError("dining_duration_multiplier_under_load must be positive.")

    for table in config.tables:
        if table.capacity not in reset_time_by_capacity:
            reset_time_by_capacity[table.capacity] = config.default_reset_policy.default_reset_minutes

    return PolicyBundle(
        policy_name=str(raw["policy_name"]),
        source_components=dict(raw.get("source_components", {})),
        seating_policy=seating,
        service_policy=service,
    )


def _validate_group_against_config(group: ArrivalGroup, config: RestaurantConfig) -> None:
    matching_queues = [queue for queue in config.queue_definitions if queue.matches(group.group_size)]
    if len(matching_queues) != 1:
        raise ValueError(
            f"Group {group.group_id} matches {len(matching_queues)} queues; expected exactly one."
        )
    if not any(table.capacity >= group.group_size for table in config.tables):
        raise ValueError(
            f"Group {group.group_id} of size {group.group_size} cannot fit any table."
        )
    if group.arrival_minute < config.simulation_start or group.arrival_minute > config.simulation_end:
        raise ValueError(f"Group {group.group_id} falls outside the simulation window.")


def _load_arrivals_from_text(text: str, config: RestaurantConfig) -> list[ArrivalGroup]:
    reader = csv.DictReader(StringIO(text))
    required_columns = [
        "group_id",
        "arrival_time",
        "group_size",
        "dining_duration",
        "group_type",
        "reservation_time",
        "grace_period",
        "no_show_flag",
        "abandon_tolerance",
        "notes",
    ]
    if reader.fieldnames is None:
        raise ValueError("Arrival CSV is missing a header row.")
    missing = [column for column in required_columns if column not in reader.fieldnames]
    if missing:
        raise ValueError(f"Arrival CSV missing required columns: {', '.join(missing)}")

    arrivals: list[ArrivalGroup] = []
    seen_ids: set[str] = set()
    previous_arrival: int | None = None
    for row in reader:
        group_id = str(row["group_id"]).strip()
        if not group_id:
            raise ValueError("Arrival rows must include a non-empty group_id.")
        if group_id in seen_ids:
            raise ValueError(f"Duplicate group_id found: {group_id}")
        seen_ids.add(group_id)

        group_type = GroupType(str(row["group_type"]).strip().lower())
        reservation_time_raw = str(row["reservation_time"]).strip()
        reservation_minute = parse_clock(reservation_time_raw) if reservation_time_raw else None
        if group_type == GroupType.RESERVATION and reservation_minute is None:
            raise ValueError(f"Reservation group {group_id} must include reservation_time.")
        if group_type == GroupType.WALKIN and reservation_minute is not None:
            raise ValueError(f"Walk-in group {group_id} must not include reservation_time.")

        arrival = ArrivalGroup(
            group_id=group_id,
            arrival_minute=parse_clock(str(row["arrival_time"]).strip()),
            group_size=int(row["group_size"]),
            dining_duration=int(row["dining_duration"]),
            group_type=group_type,
            reservation_minute=reservation_minute,
            grace_period=int(row["grace_period"]),
            no_show_flag=_parse_bool(row["no_show_flag"]),
            abandon_tolerance=int(row["abandon_tolerance"]),
            notes=str(row.get("notes", "")).strip(),
        )
        if arrival.group_size < 1:
            raise ValueError(f"Group {group_id} has invalid group size.")
        if arrival.dining_duration <= 0:
            raise ValueError(f"Group {group_id} has invalid dining duration.")
        if arrival.grace_period < 0 or arrival.abandon_tolerance < 0:
            raise ValueError(f"Group {group_id} has a negative timing field.")
        if previous_arrival is not None and arrival.arrival_minute < previous_arrival:
            raise ValueError("Arrival CSV must be sorted by arrival_time ascending.")
        previous_arrival = arrival.arrival_minute
        _validate_group_against_config(arrival, config)
        arrivals.append(arrival)
    return arrivals


def load_scenario_paths(
    config_path: str | Path,
    arrivals_path: str | Path,
    policy_path: str | Path,
    *,
    scenario_name: str | None = None,
) -> ScenarioDefinition:
    config_path = Path(config_path)
    arrivals_path = Path(arrivals_path)
    policy_path = Path(policy_path)
    config = _load_config(_load_json_file(config_path))
    policy = _load_policy(_load_json_file(policy_path), config)
    arrivals = _load_arrivals_from_text(arrivals_path.read_text(encoding="utf-8"), config)
    return ScenarioDefinition(
        scenario_name=scenario_name or config.restaurant_name,
        config=config,
        arrivals=arrivals,
        policy=policy,
        source_paths={
            "config": str(config_path),
            "arrivals": str(arrivals_path),
            "policy": str(policy_path),
        },
    )


def load_case_study(
    case_study: str,
    version: str,
    *,
    data_root: str | Path | None = None,
) -> ScenarioDefinition:
    resolved = _resolve_case_study_payloads(case_study, version, data_root=data_root)
    config = _load_config(json.loads(resolved["config_json"]))
    policy = _load_policy(json.loads(resolved["policy_json"]), config)
    arrivals = _load_arrivals_from_text(resolved["arrivals_csv"], config)
    return ScenarioDefinition(
        scenario_name=resolved["scenario_name"],
        config=config,
        arrivals=arrivals,
        policy=policy,
        source_paths=resolved["source_paths"],
    )


def load_custom_scenario(
    *,
    config_json: str,
    arrivals_csv: str,
    policy_json: str,
    scenario_name: str = "custom_scenario",
) -> ScenarioDefinition:
    config = _load_config(json.loads(config_json))
    policy = _load_policy(json.loads(policy_json), config)
    arrivals = _load_arrivals_from_text(arrivals_csv, config)
    return ScenarioDefinition(
        scenario_name=scenario_name,
        config=config,
        arrivals=arrivals,
        policy=policy,
        source_paths={
            "config": "inline-config",
            "arrivals": "inline-arrivals",
            "policy": "inline-policy",
        },
    )


def _normalize_case_study_version(version: str) -> str:
    normalized_version = version.upper()
    if normalized_version not in {"A", "B"}:
        raise ValueError(f"Unsupported case study version: {version!r}")
    return normalized_version


def _read_case_study_readme(case_dir: Path) -> tuple[str, str]:
    readme_path = case_dir / "README.md"
    if not readme_path.exists():
        return case_dir.name, ""
    lines = [line.strip() for line in readme_path.read_text(encoding="utf-8").splitlines()]
    non_empty = [line for line in lines if line]
    if not non_empty:
        return case_dir.name, ""
    title = non_empty[0].lstrip("# ").strip()
    summary = non_empty[1] if len(non_empty) > 1 else ""
    return title, summary


def _case_study_manifest_path(root: Path, case_study: str) -> Path:
    return root / "case_studies" / case_study / "case_study.json"


def _load_case_study_manifest(
    case_study: str,
    *,
    data_root: str | Path | None = None,
) -> tuple[dict[str, Any], Path]:
    root = resolve_data_root(data_root)
    manifest_path = _case_study_manifest_path(root, case_study)
    if not manifest_path.exists():
        raise FileNotFoundError(f"Missing case study manifest: {manifest_path}")
    raw = _load_json_file(manifest_path)
    _require_keys(raw, ["title", "summary", "focus_label", "versions"], "case study manifest")
    return raw, manifest_path


def _starter_version_from_manifest(raw: dict[str, Any]) -> CaseStudyStarterVersion:
    _require_keys(
        raw,
        [
            "label",
            "restaurant_layout_id",
            "queue_structure_id",
            "reservation_policy_id",
            "seating_policy_id",
            "service_policy_id",
            "arrival_scenario_id",
            "hold_minutes",
            "abandonment_enabled",
        ],
        "case study starter version",
    )
    restaurant_name_raw = str(raw.get("restaurant_name", "")).strip()
    return CaseStudyStarterVersion(
        label=str(raw["label"]),
        restaurant_layout_id=str(raw["restaurant_layout_id"]),
        queue_structure_id=str(raw["queue_structure_id"]),
        reservation_policy_id=str(raw["reservation_policy_id"]),
        seating_policy_id=str(raw["seating_policy_id"]),
        service_policy_id=str(raw["service_policy_id"]),
        arrival_scenario_id=str(raw["arrival_scenario_id"]),
        hold_minutes=int(raw["hold_minutes"]),
        abandonment_enabled=bool(raw["abandonment_enabled"]),
        restaurant_name=restaurant_name_raw or None,
        notes=str(raw.get("notes", "")).strip(),
    )


def _manifest_starter_version(manifest: dict[str, Any], version: str) -> CaseStudyStarterVersion:
    normalized_version = _normalize_case_study_version(version)
    versions_raw = manifest.get("versions", {})
    if not isinstance(versions_raw, dict) or normalized_version not in versions_raw:
        raise ValueError(f"Case study is missing version {normalized_version}.")
    starter_raw = versions_raw[normalized_version]
    if not isinstance(starter_raw, dict):
        raise ValueError(f"Case study version {normalized_version} must be an object.")
    return _starter_version_from_manifest(starter_raw)


def _strip_preset_metadata(payload: dict[str, Any]) -> dict[str, Any]:
    cleaned = copy.deepcopy(payload)
    for key in ["preset_id", "preset_family"]:
        cleaned.pop(key, None)
    return cleaned


def _logical_preset_id(path: Path, payload: dict[str, Any]) -> str:
    return str(payload.get("preset_id") or path.stem)


def _logical_preset_sort_key(path: Path, payload: dict[str, Any]) -> tuple[int, str, str]:
    family_rank = {"restaurant_layout": 0, "queue_structure": 1}
    family = str(payload.get("preset_family", "restaurant_layout"))
    title = str(payload.get("restaurant_name") or path.stem).strip().lower()
    return (
        family_rank.get(family, 99),
        title,
        _logical_preset_id(path, payload),
    )


def _restaurant_config_entries(
    root: Path,
    *,
    family: str | None = None,
) -> list[tuple[Path, dict[str, Any]]]:
    entries: list[tuple[Path, dict[str, Any]]] = []
    for path in sorted((root / "restaurant_configs").glob("*.json")):
        payload = _load_json_file(path)
        payload_family = str(payload.get("preset_family", "restaurant_layout"))
        if family is not None and payload_family != family:
            continue
        entries.append((path, payload))
    return sorted(
        entries,
        key=lambda item: _logical_preset_sort_key(item[0], item[1]),
    )


def _find_restaurant_config_preset(
    root: Path,
    preset_id: str,
    *,
    family: str,
) -> tuple[Path, dict[str, Any]]:
    for path, payload in _restaurant_config_entries(root, family=family):
        if _logical_preset_id(path, payload) == preset_id:
            return path, payload
    raise FileNotFoundError(f"Missing {family} preset: {preset_id}")


def _load_json_path(path: Path, *, label: str) -> tuple[Path, dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Missing {label}: {path}")
    return path, _load_json_file(path)


def _compose_case_study_notes(layout_note: str, starter_note: str) -> str:
    if starter_note and layout_note and starter_note != layout_note:
        return f"{layout_note} Case-study note: {starter_note}"
    return starter_note or layout_note


def _service_policy_name(base_name: str, abandonment_enabled: bool) -> str:
    if not abandonment_enabled or "abandonment" in base_name.lower():
        return base_name
    return f"{base_name} with Abandonment"


def _compose_case_study_config(
    layout_payload: dict[str, Any],
    queue_payload: dict[str, Any],
    reservation_payload: dict[str, Any],
    starter: CaseStudyStarterVersion,
) -> dict[str, Any]:
    config_payload = _strip_preset_metadata(layout_payload)
    queue_config = _strip_preset_metadata(queue_payload)

    config_payload["restaurant_name"] = starter.restaurant_name or str(
        config_payload["restaurant_name"]
    )
    config_payload["queue_mode"] = queue_config["queue_mode"]
    config_payload["queue_definitions"] = copy.deepcopy(queue_config["queue_definitions"])

    hold_enabled = bool(reservation_payload.get("hold_tables_for_reservations"))
    config_payload["reservation_hold_policy"] = {
        "enabled": hold_enabled,
        "hold_minutes": starter.hold_minutes if hold_enabled else 0,
    }

    defaults = dict(config_payload.get("optional_operational_defaults", {}))
    defaults["notes"] = _compose_case_study_notes(
        str(defaults.get("notes", "")).strip(),
        starter.notes,
    )
    config_payload["optional_operational_defaults"] = defaults
    return config_payload


def _compose_case_study_policy(
    seating_payload: dict[str, Any],
    service_payload: dict[str, Any],
    starter: CaseStudyStarterVersion,
) -> dict[str, Any]:
    seating_policy = copy.deepcopy(seating_payload)
    service_policy = copy.deepcopy(service_payload)
    service_policy["policy_name"] = _service_policy_name(
        str(service_policy["policy_name"]),
        starter.abandonment_enabled,
    )
    service_policy["abandonment_enabled"] = starter.abandonment_enabled

    return {
        "policy_name": f'{seating_policy["policy_name"]} + {service_policy["policy_name"]}',
        "source_components": {
            "restaurant_layout": starter.restaurant_layout_id,
            "queue_structure": starter.queue_structure_id,
            "reservation": starter.reservation_policy_id,
            "seating": starter.seating_policy_id,
            "service": starter.service_policy_id,
            "arrivals": starter.arrival_scenario_id,
        },
        "seating_policy": seating_policy,
        "service_policy": service_policy,
    }


def _resolve_case_study_payloads(
    case_study: str,
    version: str,
    *,
    data_root: str | Path | None = None,
) -> dict[str, Any]:
    root = resolve_data_root(data_root)
    normalized_version = _normalize_case_study_version(version)
    manifest, manifest_path = _load_case_study_manifest(case_study, data_root=root)
    starter = _manifest_starter_version(manifest, normalized_version)

    layout_path, layout_payload = _find_restaurant_config_preset(
        root,
        starter.restaurant_layout_id,
        family="restaurant_layout",
    )
    queue_path, queue_payload = _find_restaurant_config_preset(
        root,
        starter.queue_structure_id,
        family="queue_structure",
    )
    reservation_path, reservation_payload = _load_json_path(
        root / "policies" / f"{starter.reservation_policy_id}.json",
        label="reservation policy preset",
    )
    seating_path, seating_payload = _load_json_path(
        root / "policies" / f"{starter.seating_policy_id}.json",
        label="seating policy preset",
    )
    service_path, service_payload = _load_json_path(
        root / "policies" / f"{starter.service_policy_id}.json",
        label="service policy preset",
    )
    arrivals_path = root / "arrival_scenarios" / f"{starter.arrival_scenario_id}.csv"
    if not arrivals_path.exists():
        raise FileNotFoundError(f"Missing arrival preset: {arrivals_path}")

    config_payload = _compose_case_study_config(
        layout_payload,
        queue_payload,
        reservation_payload,
        starter,
    )
    policy_payload = _compose_case_study_policy(seating_payload, service_payload, starter)
    arrivals_csv = arrivals_path.read_text(encoding="utf-8")

    return {
        "scenario_name": f"{case_study}_{normalized_version}",
        "config_json": json.dumps(config_payload, indent=2),
        "policy_json": json.dumps(policy_payload, indent=2),
        "arrivals_csv": arrivals_csv,
        "source_paths": {
            "case_study": str(manifest_path),
            "config": " | ".join(
                [
                    str(manifest_path),
                    str(layout_path),
                    str(queue_path),
                    str(reservation_path),
                ]
            ),
            "arrivals": str(arrivals_path),
            "policy": " | ".join(
                [
                    str(manifest_path),
                    str(seating_path),
                    str(service_path),
                ]
            ),
        },
    }


def discover_case_studies(*, data_root: str | Path | None = None) -> list[CaseStudyMetadata]:
    root = resolve_data_root(data_root)
    case_root = root / "case_studies"
    case_studies: list[CaseStudyMetadata] = []
    for case_dir in sorted(path for path in case_root.iterdir() if path.is_dir()):
        manifest, _ = _load_case_study_manifest(case_dir.name, data_root=root)
        readme_title, readme_summary = _read_case_study_readme(case_dir)
        versions_raw = manifest.get("versions", {})
        versions = sorted(
            version_key
            for version_key in versions_raw
            if isinstance(version_key, str) and version_key in {"A", "B"}
        )
        starter_versions = {
            version_key: _starter_version_from_manifest(starter_raw)
            for version_key, starter_raw in versions_raw.items()
            if isinstance(version_key, str) and version_key in {"A", "B"} and isinstance(starter_raw, dict)
        }
        case_studies.append(
            CaseStudyMetadata(
                case_study=case_dir.name,
                title=str(manifest.get("title") or readme_title or case_dir.name),
                summary=str(manifest.get("summary") or readme_summary),
                versions=versions,
                path=str(case_dir),
                focus_label=str(manifest.get("focus_label", "")).strip(),
                starter_versions=starter_versions,
            )
        )
    return case_studies


def load_schema_documents(*, data_root: str | Path | None = None) -> dict[str, str]:
    root = resolve_data_root(data_root)
    schema_root = root / "schemas"
    return {
        schema_path.stem: schema_path.read_text(encoding="utf-8")
        for schema_path in sorted(schema_root.glob("*.md"))
    }


def _humanize_stem(stem: str) -> str:
    normalized = stem.removesuffix("_base")
    return " ".join(part.capitalize() for part in normalized.split("_"))


def _summarize_arrival_groups(raw: str) -> dict[str, int]:
    row_count = 0
    max_group_size = 0
    reservation_groups = 0
    walkin_groups = 0
    for row in csv.DictReader(StringIO(raw)):
        row_count += 1
        group_size = int(row.get("group_size") or 0)
        group_type = str(row.get("group_type", "")).strip().lower()
        max_group_size = max(max_group_size, group_size)
        if group_type == GroupType.RESERVATION.value:
            reservation_groups += 1
        elif group_type == GroupType.WALKIN.value:
            walkin_groups += 1
    return {
        "row_count": row_count,
        "max_group_size": max_group_size,
        "reservation_groups": reservation_groups,
        "walkin_groups": walkin_groups,
    }


def _json_preset_record(
    path: Path,
    *,
    payload: dict[str, Any] | None = None,
    title_key: str,
    title_resolver: Callable[[dict[str, Any]], str] | None = None,
    description_resolver: Callable[[dict[str, Any]], str] | None = None,
) -> dict[str, object]:
    raw = path.read_text(encoding="utf-8")
    data = payload if payload is not None else json.loads(raw)
    title = (
        title_resolver(data).strip()
        if title_resolver is not None
        else str(data.get(title_key) or _humanize_stem(path.stem))
    )
    description = ""
    if description_resolver is not None:
        description = description_resolver(data).strip()
    return {
        "id": _logical_preset_id(path, data),
        "title": title,
        "description": description,
        "source_path": str(path),
        "raw": raw,
        "data": data,
    }


def _csv_preset_record(path: Path) -> dict[str, object]:
    raw = path.read_text(encoding="utf-8")
    summary = _summarize_arrival_groups(raw)
    row_count = int(summary["row_count"])
    max_group_size = int(summary["max_group_size"])
    reservation_groups = int(summary["reservation_groups"])
    description_parts = [f"{row_count} arrival groups"]
    if max_group_size > 0:
        description_parts.append(f"up to {max_group_size} guests")
    if reservation_groups > 0:
        reservation_label = "reservation" if reservation_groups == 1 else "reservations"
        description_parts.append(f"{reservation_groups} {reservation_label}")
    else:
        description_parts.append("walk-in only")
    return {
        "id": path.stem,
        "title": _humanize_stem(path.stem),
        "description": ", ".join(description_parts),
        "source_path": str(path),
        "raw": raw,
        **summary,
    }


def load_builder_presets(*, data_root: str | Path | None = None) -> dict[str, list[dict[str, object]]]:
    root = resolve_data_root(data_root)
    policy_root = root / "policies"
    arrivals_root = root / "arrival_scenarios"
    restaurant_layouts = _restaurant_config_entries(root, family="restaurant_layout")
    queue_structures = _restaurant_config_entries(root, family="queue_structure")

    def config_description(payload: dict[str, Any]) -> str:
        defaults = payload.get("optional_operational_defaults", {})
        notes = defaults.get("notes", "") if isinstance(defaults, dict) else ""
        return str(notes)

    def reservation_title(payload: dict[str, Any]) -> str:
        if bool(payload.get("hold_tables_for_reservations")):
            return "Reservation Hold Enabled"
        return "No Reservation Hold"

    def reservation_description(payload: dict[str, Any]) -> str:
        if bool(payload.get("hold_tables_for_reservations")):
            hold_minutes = int(payload.get("default_hold_minutes", 0))
            return f"Holds booked tables for up to {hold_minutes} minutes before release."
        return "Does not reserve tables before the booked party arrives."

    return {
        "restaurant_layouts": [
            _json_preset_record(
                path,
                payload=payload,
                title_key="restaurant_name",
                description_resolver=config_description,
            )
            for path, payload in restaurant_layouts
        ],
        "queue_structures": [
            _json_preset_record(
                path,
                payload=payload,
                title_key="restaurant_name",
                description_resolver=config_description,
            )
            for path, payload in queue_structures
        ],
        "seating_policies": [
            _json_preset_record(path, title_key="policy_name")
            for path in sorted(policy_root.glob("seating_*.json"))
        ],
        "service_policies": [
            _json_preset_record(path, title_key="policy_name")
            for path in sorted(policy_root.glob("service_*.json"))
        ],
        "reservation_policies": [
            _json_preset_record(
                path,
                title_key="policy_name",
                title_resolver=reservation_title,
                description_resolver=reservation_description,
            )
            for path in sorted(policy_root.glob("reservation_*.json"))
        ],
        "arrival_scenarios": [
            _csv_preset_record(path)
            for path in sorted(arrivals_root.glob("*.csv"))
        ],
    }


def case_study_input_paths(
    case_study: str,
    version: str,
    *,
    data_root: str | Path | None = None,
) -> tuple[str, str, str]:
    resolved = _resolve_case_study_payloads(case_study, version, data_root=data_root)
    return (
        str(resolved["source_paths"]["config"]),
        str(resolved["source_paths"]["arrivals"]),
        str(resolved["source_paths"]["policy"]),
    )


def load_case_study_inputs(
    case_study: str,
    version: str,
    *,
    data_root: str | Path | None = None,
) -> dict[str, str]:
    resolved = _resolve_case_study_payloads(case_study, version, data_root=data_root)
    return {
        "config_json": resolved["config_json"],
        "arrivals_csv": resolved["arrivals_csv"],
        "policy_json": resolved["policy_json"],
    }
