import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Plus,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAgencyScope, useAuth } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { Badge, Button, Card, Input, PageHeader, Select, cn } from '../../components/ui'
import {
  CONFIG_GROUPS,
  CONFIG_TYPE_DEFS,
  isRequiredLookupKey,
  GLOBAL_CLIENT_ID,
  slugifyLookupKey,
  type ConfigTypeDef,
} from '../../data/platformLookups'
import { getLookups } from '../../lib/lookups'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'

const ICON_STROKE = 1.6

export default function AdminConfigPage() {
  const navigate = useNavigate()
  const { state, createLookup, updateLookup, deactivateLookup, reorderLookups } = useStore()
  const { has } = useAuth()
  const { agencyId } = useAgencyScope()
  const isPlatform = has('platform.manage')
  const reducedMotion = usePrefersReducedMotion()

  const [viewAgencyId, setViewAgencyId] = useState(agencyId ?? state.agencies[0]?.id ?? '')
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  // Every edit is saved for one agency: built-in values are shared by all
  // agencies, so changing one stores the agency's own copy (see updateLookup).
  const effectiveAgencyId = isPlatform ? viewAgencyId : (agencyId ?? '')

  const catalogueStats = useMemo(() => {
    return CONFIG_TYPE_DEFS.map((def) => {
      const merged = getLookups(state.lookups, effectiveAgencyId, def.type, { includeInactive: true })
      return { def, active: merged.filter((r) => r.isActive).length, total: merged.length }
    })
  }, [state.lookups, effectiveAgencyId])

  const rows = useMemo(() => {
    if (!selectedType || !effectiveAgencyId) return []
    return getLookups(state.lookups, effectiveAgencyId, selectedType, { includeInactive: true })
  }, [state.lookups, effectiveAgencyId, selectedType])

  /** Keys that ship with the app (shown as "Built-in"). */
  const builtInKeys = useMemo(
    () =>
      new Set(
        selectedType
          ? getLookups(state.lookups, GLOBAL_CLIENT_ID, selectedType, { includeInactive: true }).map((r) => r.keyValue)
          : [],
      ),
    [state.lookups, selectedType],
  )

  const typeDef = CONFIG_TYPE_DEFS.find((d) => d.type === selectedType)
  const visibleRows = showInactive ? rows : rows.filter((r) => r.isActive)
  const inactiveCount = rows.filter((r) => !r.isActive).length

  function openCatalogue(type: string) {
    setSelectedType(type)
    setError(null)
    setNewLabel('')
    setShowInactive(false)
  }

  function move(id: string, dir: -1 | 1) {
    if (!selectedType) return
    const row = rows.find((r) => r.id === id)
    if (!row) return
    const ids = rows.map((r) => r.id)
    const idx = ids.indexOf(id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= ids.length) return
    const next = [...ids]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    reorderLookups(row.clientId, selectedType, next, effectiveAgencyId)
  }

  return (
    <RequirePermission anyOf={['config.manage', 'tenant.manage', 'platform.manage']}>
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Configuration"
          subtitle={
            selectedType
              ? 'Changes apply to this agency only.'
              : 'Lists your agency can tailor — property types, lead stages, payment methods and more.'
          }
          actions={
            selectedType ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11 cursor-pointer"
                onClick={() => setSelectedType(null)}
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Back
              </Button>
            ) : isPlatform ? (
              <Select
                value={viewAgencyId}
                onChange={(e) => setViewAgencyId(e.target.value)}
                aria-label="Agency context"
                className="min-h-11 min-w-48 cursor-pointer"
              >
                {state.agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            ) : null
          }
        />


        {!effectiveAgencyId ? (
          <Card className="p-5 text-sm text-ink-500">
            {isPlatform ? 'Choose an agency to edit its configuration.' : 'No agency assigned — cannot edit configuration.'}
          </Card>
        ) : selectedType && typeDef ? (
          <CatalogueEditor
            typeDef={typeDef}
            rows={visibleRows}
            allRows={rows}
            inactiveCount={inactiveCount}
            showInactive={showInactive}
            onToggleInactive={() => setShowInactive((v) => !v)}
            builtInKeys={builtInKeys}
            createClientId={effectiveAgencyId}
            newLabel={newLabel}
            setNewLabel={setNewLabel}
            error={error}
            setError={setError}
            onCreate={(input) => {
              const existing = rows.find((r) => r.keyValue === input.keyValue)
              if (existing) {
                // Re-adding a hidden value brings it back instead of failing.
                if (!existing.isActive) updateLookup(existing.id, { isActive: true }, effectiveAgencyId)
                else setError('That value is already in the list')
                setNewLabel('')
                return
              }
              createLookup(input)
              setNewLabel('')
            }}
            onUpdate={(id, patch) => {
              updateLookup(id, patch, effectiveAgencyId)
            }}
            onDeactivate={(id) => {
              deactivateLookup(id, effectiveAgencyId)
            }}
            onOpenPipeline={() => navigate('/workspace/admin/pipeline')}
            onOpenApplicationJourney={() => navigate('/workspace/admin/application-journey')}
            onMove={move}
            reducedMotion={reducedMotion}
          />
        ) : (
          <CatalogueBrowser
            items={catalogueStats}
            onOpen={openCatalogue}
            reducedMotion={reducedMotion}
          />
        )}
      </div>
    </RequirePermission>
  )
}

function CatalogueBrowser({
  items,
  onOpen,
  reducedMotion,
}: {
  items: Array<{ def: ConfigTypeDef; active: number; total: number }>
  onOpen: (type: string) => void
  reducedMotion?: boolean
}) {
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-primary-50" role="list">
          {items.map(({ def, active, total }) => {
            const groupLabel = CONFIG_GROUPS.find((g) => g.id === def.group)?.label
            return (
              <li key={def.type}>
                <button
                  type="button"
                  onClick={() => onOpen(def.type)}
                  className={cn(
                    'flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5',
                    !reducedMotion && 'transition-colors duration-200',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{def.label}</p>
                    {groupLabel ? (
                      <p className="text-xs text-ink-400">{groupLabel}</p>
                    ) : null}
                  </div>
                  <span className="tabular shrink-0 text-sm text-ink-500">
                    <span className="font-semibold text-ink">{active}</span>
                    {total !== active ? (
                      <span className="text-ink-400"> / {total}</span>
                    ) : null}
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-ink-400"
                    strokeWidth={ICON_STROKE}
                    aria-hidden
                  />
                </button>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}

function CatalogueEditor({
  typeDef,
  rows,
  allRows,
  inactiveCount,
  showInactive,
  onToggleInactive,
  builtInKeys,
  createClientId,
  newLabel,
  setNewLabel,
  error,
  setError,
  onCreate,
  onOpenPipeline,
  onOpenApplicationJourney,
  onUpdate,
  onDeactivate,
  onMove,
  reducedMotion,
}: {
  typeDef: ConfigTypeDef
  rows: ReturnType<typeof getLookups>
  allRows: ReturnType<typeof getLookups>
  inactiveCount: number
  showInactive: boolean
  onToggleInactive: () => void
  builtInKeys: Set<string>
  createClientId: string
  newLabel: string
  setNewLabel: (v: string) => void
  error: string | null
  setError: (v: string | null) => void
  onCreate: (input: {
    clientId: string
    configType: string
    keyValue: string
    displayLabel: string
  }) => void
  onOpenPipeline: () => void
  onOpenApplicationJourney: () => void
  onUpdate: (id: string, patch: { displayLabel?: string; isActive?: boolean; meta?: Record<string, unknown> }) => void
  onDeactivate: (id: string) => void
  onMove: (id: string, dir: -1 | 1) => void
  reducedMotion?: boolean
}) {
  return (
    <Card className="p-5">
      {typeDef.type === 'LEAD_STAGE' ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary-100/80 bg-primary-50/50 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Configuring your deal pipeline?</p>
            <p className="mt-0.5 text-sm text-ink-500">
              Use the dedicated editor to reorder steps and set what each step requires —
              documents, payments, and more.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 cursor-pointer"
              onClick={onOpenPipeline}
            >
              Open lead pipeline editor
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 cursor-pointer"
              onClick={onOpenApplicationJourney}
            >
              Application journey
            </Button>
          </div>
        </div>
      ) : null}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink">{typeDef.label}</h2>
          <p className="mt-0.5 text-sm text-ink-500">{typeDef.description}</p>
        </div>
        {inactiveCount > 0 ? (
          <button
            type="button"
            onClick={onToggleInactive}
            className={cn(
              'min-h-11 cursor-pointer rounded-full px-3.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              showInactive
                ? 'bg-primary-50 text-primary'
                : 'text-ink-500 hover:bg-primary-50 hover:text-ink',
              !reducedMotion && 'transition-colors duration-200',
            )}
          >
            {showInactive ? 'Hide inactive' : `Show inactive (${inactiveCount})`}
          </button>
        ) : null}
      </div>

      <form
        className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          const label = newLabel.trim()
          if (!label) return
          if (!createClientId) {
            setError('Choose an agency first')
            return
          }
          const key = slugifyLookupKey(label).slice(0, 80)
          if (!key) {
            setError('Could not create a key from that label')
            return
          }
          try {
            onCreate({
              clientId: createClientId,
              configType: typeDef.type,
              keyValue: key,
              displayLabel: label,
            })
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not add value')
          }
        }}
      >
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-medium text-ink-500">New value</label>
          <Input
            className="min-h-11"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Display label"
            aria-label="New value label"
          />
        </div>
        <Button type="submit" className="min-h-11 cursor-pointer sm:shrink-0">
          <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          Add
        </Button>
      </form>
      {error ? <p className="mb-4 text-sm text-accent-600">{error}</p> : null}

      <ul className="divide-y divide-primary-50">
        {rows.length === 0 ? (
          <li className="py-8 text-center text-sm text-ink-500">
            {showInactive || inactiveCount === 0 ? 'No values yet.' : 'No active values.'}
          </li>
        ) : (
          rows.map((row) => {
            const required = isRequiredLookupKey(row.configType, row.keyValue)
            const builtIn = builtInKeys.has(row.keyValue)
            const index = allRows.findIndex((r) => r.id === row.id)
            return (
              <li
                key={row.id}
                className={cn(
                  'flex flex-wrap items-center gap-2 py-3',
                  !row.isActive && 'opacity-60',
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <LabelInput
                    key={`${row.id}:${row.displayLabel}`}
                    value={row.displayLabel}
                    onCommit={(label) => onUpdate(row.id, { displayLabel: label })}
                    ariaLabel={`Label for ${row.keyValue}`}
                  />
                  <Badge tone={builtIn ? 'info' : 'neutral'} className="shrink-0">
                    {builtIn ? 'Built-in' : 'Added'}
                  </Badge>
                  {required ? (
                    <Badge tone="neutral" className="shrink-0">
                      Required
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className={cn(
                      'inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-primary-100 text-ink-500 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      !reducedMotion && 'transition-colors duration-200',
                    )}
                    disabled={index === 0}
                    onClick={() => onMove(row.id, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-primary-100 text-ink-500 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      !reducedMotion && 'transition-colors duration-200',
                    )}
                    disabled={index === allRows.length - 1}
                    onClick={() => onMove(row.id, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'min-h-11 cursor-pointer rounded-full px-3.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50',
                      row.isActive
                        ? 'text-ink-500 hover:bg-primary-50 hover:text-ink'
                        : 'bg-primary-50 text-primary hover:bg-primary-100',
                      !reducedMotion && 'transition-colors duration-200',
                    )}
                    disabled={required && row.isActive}
                    onClick={() => {
                      if (row.isActive) {
                        if (required) return
                        onDeactivate(row.id)
                      } else {
                        onUpdate(row.id, { isActive: true })
                      }
                    }}
                  >
                    {row.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
                {typeDef.type === 'PCR_ROOM' ? (
                  <RoomItemsEditor
                    key={`${row.id}:${JSON.stringify(row.meta?.items ?? [])}`}
                    items={Array.isArray(row.meta?.items) ? (row.meta!.items as unknown[]).map(String) : []}
                    onCommit={(items) => onUpdate(row.id, { meta: { ...(row.meta ?? {}), items } })}
                    roomName={row.displayLabel}
                  />
                ) : null}
              </li>
            )
          })
        )}
      </ul>
    </Card>
  )
}

/** Label editor that saves on blur / Enter instead of on every keystroke. */
function LabelInput({
  value,
  onCommit,
  ariaLabel,
}: {
  value: string
  onCommit: (label: string) => void
  ariaLabel: string
}) {
  const [draft, setDraft] = useState(value)
  const commit = () => {
    const label = draft.trim()
    if (!label) setDraft(value)
    else if (label !== value) onCommit(label)
  }
  return (
    <Input
      className="max-w-sm min-h-11"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
      aria-label={ariaLabel}
    />
  )
}

/** The checklist items of one PCR room — one per line, saved on blur. */
function RoomItemsEditor({
  items,
  onCommit,
  roomName,
}: {
  items: string[]
  onCommit: (items: string[]) => void
  roomName: string
}) {
  const [draft, setDraft] = useState(items.join('\n'))
  const commit = () => {
    const next = draft
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (next.join('\n') !== items.join('\n')) onCommit(next)
  }
  return (
    <div className="w-full pl-0.5">
      <label className="block text-xs font-medium text-ink-500">
        Items checked in {roomName || 'this room'} — one per line
        <textarea
          className="mt-1 w-full rounded-xl border border-primary-100 bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          rows={Math.min(8, Math.max(3, items.length + 1))}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder={'Walls & paint\nFlooring\nLights / plugs'}
        />
      </label>
      {!items.length ? (
        <p className="mt-1 text-xs text-accent-700">No items yet — this room is left off new reports until it has one.</p>
      ) : null}
    </div>
  )
}
