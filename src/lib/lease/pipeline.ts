/**
 * Lease issue + e-sign pipeline (roadmap Step 5).
 * Called on durable tenancy create (approve path) — not on deposit paid.
 */

import type { AppUser, PropertyAsset, PropertyDocument, Tenancy } from '../../types/domain'
import { generateLeasePdf } from './generateLeasePdf'
import { eSignProviderFromEnv } from './providers'
import type {
  ESignProvider,
  LeaseESignState,
  LeaseSignParty,
} from './types'

export type IssueLeaseContext = {
  tenancy: Tenancy
  property?: PropertyAsset | null
  agencyName?: string
  landlordUser?: AppUser | null
  /** Document id to assign (caller may pre-mint with uid). */
  documentId: string
  actorUserId?: string | null
  actorName?: string | null
  provider?: ESignProvider
  env?: Record<string, string | undefined>
  now?: string
}

export type IssueLeaseResult = {
  ok: boolean
  document: PropertyDocument | null
  eSign: LeaseESignState | null
  tenancyPatch: Partial<Tenancy>
  error?: string
  /** Workflow status key that matches e-sign reality after issue. */
  workflowStatus: 'lease_generated' | 'lease_sent' | null
}

export type RecordLeaseSignInput = {
  eSign: LeaseESignState
  party: LeaseSignParty
  signerName: string
  signatureDataUrl?: string
  actorUserId?: string | null
  provider?: ESignProvider
  env?: Record<string, string | undefined>
  now?: string
}

export type RecordLeaseSignResult = {
  ok: boolean
  eSign: LeaseESignState
  error?: string
  /** Workflow status key mirroring sign progress. */
  workflowStatus: 'tenant_signed' | 'landlord_signed' | 'lease_sent' | null
}

function resolveProvider(
  explicit: ESignProvider | undefined,
  env?: Record<string, string | undefined>,
): ESignProvider {
  if (explicit) return explicit
  const viteEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta.env as Record<string, string | undefined>)
      : undefined
  return eSignProviderFromEnv({ ...(viteEnv ?? {}), ...(env ?? {}) })
}

function emptyESign(partial?: Partial<LeaseESignState>): LeaseESignState {
  return {
    status: 'not_started',
    provider: 'mock',
    live: false,
    nonProduction: true,
    envelopeId: null,
    externalReference: null,
    leaseDocumentId: null,
    pdfUrl: null,
    tenant: { status: 'pending' },
    landlord: null,
    events: [],
    ...partial,
  }
}

/** Map e-sign status → workflow stage key (honest, not decorative). */
export function workflowStatusFromESign(
  eSign: LeaseESignState | null | undefined,
): 'lease_generated' | 'lease_sent' | 'tenant_signed' | 'landlord_signed' | null {
  if (!eSign) return null
  switch (eSign.status) {
    case 'generated':
      return 'lease_generated'
    case 'sent':
      return 'lease_sent'
    case 'partially_signed':
      return eSign.tenant.status === 'signed' ? 'tenant_signed' : 'lease_sent'
    case 'completed':
      return eSign.landlord ? 'landlord_signed' : 'tenant_signed'
    default:
      return null
  }
}

export function eSignStatusLabel(status: LeaseESignState['status']): string {
  switch (status) {
    case 'not_started':
      return 'Not started'
    case 'generated':
      return 'PDF generated'
    case 'sent':
      return 'Sent for signing'
    case 'partially_signed':
      return 'Partially signed'
    case 'completed':
      return 'Fully signed'
    case 'declined':
      return 'Declined'
    case 'failed':
      return 'Failed'
    default:
      return status
  }
}

/**
 * On tenancy create (approve): generate real PDF, PropertyDocument (Lease),
 * and open an e-sign envelope (mock by default).
 */
export async function issueLeaseOnTenancyCreate(
  ctx: IssueLeaseContext,
): Promise<IssueLeaseResult> {
  const now = ctx.now ?? new Date().toISOString()
  const tenancy = ctx.tenancy
  const property = ctx.property
  const landlordId = tenancy.landlordId?.trim() || ''
  const landlordRequired = Boolean(landlordId)
  const provider = resolveProvider(ctx.provider, ctx.env)

  const address = property
    ? [
        property.formattedAddress || property.address,
        property.suburb,
        property.city,
      ]
        .filter(Boolean)
        .join(', ')
    : 'Address TBC'

  let pdf
  try {
    pdf = await generateLeasePdf({
      tenancyId: tenancy.id,
      leaseReference: tenancy.id,
      agencyName: ctx.agencyName ?? 'Agency',
      propertyTitle: property?.title ?? tenancy.propertyId,
      propertyAddress: address,
      tenantName: tenancy.tenantName,
      tenantEmail: tenancy.tenantEmail,
      landlordName: ctx.landlordUser?.name ?? (landlordRequired ? 'Landlord' : null),
      startDate: tenancy.startDate,
      endDate: tenancy.endDate,
      rent: tenancy.rent,
      deposit: tenancy.deposit,
      generatedAt: now,
    })
  } catch (err) {
    return {
      ok: false,
      document: null,
      eSign: null,
      tenancyPatch: {},
      error: err instanceof Error ? err.message : 'Lease PDF generation failed',
      workflowStatus: null,
    }
  }

  const document: PropertyDocument = {
    id: ctx.documentId,
    agencyId: tenancy.agencyId,
    propertyId: tenancy.propertyId,
    name: `Lease — ${tenancy.tenantName}`,
    category: 'Lease',
    status: 'uploaded',
    uploadedAt: now.slice(0, 10),
    note: `Auto-generated on approve (${tenancy.id}). E-sign via ${provider.id}${
      provider.nonProduction ? ' — non-production mock' : ''
    }.`,
    fileUrl: pdf.dataUrl,
    applicationId: tenancy.applicationId,
    applicantName: tenancy.tenantName,
  }

  const envelope = await provider.createEnvelope({
    tenancyId: tenancy.id,
    applicationId: tenancy.applicationId,
    leaseDocumentId: document.id,
    pdfUrl: pdf.dataUrl,
    subject: `Lease for ${property?.title ?? tenancy.propertyId}`,
    tenant: {
      name: tenancy.tenantName,
      email: tenancy.tenantEmail,
      userId: tenancy.tenantUserId,
    },
    landlord: landlordRequired
      ? {
          name: ctx.landlordUser?.name ?? 'Landlord',
          email: ctx.landlordUser?.email,
          userId: landlordId,
        }
      : null,
    actorUserId: ctx.actorUserId,
    actorName: ctx.actorName,
  })

  if (!envelope.ok) {
    const eSign = emptyESign({
      status: 'generated',
      provider: provider.id,
      live: provider.live,
      nonProduction: provider.nonProduction,
      leaseDocumentId: document.id,
      pdfUrl: pdf.dataUrl,
      tenant: { status: 'pending' },
      landlord: landlordRequired ? { status: 'pending' } : null,
      events: [
        {
          at: now,
          type: 'pdf_generated',
          summary: `Lease PDF generated (${pdf.fileName})`,
        },
        {
          at: now,
          type: 'esign_refused',
          summary: envelope.error ?? 'E-sign envelope could not be created',
        },
      ],
      note: envelope.error,
    })
    return {
      ok: true,
      document,
      eSign,
      tenancyPatch: {
        leaseDocumentId: document.id,
        leasePdfUrl: pdf.dataUrl,
        eSign,
      },
      error: envelope.error,
      workflowStatus: 'lease_generated',
    }
  }

  const eSign: LeaseESignState = {
    status: envelope.status,
    provider: envelope.provider,
    live: envelope.live,
    nonProduction: envelope.nonProduction,
    envelopeId: envelope.envelopeId ?? null,
    externalReference: envelope.externalReference ?? null,
    leaseDocumentId: document.id,
    pdfUrl: pdf.dataUrl,
    tenant: { status: 'pending' },
    landlord: landlordRequired ? { status: 'pending' } : null,
    events: [
      {
        at: now,
        type: 'pdf_generated',
        summary: `Lease PDF generated (${pdf.fileName})`,
      },
      {
        at: now,
        type: 'envelope_created',
        summary: envelope.summary ?? `Envelope ${envelope.envelopeId}`,
      },
    ],
    note: envelope.nonProduction
      ? 'Mock e-sign provider — non-production soft-demo. Live SigniFlow needs server keys (DQ-C1); DocuSign stays placeholder.'
      : undefined,
  }

  return {
    ok: true,
    document,
    eSign,
    tenancyPatch: {
      leaseDocumentId: document.id,
      leasePdfUrl: pdf.dataUrl,
      eSign,
    },
    workflowStatus: workflowStatusFromESign(eSign) as 'lease_generated' | 'lease_sent' | null,
  }
}

/** Record tenant or landlord signature against the e-sign envelope. */
export async function recordLeaseSignature(
  input: RecordLeaseSignInput,
): Promise<RecordLeaseSignResult> {
  const now = input.now ?? new Date().toISOString()
  const provider = resolveProvider(input.provider, input.env)
  const prev = input.eSign

  if (!prev.envelopeId) {
    return {
      ok: false,
      eSign: prev,
      error: 'No e-sign envelope on this lease — generate/send the lease first.',
      workflowStatus: workflowStatusFromESign(prev) as RecordLeaseSignResult['workflowStatus'],
    }
  }

  if (input.party === 'landlord' && !prev.landlord) {
    return {
      ok: false,
      eSign: prev,
      error: 'Landlord countersign is not required (no landlordId on tenancy).',
      workflowStatus: workflowStatusFromESign(prev) as RecordLeaseSignResult['workflowStatus'],
    }
  }

  const res = await provider.recordSign({
    envelopeId: prev.envelopeId,
    party: input.party,
    signerName: input.signerName,
    signatureDataUrl: input.signatureDataUrl,
    actorUserId: input.actorUserId,
    at: now,
  })

  if (!res.ok) {
    return {
      ok: false,
      eSign: {
        ...prev,
        events: [
          ...prev.events,
          {
            at: now,
            type: 'sign_failed',
            party: input.party,
            summary: res.error ?? 'Sign failed',
          },
        ],
        note: res.error,
      },
      error: res.error,
      workflowStatus: workflowStatusFromESign(prev) as RecordLeaseSignResult['workflowStatus'],
    }
  }

  const next: LeaseESignState = {
    ...prev,
    status: res.status,
    tenant:
      input.party === 'tenant'
        ? {
            status: 'signed',
            signedAt: res.signedAt ?? now,
            signerName: input.signerName,
            signatureDataUrl: input.signatureDataUrl,
          }
        : prev.tenant,
    landlord:
      input.party === 'landlord' && prev.landlord
        ? {
            status: 'signed',
            signedAt: res.signedAt ?? now,
            signerName: input.signerName,
            signatureDataUrl: input.signatureDataUrl,
          }
        : prev.landlord,
    events: [
      ...prev.events,
      {
        at: now,
        type: 'party_signed',
        party: input.party,
        summary: res.summary ?? `${input.party} signed`,
      },
    ],
  }

  return {
    ok: true,
    eSign: next,
    workflowStatus: workflowStatusFromESign(next) as RecordLeaseSignResult['workflowStatus'],
  }
}
