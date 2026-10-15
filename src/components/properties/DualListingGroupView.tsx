import { useState } from 'react'
import { Building2, ChevronDown, MapPin } from 'lucide-react'
import { Badge, cn } from '../ui'
import { PropertyListView } from './PropertyListView'
import type { PortfolioProperty } from './types'

const ICON_STROKE = 1.6

export function DualListingGroupView({
  item,
  reducedMotion,
  initiallyExpanded = true,
}: {
  item: PortfolioProperty
  reducedMotion?: boolean
  initiallyExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const p = item.property
  const image = p.images[0]

  const rows = [
    { item, marketSegment: 'rent' as const },
    { item, marketSegment: 'sale' as const },
  ]

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
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
            <p className="truncate font-semibold text-ink">{p.title}</p>
            <Badge tone="brand">Sale &amp; rent</Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">
            <MapPin className="h-3 w-3 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
            {item.unitNumber ? `Unit ${item.unitNumber} · ` : ''}
            {item.buildingName ? `${item.buildingName} · ` : ''}
            {p.suburb}, {p.city}
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

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          reducedMotion && 'transition-none',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {expanded ? (
            <div className="pl-0 sm:pl-3">
              <PropertyListView
                items={[item]}
                rows={rows}
                rowLinksToDetail
                reducedMotion={reducedMotion}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
