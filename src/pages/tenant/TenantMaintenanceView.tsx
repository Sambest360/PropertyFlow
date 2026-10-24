import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { acquireSubmitLock, releaseSubmitLock } from '../../lib/wizardSubmitGuard'
import { Link } from 'react-router-dom'
import { AlertTriangle, Phone, Wrench } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { TICKET_NOT_SAVED_MESSAGE } from '../../lib/maintenanceApi'
import {
  TENANT_TICKET_PRIORITIES,
  tenantPriorityToApi,
  type TenantTicketPriority,
} from '../../lib/tenantTicketPriority'
import type { TenantPortalState } from '../../hooks/useTenantPortalState'
import { Badge, Button, Card, Input, Select, Textarea, statusTone } from '../../components/ui'
import {
  EMERGENCY_CATEGORY,
  RULE_ROOM_GROUPS,
  guidanceHeading,
  rulePropertyType,
  seedRuleItems,
  tenantCategoryOptions,
  type TenantCategoryOption,
} from '../../lib/maintenanceRules'
import { propertyTypeToDb } from '../../lib/propertyType'
import { fetchUnitCategories } from '../../lib/api/maintenanceRules'

export function TenantMaintenanceView({ portal }: { portal: TenantPortalState }) {
  const { state, createMaintenanceTicket } = useStore()
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [categoryKey, setCategoryKey] = useState('')
  const [costNotice, setCostNotice] = useState(false)
  const [priority, setPriority] = useState<TenantTicketPriority>('Medium')
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  const submitLockRef = useRef(false)

  const propId = portal.tenancy?.propertyId ?? portal.property?.id
  const prop = propId ? state.properties.find((p) => p.id === propId) : undefined
  const unitRef = prop ? prop.backendId || prop.id : null
  const ruleType = rulePropertyType(propertyTypeToDb(prop?.type))
  // Offline / demo fallback: the platform template for the property type.
  const seedOptions = useMemo(() => tenantCategoryOptions(seedRuleItems(ruleType)), [ruleType])
  const [remote, setRemote] = useState<{ ref: string; categories: TenantCategoryOption[]; afterHoursPhone: string | null } | null>(null)
  useEffect(() => {
    if (!unitRef || !portal.occupancyReady) return
    let live = true
    fetchUnitCategories(unitRef)
      .then((r) => {
        if (live) setRemote({ ref: unitRef, categories: r.categories, afterHoursPhone: r.afterHoursPhone })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [unitRef, portal.occupancyReady])
  const loaded = remote && remote.ref === unitRef ? remote : null
  const options = loaded?.categories.length ? loaded.categories : seedOptions
  const afterHoursPhone = loaded?.afterHoursPhone ?? null
  const selected = options.find((o) => o.categoryKey === categoryKey) ?? null
  const isEmergency = categoryKey === EMERGENCY_CATEGORY || priority === 'Emergency'
  const grouped = RULE_ROOM_GROUPS.map((g) => ({
    ...g,
    options: options.filter((o) => o.roomGroup === g.key),
  })).filter((g) => g.options.length > 0)

  const maintenanceTickets = portal.tickets.filter((t) => !t.title.startsWith('Complaint:'))
  const openCount = maintenanceTickets.filter((t) => t.status !== 'Completed').length

  const submitTicket = async (e: FormEvent) => {
    e.preventDefault()
    if (!acquireSubmitLock(submitLockRef)) return
    if (!title.trim()) {
      releaseSubmitLock(submitLockRef)
      return
    }
    if (!selected) {
      setDone('Choose what the problem is (or Emergency / Something else).')
      releaseSubmitLock(submitLockRef)
      return
    }
    if (selected.needsCostNotice && !costNotice && priority !== 'Emergency') {
      setDone('Please tick the cost notice to log this repair.')
      releaseSubmitLock(submitLockRef)
      return
    }
    setBusy(true)
    if (!propId) {
      setDone('No property linked to your tenancy yet.')
      setBusy(false)
      releaseSubmitLock(submitLockRef)
      return
    }
    if (!prop?.unitId) {
      setDone('No unit linked to your occupancy yet.')
      setBusy(false)
      releaseSubmitLock(submitLockRef)
      return
    }
    const effectivePriority: TenantTicketPriority = selected.categoryKey === EMERGENCY_CATEGORY ? 'Emergency' : priority
    const result = createMaintenanceTicket({
      actorUserId: portal.user.id,
      propertyId: propId,
      request: {
        unit_id: prop.unitId,
        internal_asset_id: null,
        category_key: selected.categoryKey,
        priority: tenantPriorityToApi(effectivePriority),
        title: title.trim(),
        description: `Tenant-reported via portal (${selected.label}). ${details.trim() || title.trim()}`,
        ...(selected.needsCostNotice && costNotice ? { cost_notice_acknowledged: true } : {}),
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
    setDetails('')
    setCostNotice(false)
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
          Report repairs for {portal.property?.title ?? 'your home'}. Requests go to your agency, which
          checks who is responsible under your lease.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold text-ink">Report an issue</h3>
          {isEmergency ? (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Emergency: this is always logged straight away.</p>
                <p className="mt-0.5">
                  If anyone is in danger, leave the area and call emergency services.
                  {afterHoursPhone ? (
                    <>
                      {' '}After hours, call your agency on{' '}
                      <a className="inline-flex items-center gap-1 font-semibold underline" href={`tel:${afterHoursPhone.replace(/\s+/g, '')}`}>
                        <Phone className="h-3.5 w-3.5" aria-hidden />
                        {afterHoursPhone}
                      </a>
                      .
                    </>
                  ) : (
                    ' Call your agency as well.'
                  )}
                </p>
              </div>
            </div>
          ) : null}
          <form className="mt-3 space-y-3" onSubmit={submitTicket}>
            <label className="block text-xs font-medium text-ink-500" htmlFor="tenant-maint-category">
              What needs fixing?
            </label>
            <Select
              id="tenant-maint-category"
              value={categoryKey}
              onChange={(e) => {
                setCategoryKey(e.target.value)
                setCostNotice(false)
              }}
            >
              <option value="">Choose a category…</option>
              {grouped.map((g) => (
                <optgroup key={g.key} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.categoryKey} value={o.categoryKey}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            {selected ? (
              <div
                className="rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-2 text-sm"
                data-testid="maintenance-guidance"
              >
                <p className="font-semibold text-ink">{guidanceHeading(selected.responsibleParty, selected.clauseRef)}</p>
                <p className="mt-0.5 text-ink-500">{selected.guidanceText}</p>
                {selected.needsCostNotice ? (
                  <label className="mt-2 flex items-start gap-2 text-xs text-ink">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={costNotice}
                      onChange={(e) => setCostNotice(e.target.checked)}
                    />
                    <span>
                      I understand this repair is usually my cost under the lease and I may be quoted or charged for it.
                    </span>
                  </label>
                ) : null}
              </div>
            ) : null}
            <Input
              placeholder="What's broken?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              placeholder="Details (where, since when, anything already tried)"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
            {categoryKey === EMERGENCY_CATEGORY ? null : (
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
            )}
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
