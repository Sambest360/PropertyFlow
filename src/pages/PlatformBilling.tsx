/**
 * Platform team: Lekaya subscription billing. Each agency is billed monthly
 * by portfolio size (price sheet) plus front-page advertising; invoices are
 * created on the 1st, payments are recorded here with proof, and unpaid
 * invoices escalate to the agency admins and then the platform team.
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CreditCard, FileText, RefreshCw, Settings2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { Badge, Button, Card, Input, Modal, PageHeader } from '../components/ui'
import { InvoiceList, PricingCard, RecordPaymentModal } from '../components/billing/BillingParts'
import { ScreeningPricingCard, ScreeningUsageCard } from '../components/screening/ScreeningBillingCards'
import { billingApi, formatRand, type AgencyBillingRow, type SaasInvoice } from '../lib/api/billingApi'
import type { AgencyBillingSettings } from '../lib/saasPricing'

export default function PlatformBilling() {
  const { user } = useAuth()
  const [agencies, setAgencies] = useState<AgencyBillingRow[]>([])
  const [invoices, setInvoices] = useState<SaasInvoice[]>([])
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [busy, setBusy] = useState(false)
  const [paying, setPaying] = useState<SaasInvoice | null>(null)
  const [editing, setEditing] = useState<AgencyBillingRow | null>(null)
  const [filter, setFilter] = useState<'open' | 'all'>('open')

  const load = async () => {
    setError('')
    try {
      const [a, i] = await Promise.all([billingApi.agencies(), billingApi.invoices()])
      setAgencies(a)
      setInvoices(i)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load billing')
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const runNow = async () => {
    setBusy(true)
    setFlash('')
    try {
      const r = await billingApi.run()
      setFlash(r.created ? `${r.created} invoice${r.created === 1 ? '' : 's'} created for this month.` : 'Every agency already has this month’s invoice.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create invoices')
    } finally {
      setBusy(false)
    }
  }

  const shown = useMemo(() => (filter === 'open' ? invoices.filter((i) => i.status !== 'PAID' && i.status !== 'VOID') : invoices), [invoices, filter])
  const owed = invoices.filter((i) => i.status !== 'PAID' && i.status !== 'VOID').reduce((a, i) => a + i.balance, 0)
  const overdue = invoices.filter((i) => i.status === 'OVERDUE' || (i.status !== 'PAID' && i.status !== 'VOID' && i.dueDate < new Date().toISOString().slice(0, 10))).length

  return (
    <RequirePermission permission="platform.manage">
      <div className="space-y-5">
        <PageHeader
          title="Billing"
          subtitle="Monthly Lekaya subscriptions: invoices go out on the 1st, payments are recorded here, and unpaid ones are escalated."
          actions={
            <Button onClick={() => void runNow()} disabled={busy}>
              <RefreshCw className="h-4 w-4" aria-hidden /> {busy ? 'Creating…' : 'Create this month’s invoices'}
            </Button>
          }
        />
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p> : null}
        {flash ? <p className="rounded-xl border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-ink-700" role="status">{flash}</p> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4"><p className="text-xs text-ink-500">Owed to Lekaya</p><p className="text-2xl font-bold tabular text-ink">{formatRand(owed)}</p></Card>
          <Card className="p-4"><p className="text-xs text-ink-500">Overdue invoices</p><p className={`text-2xl font-bold tabular ${overdue ? 'text-accent' : 'text-ink'}`}>{overdue}</p></Card>
          <Card className="p-4"><p className="text-xs text-ink-500">Agencies billed</p><p className="text-2xl font-bold tabular text-ink">{agencies.filter((a) => a.status === 'active' && !a.settings.exempt).length}</p></Card>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary-50 px-5 py-3">
            <h2 className="inline-flex items-center gap-2 font-semibold text-ink"><CreditCard className="h-5 w-5 text-primary" aria-hidden /> Invoices</h2>
            <div className="flex gap-1 text-sm" role="tablist">
              {(['open', 'all'] as const).map((f) => (
                <button key={f} role="tab" aria-selected={filter === f} type="button" onClick={() => setFilter(f)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 font-semibold ${filter === f ? 'bg-primary-50 text-primary' : 'text-ink-500 hover:text-ink'}`}>
                  {f === 'open' ? 'Not paid yet' : 'All'}
                </button>
              ))}
            </div>
          </div>
          <InvoiceList invoices={shown} showAgency onRecordPayment={setPaying} />
        </Card>

        <Card className="overflow-x-auto p-0" data-tip-target="billing-agencies">
          <div className="border-b border-primary-50 px-5 py-3">
            <h2 className="inline-flex items-center gap-2 font-semibold text-ink"><FileText className="h-5 w-5 text-primary" aria-hidden /> Agencies</h2>
            <p className="text-sm text-ink-500">Next invoice is worked out from the number of properties and featured listings today.</p>
          </div>
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="bg-primary-50/50 text-xs text-ink-500">
              <tr>
                <th className="px-5 py-2 font-semibold">Agency</th>
                <th className="px-5 py-2 font-semibold">Properties</th>
                <th className="px-5 py-2 font-semibold">Plan</th>
                <th className="px-5 py-2 font-semibold">Next invoice</th>
                <th className="px-5 py-2 font-semibold">Owes</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => (
                <tr key={a.agencyId} className="border-t border-primary-50">
                  <td className="px-5 py-2.5">
                    <p className="font-semibold text-ink">{a.name}</p>
                    <p className="text-xs text-ink-500">{a.status}{a.settings.exempt ? ' · not billed' : ''}</p>
                  </td>
                  <td className="px-5 py-2.5 tabular">{a.draft.propertyCount}<span className="text-xs text-ink-500"> · {a.draft.advertisedCount} advertised</span></td>
                  <td className="px-5 py-2.5">{a.draft.tierLabel}{a.settings.customMonthlyFee != null ? <Badge tone="info">Agreed fee</Badge> : null}</td>
                  <td className="px-5 py-2.5 tabular">
                    {a.draft.needsAgreedFee ? (
                      <span className="inline-flex items-center gap-1 text-accent"><AlertTriangle className="h-4 w-4" aria-hidden /> Set agreed fee</span>
                    ) : (
                      <>{formatRand(a.draft.total)}<span className="text-xs text-ink-500"> incl. VAT{a.draft.lines.some((l) => l.label.startsWith('Once-off')) ? ' + sign-up' : ''}</span></>
                    )}
                  </td>
                  <td className={`px-5 py-2.5 tabular ${a.overdueCount ? 'font-semibold text-accent' : ''}`}>{a.balance ? formatRand(a.balance) : '—'}</td>
                  <td className="px-5 py-2.5 text-right">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(a)}><Settings2 className="h-4 w-4" aria-hidden /> Settings</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <PricingCard />
        <ScreeningUsageCard refreshKey={0} />
        <ScreeningPricingCard />

        <RecordPaymentModal invoice={paying} onClose={() => setPaying(null)} actorName={user.name}
          onSaved={(inv) => { setPaying(null); setFlash(`Payment recorded on ${inv.number}.`); void load() }} />
        {editing ? <AgencySettingsModal row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} /> : null}
      </div>
    </RequirePermission>
  )
}

function AgencySettingsModal({ row, onClose, onSaved }: { row: AgencyBillingRow; onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<AgencyBillingSettings>({ dueDay: 7, ...row.settings })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const num = (v: string) => (v.trim() === '' ? null : Number(v))
  const save = async () => {
    setBusy(true)
    try {
      await billingApi.saveSettings(row.agencyId, s)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Billing · ${row.name}`} description={`${row.draft.propertyCount} properties — ${row.draft.tierLabel}.`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void save()} disabled={busy}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm"><span className="font-medium text-ink">Agreed monthly fee (R, excl. VAT)</span>
          <Input className="mt-1" type="number" min="0" placeholder="Use the price sheet" value={s.customMonthlyFee ?? ''} onChange={(e) => setS({ ...s, customMonthlyFee: num(e.target.value) })} />
        </label>
        <label className="text-sm"><span className="font-medium text-ink">Agreed sign-up fee (R)</span>
          <Input className="mt-1" type="number" min="0" placeholder="Use the price sheet" value={s.customSignUpFee ?? ''} onChange={(e) => setS({ ...s, customSignUpFee: num(e.target.value) })} />
        </label>
        <label className="text-sm"><span className="font-medium text-ink">Invoices due on day</span>
          <Input className="mt-1" type="number" min="1" max="28" value={s.dueDay ?? 7} onChange={(e) => setS({ ...s, dueDay: Number(e.target.value) })} />
        </label>
        <div className="space-y-2 pt-6 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.signUpBilled === true} onChange={(e) => setS({ ...s, signUpBilled: e.target.checked })} /> Sign-up fee already billed or waived</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={s.exempt === true} onChange={(e) => setS({ ...s, exempt: e.target.checked })} /> Do not bill this agency</label>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700" role="alert">{error}</p> : null}
    </Modal>
  )
}
