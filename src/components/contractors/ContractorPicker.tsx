import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import type { AppUser } from '../../types/domain'
import { useStore } from '../../context/AppStore'
import { contractorMatchesCategory, listApprovedContractors } from '../../lib/contractors'
import { Select } from '../ui'

const verified = (u: AppUser) =>
  !u.verification || u.verification.status === 'approved' || u.verification.status === 'not_required'

/**
 * Contractor dropdown. Roster contractors who handle the category come first,
 * then the rest of the roster; with `includeOthers`, verified contractors who
 * are not on the roster yet follow (the caller adds them on save).
 */
export function ContractorPicker({
  agencyId,
  categoryKey,
  value,
  onChange,
  disabled,
  className,
  placeholder = 'Select contractor…',
  allowEmpty = true,
  includeOthers = false,
}: {
  agencyId: string | null
  categoryKey?: string | null
  value: string
  onChange: (contractorUserId: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
  allowEmpty?: boolean
  includeOthers?: boolean
}) {
  const { state } = useStore()
  const groups = useMemo(() => {
    const roster = listApprovedContractors(state.agencyContractors, state.users, agencyId, null)
    const rosterRows = state.agencyContractors.filter((r) => r.agencyId === agencyId && r.status === 'approved')
    const matches = (u: AppUser) => {
      if (!categoryKey) return true
      const row = rosterRows.find((r) => r.contractorUserId === u.id)
      return row ? contractorMatchesCategory(row, categoryKey) : false
    }
    const onRoster = new Set(roster.map((u) => u.id))
    return {
      matching: roster.filter(matches),
      otherRoster: roster.filter((u) => !matches(u)),
      others: includeOthers
        ? state.users
            .filter((u) => u.role === 'contractor' && u.active !== false && verified(u) && !onRoster.has(u.id))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    }
  }, [state.agencyContractors, state.users, agencyId, categoryKey, includeOthers])

  const label = (c: AppUser) => `${c.name}${c.company ? ` · ${c.company}` : ''}`
  const empty = !groups.matching.length && !groups.otherRoster.length && !groups.others.length

  return (
    <div>
      <Select
        className={className ?? 'min-h-11 w-full'}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Contractor"
      >
        {allowEmpty ? <option value="">{placeholder}</option> : null}
        {groups.matching.length ? (
          <optgroup label={categoryKey ? 'On your roster · handles this' : 'On your roster'}>
            {groups.matching.map((c) => (
              <option key={c.id} value={c.id}>
                {label(c)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {groups.otherRoster.length ? (
          <optgroup label="On your roster · other trades">
            {groups.otherRoster.map((c) => (
              <option key={c.id} value={c.id}>
                {label(c)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {groups.others.length ? (
          <optgroup label="Other verified contractors (added to your roster)">
            {groups.others.map((c) => (
              <option key={c.id} value={c.id}>
                {label(c)}
              </option>
            ))}
          </optgroup>
        ) : null}
      </Select>
      {empty ? (
        <p className="mt-1 text-xs text-ink-500">
          No contractors yet.{' '}
          <Link to="/workspace/operations/contractors?tab=find" className="font-semibold text-primary hover:underline">
            Find a contractor
          </Link>
        </p>
      ) : null}
    </div>
  )
}
