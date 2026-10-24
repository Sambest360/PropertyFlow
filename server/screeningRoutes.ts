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

import { timingSafeEqual } from 'node:crypto'
import type { Context, Hono } from 'hono'
import type { ScreeningWebhookPayload } from '../src/lib/screening/types.js'
import { screeningProviderFromEnv } from '../src/lib/screening/providers.js'
import type { DemoActor } from './actor.js'
import { checkCronAuth } from './leaseReminders.js'
import {
  billScreeningCharges,
  getCheckFull,
  getCheckSummary,
  getConsentTerms,
  getScreeningSettings,
  giveConsent,
  handleProviderWebhook,
  listChecks,
  listPricing,
  requestCheck,
  runScreeningPurge,
  saveScreeningSettings,
  screeningUsage,
  setPricing,
  withdrawConsent,
  type ScreeningDeps,
} from './screeningChecks.js'

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

/** Constant-time compare of a shared secret header. */
function sameSecret(got: string, expected: string): boolean {
  const a = Buffer.from(got, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
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
    if (!header || !sameSecret(header, secret)) {
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
    providerWebhookPath: '/api/screening/webhook/:provider',
  })
}

// ---------------------------------------------------------------------------
// Persisted checks (migration 028, server/screeningChecks.ts)
// ---------------------------------------------------------------------------

export type ScreeningRouteDeps = ScreeningDeps & {
  /** Verified actor or throws a 401 (index.ts passes requireActor). */
  requireActor: (c: Context) => Promise<DemoActor>
  cronSecret?: () => string | undefined
}

function errBody(err: unknown): { status: number; body: Record<string, unknown> } {
  const e = err as { status?: unknown; code?: unknown; message?: unknown }
  const status = typeof e?.status === 'number' && e.status >= 400 && e.status < 600 ? e.status : 500
  const code = typeof e?.code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(e.code) ? e.code : undefined
  // 500s never echo internals (could carry SQL or payload fragments).
  const message = status === 500 ? 'Screening request failed' : String(e?.message ?? 'Screening request failed')
  return { status, body: { ok: false, error: code ?? 'screening_failed', ...(code ? { code } : {}), message } }
}

function requestMeta(c: Context) {
  return {
    ip: (c.req.header('x-forwarded-for') ?? '').split(',')[0]?.trim() || c.req.header('x-real-ip') || null,
    userAgent: c.req.header('user-agent') ?? null,
  }
}

async function jsonBody(c: Context): Promise<Record<string, unknown>> {
  const body = (await c.req.json().catch(() => ({}))) as unknown
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
}

/**
 * Screening routes. The legacy POST /api/screening/webhook stays as-is above;
 * provider callbacks that persist use /api/screening/webhook/:provider.
 */
export function registerScreeningRoutes(app: Hono, deps: ScreeningRouteDeps) {
  const run =
    (fn: (c: Context, actor: DemoActor) => Promise<unknown>) =>
    async (c: Context) => {
      try {
        const actor = await deps.requireActor(c)
        return c.json((await fn(c, actor)) as Record<string, unknown>)
      } catch (err) {
        const { status, body } = errBody(err)
        return c.json(body, status as 400)
      }
    }

  app.get('/api/screening/consent-terms', run((c, actor) => getConsentTerms(deps, actor, c.req.query('applicationId'))))
  app.post(
    '/api/screening/consents',
    run(async (c, actor) => giveConsent(deps, actor, await jsonBody(c), requestMeta(c))),
  )
  app.post('/api/screening/consents/:id/withdraw', run((c, actor) => withdrawConsent(deps, actor, c.req.param('id') ?? '')))
  app.post('/api/screening/checks', run(async (c, actor) => requestCheck(deps, actor, await jsonBody(c))))
  app.get('/api/screening/checks', run((c, actor) => listChecks(deps, actor, c.req.query('applicationId'))))
  app.get('/api/screening/checks/:id/full', run((c, actor) => getCheckFull(deps, actor, c.req.param('id') ?? '')))
  app.get('/api/screening/checks/:id', run((c, actor) => getCheckSummary(deps, actor, c.req.param('id') ?? '')))
  app.get('/api/screening/settings', run((c, actor) => getScreeningSettings(deps, actor, c.req.query('agencyId'))))
  app.put('/api/screening/settings', run(async (c, actor) => saveScreeningSettings(deps, actor, await jsonBody(c))))
  app.get(
    '/api/admin/screening/usage',
    run((c, actor) => screeningUsage(deps, actor, { month: c.req.query('month'), agencyId: c.req.query('agencyId') })),
  )
  app.post('/api/admin/screening/usage/bill', run(async (c, actor) => billScreeningCharges(deps, actor, await jsonBody(c))))
  app.get('/api/admin/screening/pricing', run((_c, actor) => listPricing(deps, actor)))
  app.put('/api/admin/screening/pricing', run(async (c, actor) => setPricing(deps, actor, await jsonBody(c))))

  app.post('/api/screening/webhook/:provider', async (c) => {
    try {
      const raw = await c.req.text()
      const headers = Object.fromEntries(Object.entries(c.req.header()).map(([k, v]) => [k.toLowerCase(), v]))
      const r = await handleProviderWebhook(deps, c.req.param('provider') ?? '', raw, headers)
      return c.json(r.body, r.status)
    } catch (err) {
      const { status, body } = errBody(err)
      return c.json(body, status as 400)
    }
  })

  /**
   * Daily purge of full results past retain_until (vercel.json cron).
   * Authorization: Bearer CRON_SECRET only; unset -> 503 and does nothing.
   */
  app.get('/api/cron/screening-purge', async (c) => {
    const denied = checkCronAuth(c.req.header('authorization'), (deps.cronSecret ?? (() => process.env.CRON_SECRET))())
    if (denied === 503) return c.json({ ok: false, error: 'cron_not_configured' }, 503)
    if (denied === 401) return c.json({ ok: false, error: 'unauthorized' }, 401)
    try {
      return c.json(await runScreeningPurge(deps))
    } catch {
      console.error('[screening-purge] run failed')
      return c.json({ ok: false, error: 'run_failed' }, 500)
    }
  })
}
