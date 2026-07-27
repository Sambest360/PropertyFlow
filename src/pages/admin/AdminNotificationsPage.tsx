import { useMemo, useState, type FormEvent } from 'react'
import { BellRing, Send } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAgencyScope, useAuth } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { Badge, Button, Card, Input, PageHeader, Select, Textarea } from '../../components/ui'
import { isAgencyStaff } from '../../lib/permissions'

const ICON_STROKE = 1.6

export default function AdminNotificationsPage() {
  const { state, broadcastNotification } = useStore()
  const { user, has } = useAuth()
  const { agencyId, scopeAgency } = useAgencyScope()
  const isPlatform = has('platform.manage')

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')
  const [audience, setAudience] = useState<'everyone' | 'agency' | 'person'>(
    isPlatform ? 'agency' : 'agency',
  )
  const [targetAgencyId, setTargetAgencyId] = useState(agencyId ?? state.agencies[0]?.id ?? '')
  const [targetUserId, setTargetUserId] = useState('')
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')

  const people = useMemo(() => {
    return state.users
      .filter((u) => u.active)
      .filter((u) => {
        if (isPlatform) return true
        // Agency senders: office network only (staff in their agency)
        return scopeAgency(u.agencyId) && isAgencyStaff(u.role)
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [state.users, isPlatform, scopeAgency])

  const history = useMemo(() => {
    return state.notificationBroadcasts.filter((b) => {
      if (isPlatform) return true
      if (b.audience === 'everyone') return false
      if (b.audience === 'agency') return b.agencyId === agencyId
      if (b.audience === 'person') {
        const u = state.users.find((x) => x.id === b.userId)
        return u ? scopeAgency(u.agencyId) : false
      }
      return false
    })
  }, [state.notificationBroadcasts, isPlatform, agencyId, state.users, scopeAgency])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setFlash('')
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required.')
      return
    }
    if (audience === 'agency' && !targetAgencyId) {
      setError('Select an agency.')
      return
    }
    if (audience === 'person' && !targetUserId) {
      setError('Select a person.')
      return
    }
    if (!isPlatform && audience === 'everyone') {
      setError('Only Super Admin can broadcast to everyone.')
      return
    }
    if (!isPlatform && audience === 'agency' && targetAgencyId !== agencyId) {
      setError('You can only broadcast to your own agency.')
      return
    }
    if (!isPlatform && audience === 'person') {
      const target = state.users.find((u) => u.id === targetUserId)
      if (!target || target.agencyId !== agencyId || !isAgencyStaff(target.role)) {
        setError('You can only notify staff in your own agency.')
        return
      }
    }
    const lockedAgencyId = isPlatform ? targetAgencyId : (agencyId ?? targetAgencyId)
    const result = broadcastNotification({
      title: title.trim(),
      body: body.trim(),
      link: link.trim() || undefined,
      audience,
      agencyId: audience === 'agency' ? lockedAgencyId : null,
      userId: audience === 'person' ? targetUserId : null,
      createdByUserId: user.id,
    })
    if (result.recipientCount === 0) {
      setError('Broadcast was blocked — check audience is within your agency.')
      return
    }
    setFlash(`Sent to ${result.recipientCount} recipient${result.recipientCount === 1 ? '' : 's'}.`)
    setTitle('')
    setBody('')
    setLink('')
  }

  return (
    <RequirePermission anyOf={['notifications.broadcast', 'platform.manage']}>
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Broadcast notifications"
          subtitle={
            isPlatform
              ? 'Push an in-app notification to everyone, one agency, or a specific person.'
              : 'Notify everyone in your agency, or a specific teammate.'
          }
        />

        <div className="grid gap-5 xl:grid-cols-2">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Send className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} />
              <h2 className="font-semibold text-ink">Compose</h2>
            </div>
            <form className="space-y-3" onSubmit={submit}>
              {error ? <p className="text-sm text-accent-600">{error}</p> : null}
              {flash ? <p className="text-sm text-primary">{flash}</p> : null}
              <Input
                className="min-h-11"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Textarea
                placeholder="Message body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
              />
              <Input
                className="min-h-11"
                placeholder="Optional link (e.g. /workspace/operations/payments)"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
              <Select
                className="min-h-11 cursor-pointer"
                value={audience}
                onChange={(e) => setAudience(e.target.value as typeof audience)}
                aria-label="Audience"
              >
                {isPlatform ? <option value="everyone">Everyone</option> : null}
                <option value="agency">{isPlatform ? 'Specific agency' : 'My agency'}</option>
                <option value="person">
                  {isPlatform ? 'Specific person' : 'Person in my agency'}
                </option>
              </Select>
              {audience === 'agency' ? (
                <Select
                  className="min-h-11 cursor-pointer"
                  value={isPlatform ? targetAgencyId : (agencyId ?? targetAgencyId)}
                  onChange={(e) => setTargetAgencyId(e.target.value)}
                  disabled={!isPlatform}
                  aria-label="Agency"
                >
                  {state.agencies
                    .filter((a) => isPlatform || a.id === agencyId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </Select>
              ) : null}
              {audience === 'person' ? (
                <Select
                  className="min-h-11 cursor-pointer"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                >
                  <option value="">{isPlatform ? 'Select person…' : 'Select teammate…'}</option>
                  {people.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.email}
                    </option>
                  ))}
                </Select>
              ) : null}
              <Button type="submit" className="min-h-11 cursor-pointer">
                <BellRing className="h-4 w-4" strokeWidth={ICON_STROKE} />
                Send notification
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 font-semibold text-ink">Recent broadcasts</h2>
            {history.length === 0 ? (
              <p className="text-sm text-ink-500">No broadcasts yet.</p>
            ) : (
              <ul className="max-h-[28rem] space-y-3 overflow-y-auto">
                {history.map((b) => (
                  <li key={b.id} className="rounded-2xl border border-primary-100 bg-primary-50/40 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink">{b.title}</p>
                        <p className="mt-1 text-sm text-ink-500">{b.body}</p>
                      </div>
                      <Badge tone="neutral">{b.audience}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-ink-400">
                      {b.recipientCount} recipients · {new Date(b.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </RequirePermission>
  )
}
