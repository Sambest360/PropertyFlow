import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  UserCheck,
  FileCheck2,
  AlertTriangle,
  ArrowUpRight,
  Clock,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAgencyScope, useAuth } from '../../context/AuthContext'
import {
  buildComplianceRejectedVerifications,
  buildComplianceVerificationQueue,
  type ComplianceVerificationRow,
} from '../../lib/complianceQueue'
import type { PropertyDocument } from '../../types/domain'
import {
  PageHeader,
  Card,
  StatCard,
  Badge,
  Button,
  EmptyState,
  cn,
} from '../../components/ui'
import { DashboardPage } from '../../components/dashboard'
import { DeclineVerificationModal } from '../../components/compliance/DeclineVerificationModal'
import { apiUpdateUserVerification } from '../../lib/api/authClient'

type VerificationTab = 'pending' | 'rejected'

const COMPLIANCE_CATEGORIES: PropertyDocument['category'][] = ['Compliance', 'Title']

function docStatusTone(status: PropertyDocument['status']) {
  switch (status) {
    case 'verified':
      return 'success' as const
    case 'uploaded':
      return 'info' as const
    case 'rejected':
      return 'danger' as const
    default:
      return 'warning' as const
  }
}

function docStatusLabel(status: PropertyDocument['status']) {
  switch (status) {
    case 'verified':
      return 'Valid'
    case 'uploaded':
      return 'Awaiting review'
    case 'rejected':
      return 'Expired / rejected'
    default:
      return 'Missing'
  }
}

/** Compliance Dashboard — agency/staff verification queue + property compliance documents. */
export default function ComplianceDashboard() {
  const { user } = useAuth()
  const { scopeAgency } = useAgencyScope()
  const { state, updatePropertyDocument, updateUser } = useStore()
  const { users, properties, propertyDocuments } = state
  const [declineTarget, setDeclineTarget] = useState<ComplianceVerificationRow | null>(null)
  const [verificationTab, setVerificationTab] = useState<VerificationTab>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isPrincipal = user?.role === 'super_admin' || user?.role === 'client_admin'
  const verificationQueue: ComplianceVerificationRow[] = useMemo(
    () => buildComplianceVerificationQueue(users, (u) => scopeAgency(u.agencyId)),
    [users, scopeAgency],
  )

  const rejectedVerifications: ComplianceVerificationRow[] = useMemo(
    () => buildComplianceRejectedVerifications(users, (u) => scopeAgency(u.agencyId)),
    [users, scopeAgency],
  )

  const complianceDocs = useMemo(
    () =>
      propertyDocuments
        .filter((d) => COMPLIANCE_CATEGORIES.includes(d.category))
        .filter((d) => {
          const property = properties.find((p) => p.id === d.propertyId)
          if (!property) return false
          return scopeAgency(property.agencyId)
        }),
    [propertyDocuments, properties, scopeAgency],
  )

  const docsNeedingAction = complianceDocs.filter((d) => d.status !== 'verified')

  const stats = {
    pendingVerifications: verificationQueue.length,
    totalDocs: complianceDocs.length,
    validDocs: complianceDocs.filter((d) => d.status === 'verified').length,
    actionDocs: docsNeedingAction.length,
  }

  const decideVerification = async (
    row: ComplianceVerificationRow,
    status: 'approved' | 'rejected',
    rejectNote?: string,
  ) => {
    if (status === 'rejected') {
      const note = rejectNote?.trim() ?? ''
      if (!note) {
        setError('Add a rejection note first.')
        return
      }
    }
    setError(null)
    setBusyId(row.userId)
    setBusyAction(status === 'approved' ? 'approve' : 'reject')
    const trimmedNote = rejectNote?.trim()
    const subject = users.find((u) => u.id === row.userId)
    try {
      const dto = await apiUpdateUserVerification({
        userId: row.userId,
        status,
        rejectNote: status === 'rejected' ? trimmedNote : undefined,
        subject: subject
          ? {
              name: subject.name,
              email: subject.email ?? '',
              role: subject.role,
              agencyId: subject.agencyId,
              active: subject.active,
            }
          : undefined,
      })
      if (dto.verification) {
        updateUser(row.userId, { verification: dto.verification })
      } else {
        updateUser(row.userId, {
          verification: {
            ...(status === 'rejected' && trimmedNote ? { rejectNote: trimmedNote } : {}),
            status,
            reviewedAt: new Date().toISOString(),
          },
        })
      }
      if (status === 'rejected') setDeclineTarget(null)
    } catch (err) {
      // No fallback to a plain user write: verification decisions go through the
      // super-admin route only (a user write cannot change verification).
      setError(
        err instanceof Error && err.message
          ? `Could not save the verification decision: ${err.message}`
          : 'Could not save the verification decision.',
      )
    } finally {
      setBusyId(null)
      setBusyAction(null)
    }
  }

  const markDocVerified = (doc: PropertyDocument) => {
    updatePropertyDocument(doc.id, { status: 'verified' })
  }

  // P0-8 (E2E #2): Compliance needs a two-way workflow — reject with a note,
  // not only "mark valid". Persisted via the same document upsert path.
  const markDocRejected = (doc: PropertyDocument, note: string) => {
    updatePropertyDocument(doc.id, {
      status: 'rejected',
      note: note ? `Rejected: ${note}` : 'Rejected',
    })
  }

  return (
    <DashboardPage>
      <nav
        className="mb-5 flex gap-1 overflow-x-auto border-b border-primary-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Verification views"
      >
        {(
          [
            { id: 'pending' as const, label: 'Pending' },
            { id: 'rejected' as const, label: 'Rejected' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setVerificationTab(tab.id)}
            className={cn(
              'min-h-11 shrink-0 cursor-pointer border-b-2 px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              verificationTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-400 hover:text-ink-600',
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <PageHeader
        title="Compliance"
        subtitle="Verification queue and property compliance documents"
        actions={null}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending verifications"
          value={String(stats.pendingVerifications)}
          hint={stats.pendingVerifications > 0 ? 'Review required' : 'All clear'}
          icon={<UserCheck className="h-6 w-6" aria-hidden />}
        />
        <StatCard
          label="Compliance documents"
          value={String(stats.totalDocs)}
          icon={<FileCheck2 className="h-6 w-6" aria-hidden />}
        />
        <StatCard
          label="Valid"
          value={String(stats.validDocs)}
          icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
        />
        <StatCard
          label="Needs action"
          value={String(stats.actionDocs)}
          hint={stats.actionDocs > 0 ? 'Expiring or missing' : 'Nothing outstanding'}
          icon={<AlertTriangle className="h-6 w-6" aria-hidden />}
        />
      </div>

      {error ? (
        <Card className="border-accent-200 bg-accent-50">
          <p className="text-sm font-medium text-accent-700">{error}</p>
        </Card>
      ) : null}

      {/* Verification queue / rejected history */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">
            {verificationTab === 'pending' ? 'Verification queue' : 'Rejected verifications'}
          </h2>
          <Badge
            tone={
              verificationTab === 'pending'
                ? stats.pendingVerifications > 0
                  ? 'warning'
                  : 'neutral'
                : rejectedVerifications.length > 0
                  ? 'danger'
                  : 'neutral'
            }
          >
            {verificationTab === 'pending'
              ? `${stats.pendingVerifications} pending`
              : `${rejectedVerifications.length} rejected`}
          </Badge>
        </div>
        {verificationTab === 'pending' ? (
          verificationQueue.length === 0 ? (
            <EmptyState
              title="No pending verifications"
              description="Landlord and contractor onboarding reviews appear here when submitted."
            />
          ) : (
            <ul className="divide-y divide-primary-100">
              {verificationQueue.map((row) => (
                <li key={row.userId} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-ink">{row.name}</p>
                      <Badge tone={row.role === 'landlord' ? 'info' : 'neutral'}>{row.role}</Badge>
                    </div>
                    <p className="truncate text-xs text-ink-500">{row.email}</p>
                    {row.submittedAt ? (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-400">
                        <Clock className="h-3 w-3" aria-hidden /> Submitted{' '}
                        {new Date(row.submittedAt).toLocaleDateString('en-ZA', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {isPrincipal ? (
                      <>
                        <Button
                          type="button"
                          className="min-h-11 cursor-pointer"
                          disabled={busyId === row.userId}
                          aria-busy={busyId === row.userId && busyAction === 'approve'}
                          onClick={() => void decideVerification(row, 'approved')}
                        >
                          {busyId === row.userId && busyAction === 'approve'
                            ? 'Approving…'
                            : 'Approve'}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="min-h-11 cursor-pointer"
                          disabled={busyId === row.userId}
                          onClick={() => setDeclineTarget(row)}
                        >
                          Reject
                        </Button>
                      </>
                    ) : (
                      <Badge tone="warning">Principal approval required</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : rejectedVerifications.length === 0 ? (
          <EmptyState
            title="No rejected verifications"
            description="Declined landlord and contractor applications appear here for your records."
          />
        ) : (
          <ul className="divide-y divide-primary-100">
            {rejectedVerifications.map((row) => (
              <li key={row.userId} className="flex flex-col gap-2 py-4">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink">{row.name}</p>
                  <Badge tone={row.role === 'landlord' ? 'info' : 'neutral'}>{row.role}</Badge>
                  <Badge tone="danger">Rejected</Badge>
                </div>
                <p className="truncate text-xs text-ink-500">{row.email}</p>
                {row.reviewedAt ? (
                  <p className="flex items-center gap-1 text-xs text-ink-400">
                    <Clock className="h-3 w-3" aria-hidden /> Declined{' '}
                    {new Date(row.reviewedAt).toLocaleDateString('en-ZA', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                ) : null}
                {row.rejectNote?.trim() ? (
                  <p className="rounded-xl bg-primary-50 px-3 py-2 text-xs text-ink-600">
                    {row.rejectNote.trim()}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Property compliance documents */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Property compliance documents</h2>
          <Badge tone={stats.actionDocs > 0 ? 'danger' : 'success'}>
            {stats.actionDocs} need action
          </Badge>
        </div>
        {complianceDocs.length === 0 ? (
          <EmptyState
            title="No compliance documents yet"
            description="Compliance and title documents attached to properties appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-100 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th className="py-2 pr-4 font-semibold">Document</th>
                  <th className="py-2 pr-4 font-semibold">Property</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 pr-4 font-semibold">Uploaded</th>
                  <th className="py-2 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-100">
                {complianceDocs.map((d) => {
                  const property = properties.find((p) => p.id === d.propertyId)
                  return (
                    <tr key={d.id}>
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-ink">{d.name}</p>
                        <p className="text-xs text-ink-400">{d.category}</p>
                      </td>
                      <td className="py-3 pr-4">
                        {property ? (
                          <Link
                            to={`/workspace/properties/${property.id}`}
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            {property.title}
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                        ) : (
                          <span className="text-ink-400">{d.propertyId}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={docStatusTone(d.status)}>{docStatusLabel(d.status)}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-ink-500">
                        {d.uploadedAt
                          ? new Date(d.uploadedAt).toLocaleDateString('en-ZA', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="py-3 text-right">
                        {d.status === 'verified' ? (
                          <span className="text-xs text-ink-400">No action</span>
                        ) : d.fileUrl ? (
                          <a
                            href={d.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Open document
                          </a>
                        ) : d.status === 'uploaded' && isPrincipal ? (
                          <span className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => markDocVerified(d)}
                              className="cursor-pointer text-xs font-semibold text-primary hover:underline"
                            >
                              Mark valid
                            </button>
                            <button
                              type="button"
                              onClick={() => markDocRejected(d, '')}
                              className="cursor-pointer text-xs font-semibold text-red-600 hover:underline"
                            >
                              Reject
                            </button>
                          </span>
                        ) : (
                          <Link
                            to={`/workspace/properties/${d.propertyId}`}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Upload
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DeclineVerificationModal
        open={declineTarget !== null}
        subjectName={declineTarget?.name ?? ''}
        subjectRole={declineTarget?.role ?? ''}
        onClose={() => setDeclineTarget(null)}
        onConfirm={(note) => {
          if (declineTarget) void decideVerification(declineTarget, 'rejected', note)
        }}
      />
    </DashboardPage>
  )
}
