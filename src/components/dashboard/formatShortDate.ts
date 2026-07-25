/** Format ISO date (YYYY-MM-DD) as DD.MM.YY for compact ops lists. */
export function formatShortDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${String(y).slice(2)}`
}

export function initials(name: string, max = 2) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, max)
    .toUpperCase()
}
