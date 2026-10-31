/**
 * GET /api/admin/dashboard and GET /api/admin/access (server/adminDashboard.ts).
 * Read-only. Super admins see every agency, agency admins their own, everyone
 * else 403. Registered from server/index.ts.
 */
import type { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { databaseConfigured } from './db.js'
import { errStatus } from './errStatus.js'
import { resolveRequestActor } from './requestActor.js'
import { buildDashboard, listAccessPeople, resolveDashboardViewer, type HealthDeps } from './adminDashboard.js'

function fail(err: unknown): { status: ContentfulStatusCode; body: Record<string, unknown> } {
  const status = errStatus(err) as ContentfulStatusCode
  const code = err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
    ? (err as { code: string }).code
    : undefined
  const message = status >= 500 ? 'Could not load the dashboard.' : err instanceof Error ? err.message : String(err)
  if (status >= 500) console.error('[admin dashboard]', err instanceof Error ? err.message : String(err))
  return { status, body: { ok: false, error: code ?? 'request_failed', message } }
}

async function viewerOf(c: Parameters<typeof resolveRequestActor>[0]) {
  const raw = await resolveRequestActor(c, null)
  if (!raw) throw Object.assign(new Error('Sign-in required'), { status: 401, code: 'ACTOR_REQUIRED' })
  return resolveDashboardViewer(raw)
}

export function registerAdminDashboardRoutes(app: Hono, deps: HealthDeps) {
  app.get('/api/admin/dashboard', async (c) => {
    if (!databaseConfigured) return c.json({ ok: false, error: 'database_unconfigured' }, 503)
    try {
      const viewer = await viewerOf(c)
      return c.json(await buildDashboard(viewer, deps), 200, { 'Cache-Control': 'no-store' })
    } catch (err) {
      const { status, body } = fail(err)
      return c.json(body, status)
    }
  })

  app.get('/api/admin/access', async (c) => {
    if (!databaseConfigured) return c.json({ ok: false, error: 'database_unconfigured' }, 503)
    try {
      const viewer = await viewerOf(c)
      return c.json(await listAccessPeople(viewer), 200, { 'Cache-Control': 'no-store' })
    } catch (err) {
      const { status, body } = fail(err)
      return c.json(body, status)
    }
  })
}
