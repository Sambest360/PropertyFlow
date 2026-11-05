/**
 * My profile: what the account holds about you, at a glance, with one way to
 * change it (Edit profile → Settings). Role and agency are shown, never edited.
 */
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, Mail, MapPin, Pencil, Phone, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import { roleLabels } from '../../lib/permissions'
import { initials } from '../../lib/contactLinks'
import { PROFILE_SECTIONS, maskId, profileCompleteness } from '../../lib/profileFields'
import { Badge, Button, Card } from '../../components/ui'

const EDIT = '/workspace/account/settings'

export default function MyProfilePage() {
  const { user, role } = useAuth()
  const { state } = useStore()
  const me = state.users.find((u) => u.id === user.id) ?? user
  const agency = state.agencies.find((a) => a.id === me.agencyId)
  const d = me.profileDetails ?? {}
  const done = profileCompleteness(me)
  const pct = Math.round((done.done / done.total) * 100)
  const address = [d.addressLine1, d.addressLine2, d.suburb, d.city, d.province, d.postalCode, d.country].filter((x) => x?.trim()).join(', ')

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Card className="overflow-hidden p-0">
        <div className="h-24 bg-primary sm:h-28" aria-hidden />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="-mt-12 shrink-0">
            {me.avatar ? (
              <img src={me.avatar} alt="" className="h-24 w-24 rounded-full border-4 border-white object-cover shadow" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-primary-50 font-display text-3xl font-semibold text-primary shadow">
                {initials(me.name)}
              </div>
            )}
            </div>
            <div className="sm:pt-5">
              <h1 className="font-display text-2xl font-semibold text-ink">{me.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
                <Badge tone="brand">{roleLabels[role]}</Badge>
                {agency ? <span>{agency.tradingAs || agency.name}</span> : null}
                {d.occupation ? <span>· {d.occupation}</span> : null}
              </div>
            </div>
          </div>
          <Link to={EDIT} className="sm:mt-3">
            <Button>
              <Pencil className="h-4 w-4" aria-hidden /> Edit profile
            </Button>
          </Link>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Contact</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-700">
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-ink-400" aria-hidden /> {me.email ?? '—'}</li>
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-ink-400" aria-hidden /> {me.phone || <Missing />}</li>
              {d.alternatePhone ? <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-ink-400" aria-hidden /> {d.alternatePhone} (alternative)</li> : null}
              <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-ink-400" aria-hidden /> {address || <Missing />}</li>
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Personal details</h2>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Row label="ID or passport" value={maskId(me.idNumberOrPassport)} />
              <Row label="Date of birth" value={me.dateOfBirth} />
              <Row label="Company or employer" value={me.company} />
              {PROFILE_SECTIONS[0].fields
                .filter((f) => f.key !== 'alternatePhone')
                .map((f) => (
                  <Row key={f.key} label={f.label} value={d[f.key]} />
                ))}
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Emergency contact</h2>
            {d.emergencyName ? (
              <p className="mt-2 text-sm text-ink-700">
                {d.emergencyName}
                {d.emergencyRelationship ? ` (${d.emergencyRelationship})` : ''} · {d.emergencyPhone || 'no phone'}
              </p>
            ) : (
              <p className="mt-2 text-sm text-ink-500">None added yet.</p>
            )}
          </Card>

          {d.bio ? (
            <Card className="p-5">
              <h2 className="font-display text-lg font-semibold text-ink">About me</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{d.bio}</p>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Profile {pct}% complete</h2>
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-primary-50">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            {done.missing.length ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {done.missing.map((m) => (
                  <li key={m} className="flex items-center gap-2 text-ink-600">
                    <Circle className="h-4 w-4 text-ink-300" aria-hidden /> {m}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Everything is filled in.
              </p>
            )}
            {done.missing.length ? (
              <Link to={EDIT} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">
                Complete your profile
              </Link>
            ) : null}
          </Card>
          <Card className="p-5 text-sm text-ink-600">
            Your role and agency are set by your administrator. Ask them if something here is wrong.
          </Card>
        </aside>
      </div>
    </div>
  )
}

function Missing() {
  return <span className="text-ink-400">Not added</span>
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-ink-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value?.trim() ? value : <Missing />}</dd>
    </div>
  )
}
