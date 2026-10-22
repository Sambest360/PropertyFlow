import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isFieldAgent } from '../lib/permissions'

/** Blocks field agents from agency-wide modules (trust, compliance, people, admin, reports). */
export function RequireAgencyOpsAccess({
  children,
  fallback = <Navigate to="/workspace" replace />,
}: {
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const { user } = useAuth()
  if (user && isFieldAgent(user.role)) return <>{fallback}</>
  return <>{children}</>
}
