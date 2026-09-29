import type {
  Lead,
  LeadRequirementCompletion,
  LeadStageProgress,
  LeadStageRequirement,
} from '../types/domain'
import type { LookupConfig } from '../data/infrastructure'
import { GLOBAL_CLIENT_ID } from '../data/platformLookups'

/** The four pipeline steps every agency starts with and cannot remove. */
export const DEFAULT_LEAD_STAGES = [
  'New Lead',
  'Contacted',
  'Viewing Scheduled',
  'Viewing Completed',
] as const

export const LEAD_REQUIREMENT_KINDS = ['note', 'document', 'payment', 'check'] as const
export type LeadRequirementKind = (typeof LEAD_REQUIREMENT_KINDS)[number]

export const LEAD_REQUIREMENT_KIND_LABELS: Record<LeadRequirementKind, string> = {
  note: 'Instruction / note',
  document: 'Document upload',
  payment: 'Payment',
  check: 'Checkbox confirmation',
}

const REQUIREMENT_META_KEYS = ['requirements', 'leadRequirements', 'stageRequirements']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function normalizeKind(v: unknown): LeadRequirementKind {
  return (LEAD_REQUIREMENT_KINDS as readonly string[]).includes(String(v))
    ? (String(v) as LeadRequirementKind)
    : 'check'
}

function normalizeRequirement(raw: unknown, index: number): LeadStageRequirement | null {
  if (!isRecord(raw)) return null
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  const kind = normalizeKind(raw.kind)
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `req-${index + 1}`
  // Keep freshly added requirements that are still being typed in (they carry
  // generated ids and an empty label); drop malformed legacy rows.
  if (!label && /^req-\d+$/.test(id)) return null
  return {
    id,
    kind,
    label,
    description:
      typeof raw.description === 'string' && raw.description.trim()
        ? raw.description.trim()
        : undefined,
    docType:
      kind === 'document' && typeof raw.docType === 'string' && raw.docType.trim()
        ? raw.docType.trim()
        : undefined,
    required: raw.required !== false,
  }
}

/** Requirements configured on a LEAD_STAGE lookup row (stored in `meta`). */
export function requirementsFromLookupMeta(meta: unknown): LeadStageRequirement[] {
  if (!isRecord(meta)) return []
  for (const key of REQUIREMENT_META_KEYS) {
    const raw = meta[key]
    if (Array.isArray(raw)) {
      const list = raw
        .map((r, i) => normalizeRequirement(r, i))
        .filter((r): r is LeadStageRequirement => r !== null)
      if (list.length) return list
    }
  }
  return []
}

export function requirementsForStageRow(row: LookupConfig | undefined): LeadStageRequirement[] {
  return row ? requirementsFromLookupMeta(row.meta) : []
}

/** Requirements for a pipeline stage given the active LEAD_STAGE lookup rows. */
export function requirementsForStage(
  lookups: LookupConfig[],
  stageValue: string,
  agencyId?: string | null,
): LeadStageRequirement[] {
  const candidates = lookups.filter(
    (l) =>
      l.configType === 'LEAD_STAGE' && l.keyValue === stageValue && (l.isActive || l.meta),
  )
  const agencyRow = agencyId ? candidates.find((l) => l.clientId === agencyId) : undefined
  const globalRow = candidates.find((l) => l.clientId === GLOBAL_CLIENT_ID)
  return requirementsForStageRow(agencyRow ?? globalRow ?? candidates[0])
}

export function stageProgressFor(lead: Lead | undefined, stageValue: string): LeadStageProgress {
  const sp = lead?.metadata?.stageProgress
  return (sp && sp[stageValue]) || {}
}

export function completionFor(
  lead: Lead | undefined,
  stageValue: string,
  requirementId: string,
): LeadRequirementCompletion | undefined {
  return stageProgressFor(lead, stageValue)[requirementId]
}

/** A requirement is satisfied when marked done (documents need a file or a note). */
export function isRequirementMet(
  completion: LeadRequirementCompletion | undefined,
  requirement: LeadStageRequirement,
): boolean {
  if (!completion?.done) return false
  if (requirement.kind === 'document' && !completion.file && !(completion.note ?? '').trim()) {
    return false
  }
  return true
}

/**
 * Required requirements across the path the lead is about to move through:
 * from its current stage up to (and including) the target stage.
 */
export function unmetRequiredBetween(
  lead: Lead,
  stages: string[],
  targetStage: string,
  requirementsForStageValue: (stage: string) => LeadStageRequirement[],
): Array<{ stage: string; requirement: LeadStageRequirement }> {
  const fromIdx = stages.indexOf(lead.stage)
  const toIdx = stages.indexOf(targetStage)
  if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) return []
  const out: Array<{ stage: string; requirement: LeadStageRequirement }> = []
  for (const stage of stages.slice(fromIdx, toIdx + 1)) {
    for (const requirement of requirementsForStageValue(stage)) {
      if (
        requirement.required &&
        !isRequirementMet(stageProgressFor(lead, stage)[requirement.id], requirement)
      ) {
        out.push({ stage, requirement })
      }
    }
  }
  return out
}

/** True when every required requirement of the stage is satisfied; null when none configured. */
export function stageRequirementsMet(
  lead: Lead,
  stageValue: string,
  requirementsForStageValue: (stage: string) => LeadStageRequirement[],
): boolean | null {
  const required = requirementsForStageValue(stageValue).filter((r) => r.required)
  if (!required.length) return null
  const progress = stageProgressFor(lead, stageValue)
  return required.every((r) => isRequirementMet(progress[r.id], r))
}

/** Unmet required requirements on a single stage. */
export function unmetRequiredForStage(
  lead: Lead,
  stageValue: string,
  requirementsForStageValue: (stage: string) => LeadStageRequirement[],
): LeadStageRequirement[] {
  return unmetRequiredBetween(lead, [lead.stage, stageValue], stageValue, requirementsForStageValue)
    .map((x) => x.requirement)
}

/** New completion stamped by the UI. */
export function makeCompletion(
  input: Partial<LeadRequirementCompletion> & { done: boolean },
): LeadRequirementCompletion {
  return { ...input, at: input.at ?? new Date().toISOString() }
}
