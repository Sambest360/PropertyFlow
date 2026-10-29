/**
 * Notification categories people can switch off (Settings → Notifications).
 * Shared by the server (which emails notifications) and the app (bell and
 * pop-ups) so both read the same choice.
 */
export const NOTIFICATION_CATEGORIES = [
  { id: 'applications', label: 'Applications', resources: ['application', 'applicant'] },
  { id: 'properties', label: 'Properties & listings', resources: ['property', 'room', 'inventory', 'unit', 'building', 'listing'] },
  { id: 'viewings', label: 'Viewings & enquiries', resources: ['viewing', 'lead', 'booking', 'enquiry'] },
  { id: 'leases', label: 'Leases & signing', resources: ['lease', 'tenancy', 'inspection'] },
  { id: 'payments', label: 'Payments & billing', resources: ['payment', 'invoice', 'deposit', 'payout', 'trust', 'billing', 'arrears'] },
  { id: 'maintenance', label: 'Maintenance & jobs', resources: ['ticket', 'maintenance', 'contractor', 'escalation'] },
  { id: 'messages', label: 'Messages & support', resources: ['message', 'thread', 'support'] },
  { id: 'account', label: 'Account, compliance & reviews', resources: ['user', 'verification', 'compliance', 'document', 'review', 'conduct', 'storage'] },
  { id: 'other', label: 'Everything else', resources: [] as string[] },
] as const

export type NotificationCategoryId = (typeof NOTIFICATION_CATEGORIES)[number]['id']

export type NotificationPrefs = {
  /** Show notifications in the app (bell and pop-ups). */
  inApp: boolean
  /** Also send them by email. */
  email: boolean
  /** Categories switched off (in the app and by email). */
  muted: NotificationCategoryId[]
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { inApp: true, email: true, muted: [] }

export function categoryForResource(resource: string | null | undefined): NotificationCategoryId {
  const r = String(resource ?? '').toLowerCase()
  if (!r) return 'other'
  for (const c of NOTIFICATION_CATEGORIES) {
    if ((c.resources as readonly string[]).some((x) => r === x || r.startsWith(x))) return c.id
  }
  return 'other'
}

export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<NotificationPrefs>
  const ids = new Set<string>(NOTIFICATION_CATEGORIES.map((c) => c.id))
  return {
    inApp: v.inApp !== false,
    email: v.email !== false,
    muted: Array.isArray(v.muted) ? (v.muted.filter((m) => ids.has(String(m))) as NotificationCategoryId[]) : [],
  }
}

/** Whether a notification should show in the app for these settings. */
export function showsInApp(prefs: NotificationPrefs, resource: string | null | undefined): boolean {
  return prefs.inApp && !prefs.muted.includes(categoryForResource(resource))
}
