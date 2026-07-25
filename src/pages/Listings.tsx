import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Archive, Eye, Megaphone, Star } from 'lucide-react'
import { useStore } from '../context/AppStore'
import { useAgencyScope, useAuth } from '../context/AuthContext'
import { isFieldAgent } from '../lib/permissions'
import { RequirePermission } from '../components/RequirePermission'
import { Badge, Button, Card, PageHeader, statusTone } from '../components/ui'
import { formatZAR } from '../data/seed'

export default function Listings() {
  const { state, publishProperty, updateProperty } = useStore()
  const { has } = useAuth()
  const { scopeAgency, scopeAgent, scopeLandlord, role } = useAgencyScope()

  const list = useMemo(() => {
    return state.properties.filter((p) => {
      if (!scopeAgency(p.agencyId)) return false
      if (isFieldAgent(role) && !scopeAgent(p.agentId)) return false
      if (role === 'landlord' && !scopeLandlord(p.landlordId)) return false
      return true
    })
  }, [state.properties, scopeAgency, scopeAgent, scopeLandlord, role])

  return (
    <RequirePermission anyOf={['listings.publish', 'assets.view']}>
      <div className="animate-fade-in">
        <PageHeader
          title="Listings Workspace"
          subtitle="Publish, feature, and archive listings for the public marketplace."
          actions={
            has('assets.manage') ? (
              <Link to="/workspace/properties/new">
                <Button>
                  <Megaphone className="h-4 w-4" /> Create listing
                </Button>
              </Link>
            ) : null
          }
        />

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-primary-100 bg-primary-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Listing</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Price / Rent</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary">
                {list.map((p) => {
                  const agent = state.users.find((u) => u.id === p.agentId)
                  return (
                    <tr key={p.id} className="hover:bg-primary-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img src={p.images[0]} alt="" className="h-12 w-16 rounded-lg object-cover" />
                          <div>
                            <Link to={`/workspace/properties/assets/${p.id}`} className="font-medium text-ink hover:underline">
                              {p.title}
                            </Link>
                            <p className="text-xs text-ink-400">
                              {p.id} · {p.suburb}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-600">{p.type}</td>
                      <td className="px-4 py-3 tabular font-medium">
                        {p.price ? formatZAR(p.price) : `${formatZAR(p.rent ?? 0)}/mo`}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                      </td>
                      <td className="px-4 py-3">{agent?.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {has('listings.publish') && (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => publishProperty(p.id, 'Published')}>
                                <Eye className="h-3.5 w-3.5" /> Publish
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  publishProperty(p.id, 'Featured')
                                  updateProperty(p.id, { featured: true })
                                }}
                              >
                                <Star className="h-3.5 w-3.5" /> Feature
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => publishProperty(p.id, 'Archived')}>
                                <Archive className="h-3.5 w-3.5" /> Archive
                              </Button>
                            </>
                          )}
                          <Link to={`/listing/${p.id}`}>
                            <Button size="sm" variant="ghost">
                              Public
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </RequirePermission>
  )
}
