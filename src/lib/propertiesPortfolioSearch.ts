import type { PortfolioProperty } from '../components/properties/types'

/** Read the global / toolbar search term from the properties list URL. */
export function propertiesListQueryFromParams(params: URLSearchParams): string {
  return params.get('q') ?? ''
}

/** Apply or clear `q` on the properties list query string (other params preserved). */
export function withPropertiesListQuery(
  params: URLSearchParams,
  query: string,
): URLSearchParams {
  const next = new URLSearchParams(params)
  const trimmed = query.trim()
  if (trimmed) next.set('q', trimmed)
  else next.delete('q')
  return next
}

export type PortfolioSearchFields = Pick<
  PortfolioProperty,
  'property' | 'buildingName' | 'unitNumber'
>

/** Text match for properties portfolio rows (global search + toolbar). */
export function portfolioPropertyMatchesSearchQuery(
  item: PortfolioSearchFields,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const p = item.property
  return (
    p.title.toLowerCase().includes(needle) ||
    p.address.toLowerCase().includes(needle) ||
    p.suburb.toLowerCase().includes(needle) ||
    p.city.toLowerCase().includes(needle) ||
    p.id.toLowerCase().includes(needle) ||
    p.type.toLowerCase().includes(needle) ||
    (item.buildingName?.toLowerCase().includes(needle) ?? false) ||
    (item.unitNumber?.toLowerCase().includes(needle) ?? false)
  )
}
