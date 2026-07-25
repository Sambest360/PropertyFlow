import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Plus, Shield, UserPlus } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { Badge, Button, Card, Input, PageHeader, Select } from '../components/ui'
import { roleLabels } from '../lib/permissions'
import type { Role as RoleType } from '../types/domain'

const roles: RoleType[] = [
  'super_admin',
  'client_admin',
  'agent_admin',
  'ground_agent',
  'landlord',
  'tenant',
  'contractor',
]

export default function TenantsAdmin() {
  const { state, createAgency, createUser, assignRole, updateAgency, updateUser, resetDemo } = useStore()
  const { user } = useAuth()
  const [agencyForm, setAgencyForm] = useState({ name: '', slug: '', city: '' })
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    role: 'ground_agent' as RoleType,
    agencyId: state.agencies[0]?.id ?? '',
  })

  const agencyName = useMemo(() => Object.fromEntries(state.agencies.map((a) => [a.id, a.name])), [state.agencies])

  return (
    <RequirePermission permission="platform.manage">
      <div className="animate-fade-in">
        <PageHeader
          title="Platform · Agencies & access"
          subtitle="Provision tenants, assign roles, reset demo data. Billing lives under Platform → Billing."
          actions={
            <>
              <Link to="/workspace/platform/billing">
                <Button variant="secondary">Open SaaS billing</Button>
              </Link>
              <Button variant="secondary" onClick={resetDemo}>
                Reset demo data
              </Button>
            </>
          }
        />

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs text-ink-500">Agencies</p>
            <p className="tabular text-2xl font-semibold">{state.agencies.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-500">Users</p>
            <p className="tabular text-2xl font-semibold">{state.users.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-ink-500">Active subscriptions</p>
            <p className="tabular text-2xl font-semibold">
              {state.clientSubscriptions.filter((s) => s.status === 'ACTIVE').length}
            </p>
          </Card>
        </div>

        <div className="mb-6 rounded-2xl border border-primary-100 bg-primary-50 p-4 text-sm text-ink">
          Signed in as <strong>{user.name}</strong> · Super Admin. Switch demo users in the header to see each role’s
          different dashboard and navigation.
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-ink-500" />
              <h2 className="font-semibold text-ink">Main clients (agencies)</h2>
            </div>
            <form
              className="mb-4 grid gap-2 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (!agencyForm.name.trim()) return
                createAgency({
                  name: agencyForm.name.trim(),
                  slug: agencyForm.slug.trim() || agencyForm.name.toLowerCase().replace(/\s+/g, '-'),
                  city: agencyForm.city.trim() || 'Johannesburg',
                })
                setAgencyForm({ name: '', slug: '', city: '' })
              }}
            >
              <Input placeholder="Agency name" value={agencyForm.name} onChange={(e) => setAgencyForm({ ...agencyForm, name: e.target.value })} />
              <Input placeholder="Slug" value={agencyForm.slug} onChange={(e) => setAgencyForm({ ...agencyForm, slug: e.target.value })} />
              <div className="flex gap-2">
                <Input placeholder="City" value={agencyForm.city} onChange={(e) => setAgencyForm({ ...agencyForm, city: e.target.value })} />
                <Button type="submit" size="sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </form>
            <ul className="divide-y divide-primary">
              {state.agencies.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-ink">{a.name}</p>
                    <p className="text-xs text-ink-500">
                      {a.city} · {a.slug} · {state.properties.filter((p) => p.agencyId === a.id).length} assets ·{' '}
                      {state.users.filter((u) => u.agencyId === a.id).length} users
                    </p>
                  </div>
                  <Select
                    value={a.status}
                    onChange={(e) => updateAgency(a.id, { status: e.target.value as 'Active' | 'Suspended' })}
                  >
                    <option>Active</option>
                    <option>Suspended</option>
                  </Select>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-ink-500" />
              <h2 className="font-semibold text-ink">Users & roles</h2>
            </div>
            <form
              className="mb-4 grid gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!userForm.name.trim() || !userForm.email.trim()) return
                createUser({
                  name: userForm.name.trim(),
                  email: userForm.email.trim(),
                  role: userForm.role,
                  agencyId: userForm.role === 'super_admin' ? null : userForm.agencyId || null,
                })
                setUserForm({ ...userForm, name: '', email: '' })
              }}
            >
              <Input placeholder="Full name" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
              <Input placeholder="Email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as RoleType })}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {roleLabels[r]}
                    </option>
                  ))}
                </Select>
                <Select
                  value={userForm.agencyId}
                  onChange={(e) => setUserForm({ ...userForm, agencyId: e.target.value })}
                  disabled={userForm.role === 'super_admin'}
                >
                  {state.agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit">Create user</Button>
            </form>

            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {state.users.map((u) => (
                <li key={u.id} className="rounded-xl bg-primary-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink">{u.name}</p>
                      <p className="text-xs text-ink-500">
                        {u.email} · {u.agencyId ? agencyName[u.agencyId] : 'Platform'}
                      </p>
                    </div>
                    <Badge tone={u.active ? 'success' : 'danger'}>{u.active ? 'Active' : 'Disabled'}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Select
                      value={u.role}
                      onChange={(e) => assignRole(u.id, e.target.value as RoleType, u.role === 'super_admin' ? null : u.agencyId)}
                      className="text-xs"
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {roleLabels[r]}
                        </option>
                      ))}
                    </Select>
                    <button
                      type="button"
                      className="rounded-xl border border-primary-100 px-3 text-xs font-semibold text-ink hover:bg-primary-50"
                      onClick={() => updateUser(u.id, { active: !u.active })}
                    >
                      {u.active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="mt-6 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Shield className="h-5 w-5 text-ink-500" />
            <h2 className="font-semibold">Role matrix (summary)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase text-ink-500">
                <tr>
                  <th className="py-2">Role</th>
                  <th className="py-2">Scope</th>
                  <th className="py-2">Can do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary">
                <tr>
                  <td className="py-2 font-medium">Super Admin</td>
                  <td>Platform</td>
                  <td>All agencies, users, roles, assets</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">Client Admin</td>
                  <td>One agency</td>
                  <td>Users, assets, sales, ops, portals</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">Agent</td>
                  <td>Assigned listings</td>
                  <td>Leads, viewings, applications, listings</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">Landlord</td>
                  <td>Own assets</td>
                  <td>View portfolio, maintenance, payments</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">Tenant</td>
                  <td>Own lease/apps</td>
                  <td>Apply, pay, report maintenance</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium">Contractor</td>
                  <td>Assigned jobs</td>
                  <td>Update maintenance</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </RequirePermission>
  )
}
