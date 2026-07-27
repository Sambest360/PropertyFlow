import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  AGENCY_CAPABILITY_GROUPS,
  DEFAULT_AGENCY_PERMISSIONS,
  permissionLabels,
} from '../../lib/permissions'
import type { Permission } from '../../types/domain'
import { Button, cn } from '../ui'

const ICON_STROKE = 1.6

export function AgencyCapabilityChecklist({
  value,
  onChange,
  className,
  allowed,
  resetTo,
}: {
  value: Permission[]
  onChange: (next: Permission[]) => void
  className?: string
  /** When set, only these permissions are shown / selectable (e.g. agency pack ∩ role). */
  allowed?: Permission[]
  /** Defaults for the Reset button (falls back to DEFAULT_AGENCY_PERMISSIONS). */
  resetTo?: Permission[]
}) {
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const allowedSet = allowed ? new Set(allowed) : null
  const valueSet = new Set(value)

  const groups = AGENCY_CAPABILITY_GROUPS.map((group) => ({
    ...group,
    permissions: allowedSet
      ? group.permissions.filter((p) => allowedSet.has(p))
      : group.permissions,
  })).filter((g) => g.permissions.length > 0)

  const resetDefaults = resetTo?.length ? resetTo : DEFAULT_AGENCY_PERMISSIONS
  const enabledCount = allowedSet
    ? value.filter((p) => allowedSet.has(p)).length
    : value.length

  function togglePermission(permission: Permission) {
    if (valueSet.has(permission)) {
      onChange(value.filter((p) => p !== permission))
    } else {
      onChange([...value, permission])
    }
  }

  function selectAllInGroup(permissions: Permission[]) {
    const next = new Set(value)
    for (const p of permissions) next.add(p)
    onChange([...next])
  }

  function clearGroup(permissions: Permission[]) {
    const drop = new Set(permissions)
    onChange(value.filter((p) => !drop.has(p)))
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border border-primary-100', className)}>
      <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-2 border-b border-primary-100 bg-white px-3 py-2.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="min-h-11 cursor-pointer"
          onClick={() =>
            onChange(
              allowedSet ? resetDefaults.filter((p) => allowedSet.has(p)) : [...resetDefaults],
            )
          }
        >
          Reset to defaults
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="min-h-11 cursor-pointer"
          onClick={() => onChange([])}
        >
          Clear all
        </Button>
        <p className="ml-auto tabular text-xs font-medium text-ink-500">
          {enabledCount} enabled
        </p>
      </div>

      <ul
        className="max-h-[min(28rem,55vh)] overflow-y-auto overscroll-contain [scrollbar-width:thin]"
        role="list"
      >
        {groups.map((group) => {
          const enabledInGroup = group.permissions.filter((p) => valueSet.has(p)).length
          const allSelected = enabledInGroup === group.permissions.length
          const isOpen = openGroupId === group.id

          return (
            <li key={group.id} className="border-b border-primary-50 last:border-b-0">
              <button
                type="button"
                aria-expanded={isOpen}
                className={cn(
                  'flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  isOpen ? 'bg-primary-50/70' : 'hover:bg-primary-50/40',
                )}
                onClick={() => setOpenGroupId(isOpen ? null : group.id)}
              >
                <span
                  className={cn(
                    'w-0.5 self-stretch rounded-full',
                    isOpen ? 'bg-primary' : 'bg-primary-100',
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-semibold', isOpen ? 'text-ink' : 'text-ink')}>
                    {group.label}
                  </span>
                  <span className="tabular text-xs text-ink-400">
                    {enabledInGroup} of {group.permissions.length} enabled
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 shrink-0 text-ink-400 transition-transform duration-200',
                    isOpen && 'rotate-180 text-primary',
                  )}
                  strokeWidth={ICON_STROKE}
                  aria-hidden
                />
              </button>

              {isOpen ? (
                <div className="space-y-2 border-t border-primary-50 bg-primary-50/30 px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="min-h-11 cursor-pointer"
                      disabled={allSelected}
                      onClick={() => selectAllInGroup(group.permissions)}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="min-h-11 cursor-pointer"
                      disabled={enabledInGroup === 0}
                      onClick={() => clearGroup(group.permissions)}
                    >
                      Clear group
                    </Button>
                  </div>
                  <ul className="space-y-1" role="list">
                    {group.permissions.map((permission) => {
                      const checked = valueSet.has(permission)
                      const label = permissionLabels[permission] ?? permission
                      const id = `perm-${group.id}-${permission}`
                      return (
                        <li key={permission}>
                          <label
                            htmlFor={id}
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-white"
                          >
                            <input
                              id={id}
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePermission(permission)}
                              className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-ink">{label}</span>
                              <span className="block font-mono text-[11px] text-ink-400">
                                {permission}
                              </span>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}