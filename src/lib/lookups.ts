import type { LookupConfig } from '../data/infrastructure'
import { CONFIG_TYPE_DEFS, GLOBAL_CLIENT_ID } from '../data/platformLookups'

export { GLOBAL_CLIENT_ID, CONFIG_TYPE_DEFS }
/** @deprecated use GLOBAL_CLIENT_ID */
export const PLATFORM_CLIENT_ID = GLOBAL_CLIENT_ID

/**
 * Active lookups for a config type: global ∪ agency-specific.
 * Agency rows with the same keyValue override global labels/active state.
 */
export function getLookups(
  lookups: LookupConfig[],
  agencyId: string | null | undefined,
  configType: string,
  opts?: { includeInactive?: boolean; scopeOnly?: 'global' | 'agency' },
): LookupConfig[] {
  const includeInactive = opts?.includeInactive ?? false
  const match = (clientId: string) =>
    lookups
      .filter(
        (l) =>
          l.clientId === clientId &&
          l.configType === configType &&
          (includeInactive || l.isActive),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder || a.displayLabel.localeCompare(b.displayLabel))

  if (opts?.scopeOnly === 'global' || agencyId === GLOBAL_CLIENT_ID || !agencyId) {
    return match(GLOBAL_CLIENT_ID)
  }
  if (opts?.scopeOnly === 'agency') {
    return match(agencyId)
  }

  const globalRows = match(GLOBAL_CLIENT_ID)
  const agencyRows = match(agencyId)
  const byKey = new Map<string, LookupConfig>()
  for (const row of globalRows) byKey.set(row.keyValue, row)
  for (const row of agencyRows) byKey.set(row.keyValue, row)
  return Array.from(byKey.values()).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.displayLabel.localeCompare(b.displayLabel),
  )
}

export function getLookupOptions(
  lookups: LookupConfig[],
  agencyId: string | null | undefined,
  configType: string,
): Array<{ value: string; label: string }> {
  return getLookups(lookups, agencyId, configType).map((l) => ({
    value: l.keyValue,
    label: l.displayLabel,
  }))
}

export function lookupLabel(
  lookups: LookupConfig[],
  agencyId: string | null | undefined,
  configType: string,
  keyValue: string,
): string {
  const row = getLookups(lookups, agencyId, configType, { includeInactive: true }).find(
    (l) => l.keyValue === keyValue,
  )
  return row?.displayLabel ?? keyValue
}

export function configTypeLabel(configType: string): string {
  return CONFIG_TYPE_DEFS.find((d) => d.type === configType)?.label ?? configType
}

export function isGlobalLookup(clientId: string) {
  return clientId === GLOBAL_CLIENT_ID
}
