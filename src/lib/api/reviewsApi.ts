/** Client for the review routes (server/reviews.ts). */
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

export type ReviewTarget = 'property' | 'agent' | 'application'
export type ReviewSort = 'recent' | 'highest' | 'lowest' | 'helpful'

export const SUB_RATINGS: Record<ReviewTarget, Array<{ key: string; label: string }>> = {
  property: [
    { key: 'accuracy', label: 'Accuracy of listing' },
    { key: 'condition', label: 'Condition' },
    { key: 'location', label: 'Location' },
    { key: 'value', label: 'Value for money' },
  ],
  agent: [
    { key: 'communication', label: 'Communication' },
    { key: 'responsiveness', label: 'Responsiveness' },
    { key: 'professionalism', label: 'Professionalism' },
  ],
  application: [
    { key: 'ease', label: 'Ease of applying' },
    { key: 'communication', label: 'Communication' },
    { key: 'speed', label: 'Speed of decision' },
  ],
}

export type ApiReview = {
  id: string
  targetType: ReviewTarget
  authorName: string
  rating: number
  subRatings: Record<string, number>
  title: string | null
  body: string
  verified: 'tenant' | 'applicant' | 'viewer' | null
  status: 'published' | 'pending' | 'hidden'
  helpfulCount: number
  votedHelpful: boolean
  mine: boolean
  response: { body: string; name: string; at: string } | null
  createdAt: string
  updatedAt: string
}

export type ReviewSummary = {
  count: number
  average: number | null
  distribution: Record<1 | 2 | 3 | 4 | 5, number>
  subAverages: Record<string, number>
  byTarget: Record<ReviewTarget, { count: number; average: number | null }>
}

export type ReviewList = {
  reviews: ApiReview[]
  summary: ReviewSummary
  canManage: boolean
  myReviewTargets: ReviewTarget[]
  verified: ApiReview['verified']
}

export function listReviewsApi(listingId: string, opts: { sort?: ReviewSort; target?: ReviewTarget | '' } = {}) {
  const q = new URLSearchParams({ listingId })
  if (opts.sort) q.set('sort', opts.sort)
  if (opts.target) q.set('target', opts.target)
  return call<ReviewList>(`/api/reviews?${q.toString()}`)
}

export function saveReviewApi(input: {
  listingId: string
  targetType: ReviewTarget
  rating: number
  subRatings: Record<string, number>
  title: string
  body: string
}) {
  return call<{ review: ApiReview }>('/api/reviews', { method: 'POST', body: JSON.stringify(input) })
}

export function reviewActionApi(
  id: string,
  body: { action: 'helpful' | 'report' | 'respond' | 'moderate' | 'delete'; reason?: string; body?: string; status?: string; note?: string },
) {
  return call<{ ok: true; helpfulCount?: number; status?: string }>(`/api/reviews/${encodeURIComponent(id)}/actions`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function moderationQueueApi() {
  return call<{ reviews: Array<ApiReview & { listingTitle: string; reportCount: number }> }>('/api/admin/reviews')
}
