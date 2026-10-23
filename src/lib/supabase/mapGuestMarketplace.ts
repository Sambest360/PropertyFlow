/**
 * Maps anon RPC payload → AppStore bootstrap (marketplace fields only).
 *
 * Migration 027 sends explicit public keys only: users is always [], clients
 * carry frontend_id instead of settings, and buildings / units / slots have no
 * landlord_id, agent_id or notes. This mapper never reads those even if an
 * older payload still has them (same shape as server filterBootstrapForGuest).
 */
import { GLOBAL_CLIENT_ID } from '../../data/platformLookups'
import type { PostgresBootstrap } from '../api/postgresClient'
import { buildIdMapCache, feFromCache, mapAgency, mapProperty, type IdMapCache } from './idMap'
import { canonicalListingId, unitIdForProperty } from '../listingIds'
import { resolvePropertyType } from '../propertyType'
import { mapAgencyStatusFromDb } from '../agencyStatus'
import { mapViewingSlotRow, type ViewingSlotDbRow } from './viewingSlotMap'
import { fieldsFromLimitSnapshot } from '../listingLimitCopy'

function dateOnly(v: string | null | undefined): string {
  if (!v) return ''
  return v.slice(0, 10)
}

function iso(v: string | null | undefined): string | null {
  return v ?? null
}

function mappedFe(
  cache: IdMapCache,
  entityType: string,
  uuid: string,
  fallback: string,
): string {
  return feFromCache(cache, entityType, uuid, fallback) ?? fallback
}

export function mapGuestMarketplacePayload(payload: {
  clients?: Record<string, unknown>[]
  users?: Record<string, unknown>[]
  buildings?: Record<string, unknown>[]
  units?: Record<string, unknown>[]
  rooms?: Record<string, unknown>[]
  entity_id_map?: { entity_type: string; backend_id: string; frontend_id: string }[]
  viewing_slots?: Record<string, unknown>[]
}): PostgresBootstrap {
  const clients = payload.clients ?? []
  const buildingsRaw = payload.buildings ?? []
  const tenantPiiKeys = ['tenant_id', 'tenant_name', 'tenant_email', 'tenant_phone', 'visitor_name', 'visitor_email', 'visitor_phone', 'password_hash']
  const unitsRawInput = (payload.units ?? []).map((row) => {
    const copy = { ...row }
    for (const key of tenantPiiKeys) delete copy[key]
    return copy
  })
  const roomsRaw = payload.rooms ?? []
  /** Agency frontend id: 027 sends it as clients[].frontend_id (no settings). */
  const clientFrontendId = (c: Record<string, unknown>): string | null => {
    if (typeof c.frontend_id === 'string' && c.frontend_id) return c.frontend_id
    const settings = (c.settings as Record<string, unknown> | null) ?? {}
    return typeof settings.frontend_id === 'string' && settings.frontend_id ? settings.frontend_id : null
  }
  const cache = buildIdMapCache(
    payload.entity_id_map ?? [],
    clients.map((c) => {
      const frontendId = clientFrontendId(c)
      return { id: String(c.id), settings: frontendId ? { frontend_id: frontendId } : {} }
    }),
  )

  const mapAgencyFe = (id: string | null | undefined) => mapAgency(cache, id)
  const mapPropertyFe = (id: string | null | undefined) => mapProperty(cache, id)

  const agencies = clients
    .filter((c) => {
      // 027 already drops isGlobalConfigClient rows server-side.
      const settings = (c.settings as Record<string, unknown> | null) ?? {}
      return clientFrontendId(c) !== GLOBAL_CLIENT_ID && !settings.isGlobalConfigClient
    })
    .map((c) => ({
      id: mappedFe(cache, 'agency', String(c.id), String(c.id)),
      name: String(c.company_name),
      slug: String(c.subdomain),
      city: String(c.city ?? ''),
      status: mapAgencyStatusFromDb(String(c.status)),
      createdAt: dateOnly(c.created_at as string),
      enabledPermissions: null as null,
    }))

  const buildings = buildingsRaw.map((b) => ({
    id: mappedFe(cache, 'building', String(b.id), String(b.id)),
    clientId: mapAgencyFe(b.client_id as string)!,
    // No landlord ids on the public surface (027 / filterBootstrapForGuest).
    landlordId: null as string | null,
    name: String(b.name),
    addressLine1: String(b.address),
    suburb: String(b.suburb ?? ''),
    city: String(b.city),
    province: String(b.province ?? ''),
    grading: b.grading as 'P' | 'A' | 'B' | 'C' | null,
    solarCapacityKw: b.solar_capacity_kw ? Number(b.solar_capacity_kw) : 0,
    hasBorehole: Boolean(b.has_borehole),
    lat: b.lat ? Number(b.lat) : 0,
    lng: b.lng ? Number(b.lng) : 0,
    placeId: (b.place_id as string) ?? null,
    formattedAddress: (b.formatted_address as string) ?? null,
    geocodedAt: iso(b.geocoded_at as string),
    images: Array.isArray(b.images) ? (b.images as string[]) : [],
    createdAt: dateOnly(b.created_at as string),
  }))

  const buildingByUuid = new Map(buildingsRaw.map((b) => [String(b.id), b]))
  const feBuildingByUuid = new Map(
    buildingsRaw.map((b) => [String(b.id), mappedFe(cache, 'building', String(b.id), String(b.id))]),
  )

  const unitsRaw = unitsRawInput.map((u) => {
    const b = buildingByUuid.get(String(u.building_id))
    return {
      id: unitIdForProperty(canonicalListingId(mapPropertyFe(String(u.id)) ?? String(u.id))),
      clientId: mapAgencyFe(u.client_id as string)!,
      buildingId: feBuildingByUuid.get(String(u.building_id)) ?? String(u.building_id),
      agentId: null as string | null,
      unitNumber: String(u.unit_number),
      title: String(u.title ?? u.unit_number),
      propertyType: (u.property_type as string | null | undefined) ?? null,
      squareMeters: u.square_meters ? Number(u.square_meters) : 0,
      bedrooms: Number(u.bedrooms ?? 0),
      bathrooms: u.bathrooms ? Number(u.bathrooms) : 0,
      parking: Number(u.parking ?? 0),
      listingType:
        String(u.listing_type).toLowerCase() === 'both'
          ? 'both'
          : String(u.listing_type).toLowerCase() === 'sale'
            ? 'sale'
            : 'rent',
      price: u.price != null ? Number(u.price) : null,
      rent: u.rent != null ? Number(u.rent) : null,
      statusKey: String(u.status_config_key),
      advertiseWhileOccupied: Boolean(u.advertise_while_occupied),
      availableFrom: u.available_from ? String(u.available_from).slice(0, 10) : null,
      description: String(u.description ?? ''),
      amenities: Array.isArray(u.amenities) ? (u.amenities as string[]) : [],
      images: Array.isArray(u.images) ? (u.images as string[]) : [],
      featured: Boolean(u.featured),
      lat: u.lat ? Number(u.lat) : b?.lat ? Number(b.lat) : 0,
      lng: u.lng ? Number(u.lng) : b?.lng ? Number(b.lng) : 0,
      placeId: (u.place_id as string) ?? (b?.place_id as string) ?? null,
      formattedAddress: (u.formatted_address as string) ?? (b?.formatted_address as string) ?? null,
      geocodedAt: iso(u.geocoded_at as string) ?? iso(b?.geocoded_at as string),
      createdAt: dateOnly(u.created_at as string),
      _propertyId: canonicalListingId(mapPropertyFe(String(u.id)) ?? String(u.id)),
      _unitUuid: String(u.id),
      _limit: fieldsFromLimitSnapshot(u),
    }
  })

  const properties = unitsRaw.map((u) => {
    const b = buildings.find((x) => x.id === u.buildingId)
    const unitRooms = roomsRaw.filter((r) => String(r.unit_id) === u._unitUuid)
    const statusKey = u.statusKey
    const status =
      statusKey === 'DRAFT' || statusKey === 'OFF_MARKET' || statusKey === 'NOT_LISTED'
        ? 'Draft'
        : statusKey === 'FEATURED' || u.featured
          ? 'Featured'
          : statusKey === 'UNDER_OFFER'
            ? 'Under Offer'
            : 'Published'

    return {
      id: u._propertyId,
      agencyId: u.clientId,
      landlordId: b?.landlordId ?? '',
      agentId: u.agentId,
      buildingId: u.buildingId,
      unitId: u.id,
      title: u.title,
      type: resolvePropertyType({ stored: u.propertyType, bedrooms: u.bedrooms }),
      status,
      advertiseWhileOccupied: u.advertiseWhileOccupied,
      availableFrom: u.availableFrom,
      listingMode: u.listingType,
      ...u._limit,
      price: u.price,
      rent: u.rent,
      beds: u.bedrooms,
      baths: u.bathrooms,
      parking: u.parking,
      area: u.squareMeters,
      city: b?.city ?? '',
      suburb: b?.suburb ?? '',
      address: b ? `${b.addressLine1}, ${u.unitNumber}` : u.title,
      lat: u.lat,
      lng: u.lng,
      placeId: u.placeId,
      formattedAddress: u.formattedAddress,
      geocodedAt: u.geocodedAt,
      images: u.images.length ? u.images : (b?.images ?? []),
      rooms: unitRooms.map((r) => ({
        id: String(r.id),
        name: String(r.name ?? 'Room'),
        beds: Number(r.beds ?? 0),
        baths: r.baths ? Number(r.baths) : 0,
        area: r.area_sqm ? Number(r.area_sqm) : undefined,
        kind: String(r.room_kind ?? 'other'),
      })),
      amenities: u.amenities,
      description: u.description,
      featured: u.featured,
      createdAt: u.createdAt,
      solarCapacityKw: b?.solarCapacityKw,
      hasBorehole: b?.hasBorehole,
      grading: b?.grading,
    }
  })

  const cleanUnits = unitsRaw.map(({ _propertyId, _unitUuid, _limit, ...rest }) => {
    void _limit
    return rest
  })

  const viewingSlotsRaw = (payload.viewing_slots ?? []) as ViewingSlotDbRow[]
  const viewingSlots = viewingSlotsRaw.map((s, i) =>
    mapViewingSlotRow(s, {
      index: i,
      mapFeId: (entityType, uuid, fallback) => mappedFe(cache, entityType, uuid, fallback),
      mapAgency: mapAgencyFe,
      mapPropertyFromUnit: (unitId) => mapPropertyFe(unitId ? String(unitId) : null),
      // No agent ids on the public surface.
      mapUser: () => null,
    }),
  )

  return {
    source: 'postgres',
    fetchedAt: new Date().toISOString(),
    scoped: false,
    actor: null,
    agencies,
    users: [],
    buildings,
    units: cleanUnits,
    properties,
    leads: [],
    applications: [],
    tenancies: [],
    viewings: [],
    viewingSlots,
    payments: [],
    propertyDocuments: [],
    tickets: [],
    threads: [],
    messages: [],
    notifications: [],
    suiteAlerts: [],
    activities: [],
    propertyEvents: [],
    invoices: [],
    lookups: [],
    idMapRows: (payload.entity_id_map ?? []).map((row) => ({
      entity_type: String(row.entity_type),
      backend_id: String(row.backend_id),
      frontend_id: String(row.frontend_id),
    })),
  }
}
