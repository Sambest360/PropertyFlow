import { useMemo, useState } from 'react'
import { MessageSquare, Plus, Send } from 'lucide-react'
import type { Message, MessageThread } from '../../types/domain'
import type { AppUser } from '../../types/domain'
import { Button, Card, Input, Textarea, cn } from '../ui'
import { ICON_STROKE } from './types'
import { FieldHelp } from '../onboarding/FieldHelp'
import { MESSAGING_MODE_A_BANNER, routesToBadgeLabel } from '../../lib/messaging/modeA'

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function PropertyMessagesPanel({
  threads,
  messages,
  users,
  propertyId,
  currentUser,
  canManage,
  onCreateThread,
  onSend,
}: {
  threads: MessageThread[]
  messages: Message[]
  users: AppUser[]
  agencyId: string
  propertyId: string
  currentUser: AppUser
  canManage: boolean
  onCreateThread: (subject: string, body: string) => void
  onSend: (threadId: string, body: string) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(threads[0]?.id ?? null)
  const [draft, setDraft] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const active = threads.find((t) => t.id === activeId) ?? null
  const threadMessages = useMemo(
    () =>
      messages
        .filter((m) => m.threadId === activeId)
        .sort((a, b) => (a.at < b.at ? -1 : 1)),
    [messages, activeId],
  )

  return (
    <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card className="flex min-h-[22rem] flex-col p-0">
        <div className="flex items-center justify-between gap-2 border-b border-primary-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
            <h2 className="font-semibold text-ink">Threads</h2>
            <FieldHelp title="Messaging" body={MESSAGING_MODE_A_BANNER} />
          </div>
          {canManage && (
            <Button
              size="sm"
              variant="secondary"
              className="min-h-11"
              onClick={() => setShowNew((v) => !v)}
            >
              <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              New
            </Button>
          )}
        </div>

        {showNew && canManage && (
          <form
            className="space-y-2 border-b border-primary-100 bg-primary-50/40 p-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!subject.trim() || !body.trim()) return
              onCreateThread(subject.trim(), body.trim())
              setSubject('')
              setBody('')
              setShowNew(false)
            }}
          >
            <Input
              className="min-h-11"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
            <Textarea
              className="min-h-20"
              placeholder="First message…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
            <Button type="submit" className="min-h-11 w-full">
              Start thread
            </Button>
          </form>
        )}

        <ul className="flex-1 overflow-y-auto p-2">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setActiveId(t.id)}
                className={cn(
                  'mb-1 w-full cursor-pointer rounded-xl px-3 py-3 text-left transition-colors duration-200',
                  activeId === t.id ? 'bg-primary-50' : 'hover:bg-primary-50/60',
                )}
              >
                <p className="truncate text-sm font-semibold text-ink">{t.subject}</p>
                <p className="mt-0.5 text-[11px] text-ink-500">{routesToBadgeLabel(t.routesTo)}</p>
                <p className="mt-0.5 text-[11px] tabular text-ink-400">
                  {new Date(t.updatedAt).toLocaleString('en-ZA', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </p>
              </button>
            </li>
          ))}
          {!threads.length && (
            <li className="px-3 py-8 text-center text-sm text-ink-500">
              No messages for this property yet.
            </li>
          )}
        </ul>
      </Card>

      <Card className="flex min-h-[22rem] flex-col p-0">
        {active ? (
          <>
            <div className="border-b border-primary-100 px-4 py-3">
              <h3 className="font-semibold text-ink">{active.subject}</h3>
              <p className="text-xs text-ink-500">
                {active.participantIds
                  .map((id) => users.find((u) => u.id === id)?.name ?? id)
                  .join(' · ')}
              </p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {threadMessages.map((m) => {
                const from = users.find((u) => u.id === m.fromUserId)
                const mine = m.fromUserId === currentUser.id
                return (
                  <div
                    key={m.id}
                    className={cn('flex gap-2', mine ? 'flex-row-reverse' : 'flex-row')}
                  >
                    <span
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white"
                      aria-hidden
                    >
                      {initials(from?.name ?? '?')}
                    </span>
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                        mine ? 'bg-primary text-white' : 'bg-primary-50 text-ink',
                      )}
                    >
                      <p className="text-[11px] font-semibold opacity-80">
                        {from?.name ?? 'Unknown'}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
                      <p className="mt-1 text-[10px] tabular opacity-70">
                        {new Date(m.at).toLocaleString('en-ZA', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
            {canManage && (
              <form
                className="flex gap-2 border-t border-primary-100 p-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!draft.trim()) return
                  onSend(active.id, draft.trim())
                  setDraft('')
                }}
              >
                <Input
                  className="min-h-11 flex-1"
                  placeholder="Write a message…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Button type="submit" className="min-h-11 min-w-11" aria-label="Send">
                  <Send className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                </Button>
              </form>
            )}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-ink-500">
            Select a thread or start a new conversation about {propertyId}.
          </div>
        )}
      </Card>
    </div>
    </div>
  )
}