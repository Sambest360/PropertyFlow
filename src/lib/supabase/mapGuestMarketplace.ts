/**
 * Maps anon RPC payload → AppStore bootstrap (marketplace fields only).
 */
import { GLOBAL_CLIENT_ID } from '../../data/platformLookups'
import type { PostgresBootstrap } from '../api/postgresClient'
import {
  buildIdMapCache,
  EMAIL_TO_USER,
  feFromCache,
  mapAgency,
  mapProperty,
  mapUser,
  resolveFrontendRole,
  type IdMapCache,
} from './idMap'

type RoleDb =
  | 'SUPER_ADMIN'
  | 'AGENCY_ADMIN'
  | 'AGENT_ADMIN'
  | 'GROUND_AGENT'
  | 'LANDLORD'
  | 'END_USER'
  | 'CONTRACTOR'

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
  entity_id_map?: { entity_type: string; backend_id: string; frontend_id: string }[]
}): PostgresBootstrap {
  const clients = payload.clients ?? []
  const users = payload.users ?? []
  const buildingsRaw = payload.buildings ?? []
  const unitsRawInput = payload.units ?? []
  const cache = buildIdMapCache(
    payload.entity_id_map ?? [],
    clients as Array<{ id: string; settings: Record<string, unknown> | null }>,
  )

  const userByUuid = new Map<string, string>()
  for (const u of users) {
    const id = String(u.id)
    const meta = (u.metadata as Record<string, unknown> | null) ?? {}
    const fromMeta = typeof meta.frontend_id === 'string' ? meta.frontend_id : null
    userByUuid.set(id, fromMeta ?? EMAIL_TO_USER[String(u.email).toLowerCase()] ?? id)
  }
  for (const row of payload.entity_id_map ?? []) {
    if (row.entity_type === 'user') userByUuid.set(row.backend_id, row.frontend_id)
  }

  const mapUserFe = (id: string | null | undefined) => mapUser(cache, userByUuid, id)
  const mapAgencyFe = (id: string | null | undefined) => mapAgency(cache, id)
  const mapPropertyFe = (id: string | null | undefined) => mapProperty(cache, id)

  const agencies = clients
    .filter((c) => {
      const settings = (c.settings as Record<string, unknown> | null) ?? {}
      return settings.frontend_id !== GLOBAL_CLIENT_ID && !settings.isGlobalConfigClient
    })
    .map((c) => ({
      id: mappedFe(cache, 'agency', String(c.id), String(c.id)),
      name: String(c.company_name),
      slug: String(c.subdomain),
      city: String(c.city ?? ''),
      status: c.status === 'active' ? 'Active' : 'Suspended',
      createdAt: dateOnly(c.created_at as string),
      enabledPermissions: null as null,
    }))

  const appUsers = users.map((u) => {
    const meta = (u.metadata as Record<string, unknown> | null) ?? {}
    const feRole = resolveFrontendRole(u.role as RoleDb, meta, String(u.email))
    const verification =
      meta.verification && typeof meta.verification === 'object' ? meta.verification : undefined
    return {
      id: userByUuid.get(String(u.id))!,
      name: `${u.first_name} ${u.last_name}`.trim(),
      email: String(u.email),
      role: feRole,
      agencyId: mapAgencyFe(u.client_id as string),
      phone: (u.phone as string) ?? undefined,
      active: Boolean(u.active),
      enabledPermissions: Array.isArray(meta.enabledPermissions) ? meta.enabledPermissions : undefined,
      verification,
    }
  })

  const buildings = buildingsRaw.map((b) => ({
    id: mappedFe(cache, 'building', String(b.id), String(b.id)),
    clientId: mapAgencyFe(b.client_id as string)!,
    landlordId: mapUserFe(b.landlord_id as string),
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
      id: `unt-${mapPropertyFe(String(u.id)) ?? u.id}`,
      clientId: mapAgencyFe(u.client_id as string)!,
      buildingId: feBuildingByUuid.get(String(u.building_id)) ?? String(u.building_id),
      agentId: mapUserFe(u.agent_id as string),
      unitNumber: String(u.unit_number),
      title: String(u.title ?? u.unit_number),
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
      _propertyId: mapPropertyFe(String(u.id))!,
    }
  })

  const properties = unitsRaw.map((u) => {
    const b = buildings.find((x) => x.id === u.buildingId)
    const statusKey = u.statusKey
    const status =
      statusKey === 'FEATURED' || u.featured
        ? 'Featured'
        : statusKey === 'UNDER_OFFER'
          ? 'Under Offer'
          : 'Published'

    return {
      id: u._propertyId,
      agencyId: u.clientId,
      landlordId: b?.landlordId ?? 'u-owner1',
      agentId: u.agentId,
      buildingId: u.buildingId,
      unitId: u.id,
      title: u.title,
      type: u.bedrooms === 0 ? 'Office' : u.bedrooms >= 3 ? 'House' : 'Apartment',
      status,
      listingMode: u.listingType,
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
      rooms: [],
      amenities: u.amenities,
      description: u.description,
      featured: u.featured,
      createdAt: u.createdAt,
      solarCapacityKw: b?.solarCapacityKw,
      hasBorehole: b?.hasBorehole,
      grading: b?.grading,
    }
  })

  const cleanUnits = unitsRaw.map(({ _propertyId, ...rest }) => rest)

  return {
    source: 'postgres',
    fetchedAt: new Date().toISOString(),
    scoped: false,
    actor: null,
    agencies,
    users: appUsers,
    buildings,
    units: cleanUnits,
    properties,
    leads: [],
    applications: [],
    tenancies: [],
    viewings: [],
    viewingSlots: [],
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
  }
}
