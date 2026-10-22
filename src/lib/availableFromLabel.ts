const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Available from 1 Feb 2027" */
export function availableFromLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return `Available from ${iso.slice(0, 10)}`
  return `Available from ${d} ${MONTHS[m - 1]} ${y}`
}
