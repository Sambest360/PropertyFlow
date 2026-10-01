/**
 * SigniFlow WorkFlow REST client (DQ-C1 Mode A).
 *
 * Official WorkFlow API base:
 *   https://{serverUrl}/API/SignFlowAPIServiceRest.svc
 * Docs: https://developers.signiflow.com/docs/signiflow-openapi/c132ea1d2f673-work-flow-api
 * SA cloud often: https://flow.signflow.co.za/API/SignFlowAPIServiceRest.svc
 *
 * Mode A: CreateWorkflow (base64 doc) → AddWorkflowStepV2 (signers) → InitiateFlow.
 * Secrets from env only — never VITE_*. Absent keys → callers must refuse / use mock.
 * Never invent ok:true / completed without a partner response.
 */

export type SigniFlowConfig = {
  apiKey: string
  /** Normalized base ending at .../SignFlowAPIServiceRest.svc (no trailing slash). */
  apiBaseUrl: string
  tokenExpiry: string
}

export type SigniFlowSigner = {
  email: string
  firstName: string
  lastName: string
}

export type SigniFlowCreateInput = {
  /** Raw base64 or data:application/pdf;base64,... */
  documentBase64: string
  docName: string
  message: string
  dueDateIso?: string
  signers: SigniFlowSigner[]
  additionalData?: string
}

export type SigniFlowCreateResult =
  | {
      ok: true
      docId: string
      envelopeId: string
      externalReference: string
      resultField: string
      summary: string
    }
  | { ok: false; error: string; step?: string; partnerBody?: unknown }

export type SigniFlowStatusResult =
  | {
      ok: true
      docId: string
      docStatus: string
      mappedStatus: 'sent' | 'partially_signed' | 'completed' | 'declined' | 'failed'
      resultField: string
    }
  | { ok: false; error: string; partnerBody?: unknown }

type FetchLike = typeof fetch

const DEFAULT_TOKEN_EXPIRY = '2030-12-31T23:59:59Z'
const SVC_SUFFIX = '/API/SignFlowAPIServiceRest.svc'

/** Prefer SA cloud when only a host hint is needed in docs — callers must set full URL. */
export const SIGNIFLOW_SA_CLOUD_BASE = `https://flow.signflow.co.za${SVC_SUFFIX}`

export function normalizeSigniFlowApiBase(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '')
  if (!url) return url
  if (!/SignFlowAPIServiceRest\.svc$/i.test(url)) {
    url = `${url}${SVC_SUFFIX}`
  }
  return url.replace(/\/+$/, '')
}

export function signiflowConfigFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): SigniFlowConfig | null {
  const apiKey = env.ESIGN_SIGNIFLOW_API_KEY?.trim()
  const apiUrl = env.ESIGN_SIGNIFLOW_API_URL?.trim()
  if (!apiKey || !apiUrl) return null
  return {
    apiKey,
    apiBaseUrl: normalizeSigniFlowApiBase(apiUrl),
    tokenExpiry: env.ESIGN_SIGNIFLOW_TOKEN_EXPIRY?.trim() || DEFAULT_TOKEN_EXPIRY,
  }
}

export function isSigniFlowProviderSelected(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  return (env.ESIGN_PROVIDER ?? '').trim().toLowerCase() === 'signiflow'
}

/** Live SigniFlow path: provider selected AND partner keys present. */
export function isSigniFlowLiveConfigured(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): boolean {
  return isSigniFlowProviderSelected(env) && signiflowConfigFromEnv(env) != null
}

export function extractPdfBase64(pdfUrlOrBase64: string): string | null {
  const raw = pdfUrlOrBase64.trim()
  if (!raw) return null
  const dataMatch = /^data:application\/pdf;base64,(.+)$/i.exec(raw)
  if (dataMatch?.[1]) return dataMatch[1].replace(/\s/g, '')
  // Plain base64 (no data: prefix)
  if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.replace(/\s/g, '').length > 32) {
    return raw.replace(/\s/g, '')
  }
  return null
}

function tokenPayload(config: SigniFlowConfig) {
  return {
    TokenExpiryField: config.tokenExpiry,
    TokenField: config.apiKey,
  }
}

function isSuccessResult(resultField: unknown): boolean {
  if (typeof resultField !== 'string') return false
  const t = resultField.trim().toLowerCase()
  return t === 'success' || t === 'ok' || t === 'true'
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: 'Signer', lastName: 'Unknown' }
  if (parts.length === 1) return { firstName: parts[0]!, lastName: parts[0]! }
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') }
}

export function signerFromParty(name: string, email: string): SigniFlowSigner {
  const { firstName, lastName } = splitName(name)
  return { email: email.trim(), firstName, lastName }
}

export function mapSigniFlowDocStatus(
  docStatus: string,
): 'sent' | 'partially_signed' | 'completed' | 'declined' | 'failed' {
  const s = docStatus.trim().toLowerCase()
  if (!s) return 'sent'
  if (/(complet|signed|finalis|executed)/.test(s) && !/partial|pending|await/.test(s)) {
    return 'completed'
  }
  if (/partial|in\s*progress|await|one\s*sign/.test(s)) return 'partially_signed'
  if (/reject|declin/.test(s)) return 'declined'
  if (/cancel|fail|error|expire/.test(s)) return 'failed'
  if (/pend|sent|out\s*for|in\s*flow|active/.test(s)) return 'sent'
  return 'sent'
}

async function postJson(
  config: SigniFlowConfig,
  path: string,
  body: Record<string, unknown>,
  fetchImpl: FetchLike,
): Promise<{ httpOk: boolean; status: number; json: Record<string, unknown> | null; text: string }> {
  const url = `${config.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: Record<string, unknown> | null = null
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null
  } catch {
    json = null
  }
  return { httpOk: res.ok, status: res.status, json, text }
}

/**
 * CreateWorkflow → AddWorkflowStepV2 (each signer) → InitiateFlow.
 * Returns ok only when partner responses indicate Success + a DocID.
 */
export async function signiflowCreateAndInitiateWorkflow(
  input: SigniFlowCreateInput,
  config: SigniFlowConfig,
  fetchImpl: FetchLike = fetch,
): Promise<SigniFlowCreateResult> {
  const docBase64 = extractPdfBase64(input.documentBase64)
  if (!docBase64) {
    return { ok: false, error: 'SigniFlow requires a PDF as base64 or data:application/pdf;base64,...' }
  }
  if (!input.signers.length) {
    return { ok: false, error: 'SigniFlow requires at least one signer (email + name).' }
  }

  const due =
    input.dueDateIso?.trim() ||
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  const createBody = {
    AdditionalDataField: input.additionalData ?? '',
    AutoExpireField: 0,
    AutoRemindField: 0,
    DocField: docBase64,
    DocNameField: input.docName.slice(0, 200) || 'Lease.pdf',
    DueDateField: due,
    ExtensionField: 0, // pdf
    MessageField: input.message.slice(0, 500) || 'Please sign this lease',
    PriorityField: 0,
    SLAField: 0,
    TokenField: tokenPayload(config),
  }

  let createRes
  try {
    createRes = await postJson(config, '/CreateWorkflow', createBody, fetchImpl)
  } catch (err) {
    return {
      ok: false,
      step: 'CreateWorkflow',
      error: `SigniFlow CreateWorkflow network error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const createJson = createRes.json
  const createResult = createJson?.ResultField ?? createJson?.resultField
  const docIdRaw = createJson?.DocIDField ?? createJson?.docIDField ?? createJson?.DocIdField
  if (!createRes.httpOk || !createJson || !isSuccessResult(createResult) || docIdRaw == null || docIdRaw === '') {
    return {
      ok: false,
      step: 'CreateWorkflow',
      error: `SigniFlow CreateWorkflow failed (HTTP ${createRes.status}): ${
        typeof createResult === 'string' ? createResult : createRes.text.slice(0, 240) || 'no ResultField'
      }`,
      partnerBody: createJson ?? createRes.text.slice(0, 500),
    }
  }

  const docId = String(docIdRaw)

  for (const signer of input.signers) {
    if (!signer.email.trim()) {
      return { ok: false, step: 'AddWorkflowStepV2', error: 'Signer email is required.' }
    }
    const stepBody = {
      ActionField: 0, // SignDocument
      CellField: '',
      DocIDField: docId,
      EmailField: signer.email.trim(),
      FirstNameField: signer.firstName.slice(0, 80) || 'Signer',
      LanguageCodeField: 'ENG',
      LastNameField: signer.lastName.slice(0, 80) || 'Unknown',
      ProxyAllowedField: 0,
      TokenField: tokenPayload(config),
    }
    let stepRes
    try {
      stepRes = await postJson(config, '/AddWorkflowStepV2', stepBody, fetchImpl)
    } catch (err) {
      return {
        ok: false,
        step: 'AddWorkflowStepV2',
        error: `SigniFlow AddWorkflowStepV2 network error: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
    const stepJson = stepRes.json
    const stepResult = stepJson?.ResultField ?? stepJson?.resultField
    if (!stepRes.httpOk || !stepJson || !isSuccessResult(stepResult)) {
      return {
        ok: false,
        step: 'AddWorkflowStepV2',
        error: `SigniFlow AddWorkflowStepV2 failed for ${signer.email} (HTTP ${stepRes.status}): ${
          typeof stepResult === 'string' ? stepResult : stepRes.text.slice(0, 240) || 'no ResultField'
        }`,
        partnerBody: stepJson ?? stepRes.text.slice(0, 500),
      }
    }
  }

  let initRes
  try {
    initRes = await postJson(
      config,
      '/InitiateFlow',
      { DocIDField: docId, TokenField: tokenPayload(config) },
      fetchImpl,
    )
  } catch (err) {
    return {
      ok: false,
      step: 'InitiateFlow',
      error: `SigniFlow InitiateFlow network error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const initJson = initRes.json
  const initResult = initJson?.ResultField ?? initJson?.resultField
  if (!initRes.httpOk || !initJson || !isSuccessResult(initResult)) {
    return {
      ok: false,
      step: 'InitiateFlow',
      error: `SigniFlow InitiateFlow failed (HTTP ${initRes.status}): ${
        typeof initResult === 'string' ? initResult : initRes.text.slice(0, 240) || 'no ResultField'
      }`,
      partnerBody: initJson ?? initRes.text.slice(0, 500),
    }
  }

  const envelopeId = `SF-${docId}`
  return {
    ok: true,
    docId,
    envelopeId,
    externalReference: docId,
    resultField: String(initResult),
    summary: `SigniFlow workflow created and initiated (DocID ${docId}). Partner ceremony required — not staff-click signed-live.`,
  }
}

/** POST GetDocStatus — map partner DocStatusField; never invent completed. */
export async function signiflowGetDocStatus(
  docId: string,
  config: SigniFlowConfig,
  fetchImpl: FetchLike = fetch,
): Promise<SigniFlowStatusResult> {
  const id = docId.trim()
  if (!id) return { ok: false, error: 'DocID is required.' }

  let res
  try {
    res = await postJson(
      config,
      '/GetDocStatus',
      {
        DocIDField: /^\d+$/.test(id) ? Number(id) : id,
        TokenField: tokenPayload(config),
      },
      fetchImpl,
    )
  } catch (err) {
    return {
      ok: false,
      error: `SigniFlow GetDocStatus network error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const json = res.json
  const resultField = json?.ResultField ?? json?.resultField
  const docStatus = String(json?.DocStatusField ?? json?.docStatusField ?? '')
  if (!res.httpOk || !json || !isSuccessResult(resultField)) {
    return {
      ok: false,
      error: `SigniFlow GetDocStatus failed (HTTP ${res.status}): ${
        typeof resultField === 'string' ? resultField : res.text.slice(0, 240) || 'no ResultField'
      }`,
      partnerBody: json ?? res.text.slice(0, 500),
    }
  }

  return {
    ok: true,
    docId: id,
    docStatus,
    mappedStatus: mapSigniFlowDocStatus(docStatus),
    resultField: String(resultField),
  }
}

/** Strip SF- prefix from our envelopeId convention. */
export function docIdFromEnvelopeId(envelopeId: string): string {
  const e = envelopeId.trim()
  if (/^SF-/i.test(e)) return e.slice(3)
  return e
}
