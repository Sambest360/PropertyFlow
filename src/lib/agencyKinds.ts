/**
 * A landlord who signs up gets a private "portfolio" record in the agencies
 * table (server/auth.ts createLandlordPortfolio) so their properties have an
 * owner. It is not an agency: agency lists and pickers leave it out, and the
 * landlord shows on People → Landlords instead.
 */
import type { Agency } from '../types/domain'

export function isLandlordPortfolio(a: Pick<Agency, 'id'> & { isLandlordPortfolio?: boolean }): boolean {
  return a.isLandlordPortfolio === true || a.id.startsWith('ag-ll-')
}

/** Real estate agencies only (no landlord portfolios). */
export function realAgencies<T extends Pick<Agency, 'id'> & { isLandlordPortfolio?: boolean }>(agencies: readonly T[]): T[] {
  return agencies.filter((a) => !isLandlordPortfolio(a))
}
