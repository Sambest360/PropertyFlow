/**
 * Generates database/postgres/seed_pe_bulk.sql and prints idMap snippets.
 * Run: npx tsx scripts/gen-pe-bulk-sql.ts
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { peBulkCatalog } from '../src/data/peBulkProperties.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { properties, meta } = peBulkCatalog

function esc(s: string): string {
  return s.replace(/'/g, "''")
}

function listingType(mode: string): string {
  if (mode === 'sale') return 'SALE'
  if (mode === 'rent') return 'RENT'
  return 'BOTH'
}

function statusKey(status: string): string {
  if (status === 'Rented') return 'OCCUPIED'
  if (status === 'Sold') return 'SOLD'
  if (status === 'Under Offer') return 'UNDER_OFFER'
  return 'AVAILABLE'
}

const lines: string[] = [
  '-- Auto-generated PE bulk listings (PR-2101…PR-2200). Do not edit by hand — run scripts/gen-pe-bulk-sql.ts',
  'BEGIN;',
  '',
]

for (let i = 0; i < properties.length; i++) {
  const p = properties[i]!
  const m = meta[i]!
  const amenities = JSON.stringify(p.amenities.map((a) => a.toLowerCase()))
  const images = JSON.stringify(p.images.map((u) => u.replace('w=800', 'w=1200')))
  const price = p.price == null ? 'NULL' : p.price.toFixed(2)
  const rent = p.rent == null ? 'NULL' : p.rent.toFixed(2)
  const agent = m.agentUuid ? `'${m.agentUuid}'` : 'NULL'
  const unitNum = p.type === 'House' || p.type === 'Vacant Land' ? 'MAIN' : `U${String((i % 10) + 1).padStart(2, '0')}`

  lines.push(`-- ${p.id} · ${p.suburb}`)
  lines.push(`INSERT INTO buildings (
  id, client_id, landlord_id, name, address, city, province, suburb,
  grading, solar_capacity_kw, has_borehole, lat, lng, images
) VALUES (
  '${m.buildingUuid}',
  '${m.clientUuid}',
  '${m.landlordUuid}',
  '${esc(p.title)}',
  '${esc(p.address.split(',')[0]!.trim())}',
  'Port Elizabeth',
  'Eastern Cape',
  '${esc(p.suburb)}',
  'A',
  NULL,
  false,
  ${p.lat.toFixed(7)},
  ${p.lng.toFixed(7)},
  '${images}'::jsonb
);`)
  lines.push(`INSERT INTO units (
  id, building_id, client_id, unit_number, square_meters, bedrooms, bathrooms, parking,
  listing_type, price, rent, status_config_key, agent_id, title, description, amenities, images, featured, lat, lng
) VALUES (
  '${m.unitUuid}',
  '${m.buildingUuid}',
  '${m.clientUuid}',
  '${unitNum}',
  ${p.area.toFixed(2)}, ${p.beds}, ${p.baths.toFixed(1)}, ${p.parking},
  '${listingType(p.listingMode)}', ${price}, ${rent}, '${statusKey(p.status)}',
  ${agent},
  '${esc(p.title)}',
  '${esc(p.description)}',
  '${amenities}'::jsonb,
  '${images}'::jsonb,
  ${p.featured},
  ${p.lat.toFixed(7)},
  ${p.lng.toFixed(7)}
);`)
  lines.push('')
}

lines.push('COMMIT;')
lines.push('')

const outPath = join(root, 'database/postgres/seed_pe_bulk.sql')
writeFileSync(outPath, lines.join('\n'), 'utf8')
console.log(`Wrote ${properties.length} buildings/units → ${outPath}`)

const unitMap = meta.map((m) => `  '${m.unitUuid}': '${m.propertyId}',`).join('\n')
const bldMap = meta.map((m) => `  '${m.buildingUuid}': '${m.buildingFeId}',`).join('\n')
console.log('\n--- UNIT_TO_PROPERTY entries ---\n' + unitMap)
console.log('\n--- BUILDING_TO_FRONTEND entries ---\n' + bldMap)
