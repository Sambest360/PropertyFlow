/**
 * ScreeningProvider adapters.
 * - MockDevScreeningProvider: local/dev — async-looking status, no network.
 * - TpnScreeningProviderPlaceholder: env-gated; refuses without partner keys.
 * DO NOT invent live TPN credentials or pretend HTTP calls that "work".
 */

import type {
  ScreeningAsyncStatus,
  ScreeningProvider,
  ScreeningStartRequest,
  ScreeningStartResponse,
  ScreeningWebhookPayload,
} from './types'

function parseCommonWebhook(payload: ScreeningWebhookPayload) {
  const status: ScreeningAsyncStatus =
    payload.status === 'passed'
      ? 'passed'
      : payload.status === 'failed'
        ? 'failed'
        : payload.status === 'in_progress'
          ? 'in_progress'
          : 'pending'
  return {
    status,
    externalReference: payload.externalReference ?? payload.providerEventId ?? null,
    score: payload.score ?? null,
    band: payload.band ?? null,
    summary: payload.summary ?? null,
    checkedAt: payload.checkedAt ?? new Date().toISOString(),
  }
}

/** Deterministic mock bureau for demos and tests. */
export class MockDevScreeningProvider implements ScreeningProvider {
  readonly id = 'mock'
  readonly live = false

  async startCheck(request: ScreeningStartRequest): Promise<ScreeningStartResponse> {
    if (!request.consent.granted) {
      return {
        ok: false,
        status: 'pending',
        provider: this.id,
        error: 'POPIA credit-check consent is required before screening can start.',
      }
    }
    const ref = `MOCK-${request.subject.applicationId}-${Date.now()}`
    return {
      ok: true,
      status: 'in_progress',
      provider: this.id,
      externalReference: ref,
      summary: 'Mock screening queued (dev provider — no bureau call).',
    }
  }

  parseWebhook(payload: ScreeningWebhookPayload) {
    return parseCommonWebhook(payload)
  }
}

/**
 * Placeholder for a real TPN (or similar) integration.
 * Activates only when SCREENING_PROVIDER=tpn AND partner keys are present.
 * Without keys it refuses rather than faking a successful bureau response.
 */
export class TpnScreeningProviderPlaceholder implements ScreeningProvider {
  readonly id = 'tpn'
  readonly live = true
  private readonly apiKey?: string
  private readonly apiUrl?: string
  private readonly webhookSecret?: string

  constructor(config: { apiKey?: string; apiUrl?: string; webhookSecret?: string } = {}) {
    this.apiKey = config.apiKey
    this.apiUrl = config.apiUrl
    this.webhookSecret = config.webhookSecret
  }

  get configured(): boolean {
    return Boolean(this.apiKey?.trim() && this.apiUrl?.trim())
  }

  async startCheck(request: ScreeningStartRequest): Promise<ScreeningStartResponse> {
    if (!request.consent.granted) {
      return {
        ok: false,
        status: 'pending',
        provider: this.id,
        error: 'POPIA credit-check consent is required before screening can start.',
      }
    }
    if (!this.configured) {
      return {
        ok: false,
        status: 'pending',
        provider: this.id,
        error:
          'TPN provider is not configured. Set SCREENING_TPN_API_KEY and SCREENING_TPN_API_URL (partner keys required).',
      }
    }
    // Intentionally no outbound HTTP: live partner wiring lands after keys + contract.
    void this.webhookSecret
    return {
      ok: false,
      status: 'pending',
      provider: this.id,
      error:
        'TPN live API adapter is a placeholder. Partner credentials are present in env but the HTTP client is not implemented yet — use mock provider or manual override.',
    }
  }

  parseWebhook(payload: ScreeningWebhookPayload) {
    return parseCommonWebhook(payload)
  }
}

export type ScreeningProviderKind = 'mock' | 'tpn'

/** Resolve provider from an env map (server or Vite). Defaults to mock. */
export function screeningProviderFromEnv(
  env: Record<string, string | undefined> = {},
): ScreeningProvider {
  const kind = (env.SCREENING_PROVIDER ?? env.VITE_SCREENING_PROVIDER ?? 'mock').toLowerCase()
  if (kind === 'tpn') {
    return new TpnScreeningProviderPlaceholder({
      apiKey: env.SCREENING_TPN_API_KEY,
      apiUrl: env.SCREENING_TPN_API_URL,
      webhookSecret: env.SCREENING_TPN_WEBHOOK_SECRET,
    })
  }
  return new MockDevScreeningProvider()
}
