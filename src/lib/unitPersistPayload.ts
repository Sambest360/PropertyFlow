import type { Unit } from '../data/infrastructure'
import type { PropertyAsset } from '../types/domain'

/**
 * A `unit` persist writes the same units row as the `property` persist (both
 * go through upsertProperty) and overwrites every listing column. Property
 * edits do not update the local Unit copy, so saving that copy as-is put back
 * the old title, price, rent, description, photos and featured flag right
 * after the property write saved the new ones (edit a published listing →
 * publish → the edit is gone). Take the listing fields from the property so
 * both writes agree; status and listing type stay the caller's.
 */
export function unitPersistPayload(unit: Unit, property: PropertyAsset | null | undefined): Unit {
  if (!property) return unit
  return {
    ...unit,
    agentId: property.agentId !== undefined ? property.agentId : unit.agentId,
    title: property.title ?? unit.title,
    squareMeters: property.area ?? unit.squareMeters,
    bedrooms: property.beds ?? unit.bedrooms,
    bathrooms: property.baths ?? unit.bathrooms,
    parking: property.parking ?? unit.parking,
    price: property.price !== undefined ? property.price : unit.price,
    rent: property.rent !== undefined ? property.rent : unit.rent,
    description: property.description ?? unit.description,
    amenities: property.amenities ?? unit.amenities,
    images: property.images ?? unit.images,
    featured: property.featured ?? unit.featured,
    lat: property.lat ?? unit.lat,
    lng: property.lng ?? unit.lng,
  }
}
