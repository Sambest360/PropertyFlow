import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAgencyScope, useAuth } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { Badge, Button, Card, Input, PageHeader, Select, cn } from '../../components/ui'
import { GLOBAL_CLIENT_ID, isRequiredLookupKey, slugifyLookupKey } from '../../data/platformLookups'
import { getLookups } from '../../lib/lookups'
import {
  LEAD_REQUIREMENT_KINDS,
  LEAD_REQUIREMENT_KIND_LABELS,
  type LeadRequirementKind,
  requirementsForStageRow,
} from '../../lib/leadRequirements'
import type { LeadStageRequirement } from '../../types/domain'
import type { LookupConfig } from '../../data/infrastructure'

const ICON_STROKE = 1.6

/**
 * Admin editor for the lead pipeline: agencies set their own steps and, per
 * step, the requirements an agent must complete before the lead moves on
 * (documents, payments, notes, checkbox confirmations).
 */
export default function LeadPipelineSettingsPage() {
  const { state, createLookup, updateLookup, deactivateLookup, reorderLookups } = useStore()
  const { has } = useAuth()
  const { agencyId } = useAgencyScope()
  const isPlatform = has('platform.manage')

  const [viewAgencyId, setViewAgencyId] = useState(agencyId ?? state.agencies[0]?.id ?? '')
  const [newStepLabel, setNewStepLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Agencies hydrate async on a cold load — fall back to the first one so the
  // editor is usable before the selector's state is settled.
  const effectiveAgencyId = isPlatform
    ? viewAgencyId || state.agencies[0]?.id || ''
    : (agencyId ?? '')

  const steps = useMemo(
    () =>
      effectiveAgencyId
        ? getLookups(state.lookups, effectiveAgencyId, 'LEAD_STAGE', { includeInactive: true })
        : [],
    [state.lookups, effectiveAgencyId],
  )

  const docTypeOptions = useMemo(
    () =>
      effectiveAgencyId
        ? getLookups(state.lookups, effectiveAgencyId, 'DOC_TYPE').map((l) => ({
            value: l.keyValue,
            label: l.displayLabel,
          }))
        : [],
    [state.lookups, effectiveAgencyId],
  )

  /** Agency-owned row that overrides a global default of the same key. */
  function agencyOverrideFor(keyValue: string): LookupConfig | undefined {
    return state.lookups.find(
      (l) =>
        l.clientId === effectiveAgencyId &&
        l.configType === 'LEAD_STAGE' &&
        l.keyValue === keyValue,
    )
  }

  /**
   * Persist step config (label/requirements). Global defaults are readable by
   * everyone but only writable by platform admins — agencies transparently
   * get an agency-scoped override of the same step key instead.
   */
  function writeStep(
    row: LookupConfig,
    patch: { displayLabel?: string; requirements?: LeadStageRequirement[] },
  ) {
    setError(null)
    const isGlobal = row.clientId === GLOBAL_CLIENT_ID
    if (!isGlobal || isPlatform) {
      updateLookup(row.id, {
        ...(patch.displayLabel !== undefined ? { displayLabel: patch.displayLabel } : {}),
        ...(patch.requirements !== undefined ? { meta: { requirements: patch.requirements } } : {}),
      })
      return
    }
    const override = agencyOverrideFor(row.keyValue)
    if (override) {
      updateLookup(override.id, {
        ...(patch.displayLabel !== undefined ? { displayLabel: patch.displayLabel } : {}),
        ...(patch.requirements !== undefined ? { meta: { requirements: patch.requirements } } : {}),
      })
    } else {
      createLookup({
        clientId: effectiveAgencyId,
        configType: 'LEAD_STAGE',
        keyValue: row.keyValue,
        displayLabel: patch.displayLabel ?? row.displayLabel,
        meta: patch.requirements !== undefined ? { requirements: patch.requirements } : undefined,
      })
    }
  }

  function setRequirements(row: LookupConfig, next: LeadStageRequirement[]) {
    writeStep(row, { requirements: next })
  }

  function updateRequirement(
    row: LookupConfig,
    index: number,
    patch: Partial<LeadStageRequirement>,
  ) {
    const list = requirementsForStageRow(row)
    const next = list.map((r, i) => (i === index ? { ...r, ...patch } : r))
    setRequirements(row, next)
  }

  function removeRequirement(row: LookupConfig, index: number) {
    setRequirements(
      row,
      requirementsForStageRow(row).filter((_, i) => i !== index),
    )
  }

  function addRequirement(row: LookupConfig) {
    const requirement: LeadStageRequirement = {
      id: `req-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
      kind: 'check',
      label: '',
      required: true,
    }
    setRequirements(row, [...requirementsForStageRow(row), requirement])
  }

  function moveStep(row: LookupConfig, dir: -1 | 1) {
    const siblings = steps.filter((s) => s.clientId === row.clientId)
    const ids = siblings.map((s) => s.id)
    const idx = ids.indexOf(row.id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= ids.length) return
    const next = [...ids]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    reorderLookups(row.clientId, 'LEAD_STAGE', next)
  }

  function toggleActive(row: LookupConfig) {
    if (isRequiredLookupKey('LEAD_STAGE', row.keyValue)) return
    if (row.clientId === GLOBAL_CLIENT_ID && !isPlatform) return
    if (row.isActive) deactivateLookup(row.id)
    else updateLookup(row.id, { isActive: true })
  }

  function addStep() {
    setError(null)
    const label = newStepLabel.trim()
    if (!label) return
    if (!effectiveAgencyId) {
      setError('Select an agency first.')
      return
    }
    const key = slugifyLookupKey(label).slice(0, 80)
    if (!key) {
      setError('Could not create a step key from that name.')
      return
    }
    if (steps.some((s) => s.keyValue === key)) {
      setError(`A step called “${label}” already exists.`)
      return
    }
    try {
      createLookup({
        clientId: effectiveAgencyId,
        configType: 'LEAD_STAGE',
        keyValue: key,
        displayLabel: label,
        meta: { requirements: [] },
      })
      setNewStepLabel('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add step')
    }
  }

  return (
    <RequirePermission anyOf={['config.manage', 'tenant.manage', 'platform.manage']}>
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Lead pipeline"
          subtitle="Set the steps a lead moves through, and what must be done at each step before it can move forward."
          actions={
            isPlatform ? (
              <Select
                value={effectiveAgencyId}
                onChange={(e) => setViewAgencyId(e.target.value)}
                aria-label="Agency context"
                className="min-h-11 min-w-48 cursor-pointer"
              >
                {state.agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            ) : null
          }
        />

        {!effectiveAgencyId ? (
          <Card className="p-5 text-sm text-ink-500">
            No agency assigned — cannot edit the pipeline.
          </Card>
        ) : (
          <>
            <Card className="p-4 text-sm text-ink-500">
              The first four steps are the standard start of every pipeline and stay in place.
              Rename later steps, add your own, and attach requirements — a step with required
              requirements cannot be completed until they are done. Document requirements use your{' '}
              <span className="font-semibold text-ink">document types</span> (ID, FICA, and so on).
            </Card>

            <ol className="space-y-4">
              {steps.map((row, i) => (
                <li key={row.id}>
                  <StepCard
                    row={row}
                    stepNumber={i + 1}
                    isPlatform={isPlatform}
                    docTypeOptions={docTypeOptions}
                    onRename={(label) => writeStep(row, { displayLabel: label })}
                    onMove={(dir) => moveStep(row, dir)}
                    onToggleActive={() => toggleActive(row)}
                    onUpdateRequirement={(index, patch) => updateRequirement(row, index, patch)}
                    onRemoveRequirement={(index) => removeRequirement(row, index)}
                    onAddRequirement={() => addRequirement(row)}
                  />
                </li>
              ))}
            </ol>

            <Card className="p-5">
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault()
                  addStep()
                }}
              >
                <div className="min-w-0 flex-1">
                  <label htmlFor="new-step-label" className="mb-1 block text-xs font-medium text-ink-500">
                    New step name
                  </label>
                  <Input
                    id="new-step-label"
                    className="min-h-11"
                    value={newStepLabel}
                    onChange={(e) => setNewStepLabel(e.target.value)}
                    placeholder="e.g. Application Submitted"
                    aria-label="New step name"
                  />
                </div>
                <Button type="submit" className="min-h-11 cursor-pointer sm:shrink-0">
                  <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  Add step
                </Button>
              </form>
              {error ? <p className="mt-3 text-sm text-accent-600">{error}</p> : null}
            </Card>
          </>
        )}
      </div>
    </RequirePermission>
  )
}

const KIND_LABELS = LEAD_REQUIREMENT_KIND_LABELS as Record<LeadRequirementKind, string>

function StepCard({
  row,
  stepNumber,
  isPlatform,
  docTypeOptions,
  onRename,
  onMove,
  onToggleActive,
  onUpdateRequirement,
  onRemoveRequirement,
  onAddRequirement,
}: {
  row: LookupConfig
  stepNumber: number
  isPlatform: boolean
  docTypeOptions: Array<{ value: string; label: string }>
  onRename: (label: string) => void
  onMove: (dir: -1 | 1) => void
  onToggleActive: () => void
  onUpdateRequirement: (index: number, patch: Partial<LeadStageRequirement>) => void
  onRemoveRequirement: (index: number) => void
  onAddRequirement: () => void
}) {
  const isGlobal = row.clientId === GLOBAL_CLIENT_ID
  const isRequired = isRequiredLookupKey('LEAD_STAGE', row.keyValue)
  const canDeactivate = !isRequired && (isPlatform || !isGlobal)
  const requirements = requirementsForStageRow(row)

  return (
    <Card className={cn('p-5', !row.isActive && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold text-primary tabular"
        >
          {stepNumber}
        </span>
        <Input
          className="max-w-sm min-h-11"
          value={row.displayLabel}
          onChange={(e) => onRename(e.target.value)}
          aria-label={`Name for step ${stepNumber}`}
        />
        {isRequired ? (
          <Badge tone="neutral" className="shrink-0">
            Default
          </Badge>
        ) : null}
        {isGlobal ? (
          <Badge tone="info" className="shrink-0">
            {isPlatform ? 'Global' : 'Platform default'}
          </Badge>
        ) : (
          <Badge tone="neutral" className="shrink-0">
            Custom
          </Badge>
        )}
        {!row.isActive ? (
          <Badge tone="neutral" className="shrink-0">
            Inactive
          </Badge>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            aria-label={`Move ${row.displayLabel} up`}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-500 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            aria-label={`Move ${row.displayLabel} down`}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-ink-500 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowDown className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          </button>
          {canDeactivate ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-9 cursor-pointer px-3 text-xs"
              onClick={onToggleActive}
            >
              {row.isActive ? 'Deactivate' : 'Restore'}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
          Requirements{requirements.length ? ` (${requirements.length})` : ''}
        </p>
        {requirements.length === 0 ? (
          <p className="text-sm text-ink-400">
            No requirements — agents can move a lead past this step freely.
          </p>
        ) : (
          <ul className="space-y-2">
            {requirements.map((requirement, index) => (
              <li
                key={requirement.id}
                className="rounded-xl border border-primary-50 bg-primary-50/40 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="max-w-xs min-h-10"
                    value={requirement.label}
                    placeholder="What must be done?"
                    onChange={(e) => onUpdateRequirement(index, { label: e.target.value })}
                    aria-label={`Requirement ${index + 1} label`}
                  />
                  <Select
                    className="min-h-10 w-44 cursor-pointer"
                    value={requirement.kind}
                    onChange={(e) =>
                      onUpdateRequirement(index, {
                        kind: e.target.value as LeadRequirementKind,
                        ...(e.target.value === 'document' ? {} : { docType: undefined }),
                      })
                    }
                    aria-label={`Requirement ${index + 1} type`}
                  >
                    {LEAD_REQUIREMENT_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {KIND_LABELS[kind]}
                      </option>
                    ))}
                  </Select>
                  {requirement.kind === 'document' ? (
                    <Select
                      className="min-h-10 w-44 cursor-pointer"
                      value={requirement.docType ?? ''}
                      onChange={(e) =>
                        onUpdateRequirement(index, {
                          docType: e.target.value || undefined,
                        })
                      }
                      aria-label={`Requirement ${index + 1} document type`}
                    >
                      <option value="">Any document type…</option>
                      {docTypeOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : null}
                  <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-500">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-primary"
                      checked={requirement.required}
                      onChange={(e) =>
                        onUpdateRequirement(index, { required: e.target.checked })
                      }
                      aria-label={`Requirement ${index + 1} must be completed`}
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    onClick={() => onRemoveRequirement(index)}
                    aria-label={`Remove requirement ${index + 1}`}
                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-ink-400 hover:bg-accent-50 hover:text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <X className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  </button>
                </div>
                {requirement.kind === 'document' ? (
                  <p className="mt-1.5 text-xs text-ink-400">
                    Agents attach the document file when completing this step.
                    {requirement.docType ? ` Expected type: ${requirement.docType}.` : ''}
                  </p>
                ) : null}
                {requirement.kind === 'payment' ? (
                  <p className="mt-1.5 text-xs text-ink-400">
                    Agents record the amount paid and a reference when completing this step.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          variant="secondary"
          className="min-h-9 cursor-pointer px-3 text-xs"
          onClick={onAddRequirement}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
          Add requirement
        </Button>
      </div>
    </Card>
  )
}
