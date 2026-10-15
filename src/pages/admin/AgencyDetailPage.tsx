import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Building2,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { useSuiteAlert } from '../../components/alerts/SuiteAlert'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { BackButton } from '../../components/BackButton'
import { ActionButtonRow } from '../../components/ActionButtonRow'
import { AgencyCapabilityChecklist } from '../../components/admin/AgencyCapabilityChecklist'
import { ImpersonateUserButton } from '../../components/admin/ImpersonateUserButton'
import { Badge, Button, Card, Modal, PageHeader, Select, cn } from '../../components/ui'
import { ResponsiveDataList } from '../../components/data/ResponsiveDataList'
import { roleLabels } from '../../lib/permissions'
import { agencyStatusBadgeTone } from '../../lib/agencyStatus'
import { sweetWarning } from '../../lib/sweetAlert'
import { withReturnTo } from '../../lib/returnTo'
import type { Permission } from '../../types/domain'

const ICON_STROKE = 1.6

type Tab = 'overview' | 'users' | 'properties'

export default function AgencyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const alert = useSuiteAlert()
  const { state, updateAgency, cancelAgency, updateProperty, updateUser } = useStore()
  const { has } = useAuth()
  const [tab, setTab] = useState<Tab>('overview')
  const [capsOpen, setCapsOpen] = useState(false)
  const [caps, setCaps] = useState<Permission[]>([])
  const addUserHref = withReturnTo(
    `/workspace/admin/users/new?agencyId=${id ?? ''}`,
    `/workspace/admin/agencies/${id ?? ''}`,
  )
  const addPropertyHref = withReturnTo(
    `/workspace/properties/new?agencyId=${id ?? ''}`,
    `/workspace/admin/agencies/${id ?? ''}`,
  )

  const agency = state.agencies.find((a) => a.id === id)

  const users = useMemo(
    () => state.users.filter((u) => u.agencyId === id),
    [state.users, id],
  )
  const properties = useMemo(
    () => state.properties.filter((p) => p.agencyId === id),
    [state.properties, id],
  )
  const agents = users.filter(
    (u) => u.active && (u.role === 'ground_agent' || u.role === 'agent' || u.role === 'agent_admin'),
  )

  if (!agency) {
    return (
      <RequirePermission permission="platform.manage">
        <Card className="p-10 text-center">
          <p className="text-ink-500">Agency not found.</p>
          <BackButton to="/workspace/admin/agencies" label="Back to agencies" />
        </Card>
      </RequirePermission>
    )
  }

  const openCaps = () => {
    setCaps([...(agency.enabledPermissions ?? [])])
    setCapsOpen(true)
  }

  const handleDeleteAgency = async () => {
    const ok = await alert.confirmDelete({
      title: `Delete ${agency.name}?`,
      text:
        'The agency will be cancelled. Data is retained for audit, but staff lose workspace access.',
      confirmLabel: 'Delete agency',
    })
    if (!ok) return
    const result = await cancelAgency(agency.id)
    if (result.ok === false) {
      await sweetWarning('Could not delete agency', result.reason)
      return
    }
    void alert.deleted({
      title: 'Agency cancelled',
      text: `${agency.name} was cancelled.`,
    })
    navigate('/workspace/admin/agencies')
  }

  return (
    <RequirePermission permission="platform.manage">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title={agency.name}
          subtitle={`${agency.city} · ${agency.slug} · manage people, properties, and modules for this agency.`}
          actions={
            <ActionButtonRow className="sm:w-auto">
              <Button variant="secondary" className="min-h-11 cursor-pointer" onClick={openCaps}>
                <Pencil className="h-4 w-4" strokeWidth={ICON_STROKE} />
                Modules
              </Button>
              {agency.status === 'Cancelled' ? (
                <Badge tone={agencyStatusBadgeTone(agency.status)}>Cancelled</Badge>
              ) : (
                <>
                  <Select
                    className="min-h-11 cursor-pointer"
                    value={agency.status}
                    onChange={(e) =>
                      updateAgency(agency.id, { status: e.target.value as typeof agency.status })
                    }
                    aria-label="Agency status"
                  >
                    <option value="Active">Active</option>
                    <option value="Suspended">Suspended</option>
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 cursor-pointer text-accent-600"
                    onClick={() => void handleDeleteAgency()}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={ICON_STROKE} />
                    Delete agency
                  </Button>
                </>
              )}
              <BackButton to="/workspace/admin/agencies" label="All agencies" />
            </ActionButtonRow>
          }
        />

        <section className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs text-ink-500">Users</p>
            <p className="tabular text-2xl font-semibold">{users.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-500">Properties</p>
            <p className="tabular text-2xl font-semibold">{properties.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-500">Modules enabled</p>
            <p className="tabular text-2xl font-semibold">{agency.enabledPermissions?.length ?? 0}</p>
          </Card>
        </section>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'users', label: 'Users' },
              { id: 'properties', label: 'Properties' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'min-h-11 cursor-pointer rounded-2xl border px-4 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                tab === t.id
                  ? 'border-primary bg-primary text-white'
                  : 'border-primary-100 bg-white text-ink-600 hover:border-primary-200',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="font-semibold text-ink">Quick actions</h2>
              <p className="mt-1 text-sm text-ink-500">
                Add people and properties directly into this agency.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={addUserHref}>
                  <Button className="min-h-11 cursor-pointer">
                    <UserPlus className="h-4 w-4" strokeWidth={ICON_STROKE} />
                    Add user
                  </Button>
                </Link>
                <Link to={addPropertyHref}>
                  <Button
                    className="min-h-11 cursor-pointer"
                    variant="secondary"
                    disabled={!has('assets.manage') && !has('platform.manage')}
                  >
                    <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} />
                    Add property
                  </Button>
                </Link>
                <Button variant="secondary" className="min-h-11 cursor-pointer" onClick={openCaps}>
                  Edit modules
                </Button>
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="font-semibold text-ink">Hierarchy snapshot</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {[
                  ['Principal / Broker', users.filter((u) => u.role === 'client_admin').length],
                  ['Agency Administrator', users.filter((u) => u.role === 'agent_admin').length],
                  ['Full Agent', users.filter((u) => u.role === 'ground_agent').length],
                  ['Candidate / Intern', users.filter((u) => u.role === 'agent').length],
                ].map(([label, count]) => (
                  <li key={String(label)} className="flex justify-between gap-2">
                    <span className="text-ink-500">{label}</span>
                    <span className="tabular font-semibold text-ink">{count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        ) : null}

        {tab === 'users' ? (
          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-ink-400" strokeWidth={ICON_STROKE} />
                <h2 className="font-semibold text-ink">Agency users</h2>
              </div>
              <Link to={addUserHref}>
                <Button className="min-h-11 cursor-pointer">
                  <UserPlus className="h-4 w-4" strokeWidth={ICON_STROKE} />
                  Add user
                </Button>
              </Link>
            </div>
            <div className="p-4 md:p-0">
              <ResponsiveDataList
                embedded
                rows={users}
                rowKey={(u) => u.id}
                columns={[
                  {
                    key: 'person',
                    header: 'Person',
                    render: (u) => (
                      <>
                        <p className="font-medium text-ink">{u.name}</p>
                        <p className="text-xs text-ink-500">{u.email}</p>
                      </>
                    ),
                  },
                  {
                    key: 'role',
                    header: 'Role',
                    render: (u) => roleLabels[u.role],
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (u) => (
                      <Badge tone={u.active ? 'success' : 'danger'}>
                        {u.active ? 'Active' : 'Disabled'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'assigned',
                    header: 'Assigned properties',
                    render: (u) => properties.filter((p) => p.agentId === u.id).length,
                  },
                  {
                    key: 'actions',
                    header: 'Actions',
                    headerClassName: 'text-right',
                    cellClassName: 'text-right',
                    render: (u) => (
                      <div className="flex items-center justify-end gap-2">
                        <ImpersonateUserButton target={u} variant="compact" />
                        <button
                          type="button"
                          className="min-h-11 cursor-pointer rounded-xl border border-primary-100 px-3 text-xs font-semibold hover:bg-primary-50"
                          onClick={() => updateUser(u.id, { active: !u.active })}
                        >
                          {u.active ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    ),
                  },
                ]}
                renderMobileCard={(u) => (
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">{u.name}</p>
                        <p className="text-xs text-ink-500">{u.email}</p>
                        <p className="mt-1 text-xs text-ink-500">{roleLabels[u.role]}</p>
                      </div>
                      <Badge tone={u.active ? 'success' : 'danger'}>
                        {u.active ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-ink-500">
                      {properties.filter((p) => p.agentId === u.id).length} assigned properties
                    </p>
                    <div className="mt-3 flex gap-2">
                      <ImpersonateUserButton target={u} variant="compact" />
                      <button
                        type="button"
                        className="min-h-11 flex-1 cursor-pointer rounded-xl border border-primary-100 px-3 text-xs font-semibold hover:bg-primary-50"
                        onClick={() => updateUser(u.id, { active: !u.active })}
                      >
                        {u.active ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </Card>
                )}
                empty={
                  <p className="px-4 py-8 text-center text-ink-400">
                    No users yet — add a Principal, admin, or agent to get started.
                  </p>
                }
              />
            </div>
          </Card>
        ) : null}

        {tab === 'properties' ? (
          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-ink-400" strokeWidth={ICON_STROKE} />
                <h2 className="font-semibold text-ink">Agency properties</h2>
              </div>
              <Link to={addPropertyHref}>
                <Button className="min-h-11 cursor-pointer">
                  <Plus className="h-4 w-4" strokeWidth={ICON_STROKE} />
                  Add property
                </Button>
              </Link>
            </div>
            <div className="p-4 md:p-0">
              <ResponsiveDataList
                embedded
                minTableWidth="44rem"
                rows={properties}
                rowKey={(p) => p.id}
                columns={[
                  {
                    key: 'property',
                    header: 'Property',
                    render: (p) => (
                      <>
                        <p className="font-medium text-ink">{p.title}</p>
                        <p className="text-xs text-ink-500">
                          {p.suburb}, {p.city}
                        </p>
                      </>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (p) => <Badge tone="neutral">{p.status}</Badge>,
                  },
                  {
                    key: 'agent',
                    header: 'Assigned agent',
                    render: (p) => (
                      <Select
                        className="min-h-11 cursor-pointer text-xs"
                        value={p.agentId ?? ''}
                        onChange={(e) =>
                          updateProperty(p.id, { agentId: e.target.value || null })
                        }
                        aria-label={`Agent for ${p.title}`}
                      >
                        <option value="">Unassigned</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </Select>
                    ),
                  },
                  {
                    key: 'open',
                    header: 'Open',
                    headerClassName: 'text-right',
                    cellClassName: 'text-right',
                    render: (p) => (
                      <Link
                        className="font-semibold text-primary hover:underline"
                        to={`/workspace/properties/${p.id}`}
                      >
                        Open
                      </Link>
                    ),
                  },
                ]}
                renderMobileCard={(p) => (
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">{p.title}</p>
                        <p className="text-xs text-ink-500">
                          {p.suburb}, {p.city}
                        </p>
                      </div>
                      <Badge tone="neutral">{p.status}</Badge>
                    </div>
                    <div className="mt-3">
                      <Select
                        className="min-h-11 w-full cursor-pointer text-xs"
                        value={p.agentId ?? ''}
                        onChange={(e) =>
                          updateProperty(p.id, { agentId: e.target.value || null })
                        }
                        aria-label={`Agent for ${p.title}`}
                      >
                        <option value="">Unassigned</option>
                        {agents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Link
                      className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
                      to={`/workspace/properties/${p.id}`}
                    >
                      Open property
                    </Link>
                  </Card>
                )}
                empty={
                  <p className="px-4 py-8 text-center text-ink-400">
                    No properties yet — create one and assign an agent.
                  </p>
                }
              />
            </div>
          </Card>
        ) : null}

        <Modal
          open={capsOpen}
          onClose={() => setCapsOpen(false)}
          title="Agency modules"
          description="Modules this agency’s staff may use (intersected with each user’s role)."
          size="lg"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setCapsOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  updateAgency(agency.id, { enabledPermissions: caps })
                  setCapsOpen(false)
                }}
              >
                Save modules
              </Button>
            </>
          }
        >
          <AgencyCapabilityChecklist value={caps} onChange={setCaps} />
        </Modal>
      </div>
    </RequirePermission>
  )
}
