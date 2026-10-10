import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../../context/AppStore'
import { useAgencyScope, useAuth } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { AgencyCapabilityChecklist } from '../../components/admin/AgencyCapabilityChecklist'
import {
  CreateWizardShell,
  type WizardStepMeta,
} from '../../components/admin/CreateWizardShell'
import { LiveUserPreview } from '../../components/wizard/LiveUserPreview'
import { DocUploadSlot } from '../../components/auth/DocUploadSlot'
import type { VerificationDocument } from '../../lib/verification'
import { previewNavLabels } from '../../components/layout/navigation'
import {
  AGENCY_HIERARCHY_ROLES,
  defaultLicenseStatus,
  mentorsForAgency,
  roleBlurbs,
  roleLabels,
  rolePermissions,
  roleScopes,
  userBasePermissions,
} from '../../lib/permissions'
import { readReturnTo } from '../../lib/returnTo'
import { formatDisplayDob, parseIdentityDocument } from '../../lib/saId'
import { formatZAR } from '../../data/seed'
import { Badge, Button, Input, Select, cn } from '../../components/ui'
import { TempPasswordModal } from '../../components/admin/ResetPasswordButton'
import { MIN_PASSWORD_LENGTH } from '../../lib/auth/passwordPolicy'
import type { Agency, Permission, Role } from '../../types/domain'

const ALL_ROLES: Role[] = [
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
  'landlord',
  'tenant',
  'contractor',
]

const AGENCY_ADMIN_CREATABLE: Role[] = [
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
  'landlord',
  'tenant',
  'contractor',
]

const TEAM_ROLES: Role[] = [
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'agent',
]

const OTHER_ROLES: Role[] = ['landlord', 'tenant', 'contractor', 'super_admin']

type StepId = 'personal' | 'contact' | 'compliance' | 'role' | 'setup' | 'review'

const USER_DRAFT_KEY = 'propertyflow:user-create'

function needsComplianceStep(role: Role) {
  return role === 'landlord' || role === 'contractor'
}

function clampToAgency(role: Role, agency: Agency | undefined): Permission[] {
  const base = userBasePermissions(role)
  if (!agency?.enabledPermissions?.length) return [...base]
  const allowed = new Set(agency.enabledPermissions)
  return base.filter((p) => allowed.has(p))
}

function defaultCommission(role: Role) {
  if (role === 'ground_agent') return '70'
  if (role === 'agent') return '50'
  return ''
}

function needsSetupStep(role: Role) {
  return role !== 'super_admin'
}

function fullDisplayName(first: string, last: string): string {
  return `${first.trim()} ${last.trim()}`.trim()
}

export default function AdminUserCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { state, createUserDurable, updateProperty, updateTenancy, notify } = useStore()
  const { has, user: authUser } = useAuth()
  const { agencyId: scopeAgencyId } = useAgencyScope()
  const isPlatform = has('platform.manage')
  /** Agency admins can add team members only — not full Users/portal create. */
  const teamOnly = has('users.manage') && !has('roles.assign') && !isPlatform
  const intentLandlord = searchParams.get('intent') === 'landlord'
  const intentContractor = searchParams.get('intent') === 'contractor'
  const intentTeam = (searchParams.get('intent') === 'team' || teamOnly) && !intentLandlord && !intentContractor
  const returnTo =
    readReturnTo(searchParams) ??
    (intentLandlord
      ? '/workspace/people/landlords'
      : intentContractor
        ? '/workspace/operations/contractors'
        : intentTeam
          ? '/workspace/people/staff'
          : '/workspace/admin/users')

  const baseCreatable = isPlatform ? ALL_ROLES : AGENCY_ADMIN_CREATABLE
  const creatableRoles = intentLandlord
    ? (['landlord'] as Role[]).filter((r) => baseCreatable.includes(r) || isPlatform)
    : intentContractor
      ? (['contractor'] as Role[]).filter((r) => baseCreatable.includes(r) || isPlatform)
      : intentTeam
        ? TEAM_ROLES.filter((r) => baseCreatable.includes(r) || (r === 'super_admin' && isPlatform))
        : baseCreatable

  const queryAgencyId = searchParams.get('agencyId')
  const lockAgency = Boolean(queryAgencyId) || !isPlatform

  const agencies = useMemo(() => {
    if (isPlatform && !queryAgencyId) return state.agencies
    const locked = queryAgencyId ?? scopeAgencyId
    return state.agencies.filter((a) => a.id === locked)
  }, [isPlatform, queryAgencyId, scopeAgencyId, state.agencies])

  const defaultAgencyId = queryAgencyId ?? scopeAgencyId ?? state.agencies[0]?.id ?? ''

  const [stepId, setStepId] = useState<StepId>(() => {
    try {
      const raw = sessionStorage.getItem(`${USER_DRAFT_KEY}:step`)
      if (raw === 'personal' || raw === 'contact' || raw === 'compliance' || raw === 'role' || raw === 'setup' || raw === 'review') {
        return raw
      }
    } catch {
      /* ignore */
    }
    return 'personal'
  })
  const [furthestIndex, setFurthestIndex] = useState(0)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [addressCity, setAddressCity] = useState('')
  const [addressProvince, setAddressProvince] = useState('Eastern Cape')
  const [idNumberOrPassport, setIdNumberOrPassport] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [dobFromId, setDobFromId] = useState(false)
  const [company, setCompany] = useState('')
  const [complianceDocs, setComplianceDocs] = useState<Record<string, VerificationDocument | null>>({})
  const [role, setRole] = useState<Role>(() =>
    searchParams.get('intent') === 'landlord'
      ? 'landlord'
      : searchParams.get('intent') === 'contractor'
        ? 'contractor'
        : creatableRoles.includes('ground_agent')
          ? 'ground_agent'
          : creatableRoles[0] ?? 'landlord',
  )
  const [agencyId, setAgencyId] = useState(defaultAgencyId)
  const [mentorId, setMentorId] = useState('')
  const [commissionSharePct, setCommissionSharePct] = useState(defaultCommission('ground_agent'))
  const [tenancyId, setTenancyId] = useState('')
  const [propertyIds, setPropertyIds] = useState<string[]>([])
  const [perms, setPerms] = useState<Permission[]>([])
  const [sendInvite, setSendInvite] = useState(true)
  const [tempPassword, setTempPassword] = useState('')
  /** Jim B2: generated temp password, held only while the one-time modal is open. */
  const [shownTempPassword, setShownTempPassword] = useState<string | null>(null)
  const [afterTempPath, setAfterTempPath] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const selectedAgencyId = lockAgency ? defaultAgencyId : agencyId
  const selectedAgency = useMemo(
    () =>
      agencies.find((a) => a.id === selectedAgencyId) ??
      state.agencies.find((a) => a.id === selectedAgencyId),
    [agencies, selectedAgencyId, state.agencies],
  )

  const mentors = useMemo(
    () => mentorsForAgency(state.users, selectedAgencyId),
    [state.users, selectedAgencyId],
  )

  const linkableTenancies = useMemo(
    () =>
      state.tenancies.filter(
        (t) =>
          t.agencyId === selectedAgencyId &&
          (!t.tenantUserId || t.tenantEmail.toLowerCase() === email.trim().toLowerCase()),
      ),
    [state.tenancies, selectedAgencyId, email],
  )

  const linkableProperties = useMemo(
    () => state.properties.filter((p) => p.agencyId === selectedAgencyId),
    [state.properties, selectedAgencyId],
  )

  const needsMentor = role === 'agent'
  const needsCommission = role === 'ground_agent' || role === 'agent'

  const wizardSteps: WizardStepMeta[] = useMemo(() => {
    const personal: WizardStepMeta = {
      id: 'personal',
      label: 'Personal',
      tip: 'Legal name, ID or passport, and date of birth.',
    }
    const contact: WizardStepMeta = {
      id: 'contact',
      label: 'Contact',
      tip: 'Email, phone, and physical address for compliance records.',
    }
    const compliance: WizardStepMeta = {
      id: 'compliance',
      label: 'Compliance',
      tip: 'Optional verification documents for landlords and contractors.',
    }
    const roleStep: WizardStepMeta = {
      id: 'role',
      label: 'Role',
      tip: intentTeam
        ? 'Pick a staff role pack. You can fine-tune permissions on the next step.'
        : 'Pick a fixed role pack. Permissions load next — edit them before you create.',
    }
    const setup: WizardStepMeta = {
      id: 'setup',
      label: 'Setup',
      tip:
        role === 'tenant'
          ? 'Link a lease if you have one, then adjust permissions for this tenant.'
          : role === 'landlord'
            ? 'Link properties they own, then adjust permissions before inviting them.'
            : role === 'agent' || role === 'ground_agent'
              ? 'Set mentorship and commission, then edit their permission pack.'
              : 'Edit the permission pack for this role, then continue to review and invite.',
    }
    const review: WizardStepMeta = {
      id: 'review',
      label: 'Review',
      tip: 'Confirm details and send a simulated invitation email to their inbox.',
    }
    const tail = intentLandlord
      ? needsSetupStep(role)
        ? [setup, review]
        : [review]
      : needsSetupStep(role)
        ? [roleStep, setup, review]
        : [roleStep, review]
    return needsComplianceStep(role)
      ? [personal, contact, compliance, ...tail]
      : [personal, contact, ...tail]
  }, [intentLandlord, intentTeam, role])

  const stepIndex = Math.max(
    0,
    wizardSteps.findIndex((s) => s.id === stepId),
  )

  const allowedForChecklist = useMemo(() => {
    if (role === 'super_admin') return rolePermissions.super_admin
    return selectedAgency?.enabledPermissions?.length
      ? selectedAgency.enabledPermissions
      : undefined
  }, [role, selectedAgency])

  const effectivePerms = useMemo(() => {
    if (role === 'super_admin') return rolePermissions.super_admin
    return perms.length ? perms : clampToAgency(role, selectedAgency)
  }, [role, perms, selectedAgency])

  const sidebarPreview = useMemo(() => previewNavLabels(effectivePerms), [effectivePerms])

  const idParse = useMemo(
    () => parseIdentityDocument(idNumberOrPassport),
    [idNumberOrPassport],
  )

  const onIdChange = (value: string) => {
    setIdNumberOrPassport(value)
    const parsed = parseIdentityDocument(value)
    if (parsed.kind === 'sa_id' && parsed.valid) {
      setDateOfBirth(parsed.dateOfBirth)
      setDobFromId(true)
    } else if (parsed.kind === 'empty') {
      setDateOfBirth('')
      setDobFromId(false)
    } else if (dobFromId) {
      // Cleared derived DOB when leaving a valid SA ID
      setDateOfBirth('')
      setDobFromId(false)
    }
  }

  const hierarchyRoles = AGENCY_HIERARCHY_ROLES.filter((r) => creatableRoles.includes(r))
  const otherRoles = OTHER_ROLES.filter((r) => creatableRoles.includes(r))

  useEffect(() => {
    setAgencyId(defaultAgencyId)
  }, [defaultAgencyId])

  useEffect(() => {
    try {
      sessionStorage.setItem(`${USER_DRAFT_KEY}:step`, stepId)
    } catch {
      /* ignore */
    }
  }, [stepId])

  useEffect(() => {
    try {
      sessionStorage.setItem(
        `${USER_DRAFT_KEY}:draft`,
        JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          streetAddress,
          addressCity,
          addressProvince,
          idNumberOrPassport,
          dateOfBirth,
          company,
          role,
          agencyId,
        }),
      )
    } catch {
      /* ignore */
    }
  }, [
    firstName,
    lastName,
    email,
    phone,
    streetAddress,
    addressCity,
    addressProvince,
    idNumberOrPassport,
    dateOfBirth,
    company,
    role,
    agencyId,
  ])

  useEffect(() => {
    if (!creatableRoles.includes(role)) {
      setRole(creatableRoles.includes('ground_agent') ? 'ground_agent' : creatableRoles[0])
    }
  }, [creatableRoles, role])

  useEffect(() => {
    if (role === 'super_admin') {
      setPerms([...rolePermissions.super_admin])
      setCommissionSharePct('')
      setMentorId('')
      setTenancyId('')
      setPropertyIds([])
      return
    }
    setPerms(clampToAgency(role, selectedAgency))
    setCommissionSharePct(defaultCommission(role))
    if (role !== 'agent') setMentorId('')
    if (role !== 'tenant') setTenancyId('')
    if (role !== 'landlord') setPropertyIds([])
  }, [role, selectedAgency])

  useEffect(() => {
    if (stepId === 'setup' && !needsSetupStep(role)) {
      setStepId('review')
      setFurthestIndex((f) => Math.max(f, 2))
    }
  }, [role, stepId])

  useEffect(() => {
    setFurthestIndex((f) => Math.min(f, Math.max(0, wizardSteps.length - 1)))
  }, [wizardSteps.length])

  const goNext = () => {
    const order = wizardSteps.map((s) => s.id as StepId)
    const i = order.indexOf(stepId)
    if (i < order.length - 1) {
      const next = i + 1
      setFurthestIndex((f) => Math.max(f, next))
      setStepId(order[next])
    }
  }

  const goBack = () => {
    const order = wizardSteps.map((s) => s.id as StepId)
    const i = order.indexOf(stepId)
    if (i <= 0) navigate(returnTo)
    else setStepId(order[i - 1])
  }

  const goToStep = (index: number) => {
    if (index < 0 || index > furthestIndex) return
    const next = wizardSteps[index]
    if (!next) return
    setError('')
    setStepId(next.id as StepId)
  }

  const finish = async () => {
    if (submitting) return
    const agency = state.agencies.find((a) => a.id === selectedAgencyId)
    const allowed = agency?.enabledPermissions?.length
      ? new Set(agency.enabledPermissions)
      : null
    const enabledPermissions = allowed
      ? effectivePerms.filter((p) => allowed.has(p))
      : effectivePerms
    const commission =
      needsCommission && commissionSharePct
        ? Math.min(100, Math.max(0, Number(commissionSharePct) || 0))
        : undefined

    const plainTemp = tempPassword.trim()
    if (plainTemp && plainTemp.length < MIN_PASSWORD_LENGTH) {
      setError(`A temporary password needs at least ${MIN_PASSWORD_LENGTH} characters, or leave it blank to generate one.`)
      return
    }
    setSubmitting(true)
    setError('')
    const result = await createUserDurable({
      name: fullDisplayName(firstName, lastName),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      idNumberOrPassport:
        idNumberOrPassport.trim()
          ? parseIdentityDocument(idNumberOrPassport).normalized || idNumberOrPassport.trim()
          : undefined,
      dateOfBirth: dateOfBirth.trim() || undefined,
      company: company.trim() || undefined,
      role,
      agencyId: role === 'super_admin' ? null : selectedAgencyId,
      enabledPermissions: role === 'super_admin' ? undefined : enabledPermissions,
      mentorId: needsMentor ? mentorId : null,
      licenseStatus: defaultLicenseStatus(role),
      commissionSharePct: commission,
      active: true,
      ...(plainTemp ? { tempPassword: plainTemp } : {}),
      verification: needsComplianceStep(role)
        ? {
            status: 'pending',
            submittedAt: new Date().toISOString(),
            profile: {
              streetAddress: streetAddress.trim() || undefined,
              city: addressCity.trim() || undefined,
              province: addressProvince.trim() || undefined,
            },
            documents: Object.values(complianceDocs).filter(
              (d): d is VerificationDocument => d != null,
            ),
          }
        : undefined,
    })

    if (result.ok === false) {
      setSubmitting(false)
      setError(result.error || 'User could not be created.')
      return
    }

    const created = result.user

    if (role === 'tenant' && tenancyId) {
      updateTenancy(tenancyId, {
        tenantUserId: created.id,
        tenantName: created.name,
        tenantEmail: created.email,
      })
    }

    if (role === 'landlord' && propertyIds.length) {
      for (const pid of propertyIds) {
        updateProperty(pid, { landlordId: created.id })
      }
    }

    // Success notify ONLY after durable Auth+profile write verified.
    if (sendInvite) {
      const agencyLabel =
        role === 'super_admin' ? 'PropertyFlow' : selectedAgency?.name ?? 'your agency'
      notify({
        userId: created.id,
        agencyId: created.agencyId,
        title: 'You’re invited to PropertyFlow',
        body: `Hi ${created.name}, ${authUser.name} invited you to join ${agencyLabel} as ${roleLabels[created.role]}. Sign in at /login with your email and the temporary password you were given.`,
        link: '/login',
        silent: true,
      })
    }

    try {
      sessionStorage.removeItem(`${USER_DRAFT_KEY}:draft`)
      sessionStorage.removeItem(`${USER_DRAFT_KEY}:step`)
    } catch {
      /* ignore */
    }
    const nextPath = `/workspace/admin/users/${created.id}?tab=access`
    if (result.generatedTempPassword) {
      // Shown once; navigation waits until the modal is closed.
      setSubmitting(false)
      setAfterTempPath(nextPath)
      setShownTempPassword(result.generatedTempPassword)
      return
    }
    navigate(nextPath)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()

    if (stepId === 'personal') {
      if (!firstName.trim()) {
        setError('First name is required.')
        return
      }
      if (!lastName.trim()) {
        setError('Surname is required.')
        return
      }
      const idResult = parseIdentityDocument(idNumberOrPassport)
      if (!idResult.valid) {
        setError('error' in idResult ? idResult.error : 'Invalid ID or passport.')
        return
      }
      if (idResult.kind === 'sa_id' && idResult.valid) {
        setIdNumberOrPassport(idResult.normalized)
        setDateOfBirth(idResult.dateOfBirth)
        setDobFromId(true)
      } else if (idResult.kind === 'passport') {
        setIdNumberOrPassport(idResult.normalized)
      }
      setError('')
      goNext()
      return
    }

    if (stepId === 'contact') {
      if (!email.trim()) {
        setError('Email is required.')
        return
      }
      setError('')
      goNext()
      return
    }

    if (stepId === 'compliance') {
      setError('')
      goNext()
      return
    }

    if (stepId === 'role') {
      if (role !== 'super_admin' && !selectedAgencyId) {
        setError('Select an agency.')
        return
      }
      setError('')
      goNext()
      return
    }

    if (stepId === 'setup') {
      if (needsMentor && !mentorId) {
        setError('Candidate agents must be linked to a mentor (Principal or Full Agent).')
        return
      }
      setError('')
      goNext()
      return
    }

    void finish()
  }

  const pageTitle = intentLandlord
    ? 'Add landlord'
    : intentContractor
      ? 'Add contractor'
      : intentTeam
        ? 'Add team member'
        : 'Add user'
  const pageSubtitle =
    stepId === 'personal'
      ? 'Who are you adding?'
      : stepId === 'contact'
        ? 'How can they be reached?'
        : stepId === 'compliance'
          ? 'Optional verification documents.'
          : stepId === 'role'
        ? 'What should they be able to do?'
        : stepId === 'setup'
          ? 'Finish role-specific setup.'
          : 'Confirm and create.'

  const roleAside =
    stepId === 'role' || stepId === 'setup' || stepId === 'review' ? (
      <div className="mt-3 border-t border-primary-100 pt-3">
        <p className="text-sm font-semibold text-ink">{roleLabels[role]}</p>
        <p className="mt-0.5 text-xs font-medium text-primary">{roleScopes[role]}</p>
        <p className="mt-1 text-xs leading-snug text-ink-500">{roleBlurbs[role]}</p>
      </div>
    ) : null

  return (
    <RequirePermission anyOf={['users.manage', 'roles.assign']}>
      <div className="animate-fade-in space-y-4">
        <div className="flex justify-end">
          <Link to={returnTo}>
            <Button type="button" variant="secondary" className="min-h-11 cursor-pointer">
              Cancel
            </Button>
          </Link>
        </div>

        <CreateWizardShell
          title={pageTitle}
          subtitle={pageSubtitle}
          steps={wizardSteps}
          stepIndex={stepIndex}
          maxReachableIndex={furthestIndex}
          onStepSelect={goToStep}
          aside={roleAside}
          preview={
            <LiveUserPreview
              name={fullDisplayName(firstName, lastName)}
              email={email}
              phone={phone}
              role={role}
              agencyName={selectedAgency?.name}
              permissionCount={effectivePerms.length}
              addressLine={streetAddress}
              city={addressCity}
            />
          }
          footer={
            <>
              {stepIndex > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 cursor-pointer"
                  onClick={goBack}
                >
                  Back
                </Button>
              ) : null}
              <Button
                type="submit"
                form="add-user-form"
                className="min-h-11 cursor-pointer"
                disabled={submitting && stepId === 'review'}
              >
                {stepId === 'review'
                  ? submitting
                    ? 'Creating…'
                    : 'Create user'
                  : 'Continue'}
              </Button>
            </>
          }
        >
          <form id="add-user-form" className="space-y-5" onSubmit={submit}>
            {error ? (
              <p role="alert" className="rounded-xl bg-accent-50 px-3 py-2 text-sm text-accent-700">
                {error}
              </p>
            ) : null}

            {stepId === 'personal' ? (
              <section className="space-y-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">Personal details</h2>
                  <p className="mt-1 text-sm text-ink-500">Legal identity — contact details come next.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="First name" htmlFor="user-first-name">
                    <Input
                      id="user-first-name"
                      className="min-h-11"
                      placeholder="e.g. Thandi"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      autoComplete="given-name"
                    />
                  </Field>
                  <Field label="Surname" htmlFor="user-last-name">
                    <Input
                      id="user-last-name"
                      className="min-h-11"
                      placeholder="e.g. Nkosi"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      autoComplete="family-name"
                    />
                  </Field>
                  <Field label="ID or passport" htmlFor="user-id" className="sm:col-span-2">
                    <Input
                      id="user-id"
                      className="min-h-11"
                      placeholder="13-digit SA ID or passport"
                      value={idNumberOrPassport}
                      onChange={(e) => onIdChange(e.target.value)}
                      inputMode="text"
                      autoComplete="off"
                    />
                    {idParse.kind === 'sa_id' && idParse.valid === false && idNumberOrPassport.trim() ? (
                      <p className="mt-1 text-xs text-accent-700">{idParse.error}</p>
                    ) : null}
                    {idParse.kind === 'sa_id' && idParse.valid ? (
                      <p className="mt-1 text-xs text-ink-500">
                        Valid SA ID — date of birth filled from the number
                        {idParse.citizen ? '' : ' · non-citizen'}.
                      </p>
                    ) : null}
                    {idParse.kind === 'passport' ? (
                      <p className="mt-1 text-xs text-ink-500">
                        Treated as passport — enter date of birth below if known.
                      </p>
                    ) : null}
                  </Field>
                  <Field label="Date of birth" htmlFor="user-dob">
                    <Input
                      id="user-dob"
                      className="min-h-11"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => {
                        setDateOfBirth(e.target.value)
                        setDobFromId(false)
                      }}
                      max={new Date().toISOString().slice(0, 10)}
                      readOnly={dobFromId && idParse.kind === 'sa_id' && idParse.valid}
                      aria-describedby="user-dob-hint"
                    />
                    <p id="user-dob-hint" className="mt-1 text-xs text-ink-500">
                      {dobFromId && idParse.kind === 'sa_id' && idParse.valid
                        ? `From ID: ${formatDisplayDob(dateOfBirth)}. Clear the ID to edit manually.`
                        : 'Required when using a passport if you know it; auto-filled from a valid SA ID.'}
                    </p>
                  </Field>
                  <Field label="Company (optional)" htmlFor="user-company" className="sm:col-span-2">
                    <Input
                      id="user-company"
                      className="min-h-11"
                      placeholder="Employer, trading name, or brokerage"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    />
                  </Field>
                </div>
              </section>
            ) : null}

            {stepId === 'contact' ? (
              <section className="space-y-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">Contact & address</h2>
                  <p className="mt-1 text-sm text-ink-500">Email, phone, and physical address.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Email" htmlFor="user-email">
                    <Input
                      id="user-email"
                      className="min-h-11"
                      type="email"
                      placeholder="name@agency.co.za"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Phone" htmlFor="user-phone">
                    <Input
                      id="user-phone"
                      className="min-h-11"
                      type="tel"
                      placeholder="+27 …"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                    />
                  </Field>
                  <Field label="Street address" htmlFor="user-street" className="sm:col-span-2">
                    <Input
                      id="user-street"
                      className="min-h-11"
                      placeholder="Street and number"
                      value={streetAddress}
                      onChange={(e) => setStreetAddress(e.target.value)}
                      autoComplete="street-address"
                    />
                  </Field>
                  <Field label="City" htmlFor="user-city">
                    <Input
                      id="user-city"
                      className="min-h-11"
                      value={addressCity}
                      onChange={(e) => setAddressCity(e.target.value)}
                    />
                  </Field>
                  <Field label="Province" htmlFor="user-province">
                    <Input
                      id="user-province"
                      className="min-h-11"
                      value={addressProvince}
                      onChange={(e) => setAddressProvince(e.target.value)}
                    />
                  </Field>
                </div>
              </section>
            ) : null}

            {stepId === 'compliance' ? (
              <section className="space-y-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">Compliance documents</h2>
                  <p className="mt-1 text-sm text-ink-500">
                    Optional uploads for {roleLabels[role].toLowerCase()} verification — can be added later.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <DocUploadSlot
                    docKey="id_document"
                    label="ID document"
                    value={complianceDocs.id_document ?? null}
                    onChange={(doc) => setComplianceDocs((d) => ({ ...d, id_document: doc }))}
                  />
                  <DocUploadSlot
                    docKey="proof_of_address"
                    label="Proof of address"
                    value={complianceDocs.proof_of_address ?? null}
                    onChange={(doc) => setComplianceDocs((d) => ({ ...d, proof_of_address: doc }))}
                  />
                </div>
              </section>
            ) : null}

            {stepId === 'role' ? (
              <section className="space-y-5">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">Choose a role</h2>
                  <p className="mt-1 text-sm text-ink-500">
                    Roles are fixed packs
                    {intentTeam ? ' for your team' : ''}. Pick one below — you can fine-tune
                    permissions on the next step.
                  </p>
                </div>

                {hierarchyRoles.length > 0 ? (
                  <RoleGroup title="Agency hierarchy" subtitle="Top-down responsibility inside the brokerage.">
                    {hierarchyRoles.map((r, i) => (
                      <RoleRow
                        key={r}
                        role={r}
                        selected={role === r}
                        index={i + 1}
                        onSelect={() => setRole(r)}
                      />
                    ))}
                  </RoleGroup>
                ) : null}

                {!intentTeam && otherRoles.length > 0 ? (
                  <RoleGroup title="Other accounts" subtitle="Owners, tenants, contractors, and platform.">
                    {otherRoles.map((r) => (
                      <RoleRow key={r} role={r} selected={role === r} onSelect={() => setRole(r)} />
                    ))}
                  </RoleGroup>
                ) : null}

                {intentTeam && creatableRoles.includes('super_admin') ? (
                  <RoleGroup title="Platform" subtitle="Cross-agency access.">
                    <RoleRow
                      role="super_admin"
                      selected={role === 'super_admin'}
                      onSelect={() => setRole('super_admin')}
                    />
                  </RoleGroup>
                ) : null}

                {role !== 'super_admin' ? (
                  <Field label="Agency" htmlFor="user-agency">
                    <Select
                      id="user-agency"
                      className="min-h-11 cursor-pointer"
                      value={agencyId}
                      onChange={(e) => setAgencyId(e.target.value)}
                      disabled={lockAgency}
                      aria-label="Agency"
                    >
                      {(agencies.length ? agencies : state.agencies).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <p className="rounded-lg border border-primary-100 bg-primary-50/50 px-4 py-3 text-sm text-ink-600">
                    Super Admin is not tied to an agency and receives full platform access.
                  </p>
                )}
              </section>
            ) : null}

            {stepId === 'setup' && needsSetupStep(role) ? (
              <section className="space-y-5">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">
                    {roleLabels[role]} setup
                  </h2>
                  <p className="mt-1 text-sm text-ink-500">
                    Role-specific links and settings. You can skip optional links and finish later.
                  </p>
                </div>

                {(role === 'agent' || role === 'ground_agent') && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {needsMentor ? (
                      <Field label="Mentor" htmlFor="user-mentor">
                        <Select
                          id="user-mentor"
                          className="min-h-11 cursor-pointer"
                          value={mentorId}
                          onChange={(e) => setMentorId(e.target.value)}
                          required
                        >
                          <option value="">Select mentor (Principal or Full Agent)</option>
                          {mentors.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} · {roleLabels[m.role]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : (
                      <div className="rounded-lg border border-primary-100 bg-primary-50/40 px-4 py-3 text-sm text-ink-600 sm:col-span-1">
                        License: {defaultLicenseStatus(role)} — no mentor required for Full Agents.
                      </div>
                    )}
                    {needsCommission ? (
                      <Field label="Commission share %" htmlFor="user-commission">
                        <Input
                          id="user-commission"
                          className="min-h-11"
                          type="number"
                          min={0}
                          max={100}
                          value={commissionSharePct}
                          onChange={(e) => setCommissionSharePct(e.target.value)}
                        />
                      </Field>
                    ) : null}
                  </div>
                )}

                {role === 'tenant' ? (
                  <div className="space-y-3">
                    <Field label="Link existing lease (optional)" htmlFor="user-tenancy">
                      <Select
                        id="user-tenancy"
                        className="min-h-11 cursor-pointer"
                        value={tenancyId}
                        onChange={(e) => setTenancyId(e.target.value)}
                      >
                        <option value="">Skip — link later</option>
                        {linkableTenancies.map((t) => {
                          const prop = state.properties.find((p) => p.id === t.propertyId)
                          return (
                            <option key={t.id} value={t.id}>
                              {t.tenantName} · {prop?.title ?? t.propertyId} · {t.status}
                            </option>
                          )
                        })}
                      </Select>
                    </Field>
                    {linkableTenancies.length === 0 ? (
                      <p className="text-sm text-ink-500">
                        No unlinked leases in this agency. Create the user now and attach a tenancy
                        from the Tenants directory later.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {role === 'landlord' ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-ink-500">
                      Properties they own (optional)
                    </p>
                    {linkableProperties.length === 0 ? (
                      <p className="text-sm text-ink-500">
                        No properties in this agency yet. You can assign ownership later.
                      </p>
                    ) : (
                      <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-primary-100 p-2">
                        {linkableProperties.map((p) => {
                          const checked = propertyIds.includes(p.id)
                          return (
                            <li key={p.id}>
                              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 hover:bg-primary-50/60">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 accent-[var(--color-primary,#1d4ed8)]"
                                  checked={checked}
                                  onChange={() =>
                                    setPropertyIds((ids) =>
                                      checked ? ids.filter((x) => x !== p.id) : [...ids, p.id],
                                    )
                                  }
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm font-medium text-ink">{p.title}</span>
                                  <span className="block text-xs text-ink-500">
                                    {p.suburb}, {p.city}
                                    {p.rent ? ` · ${formatZAR(p.rent)}/mo` : ''}
                                  </span>
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    <p className="text-xs text-ink-500">
                      Leave unchecked to skip — you can set landlord on each property later.
                    </p>
                  </div>
                ) : null}

                <div className="space-y-3 border-t border-primary-100 pt-5">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">Permissions</h3>
                      <p className="mt-1 text-xs text-ink-500">
                        Pre-filled from {roleLabels[role]}
                        {selectedAgency ? ` · clamped to ${selectedAgency.name}` : ''}. Edit now —
                        you can still change them later on Access.
                      </p>
                    </div>
                    <AgencyCapabilityChecklist
                      value={perms}
                      onChange={setPerms}
                      allowed={allowedForChecklist}
                      resetTo={clampToAgency(role, selectedAgency)}
                    />
                    <div className="rounded-lg border border-primary-100 bg-primary-50/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                        Sidebar preview
                      </p>
                      {sidebarPreview.length === 0 ? (
                        <p className="mt-2 text-sm text-ink-500">No workspace links yet.</p>
                      ) : (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {sidebarPreview.map((label) => (
                            <li key={label}>
                              <Badge tone="neutral">{label}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
              </section>
            ) : null}

            {stepId === 'review' ? (
              <section className="space-y-5">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">Review & create</h2>
                  <p className="mt-1 text-sm text-ink-500">
                    Confirm details
                    {role !== 'super_admin'
                      ? ` · ${effectivePerms.length} permissions selected`
                      : ' · full platform access'}
                    .
                  </p>
                </div>

                <dl className="grid gap-4 sm:grid-cols-2">
                  <ReviewItem label="First name" value={firstName.trim()} />
                  <ReviewItem label="Surname" value={lastName.trim()} />
                  <ReviewItem label="Email" value={email.trim()} />
                  <ReviewItem label="Phone" value={phone.trim() || '—'} />
                  <ReviewItem label="ID / passport" value={idNumberOrPassport.trim() || '—'} />
                  <ReviewItem
                    label="Date of birth"
                    value={dateOfBirth.trim() ? formatDisplayDob(dateOfBirth.trim()) : '—'}
                  />
                  <ReviewItem label="Company" value={company.trim() || '—'} />
                  <ReviewItem label="Role" value={roleLabels[role]} />
                  <ReviewItem
                    label="Agency"
                    value={
                      role === 'super_admin' ? 'Platform' : selectedAgency?.name ?? '—'
                    }
                  />
                  {needsMentor ? (
                    <ReviewItem
                      label="Mentor"
                      value={mentors.find((m) => m.id === mentorId)?.name ?? '—'}
                    />
                  ) : null}
                  {needsCommission ? (
                    <ReviewItem
                      label="Commission"
                      value={commissionSharePct ? `${commissionSharePct}%` : '—'}
                    />
                  ) : null}
                  {role === 'tenant' ? (
                    <ReviewItem
                      label="Lease"
                      value={
                        tenancyId
                          ? linkableTenancies.find((t) => t.id === tenancyId)?.tenantName ??
                            'Linked'
                          : 'Skip — link later'
                      }
                    />
                  ) : null}
                  {role === 'landlord' ? (
                    <ReviewItem
                      label="Properties"
                      value={
                        propertyIds.length
                          ? `${propertyIds.length} selected`
                          : 'Skip — assign later'
                      }
                    />
                  ) : null}
                  <ReviewItem label="Permissions" value={`${effectivePerms.length} enabled`} />
                </dl>

                <div className="rounded-lg border border-primary-100 bg-primary-50/40 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                    Sidebar views
                  </p>
                  {sidebarPreview.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-500">No workspace links for this pack.</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {sidebarPreview.map((label) => (
                        <li key={label}>
                          <Badge tone="neutral">{label}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Field label="Temporary password" htmlFor="temp-password">
                  <Input
                    id="temp-password"
                    type="text"
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="mt-1 text-xs text-ink-500">
                    Leave blank to generate a random one, shown to you once after the user is created. A typed password needs at least {MIN_PASSWORD_LENGTH} characters. The user must change it at first sign-in.
                  </p>
                </Field>

                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-primary-100 bg-white px-3 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={sendInvite}
                    onChange={(e) => setSendInvite(e.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">
                      Send the user an in-app invite
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-500">
                      Sends the new user an in-app invite to sign in. The temporary password is never put in a notification: a generated one is shown to you once, in a pop-up, after the user is created. Email delivery is deferred.
                    </span>
                  </span>
                </label>
              </section>
            ) : null}
          </form>
        </CreateWizardShell>
        <TempPasswordModal
          title="User created: temporary password"
          tempPassword={shownTempPassword}
          onClose={() => {
            setShownTempPassword(null)
            if (afterTempPath) navigate(afterTempPath)
          }}
        />
      </div>
    </RequirePermission>
  )
}

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-ink-500">
        {label}
      </label>
      {children}
    </div>
  )
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink">{value}</dd>
    </div>
  )
}

function RoleGroup({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>
      <div className="mt-3 space-y-1.5" role="radiogroup" aria-label={title}>
        {children}
      </div>
    </div>
  )
}

function RoleRow({
  role,
  selected,
  index,
  onSelect,
}: {
  role: Role
  selected: boolean
  index?: number
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md border-l-2 px-3 py-2.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        selected
          ? 'border-l-primary bg-primary-50 font-semibold text-ink'
          : 'border-l-transparent hover:bg-primary-50/50',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {index != null ? (
            <span className="tabular text-xs font-medium text-ink-400">{index}.</span>
          ) : null}
          <span className="text-sm font-semibold text-ink">{roleLabels[role]}</span>
          <span className="text-xs font-normal text-ink-400">{roleScopes[role]}</span>
        </span>
      </span>
    </button>
  )
}
