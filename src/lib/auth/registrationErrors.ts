/** Registration succeeded but the user must sign in manually (no active session yet). */
export class RegistrationRedirectError extends Error {
    readonly kind: 'email_confirmation' | 'sign_in_required'
    readonly email: string
  
    constructor(
      kind: 'email_confirmation' | 'sign_in_required',
      email: string,
      message?: string,
    ) {
      super(
        message ??
          (kind === 'email_confirmation'
            ? 'Account created — check your email to confirm, then sign in.'
            : 'Account created — sign in with your email and password to continue.'),
      )
      this.name = 'RegistrationRedirectError'
      this.kind = kind
      this.email = email
    }
  }
  
  export function isRegistrationRedirectError(err: unknown): err is RegistrationRedirectError {
    if (err instanceof RegistrationRedirectError) return true
    if (!(err instanceof Error) || err.name !== 'RegistrationRedirectError') return false
    const candidate = err as RegistrationRedirectError
    return (
      (candidate.kind === 'email_confirmation' || candidate.kind === 'sign_in_required') &&
      typeof candidate.email === 'string'
    )
  }
  