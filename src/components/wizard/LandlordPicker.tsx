import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppUser } from '../../types/domain'
import { Input, cn } from '../ui'

export type LandlordDraft = {
  linkLandlord: boolean
  landlordId: string
  landlordManualName: string
  landlordManualEmail: string
  landlordManualPhone: string
  landlordEntryMode: 'search' | 'manual'
}

export function LandlordPicker({
  landlords,
  value,
  onChange,
  className,
}: {
  landlords: AppUser[]
  value: LandlordDraft
  onChange: (next: LandlordDraft) => void
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = landlords.find((u) => u.id === value.landlordId)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = landlords.filter((u) => u.active)
    if (!q) return list.slice(0, 8)
    return list
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          (u.email?.toLowerCase().includes(q) ?? false) ||
          (u.phone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')),
      )
      .slice(0, 8)
  }, [landlords, query])

  function patch(partial: Partial<LandlordDraft>) {
    onChange({ ...value, ...partial })
  }

  function setOwnership(linkLandlord: boolean) {
    if (linkLandlord) {
      patch({ linkLandlord: true })
      return
    }
    patch({
      linkLandlord: false,
      landlordId: '',
      landlordManualName: '',
      landlordManualEmail: '',
      landlordManualPhone: '',
    })
  }

  return (
    <div className={cn('space-y-4', className)} ref={rootRef}>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Property ownership</legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-primary-100 px-3 py-2.5 text-sm text-ink-600 has-[:checked]:border-primary has-[:checked]:bg-primary-50/40">
          <input
            type="radio"
            name="landlord-ownership"
            className="mt-1"
            checked={!value.linkLandlord}
            onChange={() => setOwnership(false)}
          />
          <span>
            <span className="font-medium text-ink">Agency-owned</span>
            <span className="mt-0.5 block text-xs text-ink-500">No landlord needed — you can save the property now.</span>
          </span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-primary-100 px-3 py-2.5 text-sm text-ink-600 has-[:checked]:border-primary has-[:checked]:bg-primary-50/40">
          <input
            type="radio"
            name="landlord-ownership"
            className="mt-1"
            checked={value.linkLandlord}
            onChange={() => setOwnership(true)}
          />
          <span>
            <span className="font-medium text-ink">Private landlord</span>
            <span className="mt-0.5 block text-xs text-ink-500">Search for someone already on the system, or enter their details below.</span>
          </span>
        </label>
      </fieldset>

      {value.linkLandlord ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(
                'min-h-9 cursor-pointer rounded-full border px-3 text-xs font-semibold transition',
                value.landlordEntryMode === 'search'
                  ? 'border-primary bg-primary-50 text-primary'
                  : 'border-primary-100 text-ink-600 hover:border-primary',
              )}
              onClick={() =>
                patch({
                  landlordEntryMode: 'search',
                  landlordManualName: '',
                  landlordManualEmail: '',
                  landlordManualPhone: '',
                })
              }
            >
              Search existing
            </button>
            <button
              type="button"
              className={cn(
                'min-h-9 cursor-pointer rounded-full border px-3 text-xs font-semibold transition',
                value.landlordEntryMode === 'manual'
                  ? 'border-primary bg-primary-50 text-primary'
                  : 'border-primary-100 text-ink-600 hover:border-primary',
              )}
              onClick={() => patch({ landlordEntryMode: 'manual', landlordId: '' })}
            >
              Add new landlord
            </button>
          </div>

          {value.landlordEntryMode === 'search' ? (
            <div className="relative">
              <Input
                className="min-h-11"
                placeholder="Type name, email, or phone…"
                value={open ? query : selected ? selected.name : query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  patch({ landlordId: '' })
                  setOpen(true)
                }}
                onFocus={() => setOpen(true)}
              />
              {selected && !open ? (
                <p className="mt-1 text-xs text-ink-500">
                  {selected.email}
                  {selected.phone ? ` · ${selected.phone}` : ''}
                </p>
              ) : null}
              {open && filtered.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-primary-100 bg-white py-1 shadow-lg">
                  {filtered.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        className="flex w-full cursor-pointer flex-col px-3 py-2 text-left text-sm hover:bg-primary-50"
                        onClick={() => {
                          patch({ landlordId: u.id })
                          setQuery('')
                          setOpen(false)
                        }}
                      >
                        <span className="font-medium text-ink">{u.name}</span>
                        <span className="text-xs text-ink-500">
                          {u.email}
                          {u.phone ? ` · ${u.phone}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {open && query.trim() && filtered.length === 0 ? (
                <p className="mt-1 text-xs text-ink-500">
                  No match found — use <strong>Add new landlord</strong> to enter their details.
                </p>
              ) : null}
              {!query.trim() && filtered.length === 0 ? (
                <p className="mt-1 text-xs text-ink-500">
                  No landlords on file yet — use <strong>Add new landlord</strong> to create one.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                className="min-h-11 sm:col-span-2"
                placeholder="Landlord full name *"
                value={value.landlordManualName}
                onChange={(e) => patch({ landlordManualName: e.target.value, landlordId: '' })}
              />
              <Input
                className="min-h-11"
                type="email"
                placeholder="Email (optional)"
                value={value.landlordManualEmail}
                onChange={(e) => patch({ landlordManualEmail: e.target.value })}
              />
              <Input
                className="min-h-11"
                placeholder="Phone (optional)"
                value={value.landlordManualPhone}
                onChange={(e) => patch({ landlordManualPhone: e.target.value })}
              />
              <p className="sm:col-span-2 text-xs text-ink-500">
                Their profile will be created automatically when you save this property.
              </p>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

export function resolveLandlordAssignment(
  draft: LandlordDraft,
  opts: {
    isLandlordUser: boolean
    currentUserId: string
    agencyId: string
    users: AppUser[]
    createUser: (
      input: Omit<AppUser, 'id' | 'active'> & {
        active?: boolean
        onTempPassword?: (tempPassword: string) => void
      },
    ) => AppUser
    /** Michael #96: receives the server-generated temp password for a new landlord (one-time modal). */
    onTempPassword?: (tempPassword: string) => void
  },
): string {
  if (opts.isLandlordUser) return opts.currentUserId
  if (!draft.linkLandlord) return ''

  if (draft.landlordId) return draft.landlordId

  const name = draft.landlordManualName.trim()
  if (!name) return ''

  const email =
    draft.landlordManualEmail.trim() ||
    `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')}@landlord.local`

  const existing = opts.users.find(
    (u) => u.role === 'landlord' && u.email?.toLowerCase() === email.toLowerCase(),
  )
  if (existing) return existing.id

  const created = opts.createUser({
    name,
    email,
    phone: draft.landlordManualPhone.trim() || undefined,
    role: 'landlord',
    agencyId: opts.agencyId,
    verification: { status: 'pending', submittedAt: new Date().toISOString() },
    ...(opts.onTempPassword ? { onTempPassword: opts.onTempPassword } : {}),
  })
  return created.id
}

export function validateLandlordAssignment(draft: LandlordDraft, isLandlordUser: boolean): string | null {
  if (isLandlordUser || !draft.linkLandlord) return null
  if (draft.landlordEntryMode === 'search' && !draft.landlordId) {
    return 'Select a landlord from the list, switch to “Add new landlord”, or choose “Agency-owned”.'
  }
  if (draft.landlordEntryMode === 'manual' && !draft.landlordManualName.trim()) {
    return 'Enter the landlord’s name, or choose “Agency-owned” if no external owner applies.'
  }
  return null
}
