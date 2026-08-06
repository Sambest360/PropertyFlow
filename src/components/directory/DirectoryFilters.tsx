import type { ReactNode, SelectHTMLAttributes } from 'react'
import { Select, cn } from '../ui'

/** Consistent filter/sort select used across Team, Tenants, and Users directories. */
export function DirectoryFilterSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <Select className={cn('min-h-10 cursor-pointer text-sm', className)} {...props}>
      {children}
    </Select>
  )
}

/** Result count line for directory toolbars. */
export function directoryResultLabel(
  filtered: number,
  total: number,
  singular: string,
  plural: string,
): string {
  const noun = filtered === 1 ? singular : plural
  if (filtered === total) return `${filtered} ${noun}`
  return `${filtered} of ${total} ${plural}`
}
