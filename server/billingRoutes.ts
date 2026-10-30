/** Lekaya subscription billing routes (server/saasBilling.ts). */
import type { Context, Hono } from 'hono'
import { actorFromSession, resolveSessionUser } from './auth.js'

type Status = 400 | 401 | 403 | 404 | 500
function statusOf(err: unknown): Status {
  const s = (err as { status?: number })?.status
  return (s && [400, 401, 403, 404].includes(s) ? s : 500) as Status
}

async function actorOf(c: Context) {
  const user = await resolveSessionUser(c).catch(() => null)
  return user ? actorFromSession(user) : null
}

function handle(fn: (c: Context) => Promise<unknown>) {
  return async (c: Context) => {
    try {
      return c.json((await fn(c)) as Record<string, unknown>)
    } catch (err) {
      return c.json({ error: 'billing_failed', message: err instanceof Error ? err.message : String(err) }, statusOf(err))
    }
  }
}

function needActor(a: Awaited<ReturnType<typeof actorOf>>) {
  if (!a) throw Object.assign(new Error('Sign in first'), { status: 401 })
  return a
}
function needPlatform(a: Awaited<ReturnType<typeof actorOf>>) {
  const actor = needActor(a)
  if (actor.role !== 'super_admin') throw Object.assign(new Error('Platform team only'), { status: 403 })
  return actor
}

export function registerBillingRoutes(app: Hono): void {
  app.get('/api/billing/invoices', handle(async (c) => {
    const { listInvoices } = await import('./saasBilling.js')
    return { invoices: await listInvoices(needActor(await actorOf(c))) }
  }))
  app.get('/api/billing/invoices/:id', handle(async (c) => {
    const { getInvoice } = await import('./saasBilling.js')
    return { invoice: await getInvoice(needActor(await actorOf(c)), c.req.param('id')!) }
  }))
  app.post('/api/billing/invoices/:id/payments', handle(async (c) => {
    const { recordInvoicePayment } = await import('./saasBilling.js')
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    return { invoice: await recordInvoicePayment(needPlatform(await actorOf(c)), c.req.param('id')!, body) }
  }))
  app.post('/api/billing/invoices/:id/proof', handle(async (c) => {
    const { submitInvoiceProof } = await import('./saasBilling.js')
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    return { invoice: await submitInvoiceProof(needActor(await actorOf(c)), c.req.param('id')!, body) }
  }))
  app.post('/api/billing/invoices/:id/void', handle(async (c) => {
    const { voidInvoice } = await import('./saasBilling.js')
    return { invoice: await voidInvoice(needPlatform(await actorOf(c)), c.req.param('id')!) }
  }))
  app.get('/api/billing/agencies', handle(async (c) => {
    needPlatform(await actorOf(c))
    const { listAgencyBilling } = await import('./saasBilling.js')
    return { agencies: await listAgencyBilling() }
  }))
  app.put('/api/billing/agencies/:agencyId/settings', handle(async (c) => {
    needPlatform(await actorOf(c))
    const { saveAgencyBillingSettings } = await import('./saasBilling.js')
    return { settings: await saveAgencyBillingSettings(c.req.param('agencyId')!, await c.req.json().catch(() => ({}))) }
  }))
  app.post('/api/billing/run', handle(async (c) => {
    needPlatform(await actorOf(c))
    const body = (await c.req.json().catch(() => ({}))) as { agencyId?: string }
    const { generateMonthlyInvoices } = await import('./saasBilling.js')
    const { resolveUuid } = await import('./entityMap.js')
    const clientId = body.agencyId ? await resolveUuid('agency', body.agencyId).catch(() => null) : null
    if (body.agencyId && !clientId) throw Object.assign(new Error('Agency not found'), { status: 404 })
    return await generateMonthlyInvoices(new Date(), clientId)
  }))
  /** Daily: create this month's invoices (from the 1st) and escalate unpaid ones. */
  app.get('/api/cron/saas-billing', async (c) => {
    const secret = process.env.CRON_SECRET
    if (!secret) return c.json({ error: 'cron_disabled' }, 503)
    if (c.req.header('authorization') !== `Bearer ${secret}`) return c.json({ error: 'unauthorized' }, 401)
    const { generateMonthlyInvoices } = await import('./saasBilling.js')
    const { runEscalations } = await import('./escalations.js')
    const invoices = await generateMonthlyInvoices()
    return c.json({ invoices, escalations: await runEscalations() })
  })
}
