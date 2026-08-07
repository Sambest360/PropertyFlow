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

      <div className="h-[calc(100dvh-18rem)] min-h-[20rem] overflow-hidden rounded-2xl border border-primary-100 sm:min-h-[28rem] lg:h-[calc(100dvh-16rem)]">
        {mapped ? (
          <PropertyMap
            properties={[property]}
            detailBase="/workspace/properties"
            className="h-full min-h-[20rem] rounded-none sm:min-h-[28rem]"
          />
        ) : (
          <PropertyMapPlaceholder property={property} className="h-full min-h-[20rem] border-0 sm:min-h-[28rem]" />
        )}
      </div>
    </div>
  )
}
