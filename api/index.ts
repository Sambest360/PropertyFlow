/**
 * Vercel serverless gateway — responds instantly for health checks, lazy-loads
 * the full Hono app on first auth/data request (avoids 30s cold-start timeouts).
 */
import { handle } from 'hono/vercel'
import { Hono } from 'hono'
import type { Hono as HonoApp } from 'hono'

const gateway = new Hono()

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

gateway.get('/api/health', async (c) => {
  if (c.req.query('db') === '0') {
    const configured = Boolean(process.env.DATABASE_URL?.trim())
    return c.json({
      ok: configured,
      database: configured ? 'configured' : 'unconfigured',
      at: new Date().toISOString(),
    }, configured ? 200 : 503)
  }
  const app = await getMainApp()
  return app.fetch(c.req.raw)
})

gateway.all('*', async (c) => {
  const app = await getMainApp()
  return app.fetch(c.req.raw)
})

export default handle(gateway)

export const config = {
  runtime: 'nodejs',
}
