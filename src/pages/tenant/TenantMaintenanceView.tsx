/**
 * Tenant "Faults": report something broken in the home. A fault goes to the
 * responsible person for the property (the assigned agent, else the agency
 * admins) and the landlord is told — the server writes those notifications
 * (server/faultDesk.ts). Staff keep working it as a maintenance ticket.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { acquireSubmitLock, releaseSubmitLock } from '../../lib/wizardSubmitGuard'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronDown, Phone, Siren, Wrench } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { TICKET_NOT_SAVED_MESSAGE } from '../../lib/maintenanceApi'
import { tenantPriorityToApi, type TenantTicketPriority } from '../../lib/tenantTicketPriority'
import type { TenantPortalState } from '../../hooks/useTenantPortalState'
import type { MaintenanceTicket } from '../../types/domain'
import { Badge, Button, Card, Input, Select, Textarea, cn, statusTone } from '../../components/ui'
import { ImageDropzone } from '../../components/ImageDropzone'
import { FaultConversation } from '../../components/faults/FaultConversation'
import { MAX_TICKET_PHOTOS, checkTicketPhotos } from '../../lib/photoLimits'
import { accessNotesFieldState, useTicketAccessNotesSupported } from '../../lib/ticketAccessNotes'
import {
  FAULT_URGENCIES,
  faultAge,
  faultStatusLabel,
  faultUrgencyLabel,
  similarOpenFaults,
  type FaultUrgency,
} from '../../lib/faults'
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

type LocalOverride = { status?: MaintenanceTicket['status']; tenantFeedback?: MaintenanceTicket['tenantFeedback'] }

export function TenantMaintenanceView({ portal }: { portal: TenantPortalState }) {
  const { state, createMaintenanceTicket } = useStore()
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [categoryKey, setCategoryKey] = useState('')
  const [costNotice, setCostNotice] = useState(false)
  const [urgency, setUrgency] = useState<FaultUrgency>('Medium')
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [accessNotes, setAccessNotes] = useState('')
  const accessNotesField = accessNotesFieldState(useTicketAccessNotesSupported())
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Record<string, LocalOverride>>({})
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
  const isEmergency = categoryKey === EMERGENCY_CATEGORY || urgency === 'Emergency'
  const grouped = RULE_ROOM_GROUPS.map((g) => ({
    ...g,
    options: options.filter((o) => o.roomGroup === g.key),
  })).filter((g) => g.options.length > 0)

  const faults = portal.tickets
    .filter((t) => !t.title.startsWith('Complaint:'))
    .map((t) => ({ ...t, ...overrides[t.id] }))
    .sort((a, b) => {
      const ea = a.priority === 'Emergency' && a.status !== 'Completed' ? 0 : 1
      const eb = b.priority === 'Emergency' && b.status !== 'Completed' ? 0 : 1
      if (ea !== eb) return ea - eb
      return (b.openedAtIso ?? b.openedAt).localeCompare(a.openedAtIso ?? a.openedAt)
    })
  const openCount = faults.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled').length
  const awaitingConfirm = faults.filter((t) => t.status === 'Completed' && t.tenantFeedback?.kind !== 'confirmed').length
  const similar = title.trim().length >= 4 || selected ? similarOpenFaults({ title, categoryKey: selected?.categoryKey }, faults) : []

  const submitTicket = async (e: FormEvent) => {
    e.preventDefault()
    if (!acquireSubmitLock(submitLockRef)) return
    const fail = (msg: string) => {
      setDone(msg)
      setBusy(false)
      releaseSubmitLock(submitLockRef)
    }
    if (!title.trim()) return fail('Say briefly what is broken.')
    if (!selected) return fail('Choose what the problem is (or Emergency / Something else).')
    if (selected.needsCostNotice && !costNotice && urgency !== 'Emergency') {
      return fail('Please tick the cost notice to report this fault.')
    }
    const photoCheck = checkTicketPhotos(photoUrls)
    if (photoCheck.ok === false) return fail(`Photos not accepted: ${photoCheck.reason}.`)
    setBusy(true)
    if (!propId) return fail('No property linked to your tenancy yet.')
    if (!prop?.unitId) return fail('No unit linked to your occupancy yet.')
    const effectivePriority: TenantTicketPriority = selected.categoryKey === EMERGENCY_CATEGORY ? 'Emergency' : urgency
    const result = createMaintenanceTicket({
      actorUserId: portal.user.id,
      propertyId: propId,
      request: {
        unit_id: prop.unitId,
        internal_asset_id: null,
        category_key: selected.categoryKey,
        priority: tenantPriorityToApi(effectivePriority),
        title: title.trim(),
        description: `Tenant-reported fault (${selected.label}). ${details.trim() || title.trim()}`,
        ...(selected.needsCostNotice && costNotice ? { cost_notice_acknowledged: true } : {}),
      },
      extras: {
        photoUrls: photoCheck.urls,
        ...(accessNotes.trim() && !accessNotesField.disabled ? { accessNotes: accessNotes.trim() } : {}),
      },
    })
    if (result.status === 'ERROR') return fail(result.error)
    if (!(await result.saved)) return fail(TICKET_NOT_SAVED_MESSAGE)
    setDone(
      `Fault ${result.ticket_id} sent to the person responsible for your home${effectivePriority === 'Emergency' ? ' as an EMERGENCY' : ''}. You will be notified of every update.`,
    )
    setTitle('')
    setDetails('')
    setCostNotice(false)
    setPhotoUrls([])
    setAccessNotes('')
    setUrgency('Medium')
    setBusy(false)
    releaseSubmitLock(submitLockRef)
  }

  if (!portal.occupancyReady) {
    return (
      <Card className="p-6 text-sm text-ink-500">
        Fault reporting unlocks once your application is approved and you have an active tenancy.{' '}
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
          Faults
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Report anything broken at {portal.property?.title ?? 'your home'}. It goes straight to the person responsible for
          your property, who checks who pays under your lease. Problems with the app itself? Use{' '}
          <Link className="font-semibold text-primary" to="/workspace/help#report">
            Report a problem
          </Link>
          .
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <h3 className="font-semibold text-ink">Report a fault</h3>
          {isEmergency ? (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Emergency: this is flagged to your agent straight away.</p>
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
            <Input placeholder="What's broken? e.g. Geyser leaking" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="What is broken" />
            {similar.length ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status" data-testid="fault-duplicate-hint">
                You already have an open fault that looks similar: {similar.map((t) => `“${t.title}”`).join(', ')}. You can add a
                message to it below instead.
              </p>
            ) : null}
            <Textarea
              placeholder="Details: where exactly, since when, anything you already tried"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              aria-label="Details"
            />
            {categoryKey === EMERGENCY_CATEGORY ? null : (
              <fieldset>
                <legend className="text-xs font-medium text-ink-500">How urgent is it?</legend>
                <div className="mt-1 grid gap-2 sm:grid-cols-3">
                  {FAULT_URGENCIES.map((u) => (
                    <label
                      key={u.key}
                      className={cn(
                        'flex min-h-11 cursor-pointer flex-col rounded-xl border px-3 py-2 text-sm',
                        urgency === u.key
                          ? u.key === 'Emergency'
                            ? 'border-red-300 bg-red-50'
                            : 'border-primary bg-primary-50'
                          : 'border-primary-100',
                      )}
                    >
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        <input
                          type="radio"
                          name="fault-urgency"
                          value={u.key}
                          checked={urgency === u.key}
                          onChange={() => setUrgency(u.key)}
                        />
                        {u.label}
                      </span>
                      <span className="text-xs text-ink-500">{u.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <ImageDropzone
              value={photoUrls}
              onChange={setPhotoUrls}
              max={MAX_TICKET_PHOTOS}
              label="Photos (optional)"
              hint="A clear photo helps the right person come prepared"
            />
            <label className="block text-xs font-medium text-ink-500">
              Access notes (optional)
              <Textarea
                className="mt-1"
                rows={2}
                value={accessNotes}
                disabled={accessNotesField.disabled}
                placeholder="Best time to come, gate code, pets, who will let them in"
                onChange={(e) => setAccessNotes(e.target.value)}
              />
              {accessNotesField.hint ? <span className="mt-1 block text-xs text-ink-500">{accessNotesField.hint}</span> : null}
            </label>
            <Button type="submit" size="sm" className="min-h-11 cursor-pointer" disabled={busy}>
              {busy ? 'Sending…' : isEmergency ? 'Report emergency' : 'Report fault'}
            </Button>
            {done ? (
              <p className="text-xs text-ink-500" role="status">
                {done}
              </p>
            ) : null}
          </form>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-ink">Your faults</h3>
            <div className="flex gap-1">
              {awaitingConfirm ? <Badge tone="info">{awaitingConfirm} to confirm</Badge> : null}
              <Badge tone={openCount > 0 ? 'warning' : 'success'}>{openCount} open</Badge>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {faults.slice(0, 20).map((t) => {
              const age = faultAge(t)
              const emergency = t.priority === 'Emergency' && t.status !== 'Completed' && t.status !== 'Cancelled'
              const expanded = openId === t.id
              return (
                <li
                  key={t.id}
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm',
                    emergency ? 'border-red-300 bg-red-50/60' : 'border-primary-100',
                  )}
                  data-testid={`tenant-fault-${t.id}`}
                >
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-start justify-between gap-2 text-left"
                    onClick={() => setOpenId(expanded ? null : t.id)}
                    aria-expanded={expanded}
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 font-medium text-ink">
                        {emergency ? <Siren className="h-4 w-4 shrink-0 text-red-600" aria-label="Emergency" /> : null}
                        {t.title}
                      </p>
                      <p className="text-xs text-ink-400">
                        {t.id} · {faultUrgencyLabel(t.priority)} · reported {age.label}
                        {t.tenantFeedback?.kind === 'confirmed'
                          ? ` · you confirmed it fixed${t.tenantFeedback.rating ? ` (${t.tenantFeedback.rating}/5)` : ''}`
                          : ''}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1">
                      <Badge tone={t.status === 'Completed' && t.tenantFeedback?.kind !== 'confirmed' ? 'info' : statusTone(t.status)}>
                        {t.status === 'Completed' && t.tenantFeedback?.kind !== 'confirmed' ? 'Fixed? Confirm' : faultStatusLabel(t.status)}
                      </Badge>
                      <ChevronDown className={cn('h-4 w-4 text-ink-400 transition-transform', expanded && 'rotate-180')} aria-hidden />
                    </span>
                  </button>
                  {expanded ? (
                    <div className="mt-3 space-y-3 border-t border-primary-100 pt-3">
                      {t.description ? <p className="whitespace-pre-wrap text-ink-600">{t.description}</p> : null}
                      {t.photoUrls?.length ? (
                        <div className="flex flex-wrap gap-2">
                          {t.photoUrls.map((src, i) => (
                            <img key={i} src={src} alt={`Fault photo ${i + 1}`} className="h-16 w-16 rounded-lg border border-primary-100 object-cover" />
                          ))}
                        </div>
                      ) : null}
                      <FaultConversation
                        ticketId={t.id}
                        done={t.status === 'Completed'}
                        onStatusChange={(status) => setOverrides((o) => ({ ...o, [t.id]: { ...o[t.id], status } }))}
                        onFeedback={(f) => setOverrides((o) => ({ ...o, [t.id]: { ...o[t.id], tenantFeedback: f } }))}
                      />
                    </div>
                  ) : null}
                </li>
              )
            })}
            {faults.length === 0 ? <li className="text-sm text-ink-400">No faults reported yet.</li> : null}
          </ul>
        </Card>
      </div>
    </div>
  )
}
