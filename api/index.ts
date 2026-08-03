/**
 * Vercel entry for all /api/* routes.
 * Health responds without loading the full server; other routes lazy-load Hono.
 */
import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import type { Hono as HonoApp } from 'hono'

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
        at,
      },
      503,
    )
  }
})

gateway.all('*', async (c) => {
  const app = await getMainApp()
  return app.fetch(c.req.raw)
})

export default handle(gateway)
