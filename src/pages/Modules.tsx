import { Link } from 'react-router-dom'
import {
  Users,
  Building,
  ClipboardList,
  HardHat,
  UserCircle2,
  Target,
  Contact,
  Briefcase,
  Truck,
  ArrowUpRight,
} from 'lucide-react'
import { Card, PageHeader } from '../components/ui'

const modules = [
  {
    title: 'Customer Tracker (CRM)',
    description: 'Track every lead, enquiry, call, WhatsApp thread, and follow-up with a full timeline.',
    to: '/workspace/sales/crm',
    icon: Users,
    color: 'bg-primary',
    preview: 'crm',
  },
  {
    title: 'Owner / Branch Portal',
    description: 'High-level property performance, revenue, occupancy, and portfolio health for owners.',
    to: '/workspace/portals/owner',
    icon: Building,
    color: 'bg-primary-600',
    preview: 'owner',
  },
  {
    title: 'Request Tracker',
    description: 'Maintenance queues and application review with priority labels and status tags.',
    to: '/workspace/operations/maintenance',
    icon: ClipboardList,
    color: 'bg-primary-700',
    preview: 'requests',
  },
  {
    title: 'Contractor Portal',
    description: 'Work orders, job awards, earnings, invoices, and completion history for contractors.',
    to: '/workspace/portals/contractor',
    icon: HardHat,
    color: 'bg-primary',
    preview: 'contractor',
  },
  {
    title: 'Tenant / Buyer Portal',
    description: 'Applications, documents, rent payments, lease status, and move-in in one place.',
    to: '/workspace/portals/tenant',
    icon: UserCircle2,
    color: 'bg-primary-600',
    preview: 'tenant',
  },
  {
    title: 'Deal Tracker',
    description: 'Kanban sales & leasing pipeline from New Lead through Lease Signed / Sale Completed.',
    to: '/workspace/sales/pipeline',
    icon: Target,
    color: 'bg-primary-700',
    preview: 'deals',
  },
  {
    title: 'Tenant Directory',
    description: 'Resident profiles across multi-unit buildings with lease and unit context.',
    to: '/workspace/people/tenants',
    icon: Contact,
    color: 'bg-primary',
    preview: 'community',
  },
  {
    title: 'Staff / Agent Directory',
    description: 'Role-based staff roster across branches with performance and contact details.',
    to: '/workspace/people/staff',
    icon: Briefcase,
    color: 'bg-primary-600',
    preview: 'staff',
  },
  {
    title: 'Property Asset Gallery',
    description: 'Visual property catalogue — houses, apartments, land, farms — with pricing and status.',
    to: '/workspace/properties/assets',
    icon: Truck,
    color: 'bg-primary-700',
    preview: 'assets',
  },
]

function MiniPreview({ type }: { type: string }) {
  if (type === 'deals') {
    return (
      <div className="flex gap-1.5 p-3">
        {['New', 'Viewing', 'Offer'].map((col) => (
          <div key={col} className="flex-1 rounded-lg bg-ink-100 p-1.5 dark:bg-ink-800">
            <div className="mb-1 text-[9px] font-medium text-ink-500">{col}</div>
            <div className="mb-1 h-8 rounded bg-white shadow-sm dark:bg-ink-700" />
            <div className="h-6 rounded bg-white/70 dark:bg-ink-700/70" />
          </div>
        ))}
      </div>
    )
  }
  if (type === 'assets' || type === 'community' || type === 'staff') {
    return (
      <div className="grid grid-cols-3 gap-1.5 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[4/3] rounded-lg bg-gradient-to-br from-ink-200 to-ink-100 dark:from-ink-700 dark:to-ink-800" />
        ))}
      </div>
    )
  }
  if (type === 'owner' || type === 'tenant' || type === 'contractor') {
    return (
      <div className="space-y-2 p-3">
        <div className="h-10 rounded-lg bg-gradient-to-r from-third/40 to-secondary/20" />
        <div className="grid grid-cols-3 gap-1.5">
          <div className="h-10 rounded-lg bg-ink-100 dark:bg-ink-800" />
          <div className="h-10 rounded-lg bg-ink-100 dark:bg-ink-800" />
          <div className="h-10 rounded-lg bg-ink-100 dark:bg-ink-800" />
        </div>
        <div className="h-16 rounded-lg bg-ink-50 dark:bg-ink-800/60" />
      </div>
    )
  }
  return (
    <div className="space-y-1.5 p-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-secondary/70" />
          <div className="h-3 flex-1 rounded bg-ink-100 dark:bg-ink-800" />
          <div className="h-4 w-12 rounded bg-ink-100 dark:bg-ink-800" />
        </div>
      ))}
    </div>
  )
}

export default function Modules() {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Platform Modules"
        subtitle="Enterprise feature suite inspired by CRM, portals, request trackers, deal boards, directories, and asset galleries — adapted for the full property lifecycle."
      />

      <div className="animate-stagger grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => (
          <Link key={m.to + m.title} to={m.to} className="group block">
            <Card hover className="overflow-hidden transition-all duration-200">
              <div className="flex items-start gap-3 border-b border-ink-100 p-4 dark:border-ink-800">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm ${m.color}`}>
                  <m.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">{m.title}</h2>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-400 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{m.description}</p>
                </div>
              </div>
              <div className="bg-ink-50/80 dark:bg-ink-950/40">
                <MiniPreview type={m.preview} />
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
