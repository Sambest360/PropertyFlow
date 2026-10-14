/**
 * Guards against a slow /api/auth/me probe overwriting fresher login or
 * change-password state (FW-09 A01 / FW-07 L02 overlap).
 */
export function isStaleSessionProbe(
  generationAtProbeStart: number,
  currentGeneration: number,
): boolean {
  return generationAtProbeStart !== currentGeneration
}
