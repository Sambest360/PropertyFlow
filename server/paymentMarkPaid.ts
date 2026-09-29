/**
 * Staff EFT mark-paid. Session check uses the existing resolveSessionUser
 * helper. This is not the generic persist upsert.
 */
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { resolveSessionUser } from './auth.js'
import { markPaymentPaidByStaff } from './writes.js'

function statusOf(err: unknown): ContentfulStatusCode {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = Number((err as { status: unknown }).status)
    if (status >= 400 && status < 600) return status as ContentfulStatusCode
  }
  return 500
}

export async function markPaymentPaidRoute(c: Context) {
  const session = await resolveSessionUser(c)
  if (!session) return c.json({ ok: false, error: 'unauthorized' }, 401)
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const result = await markPaymentPaidByStaff({
      paymentId: c.req.param('id'),
      actor: {
        userId: session.frontendId,
        role: session.role,
        agencyId: session.agencyId,
        recordedByUserId: session.id,
      },
      method: typeof body.method === 'string' ? body.method : null,
      paidAt: typeof body.paidAt === 'string' ? body.paidAt : null,
      reference: typeof body.reference === 'string' ? body.reference : null,
      paidAmount: typeof body.paidAmount === 'number' ? body.paidAmount : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      attachments: Array.isArray(body.attachments) ? body.attachments : null,
    })
    return c.json({ ok: true, uuid: result.uuid })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'mark_paid_failed'
    return c.json({ ok: false, error: message }, statusOf(err))
  }
}
