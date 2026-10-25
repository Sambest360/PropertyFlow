/**
 * Conversation on a fault / maintenance ticket (server/faultDesk.ts).
 * Tenants, staff, the owning landlord and the assigned contractor reply here;
 * the reporting tenant confirms a fixed fault (with a rating) or reopens it.
 * Internal notes are staff-only. The server checks every rule.
 */
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, RotateCcw, Send, Star } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { fetchFaultThread, postFaultThread, type FaultThread } from '../../lib/api/helpDeskApi'
import { FAULT_REPLY_MAX } from '../../lib/faults'
import { Button, Textarea, cn } from '../ui'

function fmt(at: string): string {
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString()
}

export function FaultConversation({
  ticketId,
  done,
  onStatusChange,
  onFeedback,
}: {
  ticketId: string
  /** Ticket is marked fixed (Completed): the reporter may confirm or reopen. */
  done: boolean
  /** The server reopened the ticket (tenant said it is not fixed). */
  onStatusChange?: (status: 'Requested') => void
  onFeedback?: (f: { kind: 'confirmed' | 'reopened'; rating: number | null; at: string }) => void
}) {
  const { user } = useAuth()
  const [thread, setThread] = useState<FaultThread | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [internal, setInternal] = useState(false)
  const [mode, setMode] = useState<'reply' | 'confirm' | 'reopen'>('reply')
  const [rating, setRating] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchFaultThread(ticketId)
      .then((t) => {
        setThread(t)
        setLoadError(null)
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Could not load the conversation.'))
  }, [ticketId])
  useEffect(() => {
    load()
  }, [load])

  const send = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const next = await postFaultThread(ticketId, {
        action: mode,
        body: reply,
        rating: mode === 'confirm' && rating ? rating : null,
        internal: mode === 'reply' && internal,
        actorName: user.name,
      })
      setThread(next)
      if (mode === 'reopen') onStatusChange?.('Requested')
      if (mode !== 'reply') onFeedback?.({ kind: mode === 'confirm' ? 'confirmed' : 'reopened', rating: rating || null, at: new Date().toISOString() })
      setReply('')
      setInternal(false)
      setRating(0)
      setMode('reply')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not send. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <p className="text-xs text-ink-400" data-testid="fault-thread-error">
        {loadError}{' '}
        <button type="button" className="cursor-pointer font-semibold text-primary" onClick={load}>
          Retry
        </button>
      </p>
    )
  }
  if (!thread) return <p className="text-xs text-ink-400">Loading conversation…</p>

  const reporter = thread.access === 'reporter'
  const staff = thread.access === 'staff'
  const canSend = mode === 'confirm' || reply.trim().length > 0

  return (
    <div className="space-y-3" data-testid={`fault-thread-${ticketId}`}>
      {thread.entries.length ? (
        <ol className="space-y-2" aria-label="Conversation">
          {thread.entries.map((e) => (
            <li
              key={e.id}
              className={cn(
                'rounded-xl border p-3 text-sm',
                e.internal
                  ? 'border-amber-200 bg-amber-50'
                  : e.kind === 'confirmed'
                    ? 'border-emerald-200 bg-emerald-50'
                    : e.kind === 'reopened'
                      ? 'border-accent-200 bg-accent-50'
                      : e.authorRole === 'tenant'
                        ? 'border-primary-100 bg-white'
                        : 'border-primary-100 bg-primary-50/60',
              )}
            >
              <p className="text-xs text-ink-400">
                <span className="font-semibold text-ink">{e.authorName || 'User'}</span>
                {e.authorRole ? ` (${e.authorRole === 'tenant' ? 'tenant' : e.authorRole.replace(/_/g, ' ')})` : ''} · {fmt(e.at)}
                {e.internal ? ' · internal note' : ''}
              </p>
              {e.kind === 'confirmed' ? (
                <p className="mt-1 font-semibold text-emerald-800">
                  Confirmed fixed{e.rating ? ` · ${'★'.repeat(e.rating)}${'☆'.repeat(5 - e.rating)}` : ''}
                </p>
              ) : e.kind === 'reopened' ? (
                <p className="mt-1 font-semibold text-accent-700">Reopened — not fixed</p>
              ) : null}
              {e.body ? <p className="mt-1 whitespace-pre-wrap text-ink-600">{e.body}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-ink-400">No messages yet.</p>
      )}

      {reporter && done ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === 'confirm' ? 'primary' : 'secondary'}
            className="min-h-11"
            onClick={() => setMode(mode === 'confirm' ? 'reply' : 'confirm')}
            data-testid={`fault-confirm-${ticketId}`}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Yes, it is fixed
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'reopen' ? 'primary' : 'ghost'}
            className="min-h-11"
            onClick={() => setMode(mode === 'reopen' ? 'reply' : 'reopen')}
            data-testid={`fault-reopen-${ticketId}`}
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Not fixed — reopen
          </Button>
        </div>
      ) : null}

      {mode === 'confirm' ? (
        <div>
          <p className="text-sm font-semibold text-ink">How was the repair? (optional)</p>
          <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg hover:bg-primary-50"
                onClick={() => setRating(rating === n ? 0 : n)}
              >
                <Star className={cn('h-6 w-6', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-ink-300')} aria-hidden />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <Textarea
          rows={2}
          value={reply}
          maxLength={FAULT_REPLY_MAX}
          aria-label="Message"
          placeholder={
            mode === 'reopen'
              ? 'What is still wrong?'
              : mode === 'confirm'
                ? 'Anything to add? (optional)'
                : reporter
                  ? 'Message the person handling this…'
                  : 'Message…'
          }
          onChange={(e) => setReply(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" className="min-h-11" disabled={busy || !canSend}>
            <Send className="h-4 w-4" aria-hidden />
            {mode === 'confirm' ? 'Confirm fixed' : mode === 'reopen' ? 'Reopen fault' : internal ? 'Add note' : 'Send'}
          </Button>
          {staff && mode === 'reply' ? (
            <label className="flex min-h-11 items-center gap-2 text-xs text-ink-500">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              Internal note (staff only)
            </label>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-accent-700">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  )
}
