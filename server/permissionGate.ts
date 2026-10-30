/**
 * Per-user permission restrictions, enforced on the server.
 *
 * A super admin (or agency admin) can switch off permissions a user's role
 * normally has (users.metadata.enabledPermissions). Hiding the page is not
 * enough, so for a switched-off permission the server also:
 * - leaves the matching collections out of /api/bootstrap, and
 * - refuses the matching /api/persist writes and API actions (403).
 *
 * Only explicit restrictions count (isRestrictedPermission / allRestricted):
 * a user on role defaults, or a permission the role never had, changes
 * nothing here, so default access is exactly what it was before.
 */
import type { Permission, Role } from '../src/types/domain.js'
import {
  allRestricted,
  isRestrictedPermission,
  normalizeStoredPermissions,
  rolePermissions,
} from '../src/lib/permissions.js'
import { query } from './db.js'
import { resolveUuid } from './entityMap.js'
import type { DemoActor } from './actor.js'

/** The actor's own saved permission list (null = role defaults). */
export async function loadActorPermissionList(actor: Pick<DemoActor, 'role' | 'userId'>): Promise<Permission[] | null> {
  if (actor.role === 'super_admin') return null
  const uuid = await resolveUuid('user', actor.userId)
  if (!uuid) return null
  const rows = await query<{ enabled: unknown; version: unknown }>(
    `SELECT metadata->'enabledPermissions' AS enabled, metadata->'permissionsVersion' AS version
       FROM users WHERE id = $1::uuid LIMIT 1`,
    [uuid],
  )
  return normalizeStoredPermissions(rows[0]?.enabled, rows[0]?.version)
}

/**
 * Bootstrap collections and the permissions that give access to them. A
 * collection is left out when every listed permission the role has by
 * default was switched off for this user.
 */
export const COLLECTION_PERMISSIONS: Readonly<Record<string, readonly Permission[]>> = {
  properties: ['assets.view', 'assets.manage', 'listings.publish'],
  units: ['assets.view', 'assets.manage', 'listings.publish'],
  buildings: ['assets.view', 'assets.manage', 'listings.publish'],
  infraRooms: ['assets.view', 'assets.manage'],
  internalAssets: ['assets.view', 'assets.manage'],
  leads: ['leads.view', 'leads.manage'],
  applications: ['applications.view', 'applications.review'],
  viewings: ['viewings.manage'],
  viewingSlots: ['viewings.manage'],
  payments: ['payments.view', 'payments.manage'],
  propertyDocuments: ['documents.view'],
  tickets: ['maintenance.view', 'maintenance.manage'],
  threads: ['messages.manage'],
  messages: ['messages.manage'],
  tenancies: ['occupants.view'],
  agencyContractors: ['contractors.view', 'contractors.manage'],
  trustTransactions: ['trust.view', 'trust.allocate', 'trust.import_csv', 'trust.approve_payout'],
  trustAllocations: ['trust.view', 'trust.allocate', 'trust.approve_payout'],
  payoutInstructions: ['trust.view', 'trust.approve_payout'],
  depositHoldings: ['trust.view'],
  csvImportBatches: ['trust.view', 'trust.import_csv'],
  arrearsSnapshots: ['trust.view', 'trust.view_arrears'],
}

/** Drop the collections this user was restricted from (role defaults untouched). */
export function stripRestrictedCollections<T extends Record<string, unknown>>(
  payload: T,
  role: string,
  userEnabled: Permission[] | null,
): T {
  if (!userEnabled?.length || role === 'super_admin') return payload
  let out: Record<string, unknown> | null = null
  for (const [key, perms] of Object.entries(COLLECTION_PERMISSIONS)) {
    if (!(key in payload) || !Array.isArray(payload[key])) continue
    if (!allRestricted(role as Role, perms, userEnabled)) continue
    out ??= { ...payload }
    out[key] = []
  }
  return (out ?? payload) as T
}

/** Persist resources and the permission needed to change them. */
export const WRITE_PERMISSION: Readonly<Record<string, Permission>> = {
  property: 'assets.manage',
  unit: 'assets.manage',
  building: 'assets.manage',
  room: 'assets.manage',
  asset: 'assets.manage',
  lead: 'leads.manage',
  application: 'applications.review',
  viewing: 'viewings.manage',
  viewing_slot: 'viewings.manage',
  payment: 'payments.manage',
  ticket: 'maintenance.manage',
  thread: 'messages.manage',
  message: 'messages.manage',
  lookup: 'config.manage',
  // 'user' is not listed: people save their own profile and signature through
  // it, and managing other users is checked by scopeGate (actorHasUsersManage).
}

function forbidden(message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 403, code: 'PERMISSION_RESTRICTED' })
}

/** 403 when the user was explicitly restricted from `permission`. */
export async function assertNotRestricted(
  actor: Pick<DemoActor, 'role' | 'userId'>,
  permission: Permission,
  list?: Permission[] | null,
): Promise<void> {
  // Only a permission the role has by default can be switched off: skip the
  // lookup otherwise (guests, portal users acting outside staff permissions).
  if (actor.role === 'super_admin' || !(rolePermissions[actor.role as Role] ?? []).includes(permission)) return
  const userEnabled = list === undefined ? await loadActorPermissionList(actor) : list
  if (isRestrictedPermission(actor.role as Role, permission, userEnabled)) {
    throw forbidden('Your access to this has been switched off by an administrator.')
  }
}

/** /api/persist: 403 when the resource's permission was switched off for this user. */
export async function assertWriteNotRestricted(
  actor: Pick<DemoActor, 'role' | 'userId'>,
  resource: string,
): Promise<void> {
  const permission = WRITE_PERMISSION[resource]
  if (!permission || actor.role === 'super_admin') return
  await assertNotRestricted(actor, permission)
}
