/** Minimum length for every new password (register, change, temp passwords). Shared by client and server. */
export const MIN_PASSWORD_LENGTH = 10

/** Hint shown next to new-password fields on Register and SetPassword. */
export function passwordMinLengthHint(): string {
  return `At least ${MIN_PASSWORD_LENGTH} characters`
}
