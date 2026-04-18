import type {
  BuilderFormState,
  BuilderPresetsResponse,
  CaseStudyMetadata,
  CaseStudyStarterVersion,
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

export interface CaseStudyOverviewRow {
  label: string
  versionA: string
  versionB: string
  changed: boolean
}

const FALLBACK_STARTER: StarterPreset = {
  restaurantLayoutId: 'layout_family_trattoria',
  queueStructureId: 'queue_balanced_size',
  reservationPolicyId: 'reservation_enabled',
  seatingPolicyId: 'seating_fcfs',
  servicePolicyId: 'service_default',
  arrivalScenarioId: 'dinner_peak_base',
  holdMinutes: 10,
  abandonmentEnabled: false,
}

function getPresetById<T extends { id: string }>(items: T[], id: string): T {
  const match = items.find((item) => item.id === id)
  if (!match) {
    throw new Error(`Missing preset: ${id}`)
  }
  return match
}

function simplifyPresetTitle(title: string) {
  return title.trim()
}

function describeReservationHandling(
  preset: JsonPreset<ReservationPolicyPresetData>,
  holdMinutes: number,
) {
  if (!preset.data.hold_tables_for_reservations) {
    return 'Tables return to the floor immediately if booked guests have not arrived'
  }
  return `Booked tables stay protected for ${holdMinutes} minutes`
}

function describeWalkAwaySetting(enabled: boolean) {
  return enabled ? 'Parties may leave after a long wait' : 'Parties stay on the waitlist until seated'
}

function normalizeCaseStudyTitle(caseStudy: CaseStudyMetadata | null | undefined) {
  if (!caseStudy) {
    return 'Custom Scenario'
  }
  return caseStudy.title.replace(/^Pair\s+\d+\s*:\s*/i, '').trim() || 'Custom Scenario'
}

function customScenarioName(caseStudy: CaseStudyMetadata | null | undefined, version: StarterVersion) {
  return `${normalizeCaseStudyTitle(caseStudy)} custom plan from Option ${version}`
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

function starterVersion(
  caseStudy: CaseStudyMetadata | null | undefined,
  version: StarterVersion,
): CaseStudyStarterVersion | null {
  return caseStudy?.starter_versions?.[version] ?? null
}

function normalizeStarter(
  caseStudy: CaseStudyMetadata | null | undefined,
  version: StarterVersion,
): StarterPreset {
  const starter = starterVersion(caseStudy, version)
  if (!starter) {
    return FALLBACK_STARTER
  }
  return {
    restaurantLayoutId: starter.restaurant_layout_id,
    queueStructureId: starter.queue_structure_id,
    reservationPolicyId: starter.reservation_policy_id,
    seatingPolicyId: starter.seating_policy_id,
    servicePolicyId: starter.service_policy_id,
    arrivalScenarioId: starter.arrival_scenario_id,
    holdMinutes: starter.hold_minutes,
    abandonmentEnabled: starter.abandonment_enabled,
  }
}

export function buildFormFromStarter(
  caseStudy: CaseStudyMetadata | null | undefined,
  version: StarterVersion,
  presets: BuilderPresetsResponse,
): BuilderFormState {
  const starter = normalizeStarter(caseStudy, version)
  const starterMeta = starterVersion(caseStudy, version)
  const layout =
    presets.restaurant_layouts.find((item) => item.id === starter.restaurantLayoutId) ??
    presets.restaurant_layouts[0]

  return {
    scenarioName: customScenarioName(caseStudy, version),
    restaurantName:
      starterMeta?.restaurant_name?.trim() || layout?.data.restaurant_name || 'My Restaurant Plan',
    simulationStart: layout?.data.simulation_start ?? '11:00',
    simulationEnd: layout?.data.simulation_end ?? '22:30',
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
  const layoutTitle = simplifyPresetTitle(
    getPresetById(presets.restaurant_layouts, form.restaurantLayoutId).title,
  )
  const queueTitle = simplifyPresetTitle(
    getPresetById(presets.queue_structures, form.queueStructureId).title,
  )
  const seatingTitle = getPresetById(presets.seating_policies, form.seatingPolicyId).title
  const serviceTitle = simplifyPresetTitle(
    getPresetById(presets.service_policies, form.servicePolicyId).title,
  )
  const arrivalsTitle = getPresetById(presets.arrival_scenarios, form.arrivalScenarioId).title
  const parts = [
    `${layoutTitle} dining room`,
    queueTitle,
    reservation.data.hold_tables_for_reservations
      ? `booked tables protected for ${form.holdMinutes} minutes`
      : 'no table protection for bookings',
    seatingTitle,
    serviceTitle,
    form.abandonmentEnabled ? 'parties may leave after a long wait' : 'parties stay on the waitlist',
    `${arrivalsTitle} arrival pattern`,
  ]
  return `Built around a ${parts.join(', ')}.`
}

export function buildCaseStudyOverviewRows(
  caseStudy: CaseStudyMetadata | null | undefined,
  presets: BuilderPresetsResponse,
): CaseStudyOverviewRow[] {
  const starterA = normalizeStarter(caseStudy, 'A')
  const starterB = normalizeStarter(caseStudy, 'B')

  const layoutA = getPresetById(presets.restaurant_layouts, starterA.restaurantLayoutId)
  const layoutB = getPresetById(presets.restaurant_layouts, starterB.restaurantLayoutId)
  const queueA = getPresetById(presets.queue_structures, starterA.queueStructureId)
  const queueB = getPresetById(presets.queue_structures, starterB.queueStructureId)
  const reservationA = getPresetById(presets.reservation_policies, starterA.reservationPolicyId)
  const reservationB = getPresetById(presets.reservation_policies, starterB.reservationPolicyId)
  const seatingA = getPresetById(presets.seating_policies, starterA.seatingPolicyId)
  const seatingB = getPresetById(presets.seating_policies, starterB.seatingPolicyId)
  const serviceA = getPresetById(presets.service_policies, starterA.servicePolicyId)
  const serviceB = getPresetById(presets.service_policies, starterB.servicePolicyId)
  const arrivalsA = getPresetById(presets.arrival_scenarios, starterA.arrivalScenarioId)
  const arrivalsB = getPresetById(presets.arrival_scenarios, starterB.arrivalScenarioId)

  const rows: CaseStudyOverviewRow[] = [
    {
      label: 'Restaurant concept',
      versionA: simplifyPresetTitle(layoutA.title),
      versionB: simplifyPresetTitle(layoutB.title),
      changed: layoutA.id !== layoutB.id,
    },
    {
      label: 'Waitlist setup',
      versionA: simplifyPresetTitle(queueA.title),
      versionB: simplifyPresetTitle(queueB.title),
      changed: queueA.id !== queueB.id,
    },
    {
      label: 'Booking protection',
      versionA: describeReservationHandling(reservationA, starterA.holdMinutes),
      versionB: describeReservationHandling(reservationB, starterB.holdMinutes),
      changed:
        reservationA.id !== reservationB.id || starterA.holdMinutes !== starterB.holdMinutes,
    },
    {
      label: 'Table assignment style',
      versionA: seatingA.title,
      versionB: seatingB.title,
      changed: seatingA.id !== seatingB.id,
    },
    {
      label: 'Table reset pace',
      versionA: simplifyPresetTitle(serviceA.title),
      versionB: simplifyPresetTitle(serviceB.title),
      changed: serviceA.id !== serviceB.id,
    },
    {
      label: 'Long-wait behaviour',
      versionA: describeWalkAwaySetting(starterA.abandonmentEnabled),
      versionB: describeWalkAwaySetting(starterB.abandonmentEnabled),
      changed: starterA.abandonmentEnabled !== starterB.abandonmentEnabled,
    },
    {
      label: 'Arrival pattern',
      versionA: arrivalsA.title,
      versionB: arrivalsB.title,
      changed: arrivalsA.id !== arrivalsB.id,
    },
  ]

  return rows.sort((left, right) => Number(right.changed) - Number(left.changed))
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

export function buildCustomComparisonRows(
  formA: BuilderFormState,
  formB: BuilderFormState,
  presets: BuilderPresetsResponse,
): CaseStudyOverviewRow[] {
  const layoutA = getPresetById(presets.restaurant_layouts, formA.restaurantLayoutId)
  const layoutB = getPresetById(presets.restaurant_layouts, formB.restaurantLayoutId)
  const queueA = getPresetById(presets.queue_structures, formA.queueStructureId)
  const queueB = getPresetById(presets.queue_structures, formB.queueStructureId)
  const reservationA = getPresetById(presets.reservation_policies, formA.reservationPolicyId)
  const reservationB = getPresetById(presets.reservation_policies, formB.reservationPolicyId)
  const seatingA = getPresetById(presets.seating_policies, formA.seatingPolicyId)
  const seatingB = getPresetById(presets.seating_policies, formB.seatingPolicyId)
  const serviceA = getPresetById(presets.service_policies, formA.servicePolicyId)
  const serviceB = getPresetById(presets.service_policies, formB.servicePolicyId)
  const arrivalsA = getPresetById(presets.arrival_scenarios, formA.arrivalScenarioId)
  const arrivalsB = getPresetById(presets.arrival_scenarios, formB.arrivalScenarioId)

  const rows: CaseStudyOverviewRow[] = [
    {
      label: 'Option name',
      versionA: formA.scenarioName.trim() || 'Option A',
      versionB: formB.scenarioName.trim() || 'Option B',
      changed: formA.scenarioName.trim() !== formB.scenarioName.trim(),
    },
    {
      label: 'Venue name',
      versionA: formA.restaurantName.trim() || layoutA.data.restaurant_name,
      versionB: formB.restaurantName.trim() || layoutB.data.restaurant_name,
      changed:
        (formA.restaurantName.trim() || layoutA.data.restaurant_name) !==
        (formB.restaurantName.trim() || layoutB.data.restaurant_name),
    },
    {
      label: 'Service window',
      versionA: `${formA.simulationStart} to ${formA.simulationEnd}`,
      versionB: `${formB.simulationStart} to ${formB.simulationEnd}`,
      changed:
        formA.simulationStart !== formB.simulationStart || formA.simulationEnd !== formB.simulationEnd,
    },
    {
      label: 'Restaurant concept',
      versionA: simplifyPresetTitle(layoutA.title),
      versionB: simplifyPresetTitle(layoutB.title),
      changed: layoutA.id !== layoutB.id,
    },
    {
      label: 'Waitlist setup',
      versionA: simplifyPresetTitle(queueA.title),
      versionB: simplifyPresetTitle(queueB.title),
      changed: queueA.id !== queueB.id,
    },
    {
      label: 'Booking protection',
      versionA: describeReservationHandling(reservationA, formA.holdMinutes),
      versionB: describeReservationHandling(reservationB, formB.holdMinutes),
      changed:
        reservationA.id !== reservationB.id || formA.holdMinutes !== formB.holdMinutes,
    },
    {
      label: 'Table assignment style',
      versionA: seatingA.title,
      versionB: seatingB.title,
      changed: seatingA.id !== seatingB.id,
    },
    {
      label: 'Table reset pace',
      versionA: simplifyPresetTitle(serviceA.title),
      versionB: simplifyPresetTitle(serviceB.title),
      changed: serviceA.id !== serviceB.id,
    },
    {
      label: 'Long-wait behaviour',
      versionA: describeWalkAwaySetting(formA.abandonmentEnabled),
      versionB: describeWalkAwaySetting(formB.abandonmentEnabled),
      changed: formA.abandonmentEnabled !== formB.abandonmentEnabled,
    },
    {
      label: 'Arrival pattern',
      versionA: arrivalsA.title,
      versionB: arrivalsB.title,
      changed: arrivalsA.id !== arrivalsB.id,
    },
  ]

  return rows.sort((left, right) => Number(right.changed) - Number(left.changed))
}
