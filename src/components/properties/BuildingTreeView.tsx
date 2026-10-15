import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Building2,
  ChevronDown,
  MapPin,
  Sun,
} from 'lucide-react'
import type { Building } from '../../data/infrastructure'
import { gradingLabel } from '../../lib/buildingGrading'
import {
  STANDALONE_BUILDING_KEY,
  groupPortfolioByBuilding,
  shouldUseBuildingGroupChrome,
  type BuildingPortfolioGroup,
} from '../../lib/buildingHierarchy'
import { Badge, cn } from '../ui'
import { PropertyListView } from './PropertyListView'
import type { PortfolioProperty } from './types'

const ICON_STROKE = 1.6

function BuildingGroupHeader({
  group,
  expanded,
  onToggle,
  reducedMotion,
}: {
  group: BuildingPortfolioGroup<PortfolioProperty>
  expanded: boolean
  onToggle: () => void
  reducedMotion?: boolean
}) {
  const building = group.building
  const image = building?.images?.[0] ?? group.items[0]?.property.images[0]
  const isStandalone = group.key === STANDALONE_BUILDING_KEY
  const openTickets = group.items.reduce((n, i) => n + i.openTickets, 0)
  const vacant = group.items.filter((i) => i.occupancy === 'VACANT').length

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-[1.25rem] border px-3 py-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:px-4',
        expanded
          ? 'border-primary-200 bg-primary-50'
          : 'border-primary-100/80 bg-white hover:bg-primary-50/50',
        reducedMotion && 'transition-none',
      )}
    >
      {image ? (
        <img
          src={image}
          alt=""
          className="h-14 w-20 shrink-0 rounded-xl object-cover ring-1 ring-primary-100"
        />
      ) : (
        <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary">
          <Building2 className="h-6 w-6" strokeWidth={ICON_STROKE} aria-hidden />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-ink">{group.label}</p>
          {!isStandalone && building?.grading ? (
            <Badge tone="brand">{gradingLabel(building.grading)}</Badge>
          ) : null}
          <Badge tone="neutral">
            {group.unitCount} {group.unitCount === 1 ? 'unit' : 'units'}
          </Badge>
          {vacant > 0 ? <Badge tone="info">{vacant} vacant</Badge> : null}
          {openTickets > 0 ? <Badge tone="danger">{openTickets} maintenance</Badge> : null}
        </div>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
          <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
          {isStandalone
            ? 'Listings without a linked building'
            : group.suburbCity || building?.addressLine1 || '—'}
          {building && building.solarCapacityKw > 0 ? (
            <>
              <span className="text-ink-300">·</span>
              <Sun className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              {building.solarCapacityKw} kW solar
            </>
          ) : null}
        </p>
      </div>

      <ChevronDown
        className={cn(
          'h-5 w-5 shrink-0 text-ink-400 transition-transform duration-300',
          expanded && 'rotate-180',
          reducedMotion && 'transition-none',
        )}
        strokeWidth={ICON_STROKE}
        aria-hidden
      />
    </button>
  )
}

export function BuildingTreeView({
  items,
  buildings,
  reducedMotion,
  initiallyExpandMultiUnit = true,
}: {
  items: PortfolioProperty[]
  buildings: Building[]
  reducedMotion?: boolean
  /** Expand buildings that have more than one unit by default. */
  initiallyExpandMultiUnit?: boolean
}) {
  const groups = useMemo(
    () => groupPortfolioByBuilding(items, buildings),
    [items, buildings],
  )

  const defaultExpanded = useMemo(() => {
    const set = new Set<string>()
    for (const g of groups) {
      if (initiallyExpandMultiUnit && g.unitCount > 1) set.add(g.key)
      if (g.key === STANDALONE_BUILDING_KEY) set.add(g.key)
      if (groups.length === 1) set.add(g.key)
    }
    return set
  }, [groups, initiallyExpandMultiUnit])

  const groupKeySig = groups.map((g) => `${g.key}:${g.unitCount}`).join('|')
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(() => defaultExpanded)
  const lastSigRef = useRef(groupKeySig)

  useEffect(() => {
    if (lastSigRef.current === groupKeySig) return
    lastSigRef.current = groupKeySig
    const next = new Set<string>()
    for (const g of groups) {
      if (initiallyExpandMultiUnit && g.unitCount > 1) next.add(g.key)
      if (g.key === STANDALONE_BUILDING_KEY) next.add(g.key)
      if (groups.length === 1) next.add(g.key)
    }
    setExpandedBuildings(next)
  }, [groupKeySig, groups, initiallyExpandMultiUnit])

  const toggleBuilding = (key: string) => {
    setExpandedBuildings((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (groups.length === 0) return null

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        if (!shouldUseBuildingGroupChrome(group)) {
          return (
            <PropertyListView
              key={group.key}
              items={group.items}
              rowLinksToDetail
              reducedMotion={reducedMotion}
            />
          )
        }

        const open = expandedBuildings.has(group.key)
        return (
          <div key={group.key} className="space-y-2">
            <BuildingGroupHeader
              group={group}
              expanded={open}
              onToggle={() => toggleBuilding(group.key)}
              reducedMotion={reducedMotion}
            />
            <div
              className={cn(
                'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                reducedMotion && 'transition-none',
              )}
            >
              <div className="min-h-0 overflow-hidden">
                {open ? (
                  <div className="pl-0 sm:pl-3">
                    <PropertyListView
                      items={group.items}
                      rowLinksToDetail
                      reducedMotion={reducedMotion}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
