import { useMemo, useState } from 'react'
import type { Application } from '../../types/domain'
import {
  CLOSING_CHECKLIST_ITEMS,
  closingChecklistProgress,
  emptyClosingChecklist,
  type ClosingChecklistKey,
  type PurchaseClosingChecklist,
} from '../../lib/conveyancing/closingChecklist'
import { Button, Card, Input } from '../ui'
import { ConveyancingModeABanner } from './ConveyancingModeABanner'

export function PurchaseClosingChecklistPanel({
  application,
  canEdit,
  onSave,
}: {
  application: Application
  canEdit: boolean
  onSave: (checklist: PurchaseClosingChecklist) => void
}) {
  const initial = application.purchaseClosing ?? emptyClosingChecklist()
  const [ticks, setTicks] = useState<PurchaseClosingChecklist['ticks']>(() => ({ ...initial.ticks }))
  const [attorneyFirmNote, setAttorneyFirmNote] = useState(initial.attorneyFirmNote ?? '')
  const [lodgementReferenceNote, setLodgementReferenceNote] = useState(
    initial.lodgementReferenceNote ?? '',
  )
  const [dirty, setDirty] = useState(false)

  const progress = useMemo(
    () => closingChecklistProgress({ ticks, attorneyFirmNote, lodgementReferenceNote }),
    [ticks, attorneyFirmNote, lodgementReferenceNote],
  )

  const toggle = (key: ClosingChecklistKey) => {
    if (!canEdit) return
    setTicks((prev) => ({ ...prev, [key]: !prev[key] }))
    setDirty(true)
  }

  const save = () => {
    onSave({
      ticks,
      attorneyFirmNote: attorneyFirmNote.trim() || undefined,
      lodgementReferenceNote: lodgementReferenceNote.trim() || undefined,
      updatedAt: new Date().toISOString().slice(0, 10),
    })
    setDirty(false)
  }

  return (
    <Card className="space-y-4 border-primary-100 p-5" data-testid="purchase-closing-checklist">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink">Purchase closing checklist</h3>
          <p className="mt-1 text-sm text-ink-500">
            Manual staff ticks for soft-demo tracking — not live conveyancing status.
          </p>
        </div>
        <p className="text-sm font-semibold tabular text-ink">
          {progress.done}/{progress.total} · {progress.pct}%
        </p>
      </div>

      <ConveyancingModeABanner extra="Ticks below are checklist/status only." />

      <ul className="space-y-2">
        {CLOSING_CHECKLIST_ITEMS.map((item) => {
          const checked = ticks[item.key] === true
          return (
            <li key={item.key}>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary-100 bg-white px-3 py-2.5 hover:bg-primary-50/50">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-primary-200 text-primary focus:ring-primary"
                  checked={checked}
                  disabled={!canEdit}
                  onChange={() => toggle(item.key)}
                  data-testid={`closing-tick-${item.key}`}
                />
                <span>
                  <span className="block text-sm font-medium text-ink">{item.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-500">{item.hint}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-ink">Attorney firm note (optional)</span>
          <Input
            className="mt-1.5"
            value={attorneyFirmNote}
            disabled={!canEdit}
            placeholder="e.g. Horizon Conveyancers — staff note"
            onChange={(e) => {
              setAttorneyFirmNote(e.target.value)
              setDirty(true)
            }}
            data-testid="closing-attorney-firm-note"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Lodgement reference note (optional)</span>
          <Input
            className="mt-1.5"
            value={lodgementReferenceNote}
            disabled={!canEdit}
            placeholder="Staff-recorded ref from attorney letter"
            onChange={(e) => {
              setLodgementReferenceNote(e.target.value)
              setDirty(true)
            }}
            data-testid="closing-lodgement-ref-note"
          />
        </label>
      </div>

      {canEdit ? (
        <div className="flex justify-end">
          <Button variant="primary" size="sm" disabled={!dirty} onClick={save}>
            Save checklist notes
          </Button>
        </div>
      ) : (
        <p className="text-xs text-ink-500">View only — staff with review permission can tick items.</p>
      )}
    </Card>
  )
}
