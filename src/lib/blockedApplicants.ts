import type { Application, AppUser } from '../types/domain'

/** Property IDs this user is blocked from (cannot browse, apply, or attend viewings). */
export function blockedPropertyIdsForApplicant(
  applications: Application[],
  user: Pick<AppUser, 'id' | 'email'>,
): Set<string> {
  return new Set(
    applications
      .filter(
        (a) =>
          a.stage === 'Blocked' &&
          (a.applicantUserId === user.id ||
            a.email.toLowerCase() === user.email.toLowerCase()),
      )
      .map((a) => a.propertyId),
  )
}

export function isApplicantBlockedOnProperty(
  applications: Application[],
  propertyId: string,
  identity: { userId?: string | null; email?: string | null; name?: string | null },
): boolean {
  return applications.some((a) => {
    if (a.propertyId !== propertyId || a.stage !== 'Blocked') return false
    if (identity.userId && a.applicantUserId === identity.userId) return true
    if (identity.email && a.email.toLowerCase() === identity.email.toLowerCase()) return true
    if (identity.name && a.applicantName.toLowerCase() === identity.name.toLowerCase()) return true
    return false
  })
}

export function viewingBelongsToApplication(
  viewing: { applicantName: string; applicantEmail?: string },
  app: Application,
): boolean {
  if (viewing.applicantEmail && viewing.applicantEmail.toLowerCase() === app.email.toLowerCase()) {
    return true
  }
  return viewing.applicantName.toLowerCase() === app.applicantName.toLowerCase()
}
