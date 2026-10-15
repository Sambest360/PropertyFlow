type PropertyLoaderProps = {
  label?: string
  size?: 'sm' | 'md' | 'lg'
  inline?: boolean
  className?: string
}

const sizeClass: Record<NonNullable<PropertyLoaderProps['size']>, string> = {
  sm: 'h-6 w-6 border-2',
  md: 'h-9 w-9 border-2',
  lg: 'h-12 w-12 border-[3px]',
}

export function PropertyLoader({
  label,
  size = 'md',
  inline = false,
  className = '',
}: PropertyLoaderProps) {
  const spinner = (
    <div
      role="status"
      aria-label={label ?? 'Loading'}
      className={`animate-spin rounded-full border-ink-200 border-t-brand-600 ${sizeClass[size]} ${className}`}
    />
  )

  if (inline) return spinner

  return (
    <div className="flex flex-col items-center gap-2">
      {spinner}
      {label ? <p className="text-sm text-ink-500">{label}</p> : null}
    </div>
  )
}
