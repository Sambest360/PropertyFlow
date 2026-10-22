/**
 * Lekaya API surface — mirrors /api/v1/* for the demo store + future HTTP adapters.
 *
 * Client-only helpers (no backend in this Vite build):
 * - mapsLoader / geocoding — Google Maps when VITE_GOOGLE_MAPS_API_KEY is set
 * - documents — demo storage URL helpers
 */

export * from './contracts'
export * from './displayMetadata'
export * from './actions'
export * from './unitsApi'
export * from './applicationStatusApi'
export * from './ticketsApi'
export * from './mapsLoader'
export * from './geocoding'
export * from './documents'
export * from './persist'
export * from './postgresClient'
export * from './actorAuth'
