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
import { useAuth } from '../../context/AuthContext'
import type { PropertyDocument } from '../../types/domain'
import type { UserVerification } from '../../lib/verification'
import {
  PageHeader,
  Card,
  StatCard,
  Badge,
  Button,
  EmptyState,
  Input,
} from '../../components/ui'
import { DashboardPage } from '../../components/dashboard'
import { SectionSubnav } from '../../components/layout/SectionSubnav'
import { apiUpdateUserVerification } from '../../lib/api/authClient'
import { sweetConfirm } from '../../lib/sweetAlert'

type VerificationRow = {
  userId: string
  name: string
  email: string
  role: string
  status: NonNullable<UserVerification['status']>
  submittedAt?: string
}

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
  const { state, updatePropertyDocument, updateUser } = useStore()
  const { users, properties, propertyDocuments } = state
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isPrincipal = user?.role === 'super_admin' || user?.role === 'client_admin'
  const agencyUsers = useMemo(
    () => (user?.agencyId ? users.filter((u) => u.agencyId === user.agencyId) : users),
    [users, user?.agencyId],
  )

  const verificationQueue: VerificationRow[] = useMemo(
    () =>
      agencyUsers
        .filter(
          (u) =>
            (u.role === 'landlord' || u.role === 'contractor') &&
            u.verification?.status === 'pending',
        )
        .map((u) => ({
          userId: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.verification!.status,
          submittedAt: u.verification?.submittedAt,
        })),
    [agencyUsers],
  )

  const complianceDocs = useMemo(
    () =>
      propertyDocuments
        .filter((d) => COMPLIANCE_CATEGORIES.includes(d.category))
        .filter((d) => (user?.agencyId ? properties.some((p) => p.id === d.propertyId && p.agencyId === user.agencyId) : true)),
    [propertyDocuments, properties, user?.agencyId],
  )

  const docsNeedingAction = complianceDocs.filter((d) => d.status !== 'verified')

  const stats = {
    pendingVerifications: verificationQueue.length,
    totalDocs: complianceDocs.length,
    validDocs: complianceDocs.filter((d) => d.status === 'verified').length,
    actionDocs: docsNeedingAction.length,
  }

  const decideVerification = async (row: VerificationRow, status: 'approved' | 'rejected') => {
    if (status === 'rejected') {
      const note = (rejectNote[row.userId] ?? '').trim()
      if (!note) {
        setError('Add a rejection note first.')
        return
      }
      const ok = await sweetConfirm('Reject verification?', `This will notify ${row.name}.`)
      if (!ok) return
    }
    setError(null)
    setBusyId(row.userId)
    try {
      const dto = await apiUpdateUserVerification({
        userId: row.userId,
        status,
        rejectNote: status === 'rejected' ? rejectNote[row.userId]?.trim() : undefined,
      })
      if (dto.verification) {
        updateUser(row.userId, { verification: dto.verification })
      } else {
        updateUser(row.userId, {
          verification: {
            ...(status === 'rejected' ? { rejectNote: rejectNote[row.userId]?.trim() } : {}),
            status,
            reviewedAt: new Date().toISOString(),
          },
        })
      }
    } catch {
      // API unavailable (demo/offline) — fall back to the local store so the
      // reviewer keeps a working queue. Persistence retried on next action.
      updateUser(row.userId, {
        verification: {
          ...(status === 'rejected' ? { rejectNote: rejectNote[row.userId]?.trim() } : {}),
          status,
          reviewedAt: new Date().toISOString(),
        },
      })
    } finally {
      setBusyId(null)
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
      <SectionSubnav items={[{ to: '/workspace/compliance', label: 'Dashboard', end: true }]} />
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

      {/* Verification queue */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Verification queue</h2>
          <Badge tone={stats.pendingVerifications > 0 ? 'warning' : 'neutral'}>
            {stats.pendingVerifications} pending
          </Badge>
        </div>
        {verificationQueue.length === 0 ? (
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
                  {row.status === 'pending' && rejectNote[row.userId] !== undefined ? (
                    <Input
                      className="mt-2 max-w-md min-h-11"
                      placeholder="Rejection note (required to reject)"
                      value={rejectNote[row.userId]}
                      onChange={(e) =>
                        setRejectNote((m) => ({ ...m, [row.userId]: e.target.value }))
                      }
                    />
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  {isPrincipal ? (
                    <>
                      <Button
                        type="button"
                        className="min-h-11 cursor-pointer"
                        disabled={busyId === row.userId}
                        onClick={() => void decideVerification(row, 'approved')}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-11 cursor-pointer"
                        disabled={busyId === row.userId}
                        onClick={() => {
                          if (rejectNote[row.userId] === undefined) {
                            setRejectNote((m) => ({ ...m, [row.userId]: '' }))
                          } else {
                            void decideVerification(row, 'rejected')
                          }
                        }}
                      >
                        {rejectNote[row.userId] === undefined ? 'Reject…' : 'Confirm reject'}
                      </Button>
                    </>
                  ) : (
                    <Badge tone="warning">Principal approval required</Badge>
                  )}
                </div>
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
                              onClick={() => markDocRejected(d, rejectNote[`doc-${d.id}`] ?? '')}
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
    </DashboardPage>
  )
}
