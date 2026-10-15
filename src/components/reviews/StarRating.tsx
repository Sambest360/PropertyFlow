import { Star } from 'lucide-react'
import type { Review } from '../../types/domain'
import { cn } from '../ui'

export function StarRating({
  value,
  onChange,
  size = 'md',
  readOnly = false,
  label = 'Rating',
}: {
  value: number
  onChange?: (n: number) => void
  size?: 'sm' | 'md'
  readOnly?: boolean
  label?: string
}) {
  const dim = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  return (
    <div className="inline-flex items-center gap-0.5" role={readOnly ? 'img' : 'group'} aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value
        if (readOnly) {
          return (
            <Star
              key={n}
              className={cn(dim, filled ? 'fill-accent text-accent' : 'text-ink-200')}
              aria-hidden
            />
          )
        }
        return (
          <button
            key={n}
            type="button"
            className="inline-flex min-h-11 min-w-9 cursor-pointer items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            aria-pressed={filled}
            onClick={() => onChange?.(n)}
          >
            <Star className={cn(dim, filled ? 'fill-accent text-accent' : 'text-ink-300')} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

export function averageRating(reviews: { rating: number }[]): number | null {
  if (!reviews.length) return null
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0)
  return Math.round((sum / reviews.length) * 10) / 10
}

/** Property + application reviews shown on listing cards and detail header. */
export function propertyListingReviews(reviews: Review[], propertyId: string): Review[] {
  return reviews.filter(
    (r) =>
      r.propertyId === propertyId &&
      (r.targetType === 'property' || r.targetType === 'application'),
  )
}

export function propertyListingRating(reviews: Review[], propertyId: string): number | null {
  return averageRating(propertyListingReviews(reviews, propertyId))
}
