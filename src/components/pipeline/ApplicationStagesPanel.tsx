/**
 * The application's stages, one after the other. At the current stage staff
 * always see Approve and Decline: Approve moves to the next stage, Decline
 * needs a reason and stops the application. Anything the stage needs (a
 * missing document, the credit check findings) can be added right there.
 * Some stages carry their own panel (deposit, lease, move-in) from the page.
 */
import { useState, type ReactNode } from 'react'
import { CheckCircle2, Circle, Eye, Paperclip, Upload, XCircle } from 'lucide-react'
import type { Application } from '../../types/domain'
import { useAgencyPipeline } from '../../hooks/useApplicationPipeline'
import { PIPELINE_DOCUMENTS, stageApprovalGate, type PipelineStage, type StageRecord } from '../../lib/pipeline/applicationPipeline'
import { applicationStopped, currentStage } from '../../lib/pipeline/stageProgress'
import { readDocumentFile } from '../../lib/applicationDocDownscale'
import { APPLICATION_DOC_ACCEPT, applicationDocTypeError } from '../../lib/applicationDocUpload'
import { openApplicationDocumentFile } from '../../lib/applicationDocumentFile'
import { Badge, Button, Card, Textarea, cn } from '../ui'

type Attachment = NonNullable<StageRecord['attachments']>[number]

export type StageApproveInput = { notes: string; ticked: string[]; attachments: Attachment[]; records: Record<string, StageRecord> }

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })

export function ApplicationStagesPanel({
  application,
  busy,
  onApprove,
  onDecline,
  stageBody,
  approveBlocked,
  ownActions,
  onUploadDocument,
}: {
  application: Application
  busy?: boolean
  onApprove: (stage: PipelineStage, input: StageApproveInput) => void | Promise<void>
  onDecline: (stage: PipelineStage, reason: string) => void | Promise<void>
  /** Extra content for a stage (deposit proof, lease signing, move-in report). */
  stageBody?: (stage: PipelineStage) => ReactNode
  /** Why Approve can't be pressed yet (e.g. the lease isn't signed by both). */
  approveBlocked?: (stage: PipelineStage) => string | null
  /** Stages whose panel has its own approve / decline (the deposit proof). */
  ownActions?: (stage: PipelineStage) => boolean
  onUploadDocument?: (key: string, file: { name: string; mimeType: string; dataUrl: string }) => Promise<boolean> | void
}) {
  const pipeline = useAgencyPipeline(application.agencyId)
  const stages = pipeline.stages.filter((s) => s.enabled)
  const { index: at, records } = currentStage(pipeline, application)
  const stopped = applicationStopped(application, records)
  const declined = Object.entries(records).find(([, r]) => r.status === 'declined')

  return (
    <Card className="space-y-4 p-4 sm:p-5" data-testid="application-stages">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">Application stages</h2>
        {stopped ? (
          <Badge tone="danger">Declined</Badge>
        ) : at >= stages.length ? (
          <Badge tone="success">Complete</Badge>
        ) : (
          <Badge tone="info">
            Stage {at + 1} of {stages.length}: {stages[at]?.label}
          </Badge>
        )}
      </div>
      {stopped ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          This application was declined{declined ? ` at ${stages.find((s) => s.key === declined[0])?.label ?? 'a stage'}` : ''}.
          {application.declineReason || declined?.[1].reason ? ` Reason: ${application.declineReason || declined?.[1].reason}` : ''}
        </p>
      ) : null}
      <ol className="space-y-2">
        {stages.map((s, i) => {
          const rec = records[s.key]
          const current = !stopped && i === at
          return (
            <li key={s.key} className={cn('rounded-xl border px-3 py-3', current ? 'border-primary bg-primary-50/40' : 'border-primary-100')}>
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
                    {rec.inferred ? 'Done earlier' : `${rec.status === 'approved' ? 'Approved' : 'Declined'} by ${rec.byName} on ${fmt(rec.at)}`}
                  </span>
                ) : current ? (
                  <Badge tone="warning">Your decision</Badge>
                ) : null}
              </div>
              {rec?.notes ? <p className="mt-1 pl-7 text-sm text-ink-600">Note: {rec.notes}</p> : null}
              {rec?.reason ? <p className="mt-1 pl-7 text-sm text-rose-800">Reason: {rec.reason}</p> : null}
              {rec?.attachments?.length ? (
                <div className="mt-1 flex flex-wrap gap-3 pl-7">
                  {rec.attachments.map((a) => (
                    <button key={a.name} type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" onClick={() => openApplicationDocumentFile(a)}>
                      <Paperclip className="h-3 w-3" aria-hidden /> {a.name}
                    </button>
                  ))}
                </div>
              ) : null}
              {current ? (
                <CurrentStage
                  stage={s}
                  application={application}
                  records={records}
                  busy={busy}
                  body={stageBody?.(s) ?? null}
                  blocked={approveBlocked?.(s) ?? null}
                  ownActions={ownActions?.(s) ?? false}
                  onApprove={onApprove}
                  onDecline={onDecline}
                  onUploadDocument={onUploadDocument}
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function docLabel(key: string, application: Application) {
  return application.documents.find((d) => d.key === key)?.label ?? PIPELINE_DOCUMENTS.find((d) => d.key === key)?.label ?? key
}

const DOC_STATUS: Record<string, string> = { required: 'Not uploaded', uploaded: 'Uploaded', verified: 'Verified', rejected: 'Rejected' }

function CurrentStage({
  stage,
  application,
  records,
  busy,
  body,
  blocked,
  ownActions,
  onApprove,
  onDecline,
  onUploadDocument,
}: {
  stage: PipelineStage
  application: Application
  records: Record<string, StageRecord>
  busy?: boolean
  body: ReactNode
  blocked: string | null
  ownActions: boolean
  onApprove: (stage: PipelineStage, input: StageApproveInput) => void | Promise<void>
  onDecline: (stage: PipelineStage, reason: string) => void | Promise<void>
  onUploadDocument?: (key: string, file: { name: string; mimeType: string; dataUrl: string }) => Promise<boolean> | void
}) {
  const [ticked, setTicked] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState<string | null>(null)
  const docs = new Map(application.documents.map((d) => [d.key, d]))
  const gate = stageApprovalGate(stage, { documents: application.documents, ticked, notes, attachments: files.length })
  const why = blocked ?? (gate.ok === false ? gate.reason : null)

  const readFile = async (f: File): Promise<Attachment | null> => {
    const err = applicationDocTypeError(f)
    if (err) {
      setError(err)
      return null
    }
    try {
      const read = await readDocumentFile(f, 1_200_000)
      setError('')
      return { name: read.name, mimeType: read.mimeType, dataUrl: read.dataUrl }
    } catch {
      setError('Could not read that file.')
      return null
    }
  }

  const uploadDoc = async (key: string, f: File) => {
    if (!onUploadDocument) return
    const file = await readFile(f)
    if (!file) return
    setUploading(key)
    try {
      await onUploadDocument(key, file)
    } finally {
      setUploading(null)
    }
  }

  const evidenceLabel =
    stage.kind === 'credit_check' ? 'Credit check findings' : stage.kind === 'agent_review' ? 'Review notes' : 'Notes'

  return (
    <div className="mt-3 space-y-3 pl-7">
      {stage.description ? <p className="text-sm text-ink-600">{stage.description}</p> : null}

      {stage.requiredDocs?.length ? (
        <ul className="divide-y divide-primary-50 rounded-xl border border-primary-100 bg-white">
          {stage.requiredDocs.map((k) => {
            const d = docs.get(k)
            const st = d?.status ?? 'required'
            const inFile = st === 'uploaded' || st === 'verified'
            return (
              <li key={k} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                {inFile ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> : <Circle className="h-4 w-4 text-ink-300" aria-hidden />}
                <span className="min-w-0 flex-1 text-ink">{docLabel(k, application)}</span>
                <span className="text-xs text-ink-500">{DOC_STATUS[st] ?? st}</span>
                {d?.file ? (
                  <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" onClick={() => openApplicationDocumentFile(d.file!)}>
                    <Eye className="h-3.5 w-3.5" aria-hidden /> View
                  </button>
                ) : null}
                {!inFile && onUploadDocument ? (
                  <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    <Upload className="h-3.5 w-3.5" aria-hidden /> {uploading === k ? 'Uploading…' : 'Upload'}
                    <input
                      type="file"
                      accept={APPLICATION_DOC_ACCEPT}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void uploadDoc(k, f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {body}

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

      {!ownActions ? (
        <>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-ink-500">
              {evidenceLabel}
              {stage.notesRequired ? '' : ' (optional)'}
            </span>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={stage.kind === 'credit_check' ? 'e.g. TPN check on 5 Nov: score 682, no judgements.' : 'Anything the file should record'}
            />
          </label>

          {stage.allowAttachments ? (
            <div className="space-y-1">
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-sm font-semibold text-primary">
                <Paperclip className="h-4 w-4" aria-hidden /> {stage.kind === 'credit_check' ? 'Upload the credit check report' : 'Attach a file'} (PDF, JPG, PNG)
                <input
                  type="file"
                  accept={APPLICATION_DOC_ACCEPT}
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    if (files.length >= 5) return setError('Up to 5 files per stage.')
                    const a = await readFile(f)
                    if (a) setFiles((x) => [...x, a])
                  }}
                />
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
        </>
      ) : null}

      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      {!ownActions && why ? <p className="text-sm text-amber-800">{why}</p> : null}

      {ownActions ? null : declining ? (
        <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the application declined? The applicant sees this." />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" disabled={busy || !reason.trim()} onClick={() => void onDecline(stage, reason.trim())}>
              Decline application
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDeclining(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-primary-100 pt-3">
          <Button disabled={busy || Boolean(why)} onClick={() => void onApprove(stage, { notes: notes.trim(), ticked, attachments: files, records })}>
            Approve
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setDeclining(true)}>
            Decline
          </Button>
        </div>
      )}
    </div>
  )
}
