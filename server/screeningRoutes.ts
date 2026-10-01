/**
 * Screening webhook / ingest stub (roadmap Step 4).
 *
 * POST /api/screening/webhook — accepts a TPN-like payload shape.
 * Does NOT call a live bureau. Partner keys are env-gated; without them
 * the handler still validates the payload shape and returns 501/202 guidance.
 *
 * Live TPN needs partner API keys + signed webhook secret before this
 * can mutate production applications.
 */

import type { Context } from 'hono'
import type { ScreeningWebhookPayload } from '../src/lib/screening/types.js'
import { screeningProviderFromEnv } from '../src/lib/screening/providers.js'

function readEnv(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>
}

export function screeningConfigured(env = readEnv()): boolean {
  const provider = screeningProviderFromEnv(env)
  if (provider.id === 'mock') return true
  if (provider.id === 'tpn') {
    return Boolean(env.SCREENING_TPN_API_KEY?.trim() && env.SCREENING_TPN_API_URL?.trim())
  }
  return false
}

function isWebhookPayload(body: unknown): body is ScreeningWebhookPayload {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  if (typeof b.applicationId !== 'string' || !b.applicationId.trim()) return false
  const status = b.status
  if (
    status !== 'passed' &&
    status !== 'failed' &&
    status !== 'in_progress' &&
    status !== 'pending'
  ) {
    return false
  }
  return true
}

/**
 * Ingest shape for vendor callbacks. Persistence into AppStore/DB is left to
 * a future partner wire-up — this stub validates + acknowledges only.
 */
export async function screeningWebhook(c: Context) {
  const env = readEnv()
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400)
  }

  if (!isWebhookPayload(body)) {
    return c.json(
      {
        ok: false,
        error: 'invalid_payload',
        expected: {
          applicationId: 'string',
          status: 'passed | failed | in_progress | pending',
          externalReference: 'string?',
          score: 'number?',
          band: 'string?',
          summary: 'string?',
          checkedAt: 'ISO string?',
          providerEventId: 'string?',
        },
      },
      400,
    )
  }

  const provider = screeningProviderFromEnv(env)
  const parsed = provider.parseWebhook(body)

  // Optional shared-secret check when configured (no invented secrets).
  const secret = env.SCREENING_TPN_WEBHOOK_SECRET?.trim()
  if (secret) {
    const header = c.req.header('x-screening-signature') ?? c.req.header('x-tpn-signature') ?? ''
    if (!header || header !== secret) {
      return c.json({ ok: false, error: 'invalid_signature' }, 401)
    }
  }

  if (provider.id === 'tpn' && !screeningConfigured(env)) {
    return c.json(
      {
        ok: false,
        error: 'tpn_not_configured',
        message:
          'Live TPN needs partner keys (SCREENING_TPN_API_KEY, SCREENING_TPN_API_URL). Payload accepted for shape validation only.',
        parsed,
      },
      501,
    )
  }

  return c.json(
    {
      ok: true,
      accepted: true,
      provider: provider.id,
      applicationId: body.applicationId,
      parsed,
      // Persistence hook: wire to application upsert once partner integration lands.
      persisted: false,
      note: 'Ingest acknowledged. Application mutation requires the partner-backed persistence path.',
    },
    202,
  )
}

export async function screeningProviderInfo(c: Context) {
  const env = readEnv()
  const provider = screeningProviderFromEnv(env)
  return c.json({
    ok: true,
    provider: provider.id,
    live: provider.live,
    configured: screeningConfigured(env),
    webhookPath: '/api/screening/webhook',
  })
}
