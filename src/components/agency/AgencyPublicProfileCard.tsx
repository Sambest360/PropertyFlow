import { useEffect, useRef, useState } from 'react'
import { Building2 } from 'lucide-react'
import { Button, Card, Input, Textarea } from '../ui'
import { isApiEnabled } from '../../lib/api/config'
import { fetchAgencyProfile, saveAgencyProfile } from '../../lib/api/agencyProfileApi'
import { LOGO_RESIZE, resizeImageFile } from '../../lib/imageResize'
import { initials } from '../../lib/contactLinks'
import { sweetError, sweetSuccess } from '../../lib/sweetAlert'

type Fields = { phone: string; email: string; website: string; address: string; description: string }
const EMPTY: Fields = { phone: '', email: '', website: '', address: '', description: '' }

/**
 * The agency details shown on its public listings: contact details and logo.
 * Agency admins edit their own agency; super admins any. The agency name is
 * read-only here (the server ignores it too).
 */
export function AgencyPublicProfileCard({ agencyId }: { agencyId: string }) {
  const [name, setName] = useState('')
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  // undefined = keep, null = remove, string = new data URL
  const [logo, setLogo] = useState<string | null | undefined>(undefined)
  const [canEdit, setCanEdit] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isApiEnabled || !agencyId) return
    let cancelled = false
    fetchAgencyProfile(agencyId)
      .then((p) => {
        if (cancelled) return
        setName(p.name)
        setFields({ phone: p.phone ?? '', email: p.email ?? '', website: p.website ?? '', address: p.address ?? '', description: p.description ?? '' })
        setLogoUrl(p.logoUrl)
        setLogo(undefined)
        setCanEdit(p.canEdit)
        setLoaded(true)
      })
      .catch(() => setLoaded(false))
    return () => {
      cancelled = true
    }
  }, [agencyId])

  if (!isApiEnabled || !loaded) return null

  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [k]: e.target.value }))
  const shownLogo = logo === undefined ? logoUrl : logo

  const pick = async (file: File | undefined) => {
    if (!file) return
    try {
      setLogo(await resizeImageFile(file, LOGO_RESIZE))
    } catch (err) {
      await sweetError('Could not use this image', err instanceof Error ? err.message : String(err))
    }
  }

  const save = async () => {
    setBusy(true)
    try {
      const p = await saveAgencyProfile(agencyId, { ...fields, ...(logo !== undefined ? { logo } : {}) })
      setFields({ phone: p.phone ?? '', email: p.email ?? '', website: p.website ?? '', address: p.address ?? '', description: p.description ?? '' })
      setLogoUrl(p.logoUrl)
      setLogo(undefined)
      await sweetSuccess('Saved', 'Your listings now show these details.')
    } catch (err) {
      await sweetError('Could not save', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="inline-flex items-center gap-2 font-semibold text-ink">
          <Building2 className="h-5 w-5 text-primary" aria-hidden /> Agency details on listings
        </h2>
        <p className="text-sm text-ink-500">
          Shown to the public under each of {name || 'your agency'}’s listings. Leave a field empty to hide it. The agency name can only be changed by a
          platform administrator.
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {shownLogo ? (
          <img src={shownLogo} alt={`${name} logo`} className="h-20 w-40 shrink-0 rounded-xl border border-primary-100 object-contain p-1" />
        ) : (
          <div className="flex h-20 w-40 shrink-0 items-center justify-center rounded-xl bg-primary-50 font-display text-2xl font-semibold text-primary">
            {initials(name)}
          </div>
        )}
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
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
              {shownLogo ? 'Change logo' : 'Upload logo'}
            </Button>
            {shownLogo ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setLogo(null)}>
                Remove logo
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-medium text-ink">Agency name</span>
          <Input className="mt-1" value={name} disabled readOnly />
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink">Office phone</span>
          <Input className="mt-1" type="tel" value={fields.phone} disabled={!canEdit} onChange={set('phone')} />
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink">Public email</span>
          <Input className="mt-1" type="email" value={fields.email} disabled={!canEdit} onChange={set('email')} />
        </label>
        <label className="text-sm">
          <span className="font-medium text-ink">Website</span>
          <Input className="mt-1" value={fields.website} placeholder="www.example.co.za" disabled={!canEdit} onChange={set('website')} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="font-medium text-ink">Office address</span>
          <Input className="mt-1" value={fields.address} disabled={!canEdit} onChange={set('address')} />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="font-medium text-ink">Short description</span>
          <Textarea className="mt-1" rows={3} maxLength={600} value={fields.description} disabled={!canEdit} onChange={set('description')} />
        </label>
      </div>
      {canEdit ? (
        <Button disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save agency details'}
        </Button>
      ) : (
        <p className="text-xs text-ink-400">Only an agency administrator can change these details.</p>
      )}
    </Card>
  )
}
