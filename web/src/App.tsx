import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fetchBuilderPresets, fetchCaseStudies, fetchSchemas, runCaseStudyComparison, runCustomScenario } from './api'
import { buildCustomScenarioPayload, buildFormFromStarter, summarizeBuilderSelections } from './builder'
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

const ratioMetrics = new Set<NumericMetricKey>([
  'service_level_within_15_min',
  'service_level_within_30_min',
  'table_utilization_overall',
  'reservation_fulfillment_rate',
  'average_table_fit_efficiency',
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

function formatMetricValue(metric: NumericMetricKey, value: number) {
  if (ratioMetrics.has(metric)) {
    return `${(value * 100).toFixed(1)}%`
  }
  if (Number.isInteger(value)) {
    return value.toString()
  }
  return value.toFixed(2)
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

function statusTone(status: string) {
  if (status === 'completed') {
    return 'success'
  }
  if (status === 'abandoned' || status === 'no_show') {
    return 'danger'
  }
  return 'neutral'
}

function App() {
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
        <div>
          <p className="eyebrow">COMP1110 Topic C</p>
          <h1>Restaurant Queue Simulation Dashboard</h1>
          <p className="hero-copy">
            Compare the six official experiments or build a guided custom scenario without touching
            raw JSON and CSV on the main screen.
          </p>
        </div>
      </header>

      {bootstrapError ? <MessageCard tone="danger" message={bootstrapError} /> : null}

      <main className="layout">
        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Workspace Mode</p>
              <h2>Choose What To Run</h2>
            </div>
          </div>
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
          <p className="muted">
            {mode === 'official'
              ? 'Run one of the six official A/B experiments and inspect the comparison metrics.'
              : 'Start from an official case, then adjust restaurant, policy, and demand modules with guided controls.'}
          </p>
        </section>

        {mode === 'official' ? (
          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Official Experiment Lab</p>
                <h2>Case-Study Comparison</h2>
              </div>
              <div className="toolbar">
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
                <button
                  type="button"
                  onClick={() => void handleRunComparison()}
                  disabled={comparisonLoading || !selectedCaseStudy}
                >
                  {comparisonLoading ? 'Running comparison...' : 'Run A/B comparison'}
                </button>
              </div>
            </div>

            {selectedCase ? <p className="muted">{selectedCase.summary}</p> : null}
            {comparisonError ? <MessageCard tone="danger" message={comparisonError} /> : null}

            {pairResult ? (
              <>
                <div className="metric-grid">
                  <MetricCard
                    label="Version A avg wait"
                    value={formatMetricValue('average_wait_time', pairResult.A.metrics.average_wait_time)}
                    caption={pairResult.A.scenario_name}
                  />
                  <MetricCard
                    label="Version B avg wait"
                    value={formatMetricValue('average_wait_time', pairResult.B.metrics.average_wait_time)}
                    caption={pairResult.B.scenario_name}
                  />
                  <MetricCard
                    label="Delta groups served"
                    value={formatMetricValue(
                      'groups_served',
                      pairResult.metric_deltas_b_minus_a.groups_served ?? 0,
                    )}
                    caption="B minus A"
                  />
                  <MetricCard
                    label="Delta table utilization"
                    value={formatMetricValue(
                      'table_utilization_overall',
                      pairResult.metric_deltas_b_minus_a.table_utilization_overall ?? 0,
                    )}
                    caption="B minus A"
                  />
                </div>

                <div className="chart-panel">
                  <div className="chart-header">
                    <h3>Key Metric Comparison</h3>
                    <p className="muted">
                      Ratio metrics are shown as percentages. Wait metrics stay in minutes.
                    </p>
                  </div>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={comparisonChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="metric" angle={-15} textAnchor="end" interval={0} height={70} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="A" fill="#2563eb" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="B" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
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
          </section>
        ) : (
          <section className="panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Scenario Builder</p>
                <h2>Custom Scenario</h2>
              </div>
            </div>

            <p className="muted">
              Choose a starter, swap business-friendly modules, review the generated setup, then run
              the simulator.
            </p>

            {customError ? <MessageCard tone="danger" message={customError} /> : null}

            {!builderPresets || !customForm ? (
              <EmptyState
                title="Loading builder"
                message="The guided custom scenario controls will appear once the preset catalog loads."
              />
            ) : (
              <>
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
                        { id: 'A', title: 'Version A', description: 'Use the A version as the starting point.' },
                        { id: 'B', title: 'Version B', description: 'Use the B version as the starting point.' },
                      ]}
                    />
                    <ActionField
                      label="Reset builder"
                      description="Apply the selected official case to refresh all module choices below."
                    >
                      <button type="button" onClick={() => handleApplyStarter()} disabled={!starterCaseStudy}>
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
                      description="The simulation start time for the venue."
                    />
                    <InputField
                      label="Closing time"
                      type="time"
                      value={customForm.simulationEnd}
                      onChange={(value) => updateCustomField('simulationEnd', value)}
                      description="The simulation end time for the venue."
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
                      description="How long the restaurant keeps a table reserved before releasing it."
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
                      onChange={(value) => updateCustomField('abandonmentEnabled', value === 'enabled')}
                      options={[
                        {
                          id: 'disabled',
                          title: 'Disabled',
                          description: 'Every group stays in the system until seated or closed out.',
                        },
                        {
                          id: 'enabled',
                          title: 'Enabled',
                          description: 'Groups may leave once their wait exceeds their tolerance.',
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

                <div className="builder-review">
                  <div>
                    <p className="eyebrow">Review</p>
                    <h3>{customForm.scenarioName}</h3>
                    <p className="muted">{builderSummary}</p>
                  </div>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void handleRunCustom()}
                    disabled={customLoading || !generatedPayload}
                  >
                    {customLoading ? 'Simulating...' : 'Run custom simulation'}
                  </button>
                </div>

                {generatedPayload ? (
                  <details className="advanced-panel">
                    <summary>Advanced: generated JSON and CSV</summary>
                    <p className="muted">
                      These files are generated from the module choices above and are hidden by
                      default for non-technical users.
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

                {customResult ? (
                  <section className="stack-lg">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Simulation Result</p>
                        <h3>{customResult.scenario_name}</h3>
                      </div>
                    </div>
                    <MetricsGrid metrics={customResult.metrics} />

                    <div className="chart-panel">
                      <div className="chart-header">
                        <h3>Queue Timeline</h3>
                        <p className="muted">
                          Waiting groups over time for the current custom simulation.
                        </p>
                      </div>
                      <div className="chart-wrap">
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={customResult.queue_snapshots}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="clock" minTickGap={24} />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Line
                              type="monotone"
                              dataKey="total_waiting"
                              name="Waiting groups"
                              stroke="#8b5cf6"
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
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
                    message="Adjust the guided modules above, then run the simulator to see the outcome."
                  />
                )}
              </>
            )}
          </section>
        )}

        <section className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Reference</p>
              <h2>Schemas</h2>
            </div>
          </div>
          <p className="muted">
            These validation notes remain available for advanced users who want to inspect the
            backend field expectations.
          </p>
          <div className="schema-grid">
            {Object.entries(schemas).map(([name, content]) => (
              <details key={name} className="schema-card">
                <summary>{name}</summary>
                <pre>{content}</pre>
              </details>
            ))}
          </div>
        </section>
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
          caption={metrics.notes}
        />
      ))}
    </div>
  )
}

function MetricComparisonTable({ result }: { result: PairComparison }) {
  return (
    <div className="table-card">
      <div className="chart-header">
        <h3>Metric Table</h3>
        <p className="muted">Direct A/B comparison with B minus A deltas.</p>
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
            {comparisonTableMetrics.map((metric) => (
              <tr key={metric}>
                <td>{metricLabels[metric]}</td>
                <td>{formatMetricValue(metric, result.A.metrics[metric])}</td>
                <td>{formatMetricValue(metric, result.B.metrics[metric])}</td>
                <td>{formatMetricValue(metric, result.metric_deltas_b_minus_a[metric] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TableSegmentsCard({ segments }: { segments: ScenarioResult['table_segments'] }) {
  const preview = segments.slice(0, 20)
  return (
    <div className="table-card">
      <div className="chart-header">
        <h3>Table Activity</h3>
        <p className="muted">First 20 occupied/reset segments from the current custom run.</p>
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
                <td>{segment.group_id ?? '—'}</td>
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
        <h3>Event Log</h3>
        <p className="muted">First 40 discrete events from the custom scenario.</p>
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
        <h3>Group Outcomes</h3>
        <p className="muted">First 24 groups from the custom scenario.</p>
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
                <td>{group.wait_time ?? '—'}</td>
                <td>{group.assigned_table_id ?? '—'}</td>
                <td>{group.arrival_time}</td>
                <td>{group.seated_time ?? '—'}</td>
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
}: {
  label: string
  value: string
  caption: string
}) {
  return (
    <article className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-caption">{caption}</span>
    </article>
  )
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
      <p className="builder-help">{selected?.description || 'Choose the preset that best matches your scenario.'}</p>
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

export default App
