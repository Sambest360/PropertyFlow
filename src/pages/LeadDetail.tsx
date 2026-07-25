import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope, useAuth } from '../context/AuthContext'
import { isFieldAgent } from '../lib/permissions'
import { RequirePermission } from '../components/RequirePermission'
import { Badge, Button, Input, Select, cn, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'

const ICON_STROKE = 1.6

const LEAD_STAGES = [
  'New Lead',
  'Contacted',
  'Viewing Scheduled',
  'Viewing Completed',
  'Application Submitted',
  'Offer Sent',
  'Deposit Paid',
  'Lease Signed',
  'Sale Completed',
] as const

export default function LeadDetail() {
  const { id } = useParams()
  const { state, updateLeadStage, addActivity } = useStore()
  const { user, has } = useAuth()
  const { scopeAgency, scopeAgent, role } = useAgencyScope()
  const [note, setNote] = useState('')

  const lead = state.leads.find((l) => l.id === id)
  const property = lead ? state.properties.find((p) => p.id === lead.propertyId) : null
  const agent = lead?.agentId ? state.users.find((u) => u.id === lead.agentId) : null

  const inScope = useMemo(() => {
    if (!lead) return false
    if (!scopeAgency(lead.agencyId)) return false
    if (isFieldAgent(role) && !scopeAgent(lead.agentId)) return false
    return true
  }, [lead, scopeAgency, scopeAgent, role])

  if (!lead) return <Navigate to="/workspace/sales/crm" replace />
  if (!inScope) return <Navigate to="/workspace/sales/crm" replace />

  const canManage = has('leads.manage')
  const propertyTitle = property?.title ?? lead.propertyId
  const propertySuburb = property ? `${property.suburb}, ${property.city}` : '—'

  const rows = [
    { label: 'Property', value: propertyTitle },
    { label: 'Area', value: propertySuburb },
    { label: 'Agent', value: agent?.name ?? 'Unassigned' },
    { label: 'Channel', value: lead.channel },
    { label: 'Updated', value: lead.updatedAt, tabular: true },
  ]

  return (
    <RequirePermission permission="leads.view">
      <div className="animate-fade-in w-full">
        <Link
          to="/workspace/sales/crm"
          className="mb-4 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-500 transition-colors duration-200 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          All leads
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {lead.name}
          </h1>
          <Badge tone={statusTone(lead.stage)}>{lead.stage}</Badge>
          <Badge tone={lead.type === 'Buy' ? 'accent' : 'info'}>{lead.type}</Badge>
        </div>
        <p className="mt-1 tabular text-sm text-ink-500">{lead.id}</p>

        <p className="mt-6 font-display text-4xl font-semibold tabular tracking-tight text-ink">
          {formatZAR(lead.value)}
        </p>
        <p className="mt-1 text-sm text-ink-500">
          {lead.email} · {lead.phone}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={() => window.open(`tel:${lead.phone}`, '_self')}
          >
            <Phone className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Call
          </Button>
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={() => window.open(`mailto:${lead.email}`, '_self')}
          >
            <Mail className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Email
          </Button>
          <Button
            variant="secondary"
            className="min-h-11"
            onClick={() =>
              window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}`, '_blank', 'noopener')
            }
          >
            <MessageCircle className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            WhatsApp
          </Button>
        </div>

        <dl className="mt-6 divide-y divide-primary-50 border-y border-primary-50">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4 py-3">
              <dt className="shrink-0 text-sm text-ink-500">{row.label}</dt>
              <dd
                className={cn(
                  'min-w-0 text-right text-sm font-medium text-ink',
                  row.tabular && 'tabular',
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <Link
          to={`/workspace/properties/${lead.propertyId}`}
          className="mt-6 inline-flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-primary-100 bg-primary-50/50 px-3 text-sm font-semibold text-primary transition-colors duration-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MapPin className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">{propertyTitle}</span>
        </Link>

        {canManage && (
          <label className="mt-6 block text-xs font-semibold text-ink-500">
            Update stage
            <Select
              className="mt-1 min-h-11 w-full"
              value={lead.stage}
              onChange={(e) => updateLeadStage(lead.id, e.target.value)}
            >
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </label>
        )}

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Notes</p>
          <p className="mt-2 text-sm text-ink-600">{lead.notes || 'No notes yet.'}</p>
          {canManage && (
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault()
                if (!note.trim()) return
                addActivity(`Note on ${lead.name}: ${note.trim()}`, user.name, lead.agencyId)
                setNote('')
              }}
            >
              <Input
                className="min-h-11 flex-1"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add activity note…"
              />
              <Button type="submit" className="min-h-11">
                Log note
              </Button>
            </form>
          )}
        </div>
      </div>
    </RequirePermission>
  )
}
