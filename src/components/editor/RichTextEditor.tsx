/**
 * A small rich text editor (bold, italic, underline, headings, lists) that
 * stores safe HTML. Optional merge fields insert {{tokens}} at the cursor.
 */
import { useEffect, useRef } from 'react'
import { Bold, Heading2, Heading3, Italic, List, ListOrdered, Pilcrow, Underline } from 'lucide-react'
import { sanitizeLeaseHtml } from '../../lib/lease/leaseTemplate'
import { cn } from '../ui'

type Cmd = { label: string; icon: typeof Bold; run: () => void }

export function RichTextEditor({
  value,
  onChange,
  mergeFields,
  label,
  minHeightPx = 360,
}: {
  value: string
  onChange: (html: string) => void
  mergeFields?: ReadonlyArray<{ key: string; label: string }>
  label: string
  minHeightPx?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef<string>('')

  // Load outside changes (e.g. "Start from the standard lease") without
  // resetting the cursor on every keystroke.
  useEffect(() => {
    const el = ref.current
    if (!el || value === last.current) return
    el.innerHTML = sanitizeLeaseHtml(value)
    last.current = value
  }, [value])

  const emit = () => {
    const el = ref.current
    if (!el) return
    const html = sanitizeLeaseHtml(el.innerHTML)
    last.current = html
    onChange(html)
  }

  const exec = (command: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(command, false, arg)
    emit()
  }

  const commands: Cmd[] = [
    { label: 'Bold', icon: Bold, run: () => exec('bold') },
    { label: 'Italic', icon: Italic, run: () => exec('italic') },
    { label: 'Underline', icon: Underline, run: () => exec('underline') },
    { label: 'Section heading', icon: Heading2, run: () => exec('formatBlock', 'h2') },
    { label: 'Sub-heading', icon: Heading3, run: () => exec('formatBlock', 'h3') },
    { label: 'Paragraph', icon: Pilcrow, run: () => exec('formatBlock', 'p') },
    { label: 'Bulleted list', icon: List, run: () => exec('insertUnorderedList') },
    { label: 'Numbered list', icon: ListOrdered, run: () => exec('insertOrderedList') },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-primary-100 bg-white focus-within:border-primary">
      <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap items-center gap-1 border-b border-primary-100 bg-primary-50/60 px-2 py-1.5">
        {commands.map((c) => (
          <button
            key={c.label}
            type="button"
            title={c.label}
            aria-label={c.label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={c.run}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 hover:bg-white hover:text-ink"
          >
            <c.icon className="h-4 w-4" aria-hidden />
          </button>
        ))}
        {mergeFields?.length ? (
          <select
            aria-label="Insert a merge field"
            className="ml-auto h-9 rounded-lg border border-primary-100 bg-white px-2 text-sm text-ink"
            value=""
            onChange={(e) => {
              const key = e.target.value
              if (key) exec('insertText', `{{${key}}}`)
            }}
          >
            <option value="">Insert a field…</option>
            {mergeFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        style={{ minHeight: minHeightPx }}
        className={cn(
          'max-h-[70vh] overflow-y-auto px-4 py-3 text-sm leading-relaxed text-ink outline-none',
          '[&_h2]:mt-4 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold',
          '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6',
        )}
      />
    </div>
  )
}
