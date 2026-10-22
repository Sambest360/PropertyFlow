/**
 * HTTP routes for lease inventory and inspections.
 */
import type { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { errStatus } from './errStatus.js'
import { enrichActor } from './scopeGate.js'
import { resolveRequestActor } from './requestActor.js'
import {
  compareInspection,
  createInspection,
  createInventory,
  decideDeductions,
  disputeInspection,
  getInspection,
  listInventory,
  listLeaseInspections,
  listTemplates,
  patchInspectionItem,
  patchInventory,
  saveTemplate,
  signInspection,
  storeInspectionPdf,
} from './inspectionInventory.js'

function fail(err: unknown): { status: number; body: Record<string, unknown> } {
  const status = errStatus(err)
  const code = err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
    ? (err as { code: string }).code
    : undefined
  const message = err instanceof Error ? err.message : String(err)
  return { status, body: { ok: false, error: code ?? 'request_failed', message, ...(code ? { code } : {}) } }
}

async function actorOf(c: Parameters<typeof resolveRequestActor>[0]) {
  const raw = await resolveRequestActor(c, null)
  if (!raw) throw Object.assign(new Error('Sign-in required'), { status: 401, code: 'ACTOR_REQUIRED' })
  return enrichActor(raw)
}

export function registerInspectionRoutes(app: Hono) {
  app.get('/api/units/:id/inventory', async (c) => {
    try {
      const actor = await actorOf(c)
      return c.json({ ok: true, ...(await listInventory(actor, c.req.param('id'))) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.post('/api/units/:id/inventory', async (c) => {
    try {
      const actor = await actorOf(c)
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
      return c.json({ ok: true, ...(await createInventory(actor, c.req.param('id'), body)) }, 201)
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.patch('/api/units/:id/inventory', async (c) => {
    try {
      const actor = await actorOf(c)
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
      return c.json({ ok: true, ...(await patchInventory(actor, c.req.param('id'), body)) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.get('/api/leases/:id/inspections', async (c) => {
    try {
      const actor = await actorOf(c)
      return c.json({ ok: true, ...(await listLeaseInspections(actor, c.req.param('id'))) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.post('/api/leases/:id/inspections', async (c) => {
    try {
      const actor = await actorOf(c)
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
      return c.json({ ok: true, ...(await createInspection(actor, c.req.param('id'), body)) }, 201)
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.post('/api/leases/:id/deductions', async (c) => {
    try {
      const actor = await actorOf(c)
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
      return c.json({ ok: true, ...(await decideDeductions(actor, c.req.param('id'), body)) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.get('/api/inspections/:id', async (c) => {
    try {
      const actor = await actorOf(c)
      return c.json({ ok: true, ...(await getInspection(actor, c.req.param('id'))) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.patch('/api/inspections/:id/items/:itemId', async (c) => {
    try {
      const actor = await actorOf(c)
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
      return c.json({ ok: true, ...(await patchInspectionItem(actor, c.req.param('id'), c.req.param('itemId'), body)) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.post('/api/inspections/:id/sign', async (c) => {
    try {
      const actor = await actorOf(c)
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
      const ip = (c.req.header('x-forwarded-for') ?? '').split(',')[0]?.trim() || null
      return c.json({ ok: true, ...(await signInspection(actor, c.req.param('id'), body, ip)) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.post('/api/inspections/:id/dispute', async (c) => {
    try {
      const actor = await actorOf(c)
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
      return c.json({ ok: true, ...(await disputeInspection(actor, c.req.param('id'), body)) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.get('/api/inspections/:id/compare', async (c) => {
    try {
      const actor = await actorOf(c)
      return c.json({ ok: true, ...(await compareInspection(actor, c.req.param('id'))) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.post('/api/inspections/:id/pdf', async (c) => {
    try {
      const actor = await actorOf(c)
      return c.json({ ok: true, ...(await storeInspectionPdf(actor, c.req.param('id'))) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.get('/api/inventory-templates', async (c) => {
    try {
      const actor = await actorOf(c)
      return c.json({ ok: true, ...(await listTemplates(actor)) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.post('/api/inventory-templates', async (c) => {
    try {
      const actor = await actorOf(c)
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
      return c.json({ ok: true, ...(await saveTemplate(actor, body)) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })
}
