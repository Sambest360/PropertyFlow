import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

/** Hub: Super Admin → agencies; agency admin (team only) → Team; principal → Users. */
export default function AdminHub() {
  const { has } = useAuth()
  if (has('platform.manage')) {
    return <Navigate to="/workspace/admin/agencies" replace />
  }
  if (has('users.manage') && !has('roles.assign')) {
    return <Navigate to="/workspace/people/staff" replace />
  }
  return <Navigate to="/workspace/people/staff?scope=all" replace />
}
