/**
 * Waitlist rows hold guests' names, emails and phones. In Supabase mode RLS
 * (migration 027, viewing_waitlist_select) returns them to own-agency staff
 * only, so a landlord reads an empty list. ListingLimitsPanel shows this note
 * instead of an error.
 */
export function waitlistStaffOnlyNote(opts: { supabaseMode: boolean; viewerIsStaff: boolean }): string | null {
  return opts.supabaseMode && !opts.viewerIsStaff ? 'Waitlist names are visible to agency staff only.' : null
}

/** Landlords see the counts only; limits, resets and promotions are agency staff actions. */
export const LISTING_LIMITS_READ_ONLY_NOTE = 'Limits are managed by the agency. You can see the counts here.'
