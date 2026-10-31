/**
 * Settings: your details, notifications, appearance, page tips, security and account links.
 * Every role has this page.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, KeyRound, Lightbulb, Moon, PenLine, ShieldAlert, Sun, UserRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import { useTheme } from '../../context/ThemeContext'
import { roleLabels } from '../../lib/permissions'
import { arePageTipsDisabled, resetPageTipsForUser, setPageTipsPreference } from '../../lib/pageTips'
import { Button, Card, Input, PageHeader } from '../../components/ui'
import { sweetSuccess, sweetWarning } from '../../lib/sweetAlert'
import { NotificationSettingsCard } from '../../components/notifications/NotificationSettingsCard'
import { ProfilePhotoCard } from '../../components/agency/ProfilePhotoCard'
import { AgencyPublicProfileCard } from '../../components/agency/AgencyPublicProfileCard'

const ICON = 'h-5 w-5 text-primary'

export default function AccountSettingsPage() {
  const { user, role } = useAuth()
  const { state, updateUser } = useStore()
  const { theme, toggle } = useTheme()
  const me = state.users.find((u) => u.id === user.id)
  const [firstName, setFirstName] = useState(me?.firstName ?? user.name.split(' ')[0] ?? '')
  const [lastName, setLastName] = useState(me?.lastName ?? user.name.split(' ').slice(1).join(' '))
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [tipsOff, setTipsOff] = useState(() => arePageTipsDisabled(user.id))

  useEffect(() => {
    if (!me) return
    setFirstName(me.firstName ?? me.name.split(' ')[0] ?? '')
    setLastName(me.lastName ?? me.name.split(' ').slice(1).join(' '))
    setPhone(me.phone ?? '')
  }, [me])

  const saveProfile = async () => {
    if (!firstName.trim()) return void sweetWarning('Name required', 'Enter your first name.')
    if (phone && !/^[+\d][\d\s()-]{6,}$/.test(phone.trim())) return void sweetWarning('Check the phone number', 'Use digits, spaces and an optional +.')
    updateUser(user.id, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      name: `${firstName.trim()} ${lastName.trim()}`.trim(),
      phone: phone.trim() || undefined,
    })
    await sweetSuccess('Saved', 'Your details were updated.')
  }

  const setTips = (off: boolean) => {
    if (off) setPageTipsPreference(user.id, true)
    else resetPageTipsForUser(user.id)
    setTipsOff(off)
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle="Your details, notifications, how Lekaya looks for you, and account security." />

      <Card className="space-y-4 p-5">
        <h2 className="inline-flex items-center gap-2 font-semibold text-ink">
          <UserRound className={ICON} aria-hidden /> Your details
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium text-ink">First name</span>
            <Input className="mt-1" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="font-medium text-ink">Surname</span>
            <Input className="mt-1" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="font-medium text-ink">Phone</span>
            <Input className="mt-1" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <div className="text-sm">
            <span className="font-medium text-ink">E-mail and role</span>
            <p className="mt-2 text-ink-600">
              {me?.email ?? user.email ?? '—'} · {roleLabels[role]}
            </p>
            <p className="text-xs text-ink-400">Ask your agency admin to change your e-mail or role.</p>
          </div>
        </div>
        <Button onClick={() => void saveProfile()}>Save details</Button>
      </Card>

      {/* Staff: photo on the listings they are the contact for; agency admins: their agency's public details. */}
      {role !== 'landlord' && role !== 'tenant' && role !== 'contractor' ? (
        <ProfilePhotoCard userId={user.id} name={user.name} own />
      ) : null}
      {(role === 'client_admin' || role === 'agent_admin') && user.agencyId ? <AgencyPublicProfileCard agencyId={user.agencyId} /> : null}

      <NotificationSettingsCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="inline-flex items-center gap-2 font-semibold text-ink">
            {theme === 'dark' ? <Moon className={ICON} aria-hidden /> : <Sun className={ICON} aria-hidden />} Appearance
          </h2>
          <p className="text-sm text-ink-500">Currently using the {theme} theme.</p>
          <Button variant="secondary" onClick={toggle}>
            Switch to {theme === 'dark' ? 'light' : 'dark'} theme
          </Button>
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="inline-flex items-center gap-2 font-semibold text-ink">
            <Lightbulb className={ICON} aria-hidden /> Page tips
          </h2>
          <p className="text-sm text-ink-500">Short walkthroughs that point out what each page does.</p>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={!tipsOff} onChange={(e) => setTips(!e.target.checked)} /> Show page tips
          </label>
          <Button variant="ghost" size="sm" onClick={() => setTips(false)}>
            Replay all tips from the start
          </Button>
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="inline-flex items-center gap-2 font-semibold text-ink">
            <KeyRound className={ICON} aria-hidden /> Security
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link to="/workspace/account/password" className="font-semibold text-primary hover:underline">
                Change password
              </Link>
            </li>
            <li>
              <Link to="/workspace/account/signature" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                <PenLine className="h-4 w-4" aria-hidden /> Your signature for leases and inspections
              </Link>
            </li>
          </ul>
          <p className="text-xs text-ink-500">For your safety you are signed out automatically after a period without activity.</p>
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="inline-flex items-center gap-2 font-semibold text-ink">
            <Bell className={ICON} aria-hidden /> Help and conduct
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link to="/workspace/help" className="font-semibold text-primary hover:underline">
                Help & support tickets
              </Link>
            </li>
            <li>
              <Link to="/workspace/conduct" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                <ShieldAlert className="h-4 w-4" aria-hidden /> Complaints & warnings
              </Link>
            </li>
            <li>
              <Link to={`/profile/${encodeURIComponent(user.id)}`} className="font-semibold text-primary hover:underline">
                See your public profile
              </Link>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  )
}
