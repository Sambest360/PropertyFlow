/** Client for complaints, warnings and public profiles (server/conduct.ts). */
import { actorHeaders } from './actorAuth'
import { resolveApiAuthorizationHeader } from './authClient'

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || ''

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await resolveApiAuthorizationHeader().catch(() => ({}))
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...actorHeaders(), ...auth, ...init?.headers },
  })
  const json = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`)
  return json
}

export const COMPLAINT_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'unprofessional', label: 'Unprofessional behaviour' },
  { key: 'no_response', label: 'Not responding' },
  { key: 'misleading_listing', label: 'Misleading listing' },
  { key: 'harassment', label: 'Harassment' },
  { key: 'discrimination', label: 'Discrimination' },
  { key: 'payment_dispute', label: 'Payment or deposit dispute' },
  { key: 'poor_workmanship', label: 'Poor workmanship' },
  { key: 'property_damage', label: 'Damage to property' },
  { key: 'safety', label: 'Safety concern' },
  { key: 'other', label: 'Something else' },
]
export const complaintCategoryLabel = (k: string) => COMPLAINT_CATEGORIES.find((c) => c.key === k)?.label ?? k

export const WARNING_LEVELS: Array<{ key: WarningLevel; label: string; hint: string }> = [
  { key: 'notice', label: 'Notice', hint: 'A friendly heads-up. Only the person sees it.' },
  { key: 'warning', label: 'Warning', hint: 'A formal warning. Only the person sees it.' },
  { key: 'final', label: 'Final warning', hint: 'Shown on their public profile.' },
  { key: 'severe', label: 'Severe', hint: 'Serious misconduct. Shown on their public profile.' },
]
export type WarningLevel = 'notice' | 'warning' | 'final' | 'severe'

export type Complaint = {
  id: string
  subjectUserId: string
  subjectName: string
  subjectRole: string
  mine: boolean
  authorName: string | null
  category: string
  description: string
  evidence: string[]
  status: 'open' | 'investigating' | 'upheld' | 'dismissed'
  resolutionNote: string | null
  listingTitle: string | null
  createdAt: string
  updatedAt: string
}

export type Warning = {
  id: string
  mine: boolean
  userName: string
  level: WarningLevel
  reason: string
  public: boolean
  issuedBy: string | null
  acknowledgedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

export type PublicProfile = {
  id: string
  name: string
  role: string
  agency: string | null
  avatarUrl: string | null
  memberSince: string
  rating: { average: number | null; count: number }
  reviews: Array<{ rating: number; title: string | null; body: string; author: string; at: string; listing: string | null }>
  warnings: Array<{ level: WarningLevel; reason: string; at: string }>
  upheldComplaints: number
}

export const listComplaintsApi = () => call<{ canHandle: boolean; complaints: Complaint[] }>('/api/conduct/complaints')
export const fileComplaintApi = (b: { subjectUserId: string; category: string; description: string; listingId?: string; evidence?: string[] }) =>
  call<{ id: string }>('/api/conduct/complaints', { method: 'POST', body: JSON.stringify(b) })
export const handleComplaintApi = (
  id: string,
  b: { status: Complaint['status']; note?: string; warning?: { level: WarningLevel; reason?: string; public?: boolean } },
) => call<{ ok: true }>(`/api/conduct/complaints/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(b) })
export const listWarningsApi = () => call<{ canIssue: boolean; warnings: Warning[] }>('/api/conduct/warnings')
export const issueWarningApi = (b: { userId: string; level: WarningLevel; reason: string; public?: boolean; expiresInDays?: number }) =>
  call<{ id: string; public: boolean }>('/api/conduct/warnings', { method: 'POST', body: JSON.stringify(b) })
export const warningActionApi = (id: string, action: 'acknowledge' | 'revoke') =>
  call<{ ok: true }>(`/api/conduct/warnings/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ action }) })
export const publicProfileApi = (id: string) => call<PublicProfile>(`/api/profiles/${encodeURIComponent(id)}`)
