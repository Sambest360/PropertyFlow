import type {
  AppNotification,
  AppUser,
  Application,
  MaintenanceTicket,
  PropertyAsset,
  Viewing,
} from '../types/domain'
import { isPortalNotificationRecipient } from './notificationRecipients'
import {
  collectViewingAttendeeUserIds,
  resolveViewingAttendeeUserId,
  viewingNotificationLink,
} from './viewingNotifications'

type NotifyFn = (
  input: Omit<AppNotification, 'id' | 'at' | 'read'> & {
    read?: boolean
    silent?: boolean
    popupDurationMs?: number
  },
) => AppNotification

export function notifyUserOnce(
  notify: NotifyFn,
  userId: string | null | undefined,
  payload: Omit<AppNotification, 'id' | 'at' | 'read' | 'userId'>,
) {
  if (!userId) return
  notify({ ...payload, userId })
}

export function notifyViewingScheduled(
  notify: NotifyFn,
  users: AppUser[],
  applications: Application[],
  viewing: Viewing,
  property: PropertyAsset | null | undefined,
  opts?: { excludeUserId?: string | null },
) {
  const propertyLabel = property?.title ?? 'the property'
  const schedule = `${viewing.date} at ${viewing.time}`

  const attendeeId = resolveViewingAttendeeUserId(users, applications, viewing)
  if (attendeeId && attendeeId !== opts?.excludeUserId) {
    notify({
      userId: attendeeId,
      agencyId: viewing.agencyId,
      title: 'Viewing confirmed',
      body: `Your viewing for ${propertyLabel} is scheduled for ${schedule}.`,
      link: viewingNotificationLink(applications, viewing),
      resource: 'viewing',
      action: 'created',
    })
  }
}

export function notifyViewingStatusChanged(
  notify: NotifyFn,
  users: AppUser[],
  applications: Application[],
  prev: Viewing,
  nextStatus: Viewing['status'],
  property: PropertyAsset | null | undefined,
) {
  if (nextStatus === prev.status) return

  const propertyLabel = property?.title ?? 'the property'
  const schedule = `${prev.date} at ${prev.time}`
  const link = viewingNotificationLink(applications, prev)

  let attendeeTitle = 'Viewing updated'
  let attendeeBody = `Your viewing for ${propertyLabel} on ${schedule} was updated.`

  if (nextStatus === 'Completed') {
    attendeeTitle = 'Viewing completed'
    attendeeBody = `Thanks for attending the viewing at ${propertyLabel} on ${schedule}.`
  } else if (nextStatus === 'No-show') {
    attendeeTitle = 'Viewing marked no-show'
    attendeeBody = `The viewing at ${propertyLabel} on ${schedule} was recorded as a no-show.`
  } else if (nextStatus === 'Cancelled') {
    attendeeTitle = 'Viewing cancelled'
    attendeeBody = `Your viewing for ${propertyLabel} on ${schedule} was cancelled.`
  }

  for (const userId of collectViewingAttendeeUserIds(users, applications, [prev])) {
    notify({
      userId,
      agencyId: prev.agencyId,
      title: attendeeTitle,
      body: attendeeBody,
      link,
      resource: 'viewing',
      action: 'updated',
    })
  }
}

export function notifyMaintenanceOpened(
  notify: NotifyFn,
  users: AppUser[],
  ticket: MaintenanceTicket,
  property: PropertyAsset | null | undefined,
  actorUserId: string | null,
  opts?: { reporterOnly?: boolean },
) {
  const propertyLabel = property?.title ?? 'a property'
  const link = `/workspace/operations/maintenance/${encodeURIComponent(ticket.id)}`

  if (
    ticket.reportedByUserId &&
    isPortalNotificationRecipient(users, ticket.reportedByUserId)
  ) {
    notifyUserOnce(notify, ticket.reportedByUserId, {
      agencyId: ticket.agencyId,
      title: opts?.reporterOnly ? 'Fault reported' : 'Maintenance request received',
      body: opts?.reporterOnly
        ? `We sent “${ticket.title}” at ${propertyLabel} to the person responsible for your home.`
        : `We logged “${ticket.title}” for ${propertyLabel}.`,
      link:
        users.find((u) => u.id === ticket.reportedByUserId)?.role === 'tenant'
          ? '/workspace/portals/tenant/maintenance'
          : link,
      resource: 'maintenance',
      action: 'created',
    })
  }

  if (opts?.reporterOnly) return

  const landlordId = property?.landlordId
  if (landlordId && landlordId !== actorUserId) {
    notifyUserOnce(notify, landlordId, {
      agencyId: ticket.agencyId,
      title: 'Maintenance on your property',
      body: `“${ticket.title}” was logged at ${propertyLabel}.`,
      link,
      resource: 'maintenance',
      action: 'created',
    })
  }
}

export function notifyMaintenanceStatusChanged(
  notify: NotifyFn,
  users: AppUser[],
  before: MaintenanceTicket,
  after: MaintenanceTicket,
  property: PropertyAsset | null | undefined,
) {
  if (before.status === after.status) return

  const propertyLabel = property?.title ?? 'the property'
  const link = `/workspace/operations/maintenance/${encodeURIComponent(after.id)}`
  const body = `“${after.title}” at ${propertyLabel} is now ${after.status}.`

  notifyUserOnce(notify, after.contractorId, {
    agencyId: after.agencyId,
    title: 'Job status updated',
    body,
    link,
    resource: 'maintenance',
    action: 'updated',
  })

  if (
    after.reportedByUserId &&
    isPortalNotificationRecipient(users, after.reportedByUserId)
  ) {
    notifyUserOnce(notify, after.reportedByUserId, {
      agencyId: after.agencyId,
      title: 'Your maintenance update',
      body,
      link:
        users.find((u) => u.id === after.reportedByUserId)?.role === 'tenant'
          ? '/workspace/portals/tenant/maintenance'
          : link,
      resource: 'maintenance',
      action: 'updated',
    })
  }

  const landlordId = property?.landlordId
  if (landlordId) {
    notifyUserOnce(notify, landlordId, {
      agencyId: after.agencyId,
      title: 'Maintenance update',
      body,
      link,
      resource: 'maintenance',
      action: 'updated',
    })
  }
}
