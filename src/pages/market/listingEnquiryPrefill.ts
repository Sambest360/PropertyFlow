export type EnquiryContactUser = {
  email?: string
  name?: string
  firstName?: string
  lastName?: string
  phone?: string
}

export type EnquiryContactFields = {
  email: string
  firstName: string
  lastName: string
  phone: string
}

/** Merge signed-in profile into enquiry form fields (only fills empty slots). */
export function prefillEnquiryContact(
  user: EnquiryContactUser,
  current: EnquiryContactFields,
): EnquiryContactFields {
  const parts = (user.name ?? '').trim().split(/\s+/).filter(Boolean)
  const fromNameFirst = parts[0] ?? ''
  const fromNameLast = parts.slice(1).join(' ')

  return {
    email: current.email || user.email || '',
    firstName: current.firstName || user.firstName || fromNameFirst || '',
    lastName: current.lastName || user.lastName || fromNameLast || '',
    phone: current.phone || user.phone || '',
  }
}
