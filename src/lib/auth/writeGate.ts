/**
 * Block durable writes until bootstrap hydration matches the signed-in user (FW-46 / Issue 14).
 */
import { getApiActor, readStoredAuthUserId } from '../api/actorAuth'

let hydratedForUserIdRef: string | null = null

/** Called from AppStore whenever portal hydration user changes. */
export function setWriteGateHydration(userId: string | null): void {
  hydratedForUserIdRef = userId
}

export function canPersistWrites(
  hydratedForUserId: string | null,
  sessionUserId: string | null,
): boolean {
  if (!sessionUserId || sessionUserId === 'guest' || sessionUserId === 'anon') return true
  if (!hydratedForUserId) return false
  return hydratedForUserId === sessionUserId
}

export function assertCanPersistWrites(): boolean {
  const sessionUserId = getApiActor()?.userId ?? readStoredAuthUserId()
  return canPersistWrites(hydratedForUserIdRef, sessionUserId)
}

/** Shown when bootstrap hydration has not caught up with the signed-in session. */
export const PERSIST_WRITE_GATE_MESSAGE =
  'Workspace is still loading. Wait a moment and try again.'
