import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import { AppStoreProvider } from './context/AppStore'
import { AuthProvider } from './context/AuthContext'
import { UnopenedProvider } from './context/UnopenedContext'
import { LiveSyncBridge } from './hooks/useLiveSync'
import { SuiteAlertProvider } from './components/alerts/SuiteAlert'
import { MarketplaceShell, WorkspaceShell } from './components/AppShell'
import { ScrollToTop } from './components/ScrollToTop'
import { RequirePermission } from './components/RequirePermission'
import { RequireAgencyOpsAccess } from './components/RequireAgencyOpsAccess'

import { RequireAuth } from './components/RequireAuth'
import { CanonicalIdRedirect } from './components/routing/CanonicalIdRedirect'
import { PageSkeleton, skeletonVariantForPath } from './components/loading/PageSkeleton'
import { TempPasswordHost } from './components/admin/TempPasswordHost'
import { GoogleMapsProvider } from './context/GoogleMapsProvider'
import { useAuth } from './context/AuthContext'
import {
  WorkspaceApplicationsRedirect,
  WorkspaceAwareNotFound,
  WorkspaceLeasesRedirect,
  WorkspacePaymentsRedirect,
} from './lib/workspaceRedirects'

const MarketHome = lazy(() => import('./pages/market/MarketHome'))
const BrowsePage = lazy(() => import('./pages/market/BrowsePage'))
const SavedPage = lazy(() => import('./pages/market/SavedPage'))
const ListingDetail = lazy(() => import('./pages/market/ListingDetail'))
const CalculatorsPage = lazy(() => import('./pages/market/CalculatorsPage'))
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'))
const TermsPage = lazy(() => import('./pages/legal/TermsPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))
const LoginPage = lazy(() => import('./pages/auth/LoginPage'))
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'))
const SetPasswordPage = lazy(() => import('./pages/auth/SetPasswordPage'))
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage'))
const ConfirmEmailChangePage = lazy(() => import('./pages/auth/ConfirmEmailChangePage'))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'))
const PayfastResultPage = lazy(() => import('./pages/payfast/PayfastResultPage'))

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Properties = lazy(() => import('./pages/Properties'))
const PropertyDetail = lazy(() => import('./pages/PropertyDetail'))
const PropertyArchive = lazy(() => import('./pages/PropertyArchive'))
const PropertyEditPage = lazy(() => import('./pages/property/PropertyEditPage'))
const AssetCreate = lazy(() => import('./pages/AssetCreate'))
const CRM = lazy(() => import('./pages/CRM'))
const LeadDetail = lazy(() => import('./pages/LeadDetail'))
const Applications = lazy(() => import('./pages/Applications'))
const ApplicantDetail = lazy(() => import('./pages/ApplicantDetail'))
const ApplicationInspectionPage = lazy(() => import('./pages/ApplicationInspectionPage'))
const InspectionComparePage = lazy(() => import('./pages/InspectionComparePage'))
const InventoryTemplatesPage = lazy(() => import('./pages/admin/InventoryTemplatesPage'))
const Viewings = lazy(() => import('./pages/Viewings'))
const ViewingPropertyPage = lazy(() => import('./pages/ViewingPropertyPage'))
const Maintenance = lazy(() => import('./pages/Maintenance'))
const MaintenanceCreatePage = lazy(() => import('./pages/maintenance/MaintenanceCreatePage'))
const MaintenanceEditPage = lazy(() => import('./pages/maintenance/MaintenanceEditPage'))
const MaintenanceDetail = lazy(() => import('./pages/MaintenanceDetail'))
const ContractorsDirectory = lazy(() => import('./pages/ContractorsDirectory'))
const Documents = lazy(() => import('./pages/Documents'))
const Communications = lazy(() => import('./pages/Communications'))
const Payments = lazy(() => import('./pages/Payments'))
const PaymentDetail = lazy(() => import('./pages/PaymentDetail'))
const Reports = lazy(() => import('./pages/Reports'))
const OwnerPortal = lazy(() => import('./pages/OwnerPortal'))
const OwnerApplicationsPage = lazy(() => import('./pages/owner/OwnerApplicationsPage'))
const TenantPortal = lazy(() => import('./pages/TenantPortal'))
const AccountWishlistPage = lazy(() => import('./pages/account/AccountWishlistPage'))
const AccountSignaturePage = lazy(() => import('./pages/account/AccountSignaturePage'))
const ChangePasswordPage = lazy(() => import('./pages/account/ChangePasswordPage'))
const ContractorPortal = lazy(() => import('./pages/ContractorPortal'))
const StaffDirectory = lazy(() => import('./pages/StaffDirectory'))
const StaffDetail = lazy(() => import('./pages/StaffDetail'))
const TenantDirectory = lazy(() => import('./pages/TenantDirectory'))
const LeasesDirectory = lazy(() => import('./pages/LeasesDirectory'))
const LandlordsDirectory = lazy(() => import('./pages/LandlordsDirectory'))
const OccupantDetail = lazy(() => import('./pages/OccupantDetail'))
const AdminHub = lazy(() => import('./pages/admin/AdminHub'))
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'))
const AdminUserDetailPage = lazy(() => import('./pages/admin/AdminUserDetailPage'))
const AdminUserCreatePage = lazy(() => import('./pages/admin/AdminUserCreatePage'))
const AdminAgenciesPage = lazy(() => import('./pages/admin/AdminAgenciesPage'))
const AdminStoragePage = lazy(() => import('./pages/admin/AdminStoragePage'))
const AdminEmailsPage = lazy(() => import('./pages/admin/AdminEmailsPage'))
const AgencySubscriptionPage = lazy(() => import('./pages/admin/AgencySubscriptionPage'))
const InvoicePage = lazy(() => import('./pages/billing/InvoicePage'))
const EscalationsPage = lazy(() => import('./pages/EscalationsPage'))
const ReviewModerationPage = lazy(() => import('./pages/admin/ReviewModerationPage'))
const ConductPage = lazy(() => import('./pages/ConductPage'))
const AccountSettingsPage = lazy(() => import('./pages/account/AccountSettingsPage'))
const ContractorBookingsPage = lazy(() => import('./pages/ContractorBookingsPage'))
const PublicProfilePage = lazy(() => import('./pages/market/PublicProfilePage'))
const AdminAgencyCreatePage = lazy(() => import('./pages/admin/AdminAgencyCreatePage'))
const AgencyDetailPage = lazy(() => import('./pages/admin/AgencyDetailPage'))
const AdminConfigPage = lazy(() => import('./pages/admin/AdminConfigPage'))
const LeadPipelineSettingsPage = lazy(() => import('./pages/admin/LeadPipelineSettingsPage'))
const ApplicationJourneySettingsPage = lazy(
  () => import('./pages/admin/ApplicationJourneySettingsPage'),
)
const AdminNotificationsPage = lazy(() => import('./pages/admin/AdminNotificationsPage'))
const AdminAllUsersPage = lazy(() => import('./pages/admin/AdminAllUsersPage'))
const AdminDeletedUsersPage = lazy(() => import('./pages/admin/AdminDeletedUsersPage'))
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'))
const TenantApplicationDetailPage = lazy(() => import('./pages/tenant/TenantApplicationDetailPage'))
const PlatformBilling = lazy(() => import('./pages/PlatformBilling'))
const ComplianceDashboard = lazy(() => import('./pages/compliance/ComplianceDashboard'))
const TrustDashboard = lazy(() => import('./pages/trust/TrustDashboard'))
const TrustCashbook = lazy(() => import('./pages/trust/TrustCashbook'))
const TrustUnallocated = lazy(() => import('./pages/trust/TrustUnallocated'))
const TrustPayouts = lazy(() => import('./pages/trust/TrustPayouts'))
const TrustDeposits = lazy(() => import('./pages/trust/TrustDeposits'))
const TrustArrears = lazy(() => import('./pages/trust/TrustArrears'))
const HelpPage = lazy(() => import('./pages/HelpPage'))

/** Route chunk still downloading: ghost layout shaped like the page being opened. */
function PageFallback() {
  const { pathname } = useLocation()
  const variant = skeletonVariantForPath(pathname)
  return (
    <div className={pathname.startsWith('/workspace') ? '' : 'mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'}>
      <PageSkeleton variant={variant} />
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

/** Agency-wide modules — not for field agents (property book only). */
function AgencyOpsGuard({
  permission,
  anyOf,
  children,
}: {
  permission?: Parameters<typeof RequirePermission>[0]['permission']
  anyOf?: Parameters<typeof RequirePermission>[0]['anyOf']
  children: ReactNode
}) {
  return (
    <RequireAgencyOpsAccess>
      <RequirePermission permission={permission} anyOf={anyOf}>
        {children}
      </RequirePermission>
    </RequireAgencyOpsAccess>
  )
}

/** Landlords keep assets.manage but have no agency landlord directory; send them to their portal. */
function LandlordsDirectoryRoute({ children }: { children: ReactNode }) {
  const { role } = useAuth()
  if (role === 'landlord') return <Navigate to="/workspace/portals/owner" replace />
  return <>{children}</>
}

function RedirectPropertyAsset() {
  const { id } = useParams()
  return <Navigate to={`/workspace/properties/${id}`} replace />
}

/** Lead notifications (and their emails) link /sales/crm/leads/:id; the page is /sales/crm/:id. */
function RedirectLeadAlias() {
  const { id } = useParams()
  return <Navigate to={`/workspace/sales/crm/${encodeURIComponent(id ?? '')}`} replace />
}

export default function App() {
  return (
    <ThemeProvider>
      <GoogleMapsProvider>
      <AppStoreProvider>
        <AuthProvider>
          <UnopenedProvider>
          <LiveSyncBridge />
          <SuiteAlertProvider>
          <BrowserRouter>
            <ScrollToTop />
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

              <Route path="forgot-password" element={<Suspense fallback={<PageFallback />}><ForgotPasswordPage /></Suspense>} />
              <Route path="reset-password" element={<Suspense fallback={<PageFallback />}><SetPasswordPage mode="reset" /></Suspense>} />
              <Route path="set-password" element={<Suspense fallback={<PageFallback />}><SetPasswordPage mode="setup" /></Suspense>} />
              <Route path="verify-email" element={<Suspense fallback={<PageFallback />}><VerifyEmailPage /></Suspense>} />
              <Route path="confirm-email-change" element={<Suspense fallback={<PageFallback />}><ConfirmEmailChangePage /></Suspense>} />

              <Route path="payfast/return" element={<Suspense fallback={<PageFallback />}><PayfastResultPage /></Suspense>} />
              <Route path="payfast/cancel" element={<Suspense fallback={<PageFallback />}><PayfastResultPage cancelled /></Suspense>} />

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
                    <CanonicalIdRedirect entityTypes={['property', 'unit']} propertyLookup>
                      <Suspense fallback={<PageFallback />}>
                        <ListingDetail />
                      </Suspense>
                    </CanonicalIdRedirect>
                  }
                />
                <Route
                  path="profile/:id"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <PublicProfilePage />
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
                <Route
                  path="privacy"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <PrivacyPage />
                    </Suspense>
                  }
                />
                <Route
                  path="terms"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <TermsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="contact"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <ContactPage />
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
                  path="properties/archive"
                  element={
                    <Guard permission="assets.manage">
                      <PropertyArchive />
                    </Guard>
                  }
                />
                <Route
                  path="properties/:id/edit"
                  element={
                    <CanonicalIdRedirect entityTypes={['property', 'unit']} propertyLookup>
                      <Guard permission="assets.manage">
                        <PropertyEditPage />
                      </Guard>
                    </CanonicalIdRedirect>
                  }
                />
                <Route
                  path="properties/:id"
                  element={
                    <CanonicalIdRedirect entityTypes={['property', 'unit']} propertyLookup>
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
                    </CanonicalIdRedirect>
                  }
                />

                {/* Sales — flat routes */}
                <Route path="sales/crm" element={<Guard anyOf={['leads.view', 'leads.manage']}><CRM /></Guard>} />
                <Route
                  path="sales/crm/:id"
                  element={
                    <CanonicalIdRedirect entityTypes={['lead']}>
                      <Guard anyOf={['leads.view', 'leads.manage']}>
                        <LeadDetail />
                      </Guard>
                    </CanonicalIdRedirect>
                  }
                />
                <Route path="sales/crm/leads/:id" element={<RedirectLeadAlias />} />
                <Route path="sales/pipeline" element={<Navigate to="/workspace/sales/crm?view=board" replace />} />
                <Route path="sales/applications" element={<Guard permission="applications.view"><Applications /></Guard>} />
                <Route
                  path="sales/applications/:id"
                  element={
                    <CanonicalIdRedirect entityTypes={['application']}>
                      <Guard permission="applications.view">
                        <ApplicantDetail />
                      </Guard>
                    </CanonicalIdRedirect>
                  }
                />
                <Route
                  path="sales/applications/:id/inspection"
                  element={
                    <CanonicalIdRedirect entityTypes={['application']}>
                      <Guard permission="applications.review">
                        <ApplicationInspectionPage />
                      </Guard>
                    </CanonicalIdRedirect>
                  }
                />
                <Route
                  path="inspections/:id/compare"
                  element={
                    <Guard anyOf={['occupants.view', 'portal.tenant', 'portal.owner']}>
                      <InspectionComparePage />
                    </Guard>
                  }
                />
                <Route path="sales/viewings" element={<Guard permission="viewings.manage"><Viewings /></Guard>} />
                <Route
                  path="sales/viewings/property/:propertyId"
                  element={
                    <CanonicalIdRedirect
                      entityTypes={['property', 'unit']}
                      propertyLookup
                      paramKey="propertyId"
                    >
                      <Guard permission="viewings.manage">
                        <ViewingPropertyPage />
                      </Guard>
                    </CanonicalIdRedirect>
                  }
                />

                {/* Operations */}
                <Route path="operations/maintenance" element={<Guard permission="maintenance.view"><Maintenance /></Guard>} />
                <Route
                  path="operations/maintenance/new"
                  element={
                    <Guard permission="maintenance.manage">
                      <MaintenanceCreatePage />
                    </Guard>
                  }
                />
                <Route
                  path="operations/maintenance/:id/edit"
                  element={
                    <Guard permission="maintenance.view">
                      <MaintenanceEditPage />
                    </Guard>
                  }
                />
                <Route
                  path="operations/maintenance/:id"
                  element={
                    <CanonicalIdRedirect entityTypes={['ticket']}>
                      <Guard permission="maintenance.view">
                        <MaintenanceDetail />
                      </Guard>
                    </CanonicalIdRedirect>
                  }
                />
                <Route path="operations/escalations" element={<Guard permission="escalations.view"><EscalationsPage /></Guard>} />
                <Route path="operations/contractors" element={<Guard permission="contractors.view"><ContractorsDirectory /></Guard>} />
                <Route path="operations/documents" element={<Guard permission="documents.view"><Documents /></Guard>} />
                <Route path="operations/communications" element={<Guard permission="messages.manage"><Communications /></Guard>} />
                <Route path="operations/payments" element={<Guard permission="payments.view"><Payments /></Guard>} />
                <Route
                  path="operations/payments/:id"
                  element={
                    <CanonicalIdRedirect entityTypes={['payment']}>
                      <Guard permission="payments.view">
                        <PaymentDetail />
                      </Guard>
                    </CanonicalIdRedirect>
                  }
                />

                {/* Compliance */}
                <Route path="compliance" element={<AgencyOpsGuard permission="compliance.view"><ComplianceDashboard /></AgencyOpsGuard>} />

                {/* Trust & Banking */}
                <Route path="trust" element={<AgencyOpsGuard permission="trust.view"><TrustDashboard /></AgencyOpsGuard>} />
                <Route path="trust/cashbook" element={<AgencyOpsGuard permission="trust.view"><TrustCashbook /></AgencyOpsGuard>} />
                <Route path="trust/unallocated" element={<AgencyOpsGuard permission="trust.allocate"><TrustUnallocated /></AgencyOpsGuard>} />
                <Route path="trust/payouts" element={<AgencyOpsGuard permission="trust.approve_payout"><TrustPayouts /></AgencyOpsGuard>} />
                <Route path="trust/deposits" element={<AgencyOpsGuard permission="trust.view"><TrustDeposits /></AgencyOpsGuard>} />
                <Route path="trust/arrears" element={<AgencyOpsGuard anyOf={['trust.view', 'trust.view_arrears']}><TrustArrears /></AgencyOpsGuard>} />

                {/* Portals */}
                <Route path="portals/owner" element={<Guard permission="portal.owner"><OwnerPortal /></Guard>} />
                <Route path="portals/owner/applications" element={<Guard permission="portal.owner"><OwnerApplicationsPage /></Guard>} />
                <Route path="portals/tenant" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="portals/tenant/applications" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route
                  path="portals/tenant/applications/:id"
                  element={
                    <CanonicalIdRedirect entityTypes={['application']}>
                      <Guard permission="portal.tenant">
                        <TenantApplicationDetailPage />
                      </Guard>
                    </CanonicalIdRedirect>
                  }
                />
                <Route path="portals/tenant/maintenance" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="portals/tenant/messages" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="portals/tenant/complaints" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="portals/tenant/viewings" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="portals/tenant/enquiries" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="portals/tenant/leases" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="portals/tenant/payments" element={<Guard permission="portal.tenant"><TenantPortal /></Guard>} />
                <Route path="account/wishlist" element={<AccountWishlistPage />} />
                <Route path="account/signature" element={<AccountSignaturePage />} />
                <Route path="account/password" element={<ChangePasswordPage />} />
                <Route path="account/settings" element={<AccountSettingsPage />} />
                <Route path="portals/contractor" element={<Guard permission="portal.contractor"><ContractorPortal /></Guard>} />
                <Route path="portals/contractor/bookings" element={<Guard permission="portal.contractor"><ContractorBookingsPage /></Guard>} />

                {/* People */}
                <Route path="people/staff" element={<AgencyOpsGuard permission="users.manage"><StaffDirectory /></AgencyOpsGuard>} />
                <Route
                  path="people/staff/:id"
                  element={
                    <CanonicalIdRedirect entityTypes={['user']}>
                      <AgencyOpsGuard permission="users.manage">
                        <StaffDetail />
                      </AgencyOpsGuard>
                    </CanonicalIdRedirect>
                  }
                />
                <Route path="people/tenants" element={<AgencyOpsGuard permission="occupants.view"><TenantDirectory /></AgencyOpsGuard>} />
                <Route
                  path="people/tenants/:id"
                  element={
                    <CanonicalIdRedirect entityTypes={['tenancy']}>
                      <AgencyOpsGuard permission="occupants.view">
                        <OccupantDetail />
                      </AgencyOpsGuard>
                    </CanonicalIdRedirect>
                  }
                />
                <Route path="people/leases" element={<AgencyOpsGuard permission="occupants.view"><LeasesDirectory /></AgencyOpsGuard>} />
                <Route path="people/landlords" element={<AgencyOpsGuard anyOf={['users.manage', 'assets.manage']}><LandlordsDirectoryRoute><LandlordsDirectory /></LandlordsDirectoryRoute></AgencyOpsGuard>} />

                <Route path="insights/reports" element={<AgencyOpsGuard permission="reports.view"><Reports /></AgencyOpsGuard>} />
                <Route path="help" element={<HelpPage />} />
                <Route path="conduct" element={<ConductPage />} />
                <Route path="admin" element={<AgencyOpsGuard anyOf={['users.manage', 'roles.assign', 'tenant.manage', 'config.manage', 'platform.manage']}><AdminHub /></AgencyOpsGuard>} />
                {/* Admin dashboard; the page and the API both refuse roles other than super / agency admins. */}
                <Route path="admin/overview" element={<AgencyOpsGuard anyOf={['users.manage', 'platform.manage']}><AdminDashboardPage /></AgencyOpsGuard>} />
                <Route path="admin/users" element={<AgencyOpsGuard anyOf={['users.manage', 'roles.assign']}><AdminUsersPage /></AgencyOpsGuard>} />
                <Route path="admin/users/new" element={<AgencyOpsGuard anyOf={['users.manage', 'roles.assign']}><AdminUserCreatePage /></AgencyOpsGuard>} />
                <Route
                  path="admin/users/:id"
                  element={
                    <CanonicalIdRedirect entityTypes={['user']}>
                      <AgencyOpsGuard permission="roles.assign">
                        <AdminUserDetailPage />
                      </AgencyOpsGuard>
                    </CanonicalIdRedirect>
                  }
                />
                <Route path="admin/agencies" element={<Guard permission="platform.manage"><AdminAgenciesPage /></Guard>} />
                <Route path="admin/storage" element={<Guard permission="platform.manage"><AdminStoragePage /></Guard>} />
                <Route path="admin/emails" element={<Guard permission="platform.manage"><AdminEmailsPage /></Guard>} />
                <Route path="admin/subscription" element={<Guard permission="billing.view"><AgencySubscriptionPage /></Guard>} />
                <Route path="billing/invoices/:id" element={<Guard permission="billing.view"><InvoicePage /></Guard>} />
                <Route path="admin/reviews" element={<Guard anyOf={['platform.manage']}><ReviewModerationPage /></Guard>} />
                <Route path="admin/agencies/new" element={<Guard permission="platform.manage"><AdminAgencyCreatePage /></Guard>} />
                <Route
                  path="admin/agencies/:id"
                  element={
                    <CanonicalIdRedirect entityTypes={['agency']}>
                      <Guard permission="platform.manage">
                        <AgencyDetailPage />
                      </Guard>
                    </CanonicalIdRedirect>
                  }
                />
                <Route path="admin/config" element={<AgencyOpsGuard anyOf={['config.manage', 'tenant.manage', 'platform.manage']}><AdminConfigPage /></AgencyOpsGuard>} />
                <Route path="admin/pipeline" element={<AgencyOpsGuard anyOf={['config.manage', 'tenant.manage', 'platform.manage']}><LeadPipelineSettingsPage /></AgencyOpsGuard>} />
                <Route path="admin/inventory-templates" element={<AgencyOpsGuard anyOf={['config.manage', 'tenant.manage', 'platform.manage']}><InventoryTemplatesPage /></AgencyOpsGuard>} />
                <Route path="admin/application-journey" element={<AgencyOpsGuard anyOf={['config.manage', 'tenant.manage', 'platform.manage']}><ApplicationJourneySettingsPage /></AgencyOpsGuard>} />
                <Route path="admin/roles" element={<Navigate to="/workspace/admin/users" replace />} />
                <Route path="admin/notifications" element={<AgencyOpsGuard anyOf={['notifications.broadcast', 'platform.manage']}><AdminNotificationsPage /></AgencyOpsGuard>} />
                <Route path="admin/all-users" element={<Guard permission="platform.manage"><AdminAllUsersPage /></Guard>} />
                <Route path="admin/deleted-users" element={<Guard permission="platform.manage"><AdminDeletedUsersPage /></Guard>} />
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
                <Route path="applications" element={<WorkspaceApplicationsRedirect />} />
                <Route path="leases" element={<WorkspaceLeasesRedirect />} />
                <Route path="viewings" element={<Navigate to="/workspace/sales/viewings" replace />} />
                <Route path="maintenance" element={<Navigate to="/workspace/operations/maintenance" replace />} />
                <Route path="payments" element={<WorkspacePaymentsRedirect />} />
                <Route path="reports" element={<Navigate to="/workspace/insights/reports" replace />} />
                <Route path="modules" element={<Navigate to="/workspace/insights/reports" replace />} />
                <Route path="insights/modules" element={<Navigate to="/workspace/insights/reports" replace />} />
                <Route path="*" element={<Navigate to="/workspace" replace />} />
              </Route>

              <Route path="*" element={<WorkspaceAwareNotFound />} />
            </Routes>
            <TempPasswordHost />
          </BrowserRouter>
          </SuiteAlertProvider>
          </UnopenedProvider>
        </AuthProvider>
      </AppStoreProvider>
      </GoogleMapsProvider>
    </ThemeProvider>
  )
}
