import type { Application, ApplicationDocument, ApplicationStage } from '../types/domain'

/** Standard SA rental / purchase screening documents (FICA + POPIA-aligned). */
export const RENTAL_DOCUMENTS: Omit<ApplicationDocument, 'status'>[] = [
  { key: 'id', label: 'Certified SA ID / Passport (+ work permit if foreign)' },
  { key: 'address', label: 'Proof of residence (≤ 3 months)' },
  { key: 'payslips', label: '3× recent payslips' },
  { key: 'bank', label: '3 months bank statements' },
  { key: 'employment', label: 'Employment confirmation letter' },
  { key: 'credit_consent', label: 'Credit check consent (POPIA / NCA)' },
  { key: 'landlord_ref', label: 'Previous landlord / agent reference' },
  { key: 'fica', label: 'FICA client due-diligence declaration' },
]

export const PURCHASE_DOCUMENTS: Omit<ApplicationDocument, 'status'>[] = [
  { key: 'id', label: 'Certified SA ID / Passport' },
  { key: 'address', label: 'Proof of residence (≤ 3 months)' },
  { key: 'fica', label: 'FICA client due-diligence declaration' },
  { key: 'funds', label: 'Proof of funds / bond pre-approval' },
  { key: 'bank', label: '3 months bank statements' },
  { key: 'credit_consent', label: 'Credit check consent (POPIA / NCA)' },
]

export const APPLICATION_STAGES: ApplicationStage[] = [
  'Started',
  'Documents Pending',
  'Documents Submitted',
  'Viewing Booked',
  'Under Review',
  'Credit Check',
  'Approved',
  'Awaiting Payment',
  'Deposit Paid',
  'Lease Signed',
  'Move-In Scheduled',
  'Keys Handed Over',
  'Active Tenancy',
]

/** Full stage picker (includes terminal outcomes not in the happy-path sequence). */
export const APPLICATION_STAGE_OPTIONS: ApplicationStage[] = [
  ...APPLICATION_STAGES,
  'Rejected',
  'Withdrawn',
  'Blocked',
]

export const STAGE_PROGRESS: Record<ApplicationStage, number> = {
  Started: 8,
  'Documents Pending': 20,
  'Documents Submitted': 35,
  'Viewing Booked': 45,
  'Under Review': 55,
  'Credit Check': 65,
  Approved: 72,
  'Awaiting Payment': 80,
  'Deposit Paid': 88,
  'Lease Signed': 92,
  'Move-In Scheduled': 96,
  'Keys Handed Over': 99,
  'Active Tenancy': 100,
  Rejected: 0,
  Withdrawn: 0,
  Blocked: 0,
}

export function buildDocumentChecklist(type: 'Purchase' | 'Rental'): ApplicationDocument[] {
  const list = type === 'Purchase' ? PURCHASE_DOCUMENTS : RENTAL_DOCUMENTS
  return list.map((d) => ({ ...d, status: 'required' as const }))
}

/** Backfill missing checklist rows (legacy / API apps often store documents: []). */
export function ensureApplicationDocuments(
  app: Pick<Application, 'type' | 'documents'>,
): ApplicationDocument[] {
  const template = buildDocumentChecklist(app.type)
  if (!app.documents?.length) return template
  const existing = new Map(app.documents.map((d) => [d.key, d]))
  return template.map((item) => {
    const found = existing.get(item.key)
    return found ? { ...item, ...found, label: item.label } : item
  })
}

export function docsProgress(documents: ApplicationDocument[]) {
  if (!documents.length) return 0
  const score = documents.reduce((n, d) => {
    if (d.status === 'verified') return n + 1
    if (d.status === 'uploaded') return n + 0.6
    return n
  }, 0)
  return Math.round((score / documents.length) * 100)
}

export function allDocsUploaded(documents: ApplicationDocument[]) {
  return documents.every((d) => d.status === 'uploaded' || d.status === 'verified')
}

export function allDocsVerified(documents: ApplicationDocument[]) {
  return documents.length > 0 && documents.every((d) => d.status === 'verified')
}

export function nextReviewStage(stage: ApplicationStage): ApplicationStage | null {
  const i = APPLICATION_STAGES.indexOf(stage)
  if (i < 0 || i >= APPLICATION_STAGES.length - 1) return null
  if (stage === 'Rejected' || stage === 'Withdrawn' || stage === 'Blocked') return null
  return APPLICATION_STAGES[i + 1]
}

export const WORKFLOW_BLURB = [
  { title: '1. Apply & documents', text: 'Applicant submits ID, payslips, bank statements, FICA & credit consent.' },
  { title: '2. Viewing', text: 'Book an open slot on the listing; agent confirms attendance.' },
  { title: '3. Approve & pay', text: 'Agency reviews → credit → approve → deposit & first rent on-platform.' },
  { title: '4. Move-in', text: 'Lease signed, key collection details emailed, occupancy activated.' },
  { title: '5. Ongoing', text: 'Rent reminders, maintenance & chat route to agency/agent — never the landlord.' },
]
