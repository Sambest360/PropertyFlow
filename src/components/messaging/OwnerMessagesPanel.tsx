import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { MessageCircle, Send } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAuth, usePropertyScope } from '../../context/AuthContext'
import { Badge, Button, Card, Input, Select, Textarea } from '../ui'
import { FieldHelp } from '../onboarding/FieldHelp'
import { MESSAGING_MODE_A_BANNER } from '../../lib/messaging/modeA'
import {
  resolveOwnerComposeTarget,
  routesToBadgeLabel,
} from '../../lib/messaging/modeA'

const ICON_STROKE = 1.6

export function OwnerMessagesPanel() {
  const { state, createThread, sendMessage } = useStore()
  const { user } = useAuth()
  const { threadVisible, allowedPropertyIds } = usePropertyScope()
  const [activeId, setActiveId] = useState('')
  const [draft, setDraft] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [tenantUserId, setTenantUserId] = useState('')

  const properties = useMemo(
    () => state.properties.filter((p) => allowedPropertyIds.has(p.id)),
    [state.properties, allowedPropertyIds],
  )

  const tenantsOnBook = useMemo(() => {
    return state.tenancies
      .filter((t) => allowedPropertyIds.has(t.propertyId) && t.status === 'Active')
      .map((t) => {
        const tenant = state.users.find((u) => u.id === t.tenantUserId)
        const prop = state.properties.find((p) => p.id === t.propertyId)
        return {
          tenancyId: t.id,
          tenantUserId: t.tenantUserId,
          propertyId: t.propertyId,
          label: `${tenant?.name ?? t.tenantUserId} · ${prop?.title ?? t.propertyId}`,
        }
      })
  }, [state.tenancies, state.users, state.properties, allowedPropertyIds])

  const threads = useMemo(
    () =>
      state.threads
        .filter((t) => threadVisible(t))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [state.threads, threadVisible],
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

  const nameOf = (id: string) => state.users.find((u) => u.id === id)?.name ?? id

  const startThread = () => {
    if (!subject.trim() || !body.trim() || !tenantUserId || !user.agencyId) return
    const tenancy = state.tenancies.find(
      (t) => t.tenantUserId === tenantUserId && (!propertyId || t.propertyId === propertyId),
    )
    const propId = propertyId || tenancy?.propertyId || null
    const prop = propId ? state.properties.find((p) => p.id === propId) : undefined
    const composed = resolveOwnerComposeTarget({
      landlordUserId: user.id,
      tenantUserId,
      includeAgencyUserId: prop?.agentId ?? null,
    })
    const thread = createThread({
      agencyId: user.agencyId,
      propertyId: propId,
      applicationId: tenancy?.applicationId ?? null,
      subject: subject.trim(),
      participantIds: composed.participantIds,
      routesTo: composed.routesTo,
      fromUserId: user.id,
      initialMessage: body.trim(),
    })
    setActiveId(thread.id)
    setSubject('')
    setBody('')
  }

  const submitReply = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.trim() || !active) return
    sendMessage(active.id, user.id, draft.trim())
    setDraft('')
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
        <h2 className="font-display text-lg font-semibold text-ink">Messages</h2>
        <FieldHelp title="Messaging" body={MESSAGING_MODE_A_BANNER} />
      </div>
      <p className="text-sm text-ink-500">
        Compose and reply with tenants on your properties. Agency may appear on the thread when
        assigned.
      </p>

      <div className="grid gap-2 rounded-2xl border border-primary-100 bg-primary-50/40 p-3 sm:grid-cols-2">
        <Select
          className="min-h-11 cursor-pointer sm:col-span-2"
          value={tenantUserId}
          onChange={(e) => {
            const id = e.target.value
            setTenantUserId(id)
            const row = tenantsOnBook.find((t) => t.tenantUserId === id)
            if (row) setPropertyId(row.propertyId)
          }}
          aria-label="Tenant"
        >
          <option value="">Tenant…</option>
          {tenantsOnBook.map((t) => (
            <option key={`${t.tenancyId}-${t.tenantUserId}`} value={t.tenantUserId}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select
          className="min-h-11 cursor-pointer"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          aria-label="Property"
        >
          <option value="">Property (optional)</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <Input
          className="min-h-11"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <Textarea
          className="min-h-20 sm:col-span-2"
          placeholder="First message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button className="min-h-11 cursor-pointer sm:col-span-2" onClick={startThread}>
          Start owner↔tenant thread
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_1fr]">
        <ul className="space-y-1 rounded-xl border border-primary-100 p-2">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setActiveId(t.id)}
                className={`flex w-full cursor-pointer flex-col rounded-xl px-3 py-2 text-left text-sm hover:bg-primary-50 ${
                  t.id === active?.id ? 'bg-primary-50' : ''
                }`}
              >
                <span className="line-clamp-2 font-medium text-ink">{t.subject}</span>
                <span className="mt-0.5 text-[11px] text-ink-400">
                  {routesToBadgeLabel(t.routesTo)} ·{' '}
                  {new Date(t.updatedAt).toLocaleDateString('en-ZA')}
                </span>
              </button>
            </li>
          ))}
          {threads.length === 0 ? (
            <li className="px-3 py-4 text-sm text-ink-400">No threads yet.</li>
          ) : null}
        </ul>

        <div className="flex min-h-[16rem] flex-col rounded-xl border border-primary-100 p-3">
          {active ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-primary-100 pb-2">
                <p className="font-semibold text-ink">{active.subject}</p>
                <Badge tone={active.routesTo === 'landlord' ? 'brand' : 'info'}>
                  {routesToBadgeLabel(active.routesTo)}
                </Badge>
              </div>
              <ul className="flex-1 space-y-2 overflow-y-auto">
                {threadMessages.map((m) => {
                  const mine = m.fromUserId === user.id
                  return (
                    <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
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
                      </div>
                    </li>
                  )
                })}
              </ul>
              <form onSubmit={submitReply} className="mt-2 flex gap-2 border-t border-primary-100 pt-2">
                <Input
                  className="min-h-11 flex-1"
                  placeholder="Reply…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Button type="submit" className="min-h-11 cursor-pointer" size="sm">
                  <Send className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                  Send
                </Button>
              </form>
            </>
          ) : (
            <p className="m-auto text-sm text-ink-400">Select or start a thread.</p>
          )}
        </div>
      </div>
    </Card>
  )
}
