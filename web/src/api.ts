import type {
  BuilderPresetsResponse,
  CaseStudiesResponse,
  CaseStudyInputsResponse,
  CustomScenarioPayload,
  PairComparison,
  ScenarioResult,
  SchemasResponse,
} from './types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
  /\/$/,
  '',
) ?? 'http://127.0.0.1:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const payload = (await response.json()) as { detail?: string }
      if (payload.detail) {
        message = payload.detail
      }
    } catch {
      // Ignore JSON parsing errors and use the status text.
    }
    throw new Error(message)
  }

  return (await response.json()) as T
}

export async function healthcheck(): Promise<{ status: string }> {
  return request<{ status: string }>('/health', { method: 'GET' })
}

export async function fetchCaseStudies() {
  return request<CaseStudiesResponse>('/case-studies', { method: 'GET' })
}

export async function fetchSchemas() {
  return request<SchemasResponse>('/schemas', { method: 'GET' })
}

export async function fetchBuilderPresets() {
  return request<BuilderPresetsResponse>('/builder-presets', { method: 'GET' })
}

export async function fetchCaseStudyInputs(caseStudy: string, version: 'A' | 'B') {
  return request<CaseStudyInputsResponse>(`/case-studies/${caseStudy}/${version}/inputs`, {
    method: 'GET',
  })
}

export async function runCaseStudyComparison(caseStudy: string) {
  return request<PairComparison>('/simulate/case-study', {
    method: 'POST',
    body: JSON.stringify({
      case_study: caseStudy,
      compare_both: true,
    }),
  })
}

export async function runCustomScenario(payload: CustomScenarioPayload) {
  return request<ScenarioResult>('/simulate/custom', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export { API_BASE_URL }
