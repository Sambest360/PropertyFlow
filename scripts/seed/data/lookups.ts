import {
    CONFIG_TYPE_DEFS,
    GLOBAL_CLIENT_ID,
    PLATFORM_CATALOGUE,
  } from '../../../src/data/platformLookups.js'
  import { fixedUuid } from '../helpers.js'
  
  export { GLOBAL_CLIENT_ID as GLOBAL_CLIENT_FE_ID }
  
  /** Postgres UUID for platform-wide lookup defaults (`settings.frontend_id = global`). */
  export const GLOBAL_CLIENT_UUID = fixedUuid('b1000000', 1)
  
  export type DbLookupRow = {
    id: string
    client_id: string
    config_type: string
    key_value: string
    display_label: string
    is_active: boolean
    sort_order: number
    meta: { frontend_id: string; frontend_client_id: string }
  }
  
  export function buildLookupRows(
    clientUuid: string,
    frontendClientId: string,
    uuidPrefix: string,
  ): DbLookupRow[] {
    const rows: DbLookupRow[] = []
    let n = 0
  
    for (const def of CONFIG_TYPE_DEFS) {
      const items = PLATFORM_CATALOGUE[def.type] ?? []
      items.forEach((item, sortOrder) => {
        n += 1
        const feId =
          frontendClientId === GLOBAL_CLIENT_ID
            ? `lk-global-${def.type.toLowerCase()}-${sortOrder}`
            : `lk-${frontendClientId}-${def.type.toLowerCase()}-${sortOrder}`
        rows.push({
          id: fixedUuid(uuidPrefix, n),
          client_id: clientUuid,
          config_type: def.type,
          key_value: item.key,
          display_label: item.label,
          is_active: true,
          sort_order: sortOrder,
          meta: { frontend_id: feId, frontend_client_id: frontendClientId },
        })
      })
    }
  
    return rows
  }
  
  export const GLOBAL_CLIENT_ROW = {
    id: GLOBAL_CLIENT_UUID,
    company_name: 'PropertyFlow Platform',
    subdomain: 'platform-global',
    status: 'active',
    trading_as: 'Global configuration defaults',
    email: 'platform@propertyflow.demo',
    city: 'Cape Town',
    province: 'Western Cape',
    country_code: 'ZA',
    timezone: 'Africa/Johannesburg',
    currency_code: 'ZAR',
    settings: {
      frontend_id: GLOBAL_CLIENT_ID,
      enabledPermissions: [],
      isGlobalConfigClient: true,
    },
  }
  