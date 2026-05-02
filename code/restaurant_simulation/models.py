from __future__ import annotations

# What it does:
#   Defines the typed data contracts shared by loading, simulation, API, and dashboard layers.
# Inputs:
#   Parsed configuration, policy, event, and metrics values.
# Outputs:
#   Dataclass instances and serializable dictionaries.

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any

from .time_utils import format_clock


# What it does:
#   Names the supported queue routing modes.
# Inputs:
#   String values parsed from restaurant configuration.
# Outputs:
#   Enum values used by loaders and simulator queue selection.

class QueueMode(str, Enum):
    SINGLE = "single"
    SIZE_BASED = "size_based"


# What it does:
#   Names whether a party is a walk-in or reservation.
# Inputs:
#   String values parsed from arrival CSV rows.
# Outputs:
#   Enum values used by seating and metrics logic.

class GroupType(str, Enum):
    WALKIN = "walkin"
    RESERVATION = "reservation"


# What it does:
#   Names the event kinds handled by the discrete-event loop.
# Inputs:
#   Scheduled simulator actions.
# Outputs:
#   Enum values used for priorities, logs, and dispatch.

class EventType(str, Enum):
    ARRIVAL = "arrival"
    DINING_COMPLETE = "dining_complete"
    TABLE_READY = "table_ready"
    ABANDONMENT_CHECK = "abandonment_check"
    NO_SHOW_RELEASE = "no_show_release"
    CLEANING_DISPATCH = "cleaning_dispatch"
    SEATING_DISPATCH = "seating_dispatch"


# What it does:
#   Defines the QueueDefinition data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

@dataclass(frozen=True)
class QueueDefinition:
    queue_id: str
    min_size: int
    max_size: int

    # What it does:
    #   Performs the matches step.
    # Inputs:
    #   The arguments declared by the function signature.
    # Outputs:
    #   The return value or state mutation described by the function body.

    def matches(self, group_size: int) -> bool:
        return self.min_size <= group_size <= self.max_size


# What it does:
#   Defines the TableSpec data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

@dataclass(frozen=True)
class TableSpec:
    table_id: str
    capacity: int


# What it does:
#   Defines the ReservationHoldPolicy data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

@dataclass(frozen=True)
class ReservationHoldPolicy:
    enabled: bool
    hold_minutes: int


# What it does:
#   Defines the DefaultResetPolicy data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

@dataclass(frozen=True)
class DefaultResetPolicy:
    enabled: bool
    default_reset_minutes: int


# What it does:
#   Defines the RestaurantConfig data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

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


# What it does:
#   Defines the SeatingPolicy data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

@dataclass(frozen=True)
class SeatingPolicy:
    policy_name: str
    queue_rule: str
    selection_rule: str
    reservation_priority: bool
    best_fit: bool
    late_reservation_behavior: str
    no_show_handling: dict[str, Any]


# What it does:
#   Defines the ServicePolicy data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

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


# What it does:
#   Defines the PolicyBundle data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

@dataclass(frozen=True)
class PolicyBundle:
    policy_name: str
    source_components: dict[str, str]
    seating_policy: SeatingPolicy
    service_policy: ServicePolicy


# What it does:
#   Defines the ArrivalGroup data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

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


# What it does:
#   Defines the ScenarioDefinition data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

@dataclass(frozen=True)
class ScenarioDefinition:
    scenario_name: str
    config: RestaurantConfig
    arrivals: list[ArrivalGroup]
    policy: PolicyBundle
    source_paths: dict[str, str]


# What it does:
#   Defines the GroupState data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

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

    # What it does:
    #   Performs the wait time step.
    # Inputs:
    #   The arguments declared by the function signature.
    # Outputs:
    #   The return value or state mutation described by the function body.

    def wait_time(self) -> int | None:
        if self.seated_minute is None:
            return None
        return self.seated_minute - self.spec.arrival_minute

    # What it does:
    #   Performs the reservation delay step.
    # Inputs:
    #   The arguments declared by the function signature.
    # Outputs:
    #   The return value or state mutation described by the function body.

    def reservation_delay(self) -> int | None:
        if self.spec.group_type != GroupType.RESERVATION:
            return None
        if self.spec.reservation_minute is None or self.seated_minute is None:
            return None
        return max(0, self.seated_minute - self.spec.reservation_minute)


# What it does:
#   Defines the TableState data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

@dataclass
class TableState:
    spec: TableSpec
    status: str = "available"
    current_group_id: str | None = None
    occupied_since: int | None = None
    cleaning_started_minute: int | None = None


# What it does:
#   Defines the ScheduledEvent data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

@dataclass(order=True)
class ScheduledEvent:
    minute: int
    priority: int
    counter: int
    event_type: EventType = field(compare=False)
    payload: dict[str, Any] = field(default_factory=dict, compare=False)


# What it does:
#   Defines the EventLogEntry data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

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

    # What it does:
    #   Performs the build step.
    # Inputs:
    #   The arguments declared by the function signature.
    # Outputs:
    #   The return value or state mutation described by the function body.

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


# What it does:
#   Defines the QueueSnapshot data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

@dataclass(frozen=True)
class QueueSnapshot:
    minute: int
    clock: str
    total_waiting: int
    per_queue: dict[str, int]


# What it does:
#   Defines the TableSegment data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

@dataclass(frozen=True)
class TableSegment:
    table_id: str
    status: str
    start_minute: int
    end_minute: int
    start_clock: str
    end_clock: str
    group_id: str | None = None

    # What it does:
    #   Performs the build step.
    # Inputs:
    #   The arguments declared by the function signature.
    # Outputs:
    #   The return value or state mutation described by the function body.

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


# What it does:
#   Defines the GroupOutcome data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

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


# What it does:
#   Defines the MetricsRecord data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

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

    # What it does:
    #   Performs the to dict step.
    # Inputs:
    #   The arguments declared by the function signature.
    # Outputs:
    #   The return value or state mutation described by the function body.

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# What it does:
#   Defines the CaseStudyStarterVersion data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

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


# What it does:
#   Defines the CaseStudyMetadata data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

@dataclass(frozen=True)
class CaseStudyMetadata:
    case_study: str
    title: str
    summary: str
    versions: list[str]
    path: str
    focus_label: str = ""
    starter_versions: dict[str, CaseStudyStarterVersion] = field(default_factory=dict)


# What it does:
#   Defines the ScenarioResult data shape used by the simulation workflow.
# Inputs:
#   Validated values produced by loaders or simulator state transitions.
# Outputs:
#   A typed record that can be passed between modules or serialized.

@dataclass(frozen=True)
class ScenarioResult:
    scenario_name: str
    metrics: MetricsRecord
    event_log: list[EventLogEntry]
    queue_snapshots: list[QueueSnapshot]
    table_segments: list[TableSegment]
    group_outcomes: list[GroupOutcome]
    source_paths: dict[str, str]

    # What it does:
    #   Performs the to dict step.
    # Inputs:
    #   The arguments declared by the function signature.
    # Outputs:
    #   The return value or state mutation described by the function body.

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
