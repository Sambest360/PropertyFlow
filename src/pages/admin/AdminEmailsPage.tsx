/**
 * Platform team: every email the system sends, previewed with sample data,
 * a "send me a test" button, and the last 100 emails with their status.
 */
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Mail, RefreshCw, Send } from 'lucide-react'
import { Badge, Button, Card, PageHeader } from '../../components/ui'
import {
  fetchEmailLog,
  fetchEmailTemplates,
  sendTestEmail,
  type EmailLogRow,
  type EmailPreview,
} from '../../lib/api/accountEmailApi'

const PROVIDER_LABEL: Record<string, string> = {
  brevo: 'Brevo (API)',
  smtp: 'SMTP relay',
  mailtrap: 'Mailtrap',
  log: 'Not sending — no email provider set',
}

export default function AdminEmailsPage() {
  const [templates, setTemplates] = useState<EmailPreview[]>([])
  const [provider, setProvider] = useState('')
  const [sender, setSender] = useState<{ email: string; name: string } | null>(null)
  const [log, setLog] = useState<EmailLogRow[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setError('')
    try {
      const [t, l] = await Promise.all([fetchEmailTemplates(), fetchEmailLog()])
      setTemplates(t.templates)
      setProvider(t.provider)
      setSender(t.sender)
      setLog(l.emails)
      setSelected((s) => s || t.templates[0]?.id || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load emails.')
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const groups = useMemo(() => {
    const out = new Map<string, EmailPreview[]>()
    for (const t of templates) out.set(t.group, [...(out.get(t.group) ?? []), t])
    return [...out.entries()]
  }, [templates])
  const current = templates.find((t) => t.id === selected)

  const test = async () => {
    if (!current) return
    setBusy(true)
    setFlash('')
    setError('')
    try {
      const r = await sendTestEmail(current.id)
      setFlash(r.sent ? 'Test sent to your email address.' : `Not sent: ${r.reason ?? 'unknown reason'}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the test.')
    } finally {
      setBusy(false)
      void fetchEmailLog().then((l) => setLog(l.emails)).catch(() => {})
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Emails"
        subtitle="Every email Lekaya sends, how it looks, and what went out recently."
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
          </Button>
        }
      />

      <Card className="flex flex-wrap items-start gap-3 p-4" data-tip-target="email-provider">
        {provider === 'log' ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden />
        )}
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-ink">{PROVIDER_LABEL[provider] ?? (provider || 'Loading…')}</p>
          {sender ? (
            <p className="text-ink-500">
              Sent from {sender.name} &lt;{sender.email}&gt; — a no-reply address.
            </p>
          ) : null}
          {provider === 'log' ? (
            <p className="mt-1 text-amber-800">
              Emails are recorded below but not delivered. Add <code>BREVO_API_KEY</code> (or <code>SMTP_HOST</code>, <code>SMTP_USER</code>,{' '}
              <code>SMTP_PASS</code>) to the server <code>.env</code> and restart the API.
            </p>
          ) : null}
        </div>
      </Card>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card className="max-h-[70vh] overflow-y-auto p-3" data-tip-target="email-templates">
          {groups.map(([group, list]) => (
            <div key={group} className="mb-3">
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-400">{group}</p>
              {list.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={`block w-full cursor-pointer rounded-lg px-2 py-2 text-left text-sm ${t.id === selected ? 'bg-primary-50 font-semibold text-primary' : 'text-ink hover:bg-primary-50/60'}`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          ))}
          {!templates.length && !error ? <p className="p-2 text-sm text-ink-500">Loading templates…</p> : null}
        </Card>

        <Card className="space-y-3 p-4">
          {current ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-400">Subject</p>
                  <p className="font-semibold text-ink">{current.subject}</p>
                  <p className="mt-1 text-sm text-ink-500">{current.description}</p>
                </div>
                <Button onClick={() => void test()} disabled={busy}>
                  <Send className="h-4 w-4" aria-hidden /> {busy ? 'Sending…' : 'Send me a test'}
                </Button>
              </div>
              {flash ? <p className="text-sm text-ink-700" role="status">{flash}</p> : null}
              <iframe
                title={`Preview of ${current.name}`}
                srcDoc={current.html}
                sandbox=""
                className="h-[60vh] w-full rounded-xl border border-primary-100 bg-white"
              />
            </>
          ) : (
            <p className="text-sm text-ink-500">Pick an email on the left to preview it.</p>
          )}
        </Card>
      </div>

      <Card className="overflow-x-auto p-0" data-tip-target="page-list">
        <div className="flex items-center gap-2 border-b border-primary-50 px-4 py-3">
          <Mail className="h-4 w-4 text-primary" aria-hidden />
          <p className="font-semibold text-ink">Recent emails</p>
        </div>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-primary-50/50 text-xs text-ink-500">
            <tr>
              <th className="px-4 py-2 font-semibold">When</th>
              <th className="px-4 py-2 font-semibold">To</th>
              <th className="px-4 py-2 font-semibold">Email</th>
              <th className="px-4 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {log.map((r) => (
              <tr key={r.id} className="border-t border-primary-50">
                <td className="whitespace-nowrap px-4 py-2 text-ink-500">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-2 text-ink">{r.to_email}</td>
                <td className="px-4 py-2 text-ink">{r.subject}</td>
                <td className="px-4 py-2">
                  <Badge tone={r.status === 'sent' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'}>{r.status}</Badge>
                  {r.error ? <p className="mt-1 text-xs text-red-700">{r.error}</p> : null}
                </td>
              </tr>
            ))}
            {!log.length ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-500">No emails yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
