/**
 * Settings → Application Pipeline (Application configuration). Agencies shape
 * their application lifecycle: rename / reorder / switch off unlocked stages,
 * add their own, choose required documents, checklists, notes and attachments.
 * Locked stages (Viewing, Application submitted, Documents, Identity, Deposit,
 * Lease, Move-in) are changed only by a super admin on the platform default.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAgencyScope, useAuth } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { Badge, Button, Card, Input, PageHeader, Select, Textarea } from '../../components/ui'
import { realAgencies } from '../../lib/agencyKinds'
import { sweetSuccess, sweetWarning } from '../../lib/sweetAlert'
import { savePlatformPipeline, usePlatformPipeline } from '../../hooks/useApplicationPipeline'
import {
  PIPELINE_DOCUMENTS,
  STAGE_KIND_LABEL,
  resolvePipeline,
  sanitizePipeline,
  type ApplicationPipeline,
  type PipelineStage,
  type StageKind,
} from '../../lib/pipeline/applicationPipeline'

const DEFAULT_TARGET = '__platform__'
const DOC_KINDS: ReadonlySet<StageKind> = new Set(['documents', 'identity', 'custom', 'credit_check', 'agent_review'])

export default function ApplicationConfigurationPage() {
  const { state, updateAgency } = useStore()
  const { user, has } = useAuth()
  const { agencyId } = useAgencyScope()
  const isSuper = user.role === 'super_admin'
  const platform = usePlatformPipeline()
  const agencies = realAgencies(state.agencies)
  const [target, setTarget] = useState<string>(isSuper ? DEFAULT_TARGET : (agencyId ?? ''))
  const editingDefault = target === DEFAULT_TARGET
  const agency = agencies.find((a) => a.id === target)

  const source = useMemo<ApplicationPipeline>(
    () => (editingDefault ? platform : resolvePipeline(platform, agency?.settings?.applicationPipeline ?? null)),
    [editingDefault, platform, agency?.settings?.applicationPipeline],
  )
  const [draft, setDraft] = useState<ApplicationPipeline>(source)
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    setDraft(source)
    setDirty(false)
  }, [source])

  const canEdit = (s: PipelineStage) => editingDefault || !s.locked
  const change = (next: PipelineStage[]) => {
    setDraft((d) => ({ ...d, stages: next }))
    setDirty(true)
  }
  const patch = (i: number, p: Partial<PipelineStage>) => change(draft.stages.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const move = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= draft.stages.length) return
    const next = [...draft.stages]
    ;[next[i], next[j]] = [next[j], next[i]]
    change(next)
  }
  const addStage = () =>
    change([
      ...draft.stages.slice(0, -3),
      { key: `custom-${Date.now().toString(36)}`, label: 'New step', kind: 'custom', locked: false, enabled: true, checklist: [], requiredDocs: [] },
      ...draft.stages.slice(-3),
    ])

  const save = async () => {
    const clean = sanitizePipeline({ ...draft, version: (draft.version || 1) + 1 })
    try {
      if (editingDefault) {
        await savePlatformPipeline(clean)
      } else if (agency) {
        updateAgency(agency.id, { settings: { ...agency.settings, applicationPipeline: clean } })
      }
      setDirty(false)
      await sweetSuccess('Application pipeline saved', editingDefault ? 'Every agency now starts from this pipeline.' : 'New applications follow these stages.')
    } catch (e) {
      await sweetWarning('Could not save', e instanceof Error ? e.message : String(e))
    }
  }
  const resetAgency = () => {
    if (!agency) return
    updateAgency(agency.id, { settings: { ...agency.settings, applicationPipeline: undefined } })
  }

  return (
    <RequirePermission anyOf={['config.manage', 'tenant.manage', 'platform.manage']}>
      <div className="mx-auto max-w-4xl space-y-5 p-4 md:p-8">
        <PageHeader
          title="Application configuration"
          subtitle="Set the stages every rental application goes through. Staff approve or decline each stage; a decline stops the application and needs a reason."
        />

        {isSuper || has('platform.manage') ? (
          <Card className="p-4">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-ink-500">Editing</span>
              <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                {isSuper ? <option value={DEFAULT_TARGET}>Platform default (all agencies start here)</option> : null}
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </label>
          </Card>
        ) : null}

        <p className="flex items-center gap-2 text-sm text-ink-600">
          <Lock className="h-4 w-4 text-ink-400" aria-hidden />
          {editingDefault
            ? 'You are editing the platform default, including locked stages.'
            : 'Locked stages are the same for every agency and only a super admin can change them. Add your own steps between them.'}
        </p>

        <ol className="space-y-3">
          {draft.stages.map((s, i) => {
            const editable = canEdit(s)
            return (
              <li key={s.key}>
                <Card className={`space-y-3 p-4 ${!s.enabled ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{i + 1}</span>
                    <Input
                      className="min-w-0 flex-1"
                      value={s.label}
                      disabled={!editable}
                      onChange={(e) => patch(i, { label: e.target.value })}
                      aria-label="Stage name"
                    />
                    <Badge>{STAGE_KIND_LABEL[s.kind]}</Badge>
                    {s.locked ? (
                      <Badge tone="warning">
                        <Lock className="mr-1 inline h-3 w-3" aria-hidden />
                        Locked
                      </Badge>
                    ) : null}
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" aria-label="Move up" disabled={!editable || i === 0} onClick={() => move(i, -1)}>
                        <ArrowUp className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label="Move down" disabled={!editable || i === draft.stages.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDown className="h-4 w-4" aria-hidden />
                      </Button>
                      {s.kind === 'custom' && editable ? (
                        <Button size="sm" variant="ghost" aria-label="Remove step" onClick={() => change(draft.stages.filter((_, j) => j !== i))}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <Textarea
                    rows={2}
                    value={s.description ?? ''}
                    disabled={!editable}
                    placeholder="What happens at this stage (staff and applicants see this)"
                    onChange={(e) => patch(i, { description: e.target.value })}
                  />

                  {DOC_KINDS.has(s.kind) ? (
                    <fieldset disabled={!editable}>
                      <legend className="text-xs font-semibold text-ink-500">Documents that must be verified before approving</legend>
                      <div className="mt-1 grid gap-1 sm:grid-cols-2">
                        {PIPELINE_DOCUMENTS.map((d) => (
                          <label key={d.key} className="flex items-center gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              checked={(s.requiredDocs ?? []).includes(d.key)}
                              onChange={(e) =>
                                patch(i, {
                                  requiredDocs: e.target.checked ? [...(s.requiredDocs ?? []), d.key] : (s.requiredDocs ?? []).filter((k) => k !== d.key),
                                })
                              }
                            />
                            {d.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  <ChecklistEditor items={s.checklist ?? []} disabled={!editable} onChange={(checklist) => patch(i, { checklist })} />

                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={s.allowAttachments === true} disabled={!editable} onChange={(e) => patch(i, { allowAttachments: e.target.checked })} />
                      Staff can attach files
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={s.notesRequired === true} disabled={!editable} onChange={(e) => patch(i, { notesRequired: e.target.checked })} />
                      A note is required to approve
                    </label>
                    {!s.locked ? (
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={s.enabled} onChange={(e) => patch(i, { enabled: e.target.checked })} />
                        Stage is on
                      </label>
                    ) : null}
                  </div>
                </Card>
              </li>
            )
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={addStage}>
            <Plus className="h-4 w-4" aria-hidden /> Add a step
          </Button>
          <Button disabled={!dirty} onClick={() => void save()}>
            Save pipeline
          </Button>
          {!editingDefault && agency?.settings?.applicationPipeline ? (
            <Button variant="ghost" onClick={resetAgency}>
              Go back to the platform default
            </Button>
          ) : null}
        </div>

        <p className="text-sm text-ink-500">
          Enquiry (lead) stages are set separately in{' '}
          <Link to="/workspace/admin/lead-stages" className="font-semibold text-primary hover:underline">
            Lead stages
          </Link>
          .
        </p>
      </div>
    </RequirePermission>
  )
}

function ChecklistEditor({ items, disabled, onChange }: { items: string[]; disabled: boolean; onChange: (next: string[]) => void }) {
  const [text, setText] = useState('')
  return (
    <div>
      <p className="text-xs font-semibold text-ink-500">Checklist (staff tick each item before approving)</p>
      {items.length ? (
        <ul className="mt-1 space-y-1">
          {items.map((it, i) => (
            <li key={`${it}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-primary-50/60 px-3 py-1.5 text-sm">
              {it}
              {!disabled ? (
                <button type="button" className="text-xs font-semibold text-ink-500 hover:text-rose-700" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!disabled ? (
        <div className="mt-2 flex gap-2">
          <Input value={text} placeholder="e.g. Called the previous landlord" onChange={(e) => setText(e.target.value)} />
          <Button
            size="sm"
            variant="secondary"
            disabled={!text.trim()}
            onClick={() => {
              onChange([...items, text.trim()])
              setText('')
            }}
          >
            Add
          </Button>
        </div>
      ) : null}
    </div>
  )
}
