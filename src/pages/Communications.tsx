import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { MessageCircle, Plus, Shield } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { BackButton } from '../components/BackButton'
import { Badge, Button, Card, Input, Modal, PageHeader, Select, Textarea, cn } from '../components/ui'
import { isAgencyStaff } from '../lib/permissions'

const ICON_STROKE = 1.6

export default function Communications() {
  const { state, sendMessage, createThread } = useStore()
  const { user, role, agencyId } = useAuth()
  const { threadVisible, allowedPropertyIds, canMutate } = usePropertyScope()
  const [draft, setDraft] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [composeOpen, setComposeOpen] = useState(false)
  const [mobileShowThread, setMobileShowThread] = useState(false)

  const threads = useMemo(() => {
    return state.threads
      .filter((t) => {
        if (!threadVisible(t)) return false
        if (filter === 'mine' && !t.participantIds.includes(user.id)) return false
        if (propertyFilter !== 'all' && t.propertyId !== propertyFilter) return false
        return true
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [state.threads, threadVisible, filter, propertyFilter, user.id])

  const [activeId, setActiveId] = useState('')
  useEffect(() => {
    if (!activeId && threads[0]) setActiveId(threads[0].id)
    if (activeId && !threads.some((t) => t.id === activeId) && threads[0]) {
      setActiveId(threads[0].id)
    }
  }, [threads, activeId])

  const active = threads.find((t) => t.id === activeId) ?? threads[0]
  const messages = state.messages.filter((m) => m.threadId === active?.id)
  const nameOf = (id: string) => state.users.find((u) => u.id === id)?.name ?? id

  const properties = useMemo(
    () => state.properties.filter((p) => allowedPropertyIds.has(p.id)),
    [state.properties, allowedPropertyIds],
  )

  const staff = isAgencyStaff(role) || role === 'super_admin'

  return (
    <RequirePermission permission="messages.manage">
      <div className="animate-fade-in space-y-4">
        <PageHeader
          title="Messages"
          subtitle="In-app messaging with tenants and colleagues — landlords stay out of the thread."
          actions={
            staff ? (
              <Button className="min-h-11 cursor-pointer" onClick={() => setComposeOpen(true)}>
                <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                New message
              </Button>
            ) : null
          }
        />

        <div className="flex items-start gap-2 rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-ink-600">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={ICON_STROKE} />
          Tenant and maintenance conversations route to the managing agency or assigned agent.
        </div>

        {role === 'tenant' ? (
          <Card className="flex flex-wrap gap-2 p-4">
            <Input
              className="min-h-11 min-w-[200px] flex-1"
              placeholder="New subject (e.g. Leak in bathroom)"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
            />
            <Button
              className="min-h-11 cursor-pointer"
              size="sm"
              onClick={() => {
                if (!newSubject.trim() || !user.agencyId) return
                const tenancy = state.tenancies.find((t) => t.tenantUserId === user.id)
                const agentId =
                  tenancy?.agentId ??
                  state.properties.find((p) => p.agencyId === user.agencyId)?.agentId
                const thread = createThread({
                  agencyId: user.agencyId,
                  propertyId: tenancy?.propertyId ?? null,
                  applicationId: tenancy?.applicationId ?? null,
                  subject: newSubject.trim(),
                  participantIds: [user.id, agentId ?? 'u-amelia'].filter(Boolean) as string[],
                  routesTo: agentId ? 'agent' : 'agency',
                  fromUserId: user.id,
                  initialMessage: newSubject.trim(),
                })
                setActiveId(thread.id)
                setNewSubject('')
              }}
            >
              Start thread
            </Button>
          </Card>
        ) : null}

        {staff ? (
          <div className="flex flex-wrap gap-2">
            <Select
              className="min-h-11 cursor-pointer"
              value={filter}
              onChange={(e) => setFilter(e.target.value as 'all' | 'mine')}
              aria-label="Filter threads"
            >
              <option value="all">All agency threads</option>
              <option value="mine">I participate</option>
            </Select>
            <Select
              className="min-h-11 min-w-[12rem] cursor-pointer"
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              aria-label="Filter by property"
            >
              <option value="all">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-5">
          <Card className={cn('overflow-hidden lg:col-span-2', mobileShowThread && 'hidden lg:block')}>
            <ul className="divide-y divide-primary-100">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(t.id)
                      setMobileShowThread(true)
                    }}
                    className={`flex min-h-11 w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      active?.id === t.id ? 'bg-primary-50' : 'hover:bg-primary-50'
                    }`}
                  >
                    <span className="mt-0.5 rounded-lg bg-primary p-2 text-white">
                      <MessageCircle className="h-4 w-4" strokeWidth={ICON_STROKE} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{t.subject}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-400">
                        <Badge tone="info">→ {t.routesTo}</Badge>
                        {new Date(t.updatedAt).toLocaleString()}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {threads.length === 0 && (
                <li className="p-8 text-center text-sm text-ink-400">No conversations yet.</li>
              )}
            </ul>
          </Card>

          <Card
            className={cn(
              'flex min-h-[420px] flex-col lg:col-span-3',
              !mobileShowThread && 'hidden lg:flex',
            )}
          >
            {active ? (
              <>
                <div className="border-b border-primary-100 p-4">
                  <BackButton
                    label="Back to threads"
                    onClick={() => setMobileShowThread(false)}
                    className="mb-3 lg:hidden"
                  />
                  <h2 className="font-semibold text-ink">{active.subject}</h2>
                  <p className="text-xs text-ink-400">
                    Participants: {active.participantIds.map(nameOf).join(', ')} · routes to{' '}
                    {active.routesTo}
                  </p>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <p className="text-sm text-ink-400">No messages in this thread yet.</p>
                  ) : (
                    messages.map((m) => {
                      const mine = m.fromUserId === user.id
                      return (
                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                              mine ? 'bg-primary text-white' : 'bg-primary-50 text-ink'
                            }`}
                          >
                            <p className="text-[10px] opacity-70">{nameOf(m.fromUserId)}</p>
                            <p className="mt-0.5">{m.body}</p>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
                <form
                  className="flex gap-2 border-t border-primary-100 p-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!draft.trim() || !active) return
                    sendMessage(active.id, user.id, draft.trim())
                    setDraft('')
                  }}
                >
                  <Input
                    className="min-h-11"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a reply…"
                  />
                  <Button type="submit" className="min-h-11 cursor-pointer">
                    Send
                  </Button>
                </form>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-ink-400">
                Select a thread or start a new message.
              </div>
            )}
          </Card>
        </div>

        <ComposeMessageModal
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          agencyId={agencyId ?? properties[0]?.agencyId ?? ''}
          users={state.users.filter(
            (u) =>
              u.active &&
              u.role !== 'landlord' &&
              (role === 'super_admin' || u.agencyId === agencyId || u.id === user.id),
          )}
          properties={properties}
          fromUserId={user.id}
          onCreate={(input) => {
            if (input.propertyId && !canMutate(input.propertyId)) return
            const thread = createThread(input)
            setActiveId(thread.id)
            setComposeOpen(false)
          }}
        />
      </div>
    </RequirePermission>
  )
}

function ComposeMessageModal({
  open,
  onClose,
  agencyId,
  users,
  properties,
  fromUserId,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  agencyId: string
  users: { id: string; name: string; email: string }[]
  properties: { id: string; title: string }[]
  fromUserId: string
  onCreate: (input: {
    agencyId: string
    propertyId: string | null
    applicationId: string | null
    subject: string
    participantIds: string[]
    routesTo: 'agency' | 'agent'
    fromUserId: string
    initialMessage: string
  }) => void
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [participantId, setParticipantId] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setSubject('')
    setBody('')
    setParticipantId('')
    setPropertyId('')
    setError('')
  }, [open])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !body.trim() || !participantId || !agencyId) {
      setError('Subject, message, and recipient are required.')
      return
    }
    onCreate({
      agencyId,
      propertyId: propertyId || null,
      applicationId: null,
      subject: subject.trim(),
      participantIds: [fromUserId, participantId],
      routesTo: 'agency',
      fromUserId,
      initialMessage: body.trim(),
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New message"
      description="Start a conversation with someone in your agency."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="compose-msg-form">
            Send
          </Button>
        </>
      }
    >
      <form id="compose-msg-form" className="space-y-3" onSubmit={submit}>
        {error ? <p className="text-sm text-accent-600">{error}</p> : null}
        <Select
          className="min-h-11 cursor-pointer"
          value={participantId}
          onChange={(e) => setParticipantId(e.target.value)}
        >
          <option value="">Recipient…</option>
          {users
            .filter((u) => u.id !== fromUserId)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.email}
              </option>
            ))}
        </Select>
        <Select
          className="min-h-11 cursor-pointer"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
        >
          <option value="">No property (optional)</option>
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
          placeholder="Message"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </form>
    </Modal>
  )
}
