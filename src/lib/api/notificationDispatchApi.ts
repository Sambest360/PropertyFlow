/** Send notifications for other people through the server (POST /api/notifications/dispatch). */
import type { AppNotification } from '../../types/domain'
import { actorHeaders } from './actorAuth'
import { resolveApiAuthorizationHeader } from './authClient'
import { isApiEnabled } from './config'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

export function dispatchNotificationsToServer(items: AppNotification[]): void {
  if (!isApiEnabled || !items.length) return
  void (async () => {
    try {
      await fetch(`${API_BASE}/api/notifications/dispatch`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...(await resolveApiAuthorizationHeader()) },
        body: JSON.stringify({
          items: items.map((n) => ({
            id: n.id,
            userId: n.userId,
            agencyId: n.agencyId,
            title: n.title,
            body: n.body,
            link: n.link,
            resource: n.resource,
            action: n.action,
          })),
        }),
      })
    } catch {
      /* the in-app copy still shows for the sender's own notifications */
    }
  })()
}
