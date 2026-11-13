/**
 * Join the parts of a one-line summary with " · ", skipping anything empty.
 * A ticket's asset label or reporter can be missing (older rows, or hidden
 * from the signed-in role); a template string would print "undefined".
 */
export function joinParts(...parts: Array<string | number | null | undefined | false>): string {
  return parts
    .map((p) => (p == null || p === false ? '' : String(p).trim()))
    .filter(Boolean)
    .join(' · ')
}
