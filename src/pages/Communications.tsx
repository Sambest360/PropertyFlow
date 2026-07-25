import { useMemo, useState } from 'react'
import { MessageCircle, Shield } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope, useAuth } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { Badge, Button, Card, Input, PageHeader } from '../components/ui'

export default function Communications() {
  const { state, sendMessage, createThread } = useStore()
  const { user, role } = useAuth()
  const { scopeAgency } = useAgencyScope()
  const [draft, setDraft] = useState('')
  const [newSubject, setNewSubject] = useState('')

  const threads = useMemo(() => {
    return state.threads.filter((t) => {
      if (role === 'tenant') return t.participantIds.includes(user.id)
      if (role === 'landlord') return false
      return scopeAgency(t.agencyId)
    })
  }, [state.threads, role, user.id, scopeAgency])

  const [activeId, setActiveId] = useState(threads[0]?.id ?? '')
  const active = threads.find((t) => t.id === activeId) ?? threads[0]
  const messages = state.messages.filter((m) => m.threadId === active?.id)

  const nameOf = (id: string) => state.users.find((u) => u.id === id)?.name ?? id

  return (
    <RequirePermission permission="messages.manage">
      <div className="animate-fade-in">
        <PageHeader
          title="Communication hub"
          subtitle="Tenants and applicants message the agency or assigned agent only — landlords are never in the thread."
        />

        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-ink-600">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Day-to-day tenant communication and maintenance requests route to the managing agency/agent. Landlords see property and payment performance only.
        </div>

        {role === 'tenant' && (
          <Card className="mb-4 flex flex-wrap gap-2 p-4">
            <Input
              className="min-w-[200px] flex-1"
              placeholder="New subject (e.g. Leak in bathroom)"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() => {
                if (!newSubject.trim() || !user.agencyId) return
                const tenancy = state.tenancies.find((t) => t.tenantUserId === user.id)
                const agentId = tenancy?.agentId ?? state.properties.find((p) => p.agencyId === user.agencyId)?.agentId
                const thread = createThread({
                  agencyId: user.agencyId,
                  propertyId: tenancy?.propertyId ?? null,
                  applicationId: tenancy?.applicationId ?? null,
                  subject: newSubject.trim(),
                  participantIds: [user.id, agentId ?? 'u-amelia', 'u-amelia'].filter(Boolean) as string[],
                  routesTo: agentId ? 'agent' : 'agency',
                  fromUserId: user.id,
                  initialMessage: newSubject.trim(),
                })
                setActiveId(thread.id)
                setNewSubject('')
              }}
            >
              Start thread with agency
            </Button>
          </Card>
        )}

        <div className="grid gap-5 lg:grid-cols-5">
          <Card className="overflow-hidden lg:col-span-2">
            <ul className="divide-y divide-primary-100">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition ${active?.id === t.id ? 'bg-primary-50' : 'hover:bg-primary-50'}`}
                  >
                    <span className="mt-0.5 rounded-lg bg-primary p-2 text-white">
                      <MessageCircle className="h-4 w-4" />
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
              {threads.length === 0 && <li className="p-6 text-sm text-ink-400">No conversations yet.</li>}
            </ul>
          </Card>

          <Card className="flex min-h-[420px] flex-col lg:col-span-3">
            {active ? (
              <>
                <div className="border-b border-primary-100 p-4">
                  <h2 className="font-semibold text-ink">{active.subject}</h2>
                  <p className="text-xs text-ink-400">
                    Participants: {active.participantIds.map(nameOf).join(', ')} · routes to {active.routesTo}
                  </p>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.map((m) => {
                    const mine = m.fromUserId === user.id
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-primary text-white' : 'bg-primary-50 text-ink'}`}>
                          <p className="text-[10px] opacity-70">{nameOf(m.fromUserId)}</p>
                          <p className="mt-0.5">{m.body}</p>
                        </div>
                      </div>
                    )
                  })}
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
                  <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a reply…" />
                  <Button type="submit">Send</Button>
                </form>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-ink-400">Select a thread</div>
            )}
          </Card>
        </div>
      </div>
    </RequirePermission>
  )
}
