import { query } from './db.js'

/** Who the public listing-enquiry agent alert goes to, for one unit. */
export type ListingAlertStaff = {
  agent_email: string | null
  agent_first: string | null
  landlord_email: string | null
  unit_title: string | null
}

/**
 * The agent (+ landlord when resolvable) lookup behind the
 * POST /api/public/listing-enquiry agent alert. Moved out of server/index.ts
 * unchanged so a real-Postgres test can run the exact SQL the route sends.
 */
export async function loadListingAlertStaff(unitId: string | null): Promise<ListingAlertStaff | undefined> {
  const staff = await query<ListingAlertStaff>(
    `SELECT
       ag.email AS agent_email,
       ag.first_name AS agent_first,
       ld.email AS landlord_email,
       un.title AS unit_title
     FROM units un
     LEFT JOIN users ag ON ag.id = un.agent_id
     LEFT JOIN users ld ON ld.id = un.landlord_id
     WHERE un.id = $1::uuid
     LIMIT 1`,
    [unitId],
  )
  return staff[0]
}
