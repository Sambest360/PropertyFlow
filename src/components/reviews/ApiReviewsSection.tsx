/**
 * Listing reviews backed by the server, kept simple: one average, a short
 * list (newest or most helpful), verified badges, helpful votes, reports and
 * agency replies. Writing a review is one star rating and a few sentences,
 * opened from a single button.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Flag, MessageSquareQuote, Reply, ThumbsUp } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button, Select, Textarea, cn } from '../ui'
import { StarRating } from './StarRating'
import {
  listReviewsApi,
  reviewActionApi,
  saveReviewApi,
  type ApiReview,
  type ReviewList,
  type ReviewSort,
  type ReviewTarget,
} from '../../lib/api/reviewsApi'
import { sweetSuccess, sweetWarning } from '../../lib/sweetAlert'

const TARGET_LABEL: Record<ReviewTarget, string> = {
  property: 'The property',
  agent: 'The agent',
  application: 'Applying',
}
const VERIFIED_LABEL = { tenant: 'Verified tenant', applicant: 'Verified applicant', viewer: 'Viewed this property' } as const
const REPORT_REASONS = [
  { id: 'spam', label: 'Spam or advertising' },
  { id: 'offensive', label: 'Offensive or abusive' },
  { id: 'fake', label: 'Not a real experience' },
  { id: 'personal_info', label: 'Shares personal information' },
  { id: 'other', label: 'Something else' },
]

const when = (iso: string) => new Date(iso).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })

function Summary({ data }: { data: ReviewList }) {
  const s = data.summary
  if (!s.count) return <p className="mt-2 text-sm text-ink-500">No reviews yet.</p>
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl font-semibold tabular-nums text-ink">{s.average?.toFixed(1)}</span>
      <StarRating value={Math.round(s.average ?? 0)} readOnly size="sm" label={`${s.average} out of 5`} />
      <span className="text-xs text-ink-500">
        {s.count} review{s.count === 1 ? '' : 's'}
      </span>
    </div>
  )
}

function ReviewCard({
  r,
  canManage,
  canModerate,
  onChanged,
  onEdit,
}: {
  r: ApiReview
  canManage: boolean
  canModerate: boolean
  onChanged: () => void
  onEdit: () => void
}) {
  const { isAuthenticated } = useAuth()
  const [helpful, setHelpful] = useState({ count: r.helpfulCount, voted: r.votedHelpful })
  const [reporting, setReporting] = useState(false)
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState(r.response?.body ?? '')
  const [expanded, setExpanded] = useState(false)
  const long = r.body.length > 400

  const act = async (body: Parameters<typeof reviewActionApi>[1], done?: string) => {
    try {
      const res = await reviewActionApi(r.id, body)
      if (body.action === 'helpful') setHelpful((h) => ({ count: res.helpfulCount ?? h.count, voted: !h.voted }))
      else {
        if (done) await sweetSuccess(done, '')
        onChanged()
      }
    } catch (e) {
      await sweetWarning('Could not do that', e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <li className="rounded-2xl border border-primary-100 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">{r.authorName}</p>
            {r.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> {VERIFIED_LABEL[r.verified]}
              </span>
            ) : null}
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-ink-500">{TARGET_LABEL[r.targetType]}</span>
            {r.status !== 'published' ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                {r.status === 'pending' ? 'Waiting for moderation' : 'Hidden'}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StarRating value={r.rating} readOnly size="sm" label={`${r.rating} out of 5`} />
            <span className="text-xs text-ink-400">
              {when(r.createdAt)}
              {r.updatedAt.slice(0, 10) !== r.createdAt.slice(0, 10) ? ' · edited' : ''}
            </span>
          </div>
        </div>
      </div>
      {r.title ? <p className="mt-2 text-sm font-semibold text-ink">{r.title}</p> : null}
      <p className={cn('mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-600', long && !expanded && 'line-clamp-5')}>{r.body}</p>
      {long ? (
        <button type="button" className="mt-1 text-xs font-semibold text-primary" onClick={() => setExpanded((x) => !x)}>
          {expanded ? 'Show less' : 'Read more'}
        </button>
      ) : null}

      {r.response ? (
        <div className="mt-3 rounded-xl border-l-4 border-primary bg-primary-50/50 px-3 py-2">
          <p className="text-xs font-semibold text-ink">Reply from {r.response.name}</p>
          <p className="mt-1 whitespace-pre-line text-sm text-ink-600">{r.response.body}</p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {!r.mine ? (
          <button
            type="button"
            disabled={!isAuthenticated}
            onClick={() => void act({ action: 'helpful' })}
            className={cn('inline-flex items-center gap-1 font-semibold', helpful.voted ? 'text-primary' : 'text-ink-500 hover:text-ink', !isAuthenticated && 'cursor-not-allowed opacity-60')}
            aria-pressed={helpful.voted}
            title={isAuthenticated ? undefined : 'Sign in to vote'}
          >
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden /> Helpful{helpful.count ? ` (${helpful.count})` : ''}
          </button>
        ) : (
          <>
            <button type="button" onClick={onEdit} className="font-semibold text-primary">
              Edit your review
            </button>
            <button type="button" onClick={() => void act({ action: 'delete' }, 'Review deleted')} className="font-semibold text-ink-500 hover:text-rose-700">
              Delete
            </button>
          </>
        )}
        {isAuthenticated && !r.mine ? (
          reporting ? (
            <select
              className="rounded-lg border border-primary-100 bg-white px-2 py-1"
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return
                setReporting(false)
                void act({ action: 'report', reason: e.target.value }, 'Thanks, we will look at it')
              }}
              aria-label="Why are you reporting this review?"
            >
              <option value="">Why report it?</option>
              {REPORT_REASONS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          ) : (
            <button type="button" onClick={() => setReporting(true)} className="inline-flex items-center gap-1 text-ink-400 hover:text-ink-600">
              <Flag className="h-3.5 w-3.5" aria-hidden /> Report
            </button>
          )
        ) : null}
        {canManage ? (
          <>
            <button type="button" onClick={() => setReplying((x) => !x)} className="inline-flex items-center gap-1 font-semibold text-primary">
              <Reply className="h-3.5 w-3.5" aria-hidden /> {r.response ? 'Edit reply' : 'Reply'}
            </button>
            {!canModerate ? null : r.status === 'published' ? (
              <button type="button" onClick={() => void act({ action: 'moderate', status: 'hidden' }, 'Review hidden')} className="text-ink-500 hover:text-rose-700">
                Hide
              </button>
            ) : (
              <button type="button" onClick={() => void act({ action: 'moderate', status: 'published' }, 'Review published')} className="font-semibold text-emerald-700">
                Publish
              </button>
            )}
          </>
        ) : null}
      </div>
      {replying ? (
        <div className="mt-2 space-y-2">
          <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Thank the reviewer and answer their points…" className="bg-white" />
          <Button size="sm" onClick={() => void act({ action: 'respond', body: reply }, 'Reply posted').then(() => setReplying(false))}>
            Post reply
          </Button>
        </div>
      ) : null}
    </li>
  )
}

function ReviewForm({
  listingId,
  hasAgent,
  verified,
  existing,
  onSaved,
}: {
  listingId: string
  hasAgent: boolean
  verified: ReviewList['verified']
  existing: ApiReview | null
  onSaved: () => void
}) {
  const [target, setTarget] = useState<ReviewTarget>(existing?.targetType ?? 'property')
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [body, setBody] = useState(existing?.body ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTarget(existing?.targetType ?? 'property')
    setRating(existing?.rating ?? 0)
    setBody(existing?.body ?? '')
  }, [existing])

  const canApplicationReview = verified === 'tenant' || verified === 'applicant'
  const targets: ReviewTarget[] = ['property', ...(hasAgent ? (['agent'] as const) : []), ...(canApplicationReview ? (['application'] as const) : [])]

  const submit = async () => {
    if (!rating) return void sweetWarning('Add a star rating', 'Choose from 1 to 5 stars.')
    if (body.trim().length < 20) return void sweetWarning('Tell us a bit more', 'Write at least 20 characters.')
    setSaving(true)
    try {
      const { review } = await saveReviewApi({ listingId, targetType: target, rating, subRatings: existing?.subRatings ?? {}, title: existing?.title ?? '', body })
      await sweetSuccess(
        existing ? 'Review updated' : 'Thanks for your review',
        review.status === 'pending' ? 'It mentions contact details, so it will appear once it has been checked.' : 'It is now on the listing.',
      )
      if (!existing) {
        setRating(0)
        setBody('')
      }
      onSaved()
    } catch (e) {
      await sweetWarning('Could not post', e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What are you reviewing?">
        {targets.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={target === t}
            disabled={Boolean(existing)}
            onClick={() => setTarget(t)}
            className={cn(
              'min-h-10 rounded-full px-3.5 text-sm font-semibold',
              target === t ? 'bg-primary text-white' : 'bg-white text-ink-600 hover:bg-primary-50',
            )}
          >
            {TARGET_LABEL[t]}
          </button>
        ))}
      </div>
      <div>
        <p className="text-xs font-semibold text-ink-500">Your rating</p>
        <StarRating value={rating} onChange={setRating} label="Your rating" />
      </div>
      <div>
        <Textarea
          rows={4}
          maxLength={3000}
          placeholder={
            target === 'property'
              ? 'What was the home like? Did it match the photos and description?'
              : target === 'agent'
                ? 'How was working with the agent?'
                : 'How did applying, screening and the decision go?'
          }
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="bg-white"
        />
        <p className="mt-1 text-[11px] text-ink-400">
          {body.trim().length < 20 ? `${20 - body.trim().length} more characters needed` : `${body.length} / 3000`} · Don't include phone numbers or e-mail
          addresses.
        </p>
      </div>
      <Button disabled={saving} onClick={() => void submit()}>
        {existing ? 'Update review' : 'Post review'}
      </Button>
    </div>
  )
}

export function ApiReviewsSection({ listingId, hasAgent }: { listingId: string; hasAgent: boolean }) {
  const { isAuthenticated } = useAuth()
  const [data, setData] = useState<ReviewList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<ReviewSort>('recent')
  const [editing, setEditing] = useState<ApiReview | null>(null)
  const [writing, setWriting] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(() => {
    listReviewsApi(listingId, { sort, target: '' })
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
  }, [listingId, sort])

  useEffect(() => {
    load()
  }, [load])

  const all = data?.reviews ?? []
  const shown = useMemo(() => (showAll ? all : all.slice(0, 3)), [all, showAll])
  const canWrite = isAuthenticated && !data?.canManage
  const formOpen = writing || Boolean(editing)

  return (
    <section className="border-b border-primary-100 py-6" id="reviews">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <MessageSquareQuote className="h-5 w-5 text-ink-400" aria-hidden />
          Reviews
        </h2>
        {data ? <Summary data={data} /> : null}
      </div>
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      {!data && !error ? <p className="mt-3 text-sm text-ink-500">Loading reviews…</p> : null}

      {all.length > 1 ? (
        <div className="mt-3 flex justify-end">
          <Select className="h-9 w-auto text-xs" value={sort} onChange={(e) => setSort(e.target.value as ReviewSort)} aria-label="Sort reviews">
            <option value="recent">Newest first</option>
            <option value="helpful">Most helpful</option>
          </Select>
        </div>
      ) : null}

      <ul className="mt-3 space-y-3">
        {shown.map((r) => (
          <ReviewCard
            key={r.id}
            r={r}
            canManage={Boolean(data?.canManage)}
            canModerate={Boolean(data?.canModerate)}
            onChanged={load}
            onEdit={() => setEditing(r)}
          />
        ))}
      </ul>
      {all.length > 3 ? (
        <button type="button" className="mt-3 text-sm font-semibold text-primary" onClick={() => setShowAll((x) => !x)}>
          {showAll ? 'Show fewer reviews' : `Show all ${all.length} reviews`}
        </button>
      ) : null}

      <div className="mt-5">
        {!isAuthenticated ? (
          <p className="text-sm text-ink-500">
            <Link to={`/login?next=${encodeURIComponent(`/listing/${listingId}#reviews`)}`} className="font-semibold text-primary hover:underline">
              Sign in
            </Link>{' '}
            to write a review.
          </p>
        ) : !canWrite ? null : !formOpen ? (
          <Button variant="secondary" onClick={() => setWriting(true)}>
            Write a review
          </Button>
        ) : (
          <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{editing ? 'Edit your review' : 'Write a review'}</p>
              {data?.verified ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <BadgeCheck className="h-4 w-4" aria-hidden /> {VERIFIED_LABEL[data.verified]}
                </span>
              ) : null}
            </div>
            <ReviewForm
              listingId={listingId}
              hasAgent={hasAgent}
              verified={data?.verified ?? null}
              existing={editing}
              onSaved={() => {
                setEditing(null)
                setWriting(false)
                load()
              }}
            />
            <button type="button" className="mt-2 text-xs font-semibold text-ink-500" onClick={() => { setEditing(null); setWriting(false) }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
