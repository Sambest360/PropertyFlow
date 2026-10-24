import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button, Card } from '../ui'
import {
  formatCents,
  screeningApi,
  screeningApiAvailable,
  type ScreeningPrice,
  type ScreeningProviderChoice,
  type ScreeningUsageRow,
} from '../../lib/api/screeningApi'
import type { InvoiceLineItem } from '../../lib/billingEngine'
import { CHECK_TYPE_LABELS, priceWithMarkup, type ScreeningCheckType } from '../../lib/screening/consentTerms'

export function currentMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7)
}

/** Uninvoiced agency-paid screening charges for one agency and month, as an invoice line item. */
export async function screeningInvoiceLineItem(agencyId: string, month: string): Promise<InvoiceLineItem | null> {
  if (!screeningApiAvailable) return null
  const usage = await screeningApi.usage(month, agencyId)
  const rows = usage.rows.filter((r) => r.payer === 'AGENCY' && r.uninvoicedPriceCents > 0)
  const cents = rows.reduce((sum, r) => sum + r.uninvoicedPriceCents, 0)
  if (!cents) return null
  const count = rows.reduce((sum, r) => sum + r.count, 0)
  return { label: `Screening checks ${month} (${count})`, amount: cents / 100, kind: 'screening' }
}

/** Mark the charges as invoiced. The invoice persists asynchronously, so retry briefly on 409. */
export async function markScreeningInvoiced(agencyId: string, month: string, invoiceId: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await screeningApi.bill(agencyId, month, invoiceId)
      return
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status !== 409 || attempt === 3) throw err
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

export function ScreeningUsageCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const [month, setMonth] = useState(currentMonth())
  const [rows, setRows] = useState<ScreeningUsageRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await screeningApi.usage(month)
      setRows(res.rows)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load screening usage')
    }
  }, [month])

  useEffect(() => {
    if (screeningApiAvailable) void load()
  }, [load, refreshKey])

  if (!screeningApiAvailable) return null

  const byAgency = new Map<string, { name: string; count: number; cost: number; price: number; open: number }>()
  for (const r of rows) {
    const a = byAgency.get(r.agencyRef) ?? { name: r.agencyName, count: 0, cost: 0, price: 0, open: 0 }
    a.count += r.count
    a.cost += r.costCents ?? 0
    a.price += r.priceCents
    a.open += r.uninvoicedPriceCents
    byAgency.set(r.agencyRef, a)
  }

  return (
    <Card className="mt-6 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-ink-500" />
          <h2 className="font-semibold text-ink">Screening checks usage</h2>
        </div>
        <input
          type="month"
          className="h-10 rounded-xl border border-primary-100 bg-white px-3 text-sm"
          value={month}
          onChange={(e) => setMonth(e.target.value || currentMonth())}
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {byAgency.size === 0 ? (
        <p className="text-sm text-ink-500">No screening charges this month.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500">
                <th className="py-2 pr-3 font-medium">Agency</th>
                <th className="py-2 pr-3 font-medium">Checks</th>
                <th className="py-2 pr-3 font-medium">Cost</th>
                <th className="py-2 pr-3 font-medium">Price</th>
                <th className="py-2 font-medium">Not yet invoiced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-50">
              {[...byAgency.entries()].map(([ref, a]) => (
                <tr key={ref}>
                  <td className="py-2 pr-3">{a.name}</td>
                  <td className="tabular py-2 pr-3">{a.count}</td>
                  <td className="tabular py-2 pr-3">{formatCents(a.cost)}</td>
                  <td className="tabular py-2 pr-3">{formatCents(a.price)}</td>
                  <td className="tabular py-2">{formatCents(a.open)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-400">
        Agency-paid charges go on the agency’s invoice when you run its billing cycle. ERROR results are never charged.
      </p>
    </Card>
  )
}

type PriceDraft = { cost: string; markup: string }

export function ScreeningPricingCard() {
  const [providers, setProviders] = useState<ScreeningProviderChoice[]>([])
  const [prices, setPrices] = useState<ScreeningPrice[]>([])
  const [drafts, setDrafts] = useState<Record<string, PriceDraft>>({})
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await screeningApi.pricing()
      setProviders(res.providers)
      setPrices(res.prices)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not load prices')
    }
  }, [])

  useEffect(() => {
    if (screeningApiAvailable) void load()
  }, [load])

  if (!screeningApiAvailable) return null

  const key = (provider: string, type: ScreeningCheckType) => `${provider}:${type}`
  const draftFor = (provider: string, type: ScreeningCheckType): PriceDraft => {
    const existing = drafts[key(provider, type)]
    if (existing) return existing
    const p = prices.find((x) => x.provider === provider && x.checkType === type)
    return { cost: p?.costCents != null ? (p.costCents / 100).toFixed(2) : '0.00', markup: p?.markupBps != null ? String(p.markupBps / 100) : '0' }
  }
  const save = async (provider: string, type: ScreeningCheckType) => {
    const d = draftFor(provider, type)
    const costCents = Math.round(Number(d.cost) * 100)
    const markupBps = Math.round(Number(d.markup) * 100)
    if (!Number.isFinite(costCents) || costCents < 0 || !Number.isFinite(markupBps) || markupBps < 0) {
      setMessage('Cost and markup must be numbers ≥ 0.')
      return
    }
    try {
      await screeningApi.setPrice({ provider, checkType: type, costCents, markupBps })
      setDrafts((all) => {
        const next = { ...all }
        delete next[key(provider, type)]
        return next
      })
      setMessage('Saved.')
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save price')
    }
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="font-semibold text-ink">Screening prices</h2>
      <p className="mt-1 text-xs text-ink-500">Price = cost × (1 + markup). Set per provider and check.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-500">
              <th className="py-2 pr-3 font-medium">Provider</th>
              <th className="py-2 pr-3 font-medium">Check</th>
              <th className="py-2 pr-3 font-medium">Cost (R)</th>
              <th className="py-2 pr-3 font-medium">Markup (%)</th>
              <th className="py-2 pr-3 font-medium">Price</th>
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-50">
            {providers.flatMap((p) =>
              p.supports.map((type) => {
                const d = draftFor(p.id, type)
                const preview = priceWithMarkup(Math.round(Number(d.cost) * 100) || 0, Math.round(Number(d.markup) * 100) || 0)
                const setDraft = (patch: Partial<PriceDraft>) =>
                  setDrafts((all) => ({ ...all, [key(p.id, type)]: { ...d, ...patch } }))
                return (
                  <tr key={key(p.id, type)}>
                    <td className="py-2 pr-3">
                      {p.name}
                      {p.configured ? '' : <span className="text-xs text-ink-400"> (not configured)</span>}
                    </td>
                    <td className="py-2 pr-3">{CHECK_TYPE_LABELS[type]}</td>
                    <td className="py-2 pr-3">
                      <input
                        className="h-9 w-24 rounded-lg border border-primary-100 px-2 text-sm"
                        inputMode="decimal"
                        value={d.cost}
                        onChange={(e) => setDraft({ cost: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className="h-9 w-20 rounded-lg border border-primary-100 px-2 text-sm"
                        inputMode="decimal"
                        value={d.markup}
                        onChange={(e) => setDraft({ markup: e.target.value })}
                      />
                    </td>
                    <td className="tabular py-2 pr-3">{formatCents(preview)}</td>
                    <td className="py-2">
                      {drafts[key(p.id, type)] ? (
                        <Button type="button" size="sm" variant="secondary" onClick={() => void save(p.id, type)}>
                          Save
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                )
              }),
            )}
          </tbody>
        </table>
      </div>
      {message ? <p className="mt-2 text-xs text-ink-500">{message}</p> : null}
    </Card>
  )
}
