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

/*
- What it does:
  Transforms preset catalogs and form state into custom simulation payloads.
- Inputs:
  Builder presets, starter case-study metadata, and form selections.
- Outputs:
  Normalized form state, overview rows, notes, and API-ready custom scenario payloads.
*/

type StarterVersion = 'A' | 'B'

/*
- What it does:
  Defines the starter preset data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

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

/*
- What it does:
  Defines the case study overview row data contract.
- Inputs:
  Values exchanged between the API, builder, and React UI.
- Outputs:
  A TypeScript type used for compile-time checking.
*/

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

/*
- What it does:
  Finds one preset by id and fails loudly if the catalog is inconsistent.
- Inputs:
  A preset list and expected id.
- Outputs:
  The matching preset record.
*/

function getPresetById<T extends { id: string }>(items: T[], id: string): T {
  const match = items.find((item) => item.id === id)
  if (!match) {
    throw new Error(`Missing preset: ${id}`)
  }
  return match
}

/*
- What it does:
  Finds the largest party size supported by a restaurant layout.
- Inputs:
  A restaurant layout preset.
- Outputs:
  The maximum table capacity.
*/

function maxTableCapacity(layout: JsonPreset<RestaurantPresetData>) {
  return layout.data.tables.reduce((currentMax, table) => Math.max(currentMax, table.capacity), 0)
}

/*
- What it does:
  Filters arrival presets to those supported by a layout capacity.
- Inputs:
  A layout preset and full builder preset catalog.
- Outputs:
  Arrival scenario presets whose max group size fits.
*/

function compatibleArrivalScenariosForLayout(
  layout: JsonPreset<RestaurantPresetData>,
  presets: BuilderPresetsResponse,
) {
  const maxCapacity = maxTableCapacity(layout)
  return presets.arrival_scenarios.filter((item) => item.max_group_size <= maxCapacity)
}

/*
- What it does:
  Keeps or replaces an arrival scenario id so it fits the selected layout.
- Inputs:
  The current arrival id, selected layout, and preset catalog.
- Outputs:
  A compatible arrival scenario id.
*/

function normalizeArrivalScenarioId(
  arrivalScenarioId: string,
  layout: JsonPreset<RestaurantPresetData>,
  presets: BuilderPresetsResponse,
) {
  const compatible = compatibleArrivalScenariosForLayout(layout, presets)
  if (!compatible.length) {
    return arrivalScenarioId
  }
  return compatible.some((item) => item.id === arrivalScenarioId) ? arrivalScenarioId : compatible[0].id
}

/*
- What it does:
  Validates that a selected arrival scenario fits the selected layout.
- Inputs:
  A layout preset and arrival CSV preset.
- Outputs:
  No value; throws when max group size exceeds table capacity.
*/

function assertArrivalCompatibility(
  layout: JsonPreset<RestaurantPresetData>,
  arrivals: CsvPreset,
) {
  const maxCapacity = maxTableCapacity(layout)
  if (arrivals.max_group_size > maxCapacity) {
    throw new Error(
      `${layout.title} seats parties up to ${maxCapacity}, but ${arrivals.title} includes groups up to ${arrivals.max_group_size}.`,
    )
  }
}

/*
- What it does:
  Performs the simplify preset title UI or data transformation step.
- Inputs:
  The arguments declared by the function signature.
- Outputs:
  A computed value, rendered component, or state update result.
*/

function simplifyPresetTitle(title: string) {
  return title.trim()
}

/*
- What it does:
  Performs the describe reservation handling UI or data transformation step.
- Inputs:
  The arguments declared by the function signature.
- Outputs:
  A computed value, rendered component, or state update result.
*/

function describeReservationHandling(
  preset: JsonPreset<ReservationPolicyPresetData>,
  holdMinutes: number,
) {
  if (!preset.data.hold_tables_for_reservations) {
    return 'Tables return to the floor immediately if booked guests have not arrived'
  }
  return `Booked tables stay protected for ${holdMinutes} minutes`
}

/*
- What it does:
  Performs the describe walk away setting UI or data transformation step.
- Inputs:
  The arguments declared by the function signature.
- Outputs:
  A computed value, rendered component, or state update result.
*/

function describeWalkAwaySetting(enabled: boolean) {
  return enabled ? 'Parties may leave after a long wait' : 'Parties stay on the waitlist until seated'
}

/*
- What it does:
  Performs the next notes UI or data transformation step.
- Inputs:
  The arguments declared by the function signature.
- Outputs:
  A computed value, rendered component, or state update result.
*/

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

/*
- What it does:
  Performs the service policy name UI or data transformation step.
- Inputs:
  The arguments declared by the function signature.
- Outputs:
  A computed value, rendered component, or state update result.
*/

function servicePolicyName(baseName: string, abandonmentEnabled: boolean) {
  if (!abandonmentEnabled || baseName.toLowerCase().includes('abandonment')) {
    return baseName
  }
  return `${baseName} with Abandonment`
}

/*
- What it does:
  Performs the starter version UI or data transformation step.
- Inputs:
  The arguments declared by the function signature.
- Outputs:
  A computed value, rendered component, or state update result.
*/

function starterVersion(
  caseStudy: CaseStudyMetadata | null | undefined,
  version: StarterVersion,
): CaseStudyStarterVersion | null {
  return caseStudy?.starter_versions?.[version] ?? null
}

/*
- What it does:
  Performs the normalize starter UI or data transformation step.
- Inputs:
  The arguments declared by the function signature.
- Outputs:
  A computed value, rendered component, or state update result.
*/

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

/*
- What it does:
  Creates builder form state from an official case-study starter version.
- Inputs:
  Case-study metadata, version label, and builder presets.
- Outputs:
  A normalized BuilderFormState.
*/

export function buildFormFromStarter(
  caseStudy: CaseStudyMetadata | null | undefined,
  version: StarterVersion,
  presets: BuilderPresetsResponse,
): BuilderFormState {
  const starter = normalizeStarter(caseStudy, version)
  const layout =
    presets.restaurant_layouts.find((item) => item.id === starter.restaurantLayoutId) ??
    presets.restaurant_layouts[0]
  const restaurantLayoutId = layout?.id ?? starter.restaurantLayoutId
  const arrivalScenarioId = layout
    ? normalizeArrivalScenarioId(starter.arrivalScenarioId, layout, presets)
    : starter.arrivalScenarioId

  return {
    simulationStart: layout?.data.simulation_start ?? '11:00',
    simulationEnd: layout?.data.simulation_end ?? '22:30',
    restaurantLayoutId,
    queueStructureId: starter.queueStructureId,
    reservationPolicyId: starter.reservationPolicyId,
    seatingPolicyId: starter.seatingPolicyId,
    servicePolicyId: starter.servicePolicyId,
    arrivalScenarioId,
    holdMinutes: starter.holdMinutes,
    abandonmentEnabled: starter.abandonmentEnabled,
  }
}

/*
- What it does:
  Returns arrival presets compatible with the form selected layout.
- Inputs:
  Builder presets and current form state.
- Outputs:
  A filtered arrival preset list.
*/

export function compatibleArrivalScenarios(
  presets: BuilderPresetsResponse,
  layoutId: string,
): CsvPreset[] {
  const layout = getPresetById(presets.restaurant_layouts, layoutId)
  return compatibleArrivalScenariosForLayout(layout, presets)
}

/*
- What it does:
  Adjusts form state after layout changes to keep arrivals compatible.
- Inputs:
  Builder presets and current form state.
- Outputs:
  A form state with a compatible arrival scenario id.
*/

export function normalizeArrivalScenarioForLayout(
  presets: BuilderPresetsResponse,
  layoutId: string,
  arrivalScenarioId: string,
): string {
  const layout = getPresetById(presets.restaurant_layouts, layoutId)
  return normalizeArrivalScenarioId(arrivalScenarioId, layout, presets)
}

/*
- What it does:
  Builds human-readable notes from current builder selections.
- Inputs:
  Builder presets and form state.
- Outputs:
  A semicolon-separated scenario summary string.
*/

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

/*
- What it does:
  Builds A/B overview rows for official case-study starter settings.
- Inputs:
  Case-study metadata and builder presets.
- Outputs:
  Rows marking which selections differ between A and B.
*/

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

/*
- What it does:
  Converts builder form state into backend custom simulation input strings.
- Inputs:
  Builder presets, form state, and scenario name.
- Outputs:
  A CustomScenarioPayload containing config JSON, policy JSON, and arrivals CSV.
*/

export function buildCustomScenarioPayload(
  form: BuilderFormState,
  presets: BuilderPresetsResponse,
  version: StarterVersion,
): CustomScenarioPayload {
  const layout = getPresetById(presets.restaurant_layouts, form.restaurantLayoutId)
  const queue = getPresetById(presets.queue_structures, form.queueStructureId)
  const reservation = getPresetById(presets.reservation_policies, form.reservationPolicyId)
  const seating = getPresetById(presets.seating_policies, form.seatingPolicyId)
  const service = getPresetById(presets.service_policies, form.servicePolicyId)
  const arrivals = getPresetById(presets.arrival_scenarios, form.arrivalScenarioId)
  assertArrivalCompatibility(layout, arrivals)

  const config = {
    restaurant_name: layout.data.restaurant_name,
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
    scenario_name: `Option ${version}`,
    config_json: JSON.stringify(config, null, 2),
    policy_json: JSON.stringify(policyBundle, null, 2),
    arrivals_csv: arrivals.raw,
  }
}

/*
- What it does:
  Builds side-by-side overview rows for custom A/B builder selections.
- Inputs:
  Builder presets plus form state for sides A and B.
- Outputs:
  Rows marking changed and unchanged custom selections.
*/

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
