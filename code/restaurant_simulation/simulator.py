from __future__ import annotations

import heapq
import math
from itertools import count

from .models import (
    ArrivalGroup,
    EventLogEntry,
    EventType,
    GroupOutcome,
    GroupState,
    GroupType,
    MetricsRecord,
    QueueSnapshot,
    ScenarioDefinition,
    ScenarioResult,
    ScheduledEvent,
    TableSegment,
    TableState,
)
from .time_utils import clamp_interval, format_clock, percentile


EVENT_PRIORITIES: dict[EventType, int] = {
    EventType.NO_SHOW_RELEASE: 10,
    EventType.DINING_COMPLETE: 20,
    EventType.TABLE_READY: 30,
    EventType.ARRIVAL: 40,
    EventType.CLEANING_DISPATCH: 50,
    EventType.SEATING_DISPATCH: 60,
    EventType.ABANDONMENT_CHECK: 70,
}


class RestaurantSimulator:
    def __init__(self, scenario: ScenarioDefinition):
        self.scenario = scenario
        self.config = scenario.config
        self.policy = scenario.policy
        self._event_counter = count()
        self._events: list[ScheduledEvent] = []
        self._groups: dict[str, GroupState] = {}
        self._tables: dict[str, TableState] = {
            table.table_id: TableState(spec=table) for table in self.config.tables
        }
        self._queues: dict[str, list[str]] = {
            queue.queue_id: [] for queue in self.config.queue_definitions
        }
        self._event_log: list[EventLogEntry] = []
        self._queue_snapshots: list[QueueSnapshot] = []
        self._table_segments: list[TableSegment] = []
        self._dirty_tables: list[str] = []
        self._scheduled_cleaning_minutes: set[int] = set()
        self._scheduled_seating_minutes: set[int] = set()
        self._max_queue_length = 0
        self._initialise_runtime_state()

    def run(self) -> ScenarioResult:
        self._record_queue_snapshot(self.config.simulation_start)

        while self._events:
            minute = self._events[0].minute
            current_events: list[ScheduledEvent] = []
            while self._events and self._events[0].minute == minute:
                current_events.append(heapq.heappop(self._events))

            due_abandonments: list[str] = []
            for event in sorted(current_events):
                if event.event_type == EventType.ABANDONMENT_CHECK:
                    due_abandonments.append(str(event.payload["group_id"]))
                    continue
                self._handle_event(event)

            self._start_cleaning(minute)
            seating_actions = self._seat_groups(minute)

            for group_id in due_abandonments:
                self._handle_abandonment(minute, group_id)

            if self._dirty_tables:
                self._schedule_dispatch(EventType.CLEANING_DISPATCH, minute + 1)

            if seating_actions >= self.policy.service_policy.max_seating_actions_per_event_time:
                next_assignment = self._pick_next_assignment(minute)
                if next_assignment is not None:
                    self._schedule_dispatch(EventType.SEATING_DISPATCH, minute + 1)

            self._record_queue_snapshot(minute)

        return ScenarioResult(
            scenario_name=self.scenario.scenario_name,
            metrics=self._build_metrics(),
            event_log=self._event_log,
            queue_snapshots=self._queue_snapshots,
            table_segments=sorted(
                self._table_segments,
                key=lambda segment: (segment.start_minute, segment.table_id, segment.status),
            ),
            group_outcomes=self._build_group_outcomes(),
            source_paths=self.scenario.source_paths,
        )

    def _initialise_runtime_state(self) -> None:
        for arrival in self.scenario.arrivals:
            queue_id = self._queue_id_for_group(arrival)
            effective_duration = max(
                1,
                math.ceil(
                    arrival.dining_duration
                    * self.policy.service_policy.dining_duration_multiplier_under_load
                ),
            )
            state = GroupState(
                spec=arrival,
                queue_id=queue_id,
                effective_dining_duration=effective_duration,
            )
            self._groups[arrival.group_id] = state
            if arrival.no_show_flag:
                if arrival.group_type != GroupType.RESERVATION or arrival.reservation_minute is None:
                    raise ValueError(f"No-show group {arrival.group_id} must be a reservation.")
                self._schedule(
                    minute=arrival.reservation_minute + self._hold_window(arrival),
                    event_type=EventType.NO_SHOW_RELEASE,
                    payload={"group_id": arrival.group_id},
                )
                state.status = "pending_arrival"
            else:
                self._schedule(
                    minute=arrival.arrival_minute,
                    event_type=EventType.ARRIVAL,
                    payload={"group_id": arrival.group_id},
                )

    def _schedule(self, *, minute: int, event_type: EventType, payload: dict[str, object]) -> None:
        heapq.heappush(
            self._events,
            ScheduledEvent(
                minute=minute,
                priority=EVENT_PRIORITIES[event_type],
                counter=next(self._event_counter),
                event_type=event_type,
                payload=dict(payload),
            ),
        )

    def _schedule_dispatch(self, event_type: EventType, minute: int) -> None:
        registry = (
            self._scheduled_cleaning_minutes
            if event_type == EventType.CLEANING_DISPATCH
            else self._scheduled_seating_minutes
        )
        if minute in registry:
            return
        registry.add(minute)
        self._schedule(minute=minute, event_type=event_type, payload={})

    def _handle_event(self, event: ScheduledEvent) -> None:
        if event.event_type == EventType.ARRIVAL:
            self._handle_arrival(event.minute, str(event.payload["group_id"]))
        elif event.event_type == EventType.NO_SHOW_RELEASE:
            self._handle_no_show_release(event.minute, str(event.payload["group_id"]))
        elif event.event_type == EventType.DINING_COMPLETE:
            self._handle_dining_complete(
                event.minute,
                str(event.payload["group_id"]),
                str(event.payload["table_id"]),
            )
        elif event.event_type == EventType.TABLE_READY:
            self._handle_table_ready(event.minute, str(event.payload["table_id"]))
        elif event.event_type == EventType.CLEANING_DISPATCH:
            self._scheduled_cleaning_minutes.discard(event.minute)
        elif event.event_type == EventType.SEATING_DISPATCH:
            self._scheduled_seating_minutes.discard(event.minute)

    def _handle_arrival(self, minute: int, group_id: str) -> None:
        group = self._groups[group_id]
        if group.status != "pending_arrival":
            return
        group.status = "waiting"
        group.queue_enter_minute = minute
        self._queues[group.queue_id].append(group_id)
        self._update_max_queue_length()
        self._log(
            minute,
            "arrival",
            f"Group {group_id} joined queue {group.queue_id}.",
            group_id=group_id,
            queue_id=group.queue_id,
            details={
                "group_size": group.spec.group_size,
                "group_type": group.spec.group_type.value,
            },
        )
        if self.policy.service_policy.abandonment_enabled:
            self._schedule(
                minute=minute + group.spec.abandon_tolerance,
                event_type=EventType.ABANDONMENT_CHECK,
                payload={"group_id": group_id},
            )

    def _handle_no_show_release(self, minute: int, group_id: str) -> None:
        group = self._groups[group_id]
        if group.status != "pending_arrival" or not group.spec.no_show_flag:
            return
        group.status = "no_show"
        group.no_show_recorded_minute = minute
        self._log(
            minute,
            "no_show",
            f"Reservation {group_id} was recorded as a no-show.",
            group_id=group_id,
        )

    def _handle_dining_complete(self, minute: int, group_id: str, table_id: str) -> None:
        group = self._groups[group_id]
        table = self._tables[table_id]
        if table.current_group_id != group_id or table.occupied_since is None:
            return
        group.status = "completed"
        group.completed_minute = minute
        self._table_segments.append(
            TableSegment.build(
                table_id=table_id,
                status="occupied",
                start_minute=table.occupied_since,
                end_minute=minute,
                group_id=group_id,
            )
        )
        table.current_group_id = None
        table.occupied_since = None

        if self.policy.service_policy.reset_enabled:
            table.status = "dirty"
            self._dirty_tables.append(table_id)
            self._log(
                minute,
                "dining_complete",
                f"Group {group_id} completed service; table {table_id} moved to reset backlog.",
                group_id=group_id,
                table_id=table_id,
            )
        else:
            table.status = "available"
            self._log(
                minute,
                "dining_complete",
                f"Group {group_id} completed service; table {table_id} is available immediately.",
                group_id=group_id,
                table_id=table_id,
            )

    def _handle_table_ready(self, minute: int, table_id: str) -> None:
        table = self._tables[table_id]
        table.status = "available"
        table.cleaning_started_minute = None
        self._log(
            minute,
            "table_ready",
            f"Table {table_id} is clean and available.",
            table_id=table_id,
        )

    def _handle_abandonment(self, minute: int, group_id: str) -> None:
        if not self.policy.service_policy.abandonment_enabled:
            return
        group = self._groups[group_id]
        if group.status != "waiting":
            return
        waited = minute - group.spec.arrival_minute
        if waited < group.spec.abandon_tolerance:
            return
        self._remove_from_queue(group.queue_id, group_id)
        group.status = "abandoned"
        group.abandoned_minute = minute
        self._log(
            minute,
            "abandoned",
            f"Group {group_id} abandoned queue {group.queue_id} after waiting {waited} minutes.",
            group_id=group_id,
            queue_id=group.queue_id,
            details={"waited": waited},
        )

    def _start_cleaning(self, minute: int) -> None:
        actions = 0
        limit = self.policy.service_policy.max_cleaning_actions_per_event_time
        while self._dirty_tables and actions < limit:
            table_id = self._dirty_tables.pop(0)
            table = self._tables[table_id]
            if table.status != "dirty":
                continue
            reset_minutes = self.policy.service_policy.reset_time_by_capacity.get(
                table.spec.capacity,
                self.config.default_reset_policy.default_reset_minutes,
            )
            table.status = "cleaning"
            table.cleaning_started_minute = minute
            ready_minute = minute + reset_minutes
            self._table_segments.append(
                TableSegment.build(
                    table_id=table_id,
                    status="cleaning",
                    start_minute=minute,
                    end_minute=ready_minute,
                )
            )
            self._schedule(
                minute=ready_minute,
                event_type=EventType.TABLE_READY,
                payload={"table_id": table_id},
            )
            actions += 1
            self._log(
                minute,
                "cleaning_started",
                f"Reset started for table {table_id}; ready at {format_clock(ready_minute)}.",
                table_id=table_id,
                details={"reset_minutes": reset_minutes},
            )

    def _seat_groups(self, minute: int) -> int:
        actions = 0
        limit = self.policy.service_policy.max_seating_actions_per_event_time
        while actions < limit:
            assignment = self._pick_next_assignment(minute)
            if assignment is None:
                break
            group, table = assignment
            self._remove_from_queue(group.queue_id, group.spec.group_id)
            group.status = "seated"
            group.seated_minute = minute
            group.assigned_table_id = table.spec.table_id
            table.status = "occupied"
            table.current_group_id = group.spec.group_id
            table.occupied_since = minute
            completion_minute = minute + group.effective_dining_duration
            self._schedule(
                minute=completion_minute,
                event_type=EventType.DINING_COMPLETE,
                payload={"group_id": group.spec.group_id, "table_id": table.spec.table_id},
            )
            actions += 1
            self._log(
                minute,
                "seated",
                f"Group {group.spec.group_id} was seated at table {table.spec.table_id}.",
                group_id=group.spec.group_id,
                table_id=table.spec.table_id,
                queue_id=group.queue_id,
                details={
                    "wait_time": group.wait_time(),
                    "capacity": table.spec.capacity,
                    "fit_efficiency": round(group.spec.group_size / table.spec.capacity, 4),
                },
            )
        return actions

    def _pick_next_assignment(self, minute: int) -> tuple[GroupState, TableState] | None:
        available_tables = sorted(
            (
                table
                for table in self._tables.values()
                if table.status == "available" and table.current_group_id is None
            ),
            key=lambda item: (item.spec.capacity, item.spec.table_id),
        )
        if not available_tables:
            return None

        head_groups = [
            self._groups[group_ids[0]]
            for queue_id, group_ids in self._queues.items()
            if group_ids
        ]
        if not head_groups:
            return None

        priority_groups = [
            group for group in head_groups if self._reservation_priority_applies(group, minute)
        ]
        considered_groups = priority_groups or head_groups
        held_table_ids = self._held_table_ids(minute, available_tables)

        selectable: list[tuple[GroupState, list[TableState]]] = []
        for group in considered_groups:
            candidate_tables = [
                table
                for table in available_tables
                if table.spec.capacity >= group.spec.group_size
                and (
                    self._reservation_priority_applies(group, minute)
                    or table.spec.table_id not in held_table_ids
                )
            ]
            if candidate_tables:
                selectable.append((group, candidate_tables))
        if not selectable:
            return None

        if (
            self.policy.seating_policy.best_fit
            or self.policy.seating_policy.selection_rule == "best_fit"
        ):
            pairs: list[tuple[tuple[object, ...], GroupState, TableState]] = []
            for group, candidate_tables in selectable:
                for table in candidate_tables:
                    pairs.append(
                        (
                            (
                                table.spec.capacity - group.spec.group_size,
                                group.spec.arrival_minute,
                                group.spec.group_id,
                                table.spec.capacity,
                                table.spec.table_id,
                            ),
                            group,
                            table,
                        )
                    )
            pairs.sort(key=lambda item: item[0])
            _, group, table = pairs[0]
            return group, table

        selectable.sort(key=lambda item: (item[0].spec.arrival_minute, item[0].spec.group_id))
        group, candidate_tables = selectable[0]
        candidate_tables.sort(key=lambda table: (table.spec.capacity, table.spec.table_id))
        return group, candidate_tables[0]

    def _held_table_ids(self, minute: int, available_tables: list[TableState]) -> set[str]:
        if not self.config.reservation_hold_policy.enabled:
            return set()

        protected_groups: list[GroupState] = []
        for group in self._groups.values():
            if group.spec.group_type != GroupType.RESERVATION:
                continue
            if group.status != "pending_arrival":
                continue
            reservation_minute = group.spec.reservation_minute
            if reservation_minute is None:
                continue
            hold_end = reservation_minute + self._hold_window(group.spec)
            if reservation_minute <= minute <= hold_end:
                protected_groups.append(group)

        protected_groups.sort(
            key=lambda group: (
                group.spec.reservation_minute or group.spec.arrival_minute,
                -group.spec.group_size,
                group.spec.group_id,
            )
        )

        held: set[str] = set()
        for group in protected_groups:
            for table in available_tables:
                if table.spec.table_id in held:
                    continue
                if table.spec.capacity >= group.spec.group_size:
                    held.add(table.spec.table_id)
                    break
        return held

    def _reservation_priority_applies(self, group: GroupState, minute: int) -> bool:
        if not self.policy.seating_policy.reservation_priority:
            return False
        if group.spec.group_type != GroupType.RESERVATION:
            return False
        if group.status != "waiting":
            return False
        if group.spec.reservation_minute is None:
            return False
        grace_end = group.spec.reservation_minute + group.spec.grace_period
        return minute <= grace_end

    def _queue_id_for_group(self, arrival: ArrivalGroup) -> str:
        matches = [
            queue.queue_id
            for queue in self.config.queue_definitions
            if queue.matches(arrival.group_size)
        ]
        if len(matches) != 1:
            raise ValueError(
                f"Group {arrival.group_id} should match exactly one queue, found {len(matches)}."
            )
        return matches[0]

    def _hold_window(self, arrival: ArrivalGroup) -> int:
        if arrival.reservation_minute is None:
            return 0
        if self.config.reservation_hold_policy.enabled:
            return min(arrival.grace_period, self.config.reservation_hold_policy.hold_minutes)
        return arrival.grace_period

    def _remove_from_queue(self, queue_id: str, group_id: str) -> None:
        queue = self._queues[queue_id]
        if group_id in queue:
            queue.remove(group_id)
        self._update_max_queue_length()

    def _update_max_queue_length(self) -> None:
        total_waiting = sum(len(queue) for queue in self._queues.values())
        self._max_queue_length = max(self._max_queue_length, total_waiting)

    def _record_queue_snapshot(self, minute: int) -> None:
        snapshot = QueueSnapshot(
            minute=minute,
            clock=format_clock(minute),
            total_waiting=sum(len(queue) for queue in self._queues.values()),
            per_queue={queue_id: len(queue) for queue_id, queue in self._queues.items()},
        )
        if self._queue_snapshots and self._queue_snapshots[-1].minute == minute:
            self._queue_snapshots[-1] = snapshot
        else:
            self._queue_snapshots.append(snapshot)
        self._max_queue_length = max(self._max_queue_length, snapshot.total_waiting)

    def _log(
        self,
        minute: int,
        event_type: str,
        message: str,
        *,
        group_id: str | None = None,
        table_id: str | None = None,
        queue_id: str | None = None,
        details: dict[str, object] | None = None,
    ) -> None:
        self._event_log.append(
            EventLogEntry.build(
                minute,
                event_type,
                message,
                group_id=group_id,
                table_id=table_id,
                queue_id=queue_id,
                details=details,
            )
        )

    def _build_group_outcomes(self) -> list[GroupOutcome]:
        ordered_groups = sorted(
            self._groups.values(),
            key=lambda group: (group.spec.arrival_minute, group.spec.group_id),
        )
        outcomes: list[GroupOutcome] = []
        for group in ordered_groups:
            outcomes.append(
                GroupOutcome(
                    group_id=group.spec.group_id,
                    group_type=group.spec.group_type.value,
                    group_size=group.spec.group_size,
                    arrival_time=format_clock(group.spec.arrival_minute),
                    reservation_time=(
                        format_clock(group.spec.reservation_minute)
                        if group.spec.reservation_minute is not None
                        else None
                    ),
                    status=group.status,
                    assigned_table_id=group.assigned_table_id,
                    wait_time=group.wait_time(),
                    dining_duration=group.spec.dining_duration,
                    effective_dining_duration=group.effective_dining_duration,
                    seated_time=(
                        format_clock(group.seated_minute)
                        if group.seated_minute is not None
                        else None
                    ),
                    completed_time=(
                        format_clock(group.completed_minute)
                        if group.completed_minute is not None
                        else None
                    ),
                    abandoned_time=(
                        format_clock(group.abandoned_minute)
                        if group.abandoned_minute is not None
                        else None
                    ),
                    no_show_recorded_time=(
                        format_clock(group.no_show_recorded_minute)
                        if group.no_show_recorded_minute is not None
                        else None
                    ),
                    reservation_delay=group.reservation_delay(),
                    notes=group.spec.notes,
                )
            )
        return outcomes

    def _build_metrics(self) -> MetricsRecord:
        completed_groups = [
            group for group in self._groups.values() if group.status == "completed"
        ]
        actual_arrivals = [
            group for group in self._groups.values() if not group.spec.no_show_flag
        ]
        reservation_groups = [
            group
            for group in self._groups.values()
            if group.spec.group_type == GroupType.RESERVATION and not group.spec.no_show_flag
        ]
        waits = [group.wait_time() for group in completed_groups if group.wait_time() is not None]
        reservation_delays = [
            group.reservation_delay()
            for group in reservation_groups
            if group.reservation_delay() is not None and group.seated_minute is not None
        ]
        fit_efficiencies = []
        for group in completed_groups:
            if group.assigned_table_id is None:
                continue
            table = self._tables[group.assigned_table_id]
            fit_efficiencies.append(group.spec.group_size / table.spec.capacity)

        denominator = max(1, len(actual_arrivals))
        total_table_minutes = len(self._tables) * (
            self.config.simulation_end - self.config.simulation_start
        )
        occupied_minutes = sum(
            clamp_interval(
                segment.start_minute,
                segment.end_minute,
                self.config.simulation_start,
                self.config.simulation_end,
            )
            for segment in self._table_segments
            if segment.status == "occupied"
        )

        return MetricsRecord(
            scenario_name=self.scenario.scenario_name,
            average_wait_time=round(sum(waits) / len(waits), 4) if waits else 0.0,
            max_wait_time=round(max(waits), 4) if waits else 0.0,
            p90_wait_time=round(percentile(waits, 0.9), 4) if waits else 0.0,
            max_queue_length=self._max_queue_length,
            groups_served=len(completed_groups),
            groups_abandoned=sum(1 for group in self._groups.values() if group.status == "abandoned"),
            service_level_within_15_min=round(
                sum(
                    1
                    for group in actual_arrivals
                    if group.wait_time() is not None and group.wait_time() <= 15
                )
                / denominator,
                4,
            ),
            service_level_within_30_min=round(
                sum(
                    1
                    for group in actual_arrivals
                    if group.wait_time() is not None and group.wait_time() <= 30
                )
                / denominator,
                4,
            ),
            table_utilization_overall=round(
                occupied_minutes / total_table_minutes if total_table_minutes else 0.0,
                4,
            ),
            reservation_fulfillment_rate=round(
                (
                    sum(1 for group in reservation_groups if group.seated_minute is not None)
                    / len(reservation_groups)
                )
                if reservation_groups
                else 0.0,
                4,
            ),
            average_reservation_delay=round(
                sum(reservation_delays) / len(reservation_delays) if reservation_delays else 0.0,
                4,
            ),
            average_table_fit_efficiency=round(
                sum(fit_efficiencies) / len(fit_efficiencies) if fit_efficiencies else 0.0,
                4,
            ),
            notes=(
                f"Simulation-generated metrics using {self.config.queue_mode.value} queues and "
                f"{self.policy.seating_policy.selection_rule} seating."
            ),
        )
