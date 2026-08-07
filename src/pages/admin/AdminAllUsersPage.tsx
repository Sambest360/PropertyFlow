import { AllAccountsDirectory } from '../../components/directory/AllAccountsDirectory'
import { RequirePermission } from '../../components/RequirePermission'
import { PageHeader } from '../../components/ui'

export default function AdminAllUsersPage() {
  return (
    <RequirePermission permission="platform.manage">
      <div className="animate-fade-in space-y-5">
        <PageHeader
          title="All users"
          subtitle="Every account on the platform — impersonate any user to troubleshoot or verify their experience."
        />
        <AllAccountsDirectory returnTo="/workspace/admin/all-users" />
      </div>
    </RequirePermission>
  )
}
