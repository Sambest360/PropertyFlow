import { MESSAGING_MODE_A_BANNER } from '../../lib/messaging/modeA'

export function MessagingModeABanner({ extra }: { extra?: string }) {
  return (
    <div
      className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      role="status"
      data-testid="messaging-mode-a-banner"
    >
      <strong>Messaging:</strong> {MESSAGING_MODE_A_BANNER}
      {extra ? (
        <>
          {' '}
          <span>{extra}</span>
        </>
      ) : null}
    </div>
  )
}
