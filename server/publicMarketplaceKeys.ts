/**
 * Exact keys the anon marketplace RPCs (migration 027) may return per row.
 * Shared by the text test (server/publicMarketplace027.test.ts) and the live
 * test (server/occupiedListing.rpc.test.ts). Adding a key here is a review
 * decision: no landlord ids, agent ids, notes, settings, email, phone or
 * metadata on the public surface.
 */
export const PUBLIC_CLIENT_KEYS = [
  'id',
  'company_name',
  'trading_as',
  'subdomain',
  'city',
  'status',
  'created_at',
  // Agency frontend id (was settings.frontend_id); needed to map listings to agencies.
  'frontend_id',
] as const

export const PUBLIC_BUILDING_KEYS = [
  'id',
  'client_id',
  'name',
  'address',
  'suburb',
  'city',
  'province',
  'grading',
  'solar_capacity_kw',
  'has_borehole',
  'lat',
  'lng',
  'place_id',
  'formatted_address',
  'geocoded_at',
  'images',
  'created_at',
] as const

export const PUBLIC_UNIT_KEYS = [
  'id',
  'building_id',
  'client_id',
  'unit_number',
  'property_type',
  'square_meters',
  'bedrooms',
  'bathrooms',
  'parking',
  'listing_type',
  'price',
  'rent',
  'deposit_amount',
  'status_config_key',
  'title',
  'description',
  'amenities',
  'images',
  'featured',
  'lat',
  'lng',
  'place_id',
  'formatted_address',
  'geocoded_at',
  'advertise_while_occupied',
  'available_from',
  'created_at',
  'updated_at',
] as const

/** unit_listing_limit_snapshot (migration 024), merged onto each unit. */
export const PUBLIC_UNIT_LIMIT_KEYS = [
  'fully_booked',
  'enquiries_full',
  'viewings_full',
  'limit_action',
  'show_remaining',
  'enquiry_count',
  'viewing_count',
  'max_enquiries',
  'max_viewings',
  'remaining',
] as const

export const PUBLIC_ROOM_KEYS = ['id', 'unit_id', 'name', 'room_kind', 'beds', 'baths', 'area_sqm', 'sort_order'] as const

export const PUBLIC_SLOT_KEYS = [
  'id',
  'client_id',
  'unit_id',
  'slot_date',
  'slot_time',
  'capacity',
  'booked_count',
  'status',
  'title',
  'duration_minutes',
] as const

export const PUBLIC_ID_MAP_KEYS = ['entity_type', 'backend_id', 'frontend_id'] as const

/** Top-level payload keys; users is always []. */
export const PUBLIC_BOOTSTRAP_KEYS = ['clients', 'buildings', 'units', 'rooms', 'viewing_slots', 'users', 'entity_id_map'] as const
export const PUBLIC_BOOTSTRAP_LITE_KEYS = ['clients', 'buildings', 'units', 'viewing_slots', 'users', 'entity_id_map'] as const
