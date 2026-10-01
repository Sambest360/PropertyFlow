/**
 * DQ-C1 Mode A: SigniFlow WorkFlow HTTP with mocked fetch (no live partner in CI).
 */
import { describe, expect, it, vi } from 'vitest'
import {
  docIdFromEnvelopeId,
  extractPdfBase64,
  isSigniFlowLiveConfigured,
  mapSigniFlowDocStatus,
  normalizeSigniFlowApiBase,
  signiflowConfigFromEnv,
  signiflowCreateAndInitiateWorkflow,
  signiflowGetDocStatus,
  signerFromParty,
} from './signiflow.js'

const BASE = 'https://flow.signflow.co.za/API/SignFlowAPIServiceRest.svc'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('signiflow helpers', () => {
  it('normalizes API base to SignFlowAPIServiceRest.svc', () => {
    expect(normalizeSigniFlowApiBase('https://flow.signflow.co.za')).toBe(BASE)
    expect(normalizeSigniFlowApiBase(BASE + '/')).toBe(BASE)
  })

  it('extracts PDF base64 from data URL', () => {
    expect(extractPdfBase64('data:application/pdf;base64,QUJD')).toBe('QUJD')
    expect(extractPdfBase64('not-pdf')).toBeNull()
  })

  it('maps partner doc status honestly', () => {
    expect(mapSigniFlowDocStatus('Completed')).toBe('completed')
    expect(mapSigniFlowDocStatus('Partially Signed')).toBe('partially_signed')
    expect(mapSigniFlowDocStatus('Pending')).toBe('sent')
    expect(mapSigniFlowDocStatus('Rejected')).toBe('declined')
  })

  it('configures only with key + url', () => {
    expect(signiflowConfigFromEnv({})).toBeNull()
    expect(
      signiflowConfigFromEnv({
        ESIGN_SIGNIFLOW_API_KEY: 'tok',
        ESIGN_SIGNIFLOW_API_URL: 'https://flow.signflow.co.za',
      })?.apiBaseUrl,
    ).toBe(BASE)
    expect(
      isSigniFlowLiveConfigured({
        ESIGN_PROVIDER: 'signiflow',
        ESIGN_SIGNIFLOW_API_KEY: 'tok',
        ESIGN_SIGNIFLOW_API_URL: BASE,
      }),
    ).toBe(true)
    expect(isSigniFlowLiveConfigured({ ESIGN_PROVIDER: 'signiflow' })).toBe(false)
  })

  it('docIdFromEnvelopeId strips SF- prefix', () => {
    expect(docIdFromEnvelopeId('SF-99')).toBe('99')
    expect(docIdFromEnvelopeId('42')).toBe('42')
  })
})

describe('signiflowCreateAndInitiateWorkflow (mocked fetch)', () => {
  const config = {
    apiKey: 'test-token',
    apiBaseUrl: BASE,
    tokenExpiry: '2030-12-31T23:59:59Z',
  }

  const input = {
    documentBase64: 'data:application/pdf;base64,JVBERi0x',
    docName: 'lease-TN-1.pdf',
    message: 'Please sign',
    signers: [signerFromParty('Thandi Molefe', 'thandi@example.com')],
  }

  it('returns ok only after CreateWorkflow + AddWorkflowStepV2 + InitiateFlow Success', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/CreateWorkflow')) {
        return jsonResponse({ DocIDField: 4242, ResultField: 'Success' })
      }
      if (u.endsWith('/AddWorkflowStepV2')) {
        return jsonResponse({ ResultField: 'Success' })
      }
      if (u.endsWith('/InitiateFlow')) {
        return jsonResponse({ DocIDField: 4242, ResultField: 'Success' })
      }
      return jsonResponse({ ResultField: 'Unexpected' }, 404)
    }) as unknown as typeof fetch

    const result = await signiflowCreateAndInitiateWorkflow(input, config, fetchImpl)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.docId).toBe('4242')
      expect(result.envelopeId).toBe('SF-4242')
      expect(result.summary).toMatch(/Partner ceremony/i)
    }
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('refuses when CreateWorkflow fails — never invents envelope', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ResultField: 'Invalid Token' }, 401),
    ) as unknown as typeof fetch
    const result = await signiflowCreateAndInitiateWorkflow(input, config, fetchImpl)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.step).toBe('CreateWorkflow')
      expect(result.error).toMatch(/CreateWorkflow failed/i)
    }
  })

  it('refuses without inventing success when InitiateFlow fails after create', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const u = String(url)
      if (u.endsWith('/CreateWorkflow')) {
        return jsonResponse({ DocIDField: 7, ResultField: 'Success' })
      }
      if (u.endsWith('/AddWorkflowStepV2')) {
        return jsonResponse({ ResultField: 'Success' })
      }
      return jsonResponse({ ResultField: 'Flow Error' }, 500)
    }) as unknown as typeof fetch
    const result = await signiflowCreateAndInitiateWorkflow(input, config, fetchImpl)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.step).toBe('InitiateFlow')
  })
})

describe('signiflowGetDocStatus (mocked fetch)', () => {
  const config = {
    apiKey: 'test-token',
    apiBaseUrl: BASE,
    tokenExpiry: '2030-12-31T23:59:59Z',
  }

  it('maps partner Completed → completed', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ DocStatusField: 'Completed', ResultField: 'Success' }),
    ) as unknown as typeof fetch
    const result = await signiflowGetDocStatus('4242', config, fetchImpl)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.mappedStatus).toBe('completed')
      expect(result.docStatus).toBe('Completed')
    }
  })
})
