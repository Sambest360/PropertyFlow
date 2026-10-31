import { useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { RequirePermission } from '../../components/RequirePermission'
import { Card, PageHeader } from '../../components/ui'
import { roleLabels } from '../../lib/permissions'

/**
 * Super admin only: accounts that were deleted. Their personal details were
 * wiped (POPIA), but the rows stay so the leases, payments and history that
 * point at them stay intact. Everyone else never receives these users.
 */
export default function AdminDeletedUsersPage() {
  const { deletedUsers, state } = useStore()
  const { realUser } = useAuth()
  const agencyName = useMemo(
    () => Object.fromEntries(state.agencies.map((a) => [a.id, a.name])) as Record<string, string>,
    [state.agencies],
  )
  const rows = useMemo(
    () => [...deletedUsers].sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt))),
    [deletedUsers],
  )
  if (realUser?.role !== 'super_admin') return <Navigate to="/workspace" replace />

  return (
    <RequirePermission permission="platform.manage">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="Deleted users"
          subtitle="Accounts a super admin deleted. Their name, email, phone and password were wiped; the records linked to them are kept. Only super admins can see this list."
        />
        <Card className="p-0 overflow-hidden">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No deleted users.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Account ID</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Agency</th>
                    <th className="px-4 py-3">Deleted on</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-3 font-mono text-xs">{u.id}</td>
                      <td className="px-4 py-3">{roleLabels[u.role] ?? u.role}</td>
                      <td className="px-4 py-3">{u.agencyId ? agencyName[u.agencyId] ?? u.agencyId : 'Platform'}</td>
                      <td className="px-4 py-3">{u.deletedAt ? new Date(u.deletedAt).toLocaleString('en-ZA') : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </RequirePermission>
  )
}
