import { useEffect, useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { Button, Card } from '../ui'
import { isApiEnabled } from '../../lib/api/config'
import { fetchUserPhoto, saveUserPhoto } from '../../lib/api/agencyProfileApi'
import { AVATAR_RESIZE, resizeImageFile } from '../../lib/imageResize'
import { initials } from '../../lib/contactLinks'
import { sweetError, sweetSuccess } from '../../lib/sweetAlert'

/**
 * Round profile photo shown on the listings this person is linked to. The
 * server decides who may change it (self, agency admin for own staff, super
 * admin); `canEdit` from GET hides the buttons otherwise.
 */
export function ProfilePhotoCard({ userId, name, own }: { userId: string; name: string; own?: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isApiEnabled) return
    let cancelled = false
    fetchUserPhoto(userId)
      .then((r) => {
        if (cancelled) return
        setUrl(r.avatarUrl)
        setCanEdit(r.canEdit)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!isApiEnabled) return null

  const save = async (photo: string | null) => {
    setBusy(true)
    try {
      const r = await saveUserPhoto(userId, photo)
      setUrl(r.avatarUrl)
      await sweetSuccess(photo ? 'Photo saved' : 'Photo removed', photo ? 'It now shows on the listings you are linked to.' : '')
    } catch (err) {
      await sweetError('Could not save the photo', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    try {
      await save(await resizeImageFile(file, AVATAR_RESIZE))
    } catch (err) {
      await sweetError('Could not use this image', err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      {url ? (
        <img src={url} alt={name} className="h-20 w-20 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary-50 font-display text-2xl font-semibold text-primary">
          {initials(name)}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="inline-flex items-center gap-2 font-semibold text-ink">
          <Camera className="h-5 w-5 text-primary" aria-hidden /> {own ? 'Your profile photo' : 'Profile photo'}
        </h2>
        <p className="text-sm text-ink-500">Shown on public listings this person is the contact for. A clear head-and-shoulders photo works best.</p>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                void pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? 'Saving…' : url ? 'Change photo' : 'Upload photo'}
            </Button>
            {url ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(null)}>
                Remove
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  )
}
