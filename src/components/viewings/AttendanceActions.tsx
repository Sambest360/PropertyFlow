import { Button } from '../ui'

export function AttendanceActions({
  disabled,
  onMark,
}: {
  disabled?: boolean
  onMark: (status: 'COMPLETED' | 'NO_SHOW', viewingMode: 'IN_PERSON' | 'VIRTUAL') => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" className="min-h-11" disabled={disabled} onClick={() => onMark('COMPLETED', 'IN_PERSON')}>
        Attended
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="min-h-11"
        disabled={disabled}
        onClick={() => onMark('NO_SHOW', 'IN_PERSON')}
      >
        No-show
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="min-h-11"
        disabled={disabled}
        onClick={() => onMark('COMPLETED', 'VIRTUAL')}
      >
        Virtual
      </Button>
    </div>
  )
}
