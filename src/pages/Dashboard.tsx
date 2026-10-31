import { lazy, Suspense } from 'react'
import { AgencyDashboard } from './dashboards/AgencyDashboard'
import { GroundAgentDashboard } from './dashboards/GroundAgentDashboard'
import { useAuth } from '../context/AuthContext'
import { PageSkeleton } from '../components/loading/PageSkeleton'
import { PortalHydrationGate } from '../components/PortalHydrationGate'
import TenantPortal from './TenantPortal'
import OwnerPortal from './OwnerPortal'
import ContractorPortal from './ContractorPortal'

const AdminDashboardPage = lazy(() => import('./admin/AdminDashboardPage'))

/**
 * Workspace home — one purposeful surface per role.
 * Portal actors land on their portal; Principal / Agency Admin share AgencyDashboard
 * with role-specific copy; field agents get GroundAgentDashboard; Super Admin gets the
 * platform admin dashboard (agency admins open their agency's at /workspace/admin/overview).
 */
export default function Dashboard() {
  return (
    <PortalHydrationGate>
      <DashboardContent />
    </PortalHydrationGate>
  )
}

function DashboardContent() {
  const { user, has } = useAuth()
  const role = user?.role

  if (role === 'contractor' && has('portal.contractor')) {
    return <ContractorPortal />
  }
  if (role === 'landlord' && has('portal.owner')) {
    return <OwnerPortal />
  }
  if (role === 'tenant' && has('portal.tenant')) {
    return <TenantPortal />
  }

  if (role === 'super_admin') {
    return (
      <Suspense fallback={<PageSkeleton variant="dashboard" />}>
        <AdminDashboardPage />
      </Suspense>
    )
  }

  if (role === 'ground_agent' || role === 'agent') {
    return <GroundAgentDashboard />
  }

  // Principal (client_admin) and Agency Administrator — shared ops dashboard,
  // filtered by effective permissions (listings / leads / etc.).
  return <AgencyDashboard />
}
