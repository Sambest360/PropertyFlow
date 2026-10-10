/**
 * E-sign API routes (DQ-C1 Mode A — SigniFlow).
 *
 * POST /api/esign/create-envelope — server-only SigniFlow HTTP when configured
 * POST /api/esign/status — GetDocStatus poll (partner truth)
 * POST /api/esign/webhook — shape-validate + acknowledge (PARTIAL: persisted false)
 * GET  /api/esign/provider — honesty / config status (no secrets)
 *
 * FE soft-demo stays mock. No VITE_ESIGN_SIGNIFLOW_*. Never invent signed-live.
 */

import type { Context } from 'hono'
import {
  docIdFromEnvelopeId,
  isSigniFlowLiveConfigured,
  isSigniFlowProviderSelected,
  signerFromParty,
  signiflowConfigFromEnv,
  signiflowCreateAndInitiateWorkflow,
  signiflowGetDocStatus,
} from './signiflow.js'

function readEnv(): Record<string, string | undefined> {
  return process.env as Record<string, string | undefined>
}

export function esignProviderInfo(c: Context) {
  const env = readEnv()
  const selected = (env.ESIGN_PROVIDER ?? 'mock').trim().toLowerCase() || 'mock'
  const live = isSigniFlowLiveConfigured(env)
  return c.json({
    ok: true,
    provider: selected,
    signiflowSelected: isSigniFlowProviderSelected(env),
    signiflowLiveConfigured: live,
    docusignLive: false,
    note: live
      ? 'SigniFlow HTTP enabled (server keys present). This environment uses the test signing provider when ESIGN_PROVIDER=mock. DocuSign stays placeholder.'
      : selected === 'signiflow'
        ? 'ESIGN_PROVIDER=signiflow but partner keys missing — create-envelope will refuse honestly. This environment uses the test signing provider.'
        : 'Default mock e-sign (non-production). Live SigniFlow needs ESIGN_PROVIDER=signiflow + ESIGN_SIGNIFLOW_API_KEY + ESIGN_SIGNIFLOW_API_URL on the server.',
    paths: {
      createEnvelope: '/api/esign/create-envelope',
      status: '/api/esign/status',
      webhook: '/api/esign/webhook',
    },
    webhookPersistence: 'partial',
  })
}

type CreateBody = {
  tenancyId?: string
  applicationId?: string | null
  leaseDocumentId?: string
  pdfUrl?: string
  subject?: string
  tenant?: { name?: string; email?: string; userId?: string | null }
  landlord?: { name?: string; email?: string; userId?: string } | null
}

export async function esignCreateEnvelope(c: Context) {
  const env = readEnv()

  if (!isSigniFlowProviderSelected(env)) {
    return c.json(
      {
        ok: false,
        provider: env.ESIGN_PROVIDER?.trim().toLowerCase() || 'mock',
        live: false,
        nonProduction: true,
        status: 'failed',
        error:
          'SigniFlow create-envelope requires ESIGN_PROVIDER=signiflow on the server. This environment uses the test signing provider.',
      },
      501,
    )
  }

  const config = signiflowConfigFromEnv(env)
  if (!config) {
    return c.json(
      {
        ok: false,
        provider: 'signiflow',
        live: true,
        nonProduction: false,
        status: 'failed',
        error:
          'SigniFlow is not configured. Set ESIGN_SIGNIFLOW_API_KEY and ESIGN_SIGNIFLOW_API_URL (partner keys required — server only).',
      },
      501,
    )
  }

  let body: CreateBody
  try {
    body = (await c.req.json()) as CreateBody
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400)
  }

  const pdfUrl = typeof body.pdfUrl === 'string' ? body.pdfUrl : ''
  const tenantName = body.tenant?.name?.trim() || 'Tenant'
  const tenantEmail = body.tenant?.email?.trim() || ''
  if (!tenantEmail) {
    return c.json(
      { ok: false, provider: 'signiflow', live: true, nonProduction: false, status: 'failed', error: 'tenant.email is required' },
      400,
    )
  }

  const signers = [signerFromParty(tenantName, tenantEmail)]
  if (body.landlord?.userId && body.landlord.email?.trim()) {
    signers.push(
      signerFromParty(body.landlord.name?.trim() || 'Landlord', body.landlord.email.trim()),
    )
  } else if (body.landlord?.userId && !body.landlord.email?.trim()) {
    return c.json(
      {
        ok: false,
        provider: 'signiflow',
        live: true,
        nonProduction: false,
        status: 'failed',
        error: 'landlord.email is required when landlord countersign is requested',
      },
      400,
    )
  }

  const result = await signiflowCreateAndInitiateWorkflow(
    {
      documentBase64: pdfUrl,
      docName: `lease-${body.tenancyId ?? 'doc'}.pdf`,
      message: body.subject?.trim() || `Lease for ${tenantName}`,
      signers,
      additionalData: JSON.stringify({
        tenancyId: body.tenancyId ?? null,
        applicationId: body.applicationId ?? null,
        leaseDocumentId: body.leaseDocumentId ?? null,
      }),
    },
    config,
  )

  if (!result.ok) {
    return c.json(
      {
        ok: false,
        provider: 'signiflow',
        live: true,
        nonProduction: false,
        status: 'failed',
        error: result.error,
        step: result.step,
      },
      502,
    )
  }

  return c.json({
    ok: true,
    provider: 'signiflow',
    live: true,
    nonProduction: false,
    envelopeId: result.envelopeId,
    externalReference: result.externalReference,
    status: 'sent',
    summary: result.summary,
    docId: result.docId,
  })
}

type StatusBody = {
  envelopeId?: string
  docId?: string
}

export async function esignStatus(c: Context) {
  const env = readEnv()
  if (!isSigniFlowProviderSelected(env)) {
    return c.json(
      {
        ok: false,
        error:
          'Status poll requires ESIGN_PROVIDER=signiflow. This environment uses the test signing provider.',
      },
      501,
    )
  }
  const config = signiflowConfigFromEnv(env)
  if (!config) {
    return c.json(
      {
        ok: false,
        error:
          'SigniFlow is not configured. Set ESIGN_SIGNIFLOW_API_KEY and ESIGN_SIGNIFLOW_API_URL (partner keys required).',
      },
      501,
    )
  }

  let body: StatusBody
  try {
    body = (await c.req.json()) as StatusBody
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400)
  }

  const docId = (body.docId?.trim() || (body.envelopeId ? docIdFromEnvelopeId(body.envelopeId) : '')).trim()
  if (!docId) {
    return c.json({ ok: false, error: 'envelopeId or docId is required' }, 400)
  }

  const result = await signiflowGetDocStatus(docId, config)
  if (!result.ok) {
    return c.json({ ok: false, error: result.error }, 502)
  }

  return c.json({
    ok: true,
    provider: 'signiflow',
    live: true,
    nonProduction: false,
    docId: result.docId,
    docStatus: result.docStatus,
    status: result.mappedStatus,
    resultField: result.resultField,
    // CR10 part 7: GetDocStatus returns no document URL and the signed-document
    // endpoint is not confirmed in the partner docs, so no signed copy is offered.
    signedPdfAvailable: false,
    note: 'Status from SigniFlow GetDocStatus only — not invented staff-click signed-live.',
  })
}

type WebhookBody = {
  tenancyId?: string
  envelopeId?: string
  docId?: string | number
  status?: string
  party?: string
  summary?: string
  providerEventId?: string
}

function isEsignWebhookPayload(body: unknown): body is WebhookBody & { tenancyId: string; status: string } {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  if (typeof b.tenancyId !== 'string' || !b.tenancyId.trim()) return false
  const status = b.status
  if (
    status !== 'sent' &&
    status !== 'partially_signed' &&
    status !== 'completed' &&
    status !== 'declined' &&
    status !== 'failed'
  ) {
    return false
  }
  return true
}

/**
 * PARTIAL: validate shape (+ optional shared secret). Does not mutate tenancy rows yet.
 */
export async function esignWebhook(c: Context) {
  const env = readEnv()
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400)
  }

  if (!isEsignWebhookPayload(body)) {
    return c.json(
      {
        ok: false,
        error: 'invalid_payload',
        expected: {
          tenancyId: 'string',
          status: 'sent | partially_signed | completed | declined | failed',
          envelopeId: 'string?',
          docId: 'string|number?',
          party: 'tenant|landlord?',
          summary: 'string?',
          providerEventId: 'string?',
        },
      },
      400,
    )
  }

  const secret = env.ESIGN_SIGNIFLOW_WEBHOOK_SECRET?.trim()
  if (secret) {
    const header =
      c.req.header('x-esign-signature') ??
      c.req.header('x-signiflow-signature') ??
      ''
    if (!header || header !== secret) {
      return c.json({ ok: false, error: 'invalid_signature' }, 401)
    }
  }

  if (isSigniFlowProviderSelected(env) && !isSigniFlowLiveConfigured(env)) {
    return c.json(
      {
        ok: false,
        error: 'signiflow_not_configured',
        message:
          'Live SigniFlow needs partner keys (ESIGN_SIGNIFLOW_API_KEY, ESIGN_SIGNIFLOW_API_URL). Payload accepted for shape validation only.',
        persisted: false,
      },
      501,
    )
  }

  return c.json(
    {
      ok: true,
      accepted: true,
      provider: isSigniFlowProviderSelected(env) ? 'signiflow' : env.ESIGN_PROVIDER ?? 'mock',
      tenancyId: body.tenancyId,
      status: body.status,
      envelopeId: body.envelopeId ?? null,
      docId: body.docId ?? null,
      persisted: false,
      note: 'PARTIAL webhook: shape validated; tenancy eSign mutation requires partner-backed persistence (not invented here).',
    },
    202,
  )
}
