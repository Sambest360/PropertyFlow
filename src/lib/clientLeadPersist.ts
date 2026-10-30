import { isAgencyStaff } from './permissions'
import type { Role } from '../types/domain'

/**
 * T3 (spec r4): only staff may send a lead to /api/persist from the client.
 * A guest has no actor (401), and a portal user (tenant / landlord /
 * contractor) is refused (portalWritePolicy: "not on the portal allow-list" /
 * "enquiries are create-only"). That refusal toasted "Change not saved" and
 * reloaded the page. Public enquiries are saved by POST
 * /api/public/listing-enquiry; the client only mirrors them locally.
 */
export function clientMayPersistLead(role: string | null | undefined): boolean {
  if (!role) return false
  if (role === 'super_admin') return true
  return isAgencyStaff(role as Role)
}
