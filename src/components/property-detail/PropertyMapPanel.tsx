import { MapPin } from 'lucide-react'
import type { PropertyAsset } from '../../types/domain'
import { PropertyMap, PropertyMapPlaceholder } from '../PropertyMap'
import { hasMappedCoordinates } from '../../lib/mapCoords'
import { ICON_STROKE } from './types'

export function PropertyMapPanel({ property }: { property: PropertyAsset }) {
  const mapped = hasMappedCoordinates(property)
  const addressLine =
    property.formattedAddress ?? [property.address, property.suburb, property.city].filter(Boolean).join(', ')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">Map</h2>
          <p className="mt-1 flex items-start gap-2 text-sm text-ink-500">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
            {addressLine}
          </p>
        </div>
        {!mapped && (
          <p className="text-xs text-ink-400">
            Pin will appear after the address is geocoded — edit the property to refresh coordinates.
          </p>
        )}
      </div>

      <div className="min-h-[min(28rem,70vh)] overflow-hidden rounded-2xl border border-primary-100 sm:min-h-[32rem]">
        {mapped ? (
          <PropertyMap
            properties={[property]}
            detailBase="/workspace/properties"
            className="h-full min-h-[min(28rem,70vh)] rounded-none sm:min-h-[32rem]"
          />
        ) : (
          <PropertyMapPlaceholder property={property} className="h-full min-h-[min(28rem,70vh)] border-0 sm:min-h-[32rem]" />
        )}
      </div>
    </div>
  )
}
