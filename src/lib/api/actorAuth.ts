/**
 * Demo actor identity for API calls.
 * AuthContext keeps this in sync; persist/bootstrap clients attach headers.
 */

import type { Role } from '../../types/domain'

export const ACTOR_USER_HEADER = 'X-User-Id'
export const ACTOR_ROLE_HEADER = 'X-Role'
export const ACTOR_AGENCY_HEADER = 'X-Agency-Id'

export type DemoActor = {
  userId: string
  role: Role
  agencyId: string | null
}

let currentActor: DemoActor | null = null

/** Called from AuthContext whenever the effective user changes. */
export function setApiActor(actor: DemoActor | null): void {
  currentActor = actor
}

export function getApiActor(): DemoActor | null {
  return currentActor
}

/** Headers for fetch() — empty when no actor is set. */
export function actorHeaders(actor?: DemoActor | null): Record<string, string> {
  const a = actor === undefined ? currentActor : actor
  if (!a?.userId || !a.role) return {}
  const headers: Record<string, string> = {
    [ACTOR_USER_HEADER]: a.userId,
    [ACTOR_ROLE_HEADER]: a.role,
  }
  if (a.agencyId) headers[ACTOR_AGENCY_HEADER] = a.agencyId
  return headers
}

