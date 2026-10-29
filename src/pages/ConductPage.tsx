/**
 * Complaints & warnings: anyone can complain about another user; agency
 * admins / super admins handle complaints and issue warnings; everyone sees
 * and acknowledges their own warnings. Server: server/conduct.ts.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/AppStore'
import { isApiEnabled } from '../lib/api/config'
import { roleLabels } from '../lib/permissions'
import {
  COMPLAINT_CATEGORIES,
  WARNING_LEVELS,
  complaintCategoryLabel,
  fileComplaintApi,
  handleComplaintApi,
  issueWarningApi,
  listComplaintsApi,
  listWarningsApi,
  warningActionApi,
  type Complaint,
  type Warning,
  type WarningLevel,
} from '../lib/api/conductApi'
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Textarea, cn } from '../components/ui'
import { sweetSuccess, sweetWarning } from '../lib/sweetAlert'

type Tab = 'complain' | 'complaints' | 'warnings' | 'issue'

const STATUS_TONE: Record<Complaint['status'], 'info' | 'warning' | 'danger' | 'neutral'> = {
  open: 'info',
  investigating: 'warning',
  upheld: 'danger',
  dismissed: 'neutral',
}
const LEVEL_TONE: Record<WarningLevel, 'info' | 'warning' | 'danger'> = { notice: 'info', warning: 'warning', final: 'danger', severe: 'danger' }
const when = (iso: string) => new Date(iso).toLocaleDateString('en-ZA', { dateStyle: 'medium' })

function PersonPicker({ value, onChange, exclude }: { value: string; onChange: (id: string) => void; exclude?: string }) {
  const { state } = useStore()
  const [q, setQ] = useState('')
  const people = useMemo(
    () =>
      state.users
        .filter((u) => u.id !== exclude && u.active !== false && u.role !== 'super_admin')
        .filter((u) => !q.trim() || u.name.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 200),
    [state.users, q, exclude],
  )
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Input placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Person">
        <option value="">Choose a person…</option>
        {people.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} — {roleLabels[u.role]}
          </option>
        ))}
      </Select>
    </div>
  )
}

function ComplainForm({ onDone }: { onDone: () => void }) {
  const { user } = useAuth()
  const { state } = useStore()
  const [params] = useSearchParams()
  const [subject, setSubject] = useState(params.get('about') ?? '')
  const [category, setCategory] = useState('unprofessional')
  const [listingId, setListingId] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!subject) return void sweetWarning('Choose a person', 'Pick who the complaint is about.')
    setSaving(true)
    try {
      await fileComplaintApi({ subjectUserId: subject, category, description, listingId: listingId || undefined })
      await sweetSuccess('Complaint sent', 'The agency and the platform team have been told. You can follow it under My complaints.')
      setDescription('')
      onDone()
    } catch (e) {
      await sweetWarning('Could not send', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <p className="text-sm font-medium text-ink">Who is it about?</p>
        <div className="mt-1">
          <PersonPicker value={subject} onChange={setSubject} exclude={user.id} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium text-ink">What happened?</span>
          <Select className="mt-1 w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
            {COMPLAINT_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink">Property (optional)</span>
          <Select className="mt-1 w-full" value={listingId} onChange={(e) => setListingId(e.target.value)}>
            <option value="">Not about a property</option>
            {state.properties.slice(0, 300).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="font-medium text-ink">Describe it</span>
        <Textarea
          rows={5}
          className="mt-1"
          placeholder="What happened, when, and what you would like done about it."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <p className="text-xs text-ink-500">The person you complain about does not see your name. The agency admin and the platform team do.</p>
      <Button disabled={saving} onClick={() => void submit()}>
        Send complaint
      </Button>
    </Card>
  )
}

function ComplaintCard({ c, canHandle, onChanged }: { c: Complaint; canHandle: boolean; onChanged: () => void }) {
  const [note, setNote] = useState(c.resolutionNote ?? '')
  const [level, setLevel] = useState<WarningLevel | ''>('')
  const [busy, setBusy] = useState(false)
  const set = async (status: Complaint['status']) => {
    setBusy(true)
    try {
      await handleComplaintApi(c.id, {
        status,
        note: note || undefined,
        warning: status === 'upheld' && level ? { level, reason: note || complaintCategoryLabel(c.category) } : undefined,
      })
      onChanged()
    } catch (e) {
      await sweetWarning('Could not update', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">
            About{' '}
            <Link to={`/profile/${encodeURIComponent(c.subjectUserId)}`} className="text-primary hover:underline">
              {c.subjectName}
            </Link>{' '}
            <span className="text-sm font-normal text-ink-500">({c.subjectRole})</span>
          </p>
          <p className="text-xs text-ink-500">
            {complaintCategoryLabel(c.category)}
            {c.listingTitle ? ` · ${c.listingTitle}` : ''} · {when(c.createdAt)}
            {c.authorName && !c.mine ? ` · from ${c.authorName}` : ''}
          </p>
        </div>
        <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
      </div>
      <p className="whitespace-pre-line text-sm text-ink-600">{c.description}</p>
      {c.resolutionNote && !canHandle ? <p className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-ink-600">{c.resolutionNote}</p> : null}
      {canHandle && !c.mine ? (
        <div className="space-y-2 border-t border-primary-100 pt-2">
          <Textarea rows={2} placeholder="Notes / outcome (sent to the person who complained when closed)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void set('investigating')}>
              Investigating
            </Button>
            <Select className="h-9 text-xs" value={level} onChange={(e) => setLevel(e.target.value as WarningLevel | '')} aria-label="Warning to issue when upheld">
              <option value="">Uphold without a warning</option>
              {WARNING_LEVELS.map((w) => (
                <option key={w.key} value={w.key}>
                  Uphold + {w.label.toLowerCase()}
                </option>
              ))}
            </Select>
            <Button size="sm" disabled={busy} onClick={() => void set('upheld')}>
              Uphold
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void set('dismissed')}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  )
}

function WarningCard({ w, canIssue, onChanged }: { w: Warning; canIssue: boolean; onChanged: () => void }) {
  const act = async (a: 'acknowledge' | 'revoke') => {
    try {
      await warningActionApi(w.id, a)
      onChanged()
    } catch (e) {
      await sweetWarning('Could not update', e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <Card className={cn('space-y-2 p-4', w.revokedAt && 'opacity-60')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">{w.mine ? 'To you' : w.userName}</p>
        <div className="flex gap-1.5">
          <Badge tone={LEVEL_TONE[w.level]}>{WARNING_LEVELS.find((l) => l.key === w.level)?.label}</Badge>
          {w.public ? <Badge tone="neutral">On public profile</Badge> : null}
          {w.revokedAt ? <Badge tone="neutral">Withdrawn</Badge> : null}
        </div>
      </div>
      <p className="whitespace-pre-line text-sm text-ink-600">{w.reason}</p>
      <p className="text-xs text-ink-500">
        {when(w.createdAt)}
        {w.issuedBy ? ` · by ${w.issuedBy}` : ''}
        {w.expiresAt ? ` · until ${when(w.expiresAt)}` : ''}
        {w.acknowledgedAt ? ` · acknowledged ${when(w.acknowledgedAt)}` : ''}
      </p>
      <div className="flex gap-2">
        {w.mine && !w.acknowledgedAt && !w.revokedAt ? (
          <Button size="sm" onClick={() => void act('acknowledge')}>
            I have read this
          </Button>
        ) : null}
        {canIssue && !w.mine && !w.revokedAt ? (
          <Button size="sm" variant="ghost" onClick={() => void act('revoke')}>
            Withdraw
          </Button>
        ) : null}
      </div>
    </Card>
  )
}

function IssueWarningForm({ onDone }: { onDone: () => void }) {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [person, setPerson] = useState(params.get('warn') ?? '')
  const [level, setLevel] = useState<WarningLevel>('warning')
  const [reason, setReason] = useState('')
  const [days, setDays] = useState('')
  const [saving, setSaving] = useState(false)
  const info = WARNING_LEVELS.find((l) => l.key === level)
  const submit = async () => {
    if (!person) return void sweetWarning('Choose a person', 'Pick who receives the warning.')
    setSaving(true)
    try {
      const r = await issueWarningApi({ userId: person, level, reason, expiresInDays: days ? Number(days) : undefined })
      await sweetSuccess('Warning issued', r.public ? 'It is shown on their public profile.' : 'Only they can see it.')
      setReason('')
      onDone()
    } catch (e) {
      await sweetWarning('Could not issue', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card className="space-y-4 p-5">
      <PersonPicker value={person} onChange={setPerson} exclude={user.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium text-ink">Level</span>
          <Select className="mt-1 w-full" value={level} onChange={(e) => setLevel(e.target.value as WarningLevel)}>
            {WARNING_LEVELS.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </Select>
          <span className="mt-1 block text-xs text-ink-500">{info?.hint}</span>
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink">Expires after (days, optional)</span>
          <Input className="mt-1" type="number" min={1} placeholder="Never" value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
      </div>
      <Textarea rows={4} placeholder="Reason — the person reads this." value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button disabled={saving} onClick={() => void submit()}>
        Issue warning
      </Button>
    </Card>
  )
}

export default function ConductPage() {
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(params.get('warn') ? 'issue' : params.get('about') ? 'complain' : 'complaints')
  const [complaints, setComplaints] = useState<{ canHandle: boolean; complaints: Complaint[] } | null>(null)
  const [warnings, setWarnings] = useState<{ canIssue: boolean; warnings: Warning[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!isApiEnabled) return
    Promise.all([listComplaintsApi(), listWarningsApi()])
      .then(([c, w]) => {
        setComplaints(c)
        setWarnings(w)
      })
      .catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const openMine = (warnings?.warnings ?? []).filter((w) => w.mine && !w.acknowledgedAt && !w.revokedAt).length
  const tabs: Array<{ id: Tab; label: string; show: boolean }> = [
    { id: 'complaints', label: complaints?.canHandle ? 'Complaints' : 'My complaints', show: true },
    { id: 'complain', label: 'Make a complaint', show: true },
    { id: 'warnings', label: `Warnings${openMine ? ` (${openMine})` : ''}`, show: true },
    { id: 'issue', label: 'Issue a warning', show: Boolean(warnings?.canIssue) },
  ]

  return (
    <div className="space-y-5">
      <PageHeader title="Complaints & warnings" subtitle="Raise a complaint about someone, follow it up, and see any warnings on your account." />
      {!isApiEnabled ? <Card className="p-4 text-sm text-ink-600">This needs the live server.</Card> : null}
      {error ? <Card className="p-4 text-sm text-rose-700">{error}</Card> : null}
      {openMine ? (
        <Card className="flex items-center gap-2 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="h-5 w-5" aria-hidden /> You have {openMine} warning{openMine === 1 ? '' : 's'} to read.
        </Card>
      ) : null}
      <div className="flex flex-wrap gap-2 border-b border-primary-100">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium', tab === t.id ? 'border-primary text-primary' : 'border-transparent text-ink-500 hover:text-ink')}
            >
              {t.label}
            </button>
          ))}
      </div>
      {tab === 'complain' ? <ComplainForm onDone={() => { load(); setTab('complaints') }} /> : null}
      {tab === 'complaints' ? (
        complaints?.complaints.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {complaints.complaints.map((c) => (
              <ComplaintCard key={c.id} c={c} canHandle={complaints.canHandle} onChanged={load} />
            ))}
          </div>
        ) : (
          <EmptyState title="No complaints" description="Complaints you make, and complaints about people in your agency, show here." />
        )
      ) : null}
      {tab === 'warnings' ? (
        warnings?.warnings.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {warnings.warnings.map((w) => (
              <WarningCard key={w.id} w={w} canIssue={warnings.canIssue} onChanged={load} />
            ))}
          </div>
        ) : (
          <Card className="flex items-center gap-2 p-4 text-sm text-ink-600">
            <ShieldAlert className="h-5 w-5 text-emerald-600" aria-hidden /> No warnings.
          </Card>
        )
      ) : null}
      {tab === 'issue' && warnings?.canIssue ? <IssueWarningForm onDone={() => { load(); setTab('warnings') }} /> : null}
    </div>
  )
}
