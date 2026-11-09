/**
 * Postgres CHECK violations (SQLSTATE 23514) on a persist write are the
 * caller's bad input, so they answer 400 with a stable code instead of 500.
 * Only 23514: every other database error keeps its current status.
 */
export function checkViolationFromDbError(
  err: unknown,
): (Error & { status: 400; code: 'INVALID_FIELD_VALUE'; constraint?: string }) | null {
  if (!err || typeof err !== 'object' || (err as { code?: unknown }).code !== '23514') return null
  const raw = (err as { constraint?: unknown }).constraint
  const constraint = typeof raw === 'string' && raw ? raw : undefined
  return Object.assign(
    new Error(`A value is outside the allowed range${constraint ? ` (${constraint})` : ''}. Check the form and try again.`),
    { status: 400 as const, code: 'INVALID_FIELD_VALUE' as const, ...(constraint ? { constraint } : {}) },
  )
}
