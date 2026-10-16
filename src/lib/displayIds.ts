import { isListingUuid } from './listingIds'

const UUID_IN_TEXT_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** RFC4122 backend id (same rule as listing hydration). */
export function isBackendUuid(id: string | null | undefined): boolean {
  if (!id?.trim()) return false
  return isListingUuid(id.trim())
}

/** Never show raw backend UUIDs in the UI. */
export function hideBackendUuid(
  id: string | null | undefined,
  fallback = '—',
): string {
  if (!id?.trim()) return fallback
  const v = id.trim()
  if (isBackendUuid(v)) return fallback
  return v
}

/** Prefer a human label; avoid leaking UUID when the label is missing. */
export function labelOrReference(
  label: string | null | undefined,
  id: string | null | undefined,
  missingLabel = '—',
): string {
  if (label?.trim()) return label.trim()
  if (!id?.trim()) return missingLabel
  if (isBackendUuid(id)) return missingLabel
  return id.trim()
}

/** Strip backend UUIDs from API / toast copy. */
export function sanitizeUserFacingMessage(text: string): string {
  if (!text) return text
  return text.replace(UUID_IN_TEXT_RE, '[hidden]').replace(/\s{2,}/g, ' ').trim()
}
