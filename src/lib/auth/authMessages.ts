/** Extract the server-provided Retry-After value from an Error, in minutes. */
function retryAfterMinutes(err: unknown): number | null {
  if (err == null || typeof err !== 'object') return null
  const v = (err as { retryAfterSec?: number | string }).retryAfterSec
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n / 60)) : null
}

/** Map raw API / auth errors to friendly copy for SweetAlert. */
export function formatAuthError(message: string, err?: unknown): { title: string; text?: string } {
  const raw = (message ?? '').trim()
  const lower = raw.toLowerCase()
  const isEmptyPayload = !raw || raw === '{}' || raw === 'null' || raw === '[object object]'

  if (lower.includes('request body too large') || lower.includes('1048576')) {
    return {
      title: 'Uploads too large',
      text: 'Registration documents are saved separately after sign-up. If you still see this, use smaller PDF or image files (under 5 MB each) and try again.',
    }
  }

  if (lower.includes('user already registered') || lower.includes('already been registered') || lower.includes('email already registered')) {
    return {
      title: 'Email already in use',
      text: 'An account with this email already exists. Sign in instead, or use a different email.',
    }
  }

  // P0-2 (R4): Supabase reports a stale / revoked / expired session token as
  // invalid_grant. Telling users to "check email and password" sends them
  // chasing credentials that are actually fine — name the real problem.
  if (lower.includes('invalid_grant')) {
    return {
      title: 'Session expired',
      text: 'Your previous session expired or was revoked. Sign in again with your email and password to continue.',
    }
  }

  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid email or password') ||
    lower.includes('invalid_credentials')
  ) {
    return {
      title: 'Sign-in failed',
      text: 'Check your email and password, then try again.',
    }
  }

  if (lower.includes('email not confirmed') || lower.includes('not confirmed')) {
    return {
      title: 'Confirm your email',
      text: 'Check your inbox for the confirmation link, then sign in.',
    }
  }

  if (
    lower.includes('invalid email') ||
    lower.includes('unable to validate email') ||
    lower.includes('email address') && lower.includes('invalid')
  ) {
    return {
      title: 'Use a real email address',
      text: 'Demo domains such as @propertyflow.demo cannot receive mail and are rejected. Register with an inbox you control (Gmail plus-addressing is fine).',
    }
  }

  if (lower.includes('password') && lower.includes('least')) {
    return { title: 'Weak password', text: raw }
  }

  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('too many attempts') ||
    lower.includes('over_email_send_rate_limit') ||
    lower.includes('429')
  ) {
    const mins = retryAfterMinutes(err)
    return {
      title: 'Too many attempts',
      text: mins
        ? `Too many attempts from this email or network. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`
        : 'Too many attempts from this email or network. Wait a few minutes, then retry — or use a different plus-address (you+test2@gmail.com).',
    }
  }

  // Guest/register 500s are ordinary auth/service failures — never blame a
  // "broken demo user" or surface npm run db:repair-auth in prod guest UX.
  // repair-auth is an ops tool for seeded QA identities only (see scripts/).
  if (
    lower.includes('server error') ||
    lower.includes('internal server') ||
    /\b500\b/.test(lower) ||
    lower.includes('unexpected_failure')
  ) {
    return {
      title: 'Auth service error',
      text: 'The auth service failed. Try again in a moment. If this keeps happening, contact support.',
    }
  }

  if (lower.includes('timed out') || lower.includes('failed to fetch') || lower.includes('network')) {
    return {
      title: 'Connection timed out',
      text: 'Check your internet and try again — your account was not locked out.',
    }
  }

  if (lower.includes('profile sync failed') || lower.includes('profile not found')) {
    return {
      title: 'Account created',
      text: 'Your account was created but setup is still finishing. Try signing in in a moment.',
    }
  }

  if (isEmptyPayload) {
    return {
      title: 'Sign-in failed',
      text: 'The server did not explain why. Check your email and password, wait a moment if you just registered, then try again.',
    }
  }

  // P1-4: Provide a more specific fallback message
  return {
    title: 'Authentication error',
    text: raw || 'An unexpected error occurred. Please try again or contact support if the problem persists.',
  }
}
