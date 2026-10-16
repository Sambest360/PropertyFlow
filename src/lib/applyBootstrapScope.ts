/**
 * Apply the same actor bootstrap filter the API uses (property book + agency boundary).
 */
import type { PostgresBootstrap } from './api/postgresClient'
import {
  filterBootstrapForActor,
  type BootstrapActor,
  type BootstrapPayload,
} from './bootstrapActorFilter'
import { isFieldAgent } from './permissions'
import { buildPropertyScope, toPropertyLinks } from './scope'
import type { Role } from '../types/domain'

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

export function scopeBootstrapPayloadForActor(
  boot: PostgresBootstrap,
  actor: BootstrapActor | null | undefined,
): PostgresBootstrap {
  if (!actor?.userId || !actor.role) return boot
  if (actor.role === 'super_admin') return boot

  const scope = buildPropertyScope(
    {
      role: actor.role as Role,
      userId: actor.userId,
      agencyId: actor.agencyId,
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
    actor,
    scope,
    new Set([actor.userId]),
  ) as PostgresBootstrap
}

/** Safety net when bootstrap omitted scoped (e.g. direct Supabase hydration). */
export function ensureBootstrapScopedForActor(
  boot: PostgresBootstrap,
  actor: BootstrapActor | null | undefined,
): PostgresBootstrap {
  if (!actor?.userId || !actor.role) return boot
  if (boot.scoped === true) return boot
  if (actor.role === 'super_admin') return boot
  if (isFieldAgent(actor.role as Role) || actor.role === 'tenant' || actor.role === 'landlord' || actor.role === 'contractor') {
    return scopeBootstrapPayloadForActor(boot, actor)
  }
  // Agency-wide staff: still narrow to single agency (filter sets scoped: false but trims agencies)
  return scopeBootstrapPayloadForActor(boot, actor)
}
