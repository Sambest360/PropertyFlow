/**
 * The application's journey through its agency's Application Pipeline.
 * Staff: approve or decline the current stage (decline needs a reason and
 * stops the application). Approving checks the stage's rules: verified
 * documents, ticked checklist, a note, files for offline checks.
 * Applicant: the same stages, read-only, with what they still need to do.
 */
import { useState } from 'react'
import { CheckCircle2, Circle, Paperclip, XCircle } from 'lucide-react'
import type { Application } from '../../types/domain'
import { useAgencyPipeline } from '../../hooks/useApplicationPipeline'
import {
  PIPELINE_DOCUMENTS,
  currentStageIndex,
  stageApprovalGate,
  type PipelineStage,
  type StageRecord,
} from '../../lib/pipeline/applicationPipeline'
import { readDocumentFile } from '../../lib/applicationDocDownscale'
import { APPLICATION_DOC_ACCEPT, applicationDocTypeError } from '../../lib/applicationDocUpload'
import { openApplicationDocumentFile } from '../../lib/applicationDocumentFile'
import { Badge, Button, Card, Textarea, cn } from '../ui'

type Attachment = NonNullable<StageRecord['attachments']>[number]

export type StageApproveInput = { notes: string; ticked: string[]; attachments: Attachment[] }

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })

export function ApplicationStagesPanel({
  application,
  mode,
  busy,
  onApprove,
  onDecline,
  stageHint,
}: {
  application: Application
  mode: 'staff' | 'applicant'
  busy?: boolean
  onApprove?: (stage: PipelineStage, input: StageApproveInput) => void | Promise<void>
  onDecline?: (stage: PipelineStage, reason: string) => void | Promise<void>
  /** Extra guidance for the current stage (e.g. deposit / lease status). */
  stageHint?: (stage: PipelineStage) => string | null
}) {
  const pipeline = useAgencyPipeline(application.agencyId)
  const stages = pipeline.stages.filter((s) => s.enabled)
  const records = application.stageRecords ?? {}
  const declinedKey = Object.entries(records).find(([, r]) => r.status === 'declined')?.[0]
  const stopped = Boolean(declinedKey) || application.workflowStatus === 'rejected' || application.stage === 'Rejected'
  const at = currentStageIndex({ ...pipeline, stages }, records)

  return (
    <Card className="space-y-4 p-4 sm:p-5" data-testid="application-stages">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">Application stages</h2>
        {stopped ? (
          <Badge tone="danger">Declined</Badge>
        ) : at >= stages.length ? (
          <Badge tone="success">All stages approved</Badge>
        ) : (
          <Badge tone="info">
            Stage {at + 1} of {stages.length}: {stages[at]?.label}
          </Badge>
        )}
      </div>
      {stopped ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          This application was declined{declinedKey ? ` at ${stages.find((s) => s.key === declinedKey)?.label ?? 'a stage'}` : ''}.
          {application.declineReason || (declinedKey && records[declinedKey]?.reason) ? ` Reason: ${application.declineReason || records[declinedKey!]?.reason}` : ''}
        </p>
      ) : null}
      <ol className="space-y-2">
        {stages.map((s, i) => {
          const rec = records[s.key]
          const current = !stopped && i === at
          return (
            <li key={s.key} className={cn('rounded-xl border px-3 py-3', current ? 'border-primary bg-primary-50/50' : 'border-primary-100')}>
              <div className="flex flex-wrap items-center gap-2">
                {rec?.status === 'approved' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
                ) : rec?.status === 'declined' ? (
                  <XCircle className="h-5 w-5 text-rose-600" aria-hidden />
                ) : (
                  <Circle className={cn('h-5 w-5', current ? 'text-primary' : 'text-ink-300')} aria-hidden />
                )}
                <span className={cn('font-semibold', current ? 'text-ink' : 'text-ink-600')}>{s.label}</span>
                {rec ? (
                  <span className="text-xs text-ink-500">
                    {rec.status === 'approved' ? 'Approved' : 'Declined'} by {rec.byName} on {fmt(rec.at)}
                  </span>
                ) : current ? (
                  <Badge tone="warning">{mode === 'applicant' ? 'In progress' : 'Waiting for you'}</Badge>
                ) : null}
              </div>
              {rec?.notes && mode === 'staff' ? <p className="mt-1 pl-7 text-sm text-ink-600">Note: {rec.notes}</p> : null}
              {rec?.reason ? <p className="mt-1 pl-7 text-sm text-rose-800">Reason: {rec.reason}</p> : null}
              {rec?.attachments?.length && mode === 'staff' ? (
                <div className="mt-1 flex flex-wrap gap-2 pl-7">
                  {rec.attachments.map((a) => (
                    <button key={a.name} type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" onClick={() => openApplicationDocumentFile(a)}>
                      <Paperclip className="h-3 w-3" aria-hidden /> {a.name}
                    </button>
                  ))}
                </div>
              ) : null}
              {current ? (
                mode === 'staff' ? (
                  <CurrentStageActions
                    stage={s}
                    application={application}
                    busy={busy}
                    hint={stageHint?.(s) ?? null}
                    onApprove={onApprove}
                    onDecline={onDecline}
                  />
                ) : (
                  <ApplicantStageInfo stage={s} application={application} />
                )
              ) : null}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function docLabel(key: string) {
  return PIPELINE_DOCUMENTS.find((d) => d.key === key)?.label ?? key
}

function ApplicantStageInfo({ stage, application }: { stage: PipelineStage; application: Application }) {
  const docs = new Map((application.documents ?? []).map((d) => [d.key, d.status]))
  const todo = (stage.requiredDocs ?? []).filter((k) => !['uploaded', 'verified'].includes(docs.get(k) ?? ''))
  return (
    <div className="mt-2 space-y-1 pl-7 text-sm text-ink-600">
      {stage.description ? <p>{stage.description}</p> : null}
      {todo.length ? <p className="font-medium text-ink">Please upload: {todo.map(docLabel).join(', ')}.</p> : null}
      {stage.kind === 'deposit' ? <p className="font-medium text-ink">Pay the deposit and upload your proof of payment in the Deposit section.</p> : null}
      {stage.kind === 'lease' ? <p className="font-medium text-ink">Sign your lease in the app when your agent sends it.</p> : null}
    </div>
  )
}

function CurrentStageActions({
  stage,
  application,
  busy,
  hint,
  onApprove,
  onDecline,
}: {
  stage: PipelineStage
  application: Application
  busy?: boolean
  hint: string | null
  onApprove?: (stage: PipelineStage, input: StageApproveInput) => void | Promise<void>
  onDecline?: (stage: PipelineStage, reason: string) => void | Promise<void>
}) {
  const [ticked, setTicked] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const docs = new Map((application.documents ?? []).map((d) => [d.key, d.status]))
  const gate = stageApprovalGate(stage, { documents: application.documents ?? [], ticked, notes })

  const addFile = async (f: File) => {
    const err = applicationDocTypeError(f)
    if (err) return setError(err)
    if (files.length >= 3) return setError('Up to 3 files per stage.')
    try {
      const read = await readDocumentFile(f, 1_200_000)
      setFiles((x) => [...x, { name: read.name, mimeType: read.mimeType, dataUrl: read.dataUrl }])
      setError('')
    } catch {
      setError('Could not read that file.')
    }
  }

  return (
    <div className="mt-3 space-y-3 pl-7">
      {stage.description ? <p className="text-sm text-ink-600">{stage.description}</p> : null}
      {hint ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{hint}</p> : null}

      {stage.requiredDocs?.length ? (
        <div>
          <p className="text-xs font-semibold text-ink-500">Documents (verify them on the Documents tab)</p>
          <ul className="mt-1 grid gap-1 sm:grid-cols-2">
            {stage.requiredDocs.map((k) => {
              const st = docs.get(k) ?? 'required'
              return (
                <li key={k} className="flex items-center gap-2 text-sm">
                  {st === 'verified' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> : <Circle className="h-4 w-4 text-ink-300" aria-hidden />}
                  {docLabel(k)}
                  <span className="text-xs text-ink-400">{st}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {stage.checklist?.length ? (
        <fieldset>
          <legend className="text-xs font-semibold text-ink-500">Checklist</legend>
          <div className="mt-1 space-y-1">
            {stage.checklist.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={ticked.includes(c)} onChange={(e) => setTicked((t) => (e.target.checked ? [...t, c] : t.filter((x) => x !== c)))} />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold text-ink-500">
          {stage.notesRequired ? 'Outcome notes (required)' : 'Notes (optional)'}
        </span>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={stage.kind === 'credit_check' ? 'e.g. TPN check 05 Nov: score 682, no judgements. Ref 12345.' : 'Anything the file should record'}
        />
      </label>

      {stage.allowAttachments ? (
        <div className="space-y-1">
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm font-semibold text-primary">
            <Paperclip className="h-4 w-4" aria-hidden /> Attach a file (PDF, JPG, PNG)
            <input type="file" accept={APPLICATION_DOC_ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void addFile(f); e.target.value = '' }} />
          </label>
          {files.map((f) => (
            <p key={f.name} className="text-xs text-ink-600">
              {f.name}{' '}
              <button type="button" className="font-semibold text-ink-500 hover:text-rose-700" onClick={() => setFiles((x) => x.filter((y) => y !== f))}>
                remove
              </button>
            </p>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      {gate.ok === false ? <p className="text-xs text-ink-500">{gate.reason}</p> : null}

      {declining ? (
        <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the application declined? The applicant sees this." />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" disabled={busy || !reason.trim()} onClick={() => void onDecline?.(stage, reason.trim())}>
              Decline application
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeclining(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || !gate.ok} onClick={() => void onApprove?.(stage, { notes: notes.trim(), ticked, attachments: files })}>
            Approve {stage.label.toLowerCase()}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDeclining(true)}>
            Decline
          </Button>
        </div>
      )}
    </div>
  )
}
