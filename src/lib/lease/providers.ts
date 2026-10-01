/**
 * E-sign provider adapters (SigniFlow / DocuSign-shaped).
 * - MockDevESignProvider: records sign events locally — labeled non-production.
 * - SigniFlow / DocuSign placeholders: env-gated; refuse without partner keys.
 * DO NOT invent live partner success or outbound HTTP that "works".
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

/**
 * Placeholder for SigniFlow (SA e-sign).
 * Activates only when ESIGN_PROVIDER=signiflow AND partner keys are present.
 */
export class SigniFlowESignProviderPlaceholder implements ESignProvider {
  readonly id = 'signiflow'
  readonly live = true
  readonly nonProduction = false
  private readonly apiKey?: string
  private readonly apiUrl?: string

  constructor(config: { apiKey?: string; apiUrl?: string } = {}) {
    this.apiKey = config.apiKey
    this.apiUrl = config.apiUrl
  }

  get configured(): boolean {
    return Boolean(this.apiKey?.trim() && this.apiUrl?.trim())
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
          'SigniFlow is not configured. Set ESIGN_SIGNIFLOW_API_KEY and ESIGN_SIGNIFLOW_API_URL (partner keys required).',
      }
    }
    return {
      ok: false,
      provider: this.id,
      live: true,
      nonProduction: false,
      status: 'failed',
      error:
        'SigniFlow live API adapter is a placeholder. Partner credentials are present in env but the HTTP client is not implemented yet — use mock provider.',
    }
  }

  async recordSign(request: ESignRecordSignRequest): Promise<ESignRecordSignResponse> {
    return {
      ok: false,
      provider: this.id,
      party: request.party,
      status: 'failed',
      error: this.configured
        ? 'SigniFlow live sign webhook is not implemented yet — use mock provider.'
        : 'SigniFlow is not configured (partner keys required).',
    }
  }
}

/**
 * Placeholder for DocuSign.
 * Activates only when ESIGN_PROVIDER=docusign AND partner keys are present.
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
          'DocuSign is not configured. Set ESIGN_DOCUSIGN_INTEGRATION_KEY, ESIGN_DOCUSIGN_ACCOUNT_ID, and ESIGN_DOCUSIGN_API_URL (partner keys required).',
      }
    }
    return {
      ok: false,
      provider: this.id,
      live: true,
      nonProduction: false,
      status: 'failed',
      error:
        'DocuSign live API adapter is a placeholder. Partner credentials are present in env but the HTTP client is not implemented yet — use mock provider.',
    }
  }

  async recordSign(request: ESignRecordSignRequest): Promise<ESignRecordSignResponse> {
    return {
      ok: false,
      provider: this.id,
      party: request.party,
      status: 'failed',
      error: this.configured
        ? 'DocuSign live sign webhook is not implemented yet — use mock provider.'
        : 'DocuSign is not configured (partner keys required).',
    }
  }
}

export type ESignProviderKind = 'mock' | 'signiflow' | 'docusign'

/** Resolve provider from an env map (server or Vite). Defaults to mock. */
export function eSignProviderFromEnv(
  env: Record<string, string | undefined> = {},
): ESignProvider {
  const kind = (env.ESIGN_PROVIDER ?? env.VITE_ESIGN_PROVIDER ?? 'mock').toLowerCase()
  if (kind === 'signiflow') {
    return new SigniFlowESignProviderPlaceholder({
      apiKey: env.ESIGN_SIGNIFLOW_API_KEY,
      apiUrl: env.ESIGN_SIGNIFLOW_API_URL,
    })
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
