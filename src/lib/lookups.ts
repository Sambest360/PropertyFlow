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
  const byOrder = (a: LookupConfig, b: LookupConfig) =>
    a.sortOrder - b.sortOrder || a.displayLabel.localeCompare(b.displayLabel)
  const match = (clientId: string) =>
    lookups.filter((l) => l.clientId === clientId && l.configType === configType)
  const visible = (rows: LookupConfig[]) =>
    rows.filter((l) => includeInactive || l.isActive).sort(byOrder)

  if (opts?.scopeOnly === 'global' || agencyId === GLOBAL_CLIENT_ID || !agencyId) {
    return visible(match(GLOBAL_CLIENT_ID))
  }
  if (opts?.scopeOnly === 'agency') {
    return visible(match(agencyId))
  }

  // Merge before filtering, so a hidden agency override hides the default too.
  const byKey = new Map<string, LookupConfig>()
  for (const row of match(GLOBAL_CLIENT_ID)) byKey.set(row.keyValue, row)
  for (const row of match(agencyId)) byKey.set(row.keyValue, row)
  return visible(Array.from(byKey.values()))
}

/**
 * The agency's own copy of a built-in (global) row, with `patch` applied.
 * Built-in defaults are shared by every agency, so edits are stored as an
 * agency row of the same key; reuses the agency's existing copy if any.
 */
export function agencyOverrideFor(
  lookups: LookupConfig[],
  row: LookupConfig,
  agencyId: string,
  patch: Partial<LookupConfig> = {},
): LookupConfig {
  const existing = lookups.find(
    (l) => l.clientId === agencyId && l.configType === row.configType && l.keyValue === row.keyValue,
  )
  const base: LookupConfig = existing ?? {
    ...row,
    id: `lk-${agencyId}-${row.configType}-${row.keyValue}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    clientId: agencyId,
  }
  return { ...base, ...patch, id: base.id, clientId: agencyId }
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
