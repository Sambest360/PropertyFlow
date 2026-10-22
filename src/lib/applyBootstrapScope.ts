/**
 * Apply the same actor bootstrap filter the API uses (property book + agency boundary).
 */
import type { PostgresBootstrap } from './api/postgresClient'
import {
  filterBootstrapForActor,
  type BootstrapActor,
  type BootstrapPayload,
} from './bootstrapActorFilter'
import { pickAgencyId } from './agencyScope'
import { isFieldAgent } from './permissions'
import { buildPropertyScope, toPropertyLinks } from './scope'
import type { AppUser, Role } from '../types/domain'

export function bootstrapActorFromSession(actor: {
  userId: string
  role: string
  agencyId: string | null
}): BootstrapActor {
  return {
    userId: actor.userId,
    role: actor.role,
    agencyId: actor.agencyId,
  }
}

/** Prefer live session actor + bootstrap user row over stale boot.actor agency ids. */
export function resolveBootstrapScopingActor(
  boot: PostgresBootstrap,
  live: BootstrapActor | null | undefined,
): BootstrapActor | null {
  const fromBoot = boot.actor
    ? bootstrapActorFromSession({
        userId: boot.actor.userId,
        role: boot.actor.role,
        agencyId: boot.actor.agencyId,
      })
    : null
  const base = live?.userId && live.role ? live : fromBoot
  if (!base?.userId || !base.role) return null

  const users = (boot.users ?? []) as AppUser[]
  const bootstrapAgencyId = users.find((u) => u.id === base.userId)?.agencyId ?? null
  const agencyId = pickAgencyId(base.agencyId, bootstrapAgencyId ?? fromBoot?.agencyId ?? null)

  return {
    userId: base.userId,
    role: base.role,
    agencyId,
  }
}

export function scopeBootstrapPayloadForActor(
  boot: PostgresBootstrap,
  actor: BootstrapActor | null | undefined,
): PostgresBootstrap {
  const resolved = resolveBootstrapScopingActor(boot, actor)
  if (!resolved?.userId || !resolved.role) return boot
  if (resolved.role === 'super_admin') return boot

  const scope = buildPropertyScope(
    {
      role: resolved.role as Role,
      userId: resolved.userId,
      agencyId: resolved.agencyId,
      agencySuspended: false,
    },
    {
      properties: toPropertyLinks((boot.properties ?? []) as Parameters<typeof toPropertyLinks>[0]),
      applications: boot.applications as Parameters<typeof buildPropertyScope>[1]['applications'],
      tenancies: boot.tenancies as Parameters<typeof buildPropertyScope>[1]['tenancies'],
      tickets: boot.tickets as Parameters<typeof buildPropertyScope>[1]['tickets'],
      agencyContractors: boot.agencyContractors as Parameters<
        typeof buildPropertyScope
      >[1]['agencyContractors'],
    },
  )

  return filterBootstrapForActor(
    boot as BootstrapPayload,
    resolved,
    scope,
    new Set([resolved.userId]),
  ) as PostgresBootstrap
}

/** Safety net when bootstrap omitted scoped (e.g. direct Supabase hydration). */
export function ensureBootstrapScopedForActor(
  boot: PostgresBootstrap,
  actor: BootstrapActor | null | undefined,
): PostgresBootstrap {
  const resolved = resolveBootstrapScopingActor(boot, actor)
  if (!resolved?.userId || !resolved.role) return boot
  if (boot.scoped === true) return boot
  if (resolved.role === 'super_admin') return boot
  if (
    isFieldAgent(resolved.role as Role) ||
    resolved.role === 'tenant' ||
    resolved.role === 'landlord' ||
    resolved.role === 'contractor'
  ) {
    return scopeBootstrapPayloadForActor(boot, resolved)
  }
  // Agency-wide staff: still narrow to single agency (filter sets scoped: false but trims agencies)
  return scopeBootstrapPayloadForActor(boot, resolved)
}
