import type { ListingDescriptionContext } from '../../lib/listingDescriptionDraft'
import { SmartTextEditor } from '../editor/SmartTextEditor'
import { cn } from '../ui'

export function ListingDescriptionEditor({
  value,
  onChange,
  label = 'Description',
  className,
  id,
  listingContext,
}: {
  value: string
  onChange: (next: string) => void
  label?: string
  className?: string
  id?: string
  listingContext?: ListingDescriptionContext
}) {
  return (
    <SmartTextEditor
      id={id}
      label={label}
      className={cn(className)}
      value={value}
      onChange={onChange}
      variant="listing"
      listingContext={listingContext}
    />
  )
}
