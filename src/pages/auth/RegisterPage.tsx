import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Building2, Check, HardHat, Home } from 'lucide-react'
import { AuthField, AuthShell } from '../../components/auth/AuthShell'
import { DocUploadSlot } from '../../components/auth/DocUploadSlot'
import { PasswordField } from '../../components/auth/PasswordField'
import { Button, Input, cn } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { apiAuthBootstrapNeeded } from '../../lib/api/authClient'
import { supabaseBootstrapNeeded, supabaseSignOut } from '../../lib/supabase/auth.js'
import { isSupabaseMode } from '../../lib/api/config'
import { isRegistrationRedirectError } from '../../lib/auth/registrationErrors'
import {
  stashPendingRegistrationDocs,
  validateRegistrationDocSizes,
} from '../../lib/auth/registrationDocs'
import {
  redirectToLogin,
  showAuthError,
  showAuthWarning,
  showRegistrationCompleteAlert,
} from '../../lib/sweetAlert'
import {
  CONTRACTOR_REQUIRED_DOCS,
  CONTRACTOR_TRADES,
  LANDLORD_REQUIRED_DOCS,
  missingRequiredDocs,
  type VerificationDocument,
} from '../../lib/verification'

const ICON_STROKE = 1.6
const OTHER_TRADE = 'Other'

const PUBLIC_ROLES = [
  {
    value: 'tenant',
    label: 'Applicant / Tenant',
    blurb: 'Browse homes and apply online',
    icon: Home,
  },
  {
    value: 'landlord',
    label: 'Landlord',
    blurb: 'List and manage your own properties',
    icon: Building2,
  },
  {
    value: 'contractor',
    label: 'Contractor',
    blurb: 'Receive and complete maintenance jobs',
    icon: HardHat,
  },
] as const

type PublicRole = (typeof PUBLIC_ROLES)[number]['value']

function postRegisterPath(role: string, bootstrap: boolean, next: string): string {
  if (bootstrap) return '/workspace/admin/agencies/new'
  if (role === 'landlord') return '/workspace/properties'
  if (role === 'contractor') return '/workspace/contractor'
  if (role === 'tenant') {
    if (next.startsWith('/listing/') || next.startsWith('/browse')) return next
    return '/workspace/tenant'
  }
  return next
}

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1
        const done = n < step
        const current = n === step
        return (
          <li key={n} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums transition-colors duration-200',
                done || current
                  ? 'bg-primary text-white'
                  : 'bg-primary-100 text-ink-400',
              )}
              aria-current={current ? 'step' : undefined}
            >
              {done ? <Check className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden /> : n}
            </span>
            {n < total ? (
              <span
                className={cn('h-0.5 flex-1 rounded-full', done ? 'bg-primary' : 'bg-primary-100')}
                aria-hidden
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

export default function RegisterPage() {
  const { register, isAuthenticated, authReady } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/workspace'

  const [step, setStep] = useState(1)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<PublicRole>('tenant')

  const [company, setCompany] = useState('')
  const [idNumber, setIdNumber] = useState('')
  const [trades, setTrades] = useState<string[]>([])
  const [otherTradeSelected, setOtherTradeSelected] = useState(false)
  const [customTrade, setCustomTrade] = useState('')
  const [serviceAddress, setServiceAddress] = useState('')
  const [taxPin, setTaxPin] = useState('')
  const [docsByKey, setDocsByKey] = useState<Record<string, VerificationDocument>>({})

  const [bootstrapNeeded, setBootstrapNeeded] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (isSupabaseMode ? supabaseBootstrapNeeded() : apiAuthBootstrapNeeded()).then(setBootstrapNeeded)
  }, [])

  const documents = useMemo(() => Object.values(docsByKey), [docsByKey])
  const totalSteps = bootstrapNeeded ? 1 : 3

  if (authReady && isAuthenticated) {
    return <Navigate to={next} replace />
  }

  const setDoc = (doc: VerificationDocument | null, key: string) => {
    setDocsByKey((prev) => {
      const nextMap = { ...prev }
      if (!doc) delete nextMap[key]
      else nextMap[key] = doc
      return nextMap
    })
  }

  const toggleTrade = (t: string) => {
    setTrades((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  const toggleOtherTrade = () => {
    setOtherTradeSelected((prev) => {
      if (prev) setCustomTrade('')
      return !prev
    })
  }

  const resolveContractorTrades = (): string[] => {
    const preset = trades.filter((t) => t !== OTHER_TRADE)
    const custom = otherTradeSelected ? customTrade.trim() : ''
    return custom ? [...preset, custom] : preset
  }

  const buildProfile = () =>
    role === 'landlord'
      ? {
          company: company.trim() || undefined,
          idNumberOrPassport: idNumber.trim(),
        }
      : role === 'contractor'
        ? {
            company: company.trim(),
            idNumberOrPassport: idNumber.trim(),
            trades: resolveContractorTrades(),
            serviceAreas: [serviceAddress.trim()],
            taxNumberOrTcsPin: taxPin.trim() || undefined,
          }
        : undefined

  const warnValidation = async (message: string | null) => {
    if (!message) return false
    await showAuthWarning(message)
    return true
  }

  const validateStep1 = (): string | null => {
    if (!firstName.trim() || !lastName.trim()) return 'First name and surname are required'
    if (!email.trim() || !email.includes('@')) return 'Valid email is required'
    if (!bootstrapNeeded && !phone.trim()) return 'Phone number is required'
    if (password.length < 8) return 'Password must be at least 8 characters'
    if (password !== confirmPassword) return 'Passwords do not match'
    return null
  }

  const validateStep3 = (): string | null => {
    if (role === 'tenant') return null
    if (!idNumber.trim()) return 'ID or passport number is required'
    if (role === 'contractor') {
      if (!company.trim()) return 'Trading name is required'
      if (otherTradeSelected && !customTrade.trim()) return 'Describe your trade'
      if (!resolveContractorTrades().length) return 'Select at least one trade'
      if (!serviceAddress.trim()) return 'Service address is required'
    }
    const missing = missingRequiredDocs(role, documents)
    if (missing.length) return `Upload required documents: ${missing.join(', ')}`
    if (isSupabaseMode && (role === 'landlord' || role === 'contractor')) {
      return validateRegistrationDocSizes(documents)
    }
    return null
  }

  const goNext = async () => {
    if (step === 1) {
      if (await warnValidation(validateStep1())) return
      if (bootstrapNeeded) {
        void submitBootstrap()
        return
      }
      setStep(2)
      return
    }
    if (step === 2) {
      setStep(3)
      return
    }
  }

  const goBack = () => {
    setStep((s) => Math.max(1, s - 1))
  }

  const handleRegistrationRedirect = async (err: unknown) => {
    if (!isRegistrationRedirectError(err)) return false
    try {
      if (isSupabaseMode) await supabaseSignOut()
      sessionStorage.setItem('pf-register-email', err.email)
      if (role !== 'tenant' && documents.length > 0) {
        stashPendingRegistrationDocs({
          email: err.email,
          role,
          profile: buildProfile(),
          documents,
        })
      }
    } catch {
      /* ignore */
    }
    await showRegistrationCompleteAlert({ email: err.email, kind: err.kind })
    redirectToLogin(
      params.get('next'),
      err.kind === 'email_confirmation' ? 'confirm-email' : 'ready',
    )
    return true
  }

  const submitBootstrap = async () => {
    setBusy(true)
    try {
      const result = await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        role: 'super_admin',
      })
      navigate(postRegisterPath('super_admin', result.bootstrap, next), { replace: true })
    } catch (err) {
      if (await handleRegistrationRedirect(err)) return
      await showAuthError(err instanceof Error ? err.message : 'Registration failed', err)
    } finally {
      setBusy(false)
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (bootstrapNeeded) {
      if (await warnValidation(validateStep1())) return
      await submitBootstrap()
      return
    }
    if (step < 3) {
      await goNext()
      return
    }
    if (await warnValidation(validateStep3())) return
    setBusy(true)
    try {
      const profile = buildProfile()

      const result = await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        role,
        profile,
        documents: role === 'tenant' ? undefined : documents,
      })
      navigate(postRegisterPath(role, result.bootstrap, next), { replace: true })
    } catch (err) {
      if (await handleRegistrationRedirect(err)) return
      await showAuthError(err instanceof Error ? err.message : 'Registration failed', err)
    } finally {
      setBusy(false)
    }
  }

  const title = bootstrapNeeded
    ? 'Create Super Admin'
    : step === 1
      ? 'Your details'
      : step === 2
        ? 'What are you applying for?'
        : 'Additional information'

  const subtitle = bootstrapNeeded
    ? 'This is the first account on an empty platform — it becomes the Super Admin.'
    : step === 1
      ? 'We’ll use these details for your PropertyFlow account.'
      : step === 2
        ? 'Choose how you’ll use the marketplace. Agency staff are invited separately.'
        : role === 'tenant'
          ? 'You’re ready — applicants can browse and apply as soon as the account is created.'
          : 'We review these before your listings or services appear to applicants.'

  return (
    <AuthShell
      title={title}
      subtitle={subtitle}
      contentWidth="2xl"
      crossLink={{
        to: `/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`,
        label: 'Sign in',
      }}
      asideTitle={bootstrapNeeded ? 'Bootstrap your platform' : 'Join PropertyFlow'}
      asideBody={
        bootstrapNeeded
          ? 'Set up the first Super Admin, then create agencies and invite your team.'
          : 'Applicants apply in minutes. Landlords and contractors are verified before going live.'
      }
      asidePoints={
        bootstrapNeeded
          ? ['Full platform control', 'Create agencies next', 'Invite staff and portal users']
          : [
              'Landlords publish after document review',
              'Applicants track applications in one place',
              'Contractors work assigned maintenance jobs',
            ]
      }
      bootstrapBanner={
        bootstrapNeeded ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            First user becomes Super Admin. You can create agencies right after sign-up.
          </p>
        ) : null
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {!bootstrapNeeded ? <StepIndicator step={step} total={totalSteps} /> : null}

        {(bootstrapNeeded || step === 1) && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <AuthField label="First name" htmlFor="reg-first">
                <Input
                  id="reg-first"
                  className="min-h-11"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                />
              </AuthField>
              <AuthField label="Surname" htmlFor="reg-last">
                <Input
                  id="reg-last"
                  className="min-h-11"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                />
              </AuthField>
            </div>
            <AuthField label="Email address" htmlFor="reg-email">
              <Input
                id="reg-email"
                className="min-h-11"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </AuthField>
            <AuthField
              label="Phone number"
              htmlFor="reg-phone"
              hint={bootstrapNeeded ? 'Optional for Super Admin bootstrap' : undefined}
            >
              <Input
                id="reg-phone"
                className="min-h-11"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required={!bootstrapNeeded}
                autoComplete="tel"
              />
            </AuthField>
            <AuthField label="Password" htmlFor="reg-password" hint="At least 8 characters">
              <PasswordField
                id="reg-password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                required
                minLength={8}
                showStrength
              />
            </AuthField>
            <AuthField label="Confirm password" htmlFor="reg-confirm">
              <PasswordField
                id="reg-confirm"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </AuthField>
          </div>
        )}

        {!bootstrapNeeded && step === 2 && (
          <fieldset>
            <legend className="sr-only">I am a…</legend>
            <div className="grid gap-2 sm:grid-cols-1">
              {PUBLIC_ROLES.map((r) => {
                const Icon = r.icon
                const selected = role === r.value
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={cn(
                      'flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      selected
                        ? 'border-primary bg-primary-50'
                        : 'border-primary-100 bg-white hover:bg-primary-50/60',
                    )}
                    aria-pressed={selected}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        selected ? 'bg-primary text-white' : 'bg-primary-50 text-primary',
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{r.label}</span>
                      <span className="mt-0.5 block text-xs text-ink-500">{r.blurb}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}

        {!bootstrapNeeded && step === 3 && role === 'tenant' && (
          <div className="rounded-2xl border border-primary-100 bg-primary-50/50 px-4 py-5 text-sm text-ink-600">
            <p className="font-semibold text-ink">Applicant account</p>
            <p className="mt-1.5 leading-relaxed">
              No extra documents are needed to create your account. You can upload application
              documents when you apply for a home.
            </p>
          </div>
        )}

        {!bootstrapNeeded && step === 3 && role === 'landlord' && (
          <div className="space-y-4">
            <AuthField label="Trading / portfolio name" htmlFor="reg-company" hint="Optional">
              <Input
                id="reg-company"
                className="min-h-11"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                autoComplete="organization"
              />
            </AuthField>
            <AuthField label="SA ID or passport number" htmlFor="reg-id">
              <Input
                id="reg-id"
                className="min-h-11"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                required
              />
            </AuthField>
            <div className="space-y-3">
              <p className="text-sm font-medium text-ink">Documents</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {LANDLORD_REQUIRED_DOCS.map((d) => (
                  <DocUploadSlot
                    key={d.key}
                    docKey={d.key}
                    label={d.label}
                    required={d.required}
                    value={docsByKey[d.key] ?? null}
                    onChange={(doc) => setDoc(doc, d.key)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {!bootstrapNeeded && step === 3 && role === 'contractor' && (
          <div className="space-y-4">
            <AuthField label="Trading name" htmlFor="reg-co-company">
              <Input
                id="reg-co-company"
                className="min-h-11"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                required
                autoComplete="organization"
              />
            </AuthField>
            <AuthField label="SA ID or passport number" htmlFor="reg-co-id">
              <Input
                id="reg-co-id"
                className="min-h-11"
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                required
              />
            </AuthField>
            <fieldset>
              <legend className="text-sm font-medium text-ink">Primary trades</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {CONTRACTOR_TRADES.map((t) => {
                  const selected = trades.includes(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTrade(t)}
                      className={cn(
                        'min-h-11 cursor-pointer rounded-full px-3.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        selected
                          ? 'bg-primary text-white'
                          : 'bg-white text-ink-600 ring-1 ring-primary-100 hover:bg-primary-50',
                      )}
                      aria-pressed={selected}
                    >
                      {t}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={toggleOtherTrade}
                  className={cn(
                    'min-h-11 cursor-pointer rounded-full px-3.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    otherTradeSelected
                      ? 'bg-primary text-white'
                      : 'bg-white text-ink-600 ring-1 ring-primary-100 hover:bg-primary-50',
                  )}
                  aria-pressed={otherTradeSelected}
                >
                  {OTHER_TRADE}
                </button>
              </div>
              {otherTradeSelected ? (
                <div className="mt-3">
                  <AuthField label="Describe your trade" htmlFor="reg-custom-trade">
                    <Input
                      id="reg-custom-trade"
                      className="min-h-11"
                      value={customTrade}
                      onChange={(e) => setCustomTrade(e.target.value)}
                      required
                      autoComplete="off"
                    />
                  </AuthField>
                </div>
              ) : null}
            </fieldset>
            <AuthField label="Service address" htmlFor="reg-service-address">
              <Input
                id="reg-service-address"
                className="min-h-11"
                value={serviceAddress}
                onChange={(e) => setServiceAddress(e.target.value)}
                required
                autoComplete="street-address"
              />
            </AuthField>
            <AuthField
              label="SARS tax number or TCS PIN"
              htmlFor="reg-tax"
              hint="Optional but recommended"
            >
              <Input
                id="reg-tax"
                className="min-h-11"
                value={taxPin}
                onChange={(e) => setTaxPin(e.target.value)}
              />
            </AuthField>
            <div className="space-y-3">
              <p className="text-sm font-medium text-ink">Documents</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {CONTRACTOR_REQUIRED_DOCS.map((d) => (
                  <DocUploadSlot
                    key={d.key}
                    docKey={d.key}
                    label={d.label}
                    required={d.required}
                    value={docsByKey[d.key] ?? null}
                    onChange={(doc) => setDoc(doc, d.key)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {!bootstrapNeeded && step > 1 ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 cursor-pointer"
              onClick={goBack}
              disabled={busy}
            >
              Back
            </Button>
          ) : (
            <span />
          )}
          {bootstrapNeeded || step === 3 ? (
            <Button type="submit" className="min-h-11 cursor-pointer sm:min-w-44" disabled={busy}>
              {busy
                ? 'Creating…'
                : bootstrapNeeded
                  ? 'Create Super Admin'
                  : 'Create account'}
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-11 cursor-pointer sm:min-w-44"
              onClick={() => void goNext()}
              disabled={busy}
            >
              Continue
            </Button>
          )}
        </div>

        {!bootstrapNeeded && (
          <p className="text-center text-xs text-ink-400">
            By creating an account you agree to use PropertyFlow for legitimate property activity.{' '}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Already registered?
            </Link>
          </p>
        )}
      </form>
    </AuthShell>
  )
}
