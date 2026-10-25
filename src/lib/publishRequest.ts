/**
 * Agents without "Publish listings" permission ask their agency admins to
 * publish instead of hitting a failed save: every admin of the listing's
 * agency gets a notification linking to the listing.
 */
import type { AppNotification, AppUser, PropertyAsset } from '../types/domain'

const ADMIN_ROLES = new Set(['client_admin', 'agent_admin'])

/** Active agency admins who can publish this agency's listings. */
export function agencyAdminsFor(agencyId: string | null | undefined, users: readonly AppUser[]): AppUser[] {
  if (!agencyId) return []
  return users.filter((u) => u.agencyId === agencyId && ADMIN_ROLES.has(u.role) && u.active !== false)
}

export type NotifyFn = (
  input: Omit<AppNotification, 'id' | 'at' | 'read'> & { read?: boolean; silent?: boolean },
) => unknown

/**
 * Notify the agency admins. Returns how many were notified (0 when the agency
 * has no admin on file — callers then tell the agent to contact the agency).
 */
export function requestListingPublish(input: {
  property: Pick<PropertyAsset, 'id' | 'title' | 'agencyId'>
  requester: Pick<AppUser, 'id' | 'name' | 'agencyId'>
  users: readonly AppUser[]
  notify: NotifyFn
}): number {
  const agencyId = input.property.agencyId || input.requester.agencyId
  const admins = agencyAdminsFor(agencyId, input.users).filter((a) => a.id !== input.requester.id)
  for (const admin of admins) {
    input.notify({
      userId: admin.id,
      agencyId: agencyId ?? null,
      title: 'Listing waiting to be published',
      body: `${input.requester.name || 'An agent'} asked you to review and publish "${input.property.title || 'a listing'}".`,
      link: `/workspace/properties/${encodeURIComponent(input.property.id)}`,
      resource: 'property',
      action: 'updated',
      silent: true,
    })
  }
  return admins.length
}

/** Confirmation copy shown to the agent after a request. */
export function publishRequestMessage(adminCount: number): { title: string; body: string } {
  if (adminCount > 0) {
    return {
      title: 'Sent to your agency admin',
      body: `You don't have permission to publish listings, so we've notified your agency admin${
        adminCount === 1 ? '' : 's'
      } to review and publish it. It stays saved as a draft until then.`,
    }
  }
  return {
    title: 'Saved as a draft',
    body: "You don't have permission to publish listings and no agency admin is on file to notify. Ask your agency to publish it.",
  }
}
