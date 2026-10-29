import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Pencil, Siren } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { isApiEnabled } from '../../lib/api/config'
import { escalateTicketApi } from '../../lib/api/escalationsApi'
import { sweetSuccess, sweetWarning } from '../../lib/sweetAlert'
import { ActionButtonRow } from '../ActionButtonRow'
import { BackButton } from '../BackButton'
import { Badge, Button, Modal, Textarea, priorityTone, statusTone } from '../ui'
import { formatAge, isOpenStatus, type PortfolioTicket } from '../maintenance/types'
import { maintenanceEditHref } from '../../pages/maintenance/MaintenanceEditPage'

const ICON_STROKE = 1.6

export function MaintenanceDetailHeader({
  item,
  canManage,
  canEdit,
  onComplete,
}: {
  item: PortfolioTicket
  canManage: boolean
  canEdit?: boolean
  onComplete: () => void
}) {
  const t = item.ticket
  const open = isOpenStatus(t.status)
  const { role } = useAuth()
  const isStaff = ['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent'].includes(role)
  const [escalating, setEscalating] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const escalate = async () => {
    setBusy(true)
    try {
      const r = await escalateTicketApi(t.id, reason.trim() || 'Escalated by staff')
      setEscalating(false)
      setReason('')
      await sweetSuccess('Escalated', `This fault is now at escalation level ${r.level}. The right people have been notified.`)
    } catch (e) {
      await sweetWarning('Could not escalate', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
              {t.title}
            </h1>
            <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
            <Badge tone={statusTone(t.status)}>{t.status}</Badge>
            {t.warrantyCovered && <Badge tone="success">Warranty</Badge>}
            {t.escalatedAt && <Badge tone="danger">Escalated</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {t.id} · {item.property.title} · {formatAge(item.ageHours)} open
          </p>
        </div>

        <ActionButtonRow className="sm:w-auto">
          {open && canManage ? (
            <Button className="min-h-11" onClick={onComplete}>
              <CheckCircle2 className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Complete work
            </Button>
          ) : null}
          {open && canEdit ? (
            <Link to={maintenanceEditHref(t.id, `/workspace/operations/maintenance/${encodeURIComponent(t.id)}`)}>
              <Button variant="secondary" className="min-h-11 cursor-pointer">
                <Pencil className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
                Edit record
              </Button>
            </Link>
          ) : null}
          {open && isStaff && isApiEnabled ? (
            <Button variant="secondary" className="min-h-11" onClick={() => setEscalating(true)}>
              <Siren className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Escalate
            </Button>
          ) : null}
          <BackButton to="/workspace/operations/maintenance" label="All maintenance" />
        </ActionButtonRow>
      </div>
      <Modal
        open={escalating}
        onClose={() => setEscalating(false)}
        title="Escalate this fault"
        description="It moves up one level and the next people in line are notified."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEscalating(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void escalate()}>
              Escalate
            </Button>
          </>
        }
      >
        <Textarea rows={3} placeholder="Why does this need attention?" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </div>
  )
}
