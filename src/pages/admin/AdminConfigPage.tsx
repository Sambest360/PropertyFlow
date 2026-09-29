import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Plus,
  Search,
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
  type ConfigGroupId,
  type ConfigTypeDef,
} from '../../data/platformLookups'
import { getLookups, isGlobalLookup } from '../../lib/lookups'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'

const ICON_STROKE = 1.6

type GroupFilter = 'all' | ConfigGroupId

export default function AdminConfigPage() {
  const navigate = useNavigate()
  const { state, createLookup, updateLookup, deactivateLookup, reorderLookups } = useStore()
  const { has } = useAuth()
  const { agencyId } = useAgencyScope()
  const isPlatform = has('platform.manage')
  const reducedMotion = usePrefersReducedMotion()

  const [viewAgencyId, setViewAgencyId] = useState(agencyId ?? state.agencies[0]?.id ?? '')
  const [createScope, setCreateScope] = useState<'global' | 'agency'>(isPlatform ? 'global' : 'agency')
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all')
  const [query, setQuery] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const effectiveAgencyId = isPlatform ? viewAgencyId : (agencyId ?? '')
  const createClientId =
    createScope === 'global' && isPlatform ? GLOBAL_CLIENT_ID : effectiveAgencyId

  const catalogueStats = useMemo(() => {
    return CONFIG_TYPE_DEFS.map((def) => {
      const globals = getLookups(state.lookups, GLOBAL_CLIENT_ID, def.type, {
        includeInactive: true,
        scopeOnly: 'global',
      })
      const agencyRows = effectiveAgencyId
        ? getLookups(state.lookups, effectiveAgencyId, def.type, {
            includeInactive: true,
            scopeOnly: 'agency',
          })
        : []
      const active =
        globals.filter((r) => r.isActive).length + agencyRows.filter((r) => r.isActive).length
      const total = globals.length + agencyRows.length
      return { def, active, total }
    })
  }, [state.lookups, effectiveAgencyId])

  const filteredCatalogues = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalogueStats.filter(({ def }) => {
      if (groupFilter !== 'all' && def.group !== groupFilter) return false
      if (!q) return true
      return (
        def.label.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        def.type.toLowerCase().includes(q)
      )
    })
  }, [catalogueStats, groupFilter, query])

  const rows = useMemo(() => {
    if (!selectedType) return []
    if (!effectiveAgencyId && createScope !== 'global') return []
    const globals = getLookups(state.lookups, GLOBAL_CLIENT_ID, selectedType, {
      includeInactive: true,
      scopeOnly: 'global',
    })
    const agencyRows = effectiveAgencyId
      ? getLookups(state.lookups, effectiveAgencyId, selectedType, {
          includeInactive: true,
          scopeOnly: 'agency',
        })
      : []
    return [...globals, ...agencyRows].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.displayLabel.localeCompare(b.displayLabel),
    )
  }, [state.lookups, effectiveAgencyId, selectedType, createScope])

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
    const siblings = rows.filter((r) => r.clientId === row.clientId)
    const ids = siblings.map((r) => r.id)
    const idx = ids.indexOf(id)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= ids.length) return
    const next = [...ids]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    reorderLookups(row.clientId, selectedType, next)
  }

  return (
    <RequirePermission anyOf={['config.manage', 'tenant.manage', 'platform.manage']}>
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Configuration"
          subtitle={
            selectedType
              ? 'Add or rename values used across forms and filters.'
              : 'Lists of values used in forms — property types, statuses, and more.'
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

        {!effectiveAgencyId && !isPlatform ? (
          <Card className="p-5 text-sm text-ink-500">No agency assigned — cannot edit configuration.</Card>
        ) : selectedType && typeDef ? (
          <CatalogueEditor
            typeDef={typeDef}
            rows={visibleRows}
            allRows={rows}
            inactiveCount={inactiveCount}
            showInactive={showInactive}
            onToggleInactive={() => setShowInactive((v) => !v)}
            isPlatform={isPlatform}
            createScope={createScope}
            setCreateScope={setCreateScope}
            createClientId={createClientId}
            newLabel={newLabel}
            setNewLabel={setNewLabel}
            error={error}
            setError={setError}
            onCreate={(input) => {
              if (!isPlatform && isGlobalLookup(input.clientId)) {
                setError('Only platform admins can add global values')
                return
              }
              createLookup(input)
              setNewLabel('')
            }}
            onUpdate={(id, patch) => {
              const row = state.lookups.find((l) => l.id === id)
              if (!row) return
              if (!isPlatform && isGlobalLookup(row.clientId)) return
              updateLookup(id, patch)
            }}
            onDeactivate={(id) => {
              const row = state.lookups.find((l) => l.id === id)
              if (!row) return
              if (!isPlatform && isGlobalLookup(row.clientId)) return
              deactivateLookup(id)
            }}
            onOpenPipeline={() => navigate('/workspace/admin/pipeline')}
            onMove={(id, dir) => {
              const row = rows.find((r) => r.id === id)
              if (!row) return
              if (!isPlatform && isGlobalLookup(row.clientId)) return
              move(id, dir)
            }}
            reducedMotion={reducedMotion}
          />
        ) : (
          <CatalogueBrowser
            groupFilter={groupFilter}
            onGroupFilter={setGroupFilter}
            query={query}
            onQuery={setQuery}
            items={filteredCatalogues}
            onOpen={openCatalogue}
            reducedMotion={reducedMotion}
          />
        )}
      </div>
    </RequirePermission>
  )
}

function CatalogueBrowser({
  groupFilter,
  onGroupFilter,
  query,
  onQuery,
  items,
  onOpen,
  reducedMotion,
}: {
  groupFilter: GroupFilter
  onGroupFilter: (g: GroupFilter) => void
  query: string
  onQuery: (q: string) => void
  items: Array<{ def: ConfigTypeDef; active: number; total: number }>
  onOpen: (type: string) => void
  reducedMotion?: boolean
}) {
  const chips: Array<{ id: GroupFilter; label: string }> = [
    { id: 'all', label: 'All' },
    ...CONFIG_GROUPS.map((g) => ({ id: g.id as GroupFilter, label: g.label })),
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-[1.25rem] border border-primary-100/80 bg-white p-3 shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)] sm:p-4">
        <div className="relative" role="search" aria-label="Search catalogues">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            strokeWidth={ICON_STROKE}
            aria-hidden
          />
          <Input
            className="min-h-11 pl-9"
            placeholder="Search catalogues…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            aria-label="Search catalogues"
          />
        </div>
        <div
          className="mt-3 flex gap-2 overflow-x-auto pb-0.5 scrollbar-thin"
          role="tablist"
          aria-label="Catalogue groups"
        >
          {chips.map((chip) => {
            const active = groupFilter === chip.id
            return (
              <button
                key={chip.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onGroupFilter(chip.id)}
                className={cn(
                  'inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-full px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  active
                    ? 'bg-primary text-white'
                    : 'bg-primary-50 text-ink-600 hover:bg-primary-100',
                  !reducedMotion && 'transition-colors duration-200',
                )}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-500">No catalogues match.</p>
        ) : (
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
                      {groupFilter === 'all' && groupLabel ? (
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
        )}
      </Card>

      <p className="text-xs text-ink-400">
        <span className="tabular font-medium text-ink-500">{items.length}</span>{' '}
        {items.length === 1 ? 'catalogue' : 'catalogues'}
      </p>
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
  isPlatform,
  createScope,
  setCreateScope,
  createClientId,
  newLabel,
  setNewLabel,
  error,
  setError,
  onCreate,
  onOpenPipeline,
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
  isPlatform: boolean
  createScope: 'global' | 'agency'
  setCreateScope: (s: 'global' | 'agency') => void
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
  onUpdate: (id: string, patch: { displayLabel?: string; isActive?: boolean }) => void
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
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 cursor-pointer"
            onClick={onOpenPipeline}
          >
            Open lead pipeline editor
          </Button>
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
            setError('Select an agency for agency-scoped values')
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
        {isPlatform ? (
          <div className="sm:w-44">
            <label className="mb-1 block text-xs font-medium text-ink-500">Add as</label>
            <Select
              value={createScope}
              onChange={(e) => setCreateScope(e.target.value as 'global' | 'agency')}
              className="min-h-11 w-full cursor-pointer"
            >
              <option value="global">Everyone</option>
              <option value="agency">This agency</option>
            </Select>
          </div>
        ) : null}
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
            const global = isGlobalLookup(row.clientId)
            const canMutate = isPlatform || !global
            const siblings = allRows.filter((r) => r.clientId === row.clientId)
            const index = siblings.findIndex((r) => r.id === row.id)
            return (
              <li
                key={row.id}
                className={cn(
                  'flex flex-wrap items-center gap-2 py-3',
                  !row.isActive && 'opacity-60',
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Input
                    className="max-w-sm min-h-11"
                    value={row.displayLabel}
                    readOnly={!canMutate}
                    onChange={(e) => {
                      if (!canMutate) return
                      onUpdate(row.id, { displayLabel: e.target.value })
                    }}
                    aria-label={`Label for ${row.keyValue}`}
                  />
                  {isPlatform || global ? (
                    <Badge tone={global ? 'info' : 'neutral'} className="shrink-0">
                      {global ? 'Global' : 'Agency'}
                    </Badge>
                  ) : null}
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
                    disabled={!canMutate || index === 0}
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
                    disabled={!canMutate || index === siblings.length - 1}
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
                    disabled={!canMutate || (required && row.isActive)}
                    onClick={() => {
                      if (!canMutate) return
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
              </li>
            )
          })
        )}
      </ul>
    </Card>
  )
}
