import type {
  BuilderFormState,
  BuilderPresetsResponse,
  CsvPreset,
  CustomScenarioPayload,
  JsonPreset,
  ReservationPolicyPresetData,
  RestaurantPresetData,
  SeatingPolicyPresetData,
  ServicePolicyPresetData,
} from './types'

type StarterVersion = 'A' | 'B'

type StarterPreset = Pick<
  BuilderFormState,
  | 'restaurantLayoutId'
  | 'queueStructureId'
  | 'reservationPolicyId'
  | 'seatingPolicyId'
  | 'servicePolicyId'
  | 'arrivalScenarioId'
  | 'holdMinutes'
  | 'abandonmentEnabled'
>

const FALLBACK_STARTER: StarterPreset = {
  restaurantLayoutId: 'restaurant_base',
  queueStructureId: 'restaurant_multi_queue',
  reservationPolicyId: 'reservation_enabled',
  seatingPolicyId: 'seating_fcfs',
  servicePolicyId: 'service_default',
  arrivalScenarioId: 'dinner_peak_base',
  holdMinutes: 10,
  abandonmentEnabled: false,
}

const STARTER_PRESETS: Record<string, Record<StarterVersion, StarterPreset>> = {
  pair_01_table_mix: {
    A: {
      restaurantLayoutId: 'restaurant_small_tables',
      queueStructureId: 'restaurant_multi_queue',
      reservationPolicyId: 'reservation_enabled',
      seatingPolicyId: 'seating_fcfs',
      servicePolicyId: 'service_default',
      arrivalScenarioId: 'large_party_heavy_base',
      holdMinutes: 10,
      abandonmentEnabled: false,
    },
    B: {
      restaurantLayoutId: 'restaurant_large_tables',
      queueStructureId: 'restaurant_multi_queue',
      reservationPolicyId: 'reservation_enabled',
      seatingPolicyId: 'seating_fcfs',
      servicePolicyId: 'service_default',
      arrivalScenarioId: 'large_party_heavy_base',
      holdMinutes: 10,
      abandonmentEnabled: false,
    },
  },
  pair_02_single_vs_multi_queue: {
    A: {
      restaurantLayoutId: 'restaurant_base',
      queueStructureId: 'restaurant_single_queue',
      reservationPolicyId: 'reservation_enabled',
      seatingPolicyId: 'seating_fcfs',
      servicePolicyId: 'service_default',
      arrivalScenarioId: 'lunch_rush_base',
      holdMinutes: 10,
      abandonmentEnabled: false,
    },
    B: {
      restaurantLayoutId: 'restaurant_base',
      queueStructureId: 'restaurant_multi_queue',
      reservationPolicyId: 'reservation_enabled',
      seatingPolicyId: 'seating_fcfs',
      servicePolicyId: 'service_default',
      arrivalScenarioId: 'lunch_rush_base',
      holdMinutes: 10,
      abandonmentEnabled: false,
    },
  },
  pair_03_coarse_vs_fine_queue: {
    A: {
      restaurantLayoutId: 'restaurant_base',
      queueStructureId: 'restaurant_coarse_queue',
      reservationPolicyId: 'reservation_enabled',
      seatingPolicyId: 'seating_fcfs',
      servicePolicyId: 'service_default',
      arrivalScenarioId: 'dinner_peak_base',
      holdMinutes: 10,
      abandonmentEnabled: false,
    },
    B: {
      restaurantLayoutId: 'restaurant_base',
      queueStructureId: 'restaurant_fine_queue',
      reservationPolicyId: 'reservation_enabled',
      seatingPolicyId: 'seating_fcfs',
      servicePolicyId: 'service_default',
      arrivalScenarioId: 'dinner_peak_base',
      holdMinutes: 10,
      abandonmentEnabled: false,
    },
  },
  pair_04_no_reservation_hold_vs_hold: {
    A: {
      restaurantLayoutId: 'restaurant_base',
      queueStructureId: 'restaurant_multi_queue',
      reservationPolicyId: 'reservation_disabled',
      seatingPolicyId: 'seating_fcfs',
      servicePolicyId: 'service_default',
      arrivalScenarioId: 'reservation_mixed_base',
      holdMinutes: 0,
      abandonmentEnabled: false,
    },
    B: {
      restaurantLayoutId: 'restaurant_base',
      queueStructureId: 'restaurant_multi_queue',
      reservationPolicyId: 'reservation_enabled',
      seatingPolicyId: 'seating_fcfs',
      servicePolicyId: 'service_default',
      arrivalScenarioId: 'reservation_mixed_base',
      holdMinutes: 10,
      abandonmentEnabled: false,
    },
  },
  pair_05_low_vs_high_cleaning_capacity: {
    A: {
      restaurantLayoutId: 'restaurant_base',
      queueStructureId: 'restaurant_multi_queue',
      reservationPolicyId: 'reservation_enabled',
      seatingPolicyId: 'seating_fcfs',
      servicePolicyId: 'service_low_cleaning_capacity',
      arrivalScenarioId: 'dinner_peak_base',
      holdMinutes: 10,
      abandonmentEnabled: false,
    },
    B: {
      restaurantLayoutId: 'restaurant_base',
      queueStructureId: 'restaurant_multi_queue',
      reservationPolicyId: 'reservation_enabled',
      seatingPolicyId: 'seating_fcfs',
      servicePolicyId: 'service_high_cleaning_capacity',
      arrivalScenarioId: 'dinner_peak_base',
      holdMinutes: 10,
      abandonmentEnabled: false,
    },
  },
  pair_06_no_abandonment_vs_abandonment: {
    A: {
      restaurantLayoutId: 'restaurant_base',
      queueStructureId: 'restaurant_multi_queue',
      reservationPolicyId: 'reservation_enabled',
      seatingPolicyId: 'seating_fcfs',
      servicePolicyId: 'service_default',
      arrivalScenarioId: 'stress_peak_base',
      holdMinutes: 10,
      abandonmentEnabled: false,
    },
    B: {
      restaurantLayoutId: 'restaurant_base',
      queueStructureId: 'restaurant_multi_queue',
      reservationPolicyId: 'reservation_enabled',
      seatingPolicyId: 'seating_fcfs',
      servicePolicyId: 'service_default',
      arrivalScenarioId: 'stress_peak_base',
      holdMinutes: 10,
      abandonmentEnabled: true,
    },
  },
}

function getPresetById<T extends { id: string }>(items: T[], id: string): T {
  const match = items.find((item) => item.id === id)
  if (!match) {
    throw new Error(`Missing preset: ${id}`)
  }
  return match
}

function customScenarioName(caseStudy: string, version: StarterVersion) {
  return `${caseStudy}_${version}_custom`
}

function nextNotes(
  layout: JsonPreset<RestaurantPresetData>,
  queue: JsonPreset<RestaurantPresetData>,
  seating: JsonPreset<SeatingPolicyPresetData>,
  service: JsonPreset<ServicePolicyPresetData>,
  reservation: JsonPreset<ReservationPolicyPresetData>,
  arrivals: CsvPreset,
) {
  return [
    `Layout: ${layout.title}`,
    `Queue: ${queue.title}`,
    `Seating: ${seating.title}`,
    `Service: ${service.title}`,
    `Reservations: ${reservation.title}`,
    `Demand: ${arrivals.title}`,
  ].join(' | ')
}

function servicePolicyName(baseName: string, abandonmentEnabled: boolean) {
  if (!abandonmentEnabled || baseName.toLowerCase().includes('abandonment')) {
    return baseName
  }
  return `${baseName} with Abandonment`
}

export function buildFormFromStarter(
  caseStudy: string,
  version: StarterVersion,
  presets: BuilderPresetsResponse,
): BuilderFormState {
  const starter = STARTER_PRESETS[caseStudy]?.[version] ?? FALLBACK_STARTER
  const layout =
    presets.restaurant_layouts.find((item) => item.id === starter.restaurantLayoutId) ??
    presets.restaurant_layouts[0]

  return {
    scenarioName: customScenarioName(caseStudy, version),
    restaurantName: layout?.data.restaurant_name ?? 'Custom Restaurant Scenario',
    simulationStart: layout?.data.simulation_start ?? '11:30',
    simulationEnd: layout?.data.simulation_end ?? '22:00',
    restaurantLayoutId: starter.restaurantLayoutId,
    queueStructureId: starter.queueStructureId,
    reservationPolicyId: starter.reservationPolicyId,
    seatingPolicyId: starter.seatingPolicyId,
    servicePolicyId: starter.servicePolicyId,
    arrivalScenarioId: starter.arrivalScenarioId,
    holdMinutes: starter.holdMinutes,
    abandonmentEnabled: starter.abandonmentEnabled,
  }
}

export function summarizeBuilderSelections(
  form: BuilderFormState,
  presets: BuilderPresetsResponse,
): string {
  const reservation = getPresetById(presets.reservation_policies, form.reservationPolicyId)
  const parts = [
    getPresetById(presets.restaurant_layouts, form.restaurantLayoutId).title,
    getPresetById(presets.queue_structures, form.queueStructureId).title,
    reservation.data.hold_tables_for_reservations
      ? `reservation hold ${form.holdMinutes} min`
      : 'reservation hold off',
    getPresetById(presets.seating_policies, form.seatingPolicyId).title,
    getPresetById(presets.service_policies, form.servicePolicyId).title,
    form.abandonmentEnabled ? 'abandonment enabled' : 'abandonment disabled',
    getPresetById(presets.arrival_scenarios, form.arrivalScenarioId).title,
  ]
  return parts.join(' + ')
}

export function buildCustomScenarioPayload(
  form: BuilderFormState,
  presets: BuilderPresetsResponse,
): CustomScenarioPayload {
  const layout = getPresetById(presets.restaurant_layouts, form.restaurantLayoutId)
  const queue = getPresetById(presets.queue_structures, form.queueStructureId)
  const reservation = getPresetById(presets.reservation_policies, form.reservationPolicyId)
  const seating = getPresetById(presets.seating_policies, form.seatingPolicyId)
  const service = getPresetById(presets.service_policies, form.servicePolicyId)
  const arrivals = getPresetById(presets.arrival_scenarios, form.arrivalScenarioId)

  const config = {
    restaurant_name: form.restaurantName.trim() || layout.data.restaurant_name,
    simulation_start: form.simulationStart,
    simulation_end: form.simulationEnd,
    queue_mode: queue.data.queue_mode,
    queue_definitions: queue.data.queue_definitions,
    tables: layout.data.tables,
    table_sharing_allowed: layout.data.table_sharing_allowed,
    table_combining_allowed: layout.data.table_combining_allowed,
    reservation_hold_policy: {
      enabled: reservation.data.hold_tables_for_reservations,
      hold_minutes: reservation.data.hold_tables_for_reservations ? form.holdMinutes : 0,
    },
    default_reset_policy: layout.data.default_reset_policy,
    optional_operational_defaults: {
      ...(layout.data.optional_operational_defaults ?? {}),
      notes: nextNotes(layout, queue, seating, service, reservation, arrivals),
    },
  }

  const servicePolicy = {
    ...service.data,
    policy_name: servicePolicyName(service.data.policy_name, form.abandonmentEnabled),
    abandonment_enabled: form.abandonmentEnabled,
  }

  const policyBundle = {
    policy_name: `${seating.data.policy_name} + ${servicePolicy.policy_name}`,
    source_components: {
      restaurant_layout: layout.id,
      queue_structure: queue.id,
      reservation: reservation.id,
      seating: seating.id,
      service: service.id,
      arrivals: arrivals.id,
    },
    seating_policy: seating.data,
    service_policy: servicePolicy,
  }

  return {
    scenario_name: form.scenarioName.trim() || 'custom_scenario',
    config_json: JSON.stringify(config, null, 2),
    policy_json: JSON.stringify(policyBundle, null, 2),
    arrivals_csv: arrivals.raw,
  }
}
