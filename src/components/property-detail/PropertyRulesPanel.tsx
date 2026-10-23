import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Input, Select } from '../ui'
import {
  RESPONSIBLE_PARTIES,
  RESPONSIBLE_PARTY_LABEL,
  RULE_PRIORITIES,
  RULE_ROOM_GROUPS,
  type RuleItem,
} from '../../lib/maintenanceRules'
import {
  createUnitRuleSet,
  deactivateRuleSet,
  fetchUnitRules,
  updateRuleSet,
  type UnitRules,
} from '../../lib/api/maintenanceRules'
import type { PropertyDocument } from '../../types/domain'

const SOURCE_LABEL: Record<UnitRules['effective']['source'], string> = {
  unit: 'Rules for this unit',
  agency: 'Agency default for this property type',
  platform: 'Platform template: default, check against lease and conduct rules',
  seed: 'Built-in template: default, check against lease and conduct rules',
}

const blankItem = (): RuleItem => ({
  categoryKey: '',
  label: '',
  roomGroup: 'general',
  responsibleParty: 'LANDLORD',
  guidanceText: '',
  clauseRef: null,
  tenantCanLog: true,
  defaultPriority: 'MEDIUM',
  vendorCategoryKey: null,
  isSafety: false,
})

/**
 * Agent Rules tab (migration 029): who fixes what on this unit. Starts from
 * the effective rules (agency default or template); saving writes a unit rule
 * set version. Earlier tickets keep the rule they were logged under.
 */
export function PropertyRulesPanel({
  unitRef,
  documents,
  canManage,
  onAddDocument,
}: {
  unitRef: string
  documents: PropertyDocument[]
  canManage: boolean
  onAddDocument: (name: string, url: string) => PropertyDocument
}) {
  const [view, setView] = useState<UnitRules | null>(null)
  const [items, setItems] = useState<RuleItem[]>([])
  const [docId, setDocId] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [bcEmail, setBcEmail] = useState('')
  const [newDocName, setNewDocName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const apply = useCallback((next: UnitRules) => {
    setView(next)
    setItems(next.effective.items.map((i) => ({ ...i })))
    setDocId(next.unitRuleSet?.sourceDocumentId ?? '')
    setSourceUrl(next.effective.sourceUrl ?? '')
    setBcEmail(next.effective.bodyCorporateEmail ?? '')
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      apply(await fetchUnitRules(unitRef))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load maintenance rules.')
    }
  }, [apply, unitRef])

  useEffect(() => {
    void load()
  }, [load])

  const patchItem = (n: number, patch: Partial<RuleItem>) =>
    setItems((all) => all.map((it, i) => (i === n ? { ...it, ...patch } : it)))

  const save = async () => {
    if (!view) return
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      const input = {
        name: view.unitRuleSet?.name ?? 'Unit maintenance rules',
        items: items.filter((i) => i.label.trim()).map((i) => ({
          ...i,
          categoryKey: (i.categoryKey || i.label).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''),
        })),
        sourceDocumentId: docId || null,
        sourceUrl: sourceUrl.trim() || null,
        bodyCorporateEmail: bcEmail.trim() || null,
      }
      const next = view.unitRuleSet
        ? await updateRuleSet(view.unitRuleSet.id, input)
        : await createUnitRuleSet(unitRef, input)
      setSaved(`Saved as version ${next.version}. New tickets use these rules; earlier tickets keep theirs.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the rules.')
    } finally {
      setBusy(false)
    }
  }

  const revert = async () => {
    if (!view?.unitRuleSet) return
    setBusy(true)
    setError(null)
    try {
      await deactivateRuleSet(view.unitRuleSet.id)
      setSaved('This unit now uses the agency default again.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the unit rules.')
    } finally {
      setBusy(false)
    }
  }

  if (!view) {
    return <Card className="p-5 text-sm text-ink-500">{error ?? 'Loading maintenance rules…'}</Card>
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ink">Maintenance rules</h3>
          <p className="mt-1 text-sm text-ink-500">
            {SOURCE_LABEL[view.effective.source]}
            {view.effective.source === 'unit' ? ` (version ${view.effective.version})` : ''}. Who fixes what when a tenant logs
            a repair. Emergency and Something else are always available to tenants.
          </p>
        </div>
        <Badge tone="info">{view.propertyType}</Badge>
      </div>

      {view.warnings.map((w) => (
        <p key={w.code} role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {w.message}
        </p>
      ))}

      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-medium text-ink-500">
          Lease / conduct rules document
          <Select value={docId} disabled={!canManage} onChange={(e) => setDocId(e.target.value)}>
            <option value="">None linked</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-xs font-medium text-ink-500">
          Or link (https://…)
          <Input value={sourceUrl} disabled={!canManage} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" />
        </label>
        <label className="text-xs font-medium text-ink-500">
          Body corporate / managing agent email
          <Input value={bcEmail} disabled={!canManage} onChange={(e) => setBcEmail(e.target.value)} placeholder="managing@agent.co.za" />
        </label>
      </div>
      {canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-ink-500">
            Add a document from the link
            <Input value={newDocName} onChange={(e) => setNewDocName(e.target.value)} placeholder="e.g. Conduct rules 2026" />
          </label>
          <Button
            size="sm"
            variant="secondary"
            disabled={!newDocName.trim() || !/^https?:\/\//i.test(sourceUrl.trim())}
            onClick={() => {
              const doc = onAddDocument(newDocName.trim(), sourceUrl.trim())
              setDocId(doc.id)
              setNewDocName('')
            }}
          >
            Add to documents
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs text-ink-400">
            <tr>
              <th className="py-1 pr-2">Item</th>
              <th className="py-1 pr-2">Room</th>
              <th className="py-1 pr-2">Who fixes it</th>
              <th className="py-1 pr-2">Clause</th>
              <th className="py-1 pr-2">Priority</th>
              <th className="py-1 pr-2">Tenant can log</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {items.map((it, n) => (
              <tr key={`${it.categoryKey}-${n}`} className="border-t border-primary-100 align-top">
                <td className="py-1 pr-2">
                  <Input value={it.label} disabled={!canManage} onChange={(e) => patchItem(n, { label: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Select
                    value={it.roomGroup}
                    disabled={!canManage}
                    onChange={(e) => patchItem(n, { roomGroup: e.target.value as RuleItem['roomGroup'] })}
                  >
                    {RULE_ROOM_GROUPS.map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.label}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="py-1 pr-2">
                  <Select
                    value={it.responsibleParty}
                    disabled={!canManage}
                    onChange={(e) => patchItem(n, { responsibleParty: e.target.value as RuleItem['responsibleParty'] })}
                  >
                    {RESPONSIBLE_PARTIES.map((p) => (
                      <option key={p} value={p}>
                        {RESPONSIBLE_PARTY_LABEL[p]}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="py-1 pr-2">
                  <Input
                    value={it.clauseRef ?? ''}
                    disabled={!canManage}
                    onChange={(e) => patchItem(n, { clauseRef: e.target.value || null })}
                    placeholder="e.g. 12.3"
                  />
                </td>
                <td className="py-1 pr-2">
                  <Select
                    value={it.defaultPriority}
                    disabled={!canManage}
                    onChange={(e) => patchItem(n, { defaultPriority: e.target.value as RuleItem['defaultPriority'] })}
                  >
                    {RULE_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="py-1 pr-2">
                  <input
                    type="checkbox"
                    aria-label={`Tenant can log ${it.label}`}
                    checked={it.tenantCanLog}
                    disabled={!canManage}
                    onChange={(e) => patchItem(n, { tenantCanLog: e.target.checked })}
                  />
                </td>
                <td className="py-1">
                  {canManage ? (
                    <Button size="sm" variant="ghost" onClick={() => setItems((all) => all.filter((_, i) => i !== n))}>
                      Remove
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-700">{saved}</p> : null}

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setItems((all) => [...all, blankItem()])}>
            Add item
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : view.unitRuleSet ? 'Save new version' : 'Save rules for this unit'}
          </Button>
          {view.unitRuleSet ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void revert()}>
              Use agency default
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
