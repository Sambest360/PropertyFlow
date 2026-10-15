import type { PropertyAsset } from '../types/domain'

/** Map units.status_config_key (+ featured) to portfolio property status and archive timestamp. */
export function propertyStatusFromUnit(
  statusKey: string,
  featured: boolean,
  updatedAt?: string | null,
): { status: PropertyAsset['status']; deletedAt: string | null } {
  if (statusKey === 'DELETED') {
    return { status: 'Archived', deletedAt: updatedAt ?? null }
  }
  const status: PropertyAsset['status'] =
    statusKey === 'DRAFT' || statusKey === 'OFF_MARKET' || statusKey === 'NOT_LISTED'
      ? 'Draft'
      : statusKey === 'OCCUPIED'
        ? 'Rented'
        : statusKey === 'MAINTENANCE'
          ? 'Maintenance'
          : statusKey === 'UNDER_OFFER'
            ? 'Under Offer'
            : statusKey === 'FEATURED' || featured
              ? 'Featured'
              : 'Published'
  return { status, deletedAt: null }
}
