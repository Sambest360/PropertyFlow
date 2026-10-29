/**
 * Super admin: storage used by each agency, with an allowance per agency.
 * Data comes from GET /api/admin/storage (server/agencyStorage.ts); opening the
 * page also sends alerts for agencies near or over their allowance.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { HardDrive, Minus, Plus, RefreshCw } from 'lucide-react'
import { actorHeaders } from '../../lib/api/actorAuth'
import { resolveApiAuthorizationHeader } from '../../lib/api/authClient'
import { isApiEnabled } from '../../lib/api/config'
import { Badge, Button, Card, Input, PageHeader } from '../../components/ui'
import { sweetSuccess, sweetWarning } from '../../lib/sweetAlert'

type Level = 'ok' | 'warning' | 'exceeded' | 'unlimited'
type Row = {
  clientId: string
  agencyId: string
  name: string
  dbBytes: number
  fileBytes: number
  usedBytes: number
  quotaMb: number | null
  warnPct: number
  level: Level
  percent: number | null
}

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''
const MB = 1024 * 1024
const STEP_MB = 1024

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...(await resolveApiAuthorizationHeader()) },
  })
  const body = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error(body.message || `Request failed (${res.status})`)
  return body
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(2)} GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`
  return `${Math.max(0, Math.round(bytes / 1024))} KB`
}

function formatQuota(mb: number | null): string {
  if (mb == null) return 'Unlimited'
  return mb >= 1024 ? `${+(mb / 1024).toFixed(2)} GB` : `${mb} MB`
}

const LEVEL_LABEL: Record<Level, string> = {
  ok: 'Healthy',
  warning: 'Nearly full',
  exceeded: 'Over allowance',
  unlimited: 'No allowance set',
}
const LEVEL_TONE: Record<Level, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ok: 'success',
  warning: 'warning',
  exceeded: 'danger',
  unlimited: 'neutral',
}
const BAR_COLOR: Record<Level, string> = {
  ok: 'bg-emerald-500',
  warning: 'bg-amber-500',
  exceeded: 'bg-rose-600',
  unlimited: 'bg-primary-300',
}

function AgencyStorageCard({ row, onSaved }: { row: Row; onSaved: () => void }) {
  const [quotaGb, setQuotaGb] = useState(row.quotaMb == null ? '' : String(+(row.quotaMb / 1024).toFixed(2)))
  const [warnPct, setWarnPct] = useState(String(row.warnPct))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setQuotaGb(row.quotaMb == null ? '' : String(+(row.quotaMb / 1024).toFixed(2)))
    setWarnPct(String(row.warnPct))
  }, [row.quotaMb, row.warnPct])

  const save = async (nextQuotaMb: number | null, nextWarn = Number(warnPct)) => {
    setSaving(true)
    try {
      await api(`/api/admin/storage/${encodeURIComponent(row.agencyId)}`, {
        method: 'PUT',
        body: JSON.stringify({ quotaMb: nextQuotaMb, warnPct: nextWarn }),
      })
      await sweetSuccess('Allowance saved', `${row.name}: ${formatQuota(nextQuotaMb)}, warning at ${nextWarn}%.`)
      onSaved()
    } catch (e) {
      await sweetWarning('Could not save', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const step = (dir: 1 | -1) => {
    const current = row.quotaMb ?? 0
    const next = Math.max(STEP_MB, current + dir * STEP_MB)
    void save(next)
  }

  const fill = row.quotaMb ? Math.min(100, (row.usedBytes / (row.quotaMb * MB)) * 100) : 0

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ink-900">{row.name}</h3>
          <p className="text-sm text-ink-500">
            {formatBytes(row.usedBytes)} used of {formatQuota(row.quotaMb)}
            {row.percent != null ? ` (${row.percent}%)` : ''}
          </p>
        </div>
        <Badge tone={LEVEL_TONE[row.level]}>{LEVEL_LABEL[row.level]}</Badge>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-primary-50" aria-hidden>
        <div className={`h-full rounded-full ${BAR_COLOR[row.level]}`} style={{ width: `${row.quotaMb ? fill : 0}%` }} />
      </div>
      <p className="text-xs text-ink-500">
        Files and photos {formatBytes(row.fileBytes)} · Records {formatBytes(row.dbBytes)}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Button size="sm" variant="secondary" disabled={saving || !row.quotaMb || row.quotaMb <= STEP_MB} onClick={() => step(-1)} aria-label="Decrease by 1 GB">
          <Minus className="h-4 w-4" aria-hidden /> 1 GB
        </Button>
        <Button size="sm" variant="secondary" disabled={saving} onClick={() => step(1)} aria-label="Increase by 1 GB">
          <Plus className="h-4 w-4" aria-hidden /> 1 GB
        </Button>
        <label className="text-xs text-ink-600">
          Allowance (GB)
          <Input
            className="mt-1 w-28"
            type="number"
            min={0}
            step="0.5"
            placeholder="Unlimited"
            value={quotaGb}
            onChange={(e) => setQuotaGb(e.target.value)}
          />
        </label>
        <label className="text-xs text-ink-600">
          Warn me at (%)
          <Input
            className="mt-1 w-24"
            type="number"
            min={1}
            max={100}
            value={warnPct}
            onChange={(e) => setWarnPct(e.target.value)}
          />
        </label>
        <Button
          size="sm"
          disabled={saving}
          onClick={() => void save(quotaGb.trim() === '' ? null : Math.round(Number(quotaGb) * 1024))}
        >
          Save
        </Button>
      </div>
    </Card>
  )
}

export default function AdminStoragePage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const out = await api<{ agencies: Row[] }>('/api/admin/storage')
      setRows(out.agencies)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isApiEnabled) void load()
  }, [load])

  const summary = useMemo(() => {
    if (!rows) return null
    return {
      total: rows.reduce((n, r) => n + r.usedBytes, 0),
      warning: rows.filter((r) => r.level === 'warning').length,
      exceeded: rows.filter((r) => r.level === 'exceeded').length,
    }
  }, [rows])

  const sorted = useMemo(() => {
    const rank: Record<Level, number> = { exceeded: 0, warning: 1, ok: 2, unlimited: 3 }
    return [...(rows ?? [])].sort((a, b) => rank[a.level] - rank[b.level] || b.usedBytes - a.usedBytes)
  }, [rows])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Storage"
        subtitle="See how much space each agency uses, set their allowance and get warned before they run out."
        actions={
          <Button variant="secondary" disabled={loading || !isApiEnabled} onClick={() => void load()}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden /> Refresh
          </Button>
        }
      />
      {!isApiEnabled ? (
        <Card className="p-4 text-sm text-ink-600">Storage tracking needs the live server and is not available in demo mode.</Card>
      ) : null}
      {error ? (
        <Card className="border-rose-200 p-4 text-sm text-rose-700">{error}</Card>
      ) : null}
      {summary ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Total used</p>
            <p className="mt-1 inline-flex items-center gap-2 text-xl font-semibold text-ink-900">
              <HardDrive className="h-5 w-5 text-primary" aria-hidden /> {formatBytes(summary.total)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Nearly full</p>
            <p className="mt-1 text-xl font-semibold text-amber-700">{summary.warning}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Over allowance</p>
            <p className="mt-1 text-xl font-semibold text-rose-700">{summary.exceeded}</p>
          </Card>
        </div>
      ) : null}
      {loading && !rows ? <p className="text-sm text-ink-500">Measuring storage…</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {sorted.map((r) => (
          <AgencyStorageCard key={r.clientId} row={r} onSaved={() => void load()} />
        ))}
      </div>
    </div>
  )
}
