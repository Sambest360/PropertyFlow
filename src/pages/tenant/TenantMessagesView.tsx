import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Send } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import type { TenantPortalState } from '../../hooks/useTenantPortalState'
import { Badge, Button, Card, Input, Select, Textarea } from '../../components/ui'
import {
  resolveTenantComposeTarget,
  routesToBadgeLabel,
} from '../../lib/messaging/modeA'

const ICON_STROKE = 1.6

export function TenantMessagesView({ portal }: { portal: TenantPortalState }) {
  const { state, sendMessage, createThread } = useStore()
  const [newSubject, setNewSubject] = useState('')
  const [draft, setDraft] = useState('')
  const [activeId, setActiveId] = useState('')
  const [target, setTarget] = useState<'landlord' | 'agency'>('landlord')

  const landlordId =
    portal.tenancy?.landlordId ??
    state.properties.find((p) => p.id === portal.tenancy?.propertyId)?.landlordId ??
    portal.property?.landlordId ??
    null

  const threads = useMemo(
    () =>
      [...portal.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [portal.threads],
  )

  useEffect(() => {
    if (!activeId && threads[0]) setActiveId(threads[0].id)
    if (activeId && !threads.some((t) => t.id === activeId) && threads[0]) {
      setActiveId(threads[0].id)
    }
  }, [threads, activeId])

  const active = threads.find((t) => t.id === activeId) ?? threads[0]
  const threadMessages = state.messages
    .filter((m) => m.threadId === active?.id)
    .sort((a, b) => a.at.localeCompare(b.at))

  const nameOf = (id: string) => state.users.find((u) => u.id === id)?.name ?? 'User'

  const startThread = () => {
    if (!newSubject.trim() || !portal.user.agencyId) return
    const agentId =
      portal.tenancy?.agentId ??
      state.properties.find((p) => p.id === portal.tenancy?.propertyId)?.agentId ??
      state.properties.find((p) => p.agencyId === portal.user.agencyId)?.agentId
    const preferLandlord = target === 'landlord' && Boolean(landlordId)
    const composed = resolveTenantComposeTarget({
      preferLandlord,
      tenantUserId: portal.user.id,
      landlordId,
      agentId,
    })
    if (composed.participantIds.length < 2 && composed.routesTo !== 'agency') return
    const thread = createThread({
      agencyId: portal.user.agencyId,
      propertyId: portal.tenancy?.propertyId ?? portal.property?.id ?? null,
      applicationId: portal.tenancy?.applicationId ?? portal.app?.id ?? null,
      subject: newSubject.trim(),
      participantIds: composed.participantIds,
      routesTo: composed.routesTo,
      fromUserId: portal.user.id,
      initialMessage: newSubject.trim(),
    })
    setActiveId(thread.id)
    setNewSubject('')
  }

  const submitReply = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim() || !active) return
    sendMessage(active.id, portal.user.id, draft.trim())
    setDraft('')
  }

  if (!portal.occupancyReady) {
    return (
      <Card className="p-6 text-sm text-ink-500">
        Messaging unlocks once you are approved onto a property.{' '}
        <Link className="font-semibold text-primary" to="/workspace/portals/tenant/applications">
          View applications
        </Link>
      </Card>
    )
  }

  return (
    <div data-tip-target="tenant-messages" className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <MessageCircle className="h-5 w-5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
          Messages
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Message your landlord directly, or the managing agency/agent.
        </p>
      </div>

      <Card className="flex flex-wrap gap-2 p-4">
        <Select
          className="min-h-11 min-w-[10rem] cursor-pointer"
          value={target}
          onChange={(e) => setTarget(e.target.value as 'landlord' | 'agency')}
          aria-label="Message destination"
        >
          <option value="landlord" disabled={!landlordId}>
            Landlord{landlordId ? '' : ' (none on tenancy)'}
          </option>
          <option value="agency">Agency / agent</option>
        </Select>
        <Input
          className="min-h-11 min-w-[200px] flex-1"
          placeholder="New subject (e.g. Parking query)"
          value={newSubject}
          onChange={(e) => setNewSubject(e.target.value)}
        />
        <Button className="min-h-11 cursor-pointer" size="sm" onClick={startThread}>
          Start conversation
        </Button>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
        <Card className="p-2">
          <ul className="space-y-1">
            {threads.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  className={`flex w-full cursor-pointer flex-col rounded-xl px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    t.id === active?.id ? 'bg-primary-50' : ''
                  }`}
                >
                  <span className="line-clamp-2 font-medium text-ink">{t.subject}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-400">
                    <Badge tone={t.routesTo === 'landlord' ? 'brand' : 'info'}>
                      {routesToBadgeLabel(t.routesTo)}
                    </Badge>
                    {new Date(t.updatedAt).toLocaleDateString('en-ZA')}
                  </span>
                </button>
              </li>
            ))}
            {threads.length === 0 ? (
              <li className="px-3 py-4 text-sm text-ink-400">No conversations yet.</li>
            ) : null}
          </ul>
        </Card>

        <Card className="flex min-h-[20rem] flex-col p-4">
          {active ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-primary-100 pb-3">
                <p className="font-semibold text-ink">{active.subject}</p>
                <Badge tone={active.routesTo === 'landlord' ? 'brand' : 'info'}>
                  {routesToBadgeLabel(active.routesTo)}
                </Badge>
              </div>
              <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                {threadMessages.map((m) => {
                  const mine = m.fromUserId === portal.user.id
                  return (
                    <li
                      key={m.id}
                      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                          mine ? 'bg-primary text-white' : 'bg-primary-50 text-ink'
                        }`}
                      >
                        {!mine ? (
                          <p className="mb-0.5 text-[10px] font-semibold uppercase opacity-70">
                            {nameOf(m.fromUserId)}
                          </p>
                        ) : null}
                        <p>{m.body}</p>
                        <p className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-ink-400'}`}>
                          {new Date(m.at).toLocaleString('en-ZA')}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <form onSubmit={submitReply} className="mt-3 flex gap-2 border-t border-primary-100 pt-3">
                <Textarea
                  className="min-h-11 flex-1"
                  rows={2}
                  placeholder="Write a message…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Button type="submit" className="min-h-11 shrink-0 cursor-pointer self-end" size="sm">
                  <Send className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  Send
                </Button>
              </form>
            </>
          ) : (
            <p className="text-sm text-ink-400">Select a conversation or start a new one.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
