import type { Role, SuiteAlertAction, SuiteAlertResource, SuiteAlertRule } from '../types/domain'

export type NotificationToast = {
  id: string
  notificationId: string
  userId: string
  title: string
  body: string
  link?: string
  durationMs: number
  createdAt: number
  /** Visual status for the toast strip */
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'pending'
  action?: SuiteAlertAction
}

export const SUITE_ALERT_RESOURCES: SuiteAlertResource[] = [
  'property',
  'room',
  'inventory',
  'applicant',
  'viewing',
  'viewing_slot',
  'maintenance',
  'payment',
  'document',
  'message',
]

export const SUITE_RESOURCE_LABELS: Record<SuiteAlertResource, string> = {
  property: 'Properties',
  room: 'Floor plan rooms',
  inventory: 'Inventory',
  applicant: 'Applicants',
  viewing: 'Viewing bookings',
  viewing_slot: 'Viewing slots',
  maintenance: 'Maintenance',
  payment: 'Payments',
  document: 'Documents',
  message: 'Messages',
}

export const SUITE_ACTION_LABELS: Record<SuiteAlertAction, string> = {
  created: 'Created',
  updated: 'Changed',
  deleted: 'Deleted',
}

export const DEFAULT_POPUP_DURATION_MS = 6000

export const POPUP_DURATION_OPTIONS = [
  { label: '3 seconds', value: 3000 },
  { label: '5 seconds', value: 5000 },
  { label: '6 seconds', value: 6000 },
  { label: '8 seconds', value: 8000 },
  { label: '12 seconds', value: 12000 },
] as const

const STAFF_ROLES: Role[] = ['client_admin', 'agent_admin', 'ground_agent', 'agent', 'super_admin']

export function buildDefaultSuiteAlerts(agencyId: string | null = null): SuiteAlertRule[] {
  return SUITE_ALERT_RESOURCES.map((resource) => ({
    id: `sa-${agencyId ?? 'platform'}-${resource}`,
    agencyId,
    resource,
    actions: ['created', 'updated', 'deleted'] as SuiteAlertAction[],
    enabled: true,
    popupEnabled: true,
    popupDurationMs: DEFAULT_POPUP_DURATION_MS,
    notifyRoles: [...STAFF_ROLES],
  }))
}

export function resolveSuiteAlert(
  rules: SuiteAlertRule[],
  agencyId: string | null | undefined,
  resource: SuiteAlertResource,
  action: SuiteAlertAction,
): SuiteAlertRule | null {
  const agencyRules = agencyId
    ? rules.filter((r) => r.agencyId === agencyId && r.resource === resource)
    : []
  const platformRules = rules.filter((r) => r.agencyId === null && r.resource === resource)
  const rule = agencyRules[0] ?? platformRules[0] ?? null
  if (!rule || !rule.enabled) return null
  if (!rule.actions.includes(action)) return null
  return rule
}

export function toastToneForAction(
  action?: SuiteAlertAction,
): NonNullable<NotificationToast['tone']> {
  if (action === 'deleted') return 'danger'
  if (action === 'updated') return 'warning'
  if (action === 'created') return 'success'
  return 'info'
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return 'Just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short' }).format(new Date(iso))
}
