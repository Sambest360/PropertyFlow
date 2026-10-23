import { describe, expect, it } from 'vitest'
import { waitlistStaffOnlyNote } from './waitlistAccess'

describe('waitlistStaffOnlyNote', () => {
  it('tells a landlord in Supabase mode the waitlist is staff-only', () => {
    expect(waitlistStaffOnlyNote({ supabaseMode: true, viewerIsStaff: false })).toBe(
      'Waitlist names are visible to agency staff only.',
    )
  })
  it('shows nothing for staff, or in API mode', () => {
    expect(waitlistStaffOnlyNote({ supabaseMode: true, viewerIsStaff: true })).toBeNull()
    expect(waitlistStaffOnlyNote({ supabaseMode: false, viewerIsStaff: false })).toBeNull()
  })
})
