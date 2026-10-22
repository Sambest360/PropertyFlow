/** Human-readable employment line for applications and persistence. */
export function formatEmploymentSummary(
  employerName?: string | null,
  jobTitle?: string | null,
  fallback = 'To be completed',
): string {
  const employer = employerName?.trim()
  const title = jobTitle?.trim()
  if (employer && title) return `${employer} — ${title}`
  if (employer) return employer
  if (title) return title
  return fallback
}
