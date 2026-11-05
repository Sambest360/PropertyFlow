/**
 * Settings, in sections down the side: your profile details, notifications,
 * password and security, signature, preferences, and (agency admins) the
 * agency's public profile. Every role has this page. Nobody changes their own
 * role or agency here; an administrator does that.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bell, Building2, KeyRound, LifeBuoy, Lock, PenLine, SlidersHorizontal, UserRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import { useTheme } from '../../context/ThemeContext'
import { roleLabels } from '../../lib/permissions'
import { arePageTipsDisabled, resetPageTipsForUser, setPageTipsPreference } from '../../lib/pageTips'
import { Button, Card, Input, PageHeader, Select, Textarea, cn } from '../../components/ui'
import { sweetSuccess, sweetWarning } from '../../lib/sweetAlert'
import { NotificationSettingsCard } from '../../components/notifications/NotificationSettingsCard'
import { ProfilePhotoCard } from '../../components/agency/ProfilePhotoCard'
import { AgencyPublicProfileCard } from '../../components/agency/AgencyPublicProfileCard'
import { isApiEnabled } from '../../lib/api/config'
import { PROFILE_SECTIONS, dobFromSaId } from '../../lib/profileFields'
import type { UserProfileDetails } from '../../types/domain'
import ChangePasswordPage from './ChangePasswordPage'
import AccountSignaturePage from './AccountSignaturePage'

type TabId = 'profile' | 'notifications' | 'security' | 'signature' | 'preferences' | 'agency'

export default function AccountSettingsPage() {
  const { user, role, isImpersonating } = useAuth()
  const [params, setParams] = useSearchParams()
  const isAgencyAdmin = (role === 'client_admin' || role === 'agent_admin') && Boolean(user.agencyId)

  const tabs = useMemo(
    () =>
      [
        { id: 'profile' as const, label: 'Profile', hint: 'Your details and photo', icon: UserRound },
        { id: 'notifications' as const, label: 'Notifications', hint: 'Email and in-app alerts', icon: Bell },
        { id: 'security' as const, label: 'Password', hint: 'Sign-in and security', icon: Lock },
        { id: 'signature' as const, label: 'Signature', hint: 'For leases and inspections', icon: PenLine },
        { id: 'preferences' as const, label: 'Preferences', hint: 'Theme and page tips', icon: SlidersHorizontal },
        ...(isAgencyAdmin ? [{ id: 'agency' as const, label: 'Agency profile', hint: 'What the public sees', icon: Building2 }] : []),
      ],
    [isAgencyAdmin],
  )
  const asked = params.get('tab') as TabId | null
  const tab: TabId = tabs.some((t) => t.id === asked) ? (asked as TabId) : 'profile'
  const go = (id: TabId) => {
    const next = new URLSearchParams(params)
    if (id === 'profile') next.delete('tab')
    else next.set('tab', id)
    setParams(next, { replace: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Manage your profile, notifications and account security." />
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="-mx-1 overflow-x-auto lg:mx-0 lg:overflow-visible">
          <ul className="flex gap-1 px-1 lg:flex-col lg:px-0">
            {tabs.map((t) => {
              const active = t.id === tab
              return (
                <li key={t.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => go(t.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                      active ? 'bg-primary text-white' : 'text-ink-600 hover:bg-primary-50 hover:text-ink',
                    )}
                  >
                    <t.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-semibold">{t.label}</span>
                      <span className={cn('hidden text-xs lg:block', active ? 'text-white/80' : 'text-ink-400')}>{t.hint}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-4 hidden space-y-1 border-t border-primary-100 pt-4 text-sm lg:block">
            <Link to="/workspace/account/profile" className="flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium text-primary hover:bg-primary-50">
              <UserRound className="h-4 w-4" aria-hidden /> View my profile
            </Link>
            <Link to="/workspace/help" className="flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium text-primary hover:bg-primary-50">
              <LifeBuoy className="h-4 w-4" aria-hidden /> Help and Support
            </Link>
          </div>
        </nav>

        <div className="min-w-0 space-y-5">
          {tab === 'profile' ? <ProfileTab /> : null}
          {tab === 'notifications' ? <NotificationSettingsCard /> : null}
          {tab === 'security' ? (
            <Section title="Password and security" description="For your safety you are signed out automatically after a period without activity.">
              {isApiEnabled && !isImpersonating ? (
                <ChangePasswordPage />
              ) : (
                <p className="text-sm text-ink-500">Password changes are available when you are signed in to your own account.</p>
              )}
            </Section>
          ) : null}
          {tab === 'signature' ? (
            <Section title="Your signature" description="Saved once, used when you sign leases and inspection reports in the app.">
              <AccountSignaturePage embedded />
            </Section>
          ) : null}
          {tab === 'preferences' ? <PreferencesTab /> : null}
          {tab === 'agency' && user.agencyId ? <AgencyPublicProfileCard agencyId={user.agencyId} /> : null}
        </div>
      </div>
    </div>
  )
}

function Section({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  )
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-400">{hint}</span> : null}
    </label>
  )
}

function ProfileTab() {
  const { user, role } = useAuth()
  const { state, updateUser } = useStore()
  const me = state.users.find((u) => u.id === user.id)
  const agency = state.agencies.find((a) => a.id === (me?.agencyId ?? user.agencyId))
  const initial = () => ({
    firstName: me?.firstName ?? user.name.split(' ')[0] ?? '',
    lastName: me?.lastName ?? user.name.split(' ').slice(1).join(' '),
    phone: me?.phone ?? '',
    idNumberOrPassport: me?.idNumberOrPassport ?? '',
    dateOfBirth: me?.dateOfBirth ?? '',
    company: me?.company ?? '',
    details: { ...(me?.profileDetails ?? {}) } as UserProfileDetails,
  })
  const [f, setF] = useState(initial)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!dirty) setF(initial())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  const set = <K extends keyof ReturnType<typeof initial>>(k: K, v: ReturnType<typeof initial>[K]) => {
    setF((x) => ({ ...x, [k]: v }))
    setDirty(true)
  }
  const setDetail = (k: keyof UserProfileDetails, v: string) => {
    setF((x) => ({ ...x, details: { ...x.details, [k]: v } }))
    setDirty(true)
  }

  const save = async () => {
    if (!f.firstName.trim()) return void sweetWarning('Name required', 'Enter your first name.')
    for (const p of [f.phone, f.details.alternatePhone, f.details.emergencyPhone]) {
      if (p && !/^[+\d][\d\s()-]{6,}$/.test(p.trim())) return void sweetWarning('Check the phone number', 'Use digits, spaces and an optional +.')
    }
    setBusy(true)
    try {
      const details = Object.fromEntries(Object.entries(f.details).map(([k, v]) => [k, String(v ?? '').trim()])) as UserProfileDetails
      updateUser(user.id, {
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        name: `${f.firstName.trim()} ${f.lastName.trim()}`.trim(),
        phone: f.phone.trim() || undefined,
        // A masked ID (shown back as ••••1234) is never saved over the real one.
        ...(f.idNumberOrPassport.trim() && !f.idNumberOrPassport.includes('•') ? { idNumberOrPassport: f.idNumberOrPassport.trim() } : {}),
        dateOfBirth: f.dateOfBirth || undefined,
        company: f.company.trim() || undefined,
        profileDetails: details,
      })
      setDirty(false)
      await sweetSuccess('Profile saved', 'Your details were updated.')
    } finally {
      setBusy(false)
    }
  }

  const saveBar = (
    <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-2 border-t border-primary-100 bg-white/95 px-1 py-3 backdrop-blur">
      {dirty ? <span className="mr-auto text-sm text-ink-500">You have unsaved changes.</span> : null}
      <Button variant="ghost" disabled={!dirty || busy} onClick={() => { setF(initial()); setDirty(false) }}>
        Discard
      </Button>
      <Button disabled={!dirty || busy} onClick={() => void save()}>
        {busy ? 'Saving…' : 'Save profile'}
      </Button>
    </div>
  )

  return (
    <div className="space-y-5">
      <ProfilePhotoCard userId={user.id} name={user.name} own />

      <Section title="Personal details" description="Your name and how to reach you.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name"><Input value={f.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
          <Field label="Surname"><Input value={f.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
          <Field label="Mobile phone"><Input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email" hint="Ask your agency admin to change the email you sign in with.">
            <Input value={me?.email ?? user.email ?? ''} disabled readOnly />
          </Field>
          <Field label="SA ID or passport number" hint="Kept private. Used on leases and for identity checks.">
            <Input
              value={f.idNumberOrPassport}
              onChange={(e) => {
                const v = e.target.value
                set('idNumberOrPassport', v)
                const dob = dobFromSaId(v)
                if (dob && !f.dateOfBirth) set('dateOfBirth', dob)
              }}
            />
          </Field>
          <Field label="Date of birth"><Input type="date" value={f.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} /></Field>
          <Field label="Company or employer (optional)"><Input value={f.company} onChange={(e) => set('company', e.target.value)} /></Field>
        </div>
      </Section>

      {PROFILE_SECTIONS.map((sec) => (
        <Section key={sec.title} title={sec.title} description={sec.hint}>
          <div className="grid gap-3 sm:grid-cols-2">
            {sec.fields.map((fl) => (
              <Field key={fl.key} label={fl.label}>
                {fl.type === 'select' ? (
                  <Select value={f.details[fl.key] ?? ''} onChange={(e) => setDetail(fl.key, e.target.value)}>
                    <option value="">Choose…</option>
                    {fl.options?.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </Select>
                ) : (
                  <Input type={fl.type === 'tel' ? 'tel' : 'text'} value={f.details[fl.key] ?? ''} onChange={(e) => setDetail(fl.key, e.target.value)} />
                )}
              </Field>
            ))}
          </div>
        </Section>
      ))}

      <Section title="About me" description="A short note people see on your profile (optional).">
        <Textarea rows={3} maxLength={1000} value={f.details.bio ?? ''} onChange={(e) => setDetail('bio', e.target.value)} />
      </Section>

      <Section title="Account" description="Set by your administrator. You can't change these yourself.">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ink-500">Role</dt>
            <dd className="mt-0.5 inline-flex items-center gap-1 font-medium text-ink"><KeyRound className="h-3.5 w-3.5 text-ink-400" aria-hidden /> {roleLabels[role]}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Agency</dt>
            <dd className="mt-0.5 font-medium text-ink">{agency?.tradingAs || agency?.name || '—'}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Status</dt>
            <dd className="mt-0.5 font-medium text-ink">{me?.active === false ? 'Inactive' : 'Active'}</dd>
          </div>
        </dl>
      </Section>

      {saveBar}
    </div>
  )
}

function PreferencesTab() {
  const { user } = useAuth()
  const { theme, toggle } = useTheme()
  const [tipsOff, setTipsOff] = useState(() => arePageTipsDisabled(user.id))
  const setTips = (off: boolean) => {
    if (off) setPageTipsPreference(user.id, true)
    else resetPageTipsForUser(user.id)
    setTipsOff(off)
  }
  return (
    <div className="space-y-5">
      <Section title="Appearance" description={`Currently using the ${theme} theme.`}>
        <Button variant="secondary" onClick={toggle}>
          Switch to {theme === 'dark' ? 'light' : 'dark'} theme
        </Button>
      </Section>
      <Section title="Page tips" description="Short walkthroughs that point out what each page does.">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={!tipsOff} onChange={(e) => setTips(!e.target.checked)} /> Show page tips
        </label>
        <Button variant="ghost" size="sm" onClick={() => setTips(false)}>
          Replay all tips from the start
        </Button>
      </Section>
    </div>
  )
}
