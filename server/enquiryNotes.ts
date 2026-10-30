/**
 * T1: enquiry notes never carry an ID / passport number. Register interest
 * used to append an `ID/Passport: …` line to leads.notes, the waitlist and the
 * viewing booking. New writes no longer do; this strips the line from rows
 * written before the fix when they are read (the stored rows are untouched).
 */
const ID_LINE = /^[ \t]*ID\/Passport:.*(?:\r?\n|$)/gim

export function stripIdPassportLines(notes: string): string
export function stripIdPassportLines(notes: string | null | undefined): string | null | undefined
export function stripIdPassportLines(notes: string | null | undefined): string | null | undefined {
  if (typeof notes !== 'string' || !/ID\/Passport:/i.test(notes)) return notes
  return notes.replace(ID_LINE, '').replace(/\n+$/, '')
}
