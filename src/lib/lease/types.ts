/**
 * Lease PDF + e-sign types (roadmap Step 5).
 * Sign status is structured — workflow stages must mirror these values.
 */

export type LeaseESignPartyStatus = 'pending' | 'signed' | 'declined' | 'waived'

export type LeaseESignStatus =
  | 'not_started'
  | 'generated'
  | 'sent'
  | 'partially_signed'
  | 'completed'
  | 'declined'
  | 'failed'

export type LeaseESignParty = {
  status: LeaseESignPartyStatus
  signedAt?: string
  signerName?: string
  /** Optional captured signature data URL (mock / in-app pad). */
  signatureDataUrl?: string
  /** CR10: sent by the client; the server re-checks it (drawn | saved_image | paper_mark). */
  method?: 'drawn' | 'saved_image' | 'paper_mark'
  /** CR10: the mandate line staff ticked when signing for the landlord. */
  onBehalfConfirmation?: string
  /** ECTA 25 of 2002: the "I agree" statements ticked, the typed name and the lease fingerprint. */
  ectaConsent?: EctaConsent
  /** CR10 server-set stamp fields (never trusted from the client). */
  signerUserId?: string
  signerRole?: string
  onBehalf?: boolean
  imageSha256?: string | null
  ip?: string
  userAgent?: string
}

export type EctaConsent = {
  statements: string[]
  typedName: string
  documentHash: string
  templateVersion: string
  acceptedAt?: string
}

export type LeaseESignEvent = {
  at: string
  type: string
  party?: 'tenant' | 'landlord'
  summary: string
}

/** Persisted on Tenancy (and leases.metadata) after approve creates the lease. */
export type LeaseESignState = {
  status: LeaseESignStatus
  provider: string
  /** True only for live partner adapters (still refuse without keys). */
  live: boolean
  /** Mock / non-production label for UI honesty. */
  nonProduction: boolean
  envelopeId: string | null
  externalReference: string | null
  leaseDocumentId: string | null
  pdfUrl: string | null
  tenant: LeaseESignParty
  /** null when no landlordId — countersign not required. */
  landlord: LeaseESignParty | null
  events: LeaseESignEvent[]
  note?: string
}

export type LeaseSignParty = 'tenant' | 'landlord'

export type LeasePdfInput = {
  tenancyId: string
  leaseReference: string
  agencyName: string
  propertyTitle: string
  propertyAddress: string
  tenantName: string
  tenantEmail: string
  landlordName: string | null
  startDate: string
  endDate: string | null
  rent: number
  deposit: number
  generatedAt?: string
  /** Extra lease terms (see leaseContract.ts). */
  agencyContact?: string | null
  rentDueDay?: number | null
  escalationPct?: number | null
  parkingBays?: number | null
  /** Signed copy: each signature and its electronic-signing record. */
  signatures?: LeasePdfSignature[]
}

export type LeasePdfSignature = {
  role: 'Tenant' | 'Landlord'
  name: string
  signedAt: string
  method: string
  onBehalf?: boolean
  signedBy?: string | null
  imageDataUrl?: string | null
  ip?: string | null
  userAgent?: string | null
  typedName?: string | null
  documentHash?: string | null
  statements?: string[]
}

export type LeasePdfResult = {
  /** application/pdf data URL for PropertyDocument.fileUrl */
  dataUrl: string
  bytes: Uint8Array
  fileName: string
}

export type ESignCreateEnvelopeRequest = {
  tenancyId: string
  applicationId: string | null
  leaseDocumentId: string
  pdfUrl: string
  subject: string
  tenant: { name: string; email: string; userId?: string | null }
  landlord: { name: string; email?: string; userId: string } | null
  actorUserId?: string | null
  actorName?: string | null
}

export type ESignCreateEnvelopeResponse = {
  ok: boolean
  provider: string
  live: boolean
  nonProduction: boolean
  envelopeId?: string | null
  externalReference?: string | null
  status: LeaseESignStatus
  summary?: string
  error?: string
}

export type ESignRecordSignRequest = {
  envelopeId: string
  /** Lease the envelope belongs to (server scope + envelope binding on status). */
  tenancyId?: string | null
  party: LeaseSignParty
  signerName: string
  signatureDataUrl?: string
  actorUserId?: string | null
  at?: string
  /** CR10: the lease's stored eSign, so the mock can re-seed after a reload. */
  stored?: Pick<LeaseESignState, 'envelopeId' | 'tenant' | 'landlord'> | null
}

export type ESignRecordSignResponse = {
  ok: boolean
  provider: string
  party: LeaseSignParty
  status: LeaseESignStatus
  signedAt?: string
  summary?: string
  error?: string
}

export type ESignProvider = {
  readonly id: string
  readonly live: boolean
  readonly nonProduction: boolean
  createEnvelope(request: ESignCreateEnvelopeRequest): Promise<ESignCreateEnvelopeResponse>
  recordSign(request: ESignRecordSignRequest): Promise<ESignRecordSignResponse>
}
