import type { Context, Hono } from 'hono'
import { actorRequiredError } from './actor.js'
import { resolveRequestActor } from './requestActor.js'
import { enrichActor } from './scopeGate.js'
import { errStatus } from './errStatus.js'
import {
  grantApplyOverride,
  listApplyOverrides,
  markBookingAttendance,
  readUnitApplyEligibilityForActor,
} from './applyEligibility.js'

function errorBody(err: unknown): { error: string; code?: string; message: string } {
  const message = err instanceof Error ? err.message : String(err)
  const code = err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
    ? (err as { code: string }).code
    : undefined
  return { error: code ?? 'request_failed', code, message }
}

async function requireActor(c: Context) {
  const raw = await resolveRequestActor(c, null)
  if (!raw) throw actorRequiredError()
  return enrichActor(raw)
}

export function registerViewingApplyRoutes(app: Hono) {
  app.patch('/api/bookings/:id/attendance', async (c) => {
    try {
      const actor = await requireActor(c)
      const body = (await c.req.json().catch(() => ({}))) as { status?: unknown; viewingMode?: unknown }
      const result = await markBookingAttendance(actor, c.req.param('id'), body)
      return c.json({ ok: true, ...result })
    } catch (err) {
      return c.json(errorBody(err), errStatus(err))
    }
  })

  app.get('/api/units/:id/apply-eligibility', async (c) => {
    try {
      const actor = await requireActor(c)
      const result = await readUnitApplyEligibilityForActor(actor, c.req.param('id'))
      return c.json({
        eligible: result.eligible,
        reason: result.reason,
        bookingId: result.bookingId,
        overrideId: result.overrideId,
      })
    } catch (err) {
      return c.json(errorBody(err), errStatus(err))
    }
  })

  app.post('/api/units/:id/apply-overrides', async (c) => {
    try {
      const actor = await requireActor(c)
      const body = (await c.req.json().catch(() => ({}))) as {
        applicantId?: unknown
        applicantEmail?: unknown
        reasonCode?: unknown
        reasonText?: unknown
        expiresAt?: unknown
      }
      const result = await grantApplyOverride(actor, c.req.param('id'), body)
      return c.json({ ok: true, ...result }, 201)
    } catch (err) {
      return c.json(errorBody(err), errStatus(err))
    }
  })

  app.get('/api/apply-overrides', async (c) => {
    try {
      const actor = await requireActor(c)
      const rows = await listApplyOverrides(actor, c.req.query('agencyId') ?? null)
      return c.json({ ok: true, overrides: rows })
    } catch (err) {
      return c.json(errorBody(err), errStatus(err))
    }
  })
}
