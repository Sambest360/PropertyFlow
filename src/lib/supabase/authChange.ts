/**
 * P0 empty-DB Super Admin session: decisions for onAuthStateChange.
 *
 * GoTrue holds an auth lock during the onAuthStateChange callback. Awaiting
 * getUser()/profile loads *inside* that callback can deadlock or fail, and the
 * previous code treated any missing profile as signed-out — clearing React
 * auth while the JWT/cookie remained. RequireAuth then kicked to
 * /login?next=/workspace/admin/agencies (Kelly empty-DB SA repro).
 */

export type AuthChangeDecision =
  | { action: 'signed_out' }
  | { action: 'apply'; profile: unknown }
  | { action: 'keep' }

/**
 * Resolve what the shell should do for an auth-change event.
 * - no session → signed_out
 * - verify fails / uid mismatch → signed_out (dead cached JWT)
 * - profile loads → apply
 * - live session but profile miss after retry → keep (do NOT clear React auth)
 */
export async function resolveAuthChangeDecision<T>(opts: {
  sessionUserId: string | null | undefined
  verifyUser: () => Promise<{ id: string } | null>
  loadProfile: (authUserId: string) => Promise<T | null>
  retryDelayMs?: number
}): Promise<AuthChangeDecision & { profile?: T }> {
  const sessionUserId = opts.sessionUserId?.trim() || null
  if (!sessionUserId) return { action: 'signed_out' }

  let verified: { id: string } | null
  try {
    verified = await opts.verifyUser()
  } catch {
    // Transient verify failure with a live local session — keep shell auth.
    return { action: 'keep' }
  }
  if (!verified?.id || verified.id !== sessionUserId) {
    return { action: 'signed_out' }
  }

  let profile = await opts.loadProfile(verified.id)
  if (!profile) {
    const delay = opts.retryDelayMs ?? 400
    if (delay > 0) await new Promise((r) => setTimeout(r, delay))
    profile = await opts.loadProfile(verified.id)
  }
  if (profile) return { action: 'apply', profile }
  // Valid JWT, profile row temporarily unreadable (empty-DB RLS/race) —
  // never treat as signed-out; login() already applied the profile.
  return { action: 'keep' }
}
