export function ColumnPicker<K extends string>({
  columns,
  visible,
  onToggle,
}: {
  columns: ReadonlyArray<{ key: K; label: string }>
  visible: ReadonlyArray<K>
  onToggle: (key: K) => void
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-600">
      <legend className="sr-only">Columns</legend>
      <span className="font-semibold uppercase tracking-wide text-ink-400">Columns</span>
      {columns.map((c) => (
        <label key={c.key} className="inline-flex min-h-9 cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={visible.includes(c.key)}
            onChange={() => onToggle(c.key)}
          />
          {c.label}
        </label>
      ))}
    </fieldset>
  )
}
