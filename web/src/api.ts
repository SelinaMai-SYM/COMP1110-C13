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

const technicalErrorPattern =
  /(http:\/\/|https:\/\/|127\.0\.0\.1|localhost|api|exception|traceback|stack|vite_|failed to fetch)/i

function sanitizeErrorMessage(message: string) {
  const trimmed = message.trim()
  if (!trimmed || technicalErrorPattern.test(trimmed)) {
    return null
  }
  return trimmed
}

function userFacingError(status: number, detail?: string) {
  const safeDetail = detail ? sanitizeErrorMessage(detail) : null

  if (status === 404) {
    return safeDetail ?? 'That scenario is not available right now.'
  }

  if (status === 400) {
    return safeDetail ?? 'We could not use that setup. Please adjust the plan and try again.'
  }

  if (status >= 500) {
    return 'The service planner ran into a problem. Please try again in a moment.'
  }

  return safeDetail ?? 'Something went wrong while loading this screen. Please try again.'
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
    })
  } catch {
    throw new Error(
      'We could not reach the service planner right now. Please check your connection and try again.',
    )
  }

  if (!response.ok) {
    let detail: string | undefined
    try {
      const payload = (await response.json()) as { detail?: string }
      if (payload.detail) {
        detail = payload.detail
      }
    } catch {
      // Ignore JSON parsing errors and use the status text.
    }
    throw new Error(userFacingError(response.status, detail ?? response.statusText))
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
