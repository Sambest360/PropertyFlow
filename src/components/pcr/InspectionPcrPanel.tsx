/**
 * Mode A PCR panel — lite rooms/items, notes, soft sign / no-show override, PDF download.
 * Staff-managed soft pack beside occupancy lifecycle.
 */
import { useMemo, useState } from 'react'
import type { Application } from '../../types/domain'
import {
  PCR_MODE_A_COPY,
  addItemPhoto,
  collectMaintenanceHandoffDrafts,
  countCheckedItems,
  ensureIngoingInspection,
  ensureOutgoingInspection,
  findInspection,
  generatePcrPdf,
  downloadPcrPdf,
  inspectionStatusLabel,
  markInspectionCompleted,
  recordNoShowOrAdminOverride,
  setGeneralNotes,
  softSignStaff,
  softSignTenant,
  updateItemNotes,
  upsertInspectionOnApplication,
  depositDamageWithoutOutgoingSoftWarn,
  type ItemCondition,
  type PropertyConditionInspection,
} from '../../lib/pcr'
import { PcrGateStatus } from './PcrGateStatus'
import { FieldHelp } from '../onboarding/FieldHelp'
import { Badge, Button, Card } from '../ui'

const CONDITIONS: ItemCondition[] = [
  'not_checked',
  'excellent',
  'good',
  'fair',
  'poor',
  'damaged',
  'missing',
]

function nowIso() {
  return new Date().toISOString()
}

export function InspectionPcrPanel({
  application,
  propertyTitle,
  propertyAddress,
  agencyName,
  canReview,
  actor,
  onSave,
}: {
  application: Application
  propertyTitle: string
  propertyAddress: string
  agencyName: string
  canReview: boolean
  actor: { userId: string; name: string }
  onSave: (patch: Partial<Application>) => void
}) {
  const [kind, setKind] = useState<'incoming' | 'outgoing'>('incoming')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [claimDamage, setClaimDamage] = useState(false)

  const inspection = findInspection(application, kind)

  const counts = useMemo(
    () => (inspection ? countCheckedItems(inspection) : null),
    [inspection],
  )
  const handoffs = useMemo(
    () => (inspection ? collectMaintenanceHandoffDrafts(inspection) : []),
    [inspection],
  )
  const damageWarn = depositDamageWithoutOutgoingSoftWarn({
    claimingDamageOrDeduction: claimDamage,
    application,
  })

  const persist = (next: PropertyConditionInspection, message: string) => {
    const app = upsertInspectionOnApplication(application, next)
    onSave({ pcrInspections: app.pcrInspections })
    setFlash(message)
  }

  const ensure = () => {
    if (!canReview) return
    const now = nowIso()
    const result =
      kind === 'incoming'
        ? ensureIngoingInspection(application, now, application.moveInDate ?? null)
        : ensureOutgoingInspection(application, now)
    onSave({ pcrInspections: result.application.pcrInspections })
    setFlash(result.created ? `${kind} inspection created from lite template.` : `${kind} inspection already on file.`)
  }

  const patchItem = (
    roomId: string,
    itemId: string,
    patch: { notes?: string; condition?: ItemCondition; needsMaintenance?: boolean },
  ) => {
    if (!inspection || !canReview) return
    const next = updateItemNotes(inspection, roomId, itemId, patch, nowIso())
    persist(next, 'Item updated.')
  }

  const onAddPhoto = (roomId: string, itemId: string, file: File) => {
    if (!inspection || !canReview) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : ''
      if (!url) return
      const next = addItemPhoto(
        inspection,
        roomId,
        itemId,
        { id: `ph-${Date.now()}`, url, caption: file.name, capturedAt: nowIso() },
        nowIso(),
      )
      persist(next, 'Photo attached (Mode A soft demo — not a native field camera).')
    }
    reader.readAsDataURL(file)
  }

  const onStaffSign = () => {
    if (!inspection || !canReview) return
    const res = softSignStaff(inspection, { userId: actor.userId, name: actor.name }, nowIso())
    if (res.ok === false) {
      setFlash(res.error)
      return
    }
    persist(res.inspection, res.inspection.ingoingPcrSigned ? 'Incoming PCR soft-signed (ingoing_pcr_signed).' : 'Staff soft-signed.')
  }

  const onTenantAck = () => {
    if (!inspection || !canReview) return
    const res = softSignTenant(
      inspection,
      {
        userId: application.applicantUserId,
        name: application.applicantName,
        method: 'staff_recorded',
      },
      nowIso(),
      'Staff-recorded tenant ack (Mode A soft).',
    )
    if (res.ok === false) {
      setFlash(res.error)
      return
    }
    persist(
      res.inspection,
      res.inspection.ingoingPcrSigned
        ? 'Tenant ack recorded — incoming PCR soft-signed (ingoing_pcr_signed).'
        : 'Tenant soft-ack recorded.',
    )
  }

  const onOverride = (overrideKind: 'tenant_no_show' | 'admin_override') => {
    if (!inspection || !canReview) return
    const res = recordNoShowOrAdminOverride(inspection, {
      byUserId: actor.userId,
      byName: actor.name,
      reason: overrideReason,
      kind: overrideKind,
      now: nowIso(),
    })
    if (res.ok === false) {
      setFlash(res.error)
      return
    }
    persist(res.inspection, 'Audited override recorded — ingoing_pcr_signed set.')
    setOverrideReason('')
  }

  const onComplete = () => {
    if (!inspection || !canReview) return
    persist(markInspectionCompleted(inspection, nowIso()), 'Inspection marked completed (unsigned until soft-sign / override).')
  }

  const onDownloadPdf = async () => {
    if (!inspection) return
    setBusy(true)
    try {
      const pdf = await generatePcrPdf({
        inspection,
        agencyName,
        propertyTitle,
        propertyAddress,
        tenantName: application.applicantName,
      })
      downloadPcrPdf(pdf)
      setFlash(`Downloaded ${pdf.fileName}`)
    } catch (e) {
      setFlash(e instanceof Error ? e.message : 'PDF failed')
    } finally {
      setBusy(false)
    }
  }

  const onNotes = (notes: string) => {
    if (!inspection || !canReview) return
    persist(setGeneralNotes(inspection, notes, nowIso()), 'General notes saved.')
  }

  if (application.type === 'Purchase') return null

  return (
    <div className="space-y-4" data-testid="inspection-pcr-panel">
      {canReview ? <PcrGateStatus application={application} /> : null}

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="inline-flex items-center gap-1.5 font-display text-lg font-semibold text-ink">
              PCR pack
              <FieldHelp title="PCR / inspections" body={PCR_MODE_A_COPY} />
            </h3>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={kind === 'incoming' ? 'primary' : 'secondary'}
              onClick={() => setKind('incoming')}
            >
              Incoming
            </Button>
            <Button
              type="button"
              variant={kind === 'outgoing' ? 'primary' : 'secondary'}
              onClick={() => setKind('outgoing')}
            >
              Outgoing
            </Button>
          </div>
        </div>

        {flash ? (
          <p className="rounded-lg border border-primary-100 bg-primary-50/60 px-3 py-2 text-sm text-ink-700" role="status">
            {flash}
          </p>
        ) : null}

        {!inspection ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-600">
              No {kind} inspection on file yet. Create from the lite residential template.
            </p>
            {canReview ? (
              <Button type="button" onClick={ensure}>
                Create {kind} inspection
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-4">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Status</dt>
                <dd className="mt-1">
                  <Badge tone={inspection.ingoingPcrSigned || inspection.status === 'signed' ? 'success' : 'neutral'}>
                    {inspectionStatusLabel(inspection.status)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">ingoing_pcr_signed</dt>
                <dd className="mt-1 text-sm font-medium tabular-nums">
                  {kind === 'incoming' ? (inspection.ingoingPcrSigned ? 'Yes' : 'No') : 'n/a (outgoing)'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Checked</dt>
                <dd className="mt-1 text-sm tabular-nums">
                  {counts ? `${counts.checked}/${counts.total}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Photos</dt>
                <dd className="mt-1 text-sm tabular-nums">{counts?.withPhotos ?? 0}</dd>
              </div>
            </dl>

            <label className="block text-sm">
              <span className="font-medium text-ink">General notes</span>
              <textarea
                className="mt-1 w-full rounded-xl border border-primary-100 bg-white px-3 py-2 text-sm"
                rows={2}
                defaultValue={inspection.generalNotes}
                disabled={!canReview}
                onBlur={(e) => {
                  if (e.target.value !== inspection.generalNotes) onNotes(e.target.value)
                }}
              />
            </label>

            <div className="space-y-3">
              {inspection.rooms.map((room) => (
                <details key={room.id} className="rounded-xl border border-primary-100 bg-white p-3" open={room === inspection.rooms[0]}>
                  <summary className="cursor-pointer text-sm font-semibold text-ink">
                    {room.name}{' '}
                    <span className="font-normal text-ink-400">
                      ({room.items.filter((i) => i.condition !== 'not_checked').length}/{room.items.length})
                    </span>
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {room.items.map((item) => (
                      <li key={item.id} className="rounded-lg border border-primary-50 bg-primary-50/20 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-ink">{item.label}</p>
                          <select
                            className="rounded-lg border border-primary-100 bg-white px-2 py-1 text-xs"
                            value={item.condition}
                            disabled={!canReview}
                            onChange={(e) =>
                              patchItem(room.id, item.id, {
                                condition: e.target.value as ItemCondition,
                              })
                            }
                          >
                            {CONDITIONS.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                        <textarea
                          className="mt-2 w-full rounded-lg border border-primary-100 bg-white px-2 py-1.5 text-xs"
                          rows={2}
                          placeholder="Notes…"
                          defaultValue={item.notes}
                          disabled={!canReview}
                          onBlur={(e) => {
                            if (e.target.value !== item.notes) {
                              patchItem(room.id, item.id, { notes: e.target.value })
                            }
                          }}
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-2 text-xs text-ink-600">
                            <input
                              type="checkbox"
                              checked={Boolean(item.needsMaintenance)}
                              disabled={!canReview}
                              onChange={(e) =>
                                patchItem(room.id, item.id, { needsMaintenance: e.target.checked })
                              }
                            />
                            Needs maintenance handoff
                          </label>
                          {canReview ? (
                            <label className="cursor-pointer text-xs font-medium text-primary">
                              Add photo
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0]
                                  if (f) onAddPhoto(room.id, item.id, f)
                                  e.target.value = ''
                                }}
                              />
                            </label>
                          ) : null}
                          {item.photos.length ? (
                            <span className="text-xs text-ink-500">{item.photos.length} photo(s)</span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>

            {canReview ? (
              <div className="flex flex-wrap gap-2 border-t border-primary-100 pt-3">
                <Button type="button" variant="secondary" onClick={onStaffSign}>
                  Staff soft-sign
                </Button>
                <Button type="button" variant="secondary" onClick={onTenantAck}>
                  Record tenant ack
                </Button>
                <Button type="button" variant="secondary" onClick={onComplete}>
                  Mark completed
                </Button>
                <Button type="button" variant="primary" disabled={busy} onClick={() => void onDownloadPdf()}>
                  {busy ? 'Building PDF…' : 'Download PCR PDF'}
                </Button>
              </div>
            ) : null}

            {canReview && kind === 'incoming' && !inspection.ingoingPcrSigned ? (
              <div className="space-y-2 rounded-xl border border-primary-100 bg-primary-50/50 p-3">
                <p className="text-sm font-medium text-ink">No-show / admin override (audited)</p>
                <textarea
                  className="w-full rounded-lg border border-primary-200 bg-white px-2 py-1.5 text-sm"
                  rows={2}
                  placeholder="Documented reason (required)…"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => onOverride('tenant_no_show')}>
                    Tenant no-show
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => onOverride('admin_override')}>
                    Admin override
                  </Button>
                </div>
              </div>
            ) : null}

            {handoffs.length > 0 ? (
              <div className="rounded-xl border border-primary-100 bg-white p-3 text-sm">
                <p className="font-medium text-ink">
                  Maintenance handoff drafts ({handoffs.length}) — not auto-opened
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-600">
                  {handoffs.slice(0, 5).map((h) => (
                    <li key={`${h.inspectionId}-${h.itemId}`}>
                      {h.title} ({h.roomName})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={claimDamage}
                  onChange={(e) => setClaimDamage(e.target.checked)}
                />
                <span>Theater check: claiming deposit damage / deduction</span>
              </label>
              {damageWarn ? (
                <p className="mt-2 text-ink-700" data-testid="deposit-damage-soft-warn">
                  {damageWarn}
                </p>
              ) : claimDamage ? (
                <p className="mt-2 text-ink-600">Outgoing PCR on file — soft-warn cleared.</p>
              ) : null}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
