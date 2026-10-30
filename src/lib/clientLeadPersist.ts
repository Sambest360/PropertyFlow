import { isAgencyStaff } from './permissions'
import type { Role } from '../types/domain'

/**
 * T3 (spec r4, corrected after Angela B1): may the client send a NEW lead it
 * created (the apply path's "Application Submitted" lead) to /api/persist?
 *
 * What the server really does (server/portalWritePolicy.ts, case 'lead'; see
 * the "T3 B1" tests in server/portalWritePolicy.test.ts):
 * - guest: no actor, 401 before the policy runs. Never send.
 * - tenant: a NEW lead id is allowed (it was saved at base 8e32f69 too);
 *   only an EXISTING lead is refused, 403 "enquiries are create-only".
 * - landlord / contractor: 403 "not on the portal allow-list". Never send.
 * - super_admin and agency staff: allowed.
 *
 * The Register-interest lead is different: POST /api/public/listing-enquiry
 * already created it, so the client never re-saves it for anyone
 * (recordGuestEnquiry is local-only). That re-save of an existing lead was
 * the tenant's 403 "Change not saved" and reload.
 */
export function clientMayCreateLead(role: string | null | undefined): boolean {
  if (!role || role === 'guest') return false
  if (role === 'super_admin' || role === 'tenant') return true
  return isAgencyStaff(role as Role)
}
