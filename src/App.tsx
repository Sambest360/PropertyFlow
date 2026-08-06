import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { ThemeProvider } from './context/ThemeContext'
import { AppStoreProvider } from './context/AppStore'
import { AuthProvider } from './context/AuthContext'
import { LiveSyncBridge } from './hooks/useLiveSync'
import { SuiteAlertProvider } from './components/alerts/SuiteAlert'
import { MarketplaceShell, WorkspaceShell } from './components/AppShell'
import { ScrollToTop } from './components/ScrollToTop'
import { RequirePermission } from './components/RequirePermission'

import { RequireAuth } from './components/RequireAuth'

const MarketHome = lazy(() => import('./pages/market/MarketHome'))
const BrowsePage = lazy(() => import('./pages/market/BrowsePage'))
const SavedPage = lazy(() => import('./pages/market/SavedPage'))
const ListingDetail = lazy(() => import('./pages/market/ListingDetail'))
const CalculatorsPage = lazy(() => import('./pages/market/CalculatorsPage'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'))

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Properties = lazy(() => import('./pages/Properties'))
const PropertyDetail = lazy(() => import('./pages/PropertyDetail'))
const AssetCreate = lazy(() => import('./pages/AssetCreate'))
const CRM = lazy(() => import('./pages/CRM'))
const LeadDetail = lazy(() => import('./pages/LeadDetail'))
const Applications = lazy(() => import('./pages/Applications'))
const ApplicantDetail = lazy(() => import('./pages/ApplicantDetail'))
const Viewings = lazy(() => import('./pages/Viewings'))
const ViewingPropertyPage = lazy(() => import('./pages/ViewingPropertyPage'))
const Maintenance = lazy(() => import('./pages/Maintenance'))
const MaintenanceDetail = lazy(() => import('./pages/MaintenanceDetail'))
const ContractorsDirectory = lazy(() => import('./pages/ContractorsDirectory'))
const Documents = lazy(() => import('./pages/Documents'))
const Communications = lazy(() => import('./pages/Communications'))
const Payments = lazy(() => import('./pages/Payments'))
const PaymentDetail = lazy(() => import('./pages/PaymentDetail'))
const Reports = lazy(() => import('./pages/Reports'))
const OwnerPortal = lazy(() => import('./pages/OwnerPortal'))
const TenantPortal = lazy(() => import('./pages/TenantPortal'))
const AccountWishlistPage = lazy(() => import('./pages/account/AccountWishlistPage'))
const ContractorPortal = lazy(() => import('./pages/ContractorPortal'))
const StaffDirectory = lazy(() => import('./pages/StaffDirectory'))
const StaffDetail = lazy(() => import('./pages/StaffDetail'))
const TenantDirectory = lazy(() => import('./pages/TenantDirectory'))
const LandlordsDirectory = lazy(() => import('./pages/LandlordsDirectory'))
const OccupantDetail = lazy(() => import('./pages/OccupantDetail'))
const AdminHub = lazy(() => import('./pages/admin/AdminHub'))
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'))
const AdminUserDetailPage = lazy(() => import('./pages/admin/AdminUserDetailPage'))
const AdminUserCreatePage = lazy(() => import('./pages/admin/AdminUserCreatePage'))
const AdminAgenciesPage = lazy(() => import('./pages/admin/AdminAgenciesPage'))
const AdminAgencyCreatePage = lazy(() => import('./pages/admin/AdminAgencyCreatePage'))
const AgencyDetailPage = lazy(() => import('./pages/admin/AgencyDetailPage'))
const AdminConfigPage = lazy(() => import('./pages/admin/AdminConfigPage'))
const AdminNotificationsPage = lazy(() => import('./pages/admin/AdminNotificationsPage'))
const PlatformBilling = lazy(() => import('./pages/PlatformBilling'))

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-ink-500">
      Loading…
    </div>
  )
}

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
          <LiveSyncBridge />
          <SuiteAlertProvider>
          <BrowserRouter>
            <ScrollToTop />
            <SpeedInsights />
            <Routes>
              <Route
                path="login"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <LoginPage />
                  </Suspense>
                }
              />
              <Route
                path="register"
                element={
                  <Suspense fallback={<PageFallback />}>
                    <RegisterPage />
                  </Suspense>
                }
              />

              <Route element={<MarketplaceShell />}>
                <Route
                  index
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <MarketHome />
                    </Suspense>
                  }
                />
                <Route
                  path="browse"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <BrowsePage />
                    </Suspense>
                  }
                />
                <Route
                  path="listing/:id"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <ListingDetail />
                    </Suspense>
                  }
                />
                <Route
                  path="saved"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <SavedPage />
                    </Suspense>
                  }
                />
                <Route
                  path="calculators/*"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <CalculatorsPage />
                    </Suspense>
                  }
                />
              </Route>

              <Route
                path="workspace"
                element={
                  <RequireAuth>
                    <Suspense fallback={<PageFallback />}>
                      <WorkspaceShell />
                    </Suspense>
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
                <Route path="operations/contractors" element={<Guard permission="contractors.view"><ContractorsDirectory /></Guard>} />
                <Route path="operations/documents" element={<Guard permission="documents.view"><Documents /></Guard>} />
                <Route path="operations/communications" element={<Guard permission="messages.manage"><Communications /></Guard>} />
                <Route path="operations/payments" element={<Guard permission="payments.view"><Payments /></Guard>} />
                <Route path="operations/payments/:id" element={<Guard permission="payments.view"><PaymentDetail /></Guard>} />

                {/* Portals */}
                <Route path="portals/owner" element={<Guard permission="portal.owner"><OwnerPortal /></Guard>} />
                <Route path="portals/tenant" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="portals/tenant/applications" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="portals/tenant/maintenance" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="portals/tenant/messages" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="portals/tenant/complaints" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="account/wishlist" element={<AccountWishlistPage />} />
                <Route path="portals/contractor" element={<Guard permission="portal.contractor"><ContractorPortal /></Guard>} />

                {/* People */}
                <Route path="people/staff" element={<Guard permission="users.manage"><StaffDirectory /></Guard>} />
                <Route path="people/staff/:id" element={<Guard permission="users.manage"><StaffDetail /></Guard>} />
                <Route path="people/tenants" element={<Guard permission="occupants.view"><TenantDirectory /></Guard>} />
                <Route path="people/tenants/:id" element={<Guard permission="occupants.view"><OccupantDetail /></Guard>} />
                <Route path="people/landlords" element={<Guard anyOf={['users.manage', 'assets.manage']}><LandlordsDirectory /></Guard>} />

                <Route path="insights/reports" element={<Guard permission="reports.view"><Reports /></Guard>} />
                <Route path="admin" element={<Guard anyOf={['users.manage', 'roles.assign', 'tenant.manage', 'config.manage', 'platform.manage']}><AdminHub /></Guard>} />
                <Route path="admin/users" element={<Guard anyOf={['users.manage', 'roles.assign']}><AdminUsersPage /></Guard>} />
                <Route path="admin/users/new" element={<Guard anyOf={['users.manage', 'roles.assign']}><AdminUserCreatePage /></Guard>} />
                <Route path="admin/users/:id" element={<Guard permission="roles.assign"><AdminUserDetailPage /></Guard>} />
                <Route path="admin/agencies" element={<Guard permission="platform.manage"><AdminAgenciesPage /></Guard>} />
                <Route path="admin/agencies/new" element={<Guard permission="platform.manage"><AdminAgencyCreatePage /></Guard>} />
                <Route path="admin/agencies/:id" element={<Guard permission="platform.manage"><AgencyDetailPage /></Guard>} />
                <Route path="admin/config" element={<Guard anyOf={['config.manage', 'tenant.manage', 'platform.manage']}><AdminConfigPage /></Guard>} />
                <Route path="admin/roles" element={<Navigate to="/workspace/admin/users" replace />} />
                <Route path="admin/notifications" element={<Guard anyOf={['notifications.broadcast', 'platform.manage']}><AdminNotificationsPage /></Guard>} />
                <Route path="admin/suite-alerts" element={<Navigate to="/workspace/admin/notifications" replace />} />
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
