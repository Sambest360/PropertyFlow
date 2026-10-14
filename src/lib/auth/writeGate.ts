/**
 * Block durable writes until bootstrap hydration matches the signed-in user (FW-46 / Issue 14).
 */
export function canPersistWrites(
  hydratedForUserId: string | null,
  sessionUserId: string | null,
): boolean {
  if (!sessionUserId || sessionUserId === 'guest' || sessionUserId === 'anon') return true
  if (!hydratedForUserId) return false
  return hydratedForUserId === sessionUserId
}
