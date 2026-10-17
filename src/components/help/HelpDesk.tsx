/**
 * CR7 help desk on HelpPage: Raise a ticket, My tickets, and (desk roles only)
 * the agency / platform desk with a one-time Resolve + note.
 * Server-only persistence (event_log 'support_ticket'); the scope gate
 * re-checks every rule shown here.
 */
import { useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, Inbox, Send } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import { SmartTextEditor } from '../editor/SmartTextEditor'
import { Badge, Button, Card, Input, Textarea } from '../ui'
import {
  SUPPORT_BODY_MAX,
  SUPPORT_NOTE_MAX,
  SUPPORT_SUBJECT_MAX,
  canResolveSupportTicket,
  isSupportDeskViewer,
  supportTicketRoutingAgency,
  type SupportTicket,
} from '../../lib/supportTickets'

const ICON_STROKE = 1.6

function fmt(at: string | null | undefined): string {
  if (!at) return ''
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

function StatusBadge({ status }: { status: SupportTicket['status'] }) {
  return status === 'resolved' ? (
    <Badge tone="neutral">Resolved</Badge>
  ) : (
    <Badge tone="info">Open</Badge>
  )
}

function TicketBody({ ticket }: { ticket: SupportTicket }) {
  return (
    <>
      <p className="mt-1 whitespace-pre-wrap text-sm text-ink-500">{ticket.body}</p>
      {ticket.status === 'resolved' ? (
        <div
          className="mt-2 rounded-xl bg-primary-50 p-3 text-sm text-ink-600"
          data-testid="help-ticket-resolution"
        >
          <p className="font-semibold text-ink">
            Resolved{ticket.resolvedByName ? ` by ${ticket.resolvedByName}` : ''}
            {ticket.resolvedAt ? ` · ${fmt(ticket.resolvedAt)}` : ''}
          </p>
          {ticket.resolutionNote ? (
            <p className="mt-1 whitespace-pre-wrap">{ticket.resolutionNote}</p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

export function HelpDesk() {
  const { user, isAuthenticated, has } = useAuth()
  const { state, submitSupportTicket, resolveSupportTicket } = useStore()

  const signedIn = isAuthenticated && user.id !== 'guest'
  const viewer = useMemo(
    () => ({
      userId: user.id,
      role: user.role,
      agencyId: user.agencyId,
      hasUsersManage: has('users.manage'),
    }),
    [user.id, user.role, user.agencyId, has],
  )
  const deskViewer = signedIn && isSupportDeskViewer(viewer)
  const routesToAgency = Boolean(supportTicketRoutingAgency(user.role, user.agencyId))

  const myTickets = useMemo(
    () =>
      state.supportTickets
        .filter((t) => t.submittedByUserId === user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.supportTickets, user.id],
  )
  const deskTickets = useMemo(
    () =>
      deskViewer
        ? state.supportTickets
            .filter((t) => canResolveSupportTicket(viewer, t))
            .sort((a, b) => {
              if (a.status !== b.status) return a.status === 'open' ? -1 : 1
              return b.createdAt.localeCompare(a.createdAt)
            })
        : [],
    [deskViewer, state.supportTickets, viewer],
  )

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setSubmitMsg(null)
    const res = await submitSupportTicket({
      actor: { id: user.id, name: user.name, role: user.role, agencyId: user.agencyId },
      subject,
      body,
    })
    setSubmitting(false)
    if (res.ok === false) {
      setSubmitMsg({ tone: 'error', text: res.error })
      return
    }
    setSubject('')
    setBody('')
    setSubmitMsg({
      tone: 'ok',
      text: routesToAgency
        ? 'Ticket sent to your agency. You can follow it under My tickets.'
        : 'Ticket sent to Lekaya support. You can follow it under My tickets.',
    })
  }

  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [resolveBusy, setResolveBusy] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)

  const resolve = async (ticketId: string) => {
    if (resolveBusy) return
    setResolveBusy(true)
    setResolveError(null)
    const res = await resolveSupportTicket({
      actor: { id: user.id, name: user.name, role: user.role, agencyId: user.agencyId },
      actorHasUsersManage: has('users.manage'),
      ticketId,
      note,
    })
    setResolveBusy(false)
    if (res.ok === false) {
      setResolveError(res.error)
      return
    }
    setResolvingId(null)
    setNote('')
  }

  if (!signedIn) {
    return (
      <section data-testid="help-desk-signed-out">
<Card className="p-5 text-sm text-ink-500">
        Sign in to raise a support ticket.
      </Card>
</section>
    )
  }

  const agencyName = (id: string | null) =>
    id ? (state.agencies.find((a) => a.id === id)?.name ?? id) : 'Lekaya support'

  return (
    <div className="space-y-4" data-testid="help-desk">
      <div className="grid gap-4 lg:grid-cols-2">
        <section data-testid="help-raise-ticket">
<Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
            <h2 className="font-display text-lg font-semibold text-ink">Raise a ticket</h2>
          </div>
          <p className="text-sm leading-relaxed text-ink-500">
            {routesToAgency
              ? 'Your ticket goes to your agency’s administrators.'
              : 'Your ticket goes to Lekaya support.'}
          </p>
          <form className="space-y-3" onSubmit={submit}>
            <label className="block text-sm font-medium text-ink">
              Subject
              <Input
                className="mt-1"
                value={subject}
                maxLength={SUPPORT_SUBJECT_MAX}
                onChange={(e) => setSubject(e.target.value)}
                required
                data-testid="help-ticket-subject"
              />
            </label>
            <div data-testid="help-ticket-body">
              <SmartTextEditor
                label="What do you need help with?"
                variant="operational"
                value={body}
                onChange={setBody}
                maxLength={SUPPORT_BODY_MAX}
              />
            </div>
            {submitMsg ? (
              <p
                role={submitMsg.tone === 'error' ? 'alert' : 'status'}
                className={
                  submitMsg.tone === 'error' ? 'text-sm text-accent-700' : 'text-sm text-ink-600'
                }
                data-testid="help-ticket-submit-message"
              >
                {submitMsg.text}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={submitting || !subject.trim() || !body.trim()}
              data-testid="help-ticket-submit"
            >
              {submitting ? 'Sending…' : 'Send ticket'}
            </Button>
          </form>
        </Card>
</section>

        <section data-testid="help-my-tickets">
<Card className="space-y-3 p-5">
          <h2 className="font-display text-lg font-semibold text-ink">My tickets</h2>
          {myTickets.length === 0 ? (
            <p className="text-sm text-ink-400">You have not raised any tickets.</p>
          ) : (
            <ul className="space-y-3">
              {myTickets.map((t) => (
                <li
                  key={t.id}
                  className="rounded-xl border border-primary-100 p-3"
                  data-testid={`help-my-ticket-${t.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{t.subject}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-ink-400">
                    <span data-testid={`help-my-ticket-number-${t.id}`}>Ticket {t.id}</span> ·{' '}
                    {fmt(t.createdAt)} · {agencyName(t.agencyId)}
                  </p>
                  <TicketBody ticket={t} />
                </li>
              ))}
            </ul>
          )}
        </Card>
</section>
      </div>

      {deskViewer ? (
        <section data-testid="help-desk-section">
<Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
            <h2 className="font-display text-lg font-semibold text-ink">Help desk</h2>
          </div>
          <p className="text-sm text-ink-500">
            {user.role === 'super_admin'
              ? 'All tickets, including Lekaya support tickets from agency staff.'
              : 'Tickets from tenants, landlords, applicants and contractors at your agency.'}{' '}
            Resolving a ticket is final, and it becomes read-only.
          </p>
          {deskTickets.length === 0 ? (
            <p className="text-sm text-ink-400">No tickets on your desk.</p>
          ) : (
            <ul className="space-y-3">
              {deskTickets.map((t) => (
                <li
                  key={t.id}
                  className="rounded-xl border border-primary-100 p-3"
                  data-testid={`help-desk-ticket-${t.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-ink">{t.subject}</p>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-ink-400">
                    Ticket {t.id} · {t.submitterName || 'Unknown user'} ·{' '}
                    {fmt(t.createdAt)}
                    {user.role === 'super_admin' ? ` · ${agencyName(t.agencyId)}` : ''}
                  </p>
                  <TicketBody ticket={t} />
                  {t.status === 'open' ? (
                    resolvingId === t.id ? (
                      <div className="mt-3 space-y-2">
                        <label className="block text-sm font-medium text-ink">
                          Resolution note
                          <Textarea
                            className="mt-1"
                            rows={3}
                            value={note}
                            maxLength={SUPPORT_NOTE_MAX}
                            onChange={(e) => setNote(e.target.value)}
                            data-testid="help-desk-resolve-note"
                          />
                        </label>
                        {resolveError ? (
                          <p role="alert" className="text-sm text-accent-700">
                            {resolveError}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={resolveBusy || !note.trim()}
                            onClick={() => void resolve(t.id)}
                            data-testid="help-desk-resolve-confirm"
                          >
                            <CheckCircle2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                            {resolveBusy ? 'Resolving…' : 'Resolve ticket'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={resolveBusy}
                            onClick={() => {
                              setResolvingId(null)
                              setNote('')
                              setResolveError(null)
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="mt-3"
                        onClick={() => {
                          setResolvingId(t.id)
                          setNote('')
                          setResolveError(null)
                        }}
                        data-testid={`help-desk-resolve-${t.id}`}
                      >
                        Resolve
                      </Button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
</section>
      ) : null}
    </div>
  )
}
