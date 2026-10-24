import { Navigate } from 'react-router-dom'
import type { Permission } from '../types/domain'
import { useAuth } from '../context/AuthContext'
import { readAuthToken } from '../lib/api/authClient'
import { readStoredAuthUserId } from '../lib/api/actorAuth'
import { PageSkeleton, skeletonVariantForPath } from './loading/PageSkeleton'

function hasPendingSessionArtifact(): boolean {
  return Boolean(readAuthToken()) || Boolean(readStoredAuthUserId())
}

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
  const { has, hasAny, authReady, loginInFlight, isAuthenticated } = useAuth()

  const pendingSession =
    loginInFlight || !authReady || (!isAuthenticated && hasPendingSessionArtifact())

  if (pendingSession) {
    return (
      <PageSkeleton
        variant={skeletonVariantForPath(typeof window === 'undefined' ? '' : window.location.pathname)}
      />
    )
  }

  const ok = permission ? has(permission) : anyOf ? hasAny(anyOf) : true
  if (!ok) return <>{fallback}</>
  return <>{children}</>
}
