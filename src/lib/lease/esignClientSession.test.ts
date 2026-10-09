/**
 * The SigniFlow adapter and PayFast checkout send the session (Bearer +
 * cookie credentials), and the status poll names its lease, because the
 * server routes are now signed-in only and lease-scoped.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/authClient', () => ({ authHeaders: () => ({ Authorization: 'Bearer session-token' }) }))

describe('client session on e-sign + PayFast calls', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('status poll sends tenancyId, the bearer token and credentials', async () => {
    const { SigniFlowESignProvider } = await import('./providers')
    const fetchImpl = vi.fn(async () => Response.json({ ok: true, status: 'sent' }))
    const p = new SigniFlowESignProvider({ fetchImpl: fetchImpl as unknown as typeof fetch })
    await p.recordSign({ envelopeId: 'SF-1', tenancyId: 'TN-1', party: 'tenant', signerName: 'T' })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ envelopeId: 'SF-1', tenancyId: 'TN-1' })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token')
    expect(init.credentials).toBe('include')
  })

  it('create-envelope sends the bearer token', async () => {
    const { SigniFlowESignProvider } = await import('./providers')
    const fetchImpl = vi.fn(async () => Response.json({ ok: true, envelopeId: 'SF-1' }))
    const p = new SigniFlowESignProvider({ fetchImpl: fetchImpl as unknown as typeof fetch })
    await p.createEnvelope({
      tenancyId: 'TN-1', applicationId: null, leaseDocumentId: 'D', pdfUrl: 'x', subject: 's',
      tenant: { name: 'T', email: 't@x.test' }, landlord: null,
    })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token')
  })

  it('PayFast checkout sends the bearer token and credentials', async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: false, error: 'payment_not_yours' }, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    const { startPayfastCheckout } = await import('../payfast/checkout')
    const res = await startPayfastCheckout('PAY-1')
    expect(res.ok).toBe(false)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer session-token')
    expect(init.credentials).toBe('include')
  })
})
