export type TenantDetailTab = 'overview' | 'details' | 'lease' | 'payments' | 'history'

export const TENANT_DETAIL_TABS: TenantDetailTab[] = [
  'overview',
  'details',
  'lease',
  'payments',
  'history',
]

export function isTenantDetailTab(v: string | null): v is TenantDetailTab {
  return Boolean(v && (TENANT_DETAIL_TABS as string[]).includes(v))
}

export const ICON_STROKE = 1.6
