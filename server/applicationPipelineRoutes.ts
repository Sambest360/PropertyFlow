/**
 * Application Pipeline (src/lib/pipeline/applicationPipeline.ts).
 *   GET /api/application-pipeline/default   any signed-in user: the platform default
 *   PUT /api/application-pipeline/default   super admin: change it (locked stages included)
 * The default is seeded by migration 039 into platform_settings. Agencies save
 * their own version in clients.settings.applicationPipeline (agency write).
 */
import type { Hono } from 'hono'
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import { resolveRequestActor } from './requestActor.js'
import { DEFAULT_APPLICATION_PIPELINE, sanitizePipeline, type ApplicationPipeline } from '../src/lib/pipeline/applicationPipeline.js'

const KEY = 'application_pipeline_default'

let ready: Promise<void> | null = null
function ensureTable(): Promise<void> {
  ready ??= query(`
CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(80) PRIMARY KEY, value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by UUID REFERENCES users(id) ON DELETE SET NULL
)`)
    .then(() => undefined)
    .catch((e) => {
      ready = null
      throw e
    })
  return ready
}

export async function platformPipeline(): Promise<ApplicationPipeline> {
  try {
    await ensureTable()
    const row = (await query<{ value: unknown }>(`SELECT value FROM platform_settings WHERE key = $1`, [KEY]))[0]
    const p = row ? sanitizePipeline(row.value) : null
    return p?.stages.length ? p : DEFAULT_APPLICATION_PIPELINE
  } catch {
    return DEFAULT_APPLICATION_PIPELINE
  }
}

export function registerApplicationPipelineRoutes(app: Hono) {
  app.get('/api/application-pipeline/default', async (c) => {
    const actor = await resolveRequestActor(c, null)
    if (!actor) return c.json({ ok: false, message: 'Sign in first' }, 401)
    return c.json({ ok: true, pipeline: await platformPipeline() }, 200, { 'Cache-Control': 'no-store' })
  })

  app.put('/api/application-pipeline/default', async (c) => {
    const actor = await resolveRequestActor(c, null)
    if (!actor) return c.json({ ok: false, message: 'Sign in first' }, 401)
    if (actor.role !== 'super_admin') return c.json({ ok: false, message: 'Only a super admin can change the default pipeline' }, 403)
    const body = (await c.req.json().catch(() => ({}))) as { pipeline?: unknown }
    const pipeline = sanitizePipeline(body.pipeline)
    if (!pipeline.stages.length) return c.json({ ok: false, message: 'The pipeline needs at least one stage' }, 400)
    await ensureTable()
    const by = await resolveUuid('user', actor.userId).catch(() => null)
    await query(
      `INSERT INTO platform_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3::uuid)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [KEY, JSON.stringify(pipeline), by],
    )
    return c.json({ ok: true, pipeline })
  })
}
