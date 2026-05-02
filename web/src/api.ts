import type {
  BuilderPresetsResponse,
  CaseStudiesResponse,
  CaseStudyInputsResponse,
  CustomScenarioPayload,
  PairComparison,
  ScenarioResult,
  SchemasResponse,
} from './types'

/*
- What it does:
  Wraps HTTP calls from the dashboard to the simulation API.
- Inputs:
  API base URL configuration and endpoint-specific arguments.
- Outputs:
  Typed promises resolving to backend response payloads or user-facing errors.
*/

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
  /\/$/,
  '',
) ?? 'http://127.0.0.1:8000'

const technicalErrorPattern =
  /(http:\/\/|https:\/\/|127\.0\.0\.1|localhost|api|exception|traceback|stack|vite_|failed to fetch)/i

/*
- What it does:
  Filters technical backend details out of messages shown to users.
- Inputs:
  A raw error message string.
- Outputs:
  A safe string or null when the message should be replaced.
*/

function sanitizeErrorMessage(message: string) {
  const trimmed = message.trim()
  if (!trimmed || technicalErrorPattern.test(trimmed)) {
    return null
  }
  return trimmed
}

/*
- What it does:
  Maps HTTP status failures into dashboard-friendly copy.
- Inputs:
  A response status and optional detail text.
- Outputs:
  A user-facing error message.
*/

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

/*
- What it does:
  Sends JSON requests to the configured API base URL and parses responses.
- Inputs:
  An API path and optional fetch init settings.
- Outputs:
  A typed response payload or thrown Error.
*/

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

/*
- What it does:
  Calls the backend health endpoint.
- Inputs:
  No endpoint-specific arguments.
- Outputs:
  A status payload from the API.
*/

export async function healthcheck(): Promise<{ status: string }> {
  return request<{ status: string }>('/health', { method: 'GET' })
}

/*
- What it does:
  Loads the official case-study catalog.
- Inputs:
  No endpoint-specific arguments.
- Outputs:
  A case-study metadata response.
*/

export async function fetchCaseStudies() {
  return request<CaseStudiesResponse>('/case-studies', { method: 'GET' })
}

/*
- What it does:
  Loads backend schema documents.
- Inputs:
  No endpoint-specific arguments.
- Outputs:
  A schema-document response.
*/

export async function fetchSchemas() {
  return request<SchemasResponse>('/schemas', { method: 'GET' })
}

/*
- What it does:
  Loads preset catalogs used by the scenario builder.
- Inputs:
  No endpoint-specific arguments.
- Outputs:
  A grouped preset response.
*/

export async function fetchBuilderPresets() {
  return request<BuilderPresetsResponse>('/builder-presets', { method: 'GET' })
}

/*
- What it does:
  Loads raw input files for one official case-study version.
- Inputs:
  A case-study id and A/B version.
- Outputs:
  Config, policy, and arrivals source strings.
*/

export async function fetchCaseStudyInputs(caseStudy: string, version: 'A' | 'B') {
  return request<CaseStudyInputsResponse>(`/case-studies/${caseStudy}/${version}/inputs`, {
    method: 'GET',
  })
}

/*
- What it does:
  Runs the backend comparison for an official case study.
- Inputs:
  A case-study id.
- Outputs:
  A PairComparison response.
*/

export async function runCaseStudyComparison(caseStudy: string) {
  return request<PairComparison>('/simulate/case-study', {
    method: 'POST',
    body: JSON.stringify({
      case_study: caseStudy,
      compare_both: true,
    }),
  })
}

/*
- What it does:
  Runs the backend simulator with a builder-generated payload.
- Inputs:
  A CustomScenarioPayload.
- Outputs:
  A ScenarioResult response.
*/

export async function runCustomScenario(payload: CustomScenarioPayload) {
  return request<ScenarioResult>('/simulate/custom', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export { API_BASE_URL }
