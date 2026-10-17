import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronDown, CircleDashed, Download, Eye, Search, XCircle } from 'lucide-react'
import type { Application, ApplicationDocument } from '../../types/domain'
import type { Permission } from '../../types/domain'
import { Badge, Button, Card, Input, Modal, Select, cn, statusTone } from '../ui'
import { formatZAR } from '../../data/seed'
import {
  canIssueLeaseApproval,
  primaryNextTransition,
  resolveWorkflowStatus,
  transitionGuardMessage,
  workflowStageSelectOptions,
  type WorkflowStatusKey,
} from '../../lib/applicationWorkflow'
import { allDocsUploaded, allDocsVerified, docsProgress } from '../../lib/workflow'
import { useSuiteAlert } from '../alerts/SuiteAlert'
import { BlockApplicantModal } from '../applicant-detail/BlockApplicantModal'
import { ListPagination, paginate } from './ListPagination'
import { ICON_STROKE } from './types'

function uploadLabel(status: ApplicationDocument['status']) {
  if (status === 'required') return 'Not uploaded'
  if (status === 'uploaded') return 'Uploaded'
  if (status === 'verified') return 'Verified'
  return 'Rejected'
}

function uploadTone(
  status: ApplicationDocument['status'],
): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'required') return 'neutral'
  if (status === 'uploaded') return 'info'
  if (status === 'verified') return 'success'
  return 'danger'
}

function StatusIcon({ status }: { status: ApplicationDocument['status'] }) {
  if (status === 'verified' || status === 'uploaded') {
    return (
      <CheckCircle2
        className={cn('h-4 w-4 shrink-0', status === 'verified' ? 'text-emerald-600' : 'text-primary')}
        strokeWidth={ICON_STROKE}
        aria-hidden
      />
    )
  }
  if (status === 'rejected') {
    return <XCircle className="h-4 w-4 shrink-0 text-accent" strokeWidth={ICON_STROKE} aria-hidden />
  }
  return <CircleDashed className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
}

function downloadDoc(applicantName: string, doc: ApplicationDocument) {
  const blob = new Blob(
    [
      [
        `Applicant: ${applicantName}`,
        `Document: ${doc.label}`,
        `Status: ${uploadLabel(doc.status)}`,
        doc.note ? `Note: ${doc.note}` : '',
        '',
        'Lekaya — demo document pack export',
      ]
        .filter(Boolean)
        .join('\n'),
    ],
    { type: 'text/plain;charset=utf-8' },
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${applicantName.replace(/\s+/g, '_')}-${doc.key}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

export function PropertyApplicantsPanel({
  applications,
  canReview,
  reviewPermissions,
  onAdvance,
  onApprove,
  onSetDocStatus,
  onSetWorkflowStage,
  onBlock,
  /** P0-r21: lease truth for RECOVER_APPROVE — defaults assume lease exists. */
  leaseExistsForApplication,
}: {
  applications: Application[]
  canReview: boolean
  reviewPermissions: Permission[]
  onAdvance: (id: string, targetStatus: WorkflowStatusKey) => void | Promise<void>
  onApprove: (id: string) => void | Promise<void>
  onSetDocStatus: (applicationId: string, key: string, status: ApplicationDocument['status']) => void
  onSetWorkflowStage: (id: string, status: WorkflowStatusKey) => void
  onBlock: (id: string, reason: string) => void
  leaseExistsForApplication?: (applicationId: string) => boolean
}) {
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [blockTarget, setBlockTarget] = useState<Application | null>(null)
  const alert = useSuiteAlert()
  const [viewing, setViewing] = useState<{
    applicantName: string
    email: string
    doc: ApplicationDocument
  } | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return applications
    return applications.filter(
      (a) =>
        a.applicantName.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.stage.toLowerCase().includes(q),
    )
  }, [applications, query])

  useEffect(() => {
    setPage(1)
  }, [query])

  const paged = useMemo(() => paginate(filtered, page), [filtered, page])

  useEffect(() => {
    if (page !== paged.page) setPage(paged.page)
  }, [page, paged.page])

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-ink">Applicants</h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Expand an applicant to review documents, advance the workflow, or open their full profile.
          </p>
        </div>
        <div className="relative min-w-[14rem] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
          <Input
            className="min-h-11 pl-9"
            placeholder="Filter applicants…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter applicants"
          />
        </div>
      </div>

      <ul className="space-y-2">
        {paged.items.map((a) => {
          const open = expandedId === a.id
          const uploadedCount = a.documents.filter((d) => d.status !== 'required').length
          const verifiedCount = a.documents.filter((d) => d.status === 'verified').length
          const workflowStatus = resolveWorkflowStatus(a)
          // P0-r21: lease-less deposit apps must surface Approve & create lease.
          const leaseExists = leaseExistsForApplication?.(a.id) ?? true
          const nextTransition = canReview
            ? primaryNextTransition(a, reviewPermissions, leaseExists)
            : null
          const guardBlock = nextTransition ? transitionGuardMessage(a, nextTransition) : null
          const stageOptions = workflowStageSelectOptions(a.type)
          const canBlock =
            canReview &&
            workflowStatus !== 'active_tenancy' &&
            workflowStatus !== 'rejected' &&
            workflowStatus !== 'withdrawn' &&
            workflowStatus !== 'cancelled' &&
            a.stage !== 'Blocked'
          const showApprove = canReview && canIssueLeaseApproval(a, reviewPermissions)
          const docsComplete = allDocsUploaded(a.documents)
          const docsVerified = allDocsVerified(a.documents)
          return (
            <li
              key={a.id}
              className={cn(
                'overflow-hidden rounded-2xl border',
                open ? 'border-primary-200 bg-primary-50' : 'border-primary-100 bg-white',
              )}
            >
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : a.id)}
                aria-expanded={open}
                className="flex w-full min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{a.applicantName}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {a.type} · income {formatZAR(a.income)} · {a.email}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden text-xs tabular text-ink-400 sm:inline">
                    {uploadedCount}/{a.documents.length} docs
                    {verifiedCount > 0 ? ` · ${verifiedCount} verified` : ''}
                  </span>
                  <Badge tone={statusTone(a.stage)}>{a.stage}</Badge>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-ink-400 transition-transform duration-200',
                      open && 'rotate-180',
                    )}
                    strokeWidth={ICON_STROKE}
                    aria-hidden
                  />
                </div>
              </button>

              {open && (
                <div className="border-t border-primary-100/80 bg-white px-3 py-4 sm:px-4">
                  <div className="mb-4 rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-2.5 text-xs text-ink-600">
                    <p>
                      <span className="font-semibold text-ink">Document progress:</span>{' '}
                      {docsProgress(a.documents)}% ·{' '}
                      {docsVerified
                        ? 'All required documents verified.'
                        : docsComplete
                          ? 'Uploaded — verify each item below.'
                          : 'Waiting on applicant uploads — mark items uploaded as they arrive.'}
                    </p>
                    {nextTransition ? (
                      <p className="mt-1 text-ink-500">
                        <span className="font-semibold text-ink">Suggested next step:</span>{' '}
                        {nextTransition.label}
                        {guardBlock ? ` — ${guardBlock}` : ''}
                      </p>
                    ) : (
                      <p className="mt-1 text-ink-500">No further workflow actions at this stage.</p>
                    )}
                  </div>

                  <div className="mb-4 flex flex-wrap gap-2">
                    {canReview && (
                      <Link
                        to={`/workspace/sales/applications/${a.id}`}
                        className="inline-flex min-h-11 items-center rounded-xl border border-primary-100 bg-white px-3 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open profile
                      </Link>
                    )}
                    {canReview && nextTransition ? (
                      <Button
                        size="sm"
                        className="min-h-11"
                        disabled={Boolean(guardBlock)}
                        title={guardBlock ?? undefined}
                        onClick={() => void onAdvance(a.id, nextTransition.to)}
                      >
                        {nextTransition.label}
                      </Button>
                    ) : null}
                    {showApprove ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="min-h-11"
                        onClick={() => void onApprove(a.id)}
                      >
                        Approve → lease
                      </Button>
                    ) : null}
                    {canBlock && (
                      <Button
                        size="sm"
                        variant="danger"
                        className="min-h-11"
                        onClick={() => setBlockTarget(a)}
                      >
                        Block applicant
                      </Button>
                    )}
                    <Select
                      className="min-h-11 min-w-[12rem]"
                      value={workflowStatus}
                      disabled={!canReview}
                      onChange={(e) => onSetWorkflowStage(a.id, e.target.value as WorkflowStatusKey)}
                      aria-label="Application workflow stage"
                    >
                      {stageOptions.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                          {s.terminal ? ' (closed)' : ''}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-primary-100">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                        <caption className="sr-only">
                          Required documents for {a.applicantName}
                        </caption>
                        <thead>
                          <tr className="border-b border-primary-100 bg-primary-50/80 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                            <th scope="col" className="px-4 py-3 font-semibold">
                              Document
                            </th>
                            <th scope="col" className="px-3 py-3 font-semibold">
                              Status
                            </th>
                            <th scope="col" className="px-3 py-3 font-semibold">
                              Uploaded
                            </th>
                            <th scope="col" className="px-4 py-3 font-semibold">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.documents.map((d) => {
                            const uploaded = d.status !== 'required'
                            const tone = uploadTone(d.status)
                            return (
                              <tr
                                key={d.key}
                                className="border-b border-primary-50 last:border-b-0"
                              >
                                <td className="px-4 py-3 align-middle">
                                  <p className="font-medium text-ink">{d.label}</p>
                                  {d.note && (
                                    <p className="mt-0.5 text-xs text-ink-400">{d.note}</p>
                                  )}
                                </td>
                                <td className="px-3 py-3 align-middle">
                                  <span className="inline-flex items-center gap-1.5">
                                    <StatusIcon status={d.status} />
                                    {canReview ? (
                                      <Select
                                        className="min-h-11"
                                        value={d.status}
                                        onChange={(e) =>
                                          onSetDocStatus(
                                            a.id,
                                            d.key,
                                            e.target.value as ApplicationDocument['status'],
                                          )
                                        }
                                        aria-label={`${d.label} status`}
                                      >
                                        {['required', 'uploaded', 'verified', 'rejected'].map(
                                          (s) => (
                                            <option key={s} value={s}>
                                              {uploadLabel(s as ApplicationDocument['status'])}
                                            </option>
                                          ),
                                        )}
                                      </Select>
                                    ) : (
                                      <Badge tone={tone}>
                                        {uploadLabel(d.status)}
                                      </Badge>
                                    )}
                                  </span>
                                </td>
                                <td className="px-3 py-3 align-middle">
                                  <Badge tone={uploaded ? 'success' : 'neutral'}>
                                    {uploaded ? 'Yes' : 'No'}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 align-middle">
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      className="min-h-11"
                                      disabled={!uploaded}
                                      onClick={() =>
                                        setViewing({
                                          applicantName: a.applicantName,
                                          email: a.email,
                                          doc: d,
                                        })
                                      }
                                    >
                                      <Eye
                                        className="h-4 w-4"
                                        strokeWidth={ICON_STROKE}
                                        aria-hidden
                                      />
                                      View
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      className="min-h-11"
                                      disabled={!uploaded}
                                      onClick={() => downloadDoc(a.applicantName, d)}
                                    >
                                      <Download
                                        className="h-4 w-4"
                                        strokeWidth={ICON_STROKE}
                                        aria-hidden
                                      />
                                      Download
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                          {!a.documents.length && (
                            <tr>
                              <td
                                colSpan={4}
                                className="px-4 py-8 text-center text-sm text-ink-500"
                              >
                                Document checklist loading — refresh the page. If this persists, open
                                the applicant profile to re-sync.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </li>
          )
        })}
        {!filtered.length && (
          <li className="py-10 text-center text-sm text-ink-500">No applicants for this property.</li>
        )}
      </ul>

      <ListPagination
        page={paged.page}
        totalPages={paged.totalPages}
        total={paged.total}
        pageSize={paged.pageSize}
        onPageChange={setPage}
        label="applicants"
      />

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.doc.label ?? 'Document'}
        description={
          viewing ? `${viewing.applicantName} · ${viewing.email}` : undefined
        }
        footer={
          <>
            {viewing && viewing.doc.status !== 'required' && (
              <Button
                variant="secondary"
                className="min-h-11"
                onClick={() => downloadDoc(viewing.applicantName, viewing.doc)}
              >
                <Download className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Download
              </Button>
            )}
            <Button className="min-h-11" onClick={() => setViewing(null)}>
              Close
            </Button>
          </>
        }
      >
        {viewing && (
          <div className="space-y-3 text-sm">
            <p className="inline-flex items-center gap-2">
              <StatusIcon status={viewing.doc.status} />
              <Badge tone={uploadTone(viewing.doc.status)}>
                {uploadLabel(viewing.doc.status)}
              </Badge>
            </p>
            <div className="rounded-xl bg-primary-50 p-4 text-ink-600">
              {viewing.doc.note ||
                'Demo preview — the uploaded file for this checklist item would render here.'}
            </div>
          </div>
        )}
      </Modal>

      <BlockApplicantModal
        open={Boolean(blockTarget)}
        applicantName={blockTarget?.applicantName ?? ''}
        onClose={() => setBlockTarget(null)}
        onConfirm={async (reason) => {
          if (!blockTarget) return
          onBlock(blockTarget.id, reason)
          await alert.success({
            title: 'Applicant blocked',
            text: `“${blockTarget.applicantName}” was blocked. Reason saved.`,
          })
          setBlockTarget(null)
        }}
      />
    </Card>
  )
}
