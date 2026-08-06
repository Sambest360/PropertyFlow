import { useMemo } from 'react'
import type { AppUser } from '../../types/domain'
import { useStore } from '../../context/AppStore'
import { listApprovedContractors } from '../../lib/contractors'
import { Select } from '../ui'

export function ContractorPicker({
  agencyId,
  categoryKey,
  value,
  onChange,
  disabled,
  className,
  placeholder = 'Select contractor…',
  allowEmpty = true,
}: {
  agencyId: string | null
  categoryKey?: string | null
  value: string
  onChange: (contractorUserId: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
  allowEmpty?: boolean
}) {
  const { state } = useStore()
  const contractors = useMemo(
    () => listApprovedContractors(state.agencyContractors, state.users, agencyId, categoryKey),
    [state.agencyContractors, state.users, agencyId, categoryKey],
  )

  return (
    <Select
      className={className ?? 'min-h-11 w-full'}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Contractor"
    >
      {allowEmpty ? <option value="">{placeholder}</option> : null}
      {contractors.map((c: AppUser) => (
        <option key={c.id} value={c.id}>
          {c.name}
          {c.company ? ` · ${c.company}` : ''}
        </option>
      ))}
    </Select>
  )
}
