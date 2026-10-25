/**
 * Plain-language reason when a new application is refused by the server,
 * instead of a generic "could not be saved" that hides the real cause.
 */
export const APPLICATION_SAVE_FALLBACK = 'Application could not be saved for agency review. Please try again.'

export function applicationSaveMessage(serverError: string | undefined | null): string {
  const e = (serverError ?? '').trim()
  if (!e) return APPLICATION_SAVE_FALLBACK
  if (/viewing/i.test(e)) {
    return 'This property requires you to book and attend a viewing before you apply. Book a viewing from this page first.'
  }
  if (/still loading/i.test(e)) {
    return 'Your account is still loading. Wait a few seconds and try again.'
  }
  if (/sign in|unauthori[sz]ed|401/i.test(e)) return 'Your session has expired. Sign in again and re-submit.'
  if (/already/i.test(e)) return e
  // Server messages are written for people; pass short ones through.
  return e.length <= 160 ? e : APPLICATION_SAVE_FALLBACK
}
