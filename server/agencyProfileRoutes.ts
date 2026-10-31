/**
 * HTTP routes for public listing contact cards, agency public profiles and
 * profile photos (server/agencyPublicProfile.ts). Registered from server/index.ts.
 */
import type { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { databaseConfigured } from './db.js'
import { errStatus } from './errStatus.js'
import { actorHasUsersManage, enrichActor } from './scopeGate.js'
import { resolveRequestActor } from './requestActor.js'
import {
  getAgencyProfile,
  getUserPhoto,
  listingContactForUnit,
  saveAgencyProfile,
  setUserPhoto,
} from './agencyPublicProfile.js'

function fail(err: unknown): { status: number; body: Record<string, unknown> } {
  const status = errStatus(err)
  const code = err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
    ? (err as { code: string }).code
    : undefined
  const message = err instanceof Error ? err.message : String(err)
  return { status, body: { ok: false, error: code ?? 'request_failed', message } }
}

async function actorOf(c: Parameters<typeof resolveRequestActor>[0]) {
  const raw = await resolveRequestActor(c, null)
  if (!raw) throw Object.assign(new Error('Sign-in required'), { status: 401, code: 'ACTOR_REQUIRED' })
  return enrichActor(raw)
}

async function uploadPhoto(dataUrl: string, folder: string): Promise<string> {
  const { uploadPhotoDataUrl } = await import('./photoStorage.js')
  return uploadPhotoDataUrl(dataUrl, folder)
}

export function registerAgencyProfileRoutes(app: Hono) {
  /** Public: agency + contact person for a published listing (404 when not public). */
  app.get('/api/public/listings/:id/contact', async (c) => {
    if (!databaseConfigured) return c.json({ error: 'database_unconfigured' }, 503)
    try {
      const { publicListingById } = await import('./publicListing.js')
      const { resolveLiveListing } = await import('./listingResolve.js')
      const { buildBootstrap } = await import('./bootstrap.js')
      let unitId: string | null = null
      const visible = await publicListingById(c.req.param('id'), {
        resolveUnitId: async (id) => (unitId = (await resolveLiveListing(id)).unitId || null),
        build: async (unitIds) =>
          (await buildBootstrap({
            lite: true,
            unitIds,
            limits: { messages: 1, notifications: 1, leads: 1, applications: 1, tickets: 1, payments: 1, documents: 1 },
          })) as unknown as Record<string, unknown>,
      })
      if (visible.status !== 200 || !unitId) return c.json(visible.body, 404)
      return c.json(await listingContactForUnit(unitId), 200, { 'Cache-Control': 'public, max-age=60' })
    } catch (err) {
      console.error('[api/public/listings/contact]', err instanceof Error ? err.message : String(err))
      return c.json({ error: 'contact_failed', message: 'Contact details are unavailable right now.' }, 500)
    }
  })

  app.get('/api/agencies/:id/public-profile', async (c) => {
    try {
      const actor = await actorOf(c)
      return c.json({ ok: true, profile: await getAgencyProfile(actor, c.req.param('id')) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  /** Agency admins (own agency) and super admins: contact details + logo. Never the name. */
  app.put('/api/agencies/:id/public-profile', async (c) => {
    try {
      const actor = await actorOf(c)
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
      return c.json({ ok: true, profile: await saveAgencyProfile(actor, c.req.param('id'), body, uploadPhoto) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  app.get('/api/users/:id/photo', async (c) => {
    try {
      const actor = await actorOf(c)
      return c.json({ ok: true, ...(await getUserPhoto(actor, c.req.param('id'), () => actorHasUsersManage(actor))) })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })

  /** Body { photo: dataUrl | null }. Self (staff), agency admins for own staff, super admins. */
  app.put('/api/users/:id/photo', async (c) => {
    try {
      const actor = await actorOf(c)
      const body = (await c.req.json().catch(() => ({}))) as { photo?: unknown }
      if (!('photo' in body)) return c.json({ ok: false, error: 'bad_request', message: 'photo is required' }, 400)
      return c.json({
        ok: true,
        ...(await setUserPhoto(actor, c.req.param('id'), body.photo, () => actorHasUsersManage(actor), uploadPhoto)),
      })
    } catch (err) {
      const f = fail(err)
      return c.json(f.body, f.status as ContentfulStatusCode)
    }
  })
}
