/**
 * Application Pipeline: the configurable lifecycle every rental application
 * follows. The platform default (seeded by migration 039, edited by super
 * admins) is the base; each agency can change its unlocked stages and add its
 * own. Locked stages (Viewing, Application submitted, Documents, Identity,
 * Deposit, Lease, Move-in) only change on the platform default.
 *
 * Every stage is approved or declined by staff. Approve moves to the next
 * stage; decline stops the application and needs a reason. A stage can require
 * documents (verified before approving), checklist items (ticked before
 * approving), notes and attachments (credit check / agent review done offline).
 * Plain data and pure functions: shared by the app, the server and the seeder.
 */

export type StageKind =
  | 'viewing'
  | 'submitted'
  | 'documents'
  | 'identity'
  | 'credit_check'
  | 'agent_review'
  | 'approval'
  | 'deposit'
  | 'lease'
  | 'move_in'
  | 'custom'

export type PipelineStage = {
  key: string
  label: string
  kind: StageKind
  /** Only a super admin (platform default) changes a locked stage. */
  locked: boolean
  enabled: boolean
  /** What happens at this stage, shown to staff and applicants. */
  description?: string
  /** Document keys that must be verified before approving (documents / identity / custom). */
  requiredDocs?: string[]
  /** Items staff must tick before approving. */
  checklist?: string[]
  /** Staff can attach files (e.g. the offline credit report). */
  allowAttachments?: boolean
  /** A note is required to approve (e.g. the credit check outcome). */
  notesRequired?: boolean
}

export type ApplicationPipeline = { version: number; stages: PipelineStage[] }

/** Documents an agency can ask for (keys match the application's document checklist). */
export const PIPELINE_DOCUMENTS: Array<{ key: string; label: string }> = [
  { key: 'id', label: 'ID or passport' },
  { key: 'address', label: 'Proof of address' },
  { key: 'payslips', label: 'Payslips (3 months)' },
  { key: 'bank', label: 'Bank statements (3 months)' },
  { key: 'employment', label: 'Employment letter' },
  { key: 'credit_consent', label: 'Credit check consent' },
  { key: 'landlord_ref', label: 'Previous landlord reference' },
  { key: 'fica', label: 'FICA declaration' },
]

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  viewing: 'Viewing',
  submitted: 'Application submitted',
  documents: 'Documents',
  identity: 'Identity',
  credit_check: 'Credit check',
  agent_review: 'Agent review',
  approval: 'Approval',
  deposit: 'Deposit',
  lease: 'Lease',
  move_in: 'Move-in',
  custom: 'Custom step',
}

/** Kinds every pipeline has, in this order, and only super admins change. */
export const LOCKED_KINDS: ReadonlySet<StageKind> = new Set(['viewing', 'submitted', 'documents', 'identity', 'deposit', 'lease', 'move_in'])

export const DEFAULT_APPLICATION_PIPELINE: ApplicationPipeline = {
  version: 1,
  stages: [
    { key: 'viewing', label: 'Viewing', kind: 'viewing', locked: true, enabled: true, description: 'The applicant viewed the property (in person or virtually).', checklist: ['Applicant attended the viewing'] },
    { key: 'submitted', label: 'Application submitted', kind: 'submitted', locked: true, enabled: true, description: 'The application form is complete.' },
    { key: 'documents', label: 'Documents', kind: 'documents', locked: true, enabled: true, description: 'Income and supporting documents are uploaded and verified.', requiredDocs: ['payslips', 'bank', 'employment', 'credit_consent'] },
    { key: 'identity', label: 'Identity', kind: 'identity', locked: true, enabled: true, description: 'ID, proof of address and FICA declaration are verified.', requiredDocs: ['id', 'address', 'fica'] },
    { key: 'credit_check', label: 'Credit check', kind: 'credit_check', locked: false, enabled: true, description: 'Run the credit check outside the system, then record the outcome and upload the report.', allowAttachments: true, notesRequired: true },
    { key: 'agent_review', label: 'Agent review', kind: 'agent_review', locked: false, enabled: true, description: 'The agent reviews affordability, references and the full file.', allowAttachments: true, checklist: ['Affordability checked', 'References checked'] },
    { key: 'approval', label: 'Approval', kind: 'approval', locked: false, enabled: true, description: 'Approve the applicant. This creates the lease and the deposit and first rent invoices.' },
    { key: 'deposit', label: 'Deposit', kind: 'deposit', locked: true, enabled: true, description: 'The applicant pays the deposit and uploads proof; the agency confirms it.' },
    { key: 'lease', label: 'Lease', kind: 'lease', locked: true, enabled: true, description: 'Tenant and landlord sign the lease in the app (ECTA e-signature).' },
    { key: 'move_in', label: 'Move-in', kind: 'move_in', locked: true, enabled: true, description: 'Incoming inspection signed and keys handed over.', checklist: ['Incoming inspection completed', 'Keys handed over'] },
  ],
}

const KINDS = new Set<StageKind>(Object.keys(STAGE_KIND_LABEL) as StageKind[])
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const strList = (v: unknown, max = 20) => (Array.isArray(v) ? v.map((x) => str(x, 160)).filter(Boolean).slice(0, max) : undefined)

/** Clean one stage from untrusted input. */
export function sanitizeStage(raw: unknown, i: number): PipelineStage | null {
  const o = (raw ?? {}) as Record<string, unknown>
  const kind = KINDS.has(o.kind as StageKind) ? (o.kind as StageKind) : 'custom'
  const label = str(o.label, 80) || STAGE_KIND_LABEL[kind]
  const key = (str(o.key, 60) || `${kind}-${i}`).replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
  const docKeys = new Set(PIPELINE_DOCUMENTS.map((d) => d.key))
  return {
    key,
    label,
    kind,
    locked: LOCKED_KINDS.has(kind),
    enabled: o.enabled !== false,
    description: str(o.description, 400) || undefined,
    requiredDocs: (strList(o.requiredDocs) ?? []).filter((k) => docKeys.has(k)),
    checklist: strList(o.checklist),
    allowAttachments: o.allowAttachments === true,
    notesRequired: o.notesRequired === true,
  }
}

export function sanitizePipeline(raw: unknown): ApplicationPipeline {
  const o = (raw ?? {}) as Record<string, unknown>
  const list = Array.isArray(o.stages) ? o.stages : []
  const stages = list.map(sanitizeStage).filter((s): s is PipelineStage => Boolean(s))
  const seen = new Set<string>()
  return {
    version: typeof o.version === 'number' ? o.version : 1,
    stages: stages.filter((s) => (seen.has(s.key) ? false : (seen.add(s.key), true))).slice(0, 30),
  }
}

/**
 * The pipeline an agency's applications follow: the platform default's locked
 * stages always as the platform set them (and always present, enabled, in
 * their order), with the agency's own unlocked / custom stages in its order.
 */
export function resolvePipeline(platform: ApplicationPipeline | null | undefined, agency: ApplicationPipeline | null | undefined): ApplicationPipeline {
  const base = platform?.stages?.length ? platform : DEFAULT_APPLICATION_PIPELINE
  if (!agency?.stages?.length) return { version: base.version, stages: base.stages.map((s) => ({ ...s, enabled: s.locked ? true : s.enabled })) }
  const lockedByKind = new Map(base.stages.filter((s) => s.locked).map((s) => [s.kind, s]))
  const out: PipelineStage[] = []
  const placed = new Set<StageKind>()
  for (const s of agency.stages) {
    if (LOCKED_KINDS.has(s.kind)) {
      const locked = lockedByKind.get(s.kind)
      if (locked && !placed.has(s.kind)) {
        out.push({ ...locked, enabled: true })
        placed.add(s.kind)
      }
    } else {
      out.push({ ...s, locked: false })
    }
  }
  // Locked stages the agency list left out go back in their default position.
  for (const [i, s] of base.stages.entries()) {
    if (!s.locked || placed.has(s.kind)) continue
    const prevKey = base.stages[i - 1]?.key
    const at = prevKey ? out.findIndex((x) => x.key === prevKey) + 1 : 0
    out.splice(at > 0 ? at : out.length, 0, { ...s, enabled: true })
    placed.add(s.kind)
  }
  return { version: agency.version || base.version, stages: out }
}

export type StageRecord = {
  status: 'approved' | 'declined'
  at: string
  byName: string
  reason?: string
  notes?: string
  checklist?: string[]
  attachments?: Array<{ name: string; mimeType: string; dataUrl: string }>
}

export type StageGate = { ok: true } | { ok: false; reason: string }

/** Can staff approve this stage now? */
export function stageApprovalGate(
  stage: PipelineStage,
  input: { documents: Array<{ key: string; status: string }>; ticked: string[]; notes: string },
): StageGate {
  const docs = new Map(input.documents.map((d) => [d.key, d.status]))
  const missing = (stage.requiredDocs ?? []).filter((k) => docs.get(k) !== 'verified')
  if (missing.length) {
    const names = missing.map((k) => PIPELINE_DOCUMENTS.find((d) => d.key === k)?.label ?? k)
    return { ok: false, reason: `Verify these documents first: ${names.join(', ')}.` }
  }
  const unticked = (stage.checklist ?? []).filter((c) => !input.ticked.includes(c))
  if (unticked.length) return { ok: false, reason: `Tick every checklist item first: ${unticked.join(', ')}.` }
  if (stage.notesRequired && !input.notes.trim()) return { ok: false, reason: 'Add a note with the outcome first.' }
  return { ok: true }
}

/** The stage the application is at: the first enabled stage not yet approved. */
export function currentStageIndex(pipeline: ApplicationPipeline, records: Record<string, StageRecord> | undefined): number {
  const stages = pipeline.stages.filter((s) => s.enabled)
  const i = stages.findIndex((s) => records?.[s.key]?.status !== 'approved')
  return i === -1 ? stages.length : i
}
