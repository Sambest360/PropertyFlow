import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  Pencil,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { AgencyCapabilityChecklist } from '../../components/admin/AgencyCapabilityChecklist'
import { ImpersonateUserButton } from '../../components/admin/ImpersonateUserButton'
import { Badge, Button, Card, Modal, PageHeader, Select, cn } from '../../components/ui'
import { roleLabels } from '../../lib/permissions'
import { withReturnTo } from '../../lib/returnTo'
import type { Permission } from '../../types/domain'

const ICON_STROKE = 1.6

type Tab = 'overview' | 'users' | 'properties'

export default function AgencyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state, updateAgency, updateProperty, updateUser } = useStore()
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
          <Button className="mt-4 min-h-11 cursor-pointer" onClick={() => navigate('/workspace/admin/agencies')}>
            Back to agencies
          </Button>
        </Card>
      </RequirePermission>
    )
  }

  const openCaps = () => {
    setCaps([...(agency.enabledPermissions ?? [])])
    setCapsOpen(true)
  }

  return (
    <RequirePermission permission="platform.manage">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title={agency.name}
          subtitle={`${agency.city} · ${agency.slug} · manage people, properties, and modules for this agency.`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="min-h-11 cursor-pointer"
                onClick={() => navigate('/workspace/admin/agencies')}
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={ICON_STROKE} />
                All agencies
              </Button>
              <Button variant="secondary" className="min-h-11 cursor-pointer" onClick={openCaps}>
                <Pencil className="h-4 w-4" strokeWidth={ICON_STROKE} />
                Modules
              </Button>
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
            </div>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-[11px] uppercase text-ink-400">
                  <tr>
                    <th className="px-4 py-3">Person</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Assigned properties</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-50">
                  {users.map((u) => {
                    const assigned = properties.filter((p) => p.agentId === u.id).length
                    return (
                      <tr key={u.id} className="hover:bg-primary-50/40">
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">{u.name}</p>
                          <p className="text-xs text-ink-500">{u.email}</p>
                        </td>
                        <td className="px-3 py-3">{roleLabels[u.role]}</td>
                        <td className="px-3 py-3">
                          <Badge tone={u.active ? 'success' : 'danger'}>
                            {u.active ? 'Active' : 'Disabled'}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 tabular">{assigned}</td>
                        <td className="px-4 py-3 text-right">
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
                        </td>
                      </tr>
                    )
                  })}
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-ink-400">
                        No users yet — add a Principal, admin, or agent to get started.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-left text-sm">
                <thead className="text-[11px] uppercase text-ink-400">
                  <tr>
                    <th className="px-4 py-3">Property</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Assigned agent</th>
                    <th className="px-4 py-3 text-right">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-50">
                  {properties.map((p) => (
                    <tr key={p.id} className="hover:bg-primary-50/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{p.title}</p>
                        <p className="text-xs text-ink-500">
                          {p.suburb}, {p.city}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone="neutral">{p.status}</Badge>
                      </td>
                      <td className="px-3 py-3">
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
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          className="font-semibold text-primary hover:underline"
                          to={`/workspace/properties/${p.id}`}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {properties.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-ink-400">
                        No properties yet — create one and assign an agent.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
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
