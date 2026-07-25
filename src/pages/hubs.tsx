import { TabbedHub } from '../components/TabbedHub'

export function SalesHub() {
  return (
    <TabbedHub
      title="Sales & Leasing"
      subtitle="Leads, deal pipeline, applications, and property viewings — the path from enquiry to signed deal."
      tabs={[
        { to: '/workspace/sales/crm', label: 'CRM & Leads' },
        { to: '/workspace/sales/pipeline', label: 'Deal Pipeline' },
        { to: '/workspace/sales/applications', label: 'Applications' },
        { to: '/workspace/sales/viewings', label: 'Viewings' },
      ]}
    />
  )
}

export function PropertiesHub() {
  return (
    <TabbedHub
      title="Properties & Listings"
      subtitle="Infrastructure OS — buildings, units, rooms, inventory — plus public listings."
      tabs={[
        { to: '/workspace/properties/infrastructure', label: 'Infrastructure' },
        { to: '/workspace/properties/assets', label: 'Property Assets' },
        { to: '/workspace/properties/listings', label: 'Listings' },
      ]}
    />
  )
}

export function OperationsHub() {
  return (
    <TabbedHub
      title="Operations"
      subtitle="Day-to-day property management — maintenance, documents, messaging, and money."
      tabs={[
        { to: '/workspace/operations/maintenance', label: 'Maintenance' },
        { to: '/workspace/operations/documents', label: 'Documents' },
        { to: '/workspace/operations/communications', label: 'Communications' },
        { to: '/workspace/operations/payments', label: 'Payments' },
      ]}
    />
  )
}

export function PortalsHub() {
  return (
    <TabbedHub
      title="Portals"
      subtitle="Self-service views for owners, tenants/buyers, and contractors tied to the same properties."
      tabs={[
        { to: '/workspace/portals/owner', label: 'Owner' },
        { to: '/workspace/portals/tenant', label: 'Tenant / Buyer' },
        { to: '/workspace/portals/contractor', label: 'Contractor' },
      ]}
    />
  )
}

export function PeopleHub() {
  return (
    <TabbedHub
      title="People"
      subtitle="Staff, agents, and tenants across your branches and managed buildings."
      tabs={[
        { to: '/workspace/people/staff', label: 'Staff & Agents' },
        { to: '/workspace/people/tenants', label: 'Occupants' },
      ]}
    />
  )
}

export function InsightsHub() {
  return (
    <TabbedHub
      title="Insights"
      subtitle="Performance reporting and module overview for the agency."
      tabs={[
        { to: '/workspace/insights/reports', label: 'Reports' },
        { to: '/workspace/insights/modules', label: 'All Modules' },
      ]}
    />
  )
}
