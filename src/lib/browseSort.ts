import type { BrowseFilterState } from '../components/BrowseFilters'

/**
 * Browse sort → unitsFeed sort (T4, spec r4). In 'all' mode a sale has only
 * a price and a rental only a rent, so the price sort uses price ?? rent
 * (amount_*); sorting 'all' on price alone tied every rental, and asc and
 * desc came out the same.
 */
export function browseSortToApi(sort: BrowseFilterState['sort'], mode: string) {
  if (sort === 'newest') return 'newest' as const
  if (sort === 'beds-desc') return 'beds_desc' as const
  if (sort === 'price-asc') return mode === 'rent' ? ('rent_asc' as const) : mode === 'buy' ? ('price_asc' as const) : ('amount_asc' as const)
  if (sort === 'price-desc') return mode === 'rent' ? ('rent_desc' as const) : mode === 'buy' ? ('price_desc' as const) : ('amount_desc' as const)
  // Recommended: newest from the API; featured listings are then lifted per
  // area (featuredRanking), so a featured listing elsewhere never jumps the queue.
  return 'newest' as const
}
