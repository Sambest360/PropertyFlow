/**
 * SQL predicates for GET /api/bootstrap.
 *
 * Non-platform callers never select another agency's rows: every tenant table
 * is constrained to their client UUID. Property-locked roles add a second
 * predicate so the query itself, not a later in-memory filter, drops rows
 * outside that role's book. Platform super-admins stay unscoped.
 */

export type BootstrapScope = {
  role: string
  /** Postgres clients.id. Null only for super_admin. */
  clientUuid: string | null
  /** Postgres users.id of the actor whose book is being loaded. */
  userUuid: string
}

const AGENCY_WIDE = new Set(['super_admin', 'client_admin', 'agent_admin'])

const NULLABLE_CLIENT = new Set(['suite_alerts', 'events', 'notifications'])

const TRUST_KINDS = new Set([
  'invoices',
  'trust_transactions',
  'trust_allocations',
  'payouts',
  'deposits',
  'arrears',
  'csv_batches',
])

export function isAgencyWideBootstrapRole(role: string): boolean {
  return AGENCY_WIDE.has(role)
}

function failScope(): never {
  const err = new Error('Agency scope is required for bootstrap') as Error & { status: number }
  err.status = 403
  throw err
}

/**
 * `WHERE` clause. The client UUID is appended to `params` (so an existing
 * `$1` limit stays put). Role subqueries refer to that placeholder via the
 * `$CLIENT` token, rewritten here. Returns '' for super_admin.
 */
export function whereClause(scope: BootstrapScope, params: unknown[], kind: string): string {
  if (scope.role === 'super_admin') return ''
  if (!scope.clientUuid) failScope()
  params.push(scope.clientUuid)
  const clientPh = `$${params.length}::uuid`
  const col = kind === 'clients' ? 'id' : 'client_id'
  const client = NULLABLE_CLIENT.has(kind)
    ? `(${col} = ${clientPh} OR ${col} IS NULL)`
    : `${col} = ${clientPh}`
  const role = roleClause(scope, params, kind).split('$CLIENT').join(clientPh)
  return role ? `WHERE ${client} AND ${role}` : `WHERE ${client}`
}

/** Same predicate for a statement that already has WHERE. */
export function andClause(scope: BootstrapScope, params: unknown[], kind: string): string {
  const where = whereClause(scope, params, kind)
  return where ? where.replace(/^WHERE /, 'AND ') : ''
}

function pushUser(scope: BootstrapScope, params: unknown[]): string {
  params.push(scope.userUuid)
  return `$${params.length}::uuid`
}

function roleClause(scope: BootstrapScope, params: unknown[], kind: string): string {
  if (isAgencyWideBootstrapRole(scope.role)) return ''
  if (TRUST_KINDS.has(kind)) return 'FALSE'
  if (kind === 'notifications') return `user_id = ${pushUser(scope, params)}`

  if (scope.role === 'tenant' || scope.role === 'applicant') {
    if (kind === 'payments') return `party_user_id = ${pushUser(scope, params)}`
    if (kind === 'applications') return `applicant_id = ${pushUser(scope, params)}`
    if (kind === 'leases') return `tenant_id = ${pushUser(scope, params)}`
    if (kind === 'leads' || kind === 'bookings' || kind === 'viewing_slots') return 'FALSE'
    return ''
  }

  if (scope.role === 'landlord') {
    if (kind === 'buildings') return `landlord_id = ${pushUser(scope, params)}`
    if (kind === 'units') {
      return `building_id IN (SELECT id FROM buildings WHERE landlord_id = ${pushUser(scope, params)} AND client_id = $CLIENT)`
    }
    if (kind === 'rooms' || kind === 'assets' || kind === 'documents') {
      return `unit_id IN (SELECT u.id FROM units u JOIN buildings b ON b.id = u.building_id WHERE b.landlord_id = ${pushUser(scope, params)} AND u.client_id = $CLIENT)`
    }
    if (kind === 'payments') {
      return `landlord_visible = TRUE AND unit_id IN (SELECT u.id FROM units u JOIN buildings b ON b.id = u.building_id WHERE b.landlord_id = ${pushUser(scope, params)} AND u.client_id = $CLIENT)`
    }
    if (kind === 'leads' || kind === 'applications' || kind === 'leases' || kind === 'bookings' || kind === 'viewing_slots' || kind === 'tickets') {
      return `unit_id IN (SELECT u.id FROM units u JOIN buildings b ON b.id = u.building_id WHERE b.landlord_id = ${pushUser(scope, params)} AND u.client_id = $CLIENT)`
    }
    return ''
  }

  if (scope.role === 'ground_agent' || scope.role === 'agent') {
    if (kind === 'units' || kind === 'leads' || kind === 'applications' || kind === 'leases' || kind === 'bookings' || kind === 'viewing_slots') {
      return `agent_id = ${pushUser(scope, params)}`
    }
    if (kind === 'buildings') {
      return `id IN (SELECT building_id FROM units WHERE agent_id = ${pushUser(scope, params)} AND client_id = $CLIENT)`
    }
    if (kind === 'rooms' || kind === 'assets' || kind === 'documents' || kind === 'payments') {
      return `unit_id IN (SELECT id FROM units WHERE agent_id = ${pushUser(scope, params)} AND client_id = $CLIENT)`
    }
    if (kind === 'tickets') {
      const user = pushUser(scope, params)
      return `(assigned_to = ${user} OR unit_id IN (SELECT id FROM units WHERE agent_id = ${user} AND client_id = $CLIENT))`
    }
    return ''
  }

  if (scope.role === 'contractor') {
    if (kind === 'tickets') return `contractor_id = ${pushUser(scope, params)}`
    if (kind === 'leads' || kind === 'payments' || kind === 'applications' || kind === 'bookings') return 'FALSE'
    if (kind === 'units') {
      return `id IN (SELECT unit_id FROM maintenance_tickets WHERE contractor_id = ${pushUser(scope, params)} AND client_id = $CLIENT)`
    }
    if (kind === 'documents' || kind === 'rooms' || kind === 'assets') {
      return `unit_id IN (SELECT unit_id FROM maintenance_tickets WHERE contractor_id = ${pushUser(scope, params)} AND client_id = $CLIENT)`
    }
    return ''
  }

  return ''
}
