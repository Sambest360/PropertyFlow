import { cn } from '../ui'
import type { EnquiryOutcome } from '../../lib/listingEnquiryOutcome'

/** T3: the enquiry outcome, shown inline on the form and kept until the next submit. */
export function EnquiryConfirmation({ outcome }: { outcome: EnquiryOutcome | null }) {
  if (!outcome) return null
  const isError = outcome.tone === 'error'
  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={cn(
        'mt-3 rounded-xl border px-3 py-2 text-sm',
        isError
          ? 'border-red-200 bg-red-50 text-red-800'
          : outcome.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-primary-100 bg-primary-50 text-ink',
      )}
    >
      <p className="font-semibold">{outcome.title}</p>
      <p className="mt-0.5">{outcome.body}</p>
      {outcome.reference ? <p className="mt-1 text-xs font-medium tabular">ref {outcome.reference}</p> : null}
    </div>
  )
}
