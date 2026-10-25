import type { AppNotification, SuiteAlertRule } from '../types/domain'
import type { NotificationToast } from './suiteAlerts'
import {
  DEFAULT_POPUP_DURATION_MS,
  resolveSuiteAlert,
  toastToneForAction,
} from './suiteAlerts'

function toastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Notifications that arrived since the last bootstrap snapshot. */
export function diffNewNotifications(
  prev: readonly AppNotification[],
  next: readonly AppNotification[],
  userId: string,
): AppNotification[] {
  const mine = prev.filter((n) => n.userId === userId)
  const seen = new Set(mine.map((n) => n.id))
  // A notification raised in this tab was already shown; if the server sends
  // it back under another id, the same title/body/link from the last few
  // minutes marks it as seen (older repeats are genuinely new).
  const recent = Date.now() - 10 * 60_000
  const seenContent = new Set(mine.filter((n) => Date.parse(n.at) >= recent).map(contentKey))
  return next.filter(
    (n) => n.userId === userId && !n.read && !seen.has(n.id) && !seenContent.has(contentKey(n)),
  )
}

function contentKey(n: AppNotification): string {
  return `${n.title}\u0000${n.body}\u0000${n.link ?? ''}`
}

export function toastsForNewNotifications(
  incoming: readonly AppNotification[],
  suiteAlerts: readonly SuiteAlertRule[],
): NotificationToast[] {
  const rules = suiteAlerts as SuiteAlertRule[]
  const out: NotificationToast[] = []
  for (const n of incoming) {
    const rule =
      n.resource && n.action
        ? resolveSuiteAlert(rules, n.agencyId, n.resource, n.action)
        : null
    if (rule && !rule.popupEnabled) continue
    out.push({
      id: toastId(),
      notificationId: n.id,
      userId: n.userId,
      title: n.title,
      body: n.body,
      link: n.link,
      durationMs: rule?.popupDurationMs ?? DEFAULT_POPUP_DURATION_MS,
      createdAt: Date.now(),
      action: n.action,
      tone: toastToneForAction(n.action),
    })
  }
  return out
}
