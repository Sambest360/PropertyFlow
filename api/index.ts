/**
 * Vercel catch-all for /api/* (except dedicated files like api/health.ts).
 * Lazy-loads the Hono app so auth routes don't pay bootstrap import cost up front.
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

const gateway = new Hono()

gateway.all('*', async (c) => {
  const app = await getMainApp()
  return app.fetch(c.req.raw)
})

export default handle(gateway)

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
}
