import { HistoryTimeline } from '../history/HistoryTimeline'

/** @deprecated Prefer HistoryTimeline — kept for existing applicant imports. */
export function ApplicantHistoryTimeline({
  events,
}: {
  events: Parameters<typeof HistoryTimeline>[0]['events']
}) {
  return (
    <HistoryTimeline
      events={events}
      title="History"
      subtitle="Timeline of stage changes and actions for this applicant."
    />
  )
}
