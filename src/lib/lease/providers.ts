/**
 * E-sign provider adapters (SigniFlow / DocuSign-shaped).
 * - MockDevESignProvider: records sign events locally — labeled non-production (FE soft-demo).
 * - SigniFlow: browser calls /api/esign/* ; server holds ESIGN_SIGNIFLOW_* keys and does WorkFlow HTTP.
 *   Never VITE_ESIGN_SIGNIFLOW_*. Never invents signed-live.
 * - DocuSign: placeholder only (Mode A OUT).
 */

import type {
  ESignCreateEnvelopeRequest,
  ESignCreateEnvelopeResponse,
  ESignProvider,
  ESignRecordSignRequest,
  ESignRecordSignResponse,
  LeaseESignStatus,
} from './types'

/** In-memory mock envelope book (dev / tests). Cleared on reload. */
const mockEnvelopes = new Map<
  string,
  {
    landlordRequired: boolean
    tenantSigned: boolean
    landlordSigned: boolean
  }
>()

function deriveStatus(env: {
  landlordRequired: boolean
  tenantSigned: boolean
  landlordSigned: boolean
}): LeaseESignStatus {
  if (env.tenantSigned && (!env.landlordRequired || env.landlordSigned)) return 'completed'
  if (env.tenantSigned || env.landlordSigned) return 'partially_signed'
  return 'sent'
}

/** Deterministic mock e-sign for demos and tests. */
export class MockDevESignProvider implements ESignProvider {
  readonly id = 'mock'
  readonly live = false
  readonly nonProduction = true

  async createEnvelope(request: ESignCreateEnvelopeRequest): Promise<ESignCreateEnvelopeResponse> {
    const envelopeId = `MOCK-ENV-${request.tenancyId}-${Date.now()}`
    mockEnvelopes.set(envelopeId, {
      landlordRequired: Boolean(request.landlord?.userId),
      tenantSigned: false,
      landlordSigned: false,
    })
    return {
      ok: true,
      provider: this.id,
      live: false,
      nonProduction: true,
      envelopeId,
      externalReference: envelopeId,
      status: 'sent',
      summary:
        'Mock e-sign envelope created (dev provider — non-production, no partner API call).',
    }
  }

  async recordSign(request: ESignRecordSignRequest): Promise<ESignRecordSignResponse> {
    const env = mockEnvelopes.get(request.envelopeId)
    if (!env) {
      return {
        ok: false,
        provider: this.id,
        party: request.party,
        status: 'failed',
        error: `Unknown mock envelope ${request.envelopeId}`,
      }
    }
    if (request.party === 'tenant') env.tenantSigned = true
    if (request.party === 'landlord') {
      if (!env.landlordRequired) {
        return {
          ok: false,
          provider: this.id,
          party: request.party,
          status: deriveStatus(env),
          error: 'Landlord countersign is not required for this lease (no landlordId).',
        }
      }
      env.landlordSigned = true
    }
    const status = deriveStatus(env)
    const at = request.at ?? new Date().toISOString()
    return {
      ok: true,
      provider: this.id,
      party: request.party,
      status,
      signedAt: at,
      summary: `Mock recorded ${request.party} signature by ${request.signerName} (non-production).`,
    }
  }
}

type FetchLike = typeof fetch

/**
 * SigniFlow adapter — proxies to server /api/esign (DQ-C1 Mode A).
 * Partner HTTP (CreateWorkflow → InitiateFlow) runs only on the server with env keys.
 */
export class SigniFlowESignProvider implements ESignProvider {
  readonly id = 'signiflow'
  readonly live = true
  readonly nonProduction = false
  private readonly fetchImpl: FetchLike
  private readonly createPath: string
  private readonly statusPath: string
  /** Test-only: simulate "keys absent" refuse without calling network. */
  private readonly forceUnconfigured: boolean

  constructor(
    config: {
      /** @deprecated Ignored for live HTTP — secrets are server-only. Kept for test messaging. */
      apiKey?: string
      apiUrl?: string
      fetchImpl?: FetchLike
      createPath?: string
      statusPath?: string
      /** When true, refuse immediately (honest stub) without fetch. */
      forceUnconfigured?: boolean
    } = {},
  ) {
    this.fetchImpl = config.fetchImpl ?? fetch
    this.createPath = config.createPath ?? '/api/esign/create-envelope'
    this.statusPath = config.statusPath ?? '/api/esign/status'
    // Legacy: empty apiKey+apiUrl used to mean "not configured" in Step 5 tests.
    this.forceUnconfigured =
      config.forceUnconfigured === true ||
      (config.apiKey !== undefined &&
        config.apiUrl !== undefined &&
        !config.apiKey.trim() &&
        !config.apiUrl.trim())
  }

  get configured(): boolean {
    return !this.forceUnconfigured
  }

  async createEnvelope(request: ESignCreateEnvelopeRequest): Promise<ESignCreateEnvelopeResponse> {
    if (this.forceUnconfigured) {
      return {
        ok: false,
        provider: this.id,
        live: true,
        nonProduction: false,
        status: 'failed',
        error:
          'SigniFlow is not configured. Set ESIGN_SIGNIFLOW_API_KEY and ESIGN_SIGNIFLOW_API_URL (partner keys required).',
      }
    }

    try {
      const res = await this.fetchImpl(this.createPath, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      const json = (await res.json()) as ESignCreateEnvelopeResponse & { error?: string }
      if (!res.ok || !json.ok) {
        return {
          ok: false,
          provider: this.id,
          live: true,
          nonProduction: false,
          status: 'failed',
          error:
            json.error ??
            `SigniFlow create-envelope refused (HTTP ${res.status}). Partner keys required on server — never invent signed-live.`,
        }
      }
      return {
        ok: true,
        provider: this.id,
        live: true,
        nonProduction: false,
        envelopeId: json.envelopeId ?? null,
        externalReference: json.externalReference ?? null,
        status: json.status ?? 'sent',
        summary: json.summary,
      }
    } catch {
      return {
        ok: false,
        provider: this.id,
        live: true,
        nonProduction: false,
        status: 'failed',
        error:
          'SigniFlow is not configured. Set ESIGN_PROVIDER=signiflow with ESIGN_SIGNIFLOW_API_KEY and ESIGN_SIGNIFLOW_API_URL on the server (partner keys required). Soft-demo uses mock.',
      }
    }
  }

  async recordSign(request: ESignRecordSignRequest): Promise<ESignRecordSignResponse> {
    if (this.forceUnconfigured) {
      return {
        ok: false,
        provider: this.id,
        party: request.party,
        status: 'failed',
        error: 'SigniFlow is not configured (partner keys required).',
      }
    }

    // Never invent staff-click signed-live — poll partner status via server.
    try {
      const res = await this.fetchImpl(this.statusPath, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ envelopeId: request.envelopeId }),
      })
      const json = (await res.json()) as {
        ok?: boolean
        status?: LeaseESignStatus
        error?: string
        docStatus?: string
      }
      if (!res.ok || !json.ok) {
        return {
          ok: false,
          provider: this.id,
          party: request.party,
          status: 'failed',
          error:
            json.error ??
            'SigniFlow status poll refused. Signatures are captured in the partner ceremony — do not invent signed-live.',
        }
      }
      const status = json.status ?? 'sent'
      if (status === 'completed' || status === 'partially_signed') {
        return {
          ok: true,
          provider: this.id,
          party: request.party,
          status,
          signedAt: new Date().toISOString(),
          summary: `SigniFlow GetDocStatus: ${json.docStatus ?? status} (partner-confirmed, not staff-click).`,
        }
      }
      return {
        ok: false,
        provider: this.id,
        party: request.party,
        status,
        error: `SigniFlow document not yet signed for ${request.party} (status: ${json.docStatus ?? status}). Wait for partner ceremony or webhook.`,
      }
    } catch {
      return {
        ok: false,
        provider: this.id,
        party: request.party,
        status: 'failed',
        error:
          'SigniFlow live sign status is unavailable — use partner ceremony / webhook. Do not invent signed-live.',
      }
    }
  }
}

/** @deprecated Alias — prefer SigniFlowESignProvider (DQ-C1). */
export const SigniFlowESignProviderPlaceholder = SigniFlowESignProvider

/**
 * Placeholder for DocuSign (Mode A OUT — no live HTTP).
 */
export class DocuSignESignProviderPlaceholder implements ESignProvider {
  readonly id = 'docusign'
  readonly live = true
  readonly nonProduction = false
  private readonly integrationKey?: string
  private readonly accountId?: string
  private readonly apiUrl?: string

  constructor(
    config: { integrationKey?: string; accountId?: string; apiUrl?: string } = {},
  ) {
    this.integrationKey = config.integrationKey
    this.accountId = config.accountId
    this.apiUrl = config.apiUrl
  }

  get configured(): boolean {
    return Boolean(
      this.integrationKey?.trim() && this.accountId?.trim() && this.apiUrl?.trim(),
    )
  }

  async createEnvelope(_request: ESignCreateEnvelopeRequest): Promise<ESignCreateEnvelopeResponse> {
    if (!this.configured) {
      return {
        ok: false,
        provider: this.id,
        live: true,
        nonProduction: false,
        status: 'failed',
        error:
          'DocuSign is not configured. Set ESIGN_DOCUSIGN_INTEGRATION_KEY, ESIGN_DOCUSIGN_ACCOUNT_ID, and ESIGN_DOCUSIGN_API_URL (partner keys required). Mode A ships SigniFlow only.',
      }
    }
    return {
      ok: false,
      provider: this.id,
      live: true,
      nonProduction: false,
      status: 'failed',
      error:
        'DocuSign live API adapter is a placeholder (Mode A OUT). Partner credentials may be present but HTTP is not implemented — use mock or SigniFlow.',
    }
  }

  async recordSign(request: ESignRecordSignRequest): Promise<ESignRecordSignResponse> {
    return {
      ok: false,
      provider: this.id,
      party: request.party,
      status: 'failed',
      error: this.configured
        ? 'DocuSign live sign webhook is not implemented (Mode A OUT) — use mock provider.'
        : 'DocuSign is not configured (partner keys required).',
    }
  }
}

export type ESignProviderKind = 'mock' | 'signiflow' | 'docusign'

/**
 * Resolve provider from an env map (server or Vite).
 * Defaults to mock. SigniFlow never reads API keys from VITE_* .
 */
export function eSignProviderFromEnv(
  env: Record<string, string | undefined> = {},
): ESignProvider {
  const kind = (env.ESIGN_PROVIDER ?? env.VITE_ESIGN_PROVIDER ?? 'mock').toLowerCase()
  if (kind === 'signiflow') {
    return new SigniFlowESignProvider({})
  }
  if (kind === 'docusign') {
    return new DocuSignESignProviderPlaceholder({
      integrationKey: env.ESIGN_DOCUSIGN_INTEGRATION_KEY,
      accountId: env.ESIGN_DOCUSIGN_ACCOUNT_ID,
      apiUrl: env.ESIGN_DOCUSIGN_API_URL,
    })
  }
  return new MockDevESignProvider()
}

/** Test helper — clear mock envelope book between tests. */
export function resetMockESignEnvelopes(): void {
  mockEnvelopes.clear()
}
