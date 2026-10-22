import { PropertyLoader } from './PropertyLoader'

type DataRefreshBannerProps = {
  active: boolean
  label?: string
}

/** Non-blocking hint while background refresh runs (existing rows stay visible). */
export function DataRefreshBanner({ active, label = 'Updating…' }: DataRefreshBannerProps) {
  if (!active) return null
  return (
    <div
      className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-primary-100 bg-primary-50/80 px-3 py-2 text-sm text-ink-600"
      role="status"
      aria-live="polite"
    >
      <PropertyLoader size="sm" inline aria-label={label} />
      <span>{label}</span>
    </div>
  )
}
