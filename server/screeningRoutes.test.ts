import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { screeningProviderInfo, screeningWebhook } from './screeningRoutes'

function buildApp() {
  const app = new Hono()
  app.get('/api/screening/provider', (c) => screeningProviderInfo(c))
  app.post('/api/screening/webhook', (c) => screeningWebhook(c))
  return app
}

describe('screening webhook stub', () => {
  it('reports mock provider by default', async () => {
    const app = buildApp()
    const res = await app.request('/api/screening/provider')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.provider).toBe('mock')
    expect(body.webhookPath).toBe('/api/screening/webhook')
  })

  it('rejects invalid payload', async () => {
    const app = buildApp()
    const res = await app.request('/api/screening/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'passed' }),
    })
    expect(res.status).toBe(400)
  })

  it('acknowledges valid webhook without inventing persistence', async () => {
    const app = buildApp()
    const res = await app.request('/api/screening/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        applicationId: 'APP-1',
        status: 'passed',
        score: 700,
        summary: 'ok',
      }),
    })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.persisted).toBe(false)
    expect(body.parsed.status).toBe('passed')
  })
})
