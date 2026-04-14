export interface MetricsRecord {
  scenario_name: string
  average_wait_time: number
  max_wait_time: number
  p90_wait_time: number
  max_queue_length: number
  groups_served: number
  groups_abandoned: number
  service_level_within_15_min: number
  service_level_within_30_min: number
  table_utilization_overall: number
  reservation_fulfillment_rate: number
  average_reservation_delay: number
  average_table_fit_efficiency: number
  notes: string
}

export interface EventLogEntry {
  minute: number
  clock: string
  event_type: string
  message: string
  group_id: string | null
  table_id: string | null
  queue_id: string | null
  details: Record<string, unknown>
}

export interface QueueSnapshot {
  minute: number
  clock: string
  total_waiting: number
  per_queue: Record<string, number>
}

export interface TableSegment {
  table_id: string
  status: string
  start_minute: number
  end_minute: number
  start_clock: string
  end_clock: string
  group_id: string | null
}

export interface GroupOutcome {
  group_id: string
  group_type: string
  group_size: number
  arrival_time: string
  reservation_time: string | null
  status: string
  assigned_table_id: string | null
  wait_time: number | null
  dining_duration: number
  effective_dining_duration: number
  seated_time: string | null
  completed_time: string | null
  abandoned_time: string | null
  no_show_recorded_time: string | null
  reservation_delay: number | null
  notes: string
}

export interface ScenarioResult {
  scenario_name: string
  metrics: MetricsRecord
  event_log: EventLogEntry[]
  queue_snapshots: QueueSnapshot[]
  table_segments: TableSegment[]
  group_outcomes: GroupOutcome[]
  source_paths: Record<string, string>
}

export interface PairComparison {
  case_study: string
  A: ScenarioResult
  B: ScenarioResult
  metric_deltas_b_minus_a: Record<string, number>
}

export interface CaseStudyMetadata {
  case_study: string
  title: string
  summary: string
  versions: string[]
  path: string
}

export interface SchemasResponse {
  schemas: Record<string, string>
}

export interface CaseStudiesResponse {
  case_studies: CaseStudyMetadata[]
}

export interface CaseStudyInputsResponse {
  config_json: string
  arrivals_csv: string
  policy_json: string
}

export type QueueMode = 'single' | 'size_based'

export interface QueueDefinitionInput {
  queue_id: string
  min_size: number
  max_size: number
}

export interface TableSpecInput {
  table_id: string
  capacity: number
  zone: string
}

export interface RestaurantPresetData {
  restaurant_name: string
  simulation_start: string
  simulation_end: string
  queue_mode: QueueMode
  queue_definitions: QueueDefinitionInput[]
  tables: TableSpecInput[]
  table_sharing_allowed: boolean
  table_combining_allowed: boolean
  reservation_hold_policy: {
    enabled: boolean
    hold_minutes: number
  }
  default_reset_policy: {
    enabled: boolean
    default_reset_minutes: number
  }
  optional_operational_defaults?: Record<string, unknown>
}

export interface SeatingPolicyPresetData {
  policy_category: string
  policy_name: string
  queue_rule: string
  selection_rule: string
  reservation_priority: boolean
  best_fit: boolean
  late_reservation_behavior: string
  no_show_handling: Record<string, unknown>
}

export interface ServicePolicyPresetData {
  policy_category: string
  policy_name: string
  reset_enabled: boolean
  reset_time_by_capacity: Record<string, number>
  max_seating_actions_per_event_time: number
  max_cleaning_actions_per_event_time: number
  kitchen_load_mode: string
  dining_duration_multiplier_under_load: number
  abandonment_enabled: boolean
}

export interface ReservationPolicyPresetData {
  policy_category: string
  policy_name: string
  reservation_system_enabled: boolean
  hold_tables_for_reservations: boolean
  default_hold_minutes: number
  reservation_priority_available: boolean
  late_reservation_behavior: string
  no_show_handling: Record<string, unknown>
}

export interface JsonPreset<T> {
  id: string
  title: string
  description: string
  source_path: string
  raw: string
  data: T
}

export interface CsvPreset {
  id: string
  title: string
  description: string
  source_path: string
  raw: string
  row_count: number
}

export interface BuilderPresetsResponse {
  restaurant_layouts: JsonPreset<RestaurantPresetData>[]
  queue_structures: JsonPreset<RestaurantPresetData>[]
  seating_policies: JsonPreset<SeatingPolicyPresetData>[]
  service_policies: JsonPreset<ServicePolicyPresetData>[]
  reservation_policies: JsonPreset<ReservationPolicyPresetData>[]
  arrival_scenarios: CsvPreset[]
}

export interface BuilderFormState {
  scenarioName: string
  restaurantName: string
  simulationStart: string
  simulationEnd: string
  restaurantLayoutId: string
  queueStructureId: string
  reservationPolicyId: string
  seatingPolicyId: string
  servicePolicyId: string
  arrivalScenarioId: string
  holdMinutes: number
  abandonmentEnabled: boolean
}

export interface CustomScenarioPayload {
  scenario_name: string
  config_json: string
  arrivals_csv: string
  policy_json: string
}
