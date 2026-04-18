import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  fetchBuilderPresets,
  fetchCaseStudies,
  runCaseStudyComparison,
  runCustomScenario,
} from './api'
import {
  buildCaseStudyOverviewRows,
  buildCustomComparisonRows,
  buildCustomScenarioPayload,
  buildFormFromStarter,
  summarizeBuilderSelections,
} from './builder'
import type { CaseStudyOverviewRow } from './builder'
import type {
  BuilderFormState,
  BuilderPresetsResponse,
  CaseStudyMetadata,
  MetricsRecord,
  PairComparison,
  ScenarioResult,
} from './types'

type Mode = 'official' | 'custom'
type BuilderSide = 'A' | 'B'
type BuilderPairState = Record<BuilderSide, BuilderFormState>
type NumericMetricKey = Exclude<keyof MetricsRecord, 'scenario_name' | 'notes'>
type SignalTone = 'positive' | 'negative' | 'neutral'

const metricLabels: Record<NumericMetricKey, string> = {
  average_wait_time: 'Average wait for a table',
  max_wait_time: 'Longest wait any party faced',
  p90_wait_time: 'Wait time most parties stayed under',
  max_queue_length: 'Longest queue',
  groups_served: 'Parties seated',
  groups_abandoned: 'Parties who left the line',
  service_level_within_15_min: 'Seated within 15 minutes',
  service_level_within_30_min: 'Seated within 30 minutes',
  table_utilization_overall: 'Dining room use',
  reservation_fulfillment_rate: 'Bookings successfully seated',
  average_reservation_delay: 'Average delay for booked parties',
  average_table_fit_efficiency: 'Seat fit',
}

const metricCaptions: Partial<Record<NumericMetricKey, string>> = {
  average_wait_time: 'The typical time a party waits before being seated.',
  max_wait_time: 'The single worst wait anyone experienced that night.',
  p90_wait_time: 'Most parties were seated within this amount of time.',
  max_queue_length: 'The busiest point of the waitlist.',
  groups_served: 'Parties who were seated and completed their meal.',
  groups_abandoned: 'Parties who left before a table was ready.',
  service_level_within_15_min: 'Share of parties seated within 15 minutes.',
  service_level_within_30_min: 'Share of parties seated within 30 minutes.',
  table_utilization_overall: 'How fully the dining room stayed in use.',
  reservation_fulfillment_rate: 'Share of bookings that were honored with a table.',
  average_reservation_delay: 'How late booked parties were seated on average.',
  average_table_fit_efficiency: 'How closely table size matched party size.',
}

const ratioMetrics = new Set<NumericMetricKey>([
  'service_level_within_15_min',
  'service_level_within_30_min',
  'table_utilization_overall',
  'reservation_fulfillment_rate',
  'average_table_fit_efficiency',
])

const lowerIsBetterMetrics = new Set<NumericMetricKey>([
  'average_wait_time',
  'max_wait_time',
  'p90_wait_time',
  'max_queue_length',
  'groups_abandoned',
  'average_reservation_delay',
])

const comparisonTableMetrics: NumericMetricKey[] = [
  'average_wait_time',
  'max_wait_time',
  'p90_wait_time',
  'max_queue_length',
  'groups_served',
  'groups_abandoned',
  'service_level_within_15_min',
  'service_level_within_30_min',
  'table_utilization_overall',
  'reservation_fulfillment_rate',
  'average_reservation_delay',
  'average_table_fit_efficiency',
]

const chartMetrics = [
  'average_wait_time',
  'groups_served',
  'groups_abandoned',
  'max_queue_length',
  'table_utilization_overall',
 ] as const satisfies ReadonlyArray<NumericMetricKey>

type ChartMetric = (typeof chartMetrics)[number]

const comparisonChartLabels: Record<ChartMetric, string> = {
  average_wait_time: 'Average wait',
  groups_served: 'Parties seated',
  groups_abandoned: 'Left the line',
  max_queue_length: 'Longest queue',
  table_utilization_overall: 'Room use',
}

const pairPreviewMetrics = [
  'average_wait_time',
  'groups_served',
  'table_utilization_overall',
] as const satisfies ReadonlyArray<NumericMetricKey>

const chartTheme = {
  text: '#f7f1ea',
  muted: '#b7adc2',
  grid: 'rgba(216, 197, 173, 0.18)',
  border: 'rgba(216, 197, 173, 0.24)',
  tooltip: 'rgba(18, 15, 28, 0.96)',
}

function formatMetricValue(metric: NumericMetricKey, value: number) {
  if (ratioMetrics.has(metric)) {
    return `${(value * 100).toFixed(1)}%`
  }
  if (Number.isInteger(value)) {
    return value.toString()
  }
  return value.toFixed(2)
}

function formatDelta(metric: NumericMetricKey, value: number) {
  const formatted = ratioMetrics.has(metric)
    ? `${(Math.abs(value) * 100).toFixed(1)} pts`
    : formatMetricValue(metric, Math.abs(value))
  if (value > 0) {
    return `+${formatted}`
  }
  if (value < 0) {
    return `-${formatted}`
  }
  return formatted
}

function chartMetricValue(metric: NumericMetricKey, value: number) {
  return ratioMetrics.has(metric) ? Number((value * 100).toFixed(2)) : Number(value.toFixed(2))
}

function buildComparisonChartData(result: PairComparison) {
  return chartMetrics.map((metric) => ({
    metric: comparisonChartLabels[metric],
    A: chartMetricValue(metric, result.A.metrics[metric]),
    B: chartMetricValue(metric, result.B.metrics[metric]),
  }))
}

function buildPairPreviewRows(result: PairComparison) {
  return pairPreviewMetrics.map((metric) => {
    const valueA = result.A.metrics[metric]
    const valueB = result.B.metrics[metric]
    const scaledA = chartMetricValue(metric, valueA)
    const scaledB = chartMetricValue(metric, valueB)
    const maxValue = Math.max(scaledA, scaledB, 1)
    const delta = result.metric_deltas_b_minus_a[metric] ?? 0
    return {
      metric,
      label: metricLabels[metric],
      hint: metricDirectionHint(metric),
      tone: metricDirectionTone(metric, delta),
      valueA: formatMetricValue(metric, valueA),
      valueB: formatMetricValue(metric, valueB),
      widthA: `${Math.max((scaledA / maxValue) * 100, 14)}%`,
      widthB: `${Math.max((scaledB / maxValue) * 100, 14)}%`,
      difference: formatDelta(metric, delta),
    }
  })
}

function metricDirectionHint(metric: NumericMetricKey) {
  return lowerIsBetterMetrics.has(metric) ? 'Usually better when lower' : 'Usually better when higher'
}

function metricDirectionTone(metric: NumericMetricKey, delta: number): SignalTone {
  if (delta === 0) {
    return 'neutral'
  }
  const improved = lowerIsBetterMetrics.has(metric) ? delta < 0 : delta > 0
  return improved ? 'positive' : 'negative'
}

function signalToneFromRatio(value: number): SignalTone {
  if (value >= 0.75) {
    return 'positive'
  }
  if (value >= 0.45) {
    return 'neutral'
  }
  return 'negative'
}

function formatCaseStudyTitle(title: string) {
  return title.replace(/^Pair\s+\d+\s*:\s*/i, '').trim()
}

function buildRunIntel(result: ScenarioResult) {
  const highlightMetrics: NumericMetricKey[] = [
    'service_level_within_15_min',
    'service_level_within_30_min',
    'reservation_fulfillment_rate',
    'average_table_fit_efficiency',
  ]
  return highlightMetrics.map((metric) => ({
    metric,
    label: metricLabels[metric],
    value: formatMetricValue(metric, result.metrics[metric]),
    tone: signalToneFromRatio(result.metrics[metric]),
    caption: metricCaptions[metric] ?? 'Helpful summary signal.',
  }))
}

function getPresetTitle<T extends { id: string; title: string }>(options: T[], id: string) {
  return options.find((option) => option.id === id)?.title ?? 'Not selected'
}

function buildBuilderSnapshot(
  form: BuilderFormState,
  presets: BuilderPresetsResponse,
): Array<{ label: string; value: string }> {
  return [
    {
      label: 'Service window',
      value: `${form.simulationStart} to ${form.simulationEnd}`,
    },
    {
      label: 'Waitlist',
      value: getPresetTitle(presets.queue_structures, form.queueStructureId),
    },
    {
      label: 'Bookings',
      value: getPresetTitle(presets.reservation_policies, form.reservationPolicyId),
    },
    {
      label: 'Table reset',
      value: getPresetTitle(presets.service_policies, form.servicePolicyId),
    },
    {
      label: 'Arrival pattern',
      value: getPresetTitle(presets.arrival_scenarios, form.arrivalScenarioId),
    },
  ]
}

function buildMetricDeltaMap(
  resultA: ScenarioResult,
  resultB: ScenarioResult,
): PairComparison['metric_deltas_b_minus_a'] {
  return Object.fromEntries(
    comparisonTableMetrics.map((metric) => [
      metric,
      Number((resultB.metrics[metric] - resultA.metrics[metric]).toFixed(4)),
    ]),
  )
}

function buildCustomPairComparison(
  comparisonId: string,
  resultA: ScenarioResult,
  resultB: ScenarioResult,
): PairComparison {
  return {
    case_study: comparisonId,
    A: resultA,
    B: resultB,
    metric_deltas_b_minus_a: buildMetricDeltaMap(resultA, resultB),
  }
}

function AppShell() {
  const [mode, setMode] = useState<Mode>('official')
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [caseStudies, setCaseStudies] = useState<CaseStudyMetadata[]>([])
  const [selectedCaseStudy, setSelectedCaseStudy] = useState('')
  const [starterCaseStudy, setStarterCaseStudy] = useState('')
  const [builderPresets, setBuilderPresets] = useState<BuilderPresetsResponse | null>(null)
  const [customForms, setCustomForms] = useState<BuilderPairState | null>(null)

  const [pairResult, setPairResult] = useState<PairComparison | null>(null)
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [comparisonError, setComparisonError] = useState<string | null>(null)

  const [customLoading, setCustomLoading] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)
  const [customPairResult, setCustomPairResult] = useState<PairComparison | null>(null)

  const selectedCase = useMemo(
    () => caseStudies.find((entry) => entry.case_study === selectedCaseStudy) ?? null,
    [caseStudies, selectedCaseStudy],
  )

  const starterCase = useMemo(
    () => caseStudies.find((entry) => entry.case_study === starterCaseStudy) ?? null,
    [caseStudies, starterCaseStudy],
  )

  const comparisonChartData = useMemo(
    () => (pairResult ? buildComparisonChartData(pairResult) : []),
    [pairResult],
  )

  const customComparisonChartData = useMemo(
    () => (customPairResult ? buildComparisonChartData(customPairResult) : []),
    [customPairResult],
  )

  const generatedPayloads = useMemo(() => {
    if (!builderPresets || !customForms) {
      return null
    }
    return {
      A: buildCustomScenarioPayload(customForms.A, builderPresets),
      B: buildCustomScenarioPayload(customForms.B, builderPresets),
    }
  }, [builderPresets, customForms])

  const customOptionSnapshots = useMemo(() => {
    if (!builderPresets || !customForms) {
      return null
    }
    return {
      A: buildBuilderSnapshot(customForms.A, builderPresets),
      B: buildBuilderSnapshot(customForms.B, builderPresets),
    }
  }, [builderPresets, customForms])

  const customOptionSummaries = useMemo(() => {
    if (!builderPresets || !customForms) {
      return null
    }
    return {
      A: summarizeBuilderSelections(customForms.A, builderPresets),
      B: summarizeBuilderSelections(customForms.B, builderPresets),
    }
  }, [builderPresets, customForms])

  const pairOverviewRows = useMemo<CaseStudyOverviewRow[]>(() => {
    if (!builderPresets || !selectedCase) {
      return []
    }
    return buildCaseStudyOverviewRows(selectedCase, builderPresets)
  }, [builderPresets, selectedCase])

  const customComparisonRows = useMemo<CaseStudyOverviewRow[]>(() => {
    if (!builderPresets || !customForms) {
      return []
    }
    return buildCustomComparisonRows(customForms.A, customForms.B, builderPresets)
  }, [builderPresets, customForms])

  const starterOptions = useMemo(() => {
    return caseStudies.map((entry) => {
      const changedRow = builderPresets
        ? buildCaseStudyOverviewRows(entry, builderPresets).find((row) => row.changed)
        : null
      const focusLabel = entry.focus_label?.trim() || changedRow?.label.toLowerCase()
      return {
        id: entry.case_study,
        title: formatCaseStudyTitle(entry.title),
        description: focusLabel
          ? `Start from the guided comparison where ${focusLabel.toLowerCase()} is the main choice being tested.`
          : 'Start from this guided comparison and adapt it to your venue.',
      }
    })
  }, [builderPresets, caseStudies])

  const customRunIntel = useMemo(() => {
    if (!customPairResult) {
      return null
    }
    return {
      A: buildRunIntel(customPairResult.A),
      B: buildRunIntel(customPairResult.B),
    }
  }, [customPairResult])

  useEffect(() => {
    async function bootstrap() {
      try {
        const [caseStudyPayload, presetPayload] = await Promise.all([
          fetchCaseStudies(),
          fetchBuilderPresets(),
        ])

        setCaseStudies(caseStudyPayload.case_studies)
        setBuilderPresets(presetPayload)

        const initialCase = caseStudyPayload.case_studies[0] ?? null
        const initialCaseStudy = initialCase?.case_study ?? ''
        if (initialCaseStudy) {
          setSelectedCaseStudy(initialCaseStudy)
          setStarterCaseStudy(initialCaseStudy)
          setCustomForms({
            A: buildFormFromStarter(initialCase, 'A', presetPayload),
            B: buildFormFromStarter(initialCase, 'B', presetPayload),
          })
          setComparisonLoading(true)
          setComparisonError(null)
          try {
            const response = await runCaseStudyComparison(initialCaseStudy)
            setPairResult(response)
          } catch (error) {
            setComparisonError(error instanceof Error ? error.message : "We couldn't compare those two versions.")
          } finally {
            setComparisonLoading(false)
          }
        } else {
          setCustomForms({
            A: buildFormFromStarter(null, 'A', presetPayload),
            B: buildFormFromStarter(null, 'B', presetPayload),
          })
        }
      } catch (error) {
        setBootstrapError(error instanceof Error ? error.message : "We couldn't load the scenario list.")
      }
    }

    void bootstrap()
  }, [])

  async function handleRunComparison(caseStudy = selectedCaseStudy) {
    if (!caseStudy) {
      return
    }
    setComparisonLoading(true)
    setComparisonError(null)
    try {
      const response = await runCaseStudyComparison(caseStudy)
      setPairResult(response)
    } catch (error) {
      setComparisonError(error instanceof Error ? error.message : "We couldn't compare those two versions.")
    } finally {
      setComparisonLoading(false)
    }
  }

  function updateCustomForms(updater: (current: BuilderPairState) => BuilderPairState) {
    setCustomForms((current) => (current ? updater(current) : current))
    setCustomError(null)
    setCustomPairResult(null)
  }

  function updateCustomField<Key extends keyof BuilderFormState>(
    side: BuilderSide,
    key: Key,
    value: BuilderFormState[Key],
  ) {
    updateCustomForms((current) => ({
      ...current,
      [side]: {
        ...current[side],
        [key]: value,
      },
    }))
  }

  function handleApplyStarter(caseStudy = starterCaseStudy) {
    if (!builderPresets || !caseStudy) {
      return
    }
    const nextStarterCase = caseStudies.find((entry) => entry.case_study === caseStudy) ?? null
    setCustomForms({
      A: buildFormFromStarter(nextStarterCase, 'A', builderPresets),
      B: buildFormFromStarter(nextStarterCase, 'B', builderPresets),
    })
    setCustomError(null)
    setCustomPairResult(null)
  }

  function handleReservationPresetChange(side: BuilderSide, nextId: string) {
    updateCustomForms((current) => {
      if (!builderPresets) {
        return current
      }
      const currentForm = current[side]
      const preset = builderPresets.reservation_policies.find((item) => item.id === nextId)
      const holdMinutes = preset?.data.hold_tables_for_reservations
        ? Math.max(currentForm.holdMinutes, preset.data.default_hold_minutes || 10)
        : 0
      return {
        ...current,
        [side]: {
          ...currentForm,
          reservationPolicyId: nextId,
          holdMinutes,
        },
      }
    })
  }

  async function handleRunCustom() {
    if (!generatedPayloads) {
      return
    }
    setCustomLoading(true)
    setCustomError(null)
    try {
      const [resultA, resultB] = await Promise.all([
        runCustomScenario(generatedPayloads.A),
        runCustomScenario(generatedPayloads.B),
      ])
      setCustomPairResult(buildCustomPairComparison(starterCaseStudy || 'custom_compare', resultA, resultB))
    } catch (error) {
      setCustomError(
        error instanceof Error
          ? error.message
          : "We couldn't compare those two custom options right now.",
      )
    } finally {
      setCustomLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="hero hero-simple">
        <div className="hero-main">
          <p className="eyebrow">Restaurant Queue Comparison</p>
          <h1>Restaurant Configuration and Queue Comparison</h1>
          <p className="hero-copy">
            Compare restaurant layouts, waitlist setups, booking rules, and service policies across
            prepared scenario pairs or your own custom A/B comparison.
          </p>
        </div>
      </header>

      {bootstrapError ? <MessageCard tone="danger" message={bootstrapError} /> : null}

      <main className="layout">
        <section className="panel command-panel">
          <div className="command-copy">
            <p className="eyebrow">Choose a view</p>
            <h2>{mode === 'official' ? 'Prepared scenario pairs' : 'Custom A/B comparison'}</h2>
            <p className="muted">
              {mode === 'official'
                ? 'Each prepared pair changes one main configuration choice so you can compare the outcome more directly.'
                : 'Set up Option A and Option B, then compare both results and the difference from A to B.'}
            </p>
            <div className="mode-switch" role="tablist" aria-label="Planner mode">
              <button
                type="button"
                className={mode === 'official' ? 'mode-pill active' : 'mode-pill'}
                onClick={() => setMode('official')}
              >
                Scenario pairs
              </button>
              <button
                type="button"
                className={mode === 'custom' ? 'mode-pill active' : 'mode-pill'}
                onClick={() => setMode('custom')}
              >
                Custom comparison
              </button>
            </div>
          </div>
        </section>

        {mode === 'official' ? (
          <section className="panel official-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Scenario Pair</p>
                <h2>Compare two prepared configurations</h2>
              </div>
            </div>

            <div className="official-shell">
              <aside className="official-control-card">
                <label className="control-block">
                  <span className="control-label">Choose a service scenario</span>
                  <select
                    value={selectedCaseStudy}
                    onChange={(event) => setSelectedCaseStudy(event.target.value)}
                  >
                    {caseStudies.map((entry) => (
                      <option key={entry.case_study} value={entry.case_study}>
                        {formatCaseStudyTitle(entry.title)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="control-note muted">
                  Each scenario keeps most of the service plan steady and changes one main decision,
                  so the difference is easier to read.
                </p>
                <button
                  type="button"
                  className="primary control-button"
                  onClick={() => void handleRunComparison()}
                  disabled={comparisonLoading || !selectedCaseStudy}
                >
                  {comparisonLoading ? 'Loading the guest impact...' : 'Show the difference'}
                </button>
                {comparisonError ? <MessageCard tone="danger" message={comparisonError} /> : null}
              </aside>

              <div className="official-stage">
                {selectedCase && pairOverviewRows.length ? (
                  <PairOverviewTable
                    title={formatCaseStudyTitle(selectedCase.title)}
                    summary={selectedCase.summary}
                    rows={pairOverviewRows}
                    result={pairResult}
                  />
                ) : null}

                {pairResult ? (
                  <>
                    <div className="metric-grid metric-grid-compact">
                      <MetricCard
                        label="Average wait with Option A"
                        value={formatMetricValue(
                          'average_wait_time',
                          pairResult.A.metrics.average_wait_time,
                        )}
                        caption="Option A"
                        tone="blue"
                      />
                      <MetricCard
                        label="Average wait with Option B"
                        value={formatMetricValue(
                          'average_wait_time',
                          pairResult.B.metrics.average_wait_time,
                        )}
                        caption="Option B"
                        tone="teal"
                      />
                      <MetricCard
                        label="Extra parties seated with B"
                        value={formatDelta(
                          'groups_served',
                          pairResult.metric_deltas_b_minus_a.groups_served ?? 0,
                        )}
                        caption="Difference if you switch from A to B"
                        tone="purple"
                      />
                      <MetricCard
                        label="Change in dining room use with B"
                        value={formatDelta(
                          'table_utilization_overall',
                          pairResult.metric_deltas_b_minus_a.table_utilization_overall ?? 0,
                        )}
                        caption="Difference if you switch from A to B"
                        tone="amber"
                      />
                    </div>

                    <MessageCard
                      tone="neutral"
                      message='"Difference if you switch to B" compares Option B with Option A. A plus sign means the number is higher in B, a minus sign means it is lower, and percentage-based measures are shown in points so they are easier to read.'
                    />

                    <div className="chart-panel">
                      <div className="chart-header">
                        <div>
                          <h3>Guest experience side by side</h3>
                          <p className="muted">
                            Use this view when you want a quick read on where Option A and Option
                            B feel meaningfully different.
                          </p>
                        </div>
                      </div>
                      <div className="chart-wrap">
                        <ResponsiveContainer width="100%" height={320}>
                          <BarChart data={comparisonChartData} barGap={10}>
                            <defs>
                              <linearGradient id="officialBarA" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#67e8f9" />
                                <stop offset="100%" stopColor="#2563eb" />
                              </linearGradient>
                              <linearGradient id="officialBarB" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6ee7b7" />
                                <stop offset="100%" stopColor="#14b8a6" />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                            <XAxis
                              dataKey="metric"
                              angle={0}
                              textAnchor="middle"
                              interval={0}
                              tickMargin={12}
                              height={56}
                              stroke={chartTheme.grid}
                              tick={{ fill: chartTheme.muted, fontSize: 11 }}
                            />
                            <YAxis
                              stroke={chartTheme.grid}
                              tick={{ fill: chartTheme.muted, fontSize: 11 }}
                            />
                            <Tooltip
                              contentStyle={{
                                background: chartTheme.tooltip,
                                border: `1px solid ${chartTheme.border}`,
                                borderRadius: 18,
                                boxShadow: '0 20px 42px rgba(2, 6, 23, 0.48)',
                              }}
                              labelStyle={{ color: chartTheme.text, fontWeight: 700 }}
                              itemStyle={{ color: chartTheme.text }}
                            />
                            <Legend
                              wrapperStyle={{ color: chartTheme.text, paddingTop: 16 }}
                              formatter={(value) => (
                                <span style={{ color: chartTheme.text }}>{value}</span>
                              )}
                            />
                            <Bar
                              name="Option A"
                              dataKey="A"
                              fill="url(#officialBarA)"
                              radius={[10, 10, 0, 0]}
                              maxBarSize={44}
                            />
                            <Bar
                              name="Option B"
                              dataKey="B"
                              fill="url(#officialBarB)"
                              radius={[10, 10, 0, 0]}
                              maxBarSize={44}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <MetricComparisonTable result={pairResult} />
                  </>
                ) : (
                  <EmptyState
                    title="Pick a comparison to get started"
                    message='Choose one of the guided scenarios, then press "Show the difference" to preview how the guest experience changes.'
                  />
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="panel custom-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Custom Comparison</p>
                <h2>Set up Option A and Option B</h2>
              </div>
            </div>

            <p className="muted section-intro">
              Load a prepared pair, edit both options independently, and compare the two outcomes
              side by side.
            </p>

            {customError ? <MessageCard tone="danger" message={customError} /> : null}

            {!builderPresets || !customForms || !customOptionSnapshots || !customOptionSummaries ? (
              <EmptyState
                title="Loading comparison builder"
                message="Both option editors will appear in a moment."
              />
            ) : (
              <>
                <div className="custom-builder-column">
                  <div className="builder-section">
                    <div className="builder-section-head">
                      <div>
                        <p className="eyebrow">Starting Point</p>
                        <h3>Load a prepared A/B pair</h3>
                      </div>
                    </div>
                    <div className="builder-grid">
                      <SelectField
                        label="Prepared scenario pair"
                        value={starterCaseStudy}
                        onChange={setStarterCaseStudy}
                        options={starterOptions}
                      />
                      <ActionField
                        label="Load both options"
                        description="Option A loads the first setup from this pair and Option B loads the second setup."
                      >
                        <button
                          type="button"
                          onClick={() => handleApplyStarter()}
                          disabled={!starterCaseStudy}
                        >
                          Load Option A and Option B
                        </button>
                      </ActionField>
                    </div>
                  </div>

                  <div className="compare-builder-grid">
                    <ComparisonOptionCard
                      side="A"
                      form={customForms.A}
                      presets={builderPresets}
                      onFieldChange={updateCustomField}
                      onReservationPresetChange={handleReservationPresetChange}
                    />
                    <ComparisonOptionCard
                      side="B"
                      form={customForms.B}
                      presets={builderPresets}
                      onFieldChange={updateCustomField}
                      onReservationPresetChange={handleReservationPresetChange}
                    />
                  </div>

                  <div className="compare-summary-grid">
                    <CustomOptionSummaryCard
                      side="A"
                      title={customForms.A.scenarioName}
                      summary={customOptionSummaries.A}
                      snapshot={customOptionSnapshots.A}
                    />
                    <CustomOptionSummaryCard
                      side="B"
                      title={customForms.B.scenarioName}
                      summary={customOptionSummaries.B}
                      snapshot={customOptionSnapshots.B}
                    />
                  </div>

                  <div className="builder-summary-card compare-action-card">
                    <p className="eyebrow">Run Comparison</p>
                    <h3>Compare Option A with Option B</h3>
                    <p className="muted">
                      Both options are simulated separately, then every difference below is shown as
                      Option B minus Option A.
                    </p>
                    <button
                      type="button"
                      className="primary wide-button"
                      onClick={() => void handleRunCustom()}
                      disabled={customLoading || !generatedPayloads}
                    >
                      {customLoading
                        ? 'Comparing Option A and Option B...'
                        : 'Compare Option A and Option B'}
                    </button>
                  </div>
                </div>

                {customPairResult ? (
                  <section className="result-shell">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Custom Comparison Result</p>
                        <h3>
                          {starterCase
                            ? `${formatCaseStudyTitle(starterCase.title)} custom comparison`
                            : 'Custom option comparison'}
                        </h3>
                      </div>
                      <StatusChip tone="positive">Comparison ready</StatusChip>
                    </div>

                    <CustomComparisonSetupCard rows={customComparisonRows} />

                    <div className="metric-grid metric-grid-compact">
                      <MetricCard
                        label="Average wait with Option A"
                        value={formatMetricValue(
                          'average_wait_time',
                          customPairResult.A.metrics.average_wait_time,
                        )}
                        caption={customPairResult.A.scenario_name}
                        tone="blue"
                      />
                      <MetricCard
                        label="Average wait with Option B"
                        value={formatMetricValue(
                          'average_wait_time',
                          customPairResult.B.metrics.average_wait_time,
                        )}
                        caption={customPairResult.B.scenario_name}
                        tone="teal"
                      />
                      <MetricCard
                        label="Difference in parties seated"
                        value={formatDelta(
                          'groups_served',
                          customPairResult.metric_deltas_b_minus_a.groups_served ?? 0,
                        )}
                        caption="Option B minus Option A"
                        tone="purple"
                      />
                      <MetricCard
                        label="Difference in dining room use"
                        value={formatDelta(
                          'table_utilization_overall',
                          customPairResult.metric_deltas_b_minus_a.table_utilization_overall ?? 0,
                        )}
                        caption="Option B minus Option A"
                        tone="amber"
                      />
                    </div>

                    <MessageCard
                      tone="neutral"
                      message='"Difference" always means Option B minus Option A. A plus sign means the number is higher in B, a minus sign means it is lower, and percentage-based measures are shown in points.'
                    />

                    {customRunIntel ? (
                      <div className="compare-takeaways-grid">
                        <QuickTakeawaysCard
                          title="Option A highlights"
                          description={customPairResult.A.scenario_name}
                          highlights={customRunIntel.A}
                        />
                        <QuickTakeawaysCard
                          title="Option B highlights"
                          description={customPairResult.B.scenario_name}
                          highlights={customRunIntel.B}
                        />
                      </div>
                    ) : null}

                    <div className="chart-panel">
                      <div className="chart-header">
                        <div>
                          <h3>Guest experience side by side</h3>
                          <p className="muted">
                            Use this chart for a fast read on where the two custom options are most
                            different.
                          </p>
                        </div>
                      </div>
                      <div className="chart-wrap">
                        <ResponsiveContainer width="100%" height={320}>
                          <BarChart data={customComparisonChartData} barGap={10}>
                            <defs>
                              <linearGradient id="customBarA" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#67e8f9" />
                                <stop offset="100%" stopColor="#2563eb" />
                              </linearGradient>
                              <linearGradient id="customBarB" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6ee7b7" />
                                <stop offset="100%" stopColor="#14b8a6" />
                              </linearGradient>
                            </defs>
                            <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                            <XAxis
                              dataKey="metric"
                              angle={0}
                              textAnchor="middle"
                              interval={0}
                              tickMargin={12}
                              height={56}
                              stroke={chartTheme.grid}
                              tick={{ fill: chartTheme.muted, fontSize: 11 }}
                            />
                            <YAxis
                              stroke={chartTheme.grid}
                              tick={{ fill: chartTheme.muted, fontSize: 11 }}
                            />
                            <Tooltip
                              contentStyle={{
                                background: chartTheme.tooltip,
                                border: `1px solid ${chartTheme.border}`,
                                borderRadius: 18,
                                boxShadow: '0 20px 42px rgba(2, 6, 23, 0.48)',
                              }}
                              labelStyle={{ color: chartTheme.text, fontWeight: 700 }}
                              itemStyle={{ color: chartTheme.text }}
                            />
                            <Legend
                              wrapperStyle={{ color: chartTheme.text, paddingTop: 16 }}
                              formatter={(value) => (
                                <span style={{ color: chartTheme.text }}>{value}</span>
                              )}
                            />
                            <Bar
                              name="Option A"
                              dataKey="A"
                              fill="url(#customBarA)"
                              radius={[10, 10, 0, 0]}
                              maxBarSize={44}
                            />
                            <Bar
                              name="Option B"
                              dataKey="B"
                              fill="url(#customBarB)"
                              radius={[10, 10, 0, 0]}
                              maxBarSize={44}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <MetricComparisonTable result={customPairResult} />
                  </section>
                ) : (
                  <EmptyState
                    title="No comparison yet"
                    message='Load or edit both options, then choose "Compare Option A and Option B" to see both results and the difference.'
                  />
                )}
              </>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

function ComparisonOptionCard({
  side,
  form,
  presets,
  onFieldChange,
  onReservationPresetChange,
}: {
  side: BuilderSide
  form: BuilderFormState
  presets: BuilderPresetsResponse
  onFieldChange: <Key extends keyof BuilderFormState>(
    side: BuilderSide,
    key: Key,
    value: BuilderFormState[Key],
  ) => void
  onReservationPresetChange: (side: BuilderSide, nextId: string) => void
}) {
  const holdEnabled =
    presets.reservation_policies.find((item) => item.id === form.reservationPolicyId)?.data
      .hold_tables_for_reservations ?? false

  return (
    <article className={`compare-option-card option-${side.toLowerCase()}`}>
      <div className="compare-option-head">
        <p className="eyebrow">Option {side}</p>
        <h3>{side === 'A' ? 'First configuration' : 'Second configuration'}</h3>
        <p className="muted">
          {side === 'A'
            ? 'Edit the first option in this comparison.'
            : 'Edit the second option in this comparison.'}
        </p>
      </div>

      <div className="compare-option-grid">
        <InputField
          label="Option name"
          value={form.scenarioName}
          onChange={(value) => onFieldChange(side, 'scenarioName', value)}
          description="Choose a short name that makes this option easy to recognize."
        />
        <InputField
          label="Venue name"
          value={form.restaurantName}
          onChange={(value) => onFieldChange(side, 'restaurantName', value)}
          description="The name shown for this dining room setup."
        />
        <InputField
          label="Opens at"
          type="time"
          value={form.simulationStart}
          onChange={(value) => onFieldChange(side, 'simulationStart', value)}
          description="When guests can start joining the service window."
        />
        <InputField
          label="Stops seating at"
          type="time"
          value={form.simulationEnd}
          onChange={(value) => onFieldChange(side, 'simulationEnd', value)}
          description="When the venue stops seating new parties."
        />
        <PresetField
          label="Dining room layout"
          value={form.restaurantLayoutId}
          onChange={(value) => onFieldChange(side, 'restaurantLayoutId', value)}
          options={presets.restaurant_layouts}
        />
        <PresetField
          label="Waitlist style"
          value={form.queueStructureId}
          onChange={(value) => onFieldChange(side, 'queueStructureId', value)}
          options={presets.queue_structures}
        />
        <PresetField
          label="Booking handling"
          value={form.reservationPolicyId}
          onChange={(value) => onReservationPresetChange(side, value)}
          options={presets.reservation_policies}
        />
        <NumberField
          label="Hold time for bookings"
          value={form.holdMinutes}
          min={0}
          disabled={!holdEnabled}
          onChange={(value) => onFieldChange(side, 'holdMinutes', value)}
          description="How long a booked table stays protected before it can be offered to someone else."
        />
        <PresetField
          label="Table assignment style"
          value={form.seatingPolicyId}
          onChange={(value) => onFieldChange(side, 'seatingPolicyId', value)}
          options={presets.seating_policies}
        />
        <PresetField
          label="Table reset pace"
          value={form.servicePolicyId}
          onChange={(value) => onFieldChange(side, 'servicePolicyId', value)}
          options={presets.service_policies}
        />
        <SelectField
          label="Long-wait behaviour"
          value={form.abandonmentEnabled ? 'enabled' : 'disabled'}
          onChange={(value) => onFieldChange(side, 'abandonmentEnabled', value === 'enabled')}
          options={[
            {
              id: 'disabled',
              title: 'Parties stay on the waitlist',
              description: 'Every party keeps waiting until they are seated or the venue closes.',
            },
            {
              id: 'enabled',
              title: 'Parties may leave',
              description: 'Some parties may give up and leave if the wait grows too long.',
            },
          ]}
        />
        <PresetField
          label="Arrival pattern"
          value={form.arrivalScenarioId}
          onChange={(value) => onFieldChange(side, 'arrivalScenarioId', value)}
          options={presets.arrival_scenarios}
          wide
        />
      </div>
    </article>
  )
}

function CustomOptionSummaryCard({
  side,
  title,
  summary,
  snapshot,
}: {
  side: BuilderSide
  title: string
  summary: string
  snapshot: Array<{ label: string; value: string }>
}) {
  return (
    <div className={`builder-summary-card compare-summary-card option-${side.toLowerCase()}`}>
      <p className="eyebrow">Option {side}</p>
      <h3>{title}</h3>
      <p className="muted">{summary}</p>
      <div className="builder-summary-grid">
        {snapshot.map((item) => (
          <InfoTile
            key={`${side}-${item.label}`}
            label={item.label}
            value={item.value}
            caption={`Option ${side}`}
            compact
          />
        ))}
      </div>
    </div>
  )
}

function CustomComparisonSetupCard({ rows }: { rows: CaseStudyOverviewRow[] }) {
  return (
    <div className="table-card">
      <div className="chart-header">
        <div>
          <h3>Current A/B setup</h3>
          <p className="muted">
            Review the two configurations before reading the outcome. Rows marked "Different" are
            the settings that change between Option A and Option B.
          </p>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Configuration area</th>
              <th>Option A</th>
              <th>Option B</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.versionA}</td>
                <td>{row.versionB}</td>
                <td>
                  <div className="table-note">
                    <span className={row.changed ? 'table-chip changed' : 'table-chip same'}>
                      {row.changed ? 'Different' : 'Matched'}
                    </span>
                    <span>
                      {row.changed
                        ? 'This setting changes between the two options.'
                        : 'This setting stays the same in both options.'}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PairOverviewTable({
  title,
  summary,
  rows,
  result,
}: {
  title: string
  summary: string
  rows: CaseStudyOverviewRow[]
  result: PairComparison | null
}) {
  const highlightRow = rows.find((row) => row.changed) ?? rows[0]
  const sharedRows = rows.filter((row) => !row.changed)
  const summaryText =
    summary.trim() ||
    `This comparison keeps most of the service plan fixed while changing ${
      highlightRow?.label.toLowerCase() ?? 'one main choice'
    }.`

  return (
    <div className="table-card pair-overview-card">
      <div className="pair-story-grid">
        <div className="pair-story-copy">
          <p className="eyebrow">Featured scenario</p>
          <h3>{title}</h3>
          <p className="muted pair-summary">{summaryText}</p>

          {highlightRow ? (
            <div className="pair-focus-grid">
              <article className="pair-option-card option-a">
                <span className="pair-option-label">Option A</span>
                <strong>{highlightRow.versionA}</strong>
                <span>{highlightRow.label}</span>
              </article>
              <article className="pair-option-card option-b">
                <span className="pair-option-label">Option B</span>
                <strong>{highlightRow.versionB}</strong>
                <span>{highlightRow.label}</span>
              </article>
            </div>
          ) : null}

          {sharedRows.length ? (
            <div className="pair-shared-block">
              <span className="pair-shared-title">Everything else stays matched</span>
              <div className="tag-row">
                {sharedRows.map((row) => (
                  <span key={row.label} className="tag-chip">
                    {row.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <PairAtAGlanceCard result={result} />
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Experience area</th>
              <th>Option A</th>
              <th>Option B</th>
              <th>Why it matters</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.versionA}</td>
                <td>{row.versionB}</td>
                <td>
                  <div className="table-note">
                    <span className={row.changed ? 'table-chip changed' : 'table-chip same'}>
                      {row.changed ? 'Main difference' : 'Held steady'}
                    </span>
                    <span>
                      {row.changed
                        ? 'This is the service choice being tested between the two options.'
                        : 'This part stays the same so the effect of the main change is easier to read.'}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PairAtAGlanceCard({ result }: { result: PairComparison | null }) {
  if (!result) {
    return (
      <div className="pair-glance-card">
        <p className="eyebrow">Quick visual read</p>
        <h4>Run the comparison to preview the shift</h4>
        <p className="muted">
          You will see how wait time, seated parties, and dining room use move between the two
          options.
        </p>
      </div>
    )
  }

  const previewRows = buildPairPreviewRows(result)

  return (
    <div className="pair-glance-card">
      <p className="eyebrow">Quick visual read</p>
      <h4>If you switch to Option B</h4>
      <p className="muted">
        Longer bars mean larger numbers. Use the note under each row to judge whether larger or
        smaller usually feels better for guests.
      </p>

      <div className="pair-mini-chart">
        {previewRows.map((row) => (
          <div key={row.metric} className="pair-chart-row">
            <div className="pair-chart-head">
              <strong>{row.label}</strong>
              <span>{row.hint}</span>
            </div>

            <div className="pair-bar-line">
              <span className="pair-bar-label">A</span>
              <div className="pair-bar-track">
                <span className="pair-bar-fill option-a" style={{ width: row.widthA }} />
              </div>
              <span className="pair-bar-value">{row.valueA}</span>
            </div>

            <div className="pair-bar-line">
              <span className="pair-bar-label">B</span>
              <div className="pair-bar-track">
                <span className="pair-bar-fill option-b" style={{ width: row.widthB }} />
              </div>
              <span className="pair-bar-value">{row.valueB}</span>
            </div>

            <div className={`pair-difference-note ${row.tone}`}>
              Difference if you switch to B: {row.difference}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricComparisonTable({ result }: { result: PairComparison }) {
  return (
    <div className="table-card">
      <div className="chart-header">
        <div>
          <h3>Detailed comparison</h3>
          <p className="muted">
            Use this table when you want to compare both options one guest-experience measure at a
            time.
          </p>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Guest experience measure</th>
              <th>Usually better when</th>
              <th>Option A</th>
              <th>Option B</th>
              <th>Difference if you switch to B</th>
            </tr>
          </thead>
          <tbody>
            {comparisonTableMetrics.map((metric) => {
              const delta = result.metric_deltas_b_minus_a[metric] ?? 0
              const tone = metricDirectionTone(metric, delta)
              return (
                <tr key={metric}>
                  <td>{metricLabels[metric]}</td>
                  <td>{metricDirectionHint(metric)}</td>
                  <td>{formatMetricValue(metric, result.A.metrics[metric])}</td>
                  <td>{formatMetricValue(metric, result.B.metrics[metric])}</td>
                  <td className={`delta-cell ${tone}`}>{formatDelta(metric, delta)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function QuickTakeawaysCard({
  title = 'What stands out',
  description = 'A few fast ways to read the overall feel of this service plan.',
  highlights,
}: {
  title?: string
  description?: string
  highlights: { metric: NumericMetricKey; label: string; value: string; tone: SignalTone; caption: string }[]
}) {
  return (
    <div className="table-card highlights-card">
      <div className="chart-header">
        <div>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>
      </div>

      <div className="signal-list">
        {highlights.map((item) => (
          <div key={item.metric} className={`signal-row ${item.tone}`}>
            <div>
              <strong>{item.label}</strong>
              <span>{item.caption}</span>
            </div>
            <span className="signal-value">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  caption,
  tone = 'neutral',
}: {
  label: string
  value: string
  caption: string
  tone?: 'blue' | 'teal' | 'purple' | 'amber' | 'neutral'
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-caption">{caption}</span>
    </article>
  )
}

function InfoTile({
  label,
  value,
  caption,
  mono = false,
  compact = false,
}: {
  label: string
  value: string
  caption: string
  mono?: boolean
  compact?: boolean
}) {
  return (
    <article className={compact ? 'info-tile compact' : 'info-tile'}>
      <span className="info-label">{label}</span>
      <strong className={mono ? 'info-value mono' : 'info-value'}>{value}</strong>
      <span className="info-caption">{caption}</span>
    </article>
  )
}

function StatusChip({
  tone,
  children,
}: {
  tone: SignalTone
  children: React.ReactNode
}) {
  return <span className={`status-chip ${tone}`}>{children}</span>
}

function PresetField<T extends { id: string; title: string; description: string }>({
  label,
  value,
  onChange,
  options,
  wide = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: T[]
  wide?: boolean
}) {
  const selected = options.find((option) => option.id === value)
  return (
    <label className={wide ? 'builder-card builder-card-wide' : 'builder-card'}>
      <span className="builder-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title}
          </option>
        ))}
      </select>
      <p className="builder-help">
        {selected?.description || 'Choose the option that best fits your scenario.'}
      </p>
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { id: string; title: string; description: string }[]
}) {
  const selected = options.find((option) => option.id === value)
  return (
    <label className="builder-card">
      <span className="builder-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.title}
          </option>
        ))}
      </select>
      <p className="builder-help">{selected?.description || 'Choose one option to continue.'}</p>
    </label>
  )
}

function InputField({
  label,
  value,
  onChange,
  description,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  description: string
  type?: 'text' | 'time'
}) {
  return (
    <label className="builder-card">
      <span className="builder-label">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      <p className="builder-help">{description}</p>
    </label>
  )
}

function NumberField({
  label,
  value,
  min,
  disabled,
  onChange,
  description,
}: {
  label: string
  value: number
  min: number
  disabled: boolean
  onChange: (value: number) => void
  description: string
}) {
  return (
    <label className="builder-card">
      <span className="builder-label">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Math.max(min, Number(event.target.value) || 0))}
      />
      <p className="builder-help">{description}</p>
    </label>
  )
}

function ActionField({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="builder-card">
      <span className="builder-label">{label}</span>
      <div className="builder-action">{children}</div>
      <p className="builder-help">{description}</p>
    </div>
  )
}

function MessageCard({ tone, message }: { tone: 'danger' | 'neutral'; message: string }) {
  return <div className={`message-card ${tone}`}>{message}</div>
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  )
}

export default AppShell
