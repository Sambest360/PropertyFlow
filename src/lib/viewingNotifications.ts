import type { Application, AppUser, PropertyAsset, Viewing, ViewingSlot } from '../types/domain'

const SCHEDULE_FIELDS = ['date', 'time'] as const
const DETAIL_FIELDS = ['title', 'notes', 'durationMinutes'] as const

export function resolveViewingAttendeeUserId(
  users: AppUser[],
  applications: Application[],
  viewing: Viewing,
): string | null {
  const email = viewing.applicantEmail?.trim().toLowerCase()
  const app = applications.find(
    (a) =>
      a.propertyId === viewing.propertyId &&
      ((email && a.email.toLowerCase() === email) ||
        (viewing.applicantName &&
          a.applicantName.toLowerCase() === viewing.applicantName.toLowerCase())),
  )
  if (app?.applicantUserId) return app.applicantUserId
  if (email) {
    const user = users.find((u) => u.email.toLowerCase() === email)
    if (user) return user.id
  }
  return null
}

export function collectViewingAttendeeUserIds(
  users: AppUser[],
  applications: Application[],
  viewings: Viewing[],
): string[] {
  const ids = new Set<string>()
  for (const viewing of viewings) {
    if (viewing.status === 'Cancelled') continue
    const userId = resolveViewingAttendeeUserId(users, applications, viewing)
    if (userId) ids.add(userId)
  }
  return [...ids]
}

export function viewingNotificationLink(
  applications: Application[],
  viewing: Viewing,
): string {
  const email = viewing.applicantEmail?.trim().toLowerCase()
  const app = applications.find(
    (a) =>
      a.propertyId === viewing.propertyId &&
      email &&
      a.email.toLowerCase() === email,
  )
  if (app) return `/workspace/sales/applications/${encodeURIComponent(app.id)}`
  return '/workspace/portals/tenant'
}

export function slotPatchIsMaterial(
  prev: ViewingSlot,
  patch: Partial<ViewingSlot>,
): boolean {
  if (patch.status === 'Cancelled' && prev.status !== 'Cancelled') return true
  for (const key of [...SCHEDULE_FIELDS, ...DETAIL_FIELDS]) {
    if (patch[key] !== undefined && patch[key] !== prev[key]) return true
  }
  return false
}

export function describeViewingSlotChanges(
  prev: ViewingSlot,
  patch: Partial<ViewingSlot>,
  property?: PropertyAsset | null,
): { title: string; body: string } {
  const propertyLabel = property?.title ?? 'your property viewing'
  if (patch.status === 'Cancelled' && prev.status !== 'Cancelled') {
    return {
      title: 'Viewing cancelled',
      body: `The viewing for ${propertyLabel} on ${prev.date} at ${prev.time} was cancelled.`,
    }
  }

  const parts: string[] = []
  if (patch.date !== undefined && patch.date !== prev.date) {
    parts.push(`date moved to ${patch.date}`)
  }
  if (patch.time !== undefined && patch.time !== prev.time) {
    parts.push(`time moved to ${patch.time}`)
  }
  if (patch.title !== undefined && patch.title !== prev.title) {
    parts.push('title updated')
  }
  if (patch.durationMinutes !== undefined && patch.durationMinutes !== prev.durationMinutes) {
    parts.push(`duration is now ${patch.durationMinutes} min`)
  }
  if (patch.notes !== undefined && patch.notes !== prev.notes) {
    parts.push('notes updated')
  }

  const schedule =
    patch.date !== undefined || patch.time !== undefined
      ? `${patch.date ?? prev.date} at ${patch.time ?? prev.time}`
      : `${prev.date} at ${prev.time}`

  if (parts.length === 0) {
    return {
      title: 'Viewing updated',
      body: `Details for your viewing of ${propertyLabel} were updated.`,
    }
  }

  return {
    title: 'Viewing updated',
    body: `Your viewing for ${propertyLabel} on ${schedule} was changed (${parts.join(', ')}).`,
  }
}

export function describeViewingBookingChanges(
  prev: Viewing,
  patch: Partial<Viewing>,
  property?: PropertyAsset | null,
): { title: string; body: string } | null {
  const propertyLabel = property?.title ?? 'your property viewing'
  if (patch.status === 'Cancelled' && prev.status !== 'Cancelled') {
    return {
      title: 'Viewing cancelled',
      body: `Your viewing for ${propertyLabel} on ${prev.date} at ${prev.time} was cancelled.`,
    }
  }

  const scheduleChanged =
    (patch.date !== undefined && patch.date !== prev.date) ||
    (patch.time !== undefined && patch.time !== prev.time)
  const notesChanged = patch.notes !== undefined && patch.notes !== prev.notes

  if (!scheduleChanged && !notesChanged) return null

  const date = patch.date ?? prev.date
  const time = patch.time ?? prev.time
  return {
    title: 'Viewing updated',
    body: scheduleChanged
      ? `Your viewing for ${propertyLabel} was moved to ${date} at ${time}.`
      : `Notes were updated for your viewing of ${propertyLabel} on ${date} at ${time}.`,
  }
}
