/**
 * Vercel entry for all /api/* routes.
 * Health responds without loading the full server; other routes lazy-load Hono.
 *
 * P0-register: commit 86d5d99 decommissioned this gateway, so POST
 * /api/auth/register-supabase fell through to the SPA rewrite and answered
 * 405 (HTML for a POST). Restored verbatim from 86d5d99~1 so the register
 * method the client actually calls exists again.
 *
 * Handler contract: do NOT use `hono/vercel`'s `handle()` here. That returns a
 * Web `Response` from a bare function; on this Vite `/api` project Vercel treats
 * the default export as Node `(req, res)` and ignores the return → 30s
 * FUNCTION_INVOCATION_TIMEOUT (reproduced on /api/health and ?db=0).
 */
import { Hono } from 'hono'
import type { Hono as HonoApp } from 'hono'
import { runningCommitSha } from '../server/appConfig.js'
import { createVercelNodeHandler } from '../server/vercelNodeBridge.js'

let mainApp: HonoApp | null = null
let mainLoading: Promise<HonoApp> | null = null

async function getMainApp(): Promise<HonoApp> {
  if (mainApp) return mainApp
  mainLoading ??= import('../server/index.js').then((mod) => {
    mainApp = mod.default
    return mainApp
  })
  return mainLoading
}

const gateway = new Hono().basePath('/api')

gateway.get('/health', async (c) => {
  const at = new Date().toISOString()
  const configured = Boolean(process.env.DATABASE_URL?.trim())

  if (c.req.query('db') === '0') {
    return c.json(
      {
        ok: configured,
        database: configured ? 'configured' : 'unconfigured',
        vercel: Boolean(process.env.VERCEL),
        commit: runningCommitSha(),
        at,
      },
      configured ? 200 : 503,
    )
  }

  if (!configured) {
    return c.json(
      {
        ok: false,
        database: 'unconfigured',
        error: 'DATABASE_URL is not set on Vercel',
        commit: runningCommitSha(),
        at,
      },
      503,
    )
  }

  try {
    const { pingDatabase, databaseConfigWarning } = await import('../server/db.js')
    await pingDatabase(4_000)
    return c.json({
      ok: true,
      database: 'up',
      warning: databaseConfigWarning,
      commit: runningCommitSha(),
      at,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json(
      {
        ok: false,
        database: 'down',
        error: message,
        hint: 'Use Supabase Transaction pooler port 6543 in DATABASE_URL, then redeploy.',
        commit: runningCommitSha(),
        at,
      },
      503,
    )
  }
})

gateway.all('*', async (c) => {
  try {
    const app = await getMainApp()
    return app.fetch(c.req.raw)
  } catch (err) {
    // P0-guest-register: if server/index (or its src/lib deps) fail to load,
    // return JSON so the client can fall back / show honest copy — never a
    // bare Vercel "Internal Server Error" that maps to fake demo-user blame.
    const message = err instanceof Error ? err.message : String(err)
    return c.json(
      {
        ok: false,
        error: 'api_boot_failed',
        message: message || 'API failed to start',
      },
      503,
    )
  }
})

export default createVercelNodeHandler((request) => gateway.fetch(request))
