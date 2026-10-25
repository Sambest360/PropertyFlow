/**
 * Help desk on HelpPage: Report a problem (system tickets to the super
 * admins), My tickets with the conversation, and the support inbox for desk
 * roles (super admins; agency admins keep legacy agency tickets).
 * The server (server/supportDesk.ts) re-checks every rule shown here.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, Inbox, Paperclip, Send, Star } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useStore } from '../../context/AppStore'
import { ImageDropzone } from '../ImageDropzone'
import { DashboardTabs } from '../dashboard/DashboardTabs'
import { Badge, Button, Card, Input, Select, Textarea, cn } from '../ui'
import {
  SUPPORT_ATTACHMENTS_MAX,
  SUPPORT_BODY_MAX,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_REPLY_MAX,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_DESK_LABEL,
  SUPPORT_STATUS_LABEL,
  SUPPORT_SUBJECT_MAX,
  canResolveSupportTicket,
  isSupportDeskViewer,
  isSupportTicketOpen,
  similarOpenTickets,
  supportActionRefusal,
  supportCategoryLabel,
  supportTicketAge,
  type SupportAction,
  type SupportTicket,
  type SupportTicketStatus,
  type SupportViewer,
} from '../../lib/supportTickets'

const ICON_STROKE = 1.6

function fmt(at: string | null | undefined): string {
  if (!at) return ''
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

const STATUS_TONE: Record<SupportTicketStatus, 'info' | 'warning' | 'success' | 'neutral' | 'brand'> = {
  new: 'brand',
  in_progress: 'info',
  waiting_on_user: 'warning',
  resolved: 'success',
  closed: 'neutral',
}

function StatusBadge({ status, desk }: { status: SupportTicketStatus; desk?: boolean }) {
  return <Badge tone={STATUS_TONE[status]}>{(desk ? SUPPORT_STATUS_DESK_LABEL : SUPPORT_STATUS_LABEL)[status]}</Badge>
}

function readQuery(key: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(key)
}

/** Conversation + the actions this viewer may take on a ticket. */
function TicketConversation({
  ticket,
  viewer,
  desk,
  superAdmins,
}: {
  ticket: SupportTicket
  viewer: SupportViewer
  desk: boolean
  superAdmins: Array<{ id: string; name: string }>
}) {
  const { user } = useAuth()
  const { actOnSupportTicket } = useStore()
  const [reply, setReply] = useState('')
  const [internal, setInternal] = useState(false)
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const can = (act: SupportAction) => supportActionRefusal(viewer, ticket, act) === null
  const run = async (act: SupportAction, after?: () => void) => {
    if (busy) return
    setBusy(true)
    setError(null)
    const res = await actOnSupportTicket({ actorName: user.name, ticketId: ticket.id, act })
    setBusy(false)
    if (res.ok === false) {
      setError(res.error)
      return
    }
    after?.()
  }
  const replies = (ticket.replies ?? []).filter((r) => desk || !r.internal)
  const open = isSupportTicketOpen(ticket.status)

  return (
    <div className="mt-3 space-y-3 border-t border-primary-100 pt-3" data-testid={`help-ticket-thread-${ticket.id}`}>
      <p className="whitespace-pre-wrap text-sm text-ink-600">{ticket.body}</p>
      {ticket.attachments?.length ? (
        <div className="flex flex-wrap gap-2">
          {ticket.attachments.map((src, i) => (
            <a key={i} href={src} target="_blank" rel="noreferrer" className="block">
              <img src={src} alt={`Attachment ${i + 1}`} className="h-20 w-20 rounded-lg border border-primary-100 object-cover" />
            </a>
          ))}
        </div>
      ) : null}
      {desk && (ticket.pageUrl || ticket.userAgent) ? (
        <dl className="grid gap-1 rounded-xl bg-primary-50/60 p-3 text-xs text-ink-500">
          {ticket.pageUrl ? (
            <div className="min-w-0">
              <dt className="inline font-semibold text-ink">Page: </dt>
              <dd className="inline break-all">{ticket.pageUrl}</dd>
            </div>
          ) : null}
          {ticket.userAgent ? (
            <div className="min-w-0">
              <dt className="inline font-semibold text-ink">Browser: </dt>
              <dd className="inline break-all">{ticket.userAgent}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {ticket.resolutionNote ? (
        <div className="rounded-xl bg-primary-50 p-3 text-sm text-ink-600" data-testid="help-ticket-resolution">
          <p className="font-semibold text-ink">
            Resolved{ticket.resolvedByName ? ` by ${ticket.resolvedByName}` : ''}
            {ticket.resolvedAt ? ` · ${fmt(ticket.resolvedAt)}` : ''}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{ticket.resolutionNote}</p>
        </div>
      ) : null}

      {replies.length ? (
        <ol className="space-y-2" aria-label="Conversation">
          {replies.map((r) =>
            r.kind === 'event' ? (
              <li key={r.id} className="text-center text-xs text-ink-400">
                {r.body} · {r.authorName} · {fmt(r.at)}
              </li>
            ) : (
              <li
                key={r.id}
                className={cn(
                  'rounded-xl border p-3 text-sm',
                  r.internal
                    ? 'border-amber-200 bg-amber-50'
                    : r.authorUserId === ticket.submittedByUserId
                      ? 'border-primary-100 bg-white'
                      : 'border-primary-100 bg-primary-50/60',
                )}
              >
                <p className="text-xs text-ink-400">
                  <span className="font-semibold text-ink">
                    {r.authorUserId === ticket.submittedByUserId ? r.authorName || 'Reporter' : `${r.authorName || 'Support'} (support)`}
                  </span>{' '}
                  · {fmt(r.at)}
                  {r.internal ? ' · internal note' : ''}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-ink-600">{r.body}</p>
              </li>
            ),
          )}
        </ol>
      ) : null}

      {desk ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs font-medium text-ink-500">
            Status
            <Select
              className="mt-1"
              value={ticket.status}
              disabled={busy}
              onChange={(e) => void run({ action: 'status', status: e.target.value as SupportTicketStatus })}
              data-testid={`help-desk-status-${ticket.id}`}
            >
              {SUPPORT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SUPPORT_STATUS_DESK_LABEL[s]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs font-medium text-ink-500">
            Priority
            <Select
              className="mt-1"
              value={ticket.priority ?? 'normal'}
              disabled={busy}
              onChange={(e) => void run({ action: 'priority', priority: e.target.value as (typeof SUPPORT_PRIORITIES)[number] })}
            >
              {SUPPORT_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </Select>
          </label>
          {viewer.role === 'super_admin' ? (
            <label className="text-xs font-medium text-ink-500">
              Assigned to
              <Select
                className="mt-1"
                value={ticket.assigneeUserId ?? ''}
                disabled={busy}
                onChange={(e) => void run({ action: 'assign', assigneeUserId: e.target.value || null })}
                data-testid={`help-desk-assign-${ticket.id}`}
              >
                <option value="">Unassigned</option>
                {superAdmins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id === viewer.userId ? `${a.name} (me)` : a.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
        </div>
      ) : null}

      {can({ action: 'reply', body: 'x' }) ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            void run({ action: 'reply', body: reply, internal: desk && internal }, () => {
              setReply('')
              setInternal(false)
            })
          }}
        >
          <Textarea
            rows={3}
            value={reply}
            maxLength={SUPPORT_REPLY_MAX}
            placeholder={desk ? 'Reply to the user…' : ticket.status === 'resolved' ? 'Still a problem? Reply to reopen…' : 'Add a reply…'}
            onChange={(e) => setReply(e.target.value)}
            aria-label="Reply"
            data-testid={`help-ticket-reply-${ticket.id}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" className="min-h-11" disabled={busy || !reply.trim()}>
              <Send className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              {desk && internal ? 'Add note' : 'Send reply'}
            </Button>
            {desk && !internal ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="min-h-11"
                disabled={busy || !reply.trim()}
                onClick={() => void run({ action: 'reply', body: reply, status: 'waiting_on_user' }, () => setReply(''))}
              >
                Reply &amp; wait for user
              </Button>
            ) : null}
            {desk ? (
              <label className="flex min-h-11 items-center gap-2 text-xs text-ink-500">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                Internal note (not shown to the user)
              </label>
            ) : null}
          </div>
        </form>
      ) : null}

      {!desk ? (
        <div className="flex flex-wrap gap-2">
          {open && can({ action: 'close' }) ? (
            <Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={busy} onClick={() => void run({ action: 'close' })}>
              My problem is solved — close ticket
            </Button>
          ) : null}
          {can({ action: 'reopen' }) ? (
            <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={busy} onClick={() => void run({ action: 'reopen' })}>
              Reopen
            </Button>
          ) : null}
        </div>
      ) : null}

      {!desk && !open && !ticket.rating && supportActionRefusal(viewer, ticket, { action: 'rate', rating: 5 }) === null ? (
        <div className="rounded-xl border border-primary-100 p-3" data-testid={`help-ticket-rate-${ticket.id}`}>
          <p className="text-sm font-semibold text-ink">How did we do?</p>
          <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg hover:bg-primary-50"
                onClick={() => setRating(n)}
              >
                <Star className={cn('h-6 w-6', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-ink-300')} aria-hidden />
              </button>
            ))}
          </div>
          <Input
            className="mt-2"
            placeholder="Anything to add? (optional)"
            value={ratingComment}
            maxLength={1000}
            onChange={(e) => setRatingComment(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            className="mt-2 min-h-11"
            disabled={busy || rating === 0}
            onClick={() => void run({ action: 'rate', rating, comment: ratingComment })}
          >
            Send rating
          </Button>
        </div>
      ) : null}
      {ticket.rating ? (
        <p className="text-xs text-ink-500">
          Rated {ticket.rating}/5{ticket.ratingComment ? ` — “${ticket.ratingComment}”` : ''}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-accent-700">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function TicketRow({
  ticket,
  viewer,
  desk,
  superAdmins,
  expanded,
  onToggle,
  testId,
}: {
  ticket: SupportTicket
  viewer: SupportViewer
  desk: boolean
  superAdmins: Array<{ id: string; name: string }>
  expanded: boolean
  onToggle: () => void
  testId: string
}) {
  const age = supportTicketAge(ticket)
  const replyCount = (ticket.replies ?? []).filter((r) => r.kind !== 'event' && (desk || !r.internal)).length
  const unread =
    !desk && (ticket.replies ?? []).some((r) => !r.internal && r.kind !== 'event' && r.authorUserId !== ticket.submittedByUserId)
  return (
    <li id={`ticket-${ticket.id}`} className="rounded-xl border border-primary-100 p-3" data-testid={testId}>
      <button type="button" className="block w-full cursor-pointer text-left" onClick={onToggle} aria-expanded={expanded}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 font-semibold text-ink">{ticket.subject}</p>
          <div className="flex flex-wrap items-center gap-1">
            {desk && ticket.priority && ticket.priority !== 'normal' ? (
              <Badge tone={ticket.priority === 'urgent' ? 'danger' : ticket.priority === 'high' ? 'warning' : 'neutral'}>
                {ticket.priority}
              </Badge>
            ) : null}
            {desk && age.overdue ? (
              <Badge tone="danger">
                <AlertTriangle className="mr-1 h-3 w-3" aria-hidden />
                No reply · {age.label}
              </Badge>
            ) : null}
            <StatusBadge status={ticket.status} desk={desk} />
          </div>
        </div>
        <p className="mt-0.5 text-xs text-ink-400">
          <span data-testid={`help-my-ticket-number-${ticket.id}`}>Ticket {ticket.id}</span> · {supportCategoryLabel(ticket.category)} ·{' '}
          {desk ? `${ticket.submitterName || 'Unknown user'} (${ticket.submitterRole.replace(/_/g, ' ') || 'user'}) · ` : ''}
          {fmt(ticket.createdAt)}
          {desk ? ` · ${age.label} old` : ''}
          {desk && ticket.assigneeName ? ` · ${ticket.assigneeName}` : ''}
          {replyCount ? ` · ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}` : ''}
          {unread && ticket.status === 'waiting_on_user' ? ' · support is waiting for you' : ''}
        </p>
      </button>
      {expanded ? <TicketConversation ticket={ticket} viewer={viewer} desk={desk} superAdmins={superAdmins} /> : null}
    </li>
  )
}

type DeskTab = 'open' | 'mine' | 'unassigned' | 'done'

export function HelpDesk() {
  const { user, isAuthenticated, has } = useAuth()
  const { state, submitSupportTicket } = useStore()

  const signedIn = isAuthenticated && user.id !== 'guest'
  const viewer = useMemo<SupportViewer>(
    () => ({
      userId: user.id,
      role: user.role,
      agencyId: user.agencyId,
      hasUsersManage: has('users.manage'),
    }),
    [user.id, user.role, user.agencyId, has],
  )

  const myTickets = useMemo(
    () =>
      state.supportTickets
        .filter((t) => t.submittedByUserId === user.id)
        .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)),
    [state.supportTickets, user.id],
  )
  const deskAll = useMemo(
    () =>
      signedIn && isSupportDeskViewer(viewer)
        ? state.supportTickets.filter((t) => t.submittedByUserId !== user.id && canResolveSupportTicket(viewer, t))
        : [],
    [signedIn, state.supportTickets, viewer, user.id],
  )
  // Agency admins only see the desk while they still have legacy agency tickets.
  const deskViewer = signedIn && (user.role === 'super_admin' || deskAll.length > 0)
  const superAdmins = useMemo(
    () => state.users.filter((u) => u.role === 'super_admin' && u.active !== false).map((u) => ({ id: u.id, name: u.name })),
    [state.users],
  )

  const [tab, setTab] = useState<DeskTab>('open')
  const [catFilter, setCatFilter] = useState('')
  const deskTickets = useMemo(() => {
    const pri = { urgent: 0, high: 1, normal: 2, low: 3 } as const
    return deskAll
      .filter((t) => {
        const open = isSupportTicketOpen(t.status)
        if (catFilter && t.category !== catFilter) return false
        if (tab === 'open') return open
        if (tab === 'mine') return open && t.assigneeUserId === user.id
        if (tab === 'unassigned') return open && !t.assigneeUserId
        return !open
      })
      .sort((a, b) => {
        const oa = supportTicketAge(a).overdue ? 0 : 1
        const ob = supportTicketAge(b).overdue ? 0 : 1
        if (oa !== ob) return oa - ob
        const pa = pri[a.priority ?? 'normal']
        const pb = pri[b.priority ?? 'normal']
        if (pa !== pb) return pa - pb
        return b.createdAt.localeCompare(a.createdAt)
      })
  }, [deskAll, tab, catFilter, user.id])
  const counts = useMemo(() => {
    const open = deskAll.filter((t) => isSupportTicketOpen(t.status))
    return {
      open: open.length,
      mine: open.filter((t) => t.assigneeUserId === user.id).length,
      unassigned: open.filter((t) => !t.assigneeUserId).length,
      done: deskAll.length - open.length,
    }
  }, [deskAll, user.id])

  const [expandedId, setExpandedId] = useState<string | null>(() => readQuery('ticket'))
  useEffect(() => {
    if (!expandedId || typeof document === 'undefined') return
    const el = document.getElementById(`ticket-${expandedId}`)
    el?.scrollIntoView?.({ block: 'center' })
    // Only on first load from a notification link.
  }, [])
  const toggle = (id: string) => setExpandedId((cur) => (cur === id ? null : id))

  const [category, setCategory] = useState<string>('bug')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const fromPath = readQuery('from')
  const similar = useMemo(() => (subject.trim().length >= 6 ? similarOpenTickets(subject, myTickets) : []), [subject, myTickets])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setSubmitMsg(null)
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const res = await submitSupportTicket({
      actor: { id: user.id, name: user.name, role: user.role, agencyId: user.agencyId },
      subject,
      body,
      category,
      attachments,
      pageUrl: fromPath && fromPath.startsWith('/') ? `${origin}${fromPath}` : typeof window !== 'undefined' ? window.location.href : null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    })
    setSubmitting(false)
    if (res.ok === false) {
      setSubmitMsg({ tone: 'error', text: res.error })
      return
    }
    setSubject('')
    setBody('')
    setAttachments([])
    setExpandedId(res.ticket.id)
    setSubmitMsg({
      tone: 'ok',
      text: `Ticket ${res.ticket.id} sent to platform support. You will get a notification when they reply.`,
    })
  }

  if (!signedIn) {
    return (
      <section data-testid="help-desk-signed-out">
        <Card className="p-5 text-sm text-ink-500">Sign in to report a problem.</Card>
      </section>
    )
  }

  return (
    <div className="space-y-4" data-testid="help-desk">
      {deskViewer ? (
        <section data-testid="help-desk-section">
          <Card className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Inbox className="h-5 w-5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
              <h2 className="font-display text-lg font-semibold text-ink">Support inbox</h2>
            </div>
            <p className="text-sm text-ink-500">
              {user.role === 'super_admin'
                ? 'System tickets from every user on the platform. Overdue = no reply within the response window for its priority.'
                : 'Earlier tickets from tenants, landlords and contractors at your agency. New tickets go to platform support.'}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <DashboardTabs
                tabs={[
                  { id: 'open', label: 'Open', count: counts.open },
                  ...(user.role === 'super_admin'
                    ? [
                        { id: 'mine', label: 'Assigned to me', count: counts.mine },
                        { id: 'unassigned', label: 'Unassigned', count: counts.unassigned },
                      ]
                    : []),
                  { id: 'done', label: 'Resolved', count: counts.done },
                ]}
                value={tab}
                onChange={(id) => setTab(id as DeskTab)}
              />
              <Select className="sm:w-48" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Category">
                <option value="">All categories</option>
                {SUPPORT_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            {deskTickets.length === 0 ? (
              <p className="text-sm text-ink-400">No tickets here.</p>
            ) : (
              <ul className="space-y-3">
                {deskTickets.map((t) => (
                  <TicketRow
                    key={t.id}
                    ticket={t}
                    viewer={viewer}
                    desk
                    superAdmins={superAdmins}
                    expanded={expandedId === t.id}
                    onToggle={() => toggle(t.id)}
                    testId={`help-desk-ticket-${t.id}`}
                  />
                ))}
              </ul>
            )}
          </Card>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section data-testid="help-raise-ticket" id="report">
          <Card className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
              <h2 className="font-display text-lg font-semibold text-ink">Report a problem</h2>
            </div>
            <p className="text-sm leading-relaxed text-ink-500">
              For problems with the app itself — errors, access, billing, ideas. It goes to platform support.
              {user.role === 'tenant' ? ' Something broken in your home? Report it under Faults instead.' : ''}
            </p>
            <form className="space-y-3" onSubmit={submit}>
              <label className="block text-sm font-medium text-ink">
                What is it about?
                <Select className="mt-1" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="help-ticket-category">
                  {SUPPORT_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </label>
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
              {similar.length ? (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
                  You may already have an open ticket about this: {similar.map((t) => `${t.id} “${t.subject}”`).join(', ')}. You can reply there instead.
                </p>
              ) : null}
              <label className="block text-sm font-medium text-ink">
                What happened?
                <Textarea
                  className="mt-1"
                  rows={5}
                  value={body}
                  maxLength={SUPPORT_BODY_MAX}
                  placeholder="What were you trying to do, and what went wrong?"
                  onChange={(e) => setBody(e.target.value)}
                  required
                  data-testid="help-ticket-body"
                />
              </label>
              <ImageDropzone
                value={attachments}
                onChange={setAttachments}
                max={SUPPORT_ATTACHMENTS_MAX}
                label="Screenshot (optional)"
                hint={`Up to ${SUPPORT_ATTACHMENTS_MAX} images`}
              />
              <p className="flex items-start gap-1 text-xs text-ink-400">
                <Paperclip className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                We include the page you were on and your browser so support can reproduce it.
              </p>
              {submitMsg ? (
                <p
                  role={submitMsg.tone === 'error' ? 'alert' : 'status'}
                  className={submitMsg.tone === 'error' ? 'text-sm text-accent-700' : 'text-sm text-ink-600'}
                  data-testid="help-ticket-submit-message"
                >
                  {submitMsg.text}
                </p>
              ) : null}
              <Button
                type="submit"
                className="min-h-11"
                disabled={submitting || !subject.trim() || !body.trim()}
                data-testid="help-ticket-submit"
              >
                {submitting ? 'Sending…' : 'Send to support'}
              </Button>
            </form>
          </Card>
        </section>

        <section data-testid="help-my-tickets">
          <Card className="space-y-3 p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold text-ink">My tickets</h2>
            {myTickets.length === 0 ? (
              <p className="text-sm text-ink-400">You have not raised any tickets.</p>
            ) : (
              <ul className="space-y-3">
                {myTickets.map((t) => (
                  <TicketRow
                    key={t.id}
                    ticket={t}
                    viewer={viewer}
                    desk={false}
                    superAdmins={superAdmins}
                    expanded={expandedId === t.id}
                    onToggle={() => toggle(t.id)}
                    testId={`help-my-ticket-${t.id}`}
                  />
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </div>
  )
}
