from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any

from .time_utils import format_clock


class QueueMode(str, Enum):
    SINGLE = "single"
    SIZE_BASED = "size_based"


class GroupType(str, Enum):
    WALKIN = "walkin"
    RESERVATION = "reservation"


class EventType(str, Enum):
    ARRIVAL = "arrival"
    DINING_COMPLETE = "dining_complete"
    TABLE_READY = "table_ready"
    ABANDONMENT_CHECK = "abandonment_check"
    NO_SHOW_RELEASE = "no_show_release"
    CLEANING_DISPATCH = "cleaning_dispatch"
    SEATING_DISPATCH = "seating_dispatch"


@dataclass(frozen=True)
class QueueDefinition:
    queue_id: str
    min_size: int
    max_size: int

    def matches(self, group_size: int) -> bool:
        return self.min_size <= group_size <= self.max_size


@dataclass(frozen=True)
class TableSpec:
    table_id: str
    capacity: int
    zone: str


@dataclass(frozen=True)
class ReservationHoldPolicy:
    enabled: bool
    hold_minutes: int


@dataclass(frozen=True)
class DefaultResetPolicy:
    enabled: bool
    default_reset_minutes: int


@dataclass(frozen=True)
class RestaurantConfig:
    restaurant_name: str
    simulation_start: int
    simulation_end: int
    queue_mode: QueueMode
    queue_definitions: list[QueueDefinition]
    tables: list[TableSpec]
    table_sharing_allowed: bool
    table_combining_allowed: bool
    reservation_hold_policy: ReservationHoldPolicy
    default_reset_policy: DefaultResetPolicy
    optional_operational_defaults: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SeatingPolicy:
    policy_name: str
    queue_rule: str
    selection_rule: str
    reservation_priority: bool
    best_fit: bool
    late_reservation_behavior: str
    no_show_handling: dict[str, Any]


@dataclass(frozen=True)
class ServicePolicy:
    policy_name: str
    reset_enabled: bool
    reset_time_by_capacity: dict[int, int]
    max_seating_actions_per_event_time: int
    max_cleaning_actions_per_event_time: int
    kitchen_load_mode: str
    dining_duration_multiplier_under_load: float
    abandonment_enabled: bool


@dataclass(frozen=True)
class PolicyBundle:
    policy_name: str
    source_components: dict[str, str]
    seating_policy: SeatingPolicy
    service_policy: ServicePolicy


@dataclass(frozen=True)
class ArrivalGroup:
    group_id: str
    arrival_minute: int
    group_size: int
    dining_duration: int
    group_type: GroupType
    reservation_minute: int | None
    grace_period: int
    no_show_flag: bool
    abandon_tolerance: int
    notes: str


@dataclass(frozen=True)
class ScenarioDefinition:
    scenario_name: str
    config: RestaurantConfig
    arrivals: list[ArrivalGroup]
    policy: PolicyBundle
    source_paths: dict[str, str]


@dataclass
class GroupState:
    spec: ArrivalGroup
    queue_id: str
    effective_dining_duration: int
    status: str = "pending_arrival"
    queue_enter_minute: int | None = None
    seated_minute: int | None = None
    completed_minute: int | None = None
    abandoned_minute: int | None = None
    no_show_recorded_minute: int | None = None
    assigned_table_id: str | None = None

    def wait_time(self) -> int | None:
        if self.seated_minute is None:
            return None
        return self.seated_minute - self.spec.arrival_minute

    def reservation_delay(self) -> int | None:
        if self.spec.group_type != GroupType.RESERVATION:
            return None
        if self.spec.reservation_minute is None or self.seated_minute is None:
            return None
        return max(0, self.seated_minute - self.spec.reservation_minute)


@dataclass
class TableState:
    spec: TableSpec
    status: str = "available"
    current_group_id: str | None = None
    occupied_since: int | None = None
    cleaning_started_minute: int | None = None


@dataclass(order=True)
class ScheduledEvent:
    minute: int
    priority: int
    counter: int
    event_type: EventType = field(compare=False)
    payload: dict[str, Any] = field(default_factory=dict, compare=False)


@dataclass(frozen=True)
class EventLogEntry:
    minute: int
    clock: str
    event_type: str
    message: str
    group_id: str | None = None
    table_id: str | None = None
    queue_id: str | None = None
    details: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def build(
        cls,
        minute: int,
        event_type: str,
        message: str,
        *,
        group_id: str | None = None,
        table_id: str | None = None,
        queue_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> "EventLogEntry":
        return cls(
            minute=minute,
            clock=format_clock(minute),
            event_type=event_type,
            message=message,
            group_id=group_id,
            table_id=table_id,
            queue_id=queue_id,
            details=details or {},
        )


@dataclass(frozen=True)
class QueueSnapshot:
    minute: int
    clock: str
    total_waiting: int
    per_queue: dict[str, int]


@dataclass(frozen=True)
class TableSegment:
    table_id: str
    status: str
    start_minute: int
    end_minute: int
    start_clock: str
    end_clock: str
    group_id: str | None = None

    @classmethod
    def build(
        cls,
        *,
        table_id: str,
        status: str,
        start_minute: int,
        end_minute: int,
        group_id: str | None = None,
    ) -> "TableSegment":
        return cls(
            table_id=table_id,
            status=status,
            start_minute=start_minute,
            end_minute=end_minute,
            start_clock=format_clock(start_minute),
            end_clock=format_clock(end_minute),
            group_id=group_id,
        )


@dataclass(frozen=True)
class GroupOutcome:
    group_id: str
    group_type: str
    group_size: int
    arrival_time: str
    reservation_time: str | None
    status: str
    assigned_table_id: str | None
    wait_time: int | None
    dining_duration: int
    effective_dining_duration: int
    seated_time: str | None
    completed_time: str | None
    abandoned_time: str | None
    no_show_recorded_time: str | None
    reservation_delay: int | None
    notes: str


@dataclass(frozen=True)
class MetricsRecord:
    scenario_name: str
    average_wait_time: float
    max_wait_time: float
    p90_wait_time: float
    max_queue_length: int
    groups_served: int
    groups_abandoned: int
    service_level_within_15_min: float
    service_level_within_30_min: float
    table_utilization_overall: float
    reservation_fulfillment_rate: float
    average_reservation_delay: float
    average_table_fit_efficiency: float
    notes: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class CaseStudyStarterVersion:
    label: str
    restaurant_layout_id: str
    queue_structure_id: str
    reservation_policy_id: str
    seating_policy_id: str
    service_policy_id: str
    arrival_scenario_id: str
    hold_minutes: int
    abandonment_enabled: bool
    restaurant_name: str | None = None
    notes: str = ""


@dataclass(frozen=True)
class CaseStudyMetadata:
    case_study: str
    title: str
    summary: str
    versions: list[str]
    path: str
    focus_label: str = ""
    starter_versions: dict[str, CaseStudyStarterVersion] = field(default_factory=dict)


@dataclass(frozen=True)
class ScenarioResult:
    scenario_name: str
    metrics: MetricsRecord
    event_log: list[EventLogEntry]
    queue_snapshots: list[QueueSnapshot]
    table_segments: list[TableSegment]
    group_outcomes: list[GroupOutcome]
    source_paths: dict[str, str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "scenario_name": self.scenario_name,
            "metrics": self.metrics.to_dict(),
            "event_log": [asdict(entry) for entry in self.event_log],
            "queue_snapshots": [asdict(snapshot) for snapshot in self.queue_snapshots],
            "table_segments": [asdict(segment) for segment in self.table_segments],
            "group_outcomes": [asdict(outcome) for outcome in self.group_outcomes],
            "source_paths": dict(self.source_paths),
        }
