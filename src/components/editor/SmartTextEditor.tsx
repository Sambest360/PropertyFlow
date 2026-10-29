import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'
import {
  List,
  ListOrdered,
  Pilcrow,
  TextQuote,
  Type,
} from 'lucide-react'
import type { ListingDescriptionContext } from '../../lib/listingDescriptionDraft'
import { buildListingSummaryBlock } from '../../lib/listingDescriptionDraft'
import {
  countParagraphs,
  insertParagraphBreak,
  insertSectionHeading,
  insertTextAtCursor,
  prefixLinesAsBullets,
  prefixLinesAsNumbers,
  type TextSelection,
} from '../../lib/textEditorInsert'
import { cn } from '../ui'

const ICON_STROKE = 1.6

const VARIANT_COPY = {
  listing: {
    placeholder:
      'Describe the property, location, and ideal tenant or buyer. Leave a blank line between paragraphs — they display separately on the listing.',
    hint: 'Use the toolbar for lists and section headings. Insert a summary from your wizard details, then personalise.',
  },
  operational: {
    placeholder: 'Describe what happened, access arrangements, and anything already tried…',
    hint: 'Use snippets for common fields. Bullet lists help contractors and support staff scan quickly.',
  },
} as const

const OPERATIONAL_SNIPPETS = ['Access:', 'Tenant reported:', 'Photos attached:', 'Contractor notes:']

export function SmartTextEditor({
  value,
  onChange,
  label,
  className,
  id: idProp,
  variant = 'listing',
  disabled,
  maxLength,
  listingContext,
  minHeightPx = 160,
}: {
  value: string
  onChange: (next: string) => void
  label?: string
  className?: string
  id?: string
  variant?: 'listing' | 'operational'
  disabled?: boolean
  maxLength?: number
  listingContext?: ListingDescriptionContext
  minHeightPx?: number
}) {
  const autoId = useId()
  const id = idProp ?? autoId
  const hintId = `${id}-hint`
  const metaId = `${id}-meta`
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Grow with the text up to a cap, then scroll inside the box.
    const max = Math.max(minHeightPx, Math.min(420, Math.round(window.innerHeight * 0.5)))
    el.style.height = 'auto'
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minHeightPx), max)}px`
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
  }, [value, minHeightPx])

  const getSelection = (): TextSelection => {
    const el = ref.current
    if (!el) return { start: value.length, end: value.length }
    return { start: el.selectionStart, end: el.selectionEnd }
  }

  const applyEdit = useCallback(
    (result: { next: string; selection: TextSelection }) => {
      if (maxLength != null && result.next.length > maxLength) return
      onChange(result.next)
      requestAnimationFrame(() => {
        const el = ref.current
        if (!el) return
        el.focus()
        el.setSelectionRange(result.selection.start, result.selection.end)
      })
    },
    [maxLength, onChange],
  )

  const run = (fn: (v: string, sel: TextSelection) => { next: string; selection: TextSelection }) => {
    applyEdit(fn(value, getSelection()))
  }

  const insertSummary = () => {
    if (!listingContext) return
    const block = buildListingSummaryBlock(listingContext)
    const sel = getSelection()
    const insert = value.trim() && sel.start === sel.end && sel.start === value.length ? `\n\n${block}` : block
    applyEdit(insertTextAtCursor(value, sel, insert))
  }

  const copy = VARIANT_COPY[variant]
  const paragraphs = countParagraphs(value)

  return (
    <div className={cn('space-y-2', className)}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}

      <div className="rounded-xl border border-primary-100 bg-white focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
        <div className="flex flex-wrap gap-1 border-b border-primary-50 px-2 py-2">
          <ToolbarButton
            label="Section heading"
            onClick={() => run((v, s) => insertSectionHeading(v, s, 'Features'))}
            disabled={disabled}
          >
            <Type className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="Bullet list"
            onClick={() => run(prefixLinesAsBullets)}
            disabled={disabled}
          >
            <List className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            onClick={() => run(prefixLinesAsNumbers)}
            disabled={disabled}
          >
            <ListOrdered className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="New paragraph"
            onClick={() => run(insertParagraphBreak)}
            disabled={disabled}
          >
            <Pilcrow className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
          </ToolbarButton>
          {variant === 'listing' && listingContext ? (
            <button
              type="button"
              disabled={disabled}
              onClick={insertSummary}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-primary-100 bg-primary-50/80 px-2.5 text-xs font-semibold text-primary hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <TextQuote className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              Insert property summary
            </button>
          ) : null}
          {variant === 'operational'
            ? OPERATIONAL_SNIPPETS.map((snippet) => (
                <button
                  key={snippet}
                  type="button"
                  disabled={disabled}
                  onClick={() => run((v, s) => insertTextAtCursor(v, s, `${snippet} `))}
                  className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-primary-100 px-2.5 text-xs font-medium text-ink-600 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {snippet}
                </button>
              ))
            : null}
        </div>
        <textarea
          ref={ref}
          id={id}
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          placeholder={copy.placeholder}
          aria-describedby={`${hintId} ${metaId}`}
          className="scrollbar-thin min-h-40 w-full resize-y overscroll-contain border-0 bg-transparent px-3 py-2 text-base leading-relaxed text-ink placeholder:text-ink-400 focus:outline-none sm:text-sm"
        />
      </div>

      <p id={hintId} className="text-xs text-ink-400">{copy.hint}</p>
      <p id={metaId} className="text-xs text-ink-400">
        {value.length.toLocaleString()}
        {maxLength != null ? ` / ${maxLength.toLocaleString()}` : ''} characters
        {paragraphs > 0 ? ` · ${paragraphs} paragraph${paragraphs === 1 ? '' : 's'}` : ''}
      </p>
    </div>
  )
}

function ToolbarButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg text-ink-600 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}
