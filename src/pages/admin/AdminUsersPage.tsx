import { Navigate } from 'react-router-dom'

/** Legacy route — merged into People → Team → All accounts tab. */
export default function AdminUsersPage() {
  return <Navigate to="/workspace/people/staff?scope=all" replace />
}
