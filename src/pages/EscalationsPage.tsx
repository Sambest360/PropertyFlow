/**
 * Escalations: faults and help-desk tickets that waited too long, yearly rent
 * increases, and the agency's escalation rules. The server engine
 * (server/escalations.ts) runs hourly and whenever this page loads.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, RefreshCw, TrendingUp } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/AppStore'
import { isApiEnabled } from '../lib/api/config'
import {
  ESCALATION_PRIORITIES,
  actOnEscalationApi,
  getEscalationSettingsApi,
  listEscalationsApi,
  saveEscalationSettingsApi,
  type Escalation,
  type EscalationSettings,
  type RentEscalationRow,
} from '../lib/api/escalationsApi'
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from '../components/ui'
import { sweetSuccess, sweetWarning } from '../lib/sweetAlert'

type Tab = 'issues' | 'rent' | 'rules'

const LEVEL_TONE: Record<number, 'warning' | 'danger' | 'accent'> = { 1: 'warning', 2: 'danger', 3: 'accent' }
const LEVEL_WHO: Record<number, string> = {
  1: 'Agent and agency admin',
  2: 'Agency admin',
  3: 'Platform (super admin)',
}
const STATUS_LABEL = { open: 'Open', acknowledged: 'Acknowledged', resolved: 'Resolved' } as const
const PRIORITY_LABEL: Record<string, string> = {
  EMERGENCY: 'Emergency',
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
}

const zar = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (iso: string) => new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })

function IssueCard({ e, onChanged }: { e: Escalation; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const act = async (action: 'acknowledge' | 'resolve' | 'reopen') => {
    setBusy(true)
    try {
      await actOnEscalationApi(e.id, action)
      onChanged()
    } catch (err) {
      await sweetWarning('Could not update', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={e.link} className="font-semibold text-ink-900 hover:text-primary">
            {e.title}
          </Link>
          <p className="text-sm text-ink-600">{e.reason}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={LEVEL_TONE[e.level] ?? 'danger'}>Level {e.level}</Badge>
          <Badge tone={e.status === 'resolved' ? 'success' : e.status === 'acknowledged' ? 'info' : 'neutral'}>
            {STATUS_LABEL[e.status]}
          </Badge>
        </div>
      </div>
      <p className="text-xs text-ink-500">
        {e.subjectType === 'support_ticket' ? 'Help desk ticket' : 'Maintenance fault'} · Escalated to{' '}
        {LEVEL_WHO[e.level] ?? 'admins'} · {when(e.updatedAt)}
        {e.manual ? ' · raised by staff' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link to={e.link}>
          <Button size="sm" variant="secondary">
            Open
          </Button>
        </Link>
        {e.status === 'open' ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act('acknowledge')}>
            Acknowledge
          </Button>
        ) : null}
        {e.status !== 'resolved' ? (
          <Button size="sm" disabled={busy} onClick={() => void act('resolve')}>
            Mark resolved
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act('reopen')}>
            Reopen
          </Button>
        )}
      </div>
    </Card>
  )
}

function RentTable({ rows }: { rows: RentEscalationRow[] }) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No rent increases scheduled"
        description="Set a yearly increase on a lease, or set an agency default under Rules so every lease gets one."
      />
    )
  }
  const today = new Date().toISOString().slice(0, 10)
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-primary-50/60 text-left text-xs uppercase tracking-wide text-ink-500">
          <tr>
            <th className="px-4 py-2">Lease</th>
            <th className="px-4 py-2">Tenant</th>
            <th className="px-4 py-2 text-right">Current rent</th>
            <th className="px-4 py-2 text-right">Increase</th>
            <th className="px-4 py-2 text-right">New rent</th>
            <th className="px-4 py-2">From</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const next = r.pct ? Math.round(r.rent * (1 + r.pct / 100) * 100) / 100 : r.rent
            const soon = r.nextOn && r.nextOn >= today && r.nextOn <= new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10)
            return (
              <tr key={r.id} className="border-t border-primary-50">
                <td className="px-4 py-2 font-medium text-ink-900">{r.reference}</td>
                <td className="px-4 py-2 text-ink-600">{r.tenantName || '—'}</td>
                <td className="px-4 py-2 text-right tabular-nums">{zar(r.rent)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.pct != null ? `${r.pct}%` : '—'}</td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{zar(next)}</td>
                <td className="px-4 py-2">
                  {r.nextOn ?? '—'} {soon ? <Badge tone="warning">Soon</Badge> : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

function RulesForm({ canEdit }: { canEdit: boolean }) {
  const { role, agencyId } = useAuth()
  const { state } = useStore()
  const isSuper = role === 'super_admin'
  const [target, setTarget] = useState<string>(agencyId ?? state.agencies[0]?.id ?? '')
  const [s, setS] = useState<EscalationSettings | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isApiEnabled) return
    getEscalationSettingsApi(isSuper ? target : null)
      .then((r) => setS(r.settings))
      .catch(() => setS(null))
  }, [isSuper, target])

  if (!s) return <p className="text-sm text-ink-500">Loading rules…</p>

  const setHours = (kind: 'responseHours' | 'resolveHours', p: string, v: string) =>
    setS({ ...s, [kind]: { ...s[kind], [p]: Number(v) } })

  const save = async () => {
    setSaving(true)
    try {
      const r = await saveEscalationSettingsApi(s, isSuper ? target : null)
      setS(r.settings)
      await sweetSuccess('Rules saved', 'Escalations use these times from the next check.')
    } catch (err) {
      await sweetWarning('Could not save', err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {isSuper ? (
        <label className="block text-sm">
          <span className="font-medium text-ink">Agency</span>
          <Select className="mt-1 block" value={target} onChange={(e) => setTarget(e.target.value)}>
            {state.agencies
              .filter((a) => a.status !== 'Cancelled')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </Select>
        </label>
      ) : null}
      <Card className="space-y-3 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={s.enabled} disabled={!canEdit} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
          Escalate automatically
        </label>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="py-1">Priority</th>
                <th className="py-1">Respond within (hours)</th>
                <th className="py-1">Fix within (hours)</th>
              </tr>
            </thead>
            <tbody>
              {ESCALATION_PRIORITIES.map((p) => (
                <tr key={p}>
                  <td className="py-1 pr-3 font-medium">{PRIORITY_LABEL[p]}</td>
                  <td className="py-1 pr-3">
                    <Input type="number" min={0.25} step="0.25" className="w-28" disabled={!canEdit} value={s.responseHours[p]} onChange={(e) => setHours('responseHours', p, e.target.value)} />
                  </td>
                  <td className="py-1">
                    <Input type="number" min={1} className="w-28" disabled={!canEdit} value={s.resolveHours[p]} onChange={(e) => setHours('resolveHours', p, e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-500">
          Past the response time the agent and agency admin are told. At twice the response time with nobody assigned, or past the fix
          time, it goes to the agency admin again. At twice the fix time it goes to the platform team.
        </p>
        <label className="block text-sm">
          <span className="font-medium text-ink">Help desk tickets escalate after (hours without a reply)</span>
          <Input type="number" min={1} className="mt-1 w-28" disabled={!canEdit} value={s.supportResponseHours} onChange={(e) => setS({ ...s, supportResponseHours: Number(e.target.value) })} />
        </label>
      </Card>
      <Card className="space-y-3 p-4">
        <h3 className="font-semibold text-ink-900">Rent increases</h3>
        <label className="block text-sm">
          <span className="font-medium text-ink">Default yearly increase for leases without their own (%)</span>
          <Input
            type="number"
            min={0}
            step="0.5"
            placeholder="None"
            className="mt-1 w-28"
            disabled={!canEdit}
            value={s.defaultRentEscalationPct ?? ''}
            onChange={(e) => setS({ ...s, defaultRentEscalationPct: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Tell tenant, landlord and agent this many days before</span>
          <Input type="number" min={0} className="mt-1 w-28" disabled={!canEdit} value={s.rentNoticeDays} onChange={(e) => setS({ ...s, rentNoticeDays: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={s.autoApplyRent} disabled={!canEdit} onChange={(e) => setS({ ...s, autoApplyRent: e.target.checked })} />
          Raise the rent automatically on the increase date
        </label>
      </Card>
      {canEdit ? (
        <Button disabled={saving} onClick={() => void save()}>
          Save rules
        </Button>
      ) : (
        <p className="text-sm text-ink-500">Only agency administrators can change these rules.</p>
      )}
    </div>
  )
}

export default function EscalationsPage() {
  const { role } = useAuth()
  const [tab, setTab] = useState<Tab>('issues')
  const [data, setData] = useState<{ escalations: Escalation[]; rent: RentEscalationRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const canEdit = role === 'super_admin' || role === 'client_admin' || role === 'agent_admin'

  const load = useCallback(async () => {
    if (!isApiEnabled) return
    setLoading(true)
    setError(null)
    try {
      setData(await listEscalationsApi())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const issues = useMemo(
    () =>
      (data?.escalations ?? [])
        .filter((e) => showResolved || e.status !== 'resolved')
        .sort((a, b) => b.level - a.level || b.updatedAt.localeCompare(a.updatedAt)),
    [data, showResolved],
  )
  const openCount = (data?.escalations ?? []).filter((e) => e.status === 'open').length

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'issues', label: `Issues${openCount ? ` (${openCount})` : ''}` },
    { id: 'rent', label: 'Rent increases' },
    { id: 'rules', label: 'Rules' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Escalations"
        subtitle="Faults and tickets that waited too long, and upcoming rent increases."
        actions={
          <Button variant="secondary" disabled={loading || !isApiEnabled} onClick={() => void load()}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden /> Refresh
          </Button>
        }
      />
      {!isApiEnabled ? <Card className="p-4 text-sm text-ink-600">Escalations need the live server and are not available in demo mode.</Card> : null}
      {error ? <Card className="p-4 text-sm text-rose-700">{error}</Card> : null}
      <div className="flex flex-wrap gap-2 border-b border-primary-100">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-ink-500 hover:text-ink'}`}
          >
            {t.id === 'issues' ? <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden /> : null}
            {t.id === 'rent' ? <TrendingUp className="mr-1 inline h-4 w-4" aria-hidden /> : null}
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'issues' ? (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-ink-600">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            Show resolved (last 30 days)
          </label>
          {issues.length === 0 ? (
            <Card className="flex items-center gap-2 p-4 text-sm text-ink-600">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden /> Nothing is overdue right now.
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {issues.map((e) => (
                <IssueCard key={e.id} e={e} onChanged={() => void load()} />
              ))}
            </div>
          )}
        </div>
      ) : null}
      {tab === 'rent' ? <RentTable rows={data?.rent ?? []} /> : null}
      {tab === 'rules' ? <RulesForm canEdit={canEdit} /> : null}
    </div>
  )
}
