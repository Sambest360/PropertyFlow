/**
 * Is a listing ready to go live? One server check, used by the approval queue
 * (single and bulk approve) and by the owner's own Make live. Keep in step
 * with src/lib/propertyStatus.ts validatePropertyReadyToPublish (same rules,
 * same wording).
 */
import { query } from './db.js'

export type PendingListingFields = {
  title?: string | null
  images?: unknown[] | null
  formattedAddress?: string | null
  rent?: number | null
  price?: number | null
}

const has = <K extends keyof PendingListingFields>(p: PendingListingFields | undefined, k: K) =>
  p !== undefined && Object.prototype.hasOwnProperty.call(p, k) && p[k] !== undefined

/** null when ready, else the reason (a value in `pending` wins over the stored one). */
export async function listingNotReadyReason(unitId: string, pending?: PendingListingFields): Promise<string | null> {
  const row = (
    await query<{ title: string | null; images: unknown; formatted_address: string | null; rent: string | null; price: string | null; b_address: string | null; b_suburb: string | null }>(
      `SELECT u.title, u.images, u.formatted_address, u.rent::text AS rent, u.price::text AS price,
              b.address AS b_address, b.suburb AS b_suburb
         FROM units u LEFT JOIN buildings b ON b.id = u.building_id
        WHERE u.id = $1::uuid`,
      [unitId],
    )
  )[0]
  if (!row) return null
  const title = has(pending, 'title') ? pending!.title : row.title
  const images = has(pending, 'images') ? pending!.images : row.images
  const address = has(pending, 'formattedAddress') ? pending!.formattedAddress : row.formatted_address
  const rent = has(pending, 'rent') ? pending!.rent : row.rent == null ? null : Number(row.rent)
  const price = has(pending, 'price') ? pending!.price : row.price == null ? null : Number(row.price)
  const blank = (v: unknown) => typeof v !== 'string' || v.trim() === ''
  if (blank(title)) return 'Add a listing title before publishing.'
  if (!Array.isArray(images) || images.length === 0) return 'Add at least one listing photo before publishing.'
  if (blank(address) && blank(row.b_address) && blank(row.b_suburb)) return 'Add a street address or suburb before publishing.'
  if (!(Number(rent) > 0) && !(Number(price) > 0)) return 'Add a rent or sale price before publishing.'
  return null
}

export async function assertListingReadyToPublish(unitId: string, pending?: PendingListingFields): Promise<void> {
  const reason = await listingNotReadyReason(unitId, pending)
  if (reason) throw Object.assign(new Error(reason), { status: 422, code: 'LISTING_NOT_READY' })
}
