export type TextSelection = {
  start: number
  end: number
}

export function insertTextAtCursor(
  value: string,
  selection: TextSelection,
  insert: string,
): { next: string; selection: TextSelection } {
  const before = value.slice(0, selection.start)
  const after = value.slice(selection.end)
  const next = before + insert + after
  const caret = selection.start + insert.length
  return { next, selection: { start: caret, end: caret } }
}

export function wrapSelection(
  value: string,
  selection: TextSelection,
  wrap: string,
): { next: string; selection: TextSelection } {
  const selected = value.slice(selection.start, selection.end)
  const wrapped = `${wrap}${selected || 'text'}${wrap}`
  return insertTextAtCursor(value, selection, wrapped)
}

export function insertParagraphBreak(value: string, selection: TextSelection): { next: string; selection: TextSelection } {
  const needsLead = selection.start > 0 && value[selection.start - 1] !== '\n'
  const insert = needsLead ? '\n\n' : '\n\n'
  return insertTextAtCursor(value, selection, insert)
}

export function prefixLinesAsBullets(value: string, selection: TextSelection): { next: string; selection: TextSelection } {
  const block = value.slice(selection.start, selection.end)
  const lines = block.length ? block.split('\n') : ['']
  const prefixed = lines.map((line) => (line.trim() ? `• ${line.replace(/^•\s*/, '')}` : '• ')).join('\n')
  return insertTextAtCursor(value, selection, prefixed)
}

export function prefixLinesAsNumbers(value: string, selection: TextSelection): { next: string; selection: TextSelection } {
  const block = value.slice(selection.start, selection.end)
  const lines = block.length ? block.split('\n') : ['']
  const prefixed = lines
    .map((line, i) => {
      const stripped = line.replace(/^\d+\.\s*/, '').trim()
      return stripped ? `${i + 1}. ${stripped}` : `${i + 1}. `
    })
    .join('\n')
  return insertTextAtCursor(value, selection, prefixed)
}

export function insertSectionHeading(value: string, selection: TextSelection, title = 'Section'): { next: string; selection: TextSelection } {
  const insert = `\n\n${title}:\n`
  return insertTextAtCursor(value, selection, insert)
}

export function countParagraphs(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\n\s*\n/).filter(Boolean).length
}
