/** P2: hide the address line when it only repeats the property title. */
export function normaliseAddressText(v: string | null | undefined): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when the address adds something the title doesn't already say. */
export function shouldShowAddressLine(title: string | null | undefined, address: string | null | undefined): boolean {
  const a = normaliseAddressText(address)
  if (!a) return false
  const t = normaliseAddressText(title)
  return !(a === t || t.includes(a))
}
