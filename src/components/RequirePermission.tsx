import { Navigate } from 'react-router-dom'
import type { Permission } from '../types/domain'
import { useAuth } from '../context/AuthContext'

export function RequirePermission({
  permission,
  anyOf,
  children,
  fallback = <Navigate to="/workspace" replace />,
}: {
  permission?: Permission
  anyOf?: Permission[]
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const { has, hasAny } = useAuth()
  const ok = permission ? has(permission) : anyOf ? hasAny(anyOf) : true
  if (!ok) return <>{fallback}</>
  return <>{children}</>
}
