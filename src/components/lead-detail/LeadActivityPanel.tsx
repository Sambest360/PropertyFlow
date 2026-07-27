import type { Lead } from '../../types/domain'
import { Button, Card, Input } from '../ui'

export function LeadActivityPanel({
  lead,
  canManage,
  note,
  onNoteChange,
  onLogNote,
}: {
  lead: Lead
  canManage: boolean
  note: string
  onNoteChange: (v: string) => void
  onLogNote: () => void
}) {
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Activity</h2>
        <p className="mt-1 text-sm text-ink-500">
          Log follow-ups and keep a running note trail for this lead.
        </p>

        <div className="mt-4 rounded-xl border border-primary-50 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Current notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">
            {lead.notes?.trim() || 'No notes yet.'}
          </p>
        </div>

        {canManage ? (
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              onLogNote()
            }}
          >
            <Input
              className="min-h-11 flex-1"
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Add activity note…"
              aria-label="Activity note"
            />
            <Button type="submit" className="min-h-11">
              Log note
            </Button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-ink-500">You can view notes but cannot log new activity.</p>
        )}
      </Card>
    </div>
  )
}
