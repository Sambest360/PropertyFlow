import { useMemo, useState } from 'react'
import { MessageSquareQuote } from 'lucide-react'
import { Button, Textarea, cn } from '../ui'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import type { Application, Review, ReviewTargetType } from '../../types/domain'
import { StarRating, averageRating } from './StarRating'
import { Link } from 'react-router-dom'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'
import { isApiEnabled } from '../../lib/api/config'
import { ApiReviewsSection } from './ApiReviewsSection'

function formatReviewDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}

function targetLabel(r: Review) {
  if (r.targetType === 'property') return 'Property'
  if (r.targetType === 'application') return 'Application experience'
  return 'Agent'
}

export function ListingReviewsSection(props: {
  propertyId: string
  agencyId: string
  agentId: string | null
  agentName?: string | null
}) {
  // Live server: real, shared reviews. Demo mode keeps the in-browser version.
  if (isApiEnabled) return <ApiReviewsSection listingId={props.propertyId} hasAgent={Boolean(props.agentId || props.agentName)} />
  return <LocalReviewsSection {...props} />
}

function LocalReviewsSection({
  propertyId,
  agencyId,
  agentId,
  agentName,
}: {
  propertyId: string
  agencyId: string
  agentId: string | null
  agentName?: string | null
}) {
  const { state, createReview } = useStore()
  const { user, isAuthenticated } = useAuth()
  const { label: agentLabel } = useAgentDisplay()
  const agentFeedback = agentLabel(agentId, agentName)
  const [rating, setRating] = useState(5)
  const [body, setBody] = useState('')
  const [targetType, setTargetType] = useState<ReviewTargetType>('property')
  const [applicationId, setApplicationId] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const myApps = useMemo(
    () =>
      state.applications.filter(
        (a) =>
          a.propertyId === propertyId &&
          (a.applicantUserId === user.id ||
            (Boolean(user.email) && a.email?.toLowerCase() === user.email?.toLowerCase())),
      ),
    [state.applications, propertyId, user.id, user.email],
  )

  const listingReviews = useMemo(() => {
    return state.reviews.filter((r) => {
      if (r.propertyId === propertyId && (r.targetType === 'property' || r.targetType === 'application')) {
        return true
      }
      if (r.targetType === 'agent' && agentId && r.targetId === agentId && r.propertyId === propertyId) {
        return true
      }
      return false
    })
  }, [state.reviews, propertyId, agentId])

  const propertyReviews = listingReviews.filter((r) => r.targetType === 'property' || r.targetType === 'application')
  const avg = averageRating(propertyReviews)

  const submit = () => {
    setError('')
    setOk('')
    if (!isAuthenticated) {
      setError('Sign in to leave a review.')
      return
    }
    let targetId = propertyId
    if (targetType === 'agent') {
      if (!agentId) {
        setError('No agent assigned to this listing yet.')
        return
      }
      targetId = agentId
    }
    if (targetType === 'application') {
      const appId = applicationId || myApps[0]?.id
      if (!appId) {
        setError('Apply to this property first, then review your application experience.')
        return
      }
      targetId = appId
    }

    const result = createReview({
      targetType,
      targetId,
      propertyId,
      agencyId,
      authorUserId: user.id,
      authorName: user.name,
      rating,
      body,
    })
    if (result && 'error' in result) {
      setError(result.error)
      return
    }
    setBody('')
    setRating(5)
    setOk('Thanks — your review was posted.')
  }

  return (
    <section className="border-b border-primary-100 py-6" id="reviews">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <MessageSquareQuote className="h-5 w-5 text-ink-400" aria-hidden />
            Reviews
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Property and application experiences for this home
            {agentFeedback ? ` · agent feedback for ${agentFeedback}` : ''}.
          </p>
        </div>
        {avg != null ? (
          <div className="flex items-center gap-2">
            <StarRating value={Math.round(avg)} readOnly size="sm" label={`${avg} average`} />
            <span className="tabular text-sm font-semibold text-ink">{avg}</span>
            <span className="text-xs text-ink-400">({propertyReviews.length})</span>
          </div>
        ) : (
          <p className="text-sm text-ink-400">No reviews yet</p>
        )}
      </div>

      <ul className="mt-5 space-y-3">
        {listingReviews.length === 0 ? (
          <li className="rounded-2xl bg-primary-50 px-4 py-3 text-sm text-ink-500">
            Be the first to share how this listing and application process went.
          </li>
        ) : (
          listingReviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-primary-100 bg-white px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{r.authorName}</p>
                  <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-ink-500">
                    {targetLabel(r)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StarRating value={r.rating} readOnly size="sm" />
                  <span className="text-xs text-ink-400">{formatReviewDate(r.createdAt)}</span>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{r.body}</p>
            </li>
          ))
        )}
      </ul>

      <div className="mt-6 rounded-2xl border border-primary-100 bg-primary-50/60 p-4">
        <p className="text-sm font-semibold text-ink">Write a review</p>
        {!isAuthenticated ? (
          <p className="mt-2 text-sm text-ink-500">
            <Link to={`/login?next=${encodeURIComponent(`/listing/${propertyId}`)}`} className="font-semibold text-primary hover:underline">
              Sign in
            </Link>{' '}
            to rate this property, your application experience, or the agent.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'property' as const, label: 'Property' },
                  { id: 'application' as const, label: 'Application' },
                  { id: 'agent' as const, label: 'Agent' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTargetType(opt.id)}
                  className={cn(
                    'min-h-11 cursor-pointer rounded-full px-3.5 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    targetType === opt.id
                      ? 'bg-primary text-white'
                      : 'bg-white text-ink-600 hover:bg-primary-50',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {targetType === 'application' && (
              <ApplicationPicker apps={myApps} value={applicationId} onChange={setApplicationId} />
            )}

            <StarRating value={rating} onChange={setRating} label="Your rating" />
            <Textarea
              rows={3}
              placeholder={
                targetType === 'property'
                  ? 'How was the home, photos, and overall listing?'
                  : targetType === 'application'
                    ? 'How was applying, screening, and communication about this property?'
                    : 'How was working with the agent?'
              }
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-22 bg-white"
            />
            {error && <p className="text-sm text-accent">{error}</p>}
            {ok && <p className="text-sm text-primary">{ok}</p>}
            <Button type="button" className="min-h-11" onClick={submit}>
              Post review
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

function ApplicationPicker({
  apps,
  value,
  onChange,
}: {
  apps: Application[]
  value: string
  onChange: (id: string) => void
}) {
  if (!apps.length) {
    return (
      <p className="rounded-xl bg-white px-3 py-2 text-xs text-ink-500">
        You don’t have an application on this property yet — submit one first to review that experience.
      </p>
    )
  }
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-xs font-semibold text-ink-500">Your application</span>
      <select
        className="h-11 w-full cursor-pointer rounded-xl border border-primary-100 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        value={value || apps[0]?.id}
        onChange={(e) => onChange(e.target.value)}
      >
        {apps.map((a) => (
          <option key={a.id} value={a.id}>
            {a.type} · {a.stage} ({a.id.slice(0, 8)})
          </option>
        ))}
      </select>
    </label>
  )
}
