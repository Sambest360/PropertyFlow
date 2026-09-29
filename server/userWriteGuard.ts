/**
 * Persist-path guards for user rows.
 * A caller who can update their own profile must not be able to change role,
 * agency, active flag, permissions, or verification status.
 */
import { forbiddenError } from './actor.js'

const PRIVILEGED = new Set(['super_admin', 'client_admin', 'agent_admin'])

const ROLE_TO_DB: Record<string, string> = {
  super_admin: 'SUPER_ADMIN',
  client_admin: 'AGENCY_ADMIN',
  agency_admin: 'AGENCY_ADMIN',
  agent_admin: 'AGENT_ADMIN',
  agent: 'GROUND_AGENT',
  ground_agent: 'GROUND_AGENT',
  landlord: 'LANDLORD',
  tenant: 'END_USER',
  applicant: 'END_USER',
  contractor: 'CONTRACTOR',
}

const ROLE_FROM_DB: Record<string, string> = {
  SUPER_ADMIN: 'super_admin',
  AGENCY_ADMIN: 'client_admin',
  AGENT_ADMIN: 'agent_admin',
  GROUND_AGENT: 'ground_agent',
  LANDLORD: 'landlord',
  END_USER: 'tenant',
  CONTRACTOR: 'contractor',
}

export type ExistingUserWrite = {
  role: string
  clientId: string | null
  active: boolean
  metadata: Record<string, unknown> | null
}

export type GuardedUserWrite = {
  dbRole: string
  frontendRole: string
  /** null means "no agency change requested"; a uuid string is the client id to store. */
  clientId: string | null
  active: boolean
  metadata: Record<string, unknown>
}

function verificationStatus(meta: Record<string, unknown> | null | undefined): string | null {
  const v = meta?.verification
  if (!v || typeof v !== 'object') return null
  const status = (v as { status?: unknown }).status
  return typeof status === 'string' ? status : null
}

/**
 * Returns the role, agency, and metadata that are safe to write.
 * `requestedClientId` is already resolved to a uuid (or null).
 */
export function guardUserWrite(opts: {
  actorRole: string | null
  existing: ExistingUserWrite | null
  requestedFrontendRole: string
  requestedClientId: string | null
  requestedActive: boolean
  metadata: Record<string, unknown>
}): GuardedUserWrite {
  const privileged = opts.actorRole != null && PRIVILEGED.has(opts.actorRole)
  let frontendRole = opts.requestedFrontendRole || 'tenant'
  let dbRole = ROLE_TO_DB[frontendRole] ?? 'END_USER'
  let clientId = opts.requestedClientId
  let active = opts.requestedActive
  const metadata: Record<string, unknown> = { ...opts.metadata }

  if (opts.existing && !privileged) {
    dbRole = opts.existing.role
    frontendRole =
      typeof opts.existing.metadata?.frontend_role === 'string'
        ? opts.existing.metadata.frontend_role
        : (ROLE_FROM_DB[opts.existing.role] ?? frontendRole)
    clientId = opts.existing.clientId
    active = opts.existing.active
    metadata.frontend_role = frontendRole
    if ('enabledPermissions' in (opts.existing.metadata ?? {})) {
      metadata.enabledPermissions = opts.existing.metadata?.enabledPermissions ?? null
    } else {
      delete metadata.enabledPermissions
    }
    if (opts.existing.metadata && 'verification' in opts.existing.metadata) {
      const existingStatus = verificationStatus(opts.existing.metadata)
      const requestedStatus = verificationStatus(metadata)
      const requestedDocs =
        metadata.verification &&
        typeof metadata.verification === 'object' &&
        Array.isArray((metadata.verification as { documents?: unknown }).documents)
          ? (metadata.verification as { documents: unknown[] }).documents
          : null
      // A registrant may attach storage refs while verification is still pending.
      // Status, role, and agency stay frozen for non-privileged callers.
      if (existingStatus === 'pending' && requestedStatus === 'pending' && requestedDocs) {
        const prev =
          opts.existing.metadata.verification && typeof opts.existing.metadata.verification === 'object'
            ? (opts.existing.metadata.verification as Record<string, unknown>)
            : {}
        metadata.verification = {
          ...prev,
          ...(metadata.verification as Record<string, unknown>),
          status: 'pending',
          documents: requestedDocs,
        }
      } else {
        metadata.verification = opts.existing.metadata.verification
      }
    } else {
      delete metadata.verification
    }
  }

  if (dbRole === 'SUPER_ADMIN' && opts.actorRole !== 'super_admin') {
    throw forbiddenError('Only a super admin can grant the super admin role')
  }

  if (!opts.existing && !privileged) {
    const status = verificationStatus(metadata)
    if (status === 'approved' || status === 'rejected') {
      const prev =
        metadata.verification && typeof metadata.verification === 'object'
          ? (metadata.verification as Record<string, unknown>)
          : {}
      metadata.verification = { ...prev, status: 'pending' }
    }
  }

  metadata.frontend_role = frontendRole
  return { dbRole, frontendRole, clientId, active, metadata }
}
