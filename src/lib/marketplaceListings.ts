import type { PropertyAsset } from '../types/domain'

/** Featured first, then the rest — each property id appears once (G01 duplicate Featured). */
export function orderFeaturedListings(properties: PropertyAsset[]): PropertyAsset[] {
  const live = properties.filter((p) => !['Draft', 'Archived', 'Maintenance'].includes(p.status))
  const seen = new Set<string>()
  const out: PropertyAsset[] = []
  const push = (p: PropertyAsset) => {
    if (seen.has(p.id)) return
    seen.add(p.id)
    out.push(p)
  }
  for (const p of live) if (p.featured) push(p)
  for (const p of live) if (!p.featured) push(p)
  return out
}
