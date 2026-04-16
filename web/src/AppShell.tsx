import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
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
  API_BASE_URL,
  fetchBuilderPresets,
  fetchCaseStudies,
  fetchSchemas,
  runCaseStudyComparison,
  runCustomScenario,
} from './api'
import {
  buildCustomScenarioPayload,
  buildFormFromStarter,
  summarizeBuilderSelections,
} from './builder'
import type {
  BuilderFormState,
  BuilderPresetsResponse,
  CaseStudyMetadata,
  GroupOutcome,
  MetricsRecord,
  PairComparison,
  ScenarioResult,
} from './types'

type Mode = 'official' | 'custom'
type NumericMetricKey = Exclude<keyof MetricsRecord, 'scenario_name' | 'notes'>
type SignalTone = 'positive' | 'negative' | 'neutral'

const PRODUCTION_FRONTEND_URL = 'https://comp-1110-c08-dashboard.onrender.com'
const PRODUCTION_BACKEND_URL = 'https://comp-1110-c08.onrender.com'

const metricLabels: Record<NumericMetricKey, string> = {
  average_wait_time: 'Average Wait',
  max_wait_time: 'Max Wait',
  p90_wait_time: 'P90 Wait',
  max_queue_length: 'Max Queue',
  groups_served: 'Groups Served',
  groups_abandoned: 'Groups Abandoned',
  service_level_within_15_min: 'Service <= 15 min',
  service_level_within_30_min: 'Service <= 30 min',
  table_utilization_overall: 'Table Utilization',
  reservation_fulfillment_rate: 'Reservation Fulfillment',
  average_reservation_delay: 'Avg Reservation Delay',
  average_table_fit_efficiency: 'Avg Table Fit',
}

const metricCaptions: Partial<Record<NumericMetricKey, string>> = {
  average_wait_time: 'Minutes per group on average.',
  max_wait_time: 'Worst observed wait in the run.',
  p90_wait_time: 'Peak wait pressure at the 90th percentile.',
  max_queue_length: 'Largest queue depth observed.',
  groups_served: 'Completed dining parties.',
  groups_abandoned: 'Demand lost before seating.',
  service_level_within_15_min: 'Share seated within 15 minutes.',
  service_level_within_30_min: 'Share seated within 30 minutes.',
  table_utilization_overall: 'Fraction of occupied table time.',
  reservation_fulfillment_rate: 'Reservations seated successfully.',
  average_reservation_delay: 'Delay against reservation time.',
  average_table_fit_efficiency: 'How tightly party sizes fit tables.',
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

const summaryMetrics: NumericMetricKey[] = [
  'average_wait_time',
  'p90_wait_time',
  'groups_served',
  'groups_abandoned',
  'max_queue_length',
  'table_utilization_overall',
]

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

const chartMetrics: NumericMetricKey[] = [
  'average_wait_time',
  'groups_served',
  'groups_abandoned',
  'max_queue_length',
  'table_utilization_overall',
]

const comparisonSignalMetrics: NumericMetricKey[] = [
  'average_wait_time',
  'groups_served',
  'groups_abandoned',
  'table_utilization_overall',
]

const chartTheme = {
  text: '#e2e8f0',
  muted: '#8ea4c5',
  grid: 'rgba(148, 163, 184, 0.16)',
  border: 'rgba(148, 163, 184, 0.22)',
  tooltip: 'rgba(4, 11, 24, 0.95)',
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
  const formatted = formatMetricValue(metric, Math.abs(value))
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
    metric: metricLabels[metric],
    A: chartMetricValue(metric, result.A.metrics[metric]),
    B: chartMetricValue(metric, result.B.metrics[metric]),
  }))
}

function metricDirectionHint(metric: NumericMetricKey) {
  return lowerIsBetterMetrics.has(metric) ? 'Lower is better' : 'Higher is better'
}

function metricDirectionTone(metric: NumericMetricKey, delta: number): SignalTone {
  if (delta === 0) {
    return 'neutral'
  }
  const improved = lowerIsBetterMetrics.has(metric) ? delta < 0 : delta > 0
  return improved ? 'positive' : 'negative'
}

function buildImprovementSummary(result: PairComparison) {
  return comparisonTableMetrics.reduce(
    (summary, metric) => {
      const delta = result.metric_deltas_b_minus_a[metric] ?? 0
      if (delta === 0) {
        summary.unchanged += 1
      } else if (metricDirectionTone(metric, delta) === 'positive') {
        summary.improved += 1
      } else {
        summary.worsened += 1
      }
      return summary
    },
    { improved: 0, worsened: 0, unchanged: 0 },
  )
}

function buildMetricLeaderboard(result: PairComparison) {
  return comparisonTableMetrics
    .map((metric) => {
      const delta = result.metric_deltas_b_minus_a[metric] ?? 0
      return {
        metric,
        delta,
        tone: metricDirectionTone(metric, delta),
      }
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, 6)
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
    caption: metricCaptions[metric] ?? 'Operational quality signal.',
  }))
}

function extractHost(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url.replace(/^https?:\/\//, '')
  }
}

function getPresetTitle<T extends { id: string; title: string }>(options: T[], id: string) {
  return options.find((option) => option.id === id)?.title ?? 'Not selected'
}

function titleCaseKey(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function statusTone(status: string) {
  if (status === 'completed') {
    return 'success'
  }
  if (status === 'abandoned' || status === 'no_show') {
    return 'danger'
  }
  return 'neutral'
}

function AppShell() {
  const [mode, setMode] = useState<Mode>('official')
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [caseStudies, setCaseStudies] = useState<CaseStudyMetadata[]>([])
  const [selectedCaseStudy, setSelectedCaseStudy] = useState('')
  const [starterCaseStudy, setStarterCaseStudy] = useState('')
  const [starterVersion, setStarterVersion] = useState<'A' | 'B'>('A')
  const [schemas, setSchemas] = useState<Record<string, string>>({})
  const [builderPresets, setBuilderPresets] = useState<BuilderPresetsResponse | null>(null)
  const [customForm, setCustomForm] = useState<BuilderFormState | null>(null)

  const [pairResult, setPairResult] = useState<PairComparison | null>(null)
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [comparisonError, setComparisonError] = useState<string | null>(null)

  const [customLoading, setCustomLoading] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)
  const [customResult, setCustomResult] = useState<ScenarioResult | null>(null)

  const selectedCase = useMemo(
    () => caseStudies.find((entry) => entry.case_study === selectedCaseStudy) ?? null,
    [caseStudies, selectedCaseStudy],
  )

  const comparisonChartData = useMemo(
    () => (pairResult ? buildComparisonChartData(pairResult) : []),
    [pairResult],
  )

  const totalPresetCount = useMemo(() => {
    if (!builderPresets) {
      return 0
    }
    return (
      builderPresets.restaurant_layouts.length +
      builderPresets.queue_structures.length +
      builderPresets.reservation_policies.length +
      builderPresets.seating_policies.length +
      builderPresets.service_policies.length +
      builderPresets.arrival_scenarios.length
    )
  }, [builderPresets])

  const heroStats = useMemo(
    () => [
      {
        label: 'Official labs',
        value: caseStudies.length ? String(caseStudies.length) : '--',
        caption: 'published A/B experiment pairs',
        mono: false,
      },
      {
        label: 'Builder modules',
        value: totalPresetCount ? String(totalPresetCount) : '--',
        caption: 'guided controls ready to remix',
        mono: false,
      },
      {
        label: 'Production web',
        value: extractHost(PRODUCTION_FRONTEND_URL),
        caption: 'fixed public dashboard entry',
        mono: true,
      },
      {
        label: 'API target',
        value: extractHost(API_BASE_URL),
        caption:
          API_BASE_URL === PRODUCTION_BACKEND_URL
            ? 'live production backend'
            : 'current build environment target',
        mono: true,
      },
    ],
    [caseStudies.length, totalPresetCount],
  )

  const systemCards = useMemo(
    () => [
      {
        label: 'Current mode',
        value: mode === 'official' ? 'Official cockpit' : 'Custom lab',
        caption:
          mode === 'official'
            ? 'Compare the published case-study pairs.'
            : 'Shape your own operating scenario.',
      },
      {
        label: 'Primary action',
        value: mode === 'official' ? 'Run A/B comparison' : 'Run custom simulation',
        caption: 'Production API calls are wired into the deployed frontend build.',
      },
      {
        label: 'Stable front door',
        value: extractHost(PRODUCTION_FRONTEND_URL),
        caption: 'Keep the Render service name unchanged to keep this URL.',
      },
    ],
    [mode],
  )

  const generatedPayload = useMemo(() => {
    if (!builderPresets || !customForm) {
      return null
    }
    return buildCustomScenarioPayload(customForm, builderPresets)
  }, [builderPresets, customForm])

  const builderSummary = useMemo(() => {
    if (!builderPresets || !customForm) {
      return ''
    }
    return summarizeBuilderSelections(customForm, builderPresets)
  }, [builderPresets, customForm])

  const builderSnapshot = useMemo(() => {
    if (!builderPresets || !customForm) {
      return []
    }
    return [
      {
        label: 'Starter pair',
        value:
          caseStudies.find((entry) => entry.case_study === starterCaseStudy)?.title ??
          'Choose a starter',
      },
      {
        label: 'Service window',
        value: `${customForm.simulationStart} to ${customForm.simulationEnd}`,
      },
      {
        label: 'Queue structure',
        value: getPresetTitle(builderPresets.queue_structures, customForm.queueStructureId),
      },
      {
        label: 'Service policy',
        value: getPresetTitle(builderPresets.service_policies, customForm.servicePolicyId),
      },
      {
        label: 'Reservation mode',
        value: getPresetTitle(builderPresets.reservation_policies, customForm.reservationPolicyId),
      },
      {
        label: 'Demand pattern',
        value: getPresetTitle(builderPresets.arrival_scenarios, customForm.arrivalScenarioId),
      },
    ]
  }, [builderPresets, caseStudies, customForm, starterCaseStudy])

  const comparisonSignals = useMemo(() => {
    if (!pairResult) {
      return []
    }
    return comparisonSignalMetrics.map((metric) => {
      const delta = pairResult.metric_deltas_b_minus_a[metric] ?? 0
      return {
        metric,
        label: metricLabels[metric],
        value: formatDelta(metric, delta),
        tone: metricDirectionTone(metric, delta),
        caption: `${metricDirectionHint(metric)}. B minus A.`,
      }
    })
  }, [pairResult])

  const comparisonSummary = useMemo(
    () => (pairResult ? buildImprovementSummary(pairResult) : null),
    [pairResult],
  )

  const comparisonLeaderboard = useMemo(
    () => (pairResult ? buildMetricLeaderboard(pairResult) : []),
    [pairResult],
  )

  const runIntel = useMemo(() => (customResult ? buildRunIntel(customResult) : []), [customResult])

  useEffect(() => {
    async function bootstrap() {
      try {
        const [caseStudyPayload, schemaPayload, presetPayload] = await Promise.all([
          fetchCaseStudies(),
          fetchSchemas(),
          fetchBuilderPresets(),
        ])

        setCaseStudies(caseStudyPayload.case_studies)
        setSchemas(schemaPayload.schemas)
        setBuilderPresets(presetPayload)

        const initialCaseStudy = caseStudyPayload.case_studies[0]?.case_study ?? ''
        if (initialCaseStudy) {
          setSelectedCaseStudy(initialCaseStudy)
          setStarterCaseStudy(initialCaseStudy)
          setCustomForm(buildFormFromStarter(initialCaseStudy, 'A', presetPayload))
          setComparisonLoading(true)
          setComparisonError(null)
          try {
            const response = await runCaseStudyComparison(initialCaseStudy)
            setPairResult(response)
          } catch (error) {
            setComparisonError(
              error instanceof Error ? error.message : 'Unable to run case-study comparison.',
            )
          } finally {
            setComparisonLoading(false)
          }
        } else {
          setCustomForm(buildFormFromStarter('pair_01_table_mix', 'A', presetPayload))
        }
      } catch (error) {
        setBootstrapError(
          error instanceof Error ? error.message : 'Failed to load dashboard metadata.',
        )
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
      setComparisonError(
        error instanceof Error ? error.message : 'Unable to run case-study comparison.',
      )
    } finally {
      setComparisonLoading(false)
    }
  }

  function updateCustomForm(updater: (current: BuilderFormState) => BuilderFormState) {
    setCustomForm((current) => (current ? updater(current) : current))
    setCustomError(null)
    setCustomResult(null)
  }

  function updateCustomField<Key extends keyof BuilderFormState>(
    key: Key,
    value: BuilderFormState[Key],
  ) {
    updateCustomForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function handleApplyStarter(caseStudy = starterCaseStudy, version = starterVersion) {
    if (!builderPresets || !caseStudy) {
      return
    }
    setCustomForm(buildFormFromStarter(caseStudy, version, builderPresets))
    setCustomError(null)
    setCustomResult(null)
  }

  function handleReservationPresetChange(nextId: string) {
    updateCustomForm((current) => {
      if (!builderPresets) {
        return current
      }
      const preset = builderPresets.reservation_policies.find((item) => item.id === nextId)
      const holdMinutes = preset?.data.hold_tables_for_reservations
        ? Math.max(current.holdMinutes, preset.data.default_hold_minutes || 10)
        : 0
      return {
        ...current,
        reservationPolicyId: nextId,
        holdMinutes,
      }
    })
  }

  async function handleRunCustom() {
    if (!generatedPayload) {
      return
    }
    setCustomLoading(true)
    setCustomError(null)
    try {
      const response = await runCustomScenario(generatedPayload)
      setCustomResult(response)
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : 'Custom simulation failed.')
    } finally {
      setCustomLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-main">
          <div className="hero-kicker-row">
            <p className="eyebrow">COMP1110 Topic C</p>
            <div className="status-cluster">
              <StatusChip tone="positive">Stable Render URL</StatusChip>
              <StatusChip tone="neutral">{extractHost(PRODUCTION_FRONTEND_URL)}</StatusChip>
            </div>
          </div>
          <h1>Restaurant Queue Command Center</h1>
          <p className="hero-copy">
            Monitor official experiments, launch guided scenarios, and inspect wait-time, throughput,
            and table behavior from a single production-grade operations dashboard.
          </p>
          <div className="hero-links">
            <a
              className="ghost-link"
              href={PRODUCTION_FRONTEND_URL}
              target="_blank"
              rel="noreferrer"
            >
              Open production dashboard
            </a>
            <a
              className="ghost-link"
              href={`${PRODUCTION_BACKEND_URL}/health`}
              target="_blank"
              rel="noreferrer"
            >
              Open API health
            </a>
          </div>
        </div>
        <div className="hero-stat-grid">
          {heroStats.map((item) => (
            <InfoTile
              key={item.label}
              label={item.label}
              value={item.value}
              caption={item.caption}
              mono={item.mono}
            />
          ))}
        </div>
      </header>

      {bootstrapError ? <MessageCard tone="danger" message={bootstrapError} /> : null}

      <main className="layout">
        <section className="panel command-panel">
          <div className="command-grid">
            <div className="command-copy">
              <p className="eyebrow">Operations Console</p>
              <h2>Simulation Control Center</h2>
              <p className="muted">
                Switch between the official experiment cockpit and the custom scenario lab. The
                deployed frontend is wired to the production API target baked into the Render build.
              </p>
              <div className="mode-switch" role="tablist" aria-label="Dashboard mode">
                <button
                  type="button"
                  className={mode === 'official' ? 'mode-pill active' : 'mode-pill'}
                  onClick={() => setMode('official')}
                >
                  Official Scenarios
                </button>
                <button
                  type="button"
                  className={mode === 'custom' ? 'mode-pill active' : 'mode-pill'}
                  onClick={() => setMode('custom')}
                >
                  Custom Scenario
                </button>
              </div>
            </div>
            <div className="system-status-grid">
              {systemCards.map((item) => (
                <InfoTile
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  caption={item.caption}
                  compact
                />
              ))}
            </div>
          </div>
        </section>

        {mode === 'official' ? (
          <section className="panel official-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Official Experiment Lab</p>
                <h2>Case-Study Comparison</h2>
              </div>
              {comparisonSummary ? (
                <div className="score-pill-row">
                  <StatusChip tone="positive">{comparisonSummary.improved} improved</StatusChip>
                  <StatusChip tone="negative">{comparisonSummary.worsened} slipped</StatusChip>
                  <StatusChip tone="neutral">{comparisonSummary.unchanged} flat</StatusChip>
                </div>
              ) : null}
            </div>

            <div className="official-shell">
              <aside className="official-control-card">
                <label className="control-block">
                  <span className="control-label">Scenario pair</span>
                  <select
                    value={selectedCaseStudy}
                    onChange={(event) => setSelectedCaseStudy(event.target.value)}
                  >
                    {caseStudies.map((entry) => (
                      <option key={entry.case_study} value={entry.case_study}>
                        {entry.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="primary control-button"
                  onClick={() => void handleRunComparison()}
                  disabled={comparisonLoading || !selectedCaseStudy}
                >
                  {comparisonLoading ? 'Refreshing production comparison...' : 'Run A/B comparison'}
                </button>
                <p className="muted control-note">
                  Comparison calls are hitting the live API at `{extractHost(API_BASE_URL)}`.
                </p>

                {selectedCase ? (
                  <div className="scenario-summary-card">
                    <p className="eyebrow">Selected Pair</p>
                    <h3>{selectedCase.title}</h3>
                    <p className="muted">{selectedCase.summary}</p>
                    <div className="tag-row">
                      <span className="tag-chip">{selectedCase.case_study}</span>
                      <span className="tag-chip">{selectedCase.versions.join(' / ')}</span>
                    </div>
                  </div>
                ) : null}

                {comparisonError ? <MessageCard tone="danger" message={comparisonError} /> : null}
              </aside>

              <div className="official-stage">
                {pairResult ? (
                  <>
                    <div className="metric-grid metric-grid-compact">
                      <MetricCard
                        label="Version A avg wait"
                        value={formatMetricValue(
                          'average_wait_time',
                          pairResult.A.metrics.average_wait_time,
                        )}
                        caption={pairResult.A.scenario_name}
                        tone="blue"
                      />
                      <MetricCard
                        label="Version B avg wait"
                        value={formatMetricValue(
                          'average_wait_time',
                          pairResult.B.metrics.average_wait_time,
                        )}
                        caption={pairResult.B.scenario_name}
                        tone="teal"
                      />
                      <MetricCard
                        label="Delta groups served"
                        value={formatDelta(
                          'groups_served',
                          pairResult.metric_deltas_b_minus_a.groups_served ?? 0,
                        )}
                        caption="B minus A"
                        tone="purple"
                      />
                      <MetricCard
                        label="Delta table utilization"
                        value={formatDelta(
                          'table_utilization_overall',
                          pairResult.metric_deltas_b_minus_a.table_utilization_overall ?? 0,
                        )}
                        caption="B minus A"
                        tone="amber"
                      />
                    </div>

                    <div className="signal-grid">
                      {comparisonSignals.map((item) => (
                        <SignalCard
                          key={item.metric}
                          label={item.label}
                          value={item.value}
                          caption={item.caption}
                          tone={item.tone}
                        />
                      ))}
                    </div>

                    <div className="analysis-grid">
                      <div className="chart-panel">
                        <div className="chart-header">
                          <div>
                            <h3>Performance Spread</h3>
                            <p className="muted">
                              Mixed wait, throughput, and utilization signals for the currently
                              selected case-study pair.
                            </p>
                          </div>
                        </div>
                        <div className="chart-wrap">
                          <ResponsiveContainer width="100%" height={360}>
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
                                angle={-12}
                                textAnchor="end"
                                interval={0}
                                height={76}
                                stroke={chartTheme.grid}
                                tick={{ fill: chartTheme.muted, fontSize: 12 }}
                              />
                              <YAxis
                                stroke={chartTheme.grid}
                                tick={{ fill: chartTheme.muted, fontSize: 12 }}
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
                              <Bar name="Version A" dataKey="A" fill="url(#officialBarA)" radius={[10, 10, 0, 0]} />
                              <Bar name="Version B" dataKey="B" fill="url(#officialBarB)" radius={[10, 10, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="table-card highlights-card">
                        <div className="chart-header">
                          <div>
                            <h3>Decision Signals</h3>
                            <p className="muted">
                              Largest shifts between Version B and Version A, sorted by impact size.
                            </p>
                          </div>
                        </div>
                        <div className="signal-list">
                          {comparisonLeaderboard.map((item) => (
                            <div key={item.metric} className={`signal-row ${item.tone}`}>
                              <div>
                                <strong>{metricLabels[item.metric]}</strong>
                                <span>{metricDirectionHint(item.metric)}</span>
                              </div>
                              <span className="signal-value">{formatDelta(item.metric, item.delta)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <MetricComparisonTable result={pairResult} />
                  </>
                ) : (
                  <EmptyState
                    title="No comparison yet"
                    message="Run a case study to inspect the official A/B experiment."
                  />
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="panel custom-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Scenario Builder</p>
                <h2>Custom Scenario Lab</h2>
              </div>
              <StatusChip tone={customResult ? 'positive' : 'neutral'}>
                {customResult ? 'Last run ready' : 'Builder armed'}
              </StatusChip>
            </div>

            <p className="muted section-intro">
              Start from an official case, swap restaurant and policy modules, then launch a guided
              simulation without editing raw files in the main flow.
            </p>

            {customError ? <MessageCard tone="danger" message={customError} /> : null}

            {!builderPresets || !customForm ? (
              <EmptyState
                title="Loading builder"
                message="The guided custom scenario controls will appear once the preset catalog loads."
              />
            ) : (
              <>
                <div className="custom-shell">
                  <div className="custom-builder-column">
                    <div className="builder-section">
                      <div className="builder-section-head">
                        <div>
                          <p className="eyebrow">Starter</p>
                          <h3>Base Official Scenario</h3>
                        </div>
                      </div>
                      <div className="builder-grid">
                        <SelectField
                          label="Official case study"
                          value={starterCaseStudy}
                          onChange={setStarterCaseStudy}
                          options={caseStudies.map((entry) => ({
                            id: entry.case_study,
                            title: entry.title,
                            description: entry.summary,
                          }))}
                        />
                        <SelectField
                          label="Starter version"
                          value={starterVersion}
                          onChange={(value) => setStarterVersion(value as 'A' | 'B')}
                          options={[
                            {
                              id: 'A',
                              title: 'Version A',
                              description: 'Use the A version as the launch point.',
                            },
                            {
                              id: 'B',
                              title: 'Version B',
                              description: 'Use the B version as the launch point.',
                            },
                          ]}
                        />
                        <ActionField
                          label="Reset builder"
                          description="Apply the selected official case to refresh every module below."
                        >
                          <button
                            type="button"
                            onClick={() => handleApplyStarter()}
                            disabled={!starterCaseStudy}
                          >
                            Load selected starter
                          </button>
                        </ActionField>
                      </div>
                    </div>

                    <div className="builder-section">
                      <div className="builder-section-head">
                        <div>
                          <p className="eyebrow">Restaurant Setup</p>
                          <h3>Venue And Queue Layout</h3>
                        </div>
                      </div>
                      <div className="builder-grid">
                        <InputField
                          label="Scenario name"
                          value={customForm.scenarioName}
                          onChange={(value) => updateCustomField('scenarioName', value)}
                          description="Used to label this custom simulation result."
                        />
                        <InputField
                          label="Restaurant name"
                          value={customForm.restaurantName}
                          onChange={(value) => updateCustomField('restaurantName', value)}
                          description="Displayed in the generated restaurant configuration."
                        />
                        <InputField
                          label="Opening time"
                          type="time"
                          value={customForm.simulationStart}
                          onChange={(value) => updateCustomField('simulationStart', value)}
                          description="Simulation start time for the venue."
                        />
                        <InputField
                          label="Closing time"
                          type="time"
                          value={customForm.simulationEnd}
                          onChange={(value) => updateCustomField('simulationEnd', value)}
                          description="Simulation end time for the venue."
                        />
                        <PresetField
                          label="Table layout"
                          value={customForm.restaurantLayoutId}
                          onChange={(value) => updateCustomField('restaurantLayoutId', value)}
                          options={builderPresets.restaurant_layouts}
                        />
                        <PresetField
                          label="Queue structure"
                          value={customForm.queueStructureId}
                          onChange={(value) => updateCustomField('queueStructureId', value)}
                          options={builderPresets.queue_structures}
                        />
                      </div>
                    </div>

                    <div className="builder-section">
                      <div className="builder-section-head">
                        <div>
                          <p className="eyebrow">Policy Setup</p>
                          <h3>Reservations, Seating, And Service</h3>
                        </div>
                      </div>
                      <div className="builder-grid">
                        <PresetField
                          label="Reservation hold policy"
                          value={customForm.reservationPolicyId}
                          onChange={handleReservationPresetChange}
                          options={builderPresets.reservation_policies}
                        />
                        <NumberField
                          label="Hold minutes"
                          value={customForm.holdMinutes}
                          min={0}
                          disabled={
                            !builderPresets.reservation_policies.find(
                              (item) => item.id === customForm.reservationPolicyId,
                            )?.data.hold_tables_for_reservations
                          }
                          onChange={(value) => updateCustomField('holdMinutes', value)}
                          description="How long a reserved table stays protected before release."
                        />
                        <PresetField
                          label="Seating strategy"
                          value={customForm.seatingPolicyId}
                          onChange={(value) => updateCustomField('seatingPolicyId', value)}
                          options={builderPresets.seating_policies}
                        />
                        <PresetField
                          label="Service capacity"
                          value={customForm.servicePolicyId}
                          onChange={(value) => updateCustomField('servicePolicyId', value)}
                          options={builderPresets.service_policies}
                        />
                        <SelectField
                          label="Abandonment rule"
                          value={customForm.abandonmentEnabled ? 'enabled' : 'disabled'}
                          onChange={(value) =>
                            updateCustomField('abandonmentEnabled', value === 'enabled')
                          }
                          options={[
                            {
                              id: 'disabled',
                              title: 'Disabled',
                              description: 'Every group stays until seated or closed out.',
                            },
                            {
                              id: 'enabled',
                              title: 'Enabled',
                              description: 'Groups may leave once their wait exceeds tolerance.',
                            },
                          ]}
                        />
                      </div>
                    </div>

                    <div className="builder-section">
                      <div className="builder-section-head">
                        <div>
                          <p className="eyebrow">Demand Setup</p>
                          <h3>Arrival Pattern</h3>
                        </div>
                      </div>
                      <div className="builder-grid">
                        <PresetField
                          label="Arrival scenario"
                          value={customForm.arrivalScenarioId}
                          onChange={(value) => updateCustomField('arrivalScenarioId', value)}
                          options={builderPresets.arrival_scenarios}
                          wide
                        />
                      </div>
                    </div>

                    {generatedPayload ? (
                      <details className="advanced-panel">
                        <summary>Advanced payload preview</summary>
                        <p className="muted">
                          These generated files are still available for debugging and validation, but
                          the primary workflow stays on the guided control surface above.
                        </p>
                        <div className="editor-grid">
                          <PreviewEditorCard
                            title="Restaurant Config JSON"
                            value={generatedPayload.config_json}
                          />
                          <PreviewEditorCard title="Policy JSON" value={generatedPayload.policy_json} />
                          <PreviewEditorCard title="Arrivals CSV" value={generatedPayload.arrivals_csv} />
                        </div>
                      </details>
                    ) : null}
                  </div>

                  <aside className="builder-sidebar">
                    <div className="builder-summary-card">
                      <p className="eyebrow">Launch Deck</p>
                      <h3>{customForm.scenarioName}</h3>
                      <p className="muted">{builderSummary}</p>
                      <div className="builder-summary-grid">
                        {builderSnapshot.map((item) => (
                          <InfoTile
                            key={item.label}
                            label={item.label}
                            value={item.value}
                            caption="Scenario module"
                            compact
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        className="primary wide-button"
                        onClick={() => void handleRunCustom()}
                        disabled={customLoading || !generatedPayload}
                      >
                        {customLoading ? 'Simulating live scenario...' : 'Run custom simulation'}
                      </button>
                    </div>

                    <div className="builder-summary-card secondary">
                      <p className="eyebrow">Production Wiring</p>
                      <h3>Fixed Public Endpoints</h3>
                      <div className="endpoint-list">
                        <div className="endpoint-row">
                          <span>Dashboard</span>
                          <code>{extractHost(PRODUCTION_FRONTEND_URL)}</code>
                        </div>
                        <div className="endpoint-row">
                          <span>API</span>
                          <code>{extractHost(PRODUCTION_BACKEND_URL)}</code>
                        </div>
                      </div>
                      <p className="muted">
                        Keep these Render service names unchanged and these `.onrender.com` URLs stay
                        as your fixed public entry points.
                      </p>
                    </div>
                  </aside>
                </div>

                {customResult ? (
                  <section className="result-shell">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Simulation Result</p>
                        <h3>{customResult.scenario_name}</h3>
                      </div>
                      <StatusChip tone="positive">Run complete</StatusChip>
                    </div>

                    <MetricsGrid metrics={customResult.metrics} />

                    <div className="analysis-grid analysis-grid-result">
                      <div className="chart-panel">
                        <div className="chart-header">
                          <div>
                            <h3>Queue Pressure Timeline</h3>
                            <p className="muted">
                              Waiting groups over time for the current custom simulation.
                            </p>
                          </div>
                        </div>
                        <div className="chart-wrap">
                          <ResponsiveContainer width="100%" height={340}>
                            <AreaChart data={customResult.queue_snapshots}>
                              <defs>
                                <linearGradient id="queueAreaFill" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#818cf8" stopOpacity={0.6} />
                                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.04} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                              <XAxis
                                dataKey="clock"
                                minTickGap={24}
                                stroke={chartTheme.grid}
                                tick={{ fill: chartTheme.muted, fontSize: 12 }}
                              />
                              <YAxis
                                allowDecimals={false}
                                stroke={chartTheme.grid}
                                tick={{ fill: chartTheme.muted, fontSize: 12 }}
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
                              <Area
                                type="monotone"
                                dataKey="total_waiting"
                                name="Waiting groups"
                                stroke="#a78bfa"
                                fill="url(#queueAreaFill)"
                                strokeWidth={3}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <RunIntelCard result={customResult} highlights={runIntel} />
                    </div>

                    <div className="two-column">
                      <TableSegmentsCard segments={customResult.table_segments} />
                      <EventLogCard entries={customResult.event_log} />
                    </div>

                    <GroupOutcomeCard outcomes={customResult.group_outcomes} />
                  </section>
                ) : (
                  <EmptyState
                    title="No custom run yet"
                    message="Adjust the guided modules above, then run the simulator to inspect the outcome."
                  />
                )}
              </>
            )}
          </section>
        )}

        <details className="panel reference-panel">
          <summary>Schema reference and validation notes</summary>
          <p className="muted">
            Keep this section collapsed during normal analysis. Open it when you want to inspect the
            backend field contracts and raw validation notes.
          </p>
          <div className="schema-grid">
            {Object.entries(schemas).map(([name, content]) => (
              <details key={name} className="schema-card">
                <summary>{name}</summary>
                <pre>{content}</pre>
              </details>
            ))}
          </div>
        </details>
      </main>
    </div>
  )
}

function MetricsGrid({ metrics }: { metrics: MetricsRecord }) {
  return (
    <div className="metric-grid">
      {summaryMetrics.map((metric) => (
        <MetricCard
          key={metric}
          label={metricLabels[metric]}
          value={formatMetricValue(metric, metrics[metric])}
          caption={metricCaptions[metric] ?? 'Tracked operational metric.'}
        />
      ))}
    </div>
  )
}

function MetricComparisonTable({ result }: { result: PairComparison }) {
  return (
    <div className="table-card">
      <div className="chart-header">
        <div>
          <h3>Metric Table</h3>
          <p className="muted">Direct Version A vs Version B comparison with delta coloring.</p>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Version A</th>
              <th>Version B</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {comparisonTableMetrics.map((metric) => {
              const delta = result.metric_deltas_b_minus_a[metric] ?? 0
              const tone = metricDirectionTone(metric, delta)
              return (
                <tr key={metric}>
                  <td>{metricLabels[metric]}</td>
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

function RunIntelCard({
  result,
  highlights,
}: {
  result: ScenarioResult
  highlights: { metric: NumericMetricKey; label: string; value: string; tone: SignalTone; caption: string }[]
}) {
  return (
    <div className="table-card highlights-card">
      <div className="chart-header">
        <div>
          <h3>Run Intelligence</h3>
          <p className="muted">
            Operational quality markers and the generated source files behind this run.
          </p>
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

      <div className="source-grid">
        {Object.entries(result.source_paths).map(([name, path]) => (
          <div key={name} className="source-row">
            <span>{titleCaseKey(name)}</span>
            <code>{path}</code>
          </div>
        ))}
      </div>
    </div>
  )
}

function TableSegmentsCard({ segments }: { segments: ScenarioResult['table_segments'] }) {
  const preview = segments.slice(0, 20)
  return (
    <div className="table-card">
      <div className="chart-header">
        <div>
          <h3>Table Activity</h3>
          <p className="muted">First 20 occupied or reset segments from the current custom run.</p>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Table</th>
              <th>Status</th>
              <th>Start</th>
              <th>End</th>
              <th>Group</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((segment) => (
              <tr key={`${segment.table_id}-${segment.status}-${segment.start_minute}`}>
                <td>{segment.table_id}</td>
                <td>
                  <span className={`pill ${statusTone(segment.status)}`}>{segment.status}</span>
                </td>
                <td>{segment.start_clock}</td>
                <td>{segment.end_clock}</td>
                <td>{segment.group_id ?? '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EventLogCard({ entries }: { entries: ScenarioResult['event_log'] }) {
  const preview = entries.slice(0, 40)
  return (
    <div className="table-card">
      <div className="chart-header">
        <div>
          <h3>Event Log</h3>
          <p className="muted">First 40 discrete events from the custom simulation.</p>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((entry, index) => (
              <tr key={`${entry.minute}-${entry.event_type}-${index}`}>
                <td>{entry.clock}</td>
                <td>
                  <span className={`pill ${statusTone(entry.event_type)}`}>{entry.event_type}</span>
                </td>
                <td>{entry.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GroupOutcomeCard({ outcomes }: { outcomes: GroupOutcome[] }) {
  const preview = outcomes.slice(0, 24)
  return (
    <div className="table-card">
      <div className="chart-header">
        <div>
          <h3>Group Outcomes</h3>
          <p className="muted">First 24 groups from the custom scenario.</p>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th>Status</th>
              <th>Type</th>
              <th>Size</th>
              <th>Wait</th>
              <th>Table</th>
              <th>Arrival</th>
              <th>Seated</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((group) => (
              <tr key={group.group_id}>
                <td>{group.group_id}</td>
                <td>
                  <span className={`pill ${statusTone(group.status)}`}>{group.status}</span>
                </td>
                <td>{group.group_type}</td>
                <td>{group.group_size}</td>
                <td>{group.wait_time ?? '--'}</td>
                <td>{group.assigned_table_id ?? '--'}</td>
                <td>{group.arrival_time}</td>
                <td>{group.seated_time ?? '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

function SignalCard({
  label,
  value,
  caption,
  tone,
}: {
  label: string
  value: string
  caption: string
  tone: SignalTone
}) {
  return (
    <article className={`signal-card ${tone}`}>
      <span className="signal-label">{label}</span>
      <strong className="signal-hero">{value}</strong>
      <span className="signal-caption">{caption}</span>
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
        {selected?.description || 'Choose the preset that best matches your scenario.'}
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

function PreviewEditorCard({ title, value }: { title: string; value: string }) {
  return (
    <label className="editor-card">
      <span>{title}</span>
      <textarea value={value} readOnly spellCheck={false} />
    </label>
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
