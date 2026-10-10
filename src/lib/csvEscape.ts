/**
 * CSV cell escaping shared by the report exports. A text value starting with
 * =, +, -, @, tab or CR is prefixed with ' so spreadsheets don't run it as a
 * formula (CSV injection). Plain numbers, negatives included, stay as they are.
 */
const FORMULA_START = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/

export function csvEscape(v: string): string {
  let s = v
  if (FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
