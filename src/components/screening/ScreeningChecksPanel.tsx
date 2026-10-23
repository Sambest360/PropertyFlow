import { useCallback, useEffect, useState } from 'react'
import { Badge, Button } from '../ui'
import { DetailSection } from '../detail/FlatFields'
import {
  formatCents,
  screeningApi,
  screeningApiAvailable,
  type ScreeningCheckSummary,
  type ScreeningChecksResponse,
} from '../../lib/api/screeningApi'
import {
  CHECK_TYPE_LABELS,
  SCREENING_CHECK_TYPES,
  type ScreeningCheckStatus,
  type ScreeningCheckType,
} from '../../lib/screening/consentTerms'

const STATUS_TONE: Record<ScreeningCheckStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  PASSED: 'success',
  FAILED: 'danger',
  REFER: 'warning',
  ERROR: 'danger',
  CANCELLED: 'neutral',
  REQUESTED: 'neutral',
  IN_PROGRESS: 'neutral',
}

const OUTCOME_TONE = { PASS: 'success', FAIL: 'danger', PENDING: 'neutral' } as const

function statusLabel(status: ScreeningCheckStatus): string {
  return status === 'IN_PROGRESS' ? 'In progress' : status.charAt(0) + status.slice(1).toLowerCase()
}

function summaryLine(check: ScreeningCheckSummary): string {
  const s = check.summary ?? {}
  const parts: string[] = []
  if (typeof s.band === 'string') parts.push(`Band ${s.band}`)
  if (typeof s.score === 'number') parts.push(`Score ${s.score}`)
  if (s.mock === true) parts.push('test provider')
  if (typeof s.error === 'string') parts.push(`Error: ${s.error}`)
  return parts.join(' · ')
}

function latestByType(checks: ScreeningCheckSummary[]): Partial<Record<ScreeningCheckType, ScreeningCheckSummary>> {
  const out: Partial<Record<ScreeningCheckType, ScreeningCheckSummary>> = {}
  for (const c of checks) {
    const prev = out[c.checkType]
    if (!prev || c.requestedAt > prev.requestedAt || (c.requestedAt === prev.requestedAt && c.attempt > prev.attempt)) {
      out[c.checkType] = c
    }
  }
  return out
}

/**
 * Server-backed screening checks for one application (POST/GET /api/screening/checks).
 * Staff: request buttons, statuses and a cost preview. Landlords: pass/fail only.
 */
export function ScreeningChecksPanel({ applicationId }: { applicationId: string }) {
  const [data, setData] = useState<ScreeningChecksResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<ScreeningCheckType | null>(null)
  const [full, setFull] = useState<{ id: string; result: unknown } | null>(null)

  const load = useCallback(async () => {
    if (!screeningApiAvailable) return
    try {
      setData(await screeningApi.listChecks(applicationId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load checks')
    }
  }, [applicationId])

  useEffect(() => {
    void load()
  }, [load])

  const request = async (type: ScreeningCheckType) => {
    setBusy(type)
    setError(null)
    try {
      let res = await screeningApi.requestCheck(applicationId, type)
      if (res.reused && window.confirm(`${res.message ?? 'A recent check exists.'}\n\nRun and pay for a new check?`)) {
        res = await screeningApi.requestCheck(applicationId, type, true)
      }
      if (!res.ok) setError(res.message ?? 'Every provider returned an error. Nothing was charged.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not request the check')
    } finally {
      setBusy(null)
    }
  }

  const viewFull = async (id: string) => {
    if (full?.id === id) {
      setFull(null)
      return
    }
    try {
      const res = await screeningApi.fullResult(id)
      setFull({ id, result: res.result })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the full result')
    }
  }

  if (!screeningApiAvailable) {
    return (
      <DetailSection title="Checks" subtitle="ID, bank and credit checks run on the server.">
        <p className="text-sm text-ink-500">Screening checks need the API server.</p>
      </DetailSection>
    )
  }

  if (data?.view === 'landlord') {
    return (
      <DetailSection title="Checks" subtitle="Outcome only. The agency holds the full results.">
        {data.checks.length === 0 ? (
          <p className="text-sm text-ink-500">No checks yet.</p>
        ) : (
          <ul className="divide-y divide-primary-50">
            {data.checks.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{CHECK_TYPE_LABELS[c.checkType]}</span>
                <Badge tone={OUTCOME_TONE[c.outcome]}>{c.outcome === 'PENDING' ? 'Pending' : c.outcome === 'PASS' ? 'Pass' : 'Fail'}</Badge>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
    )
  }

  if (data?.view === 'subject') {
    return (
      <DetailSection title="Your checks">
        {data.checks.length === 0 ? (
          <p className="text-sm text-ink-500">No checks have been run yet.</p>
        ) : (
          <ul className="divide-y divide-primary-50">
            {data.checks.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{CHECK_TYPE_LABELS[c.checkType]}</span>
                <Badge tone={STATUS_TONE[c.status]}>{statusLabel(c.status)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
    )
  }

  const staff = data?.view === 'staff' ? data : null
  const latest = latestByType(staff?.checks ?? [])
  const types = SCREENING_CHECK_TYPES.filter((t) => staff?.enabledChecks.includes(t))

  return (
    <DetailSection
      title="Checks"
      subtitle="Each check needs the applicant’s current consent. Viewing a full result is logged."
    >
      {error ? (
        <p role="alert" className="mb-3 rounded-xl bg-accent-50 px-3 py-2 text-sm text-ink">
          {error}
        </p>
      ) : null}
      {!staff ? (
        <p className="text-sm text-ink-500">Loading checks…</p>
      ) : (
        <ul className="divide-y divide-primary-50">
          {types.map((type) => {
            const check = latest[type]
            const quote = staff.quotes[type]
            const consented = staff.consentCovers[type] === true
            return (
              <li key={type} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{CHECK_TYPE_LABELS[type]}</p>
                  {check ? (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                      <Badge tone={STATUS_TONE[check.status]}>{statusLabel(check.status)}</Badge>
                      <span>{check.providerName}</span>
                      {summaryLine(check) ? <span>{summaryLine(check)}</span> : null}
                      <span>{new Date(check.requestedAt).toLocaleDateString()}</span>
                      {check.purged ? <span>Full result deleted after retention</span> : null}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-ink-500">Not run</p>
                  )}
                  <p className="mt-1 text-xs text-ink-400">
                    {quote
                      ? `${formatCents(quote.priceCents)} via ${quote.providerName} · paid by ${quote.payer === 'APPLICANT' ? 'applicant' : 'agency'}`
                      : 'No provider configured'}
                    {consented ? '' : ' · waiting for applicant consent'}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {staff.canViewFull && check && !check.purged && ['PASSED', 'FAILED', 'REFER'].includes(check.status) ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => void viewFull(check.id)}>
                      {full?.id === check.id ? 'Hide full result' : 'View full result'}
                    </Button>
                  ) : null}
                  {staff.canRequest ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={!consented || !quote || busy != null}
                      onClick={() => void request(type)}
                    >
                      {busy === type ? 'Requesting…' : check ? 'Run again' : 'Request'}
                    </Button>
                  ) : null}
                </div>
                {full && check && full.id === check.id ? (
                  <pre className="mt-2 max-h-64 w-full overflow-auto rounded-xl bg-primary-50 p-3 text-xs text-ink sm:order-last">
                    {JSON.stringify(full.result, null, 2)}
                  </pre>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </DetailSection>
  )
}
