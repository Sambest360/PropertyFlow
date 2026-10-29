/**
 * Listing reviews backed by the server: summary with rating breakdown,
 * filters and sorting, verified badges, helpful votes, reports, agency
 * replies and moderation, and a write/edit form with category ratings.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Flag, MessageSquareQuote, Reply, ThumbsUp } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button, Input, Select, Textarea, cn } from '../ui'
import { StarRating } from './StarRating'
import {
  SUB_RATINGS,
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

function Summary({ data, filterStars, onFilterStars }: { data: ReviewList; filterStars: number | null; onFilterStars: (n: number | null) => void }) {
  const s = data.summary
  if (!s.count) return <p className="mt-3 text-sm text-ink-500">No reviews yet.</p>
  const subs = Object.entries(s.subAverages)
  const allLabels = Object.values(SUB_RATINGS).flat()
  return (
    <div className="mt-4 grid gap-5 rounded-2xl border border-primary-100 bg-white p-4 sm:grid-cols-[10rem_1fr_1fr]">
      <div>
        <p className="text-4xl font-semibold tabular-nums text-ink">{s.average?.toFixed(1)}</p>
        <StarRating value={Math.round(s.average ?? 0)} readOnly size="sm" label={`${s.average} out of 5`} />
        <p className="mt-1 text-xs text-ink-500">
          {s.count} review{s.count === 1 ? '' : 's'}
        </p>
      </div>
      <ul className="space-y-1" aria-label="Rating breakdown">
        {[5, 4, 3, 2, 1].map((n) => {
          const count = s.distribution[n as 1 | 2 | 3 | 4 | 5]
          const pct = s.count ? Math.round((count / s.count) * 100) : 0
          return (
            <li key={n}>
              <button
                type="button"
                onClick={() => onFilterStars(filterStars === n ? null : n)}
                className={cn('flex w-full items-center gap-2 rounded-md px-1 text-xs hover:bg-primary-50', filterStars === n && 'bg-primary-50')}
                aria-pressed={filterStars === n}
              >
                <span className="w-8 shrink-0 text-left tabular-nums text-ink-600">{n} ★</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-primary-50">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-8 shrink-0 text-right tabular-nums text-ink-500">{count}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {subs.length ? (
        <ul className="space-y-1.5 text-xs">
          {subs.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between gap-2">
              <span className="text-ink-600">{allLabels.find((l) => l.key === k)?.label ?? k}</span>
              <span className="font-semibold tabular-nums text-ink">{v.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function ReviewCard({ r, canManage, onChanged, onEdit }: { r: ApiReview; canManage: boolean; onChanged: () => void; onEdit: () => void }) {
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
      {Object.keys(r.subRatings).length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUB_RATINGS[r.targetType]
            .filter((s) => r.subRatings[s.key])
            .map((s) => (
              <span key={s.key} className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] text-ink-600">
                {s.label} {r.subRatings[s.key]}★
              </span>
            ))}
        </div>
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
            {r.status === 'published' ? (
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
  const [subs, setSubs] = useState<Record<string, number>>(existing?.subRatings ?? {})
  const [title, setTitle] = useState(existing?.title ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setTarget(existing?.targetType ?? 'property')
    setRating(existing?.rating ?? 0)
    setSubs(existing?.subRatings ?? {})
    setTitle(existing?.title ?? '')
    setBody(existing?.body ?? '')
  }, [existing])

  const canApplicationReview = verified === 'tenant' || verified === 'applicant'
  const targets: ReviewTarget[] = ['property', ...(hasAgent ? (['agent'] as const) : []), ...(canApplicationReview ? (['application'] as const) : [])]

  const submit = async () => {
    if (!rating) return void sweetWarning('Add a star rating', 'Choose from 1 to 5 stars.')
    if (body.trim().length < 20) return void sweetWarning('Tell us a bit more', 'Write at least 20 characters.')
    setSaving(true)
    try {
      const { review } = await saveReviewApi({ listingId, targetType: target, rating, subRatings: subs, title, body })
      await sweetSuccess(
        existing ? 'Review updated' : 'Thanks for your review',
        review.status === 'pending' ? 'It mentions contact details, so it will appear once it has been checked.' : 'It is now on the listing.',
      )
      if (!existing) {
        setRating(0)
        setSubs({})
        setTitle('')
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
            onClick={() => {
              setTarget(t)
              setSubs({})
            }}
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
        <p className="text-xs font-semibold text-ink-500">Overall</p>
        <StarRating value={rating} onChange={setRating} label="Overall rating" />
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {SUB_RATINGS[target].map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-2">
            <span className="text-xs text-ink-600">{s.label}</span>
            <StarRating value={subs[s.key] ?? 0} onChange={(n) => setSubs((x) => ({ ...x, [s.key]: n }))} size="sm" label={s.label} />
          </div>
        ))}
      </div>
      <Input placeholder="Title (optional)" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="bg-white" />
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
  const [target, setTarget] = useState<ReviewTarget | ''>('')
  const [stars, setStars] = useState<number | null>(null)
  const [editing, setEditing] = useState<ApiReview | null>(null)

  const load = useCallback(() => {
    listReviewsApi(listingId, { sort, target })
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
  }, [listingId, sort, target])

  useEffect(() => {
    load()
  }, [load])

  const shown = useMemo(() => (data?.reviews ?? []).filter((r) => stars == null || r.rating === stars), [data, stars])
  const canWrite = isAuthenticated && !data?.canManage

  return (
    <section className="border-b border-primary-100 py-6" id="reviews">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
        <MessageSquareQuote className="h-5 w-5 text-ink-400" aria-hidden />
        Reviews
      </h2>
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
      {data ? <Summary data={data} filterStars={stars} onFilterStars={setStars} /> : <p className="mt-3 text-sm text-ink-500">Loading reviews…</p>}

      {data && data.reviews.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(['', 'property', 'agent', 'application'] as const).map((t) => (
            <button
              key={t || 'all'}
              type="button"
              onClick={() => setTarget(t)}
              className={cn('rounded-full px-3 py-1 text-xs font-semibold', target === t ? 'bg-ink text-white' : 'bg-primary-50 text-ink-600')}
            >
              {t ? TARGET_LABEL[t] : 'All'}
            </button>
          ))}
          <Select className="ml-auto h-9 text-xs" value={sort} onChange={(e) => setSort(e.target.value as ReviewSort)} aria-label="Sort reviews">
            <option value="recent">Most recent</option>
            <option value="helpful">Most helpful</option>
            <option value="highest">Highest rated</option>
            <option value="lowest">Lowest rated</option>
          </Select>
          {stars != null ? (
            <button type="button" className="text-xs font-semibold text-primary" onClick={() => setStars(null)}>
              Clear {stars}★ filter
            </button>
          ) : null}
        </div>
      ) : null}

      <ul className="mt-4 space-y-3">
        {shown.map((r) => (
          <ReviewCard key={r.id} r={r} canManage={Boolean(data?.canManage)} onChanged={load} onEdit={() => setEditing(r)} />
        ))}
      </ul>

      <div className="mt-6 rounded-2xl border border-primary-100 bg-primary-50/60 p-4">
        <p className="text-sm font-semibold text-ink">{editing ? 'Edit your review' : 'Write a review'}</p>
        {!isAuthenticated ? (
          <p className="mt-2 text-sm text-ink-500">
            <Link to={`/login?next=${encodeURIComponent(`/listing/${listingId}#reviews`)}`} className="font-semibold text-primary hover:underline">
              Sign in
            </Link>{' '}
            to review this property, the agent, or how applying went.
          </p>
        ) : !canWrite ? (
          <p className="mt-2 text-sm text-ink-500">You manage this listing, so you can reply to reviews but not write one.</p>
        ) : (
          <div className="mt-3">
            {data?.verified ? (
              <p className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <BadgeCheck className="h-4 w-4" aria-hidden /> Your review will show as {VERIFIED_LABEL[data.verified]}
              </p>
            ) : null}
            <ReviewForm
              listingId={listingId}
              hasAgent={hasAgent}
              verified={data?.verified ?? null}
              existing={editing}
              onSaved={() => {
                setEditing(null)
                load()
              }}
            />
          </div>
        )}
      </div>
    </section>
  )
}
