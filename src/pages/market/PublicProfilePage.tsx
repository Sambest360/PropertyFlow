/** Public profile: rating and reviews, plus serious warnings and upheld complaints. */
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertOctagon, BadgeCheck, Flag, UserRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { publicProfileApi, type PublicProfile } from '../../lib/api/conductApi'
import { StarRating } from '../../components/reviews/StarRating'
import { Card } from '../../components/ui'

const when = (iso: string) => new Date(iso).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short' })

export default function PublicProfilePage() {
  const { id = '' } = useParams()
  const { isAuthenticated, role } = useAuth()
  const [p, setP] = useState<PublicProfile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    publicProfileApi(id)
      .then(setP)
      .catch((e: Error) => setError(e.message))
  }, [id])

  if (error) return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-ink-500">{error}</div>
  if (!p) return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-ink-500">Loading profile…</div>
  const isAdmin = ['super_admin', 'client_admin', 'agent_admin'].includes(role)

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        {p.avatarUrl ? (
          <img src={p.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary">
            <UserRound className="h-8 w-8" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold text-ink">{p.name}</h1>
          <p className="text-sm text-ink-500">
            {p.role}
            {p.agency ? ` · ${p.agency}` : ''} · on Lekaya since {when(p.memberSince)}
          </p>
          <div className="mt-1 flex items-center gap-2">
            {p.rating.average != null ? (
              <>
                <StarRating value={Math.round(p.rating.average)} readOnly size="sm" label={`${p.rating.average} out of 5`} />
                <span className="text-sm font-semibold tabular-nums">{p.rating.average.toFixed(1)}</span>
                <span className="text-xs text-ink-500">({p.rating.count} reviews)</span>
              </>
            ) : (
              <span className="text-xs text-ink-500">No reviews yet</span>
            )}
            {!p.warnings.length && !p.upheldComplaints ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Good standing
              </span>
            ) : null}
          </div>
        </div>
        {isAuthenticated ? (
          <div className="flex flex-col gap-1 text-sm">
            <Link to={`/workspace/conduct?about=${encodeURIComponent(p.id)}`} className="inline-flex items-center gap-1 font-semibold text-ink-500 hover:text-rose-700">
              <Flag className="h-4 w-4" aria-hidden /> Report this person
            </Link>
            {isAdmin ? (
              <Link to={`/workspace/conduct?warn=${encodeURIComponent(p.id)}`} className="font-semibold text-primary hover:underline">
                Issue a warning
              </Link>
            ) : null}
          </div>
        ) : null}
      </Card>

      {p.warnings.length || p.upheldComplaints ? (
        <Card className="space-y-2 border-rose-200 bg-rose-50 p-5">
          <h2 className="inline-flex items-center gap-2 font-semibold text-rose-800">
            <AlertOctagon className="h-5 w-5" aria-hidden /> Conduct record
          </h2>
          {p.upheldComplaints ? (
            <p className="text-sm text-rose-800">
              {p.upheldComplaints} complaint{p.upheldComplaints === 1 ? ' was' : 's were'} upheld against this person.
            </p>
          ) : null}
          <ul className="space-y-2">
            {p.warnings.map((w, i) => (
              <li key={i} className="rounded-lg bg-white/70 px-3 py-2 text-sm">
                <span className="font-semibold capitalize text-rose-800">{w.level === 'final' ? 'Final warning' : 'Severe warning'}</span>
                <span className="text-xs text-ink-500"> · {when(w.at)}</span>
                <p className="mt-1 text-ink-700">{w.reason}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="space-y-3 p-5">
        <h2 className="font-semibold text-ink">Reviews</h2>
        {p.reviews.length === 0 ? <p className="text-sm text-ink-500">No reviews yet.</p> : null}
        <ul className="space-y-3">
          {p.reviews.map((r, i) => (
            <li key={i} className="rounded-xl border border-primary-100 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <StarRating value={r.rating} readOnly size="sm" />
                <span className="text-sm font-semibold text-ink">{r.author}</span>
                <span className="text-xs text-ink-400">
                  {when(r.at)}
                  {r.listing ? ` · ${r.listing}` : ''}
                </span>
              </div>
              {r.title ? <p className="mt-1 text-sm font-semibold text-ink">{r.title}</p> : null}
              <p className="mt-1 text-sm text-ink-600">{r.body}</p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
