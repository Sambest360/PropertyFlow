import { useState } from 'react'
import { useStore } from '../../context/AppStore'
import { useAuth } from '../../context/AuthContext'
import { DashboardBreadcrumb, DashboardPage } from '../../components/dashboard'
import { Button, Card } from '../../components/ui'
import { SignaturePad } from '../../components/workflow/SignaturePad'
import { isValidSignatureDataUrl } from '../../lib/signature/signatureImage'
import { downscaleSignature } from '../../lib/signature/downscale'

/** Copy for the My signature screen (checked by the CR10 banned-words test). */
export const MY_SIGNATURE_COPY = {
  title: 'My signature',
  intro:
    'Draw your signature once and save it. When you sign your own part of a lease, the sign pad starts with this e-signature. Nobody else can use it.',
  savedHeading: 'Saved signature',
  noneSaved: 'No signature saved yet.',
  drawHeading: 'Draw a new signature',
  saved: 'Signature saved.',
  cleared: 'Saved signature removed.',
  tooLarge: 'This signature image is too large. Clear it and draw it again.',
  failed: 'The signature could not be saved. Try again.',
} as const

export default function AccountSignaturePage() {
  const { user } = useAuth()
  const { state, saveMySignature } = useStore()
  const me = state.users.find((u) => u.id === user.id)
  const saved = me?.signature ?? null
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const homeCrumb =
    user.role === 'tenant'
      ? { label: 'Dashboard', to: '/workspace/portals/tenant' }
      : { label: 'Dashboard', to: '/workspace' }

  const onSave = async () => {
    if (!draft) return
    setBusy(true)
    setMessage(null)
    try {
      const small = await downscaleSignature(draft)
      if (!small || !isValidSignatureDataUrl(small)) {
        setMessage(MY_SIGNATURE_COPY.tooLarge)
        return
      }
      const ok = await saveMySignature(user.id, small)
      setMessage(ok ? MY_SIGNATURE_COPY.saved : MY_SIGNATURE_COPY.failed)
      if (ok) setDraft(null)
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const ok = await saveMySignature(user.id, null)
      setMessage(ok ? MY_SIGNATURE_COPY.cleared : MY_SIGNATURE_COPY.failed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <DashboardPage>
      <DashboardBreadcrumb items={[homeCrumb, { label: MY_SIGNATURE_COPY.title }]} />
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-ink-900">{MY_SIGNATURE_COPY.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">{MY_SIGNATURE_COPY.intro}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink-900">{MY_SIGNATURE_COPY.savedHeading}</h2>
          {saved ? (
            <div className="mt-3 space-y-3">
              <img
                src={saved}
                alt="Your saved signature"
                className="h-36 w-full rounded-2xl border border-primary-100 bg-white object-contain"
                data-testid="saved-signature-preview"
              />
              <Button type="button" variant="secondary" disabled={busy} onClick={onRemove}>
                Remove saved signature
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">{MY_SIGNATURE_COPY.noneSaved}</p>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">{MY_SIGNATURE_COPY.drawHeading}</h2>
          <SignaturePad value={null} onChange={setDraft} />
          <div className="mt-3 flex items-center gap-3">
            <Button type="button" disabled={!draft || busy} onClick={onSave}>
              Save signature
            </Button>
            {message ? (
              <p className="text-sm text-ink-600" role="status">
                {message}
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </DashboardPage>
  )
}
