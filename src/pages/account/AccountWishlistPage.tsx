import { useMemo, useState } from 'react'
import { Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePublicProperties, useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { DashboardBreadcrumb, DashboardPage } from '../../components/dashboard'
import { Button, Card } from '../../components/ui'
import { PropertyLoader } from '../../components/loading/PropertyLoader'
import { WishlistListView } from '../../components/wishlist/WishlistListView'
import { blockedPropertyIdsForApplicant } from '../../lib/blockedApplicants'
import { useWishlist } from '../../hooks/useWishlist'
import { usePrefersReducedMotion } from '../../hooks/useScrollMotion'

export default function AccountWishlistPage() {
  const publicProperties = usePublicProperties()
  const { state, hydratedForUserId } = useStore()
  const { user, authReady } = useAuth()
  const { ids: wishlistIds } = useWishlist(user.id)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  const blockedIds = useMemo(
    () => blockedPropertyIdsForApplicant(state.applications, user),
    [state.applications, user],
  )

  const properties = useMemo(
    () => publicProperties.filter((p) => wishlistIds.includes(p.id) && !blockedIds.has(p.id)),
    [publicProperties, wishlistIds, blockedIds],
  )

  const homeCrumb =
    user.role === 'tenant'
      ? { label: 'Dashboard', to: '/workspace/portals/tenant' }
      : { label: 'Dashboard', to: '/workspace' }

  const marketplaceLoading =
    wishlistIds.length > 0 &&
    authReady &&
    user.id !== 'guest' &&
    hydratedForUserId !== user.id &&
    publicProperties.length === 0

  return (
    <DashboardPage>
      <DashboardBreadcrumb items={[homeCrumb, { label: 'Wishlist' }]} />

      <div className="mb-6" data-tip-target="tenant-wishlist">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-ink">
          <Heart className="h-6 w-6 text-accent" strokeWidth={1.6} aria-hidden />
          Wishlist
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Homes you saved while browsing — apply or remove them anytime.
        </p>
      </div>

      {marketplaceLoading ? (
        <Card className="flex justify-center p-8">
          <PropertyLoader label="Loading your saved homes…" size="md" />
        </Card>
      ) : properties.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-ink-500">No saved homes yet.</p>
          <p className="mt-1 text-sm text-ink-400">
            Tap the heart on any listing while you browse the marketplace.
          </p>
          <Link to="/browse" className="mt-4 inline-flex">
            <Button className="min-h-11 cursor-pointer">Browse homes</Button>
          </Link>
        </Card>
      ) : (
        <WishlistListView
          properties={properties}
          expandedId={expandedId}
          onToggle={(p) => setExpandedId((id) => (id === p.id ? null : p.id))}
          reducedMotion={reducedMotion}
        />
      )}
    </DashboardPage>
  )
}
