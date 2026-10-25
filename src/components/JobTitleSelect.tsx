import { useState } from 'react'
import { PLATFORM_CATALOGUE } from '../data/platformLookups'
import { useLookupOptions } from '../hooks/useLookupOptions'
import { Input, Select } from './ui'

const OTHER = '__other__'

/**
 * Job title picker from the agency's Job titles list (Admin → Configuration).
 * The title is stored as its label; "Other" lets the applicant type one, and a
 * saved title that is not in the list shows as Other with its text.
 */
export function JobTitleSelect({
  value,
  onChange,
  agencyId,
  className,
  ariaLabel = 'Job title',
}: {
  value: string
  onChange: (next: string) => void
  agencyId: string | null | undefined
  className?: string
  ariaLabel?: string
}) {
  const configured = useLookupOptions('JOB_TITLE', agencyId || null).map((o) => o.label)
  // Guests may not have the agency's lists loaded; fall back to the built-in titles.
  const options = configured.length ? configured : (PLATFORM_CATALOGUE.JOB_TITLE ?? []).map((t) => t.label)
  const listed = options.includes(value)
  const [otherChosen, setOtherChosen] = useState(false)
  const showOther = otherChosen || (Boolean(value) && !listed)

  return (
    <div className={className}>
      <Select
        className="w-full"
        aria-label={ariaLabel}
        value={showOther ? OTHER : value}
        onChange={(e) => {
          const next = e.target.value
          if (next === OTHER) {
            setOtherChosen(true)
            onChange('')
          } else {
            setOtherChosen(false)
            onChange(next)
          }
        }}
      >
        <option value="">Select your job title</option>
        {options.map((title) => (
          <option key={title} value={title}>
            {title}
          </option>
        ))}
        <option value={OTHER}>Other (type it)</option>
      </Select>
      {showOther ? (
        <Input
          className="mt-2"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your job title"
          aria-label={`${ariaLabel} (other)`}
          autoFocus={otherChosen}
        />
      ) : null}
    </div>
  )
}
