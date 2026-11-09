/**
 * Sends a landlord to their own side when they open the other one:
 * guest-house-only landlords land on Guest houses, rentals-only landlords on
 * their owner portal. Everyone else passes straight through.
 */
import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { canUseGuesthouses, canUseRentals } from '../../lib/landlordFocus'

export function LandlordFocusGate({ side, children }: { side: 'rentals' | 'guesthouses'; children: ReactNode }) {
  const { user } = useAuth()
  const role = user?.role
  const focus = user?.landlordFocus
  if (side === 'rentals' && !canUseRentals(role, focus)) return <Navigate to="/workspace/guesthouses" replace />
  if (side === 'guesthouses' && !canUseGuesthouses(role, focus)) return <Navigate to="/workspace/portals/owner" replace />
  return <>{children}</>
}
