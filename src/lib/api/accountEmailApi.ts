/** Account emails, notification settings and the admin email page (server/emailRoutes.ts). */
import { authHeaders } from './authClient'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init.headers ?? {}) },
  })
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; reason?: string }
  if (!res.ok) throw new Error(body.message || body.reason || 'Something went wrong. Please try again.')
  return body
}

export function requestPasswordReset(email: string) {
  return call<{ ok: true }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
}

export function setPasswordWithToken(token: string, password: string) {
  return call<{ ok: true; email: string }>('/api/auth/set-password', { method: 'POST', body: JSON.stringify({ token, password }) })
}

export function confirmEmail(token: string) {
  return call<{ ok: true; email: string }>('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
}

/** Staff: change a user's sign-in email. It applies once confirmed from the new address. */
export function requestUserEmailChange(userId: string, email: string) {
  return call<{ ok: true; userId: string; pendingEmail: string; emailSent: boolean }>('/api/admin/users/email', {
    method: 'POST',
    body: JSON.stringify({ userId, email }),
  })
}

/** The link sent to the new address. */
export function confirmEmailChange(token: string) {
  return call<{ ok: true; email: string }>('/api/auth/confirm-email-change', { method: 'POST', body: JSON.stringify({ token }) })
}

/** Super admin: delete a user (anonymised instead when records point at them). */
export function deleteUserAccount(userId: string) {
  return call<{ ok: true; userId: string; mode: 'deleted' | 'anonymised' }>('/api/admin/users/delete', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

export function resendVerificationEmail() {
  return call<{ ok: true; alreadyVerified: boolean }>('/api/auth/resend-verification', { method: 'POST', body: '{}' })
}

export type NotificationCategory = { id: string; label: string; resources: string[] }
export type NotificationPrefs = { inApp: boolean; email: boolean; muted: string[] }

export function fetchNotificationPrefs() {
  return call<{ prefs: NotificationPrefs; categories: NotificationCategory[] }>('/api/account/notification-prefs')
}

export function saveNotificationPrefs(prefs: NotificationPrefs) {
  return call<{ prefs: NotificationPrefs }>('/api/account/notification-prefs', { method: 'PUT', body: JSON.stringify({ prefs }) })
}

export type EmailPreview = { id: string; name: string; group: string; description: string; subject: string; html: string; text: string }
export type EmailLogRow = { id: string; to_email: string; category: string | null; subject: string; provider: string; status: string; error: string | null; created_at: string }

export function fetchEmailTemplates() {
  return call<{ provider: string; sender: { email: string; name: string }; templates: EmailPreview[] }>('/api/admin/email/templates')
}

export function sendTestEmail(templateId: string) {
  return call<{ sent: boolean; reason?: string }>('/api/admin/email/test', { method: 'POST', body: JSON.stringify({ templateId }) })
}

export function fetchEmailLog() {
  return call<{ emails: EmailLogRow[] }>('/api/admin/email/log')
}
