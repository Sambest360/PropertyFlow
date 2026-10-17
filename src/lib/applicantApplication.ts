import type { Application, AppUser } from '../types/domain'

/** Applicant's application on a specific listing, if any. */
export function findOwnApplicationForProperty(
  applications: Application[],
  user: Pick<AppUser, 'id' | 'email'>,
  propertyId: string,
): Application | null {
  if (!propertyId?.trim() || !user.id || user.id === 'guest') return null
  const email = user.email?.trim().toLowerCase()
  return (
    applications.find(
      (a) =>
        a.propertyId === propertyId &&
        (a.applicantUserId === user.id || (email && a.email?.trim().toLowerCase() === email)),
    ) ?? null
  )
}
