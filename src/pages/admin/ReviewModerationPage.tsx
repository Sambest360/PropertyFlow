/** Reviews that were reported or are waiting for a check (agency admins: their agency; super admins: all). */
import { useCallback, useEffect, useState } from 'react'
import { Card, Badge, Button, EmptyState, PageHeader } from '../../components/ui'
import { StarRating } from '../../components/reviews/StarRating'
import { isApiEnabled } from '../../lib/api/config'
import { moderationQueueApi, reviewActionApi, type ApiReview } from '../../lib/api/reviewsApi'
import { sweetWarning } from '../../lib/sweetAlert'

type Item = ApiReview & { listingTitle: string; reportCount: number }

export default function ReviewModerationPage() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!isApiEnabled) return
    moderationQueueApi()
      .then((r) => setItems(r.reviews))
      .catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const moderate = async (id: string, status: 'published' | 'hidden') => {
    try {
      await reviewActionApi(id, { action: 'moderate', status })
      load()
    } catch (e) {
      await sweetWarning('Could not update', e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Review moderation" subtitle="Reviews that were reported or mention contact details wait here until you publish or hide them." />
      {!isApiEnabled ? <Card className="p-4 text-sm text-ink-600">Moderation needs the live server.</Card> : null}
      {error ? <Card className="p-4 text-sm text-rose-700">{error}</Card> : null}
      {items && items.length === 0 ? <EmptyState title="Nothing to check" description="Reported or held reviews will appear here." /> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {(items ?? []).map((r) => (
          <Card key={r.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-ink">{r.listingTitle}</p>
              <div className="flex gap-1.5">
                <Badge tone={r.status === 'published' ? 'success' : r.status === 'pending' ? 'warning' : 'neutral'}>{r.status}</Badge>
                {r.reportCount ? <Badge tone="danger">{r.reportCount} report{r.reportCount === 1 ? '' : 's'}</Badge> : null}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <StarRating value={r.rating} readOnly size="sm" />
              <span className="text-ink-600">{r.authorName}</span>
            </div>
            {r.title ? <p className="text-sm font-semibold text-ink">{r.title}</p> : null}
            <p className="whitespace-pre-line text-sm text-ink-600">{r.body}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void moderate(r.id, 'published')}>
                Publish
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void moderate(r.id, 'hidden')}>
                Hide
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
