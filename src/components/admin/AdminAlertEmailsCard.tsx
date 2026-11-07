/**
 * Admin → Emails: who receives the platform's admin emails (new sign-ups,
 * listings waiting for approval, escalations, compliance, storage and
 * billing alerts). Every super admin still sees these in the app.
 */
import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, Card, Input } from '../ui'
import { fetchAdminAlertEmails, saveAdminAlertEmails } from '../../lib/api/accountEmailApi'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AdminAlertEmailsCard() {
  const [emails, setEmails] = useState<string[] | null>(null)
  const [saved, setSaved] = useState<string[]>([])
  const [max, setMax] = useState(10)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')

  useEffect(() => {
    fetchAdminAlertEmails()
      .then((r) => {
        setEmails(r.emails)
        setSaved(r.emails)
        setMax(r.max)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load the admin alert emails.'))
  }, [])

  const add = () => {
    const e = draft.trim().toLowerCase()
    if (!e) return
    if (!EMAIL_RE.test(e)) return setError(`"${draft.trim()}" is not a valid email address.`)
    setError('')
    setEmails((list) => (list && !list.includes(e) ? [...list, e] : list))
    setDraft('')
  }

  const save = async () => {
    if (!emails) return
    setBusy(true)
    setError('')
    setFlash('')
    try {
      const r = await saveAdminAlertEmails(emails)
      setEmails(r.emails)
      setSaved(r.emails)
      setFlash('Saved.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const changed = emails !== null && emails.join(',') !== saved.join(',')

  return (
    <Card className="space-y-3 p-4" data-testid="admin-alert-emails">
      <div>
        <h2 className="font-display text-base font-semibold text-ink">Admin alert emails</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-500">
          New sign-ups, listings waiting for approval, escalations, compliance, storage and billing alerts are emailed to these
          addresses only. Every super admin still sees them in the app.
        </p>
      </div>
      {emails === null && !error ? <p className="text-sm text-ink-500">Loading…</p> : null}
      {emails ? (
        <>
          {emails.length ? (
            <ul className="flex flex-wrap gap-2">
              {emails.map((e) => (
                <li key={e} className="inline-flex items-center gap-1 rounded-full border border-primary-100 bg-primary-50 py-1 pl-3 pr-1 text-sm text-ink">
                  {e}
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-500 hover:bg-white hover:text-ink"
                    onClick={() => setEmails((list) => (list ?? []).filter((x) => x !== e))}
                    aria-label={`Remove ${e}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No addresses: admin emails go to every super admin.
            </p>
          )}
          {emails.length < max ? (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                add()
              }}
            >
              <Input
                type="email"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="name@example.com"
                aria-label="Email address to add"
                className="min-w-0 flex-1 sm:max-w-xs"
              />
              <Button type="submit" variant="secondary">
                <Plus className="h-4 w-4" aria-hidden /> Add
              </Button>
            </form>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void save()} disabled={busy || !changed}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
            {flash && !changed ? <span className="text-sm text-emerald-700">{flash}</span> : null}
          </div>
        </>
      ) : null}
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  )
}
