import { Navigate } from 'react-router-dom'
import { AgencyDashboard } from './dashboards/AgencyDashboard'
import { GroundAgentDashboard } from './dashboards/GroundAgentDashboard'
import { useAuth } from '../context/AuthContext'
import { defaultWorkspacePath } from '../lib/workspaceRoutes'
import { PortalHydrationGate } from '../components/PortalHydrationGate'
import TenantPortal from './TenantPortal'
import OwnerPortal from './OwnerPortal'
import ContractorPortal from './ContractorPortal'

/**
 * Workspace home — one purposeful surface per role.
 * Portal actors land on their portal; Principal / Agency Admin share AgencyDashboard
 * with role-specific copy; field agents get GroundAgentDashboard; Super Admin gets platform.
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
    return <Navigate to={defaultWorkspacePath('super_admin')} replace />
  }

  if (role === 'ground_agent' || role === 'agent') {
    return <GroundAgentDashboard />
  }

  // Principal (client_admin) and Agency Administrator — shared ops dashboard,
  // filtered by effective permissions (listings / leads / etc.).
  return <AgencyDashboard />
}
