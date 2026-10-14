/** D3 / FW-12: temp-password sessions carry users.metadata.mustChangePassword. */
export function mustChangePasswordFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return meta?.mustChangePassword === true
}
