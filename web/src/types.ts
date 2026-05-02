/*
- What it does:
  Defines TypeScript contracts shared by the dashboard UI and API client.
- Inputs:
  JSON shapes returned by the backend and values selected in the builder form.
- Outputs:
  Typed interfaces and unions used throughout the React app.
*/

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

/*
- What it does:
  Defines the event log entry data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

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

/*
- What it does:
  Defines the queue snapshot data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface QueueSnapshot {
  minute: number
  clock: string
  total_waiting: number
  per_queue: Record<string, number>
}

/*
- What it does:
  Defines the table segment data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface TableSegment {
  table_id: string
  status: string
  start_minute: number
  end_minute: number
  start_clock: string
  end_clock: string
  group_id: string | null
}

/*
- What it does:
  Defines the group outcome data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

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

/*
- What it does:
  Defines the scenario result data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface ScenarioResult {
  scenario_name: string
  metrics: MetricsRecord
  event_log: EventLogEntry[]
  queue_snapshots: QueueSnapshot[]
  table_segments: TableSegment[]
  group_outcomes: GroupOutcome[]
  source_paths: Record<string, string>
}

/*
- What it does:
  Defines the pair comparison data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface PairComparison {
  case_study: string
  A: ScenarioResult
  B: ScenarioResult
  metric_deltas_b_minus_a: Record<string, number>
}

/*
- What it does:
  Defines the case study metadata data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface CaseStudyMetadata {
  case_study: string
  title: string
  summary: string
  versions: string[]
  path: string
  focus_label: string
  starter_versions: Partial<Record<'A' | 'B', CaseStudyStarterVersion>>
}

/*
- What it does:
  Defines the case study starter version data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface CaseStudyStarterVersion {
  label: string
  restaurant_layout_id: string
  queue_structure_id: string
  reservation_policy_id: string
  seating_policy_id: string
  service_policy_id: string
  arrival_scenario_id: string
  hold_minutes: number
  abandonment_enabled: boolean
  restaurant_name?: string | null
  notes?: string
}

/*
- What it does:
  Defines the schemas response data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface SchemasResponse {
  schemas: Record<string, string>
}

/*
- What it does:
  Defines the case studies response data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface CaseStudiesResponse {
  case_studies: CaseStudyMetadata[]
}

/*
- What it does:
  Defines the case study inputs response data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface CaseStudyInputsResponse {
  config_json: string
  arrivals_csv: string
  policy_json: string
}

/*
- What it does:
  Defines the queue mode data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export type QueueMode = 'single' | 'size_based'

/*
- What it does:
  Defines the queue definition input data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface QueueDefinitionInput {
  queue_id: string
  min_size: number
  max_size: number
}

/*
- What it does:
  Defines the table spec input data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface TableSpecInput {
  table_id: string
  capacity: number
}

/*
- What it does:
  Defines the restaurant preset data data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

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

/*
- What it does:
  Defines the seating policy preset data data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

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

/*
- What it does:
  Defines the service policy preset data data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

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

/*
- What it does:
  Defines the reservation policy preset data data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

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

/*
- What it does:
  Defines the json preset data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface JsonPreset<T> {
  id: string
  title: string
  description: string
  source_path: string
  raw: string
  data: T
}

/*
- What it does:
  Defines the csv preset data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface CsvPreset {
  id: string
  title: string
  description: string
  source_path: string
  raw: string
  row_count: number
  max_group_size: number
  reservation_groups: number
  walkin_groups: number
}

/*
- What it does:
  Defines the builder presets response data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface BuilderPresetsResponse {
  restaurant_layouts: JsonPreset<RestaurantPresetData>[]
  queue_structures: JsonPreset<RestaurantPresetData>[]
  seating_policies: JsonPreset<SeatingPolicyPresetData>[]
  service_policies: JsonPreset<ServicePolicyPresetData>[]
  reservation_policies: JsonPreset<ReservationPolicyPresetData>[]
  arrival_scenarios: CsvPreset[]
}

/*
- What it does:
  Defines the builder form state data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface BuilderFormState {
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

/*
- What it does:
  Defines the custom scenario payload data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

export interface CustomScenarioPayload {
  scenario_name: string
  config_json: string
  arrivals_csv: string
  policy_json: string
}
