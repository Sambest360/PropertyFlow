/**
 * Deleted (anonymised) users stay in the users table so the leases, payments
 * and history that point at them stay intact (see userDelete.ts). They must
 * not show up anywhere for anyone except a super admin, who sees them on the
 * Deleted users page.
 */
type Row = Record<string, unknown>

export function isDeletedUserRow(u: unknown): boolean {
  return !!u && typeof u === 'object' && typeof (u as Row).deletedAt === 'string' && (u as Row).deletedAt !== ''
}

/** Drop deleted users from a bootstrap payload unless the actor is a super admin. */
export function hideDeletedUsersForActor<T>(data: T, actorRole: string | null | undefined): T {
  if (actorRole === 'super_admin') return data
  const d = data as unknown as Row
  if (!d || !Array.isArray(d.users)) return data
  return { ...d, users: (d.users as unknown[]).filter((u) => !isDeletedUserRow(u)) } as unknown as T
}
