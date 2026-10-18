export default function CrashFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold text-ink-900">Something went wrong</h1>
      <p className="max-w-sm text-sm text-ink-600">
        An unexpected error occurred. Reload the page to try again.
      </p>
      <button
        type="button"
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </div>
  )
}
