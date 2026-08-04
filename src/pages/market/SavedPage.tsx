import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ACCOUNT_WISHLIST_PATH } from '../../lib/accountRoutes'
import BrowsePage from './BrowsePage'

/** Public saved list for guests; signed-in users go to their account wishlist. */
export default function SavedPage() {
  const { isAuthenticated, authReady } = useAuth()
  if (!authReady) return null
  if (isAuthenticated) return <Navigate to={ACCOUNT_WISHLIST_PATH} replace />
  return <BrowsePage />
}
