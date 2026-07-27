import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import { AppStoreProvider } from './context/AppStore'
import { AuthProvider } from './context/AuthContext'
import { SuiteAlertProvider } from './components/alerts/SuiteAlert'
import { MarketplaceShell, WorkspaceShell } from './components/AppShell'
import { ScrollToTop } from './components/ScrollToTop'
import { RequirePermission } from './components/RequirePermission'

import MarketHome from './pages/market/MarketHome'
import BrowsePage from './pages/market/BrowsePage'
import ListingDetail from './pages/market/ListingDetail'
import CalculatorsPage from './pages/market/CalculatorsPage'

import Dashboard from './pages/Dashboard'
import Properties from './pages/Properties'
import PropertyDetail from './pages/PropertyDetail'
import AssetCreate from './pages/AssetCreate'
import CRM from './pages/CRM'
import LeadDetail from './pages/LeadDetail'
import Applications from './pages/Applications'
import ApplicantDetail from './pages/ApplicantDetail'
import Viewings from './pages/Viewings'
import ViewingPropertyPage from './pages/ViewingPropertyPage'
import Maintenance from './pages/Maintenance'
import MaintenanceDetail from './pages/MaintenanceDetail'
import Documents from './pages/Documents'
import Communications from './pages/Communications'
import Payments from './pages/Payments'
import PaymentDetail from './pages/PaymentDetail'
import Reports from './pages/Reports'
import OwnerPortal from './pages/OwnerPortal'
import TenantPortal from './pages/TenantPortal'
import ContractorPortal from './pages/ContractorPortal'
import StaffDirectory from './pages/StaffDirectory'
import StaffDetail from './pages/StaffDetail'
import TenantDirectory from './pages/TenantDirectory'
import OccupantDetail from './pages/OccupantDetail'
import AdminHub from './pages/admin/AdminHub'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage'
import AdminUserCreatePage from './pages/admin/AdminUserCreatePage'
import AdminAgenciesPage from './pages/admin/AdminAgenciesPage'
import AdminAgencyCreatePage from './pages/admin/AdminAgencyCreatePage'
import AgencyDetailPage from './pages/admin/AgencyDetailPage'
import AdminConfigPage from './pages/admin/AdminConfigPage'
import AdminNotificationsPage from './pages/admin/AdminNotificationsPage'
import PlatformBilling from './pages/PlatformBilling'
import SuiteAlerts from './pages/SuiteAlerts'

import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import { RequireAuth } from './components/RequireAuth'

function Guard({
  permission,
  anyOf,
  children,
}: {
  permission?: Parameters<typeof RequirePermission>[0]['permission']
  anyOf?: Parameters<typeof RequirePermission>[0]['anyOf']
  children: ReactNode
}) {
  return (
    <RequirePermission permission={permission} anyOf={anyOf}>
      {children}
    </RequirePermission>
  )
}

function RedirectPropertyAsset() {
  const { id } = useParams()
  return <Navigate to={`/workspace/properties/${id}`} replace />
}

export default function App() {
  return (
    <ThemeProvider>
      <AppStoreProvider>
        <AuthProvider>
          <SuiteAlertProvider>
          <BrowserRouter>
            <ScrollToTop />
            <Routes>
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />

              <Route element={<MarketplaceShell />}>
                <Route index element={<MarketHome />} />
                <Route path="browse" element={<BrowsePage />} />
                <Route path="listing/:id" element={<ListingDetail />} />
                <Route path="saved" element={<BrowsePage />} />
                <Route path="calculators/*" element={<CalculatorsPage />} />
              </Route>

              <Route
                path="workspace"
                element={
                  <RequireAuth>
                    <WorkspaceShell />
                  </RequireAuth>
                }
              >
                <Route index element={<Dashboard />} />

                {/* Properties — one list, one detail (no infra/listings tab maze) */}
                <Route
                  path="properties"
                  element={
                    <Guard anyOf={['assets.view', 'listings.publish']}>
                      <Properties />
                    </Guard>
                  }
                />
                <Route
                  path="properties/new"
                  element={
                    <Guard permission="assets.manage">
                      <AssetCreate />
                    </Guard>
                  }
                />
                <Route
                  path="properties/:id"
                  element={
                    <Guard
                      anyOf={[
                        'assets.view',
                        'listings.publish',
                        'portal.owner',
                        'portal.tenant',
                        'portal.contractor',
                      ]}
                    >
                      <PropertyDetail />
                    </Guard>
                  }
                />

                {/* Sales — flat routes */}
                <Route path="sales/crm" element={<Guard anyOf={['leads.view', 'leads.manage']}><CRM /></Guard>} />
                <Route path="sales/crm/:id" element={<Guard anyOf={['leads.view', 'leads.manage']}><LeadDetail /></Guard>} />
                <Route path="sales/pipeline" element={<Navigate to="/workspace/sales/crm?view=board" replace />} />
                <Route path="sales/applications" element={<Guard permission="applications.view"><Applications /></Guard>} />
                <Route path="sales/applications/:id" element={<Guard permission="applications.view"><ApplicantDetail /></Guard>} />
                <Route path="sales/viewings" element={<Guard permission="viewings.manage"><Viewings /></Guard>} />
                <Route
                  path="sales/viewings/property/:propertyId"
                  element={
                    <Guard permission="viewings.manage">
                      <ViewingPropertyPage />
                    </Guard>
                  }
                />

                {/* Operations */}
                <Route path="operations/maintenance" element={<Guard permission="maintenance.view"><Maintenance /></Guard>} />
                <Route path="operations/maintenance/:id" element={<Guard permission="maintenance.view"><MaintenanceDetail /></Guard>} />
                <Route path="operations/documents" element={<Guard permission="documents.view"><Documents /></Guard>} />
                <Route path="operations/communications" element={<Guard permission="messages.manage"><Communications /></Guard>} />
                <Route path="operations/payments" element={<Guard permission="payments.view"><Payments /></Guard>} />
                <Route path="operations/payments/:id" element={<Guard permission="payments.view"><PaymentDetail /></Guard>} />

                {/* Portals */}
                <Route path="portals/owner" element={<Guard permission="portal.owner"><OwnerPortal /></Guard>} />
                <Route path="portals/tenant" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="portals/tenant/applications" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="portals/contractor" element={<Guard permission="portal.contractor"><ContractorPortal /></Guard>} />

                {/* People */}
                <Route path="people/staff" element={<Guard permission="users.manage"><StaffDirectory /></Guard>} />
                <Route path="people/staff/:id" element={<Guard permission="users.manage"><StaffDetail /></Guard>} />
                <Route path="people/tenants" element={<Guard permission="occupants.view"><TenantDirectory /></Guard>} />
                <Route path="people/tenants/:id" element={<Guard permission="occupants.view"><OccupantDetail /></Guard>} />

                <Route path="insights/reports" element={<Guard permission="reports.view"><Reports /></Guard>} />
                <Route path="admin" element={<Guard anyOf={['users.manage', 'roles.assign', 'tenant.manage', 'config.manage', 'platform.manage']}><AdminHub /></Guard>} />
                <Route path="admin/users" element={<Guard permission="roles.assign"><AdminUsersPage /></Guard>} />
                <Route path="admin/users/new" element={<Guard anyOf={['users.manage', 'roles.assign']}><AdminUserCreatePage /></Guard>} />
                <Route path="admin/users/:id" element={<Guard permission="roles.assign"><AdminUserDetailPage /></Guard>} />
                <Route path="admin/agencies" element={<Guard permission="platform.manage"><AdminAgenciesPage /></Guard>} />
                <Route path="admin/agencies/new" element={<Guard permission="platform.manage"><AdminAgencyCreatePage /></Guard>} />
                <Route path="admin/agencies/:id" element={<Guard permission="platform.manage"><AgencyDetailPage /></Guard>} />
                <Route path="admin/config" element={<Guard anyOf={['config.manage', 'tenant.manage', 'platform.manage']}><AdminConfigPage /></Guard>} />
                <Route path="admin/roles" element={<Navigate to="/workspace/admin/users" replace />} />
                <Route path="admin/notifications" element={<Guard anyOf={['notifications.broadcast', 'platform.manage']}><AdminNotificationsPage /></Guard>} />
                <Route path="admin/suite-alerts" element={<Guard anyOf={['users.manage', 'roles.assign', 'tenant.manage', 'platform.manage', 'config.manage']}><SuiteAlerts /></Guard>} />
                <Route path="platform" element={<Navigate to="/workspace/admin/agencies" replace />} />
                <Route path="platform/billing" element={<Guard permission="platform.manage"><PlatformBilling /></Guard>} />

                {/* Legacy redirects */}
                <Route path="properties/infrastructure" element={<Navigate to="/workspace/properties" replace />} />
                <Route path="properties/infrastructure/:buildingId" element={<Navigate to="/workspace/properties" replace />} />
                <Route path="properties/assets" element={<Navigate to="/workspace/properties" replace />} />
                <Route path="properties/assets/:id" element={<RedirectPropertyAsset />} />
                <Route path="properties/listings" element={<Navigate to="/workspace/properties" replace />} />
                <Route path="sales" element={<Navigate to="/workspace/sales/crm" replace />} />
                <Route path="operations" element={<Navigate to="/workspace/operations/maintenance" replace />} />
                <Route path="crm" element={<Navigate to="/workspace/sales/crm" replace />} />
                <Route path="pipeline" element={<Navigate to="/workspace/sales/crm?view=board" replace />} />
                <Route path="applications" element={<Navigate to="/workspace/sales/applications" replace />} />
                <Route path="viewings" element={<Navigate to="/workspace/sales/viewings" replace />} />
                <Route path="maintenance" element={<Navigate to="/workspace/operations/maintenance" replace />} />
                <Route path="payments" element={<Navigate to="/workspace/operations/payments" replace />} />
                <Route path="reports" element={<Navigate to="/workspace/insights/reports" replace />} />
                <Route path="modules" element={<Navigate to="/workspace/insights/reports" replace />} />
                <Route path="insights/modules" element={<Navigate to="/workspace/insights/reports" replace />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          </SuiteAlertProvider>
        </AuthProvider>
      </AppStoreProvider>
    </ThemeProvider>
  )
}
