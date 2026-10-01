import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import {
  esignCreateEnvelope,
  esignProviderInfo,
  esignStatus,
  esignWebhook,
} from './esignRoutes'

const ENV_SNAPSHOT = { ...process.env }

function buildApp() {
  const app = new Hono()
  app.get('/api/esign/provider', (c) => esignProviderInfo(c))
  app.post('/api/esign/create-envelope', (c) => esignCreateEnvelope(c))
  app.post('/api/esign/status', (c) => esignStatus(c))
  app.post('/api/esign/webhook', (c) => esignWebhook(c))
  return app
}

const tinyPdf = 'data:application/pdf;base64,JVBERi0x'

describe('esign routes (DQ-C1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    for (const k of Object.keys(process.env)) {
      if (!(k in ENV_SNAPSHOT)) delete process.env[k]
    }
    Object.assign(process.env, ENV_SNAPSHOT)
    delete process.env.ESIGN_PROVIDER
    delete process.env.ESIGN_SIGNIFLOW_API_KEY
    delete process.env.ESIGN_SIGNIFLOW_API_URL
    delete process.env.ESIGN_SIGNIFLOW_WEBHOOK_SECRET
  })

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (!(k in ENV_SNAPSHOT)) delete process.env[k]
    }
    Object.assign(process.env, ENV_SNAPSHOT)
    vi.unstubAllGlobals()
  })

  it('provider info defaults to mock honesty', async () => {
    const res = await buildApp().request('/api/esign/provider')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.signiflowLiveConfigured).toBe(false)
    expect(body.docusignLive).toBe(false)
    expect(body.paths.createEnvelope).toBe('/api/esign/create-envelope')
  })

  it('create-envelope refuses when provider ≠ signiflow', async () => {
    const res = await buildApp().request('/api/esign/create-envelope', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenancyId: 'TN-1',
        pdfUrl: tinyPdf,
        tenant: { name: 'T', email: 't@e.com' },
      }),
    })
    expect(res.status).toBe(501)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/ESIGN_PROVIDER=signiflow/i)
  })

  it('create-envelope refuses when keys absent (honest stub)', async () => {
    process.env.ESIGN_PROVIDER = 'signiflow'
    const res = await buildApp().request('/api/esign/create-envelope', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenancyId: 'TN-1',
        pdfUrl: tinyPdf,
        tenant: { name: 'T', email: 't@e.com' },
      }),
    })
    expect(res.status).toBe(501)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/partner keys/i)
  })

  it('create-envelope succeeds with mocked SigniFlow HTTP when keys present', async () => {
    process.env.ESIGN_PROVIDER = 'signiflow'
    process.env.ESIGN_SIGNIFLOW_API_KEY = 'tok'
    process.env.ESIGN_SIGNIFLOW_API_URL =
      'https://flow.signflow.co.za/API/SignFlowAPIServiceRest.svc'

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('/CreateWorkflow')) {
          return new Response(JSON.stringify({ DocIDField: 1001, ResultField: 'Success' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (u.includes('/AddWorkflowStepV2')) {
          return new Response(JSON.stringify({ ResultField: 'Success' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (u.includes('/InitiateFlow')) {
          return new Response(JSON.stringify({ DocIDField: 1001, ResultField: 'Success' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('nope', { status: 404 })
      }),
    )

    const res = await buildApp().request('/api/esign/create-envelope', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenancyId: 'TN-1',
        leaseDocumentId: 'PD-1',
        pdfUrl: tinyPdf,
        subject: 'Lease',
        tenant: { name: 'Thandi Molefe', email: 'thandi@example.com' },
        landlord: { name: 'Owner', email: 'owner@example.com', userId: 'U-1' },
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.provider).toBe('signiflow')
    expect(body.envelopeId).toBe('SF-1001')
    expect(body.status).toBe('sent')
    expect(body.live).toBe(true)
    expect(body.nonProduction).toBe(false)
  })

  it('webhook validates shape and stays PARTIAL (persisted:false)', async () => {
    const bad = await buildApp().request('/api/esign/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    expect(bad.status).toBe(400)

    const ok = await buildApp().request('/api/esign/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenancyId: 'TN-1',
        status: 'completed',
        envelopeId: 'SF-1001',
      }),
    })
    expect(ok.status).toBe(202)
    const body = await ok.json()
    expect(body.ok).toBe(true)
    expect(body.persisted).toBe(false)
    expect(body.note).toMatch(/PARTIAL/i)
  })

  it('status refuses without signiflow keys', async () => {
    process.env.ESIGN_PROVIDER = 'signiflow'
    const res = await buildApp().request('/api/esign/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ envelopeId: 'SF-1' }),
    })
    expect(res.status).toBe(501)
  })
})
