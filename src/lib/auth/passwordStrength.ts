/**
 * Shared password-strength scoring (unit-tested, UI-agnostic).
 *
 * 0 = empty, 1-4 = weak → strong. Deliberately simple and deterministic:
 * length classes + character variety + small bonuses/penalties. Not a
 * cryptanalytic estimate — just honest, actionable feedback for users.
 */
export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: '' | 'Weak' | 'Fair' | 'Good' | 'Strong'
  /** Shortest suggestion that would raise the score, or null when maxed. */
  hint: string | null
}

export function passwordStrength(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: '', hint: null }
  let score = 0
  if (pw.length >= 8) score += 1
  if (pw.length >= 12) score += 1
  const classes =
    (/[a-z]/.test(pw) ? 1 : 0) +
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/[0-9]/.test(pw) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pw) ? 1 : 0)
  score += classes >= 3 ? 1 : 0
  score += classes >= 4 && pw.length >= 10 ? 1 : 0
  // Common-pattern penalties
  if (/^(?:password|qwerty|123456|letmein|admin|welcome)/i.test(pw)) score = Math.min(score, 1)
  if (/(.)\1{2,}/.test(pw)) score -= 1
  const clamped = Math.max(1, Math.min(4, score)) as 1 | 2 | 3 | 4
  const labels = { 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' } as const
  let hint: string | null = null
  if (clamped < 4) {
    if (pw.length < 12) hint = 'use 12+ characters'
    else if (classes < 3) hint = 'mix upper, lower, and numbers'
    else if (classes < 4) hint = 'add a symbol'
    else hint = 'avoid repeated characters'
  }
  return { score: clamped, label: labels[clamped], hint }
}

/** Server and client registration gate. Score 1 is the "Weak" bucket (common prefixes, no variety). */
export function passwordMeetsPolicy(pw: string): { ok: true } | { ok: false; message: string } {
  if (!pw || pw.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters' }
  }
  const strength = passwordStrength(pw)
  if (strength.score < 2) {
    return {
      ok: false,
      message: 'Password is too weak. Use a longer mix of letters, numbers, and symbols.',
    }
  }
  return { ok: true }
}
