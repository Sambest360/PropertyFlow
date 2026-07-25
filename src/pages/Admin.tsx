import { Link } from 'react-router-dom'
import { BellRing, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { RequirePermission } from '../components/RequirePermission'
import { Badge, Button, Card, PageHeader } from '../components/ui'
import { roleLabels, rolePermissions } from '../lib/permissions'
import type { Role } from '../types/domain'

const pipelineStages = [
  'New Lead',
  'Contacted',
  'Viewing Scheduled',
  'Viewing Completed',
  'Application Submitted',
  'Credit Check',
  'Offer Sent',
  'Deposit Paid',
  'Lease Signed',
  'Sale Completed',
]

const configSections = [
  { title: 'Property Types', items: ['House', 'Apartment', 'Townhouse', 'Commercial', 'Land', 'Student'] },
  { title: 'Document Types', items: ['ID', 'Payslip', 'Bank statement', 'Lease', 'Title deed', 'FICA'] },
  { title: 'Maintenance Categories', items: ['Plumbing', 'Electrical', 'HVAC', 'Appliances', 'Structural', 'General'] },
  { title: 'Amenities', items: ['Fibre', 'Pool', 'Garden', 'Parking', 'Security Estate', 'Pet Friendly', 'Furnished', 'Unfurnished', 'Solar', 'Generator'] },
]

export default function Admin() {
  const { has, roleLabel, agencyName } = useAuth()
  const roles = Object.keys(roleLabels) as Role[]

  return (
    <RequirePermission anyOf={['users.manage', 'roles.assign', 'tenant.manage']}>
      <div className="animate-fade-in">
        <PageHeader
          title="Administration"
          subtitle={`${agencyName ?? 'Platform'} · signed in as ${roleLabel}. Configure workflows and review role permissions.`}
          actions={
            <>
              <Link to="/workspace/admin/suite-alerts">
                <Button variant="secondary">
                  <BellRing className="h-4 w-4" /> Suite alerts
                </Button>
              </Link>
              {has('platform.manage') ? (
                <Link to="/workspace/platform">
                  <Button>
                    <Shield className="h-4 w-4" /> Platform tenants
                  </Button>
                </Link>
              ) : null}
            </>
          }
        />

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold">Lead / application stages</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {pipelineStages.map((s, i) => (
                <Badge key={s} tone={i % 3 === 0 ? 'brand' : i % 3 === 1 ? 'accent' : 'neutral'}>
                  {i + 1}. {s}
                </Badge>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-display text-lg font-semibold">Role permissions (RBAC)</h2>
            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto text-sm">
              {roles.map((r) => (
                <li key={r} className="rounded-xl bg-primary-50 px-3 py-2">
                  <p className="font-medium text-ink">{roleLabels[r]}</p>
                  <p className="mt-1 text-[11px] text-ink-500">{rolePermissions[r].join(' · ')}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {configSections.map((sec) => (
            <Card key={sec.title} className="p-5">
              <h3 className="font-semibold text-ink">{sec.title}</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {sec.items.map((item) => (
                  <Badge key={item} tone="neutral">
                    {item}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </RequirePermission>
  )
}
