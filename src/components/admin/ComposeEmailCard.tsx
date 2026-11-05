/**
 * Super admin: write an email and send it from info@lekayarentals.site to
 * chosen people (e.g. ask an agency to confirm a payment) or to a whole group.
 */
import { useEffect, useState } from 'react'
import { Mail, Send, X } from 'lucide-react'
import { Button, Card, Input, Select, Textarea } from '../ui'
import { searchEmailRecipients, sendComposedEmail, type EmailGroup, type EmailRecipient } from '../../lib/api/accountEmailApi'
import { sweetConfirm, sweetSuccess, sweetWarning } from '../../lib/sweetAlert'

const GROUPS: Array<{ id: EmailGroup; label: string }> = [
  { id: '', label: 'Only the people I pick' },
  { id: 'agency_admins', label: 'All agency admins' },
  { id: 'landlords', label: 'All landlords' },
  { id: 'agents', label: 'All agents' },
  { id: 'contractors', label: 'All contractors' },
  { id: 'tenants', label: 'All tenants and applicants' },
]

export function ComposeEmailCard({ senderEmail }: { senderEmail?: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<EmailRecipient[]>([])
  const [picked, setPicked] = useState<EmailRecipient[]>([])
  const [group, setGroup] = useState<EmailGroup>('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      searchEmailRecipients(q.trim())
        .then((r) => setResults(r.recipients))
        .catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const send = async () => {
    if (!subject.trim() || !message.trim()) return void sweetWarning('Almost there', 'Add a subject and a message.')
    if (!picked.length && !group) return void sweetWarning('Who is it for?', 'Pick at least one person or a group.')
    const who = [group ? GROUPS.find((g) => g.id === group)?.label : null, picked.length ? `${picked.length} chosen ${picked.length === 1 ? 'person' : 'people'}` : null].filter(Boolean).join(' + ')
    if (!(await sweetConfirm('Send this email?', `To: ${who}. It goes out from ${senderEmail || 'info@lekayarentals.site'}.`, 'Send'))) return
    setBusy(true)
    try {
      const r = await sendComposedEmail({ userIds: picked.map((p) => p.id), group, subject, message })
      await sweetSuccess('Email sent', `${r.sent} of ${r.recipients} sent${r.failed ? `, ${r.failed} failed (see Recent emails)` : ''}.`)
      setSubject('')
      setMessage('')
      setPicked([])
      setGroup('')
    } catch (e) {
      await sweetWarning('Could not send', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="inline-flex items-center gap-2 font-semibold text-ink">
        <Mail className="h-5 w-5 text-primary" aria-hidden /> Write an email
      </h2>
      <p className="text-sm text-ink-500">Sent from {senderEmail || 'info@lekayarentals.site'} in the Lekaya Rentals email design.</p>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold text-ink-500">Send to a group (optional)</span>
        <Select value={group} onChange={(e) => setGroup(e.target.value as EmailGroup)}>
          {GROUPS.map((g) => (
            <option key={g.id || 'none'} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
      </label>
      <div className="text-sm">
        <span className="mb-1 block text-xs font-semibold text-ink-500">People</span>
        {picked.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {picked.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-xs text-ink">
                {p.name || p.email}
                <button type="button" aria-label={`Remove ${p.email}`} onClick={() => setPicked((x) => x.filter((y) => y.id !== p.id))}>
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <Input placeholder="Search by name, email or agency…" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length ? (
          <ul className="mt-1 max-h-56 overflow-auto rounded-xl border border-primary-100 bg-white">
            {results
              .filter((r) => !picked.some((p) => p.id === r.id))
              .map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-primary-50"
                    onClick={() => {
                      setPicked((x) => [...x, r])
                      setQ('')
                    }}
                  >
                    <span>
                      <span className="font-medium text-ink">{r.name || r.email}</span> <span className="text-ink-500">{r.email}</span>
                    </span>
                    <span className="text-xs text-ink-400">{r.agency ?? r.role.toLowerCase().replace('_', ' ')}</span>
                  </button>
                </li>
              ))}
          </ul>
        ) : null}
      </div>
      <Input placeholder="Subject" value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
      <Textarea rows={8} placeholder={'e.g. Please confirm your October payment for Lekaya Rentals.\n\nThank you.'} value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="flex justify-end">
        <Button disabled={busy} onClick={() => void send()}>
          <Send className="h-4 w-4" aria-hidden /> {busy ? 'Sending…' : 'Send email'}
        </Button>
      </div>
    </Card>
  )
}
