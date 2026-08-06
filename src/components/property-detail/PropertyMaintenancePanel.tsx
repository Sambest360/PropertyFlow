import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Plus, Search, Wrench } from 'lucide-react'
import type { AppUser, MaintenanceTicket } from '../../types/domain'
import { Badge, Button, Card, Input, Modal, Select, Textarea, cn, priorityTone, statusTone } from '../ui'
import { formatZAR } from '../../data/seed'
import { useSuiteAlert } from '../alerts/SuiteAlert'
import { useAgentDisplay } from '../../hooks/useAgentDisplay'
import { CompleteTicketModal } from '../maintenance/CompleteTicketModal'
import { ListPagination, paginate } from './ListPagination'
import { ICON_STROKE } from './types'

const PRIORITIES: MaintenanceTicket['priority'][] = [
  'Low',
  'Medium',
  'High',
  'Urgent',
  'Emergency',
]
const STATUSES: MaintenanceTicket['status'][] = [
  'Requested',
  'In Progress',
  'Awaiting Parts',
  'Cancelled',
]

type TicketDraft = {
  title: string
  description: string
  priority: MaintenanceTicket['priority']
  categoryKey: string
  contractorId: string
  assignedAgentId: string
  cost: string
}

export function PropertyMaintenancePanel({
  tickets,
  unitId,
  agents,
  contractors,
  canManage,
  onCreate,
  onUpdate,
  onRemove,
  onComplete,
}: {
  tickets: MaintenanceTicket[]
  unitId: string | null | undefined
  agents: AppUser[]
  contractors: AppUser[]
  canManage: boolean
  onCreate: (draft: {
    title: string
    description: string
    priority: MaintenanceTicket['priority']
    categoryKey: string
    contractorId: string | null
    assignedAgentId: string | null
  }) => void
  onUpdate: (id: string, patch: Partial<MaintenanceTicket>) => void
  onRemove: (id: string) => boolean
  onComplete?: (
    ticketId: string,
    fields: {
      cost: number
      workNotes: string
      contractorId: string
      photos: number
      condition: string
    },
  ) => string | null
}) {
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [completeId, setCompleteId] = useState<string | null>(null)
  const alert = useSuiteAlert()
  const { label: agentLabel } = useAgentDisplay()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<TicketDraft>({
    title: '',
    description: '',
    priority: 'Medium',
    categoryKey: 'GENERAL',
    contractorId: '',
    assignedAgentId: '',
    cost: '0',
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tickets
    return tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        t.priority.toLowerCase().includes(q) ||
        t.assetLabel.toLowerCase().includes(q),
    )
  }, [tickets, query])

  useEffect(() => {
    setPage(1)
  }, [query])

  const paged = useMemo(() => paginate(filtered, page), [filtered, page])

  useEffect(() => {
    if (page !== paged.page) setPage(paged.page)
  }, [page, paged.page])

  const openCreate = () => {
    setEditingId(null)
    setDraft({
      title: '',
      description: '',
      priority: 'Medium',
      categoryKey: 'GENERAL',
      contractorId: '',
      assignedAgentId: agents[0]?.id ?? '',
      cost: '0',
    })
    setModalOpen(true)
  }

  const openEdit = (t: MaintenanceTicket) => {
    setEditingId(t.id)
    setDraft({
      title: t.title,
      description: t.description,
      priority: t.priority,
      categoryKey: t.categoryKey ?? 'GENERAL',
      contractorId: t.contractorId ?? '',
      assignedAgentId: t.assignedAgentId ?? '',
      cost: String(t.cost ?? 0),
    })
    setModalOpen(true)
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-ink-500" strokeWidth={ICON_STROKE} aria-hidden />
          <h2 className="font-semibold text-ink">Maintenance</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              strokeWidth={ICON_STROKE}
              aria-hidden
            />
            <Input
              className="min-h-11 pl-9"
              placeholder="Filter maintenance…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {canManage && unitId && (
            <Button className="min-h-11" onClick={openCreate}>
              <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
              Log maintenance
            </Button>
          )}
        </div>
      </div>

      {!unitId && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Link a unit to create maintenance from this property.
        </p>
      )}

      <ul className="space-y-2">
        {paged.items.map((t) => {
          const open = expandedId === t.id
          const contractor = contractors.find((c) => c.id === t.contractorId)
          const agent = agents.find((a) => a.id === t.assignedAgentId)
          const assignedAgent = agentLabel(t.assignedAgentId, agent?.name, '—')
          const canDelete = canManage && t.status === 'Requested'
          return (
            <li
              key={t.id}
              className={cn(
                'overflow-hidden rounded-2xl border',
                open ? 'border-primary-200 bg-primary-50' : 'border-primary-100 bg-white',
              )}
            >
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : t.id)}
                aria-expanded={open}
                className="flex w-full min-h-11 cursor-pointer items-center gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{t.title}</span>
                  <span className="text-xs text-ink-500">{t.assetLabel}</span>
                </span>
                <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
                <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-ink-400 transition-transform duration-200',
                    open && 'rotate-180',
                  )}
                  strokeWidth={ICON_STROKE}
                  aria-hidden
                />
              </button>
              {open && (
                <div className="space-y-3 border-t border-primary-100/80 bg-white px-4 py-4">
                  <p className="text-sm text-ink-600">{t.description}</p>
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-ink-400">Contractor</dt>
                      <dd className="font-medium">{contractor?.name ?? 'Unassigned'}</dd>
                    </div>
                    {assignedAgent ? (
                      <div>
                        <dt className="text-xs text-ink-400">Assigned agent</dt>
                        <dd className="font-medium">{assignedAgent}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-xs text-ink-400">Cost</dt>
                      <dd className="font-medium tabular">{formatZAR(t.cost)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink-400">Opened</dt>
                      <dd className="font-medium tabular">{t.openedAt}</dd>
                    </div>
                  </dl>
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      {t.status !== 'Completed' && t.status !== 'Cancelled' && (
                        <Select
                          className="min-h-11"
                          value={t.status}
                          onChange={(e) =>
                            onUpdate(t.id, { status: e.target.value as MaintenanceTicket['status'] })
                          }
                        >
                          {STATUSES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </Select>
                      )}
                      {t.status !== 'Completed' && t.status !== 'Cancelled' && onComplete && (
                        <Button
                          className="min-h-11"
                          onClick={() => setCompleteId(t.id)}
                        >
                          Complete work…
                        </Button>
                      )}
                      <Button variant="secondary" className="min-h-11" onClick={() => openEdit(t)}>
                        Edit details
                      </Button>
                      {canDelete && (
                        <Button
                          variant="danger"
                          className="min-h-11"
                          onClick={async () => {
                            const ok = await alert.confirmDelete({
                              title: 'Delete maintenance?',
                              text: `“${t.title}” has not started yet and will be removed.`,
                              confirmLabel: 'Delete maintenance',
                            })
                            if (!ok) return
                            if (onRemove(t.id) && expandedId === t.id) setExpandedId(null)
                            await alert.deleted({
                              title: 'Maintenance deleted',
                              text: `“${t.title}” has been deleted.`,
                            })
                          }}
                        >
                          Delete maintenance
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
        {!filtered.length && (
          <li className="py-8 text-center text-sm text-ink-500">No maintenance yet.</li>
        )}
      </ul>

      <ListPagination
        page={paged.page}
        totalPages={paged.totalPages}
        total={paged.total}
        pageSize={paged.pageSize}
        onPageChange={setPage}
        label="maintenance"
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Edit maintenance' : 'Log maintenance'}
        description="Capture priority, description, and assign a maintenance contractor."
        size="lg"
        footer={
          <>
            <Button variant="secondary" className="min-h-11" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="min-h-11"
              disabled={!draft.title.trim()}
              onClick={() => {
                if (editingId) {
                  onUpdate(editingId, {
                    title: draft.title.trim(),
                    description: draft.description.trim(),
                    priority: draft.priority,
                    categoryKey: draft.categoryKey,
                    contractorId: draft.contractorId || null,
                    assignedAgentId: draft.assignedAgentId || null,
                    cost: Number(draft.cost) || 0,
                  })
                } else {
                  onCreate({
                    title: draft.title.trim(),
                    description: draft.description.trim() || `Logged from property desk`,
                    priority: draft.priority,
                    categoryKey: draft.categoryKey,
                    contractorId: draft.contractorId || null,
                    assignedAgentId: draft.assignedAgentId || null,
                  })
                }
                setModalOpen(false)
              }}
            >
              {editingId ? 'Save changes' : 'Create maintenance'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
            Title
            <Input
              className="mt-1 min-h-11"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
            Description
            <Textarea
              className="mt-1 min-h-24"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Priority
            <Select
              className="mt-1 min-h-11 w-full"
              value={draft.priority}
              onChange={(e) =>
                setDraft({ ...draft, priority: e.target.value as MaintenanceTicket['priority'] })
              }
            >
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Category
            <Select
              className="mt-1 min-h-11 w-full"
              value={draft.categoryKey}
              onChange={(e) => setDraft({ ...draft, categoryKey: e.target.value })}
            >
              {['GENERAL', 'APPLIANCE_FAILURE', 'ELECTRICAL', 'PLUMBING', 'HVAC', 'STRUCTURAL'].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </Select>
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Maintenance person
            <Select
              className="mt-1 min-h-11 w-full"
              value={draft.contractorId}
              onChange={(e) => setDraft({ ...draft, contractorId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-xs font-medium text-ink-500">
            Assigned agent
            <Select
              className="mt-1 min-h-11 w-full"
              value={draft.assignedAgentId}
              onChange={(e) => setDraft({ ...draft, assignedAgentId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </label>
          {editingId && (
            <label className="block text-xs font-medium text-ink-500 sm:col-span-2">
              Cost (ZAR)
              <Input
                type="number"
                className="mt-1 min-h-11 tabular"
                value={draft.cost}
                onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
              />
            </label>
          )}
        </div>
      </Modal>

      <CompleteTicketModal
        open={Boolean(completeId)}
        ticket={tickets.find((t) => t.id === completeId) ?? null}
        contractors={contractors}
        onClose={() => setCompleteId(null)}
        onComplete={(fields) => {
          if (!completeId || !onComplete) return 'Completion is not available.'
          const err = onComplete(completeId, fields)
          if (err) return err
          setCompleteId(null)
          return null
        }}
      />
    </Card>
  )
}
