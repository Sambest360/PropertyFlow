/**
 * Creates the GoTrue user for an agency invite.
 * Uses the service-role client only. Never reads a key from the request.
 * Password reset is not done here — the SPA keeps using supabase.auth.resetPasswordForEmail.
 */
import { createAdminClient } from './admin.js'

export async function inviteAuthUserByEmail(email: string): Promise<{ userId: string }> {
  const admin = createAdminClient()
  const redirectTo = process.env.SUPABASE_INVITE_REDIRECT_URL?.trim() || undefined
  const { data, error } = await admin.auth.admin.inviteUserByEmail(
    email,
    redirectTo ? { redirectTo } : {},
  )
  const userId = data.user?.id
  if (error || !userId) {
    const err = new Error(error?.message || 'Could not invite the user') as Error & { status: number }
    err.status = 502
    throw err
  }
  return { userId }
}
