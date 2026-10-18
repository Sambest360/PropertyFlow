import { useRef, useState, type FormEvent } from 'react'
import { acquireSubmitLock, releaseSubmitLock } from '../../lib/wizardSubmitGuard'
import { Link } from 'react-router-dom'
import { Wrench } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { TICKET_NOT_SAVED_MESSAGE } from '../../lib/maintenanceApi'
import {
  TENANT_TICKET_PRIORITIES,
  tenantPriorityToApi,
  type TenantTicketPriority,
} from '../../lib/tenantTicketPriority'
import type { TenantPortalState } from '../../hooks/useTenantPortalState'
import { Badge, Button, Card, Input, Select, statusTone } from '../../components/ui'

export function TenantMaintenanceView({ portal }: { portal: TenantPortalState }) {
  const { state, createMaintenanceTicket } = useStore()
  const [title, setTitle] = useState('')
  const [assetLabel, setAssetLabel] = useState('Kitchen tap')
  const [priority, setPriority] = useState<TenantTicketPriority>('Medium')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  const submitLockRef = useRef(false)

  const maintenanceTickets = portal.tickets.filter((t) => !t.title.startsWith('Complaint:'))
  const openCount = maintenanceTickets.filter((t) => t.status !== 'Completed').length

  const submitTicket = async (e: FormEvent) => {
    e.preventDefault()
    if (!acquireSubmitLock(submitLockRef)) return
    if (!title.trim()) {
      releaseSubmitLock(submitLockRef)
      return
    }
    setBusy(true)
    const propId = portal.tenancy?.propertyId ?? portal.property?.id
    if (!propId) {
      setDone('No property linked to your tenancy yet.')
      setBusy(false)
      releaseSubmitLock(submitLockRef)
      return
    }
    const prop = state.properties.find((p) => p.id === propId)
    if (!prop?.unitId) {
      setDone('No unit linked to your occupancy yet.')
      setBusy(false)
      releaseSubmitLock(submitLockRef)
      return
    }
    const matchedAsset = state.internalAssets.find(
      (a) =>
        a.unitId === prop.unitId &&
        a.itemName.toLowerCase().includes(assetLabel.trim().toLowerCase().split(' ')[0] || ''),
    )
    const category = /microwave|fridge|washer|appliance/i.test(assetLabel + title)
      ? 'APPLIANCE_FAILURE'
      : /tap|geyser|plumb|leak/i.test(assetLabel + title)
        ? 'PLUMBING'
        : /intercom|plug|light|electric/i.test(assetLabel + title)
          ? 'ELECTRICAL'
          : 'GENERAL'
    const result = createMaintenanceTicket({
      actorUserId: portal.user.id,
      propertyId: propId,
      request: {
        unit_id: prop.unitId,
        internal_asset_id: matchedAsset?.id ?? null,
        category_key: category,
        priority: tenantPriorityToApi(priority),
        title: title.trim(),
        description: `Tenant-reported via portal (${assetLabel}). Routed to agency/agent — not the landlord. ${title.trim()}`,
      },
    })
    if (result.status === 'ERROR') {
      setDone(result.error)
      setBusy(false)
      releaseSubmitLock(submitLockRef)
      return
    }
    if (!(await result.saved)) {
      setDone(TICKET_NOT_SAVED_MESSAGE)
      setBusy(false)
      releaseSubmitLock(submitLockRef)
      return
    }
    setDone(
      `Request ${result.ticket_id} sent${result.warrantyCovered ? ' · warranty detected' : ''}${result.ticket.contractorId ? ' · vendor auto-routed' : ''}.`,
    )
    setTitle('')
    setBusy(false)
    releaseSubmitLock(submitLockRef)
  }

  if (!portal.occupancyReady) {
    return (
      <Card className="p-6 text-sm text-ink-500">
        Maintenance requests unlock once your application is approved and you have an active tenancy.{' '}
        <Link className="font-semibold text-primary" to="/workspace/portals/tenant/applications">
          View applications
        </Link>
      </Card>
    )
  }

  return (
    <div className="space-y-5" data-tip-target="tenant-maintenance">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <Wrench className="h-5 w-5 text-primary" strokeWidth={1.6} aria-hidden />
          Maintenance
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Report repairs for {portal.property?.title ?? 'your home'}. Requests go to your agency —
          not the landlord.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold text-ink">Report an issue</h3>
          <form className="mt-3 space-y-3" onSubmit={submitTicket}>
            <Input
              placeholder="What's broken?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              placeholder="Asset (e.g. geyser)"
              value={assetLabel}
              onChange={(e) => setAssetLabel(e.target.value)}
            />
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
            >
              {TENANT_TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm" className="min-h-11 cursor-pointer" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit to agency'}
            </Button>
            {done ? <p className="text-xs text-ink-500">{done}</p> : null}
          </form>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-ink">Your requests</h3>
            <Badge tone={openCount > 0 ? 'warning' : 'success'}>
              {openCount} open
            </Badge>
          </div>
          <ul className="mt-3 space-y-2">
            {maintenanceTickets.slice(0, 8).map((t) => (
              <li
                key={t.id}
                className="flex items-start justify-between gap-2 rounded-xl border border-primary-100 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink">{t.title}</p>
                  <p className="text-xs text-ink-400">{t.id}</p>
                </div>
                <Badge tone={statusTone(t.status)}>{t.status}</Badge>
              </li>
            ))}
            {maintenanceTickets.length === 0 ? (
              <li className="text-sm text-ink-400">No maintenance requests yet.</li>
            ) : null}
          </ul>
        </Card>
      </div>
    </div>
  )
}
