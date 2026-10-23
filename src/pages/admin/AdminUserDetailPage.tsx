import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  Mail,
  Phone,
  Wrench,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAgencyScope, useAuth } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { BackButton } from '../../components/BackButton'
import { ActionButtonRow } from '../../components/ActionButtonRow'
import { ImpersonateUserButton } from '../../components/admin/ImpersonateUserButton'
import { ResetPasswordButton } from '../../components/admin/ResetPasswordButton'
import { showPasswordResetEntry } from '../../lib/auth/passwordResetUi'
import { isApiEnabled } from '../../lib/api/config'
import { AgencyCapabilityChecklist } from '../../components/admin/AgencyCapabilityChecklist'
import { VerificationStatusBadge } from '../../components/auth/VerificationBanner'
import { DashboardTabs } from '../../components/dashboard/DashboardTabs'
import { DetailSection, DetailStack, FlatField, FlatFieldGrid } from '../../components/detail/FlatFields'
import { PersonAvatar } from '../../components/directory/DirectoryToolbar'
import { Badge, Button, Card, Input, Select, cn } from '../../components/ui'
import {
  defaultLicenseStatus,
  DEFERRED_ADMIN_ROLES,
  grantablePermissions,
  rolePermissions,
  mentorsForAgency,
  roleLabels,
  rolesVisibleInAdminUi,
  userBasePermissions,
} from '../../lib/permissions'
import { formatZAR } from '../../data/seed'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'
import { formatDisplayDob } from '../../lib/saId'
import { apiUpdateUserVerification } from '../../lib/api/authClient'
import type { AppUser, Permission, Role } from '../../types/domain'
import {
  documentOpenLabel,
  markDocumentLookedAt,
  verificationDecisionsEnabled,
  type UserVerification,
} from '../../lib/verification'
import { maskIdNumber } from '../../lib/screening/consentTerms'

const ICON_STROKE = 1.6

const ALL_ROLES: Role[] = [
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'landlord',
  'tenant',
  'contractor',
]

const AGENCY_ROLES: Role[] = [
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
  'landlord',
  'tenant',
  'contractor',
]

type DetailTab = 'overview' | 'access' | 'linked'

function isDetailTab(v: string | null): v is DetailTab {
  return v === 'overview' || v === 'access' || v === 'linked'
}

export default function AdminUserDetailPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { state, assignRole, updateUser } = useStore()
  const { has, realUser } = useAuth()
  const { scopeAgency } = useAgencyScope()
  const reducedMotion = usePrefersReducedMotion()

  const isPlatform = has('platform.manage')
  const hasRolesAssign = has('roles.assign')
  const canEditPermissions = has('users.manage') || has('roles.assign')
  const assignableRoles = rolesVisibleInAdminUi(isPlatform ? ALL_ROLES : AGENCY_ROLES)

  const user = state.users.find((u) => u.id === id)

  const tabParam = params.get('tab')
  const tab: DetailTab = isDetailTab(tabParam) ? tabParam : 'overview'
  const setTab = (next: string) => {
    const sp = new URLSearchParams(params)
    if (next === 'overview') sp.delete('tab')
    else sp.set('tab', next)
    setParams(sp, { replace: true })
  }

  const inScope = useMemo(() => {
    if (!user) return false
    if (user.role === 'super_admin') return isPlatform
    return scopeAgency(user.agencyId)
  }, [user, isPlatform, scopeAgency])

  const linked = useMemo(() => {
    if (!user) {
      return {
        properties: [] as typeof state.properties,
        leads: [] as typeof state.leads,
        applications: [] as typeof state.applications,
        payments: [] as typeof state.payments,
        tickets: [] as typeof state.tickets,
      }
    }
    return {
      properties: state.properties.filter((p) => p.agentId === user.id),
      leads: state.leads.filter((l) => l.agentId === user.id),
      applications: state.applications.filter(
        (a) => a.applicantUserId === user.id || a.agentId === user.id,
      ),
      payments: state.payments.filter((p) => p.partyUserId === user.id),
      tickets: state.tickets.filter(
        (t) =>
          t.contractorId === user.id ||
          t.assignedAgentId === user.id ||
          t.reportedByUserId === user.id,
      ),
    }
  }, [user, state.properties, state.leads, state.applications, state.payments, state.tickets])

  if (!user) return <Navigate to="/workspace/admin/users" replace />
  if (!inScope) return <Navigate to="/workspace/admin/users" replace />

  const agency = state.agencies.find((a) => a.id === user.agencyId)
  const agencyName =
    agency?.name ?? (user.role === 'super_admin' ? 'Platform' : '—')
  const mutable = isPlatform || (user.role !== 'super_admin' && scopeAgency(user.agencyId))
  const currentPerms = userBasePermissions(user.role, user.enabledPermissions)
  const mentors = mentorsForAgency(state.users, user.agencyId)
  const mentorName = user.mentorId
    ? state.users.find((u) => u.id === user.mentorId)?.name ?? null
    : null

  const linkedCount =
    linked.properties.length +
    linked.leads.length +
    linked.applications.length +
    linked.payments.length +
    linked.tickets.length

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'access', label: 'Access' },
    { id: 'linked', label: 'Linked', count: linkedCount },
  ]

  return (
    <RequirePermission permission="roles.assign">
      <div className="animate-fade-in space-y-5">
        <div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <PersonAvatar name={user.name} className="h-14 w-14 text-base" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
                    {user.name}
                  </h1>
                  <Badge tone={user.active ? 'success' : 'danger'}>
                    {user.active ? 'Active' : 'Disabled'}
                  </Badge>
                  <VerificationStatusBadge user={user} />
                </div>
                <p className="mt-1 text-sm text-ink-500">
                  {roleLabels[user.role]} · {agencyName}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-ink-400" strokeWidth={ICON_STROKE} aria-hidden />
                    {user.email}
                  </span>
                  {user.phone ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone
                        className="h-3.5 w-3.5 text-ink-400"
                        strokeWidth={ICON_STROKE}
                        aria-hidden
                      />
                      {user.phone}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <ActionButtonRow className="sm:w-auto">
              {mutable && !user.active ? (
                <Button
                  type="button"
                  variant="primary"
                  className="min-h-11 cursor-pointer"
                  onClick={() => updateUser(user.id, { active: !user.active })}
                >
                  Enable account
                </Button>
              ) : null}
              <ImpersonateUserButton target={user} />
              {showPasswordResetEntry({
                hasUsersManage: has('users.manage'),
                apiMode: isApiEnabled,
                viewerId: realUser.id,
                target: user,
              }) ? (
                <ResetPasswordButton userId={user.id} userName={user.name} />
              ) : null}
              {mutable && user.active ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 cursor-pointer"
                  onClick={() => updateUser(user.id, { active: !user.active })}
                >
                  Disable account
                </Button>
              ) : null}
              <BackButton to="/workspace/admin/users" label="All users" />
            </ActionButtonRow>
          </div>
        </div>

        <div className="sticky top-0 z-20 -mx-1 bg-white/95 px-1 backdrop-blur-md">
          <DashboardTabs tabs={tabs} value={tab} onChange={setTab} />
        </div>

        {tab === 'overview' ? (
          <OverviewTab
            user={user}
            agencyName={agencyName}
            linked={linked}
            mentorName={mentorName}
            canReview={isPlatform}
            onVerificationUpdated={(verification) => updateUser(user.id, { verification })}
          />
        ) : null}

        {tab === 'access' ? (
          <AccessTab
            user={user}
            agency={agency}
            agencies={state.agencies}
            mentors={mentors}
            mentorName={mentorName}
            mutable={mutable}
            isPlatform={isPlatform}
            hasRolesAssign={hasRolesAssign}
            canEditPermissions={canEditPermissions}
            assignableRoles={assignableRoles}
            currentPerms={currentPerms}
            reducedMotion={reducedMotion}
            onAssignRole={assignRole}
            onUpdateProfile={(patch) => updateUser(user.id, patch)}
            onUpdatePermissions={(enabledPermissions) =>
              updateUser(user.id, { enabledPermissions })
            }
          />
        ) : null}

        {tab === 'linked' ? <LinkedTab linked={linked} user={user} /> : null}
      </div>
    </RequirePermission>
  )
}

function OverviewTab({
  user,
  agencyName,
  linked,
  mentorName,
  canReview,
  onVerificationUpdated,
}: {
  user: AppUser
  agencyName: string
  linked: {
    properties: unknown[]
    leads: Array<{ stage: string }>
    applications: unknown[]
    payments: Array<{ status: string }>
    tickets: unknown[]
  }
  mentorName: string | null
  canReview: boolean
  onVerificationUpdated: (verification: UserVerification) => void
}) {
  const openLeads = linked.leads.filter(
    (l) => !['Lease Signed', 'Sale Completed', 'Rejected'].includes(l.stage),
  ).length
  const overduePayments = linked.payments.filter((p) => p.status === 'Overdue').length
  const [rejectNote, setRejectNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const verification = user.verification
  const docs = verification?.documents ?? []
  const decisionsEnabled = verificationDecisionsEnabled(docs)

  const openDocument = (documentKey: string) => {
    if (!verification) return
    onVerificationUpdated({
      ...verification,
      documents: markDocumentLookedAt(docs, documentKey, new Date().toISOString()),
    })
  }
  const profile = verification?.profile ?? {}
  // P0-landlord (R9): the review panel previously required an existing
  // verification object, so landlords CREATED by staff (no self-submitted
  // docs) were stuck "Pending review" with no Approve control anywhere —
  // and an unapproved landlord could not be used on leases. Staff-created
  // landlords/contractors are exactly the ones needing a one-click approval.
  const showReview = user.role === 'landlord' || user.role === 'contractor'

  const applyDecision = async (status: 'approved' | 'rejected') => {
    setError('')
    setBusy(true)
    try {
      const dto = await apiUpdateUserVerification({
        userId: user.id,
        status,
        rejectNote: status === 'rejected' ? rejectNote : undefined,
      })
      if (dto.verification) onVerificationUpdated(dto.verification)
      else {
        onVerificationUpdated({
          ...(verification ?? { status: 'pending' }),
          status,
          reviewedAt: new Date().toISOString(),
          rejectNote: status === 'rejected' ? rejectNote || 'Rejected' : undefined,
        })
      }
    } catch (err) {
      // Fallback: local store update when API unavailable (demo / offline)
      const next: UserVerification = {
        ...(verification ?? { status: 'pending' }),
        status,
        reviewedAt: new Date().toISOString(),
        rejectNote: status === 'rejected' ? rejectNote || 'Rejected' : undefined,
      }
      onVerificationUpdated(next)
      if (!(err instanceof Error && /fetch|network|Failed/i.test(err.message))) {
        setError(err instanceof Error ? err.message : 'Update failed')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
    <DetailStack columns={2}>
      <DetailSection title="Profile" subtitle="Identity and account status.">
        <FlatFieldGrid className="lg:grid-cols-2">
          <FlatField label="Name" value={user.name} />
          <FlatField label="Email" value={user.email} />
          <FlatField label="Phone" value={user.phone ?? '—'} />
          <FlatField label="ID / passport" value={maskIdNumber(user.idNumberOrPassport) || '—'} />
          <FlatField
            label="Date of birth"
            value={user.dateOfBirth ? formatDisplayDob(user.dateOfBirth) : '—'}
          />
          <FlatField label="Company" value={user.company ?? '—'} />
          <FlatField label="Role" value={roleLabels[user.role]} />
          <FlatField label="Agency" value={agencyName} />
          <FlatField label="Status" value={user.active ? 'Active' : 'Disabled'} />
          {mentorName ? <FlatField label="Mentor" value={mentorName} /> : null}
          {user.commissionSharePct != null ? (
            <FlatField label="Commission share" value={`${user.commissionSharePct}%`} />
          ) : null}
          {user.licenseStatus || user.role === 'ground_agent' || user.role === 'agent' ? (
            <FlatField
              label="License"
              value={user.licenseStatus ?? defaultLicenseStatus(user.role)}
            />
          ) : null}
        </FlatFieldGrid>
      </DetailSection>

      <DetailSection title="At a glance" subtitle="Counts from linked records.">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3">
          <Stat label="Properties" value={linked.properties.length} />
          <Stat label="Open leads" value={openLeads} />
          <Stat label="Applications" value={linked.applications.length} />
          <Stat label="Payments" value={linked.payments.length} />
          <Stat label="Tickets" value={linked.tickets.length} />
          {user.role === 'tenant' ? (
            <Stat label="Overdue" value={overduePayments} warn={overduePayments > 0} />
          ) : null}
        </dl>
      </DetailSection>
    </DetailStack>

      {showReview ? (
        <DetailSection
          title="Onboarding verification"
          subtitle="Documents submitted at registration."
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <VerificationStatusBadge user={user} />
              {verification?.submittedAt ? (
                <span className="text-xs text-ink-500">
                  Submitted {new Date(verification.submittedAt).toLocaleString()}
                </span>
              ) : null}
            </div>

            {Object.keys(profile).length > 0 ? (
              <FlatFieldGrid className="lg:grid-cols-2">
                {typeof profile.company === 'string' ? (
                  <FlatField label="Trading name" value={profile.company} />
                ) : null}
                {typeof profile.idNumberOrPassport === 'string' ? (
                  <FlatField label="ID / passport" value={maskIdNumber(profile.idNumberOrPassport)} />
                ) : null}
                {Array.isArray(profile.trades) ? (
                  <FlatField label="Trades" value={(profile.trades as string[]).join(', ')} />
                ) : null}
                {Array.isArray(profile.serviceAreas) ? (
                  <FlatField
                    label="Service areas"
                    value={(profile.serviceAreas as string[]).join(', ')}
                  />
                ) : null}
                {typeof profile.taxNumberOrTcsPin === 'string' ? (
                  <FlatField label="Tax / TCS PIN" value={profile.taxNumberOrTcsPin} />
                ) : null}
              </FlatFieldGrid>
            ) : null}

            {docs.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {docs.map((doc) => (
                  <li
                    key={doc.key}
                    className="flex items-center gap-3 rounded-xl border border-primary-100 bg-white px-3 py-2"
                  >
                    {doc.mimeType.startsWith('image/') ? (
                      <img
                        src={doc.dataUrl}
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover ring-1 ring-primary-100"
                      />
                    ) : (
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary ring-1 ring-primary-100">
                        <FileText className="h-5 w-5" strokeWidth={ICON_STROKE} aria-hidden />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{doc.label}</p>
                      <p className="truncate text-xs text-ink-500">{doc.name}</p>
                      <p className="text-xs text-ink-500">{documentOpenLabel(doc)}</p>
                    </div>
                    <a
                      href={doc.dataUrl}
                      download={doc.name}
                      className="text-xs font-semibold text-primary hover:underline"
                      onClick={() => openDocument(doc.key)}
                    >
                      Open
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">No documents attached.</p>
            )}

            {canReview && (verification?.status ?? 'pending') === 'pending' ? (
              <div className="space-y-3 border-t border-primary-100 pt-4">
                <label className="block text-sm font-medium text-ink">
                  Decline note (shown to the user if declined)
                  <Input
                    className="mt-1.5 min-h-11"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Optional reason shown to the user"
                  />
                </label>
                {error ? <p className="text-sm text-accent-700">{error}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="min-h-11 cursor-pointer"
                    disabled={busy || !decisionsEnabled}
                    onClick={() => void applyDecision('approved')}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 cursor-pointer"
                    disabled={busy || !decisionsEnabled}
                    onClick={() => void applyDecision('rejected')}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ) : null}

            {verification?.status === 'rejected' && verification.rejectNote ? (
              <p className="text-sm text-accent-800">Rejection note: {verification.rejectNote}</p>
            ) : null}
          </div>
        </DetailSection>
      ) : null}
    </div>
  )
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string
  value: number
  warn?: boolean
}) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-ink-400">{label}</dt>
      <dd
        className={cn(
          'mt-1 tabular font-display text-2xl font-semibold',
          warn ? 'text-accent' : 'text-ink',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function AccessTab({
  user,
  agency,
  agencies,
  mentors,
  mentorName,
  mutable,
  isPlatform,
  hasRolesAssign,
  canEditPermissions,
  assignableRoles,
  currentPerms,
  reducedMotion,
  onAssignRole,
  onUpdateProfile,
  onUpdatePermissions,
}: {
  user: AppUser
  agency: { enabledPermissions: Permission[] } | undefined
  agencies: Array<{ id: string; name: string }>
  mentors: AppUser[]
  mentorName: string | null
  mutable: boolean
  isPlatform: boolean
  hasRolesAssign: boolean
  canEditPermissions: boolean
  assignableRoles: Role[]
  currentPerms: Permission[]
  reducedMotion?: boolean
  onAssignRole: (userId: string, role: Role, agencyId?: string | null) => void
  onUpdateProfile: (
    patch: Partial<Pick<AppUser, 'mentorId' | 'commissionSharePct' | 'licenseStatus'>>,
  ) => void
  onUpdatePermissions: (enabledPermissions: Permission[]) => void
}) {
  const { role: granterRole, has } = useAuth()
  const grantable = grantablePermissions(user.role, {
    agencyEnabled: agency?.enabledPermissions,
    granterRole,
    granterPermissions: rolePermissions.super_admin.filter((p) => has(p)),
  })
  return (
    <div className="space-y-8">
      <DetailSection title="Role & agency" subtitle="What this person can do starts with their role.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-500">Role</label>
            <Select
              className="min-h-11 w-full cursor-pointer"
              value={user.role}
              disabled={!mutable || !hasRolesAssign}
              onChange={(e) => {
                const next = e.target.value as Role
                onAssignRole(
                  user.id,
                  next,
                  next === 'super_admin' ? null : user.agencyId,
                )
              }}
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
              {DEFERRED_ADMIN_ROLES.includes(user.role) &&
              !assignableRoles.includes(user.role) ? (
                <option value={user.role}>{roleLabels[user.role]}</option>
              ) : null}
            </Select>
          </div>
          {isPlatform && user.role !== 'super_admin' ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">Agency</label>
              <Select
                className="min-h-11 w-full cursor-pointer"
                value={user.agencyId ?? ''}
                disabled={!mutable}
                onChange={(e) =>
                  onAssignRole(user.id, user.role, e.target.value || null)
                }
              >
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <div>
              <p className="mb-1 text-xs font-medium text-ink-500">Agency</p>
              <p className="flex min-h-11 items-center text-sm text-ink">
                {user.role === 'super_admin'
                  ? 'Platform'
                  : agencies.find((a) => a.id === user.agencyId)?.name ?? '—'}
              </p>
            </div>
          )}
        </div>

        {(user.role === 'agent' || user.role === 'ground_agent') && mutable ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {user.role === 'agent' ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-500">Mentor</label>
                <Select
                  className="min-h-11 w-full cursor-pointer"
                  value={user.mentorId ?? ''}
                  onChange={(e) =>
                    onUpdateProfile({
                      mentorId: e.target.value || null,
                      licenseStatus: 'candidate',
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {mentors.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div>
                <p className="mb-1 text-xs font-medium text-ink-500">License</p>
                <p className="flex min-h-11 items-center text-sm text-ink">
                  {user.licenseStatus ?? defaultLicenseStatus(user.role)}
                  {mentorName ? ` · mentor ${mentorName}` : ''}
                </p>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-500">
                Commission share %
              </label>
              <Input
                type="number"
                min={0}
                max={100}
                className="min-h-11"
                value={user.commissionSharePct ?? ''}
                onChange={(e) =>
                  onUpdateProfile({
                    commissionSharePct: e.target.value
                      ? Math.min(100, Math.max(0, Number(e.target.value) || 0))
                      : undefined,
                  })
                }
              />
            </div>
          </div>
        ) : null}
      </DetailSection>

      {canEditPermissions && mutable && user.role !== 'super_admin' ? (
        <DetailSection
          title="Permissions"
          subtitle="Defaults come from the role. Only permissions this role can have, that the agency has switched on, are shown."
        >
          <AgencyCapabilityChecklist
            value={currentPerms}
            onChange={onUpdatePermissions}
            allowed={grantable}
            resetTo={userBasePermissions(user.role).filter((p) => grantable.includes(p))}
            className={cn(!reducedMotion && 'animate-fade-in')}
          />
        </DetailSection>
      ) : user.role === 'super_admin' ? (
        <Card className="p-5 text-sm text-ink-500">
          Super Admin has full platform access. Permissions are not edited per user.
        </Card>
      ) : null}
    </div>
  )
}

function LinkedTab({
  user,
  linked,
}: {
  user: AppUser
  linked: {
    properties: Array<{ id: string; title: string; status: string; city?: string }>
    leads: Array<{ id: string; name: string; stage: string; propertyId: string }>
    applications: Array<{
      id: string
      applicantName: string
      stage: string
      propertyId: string
    }>
    payments: Array<{
      id: string
      amount: number
      status: string
      dueDate: string
      type: string
    }>
    tickets: Array<{ id: string; title: string; status: string; priority: string }>
  }
}) {
  const empty =
    linked.properties.length +
      linked.leads.length +
      linked.applications.length +
      linked.payments.length +
      linked.tickets.length ===
    0

  if (empty) {
    return (
      <Card className="p-8 text-center text-sm text-ink-500">
        Nothing linked to {user.name} yet.
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <LinkedGroup
        icon={Building2}
        title="Properties"
        count={linked.properties.length}
        empty="No assigned properties."
      >
        {linked.properties.map((p) => (
          <LinkedRow
            key={p.id}
            to={`/workspace/properties/${p.id}`}
            title={p.title}
            meta={[p.status, p.city].filter(Boolean).join(' · ')}
          />
        ))}
      </LinkedGroup>

      <LinkedGroup
        icon={ClipboardList}
        title="Leads"
        count={linked.leads.length}
        empty="No leads."
      >
        {linked.leads.map((l) => (
          <LinkedRow
            key={l.id}
            to="/workspace/sales/crm"
            title={l.name}
            meta={l.stage}
          />
        ))}
      </LinkedGroup>

      <LinkedGroup
        icon={ClipboardList}
        title="Applications"
        count={linked.applications.length}
        empty="No applications."
      >
        {linked.applications.map((a) => (
          <LinkedRow
            key={a.id}
            to={`/workspace/sales/applications/${a.id}`}
            title={a.applicantName}
            meta={a.stage}
          />
        ))}
      </LinkedGroup>

      <LinkedGroup
        icon={CreditCard}
        title="Payments"
        count={linked.payments.length}
        empty="No payments."
      >
        {linked.payments.map((p) => (
          <LinkedRow
            key={p.id}
            to={`/workspace/operations/payments/${p.id}`}
            title={`${p.type} · ${formatZAR(p.amount)}`}
            meta={`Due ${p.dueDate}`}
            badgeTone={
              p.status === 'Overdue' ? 'danger' : p.status === 'Due' ? 'warning' : 'neutral'
            }
            badge={p.status}
          />
        ))}
      </LinkedGroup>

      <LinkedGroup
        icon={Wrench}
        title="Maintenance"
        count={linked.tickets.length}
        empty="No tickets."
      >
        {linked.tickets.map((t) => (
          <LinkedRow
            key={t.id}
            to={`/workspace/operations/maintenance/${t.id}`}
            title={t.title}
            meta={[t.status, t.priority].filter(Boolean).join(' · ')}
          />
        ))}
      </LinkedGroup>
    </div>
  )
}

function LinkedGroup({
  icon: Icon,
  title,
  count,
  empty,
  children,
}: {
  icon: typeof Building2
  title: string
  count: number
  empty: string
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        <span className="tabular text-sm text-ink-400">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-sm text-ink-500">{empty}</p>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-primary-50">{children}</ul>
        </Card>
      )}
    </section>
  )
}

function LinkedRow({
  to,
  title,
  meta,
  badge,
  badgeTone = 'neutral',
}: {
  to: string
  title: string
  meta: string
  badge?: string
  badgeTone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{title}</p>
          {meta ? <p className="truncate text-xs text-ink-500">{meta}</p> : null}
        </div>
        {badge ? <Badge tone={badgeTone}>{badge}</Badge> : null}
      </Link>
    </li>
  )
}
