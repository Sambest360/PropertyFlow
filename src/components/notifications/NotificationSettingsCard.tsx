import { useState } from 'react'
import { BellRing, Mail } from 'lucide-react'
import { Card } from '../ui'
import { useNotificationPrefs } from '../../hooks/useNotificationPrefs'
import { NOTIFICATION_CATEGORIES, type NotificationCategoryId, type NotificationPrefs } from '../../lib/notificationCategories'

/** Settings → Notifications: in-app and email on/off, plus per-topic switches. */
export function NotificationSettingsCard() {
  const { prefs, save } = useNotificationPrefs()
  const [error, setError] = useState('')
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const update = async (next: NotificationPrefs) => {
    setError('')
    try {
      await save(next)
      setSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your settings.')
    }
  }
  const toggleTopic = (id: NotificationCategoryId, on: boolean) =>
    void update({ ...prefs, muted: on ? prefs.muted.filter((m) => m !== id) : [...prefs.muted, id] })
  const allOff = !prefs.inApp && !prefs.email

  return (
    <Card className="space-y-4 p-5" data-tip-target="notification-settings">
      <div>
        <h2 className="inline-flex items-center gap-2 font-semibold text-ink">
          <BellRing className="h-5 w-5 text-primary" aria-hidden /> Notifications
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Choose how we tell you about updates. Security emails (password resets, email confirmation) always arrive.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary-100 p-3">
          <input type="checkbox" className="mt-1" checked={prefs.inApp} onChange={(e) => void update({ ...prefs, inApp: e.target.checked })} />
          <span>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink"><BellRing className="h-4 w-4" aria-hidden /> In the app</span>
            <span className="block text-xs text-ink-500">The bell and pop-up alerts.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary-100 p-3">
          <input type="checkbox" className="mt-1" checked={prefs.email} onChange={(e) => void update({ ...prefs, email: e.target.checked })} />
          <span>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink"><Mail className="h-4 w-4" aria-hidden /> By email</span>
            <span className="block text-xs text-ink-500">A copy of each update sent to your inbox.</span>
          </span>
        </label>
      </div>
      <fieldset disabled={allOff} className="space-y-2 disabled:opacity-50">
        <legend className="mb-1 text-sm font-semibold text-ink">Topics</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {NOTIFICATION_CATEGORIES.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={!prefs.muted.includes(c.id)} onChange={(e) => toggleTopic(c.id, e.target.checked)} />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
      {allOff ? <p className="text-xs text-amber-800">All notifications are off. You will only get security emails.</p> : null}
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      {savedAt && !error ? <p className="text-xs text-ink-500" role="status">Saved.</p> : null}
    </Card>
  )
}
