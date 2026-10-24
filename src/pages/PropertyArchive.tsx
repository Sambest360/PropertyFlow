import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RotateCcw, Search } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAuth, usePropertyScope } from '../context/AuthContext'
import { BackButton } from '../components/BackButton'
import { Badge, Button, Card, Input, PageHeader } from '../components/ui'
import { canDeleteStoredProperty, canOpenPropertyArchive, isPropertyDeleted } from '../lib/propertyDeletion'
import { sweetConfirm, sweetSuccess, sweetWarning } from '../lib/sweetAlert'
import { usePortalHydrating } from '../components/PortalHydrationGate'
import { DataTableSkeleton } from '../components/loading/PageSkeleton'

function formatDeletedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function PropertyArchive() {
  const dataLoading = usePortalHydrating()
  const { state, restoreProperty } = useStore()
  const { user, agencyId } = useAuth()
  const { allowedPropertyIds } = usePropertyScope()
  const [q, setQ] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const canManageArchive = canOpenPropertyArchive(user.role)

  const archived = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return state.properties
      .filter((p) => allowedPropertyIds.has(p.id) && isPropertyDeleted(p))
      .filter((p) => {
        if (!needle) return true
        return (
          p.title.toLowerCase().includes(needle) ||
          p.address.toLowerCase().includes(needle) ||
          p.suburb.toLowerCase().includes(needle) ||
          p.id.toLowerCase().includes(needle)
        )
      })
      .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
  }, [state.properties, allowedPropertyIds, q])

  const handleRestore = async (id: string, title: string) => {
    const ok = await sweetConfirm(
      'Restore property?',
      `“${title}” will return to your portfolio as a draft.`,
      'Restore',
    )
    if (!ok) return
    setBusyId(id)
    try {
      const result = await restoreProperty(id)
      if (result.ok === false) {
        await sweetWarning('Could not restore', result.reason)
        return
      }
      await sweetSuccess('Property restored', `${title} is back as a draft listing.`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Deleted properties"
        subtitle="Archived listings removed from your active portfolio. Restore a property to edit and publish it again."
        actions={<BackButton to="/workspace/properties" label="Active properties" />}
      />

      <div className="mb-4 max-w-md">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search deleted properties…"
            className="min-h-11 pl-10"
            aria-label="Search deleted properties"
          />
        </div>
      </div>

      {dataLoading ? (
        <DataTableSkeleton />
      ) : archived.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-semibold text-ink">No deleted properties</p>
          <p className="mt-2 text-sm text-ink-500">
            When an agency admin deletes a vacant property, it appears here for reference.
          </p>
          <div className="mt-4 flex justify-center">
            <BackButton to="/workspace/properties" label="Back to active properties" />
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {archived.map((p) => (
            <Card key={p.id} className="p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-ink">{p.title}</h2>
                    <Badge tone="neutral">Deleted</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink-500">
                    {p.suburb}, {p.city} · {p.id}
                  </p>
                  {p.deletedAt ? (
                    <p className="mt-1 text-xs text-ink-400">Deleted {formatDeletedAt(p.deletedAt)}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link to={`/workspace/properties/${p.id}`}>
                    <Button variant="secondary" className="min-h-10 cursor-pointer">
                      View record
                    </Button>
                  </Link>
                  {canManageArchive &&
                  canDeleteStoredProperty({ role: user.role, userId: user.id, agencyId }, p) ? (
                    <Button
                      className="min-h-10 cursor-pointer"
                      disabled={busyId === p.id}
                      onClick={() => void handleRestore(p.id, p.title)}
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      Restore
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
