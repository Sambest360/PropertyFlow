/**
 * Ghost (skeleton) loaders: grey placeholders shaped like the page that is
 * loading, shown while a route's code chunk downloads (App Suspense fallback)
 * and while a signed-in user's data has not landed (WorkspaceShell gate).
 */
import type { ReactNode } from 'react'
import { cn } from '../ui'

export type SkeletonVariant = 'dashboard' | 'list' | 'detail' | 'form' | 'cards' | 'listing'

/** One grey placeholder block. */
export function Bone({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-lg bg-primary-100/70 motion-reduce:animate-none', className)}
    />
  )
}

function PageHeaderBones({ action = true }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <Bone className="h-3 w-24" />
        <Bone className="h-8 w-56 sm:w-72" />
        <Bone className="h-4 w-64 max-w-full sm:w-96" />
      </div>
      {action ? <Bone className="h-11 w-36 rounded-2xl" /> : null}
    </div>
  )
}

function DashboardBones() {
  return (
    <>
      <PageHeaderBones action={false} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-primary-50 p-5">
            <Bone className="h-4 w-24" />
            <Bone className="h-8 w-20" />
            <Bone className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Bone className="h-72 rounded-2xl lg:col-span-2" />
        <Bone className="h-72 rounded-2xl" />
      </div>
    </>
  )
}

function ListBones() {
  return (
    <>
      <PageHeaderBones />
      <div className="flex flex-wrap gap-3">
        <Bone className="h-11 w-full max-w-sm rounded-2xl" />
        <Bone className="h-11 w-28 rounded-2xl" />
        <Bone className="h-11 w-28 rounded-2xl" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-primary-50">
        <div className="flex gap-4 border-b border-primary-50 bg-surface-muted/40 px-4 py-3">
          {[0, 1, 2, 3].map((i) => (
            <Bone key={i} className="h-3 flex-1" />
          ))}
        </div>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-primary-50 px-4 py-4 last:border-0">
            <Bone className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Bone className="h-4 w-1/2" />
              <Bone className="h-3 w-1/3" />
            </div>
            <Bone className="hidden h-6 w-20 rounded-full sm:block" />
            <Bone className="hidden h-4 w-24 md:block" />
          </div>
        ))}
      </div>
    </>
  )
}

function DetailBones() {
  return (
    <>
      <Bone className="h-4 w-28" />
      <div className="flex flex-wrap items-center gap-4">
        <Bone className="h-16 w-16 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Bone className="h-8 w-64 max-w-full" />
          <Bone className="h-4 w-48" />
        </div>
        <Bone className="h-11 w-32 rounded-2xl" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <Bone key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Bone className="h-48 rounded-2xl" />
          <Bone className="h-32 rounded-2xl" />
        </div>
        <Bone className="h-80 rounded-2xl" />
      </div>
    </>
  )
}

function FormBones() {
  return (
    <>
      <PageHeaderBones action={false} />
      <div className="max-w-3xl space-y-5 rounded-2xl border border-primary-50 p-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <Bone className="h-3 w-28" />
            <Bone className="h-11 w-full rounded-xl" />
          </div>
        ))}
        <div className="flex justify-end gap-3 pt-2">
          <Bone className="h-11 w-24 rounded-2xl" />
          <Bone className="h-11 w-32 rounded-2xl" />
        </div>
      </div>
    </>
  )
}

/**
 * Ghost rows for a data table only: the page's own title, filters and actions
 * render normally around it while the user's data is still loading.
 */
export function DataTableSkeleton({
  rows = 6,
  columns = 4,
  label = 'Loading data…',
  className,
}: {
  rows?: number
  columns?: number
  label?: string
  className?: string
}) {
  return (
    <div
      data-testid="data-table-skeleton"
      role="status"
      aria-busy="true"
      className={cn(
        'overflow-hidden rounded-[1.25rem] border border-primary-100/80 bg-white shadow-[0_8px_24px_-16px_rgba(15,39,68,0.18)]',
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <div className="hidden gap-4 border-b border-primary-100 px-4 py-3 md:flex">
        {Array.from({ length: columns }, (_, i) => (
          <Bone key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-primary-50 px-4 py-4 last:border-0">
          <Bone className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Bone className="h-4 w-1/2" />
            <Bone className="h-3 w-1/3" />
          </div>
          {Array.from({ length: Math.max(0, columns - 2) }, (_, c) => (
            <Bone key={c} className="hidden h-4 w-20 md:block" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Listing-card grid (marketplace browse / featured homes). */
export function ListingCardGridSkeleton({
  count = 8,
  label = 'Loading listings…',
  className,
}: {
  count?: number
  label?: string
  className?: string
}) {
  return (
    <div
      data-testid="listing-card-skeleton"
      role="status"
      aria-busy="true"
      className={cn('grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', className)}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-primary-50">
          <Bone className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Bone className="h-5 w-24" />
            <Bone className="h-4 w-3/4" />
            <Bone className="h-3 w-1/2" />
            <div className="flex gap-3 pt-1">
              <Bone className="h-3 w-10" />
              <Bone className="h-3 w-10" />
              <Bone className="h-3 w-10" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ListingDetailBones() {
  return (
    <>
      <Bone className="aspect-[16/9] w-full rounded-2xl sm:aspect-[21/9]" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Bone className="h-8 w-2/3" />
          <Bone className="h-4 w-1/3" />
          <div className="flex gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Bone key={i} className="h-12 w-20 rounded-xl" />
            ))}
          </div>
          <Bone className="h-4 w-full" />
          <Bone className="h-4 w-11/12" />
          <Bone className="h-4 w-4/5" />
        </div>
        <Bone className="h-64 rounded-2xl" />
      </div>
    </>
  )
}

const BODY: Record<SkeletonVariant, () => ReactNode> = {
  dashboard: DashboardBones,
  list: ListBones,
  detail: DetailBones,
  form: FormBones,
  cards: () => (
    <>
      <PageHeaderBones action={false} />
      <ListingCardGridSkeleton />
    </>
  ),
  listing: ListingDetailBones,
}

/** Full-page ghost loader for one page shape. */
export function PageSkeleton({
  variant,
  label = 'Loading page…',
  className,
}: {
  variant: SkeletonVariant
  label?: string
  className?: string
}) {
  const Body = BODY[variant]
  return (
    <div
      data-testid="page-skeleton"
      data-variant={variant}
      role="status"
      aria-busy="true"
      className={cn('w-full min-w-0 space-y-6 overflow-hidden py-2', className)}
    >
      <span className="sr-only">{label}</span>
      <Body />
    </div>
  )
}

const FORM_RE = /\/(new|edit|password|signature)(\/|$)|\/admin\/(config|pipeline|application-journey|inventory-templates|notifications)$/
const LIST_SECTIONS =
  /^\/workspace\/(properties(\/archive)?|sales\/(crm|applications|viewings)|operations\/(maintenance|contractors|documents|communications|payments)|people\/(staff|tenants|leases|landlords)|admin(\/(users|agencies|all-users))?|trust(\/[a-z-]+)?|compliance|platform\/billing|account\/wishlist)$/

/** Pick the ghost layout that matches the page at this path. */
export function skeletonVariantForPath(pathname: string): SkeletonVariant {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/' || path === '/saved') return 'cards'
  if (path === '/browse') return 'cards'
  if (path.startsWith('/listing/')) return 'listing'
  if (path === '/login' || path === '/register' || path.startsWith('/calculators')) return 'form'
  if (!path.startsWith('/workspace')) return 'detail'
  if (path === '/workspace' || path.startsWith('/workspace/portals') || path === '/workspace/insights/reports') {
    return 'dashboard'
  }
  if (FORM_RE.test(path)) return 'form'
  if (LIST_SECTIONS.test(path)) return 'list'
  return 'detail'
}
