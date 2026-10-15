import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { TICKET_NOT_SAVED_MESSAGE } from '../../lib/maintenanceApi'
import {
  COMPLAINT_SEVERITY_TO_PRIORITY,
  tenantPriorityToApi,
  type ComplaintSeverity,
} from '../../lib/tenantTicketPriority'
import type { TenantPortalState } from '../../hooks/useTenantPortalState'
import { SmartTextEditor } from '../../components/editor/SmartTextEditor'
import { Badge, Button, Card, Input, Select, statusTone } from '../../components/ui'

const COMPLAINT_PREFIX = 'Complaint:'

export function TenantComplaintsView({ portal }: { portal: TenantPortalState }) {
  const { state, createMaintenanceTicket } = useStore()
  const [subject, setSubject] = useState('')
  const [details, setDetails] = useState('')
  const [severity, setSeverity] = useState<ComplaintSeverity>('Medium')
  const [done, setDone] = useState('')

  const complaints = portal.tickets.filter((t) => t.title.startsWith(COMPLAINT_PREFIX))
  const openCount = complaints.filter((t) => t.status !== 'Completed').length

  const submitComplaint = async (e: FormEvent) => {
    e.preventDefault()
    if (!subject.trim() || !details.trim()) return
    const propId = portal.tenancy?.propertyId ?? portal.property?.id
    if (!propId) {
      setDone('No property linked to your tenancy yet.')
      return
    }
    const prop = state.properties.find((p) => p.id === propId)
    if (!prop?.unitId) {
      setDone('No unit linked to your occupancy yet.')
      return
    }
    const result = createMaintenanceTicket({
      actorUserId: portal.user.id,
      propertyId: propId,
      request: {
        unit_id: prop.unitId,
        internal_asset_id: null,
        category_key: 'GENERAL',
        // Urgent severity is filed as Emergency so it escalates.
        priority: tenantPriorityToApi(COMPLAINT_SEVERITY_TO_PRIORITY[severity]),
        title: `${COMPLAINT_PREFIX} ${subject.trim()}`,
        description: `Tenant complaint submitted via portal.\n\n${details.trim()}\n\nRouted to managing agency for review — not the landlord.`,
      },
    })
    if (result.status === 'ERROR') {
      setDone(result.error)
      return
    }
    if (!(await result.saved)) {
      setDone(TICKET_NOT_SAVED_MESSAGE)
      return
    }
    setDone(`Complaint logged as ${result.ticket_id}. Your agency will follow up in-app.`)
    setSubject('')
    setDetails('')
  }

  if (!portal.occupancyReady) {
    return (
      <Card className="p-6 text-sm text-ink-500">
        Formal complaints unlock once you are approved and occupying a property.{' '}
        <Link className="font-semibold text-primary" to="/workspace/portals/tenant/applications">
          View applications
        </Link>
      </Card>
    )
  }

  return (
    <div className="space-y-5" data-tip-target="tenant-complaints">
      <div>
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
          <AlertTriangle className="h-5 w-5 text-accent" strokeWidth={1.6} aria-hidden />
          Complaints
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Escalate service or conduct issues to your managing agency. For urgent repairs, use{' '}
          <Link className="font-semibold text-primary" to="/workspace/portals/tenant/maintenance">
            Maintenance
          </Link>{' '}
          instead.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold text-ink">Submit a complaint</h3>
          <form className="mt-3 space-y-3" onSubmit={submitComplaint}>
            <Input
              placeholder="Subject (e.g. Noise from neighbouring unit)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <SmartTextEditor variant="operational" value={details} onChange={setDetails} />
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as typeof severity)}>
              {(Object.keys(COMPLAINT_SEVERITY_TO_PRIORITY) as ComplaintSeverity[]).map((s) => (
                <option key={s} value={s}>
                  {s} severity
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm" className="min-h-11 cursor-pointer">
              Submit complaint
            </Button>
            {done ? <p className="text-xs text-ink-500">{done}</p> : null}
          </form>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-ink">Your complaints</h3>
            <Badge tone={openCount > 0 ? 'warning' : 'neutral'}>{openCount} open</Badge>
          </div>
          <ul className="mt-3 space-y-2">
            {complaints.slice(0, 8).map((t) => (
              <li
                key={t.id}
                className="rounded-xl border border-primary-100 px-3 py-2 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-ink">
                    {t.title.replace(COMPLAINT_PREFIX, '').trim()}
                  </p>
                  <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-400">{t.id}</p>
              </li>
            ))}
            {complaints.length === 0 ? (
              <li className="text-sm text-ink-400">No complaints on file.</li>
            ) : null}
          </ul>
        </Card>
      </div>
    </div>
  )
}
