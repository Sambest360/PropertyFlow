const prefetched = new Set<string>()

const PREFETCH_BY_PREFIX: Array<{ prefix: string; load: () => Promise<unknown> }> = [
  { prefix: '/workspace/sales/crm', load: () => import('../pages/CRM') },
  { prefix: '/workspace/sales/viewings', load: () => import('../pages/Viewings') },
  { prefix: '/workspace/sales/applications', load: () => import('../pages/Applications') },
  { prefix: '/workspace/properties', load: () => import('../pages/Properties') },
  { prefix: '/workspace/operations/maintenance', load: () => import('../pages/Maintenance') },
  { prefix: '/workspace/operations/communications', load: () => import('../pages/Communications') },
  { prefix: '/workspace/operations/payments', load: () => import('../pages/Payments') },
  { prefix: '/workspace/insights/reports', load: () => import('../pages/Reports') },
  { prefix: '/workspace', load: () => import('../pages/Dashboard') },
]

/** Prefetch a lazy route chunk once per path (workspace nav hover/focus). */
export function prefetchWorkspaceRoute(path: string): void {
  const normalized = path.split('?')[0]
  if (!normalized.startsWith('/workspace') || prefetched.has(normalized)) return
  const match = PREFETCH_BY_PREFIX.find((e) => normalized.startsWith(e.prefix))
  if (!match) return
  prefetched.add(normalized)
  void match.load()
}
