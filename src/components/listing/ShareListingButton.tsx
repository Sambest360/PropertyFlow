import { useEffect, useState } from 'react'
import { Check, Share2 } from 'lucide-react'

/**
 * Share a public listing: the native share sheet where the browser has one
 * (phones), otherwise copy the link and say so for a moment.
 */
export function ShareListingButton({ title, url }: { title: string; url?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (status === 'idle') return
    const t = window.setTimeout(() => setStatus('idle'), 2500)
    return () => window.clearTimeout(t)
  }, [status])

  const share = async () => {
    const link = url ?? window.location.href
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: title, url: link })
        return
      } catch (err) {
        // The person closed the share sheet: nothing to do.
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(link)
      setStatus('copied')
    } catch {
      window.prompt('Copy this link to share the property:', link)
      setStatus('failed')
    }
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-primary-100 px-4 py-2 text-sm font-semibold hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-live="polite"
    >
      {status === 'copied' ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
      {status === 'copied' ? 'Link copied' : 'Share'}
    </button>
  )
}
