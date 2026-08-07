import type {
  Application,
  AppUser,
  Lead,
  MaintenanceTicket,
  MessageThread,
  PaymentRecord,
  PropertyAsset,
  SuiteAlertRule,
  Viewing,
  ViewingSlot,
} from '../types/domain'
import type { Unit } from '../data/infrastructure'
import { isAgencyStaff } from './permissions'
import { resolveViewingAttendeeUserId } from './viewingNotifications'

export function uniqueIds(ids: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function agencyAdminIds(users: readonly AppUser[], agencyId: string): string[] {
  return users
    .filter(
      (u) =>
        u.active &&
        u.agencyId === agencyId &&
        (u.role === 'client_admin' || u.role === 'agent_admin'),
    )
    .map((u) => u.id)
}

export function propertyDeskStakeholderIds(
  users: readonly AppUser[],
  property: PropertyAsset | null | undefined,
  opts?: { includeAdmins?: boolean },
): string[] {
  const includeAdmins = opts?.includeAdmins !== false
  const agencyId = property?.agencyId
  const ids: (string | null | undefined)[] = [property?.agentId]
  if (includeAdmins && agencyId) ids.push(...agencyAdminIds(users, agencyId))
  return uniqueIds(ids)
}

export function unitDeskStakeholderIds(
  users: readonly AppUser[],
  unitId: string | null | undefined,
  units: readonly Unit[],
  properties: readonly PropertyAsset[],
  agencyId: string,
  opts?: { includeAdmins?: boolean },
): string[] {
  const unit = unitId ? units.find((u) => u.id === unitId) : undefined
  const property = unitId ? properties.find((p) => p.unitId === unitId) : undefined
  const ids: (string | null | undefined)[] = [property?.agentId ?? unit?.agentId ?? null]
  if (opts?.includeAdmins !== false) ids.push(...agencyAdminIds(users, agencyId))
  return uniqueIds(ids)
}

export function leadStakeholderIds(
  users: readonly AppUser[],
  lead: Lead,
  property: PropertyAsset | null | undefined,
): string[] {
  return uniqueIds([
    lead.agentId,
    property?.agentId,
    ...agencyAdminIds(users, lead.agencyId),
  ])
}

export function applicationStakeholderIds(
  users: readonly AppUser[],
  app: Application,
  property: PropertyAsset | null | undefined,
): string[] {
  return uniqueIds([
    app.agentId,
    property?.agentId,
    ...agencyAdminIds(users, app.agencyId),
  ])
}

/** Staff desk recipients for viewing events (attendees get separate portal notify). */
export function viewingDeskStakeholderIds(
  users: readonly AppUser[],
  viewing: Pick<Viewing, 'agencyId' | 'agentId' | 'propertyId'>,
  property: PropertyAsset | null | undefined,
): string[] {
  return uniqueIds([
    viewing.agentId,
    property?.agentId,
    ...agencyAdminIds(users, viewing.agencyId),
  ])
}

export function viewingSlotDeskStakeholderIds(
  users: readonly AppUser[],
  slot: Pick<ViewingSlot, 'agencyId' | 'agentId' | 'propertyId'>,
  property: PropertyAsset | null | undefined,
): string[] {
  return uniqueIds([
    slot.agentId,
    property?.agentId,
    ...agencyAdminIds(users, slot.agencyId),
  ])
}

/** Resolve attendee user id for viewing (portal recipient). */
export function viewingAttendeeId(
  users: readonly AppUser[],
  applications: readonly Application[],
  viewing: Viewing,
): string | null {
  return resolveViewingAttendeeUserId([...users], [...applications], viewing)
}

/** Staff desk recipients for maintenance suite alerts. */
export function maintenanceDeskStakeholderIds(
  users: readonly AppUser[],
  ticket: Pick<MaintenanceTicket, 'agencyId' | 'assignedAgentId' | 'propertyId'>,
  property: PropertyAsset | null | undefined,
): string[] {
  return uniqueIds([
    ticket.assignedAgentId,
    property?.agentId,
    ...agencyAdminIds(users, ticket.agencyId),
  ])
}

/** Staff desk recipients for payment suite alerts (party user gets separate portal notify). */
export function paymentDeskStakeholderIds(
  users: readonly AppUser[],
  payment: Pick<PaymentRecord, 'agencyId' | 'propertyId'>,
  property: PropertyAsset | null | undefined,
): string[] {
  return uniqueIds([
    property?.agentId,
    ...agencyAdminIds(users, payment.agencyId),
  ])
}

export function messageThreadRecipientIds(
  thread: Pick<MessageThread, 'participantIds'>,
  fromUserId: string,
): string[] {
  return uniqueIds(thread.participantIds.filter((id) => id !== fromUserId))
}

export function excludeActorFromIds(
  ids: string[],
  actorUserId: string | null | undefined,
  includeActor: boolean,
): string[] {
  if (includeActor || !actorUserId) return ids
  return ids.filter((id) => id !== actorUserId)
}

export function applySuiteAlertFilter(
  users: readonly AppUser[],
  recipientIds: string[],
  rule: SuiteAlertRule,
  agencyId: string | null,
): AppUser[] {
  const idSet = new Set(recipientIds)
  return users.filter((u) => {
    if (!u.active || !idSet.has(u.id)) return false
    if (!rule.notifyRoles.includes(u.role)) return false
    if (u.role !== 'super_admin' && agencyId && u.agencyId !== agencyId) return false
    return true
  })
}

/** Whether this user should receive portal-style notify() rather than staff suite alerts. */
export function isPortalNotificationRecipient(users: readonly AppUser[], userId: string): boolean {
  const user = users.find((u) => u.id === userId)
  return user ? !isAgencyStaff(user.role) : false
}

/** Active staff in agency — for admin broadcast audience. */
export function agencyStaffUsers(
  users: readonly AppUser[],
  agencyId: string,
): AppUser[] {
  return users.filter((u) => u.active && u.agencyId === agencyId && isAgencyStaff(u.role))
}
