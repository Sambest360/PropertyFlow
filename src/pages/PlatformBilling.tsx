import { useMemo, useState } from 'react'
import { Calculator, CreditCard, RefreshCw } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { RequirePermission } from '../components/RequirePermission'
import { Badge, Button, Card, PageHeader, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'
import { calculateUsage, type PlatformInvoice } from '../lib/billingEngine'

export default function PlatformBilling() {
  const { state, runClientBillingCycle, markInvoicePaid } = useStore()
  const [selectedClient, setSelectedClient] = useState(state.agencies[0]?.id ?? '')

  const planById = useMemo(
    () => Object.fromEntries(state.billingPlans.map((p) => [p.id, p])),
    [state.billingPlans],
  )
  const agencyName = useMemo(
    () => Object.fromEntries(state.agencies.map((a) => [a.id, a.name])),
    [state.agencies],
  )

  const preview = useMemo(() => {
    const sub = state.clientSubscriptions.find((s) => s.clientId === selectedClient)
    const plan = sub ? planById[sub.planId] : undefined
    if (!sub || !plan) return null
    return {
      sub,
      plan,
      usage: calculateUsage(
        {
          clientId: selectedClient,
          buildings: state.buildings,
          units: state.units,
          rooms: state.infraRooms,
        },
        plan,
      ),
    }
  }, [selectedClient, state, planById])

  const invoices = useMemo(
    () =>
      [...state.invoices].sort((a, b) => b.billingPeriodEnd.localeCompare(a.billingPeriodEnd)),
    [state.invoices],
  )

  return (
    <RequirePermission permission="platform.manage">
      <div className="animate-fade-in">
        <PageHeader
          title="Platform · SaaS billing"
          subtitle="Charge agencies by asset footprint — base fee + GLA + units/rooms + Grade P premium + 15% VAT."
        />

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          {state.billingPlans.map((p) => (
            <Card key={p.id} className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Plan</p>
              <h2 className="mt-1 font-display text-xl font-semibold text-ink">{p.planName}</h2>
              <p className="mt-2 tabular text-2xl font-bold text-ink">{formatZAR(p.baseMonthlyFee)}</p>
              <p className="text-xs text-ink-500">base / month</p>
              <ul className="mt-4 space-y-1 text-sm text-ink-600">
                <li>R{p.perSqmRate.toFixed(4)} / m² GLA</li>
                <li>R{p.perUnitRate.toFixed(2)} / unit</li>
                <li>R{p.perRoomRate.toFixed(2)} / room</li>
                <li>R{p.gradePPremiumFee.toLocaleString()} Grade P premium / building</li>
              </ul>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Calculator className="h-5 w-5 text-ink-500" />
              <h2 className="font-semibold text-ink">Usage calculator</h2>
            </div>
            <label className="mb-2 block text-xs font-medium text-ink-500">Client (agency)</label>
            <select
              className="mb-4 h-10 w-full rounded-xl border border-primary-100 bg-white px-3 text-sm"
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
            >
              {state.agencies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            {preview ? (
              <>
                <p className="mb-3 text-sm text-ink-600">
                  On <strong>{preview.plan.planName}</strong> · anchor day{' '}
                  {preview.sub.billingCycleAnchorDay} ·{' '}
                  <Badge tone={statusTone(preview.sub.status)}>{preview.sub.status}</Badge>
                </p>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-ink-500">Units</dt>
                    <dd className="tabular font-semibold">{preview.usage.unitCount}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Rooms</dt>
                    <dd className="tabular font-semibold">{preview.usage.roomCount}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Total GLA</dt>
                    <dd className="tabular font-semibold">{preview.usage.totalGlaSqm} m²</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Grade P buildings</dt>
                    <dd className="tabular font-semibold">{preview.usage.gradePBuildingCount}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Asset usage</dt>
                    <dd className="tabular font-semibold">{formatZAR(preview.usage.assetUsageAmount)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-500">Est. total (ex VAT)</dt>
                    <dd className="tabular font-semibold">
                      {formatZAR(preview.plan.baseMonthlyFee + preview.usage.assetUsageAmount)}
                    </dd>
                  </div>
                </dl>
                <Button
                  className="mt-5"
                  onClick={() => {
                    const inv = runClientBillingCycle(selectedClient)
                    if (!inv) return
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  Run billing cycle (midnight worker)
                </Button>
              </>
            ) : (
              <p className="text-sm text-ink-500">No active subscription for this client.</p>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-ink-500" />
              <h2 className="font-semibold text-ink">Invoices</h2>
            </div>
            <ul className="divide-y divide-primary-100">
              {invoices.length === 0 && (
                <li className="py-6 text-sm text-ink-500">No invoices yet — run a billing cycle.</li>
              )}
              {invoices.map((inv: PlatformInvoice) => (
                <li key={inv.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-ink">
                      {agencyName[inv.clientId] ?? inv.clientId}{' '}
                      <Badge tone={statusTone(inv.paymentStatus)}>{inv.paymentStatus}</Badge>
                    </p>
                    <p className="text-xs text-ink-500">
                      {inv.billingPeriodStart} → {inv.billingPeriodEnd} · Base{' '}
                      {formatZAR(inv.baseAmount)} · Usage {formatZAR(inv.assetUsageAmount)} · VAT{' '}
                      {formatZAR(inv.vatAmount)}
                    </p>
                    <p className="tabular mt-1 text-sm font-semibold text-ink">
                      {formatZAR(inv.totalAmountDue)} due
                    </p>
                  </div>
                  {inv.paymentStatus === 'UNPAID' && (
                    <Button size="sm" variant="secondary" onClick={() => markInvoicePaid(inv.id)}>
                      Mark paid
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="mt-6 p-5">
          <h2 className="font-semibold text-ink">Subscriptions</h2>
          <ul className="mt-3 divide-y divide-primary-100">
            {state.clientSubscriptions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">{agencyName[s.clientId] ?? s.clientId}</p>
                  <p className="text-xs text-ink-500">
                    {planById[s.planId]?.planName ?? s.planId} · billed on day {s.billingCycleAnchorDay}
                  </p>
                </div>
                <Badge tone={statusTone(s.status)}>{s.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </RequirePermission>
  )
}
