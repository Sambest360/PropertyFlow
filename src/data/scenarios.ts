/**
 * Local test personas & workflows for PropertyFlow.
 *
 * Persistence: the Vite app stores state in localStorage (`propertyflow-v*` in
 * AppStore). Postgres under `database/postgres/` is a schema sketch — not wired
 * here. Prefer expanding seed + these scenarios over inventing an ORM.
 *
 * After a seed bump, hard-refresh or use Reset data in Admin so localStorage
 * picks up `propertyflow-v16`.
 *
 * Switch users via the RoleSwitcher (header) to exercise each home + nav pack.
 */

import type { Role } from '../types/domain'
import { SIM_MONTH_START, SIM_TODAY } from './monthSimulation'

export type DemoPersona = {
  userId: string
  name: string
  role: Role
  agencyId: string | null
  agencyName: string
  /** Expected workspace home after login / Dashboard route. */
  home: string
  /** Short workflow this persona is good for. */
  scenario: string
}

/** One switchable persona per role × agency coverage for Phase 1 testing. */
export const DEMO_PERSONAS: DemoPersona[] = [
  {
    userId: 'u-super',
    name: 'Samuel (You)',
    role: 'super_admin',
    agencyId: null,
    agencyName: 'Platform',
    home: '/workspace (Super Admin dashboard)',
    scenario: 'Cross-agency health, SaaS billing, Agencies admin.',
  },
  {
    userId: 'u-amelia',
    name: 'Amelia Roux',
    role: 'client_admin',
    agencyId: 'ag-horizon',
    agencyName: 'Horizon Realty',
    home: '/workspace (Agency ops dashboard)',
    scenario: 'Principal — full agency ops, Team/Users, trust accountability.',
  },
  {
    userId: 'u-lerato',
    name: 'Lerato Nkosi',
    role: 'agent_admin',
    agencyId: 'ag-horizon',
    agencyName: 'Horizon Realty',
    home: '/workspace (Agency ops dashboard)',
    scenario: 'Office manager — Team roster + add members, agency-only broadcasts; no Tenants/Users admin.',
  },
  {
    userId: 'u-james',
    name: 'James Okonkwo',
    role: 'ground_agent',
    agencyId: 'ag-horizon',
    agencyName: 'Horizon Realty',
    home: '/workspace (Field agent dashboard)',
    scenario: 'My viewings & tickets; mentor for Priya. Property book: listings where agentId=u-james.',
  },
  {
    userId: 'u-priya',
    name: 'Priya Naidoo',
    role: 'agent',
    agencyId: 'ag-horizon',
    agencyName: 'Horizon Realty',
    home: '/workspace (Field agent dashboard)',
    scenario: 'Candidate — supervised field work; only properties with agentId=u-priya.',
  },
  {
    userId: 'u-owner2',
    name: 'J. van der Berg',
    role: 'landlord',
    agencyId: 'ag-horizon',
    agencyName: 'Horizon Realty',
    home: '/workspace/portals/owner',
    scenario: 'Landlord portfolio (landlordId=u-owner2) & rent visibility.',
  },
  {
    userId: 'u-lucas',
    name: 'Lucas Pretorius',
    role: 'tenant',
    agencyId: 'ag-horizon',
    agencyName: 'Horizon Realty',
    home: '/workspace/portals/tenant',
    scenario: 'Active tenancy, rent due, maintenance thread — scoped to his lease property.',
  },
  {
    userId: 'u-aqua',
    name: 'AquaFix Plumbing',
    role: 'contractor',
    agencyId: 'ag-horizon',
    agencyName: 'Horizon Realty',
    home: '/workspace/portals/contractor',
    scenario: 'Assigned jobs only (microwave repair) via ticket.contractorId.',
  },
  {
    userId: 'u-sipho',
    name: 'Sipho Molefe',
    role: 'client_admin',
    agencyId: 'ag-cape',
    agencyName: 'Algoa Bay Estates',
    home: '/workspace (Agency ops dashboard)',
    scenario: 'Second-agency principal; Mount Pleasant + Newton Park stock.',
  },
  {
    userId: 'u-nandi',
    name: 'Nandi Bekker',
    role: 'agent_admin',
    agencyId: 'ag-cape',
    agencyName: 'Algoa Bay Estates',
    home: '/workspace (Agency ops dashboard)',
    scenario: 'PE office ops — Team + agency broadcasts; no Tenants/Users.',
  },
  {
    userId: 'u-zane',
    name: 'Zane Petersen',
    role: 'ground_agent',
    agencyId: 'ag-cape',
    agencyName: 'Algoa Bay Estates',
    home: '/workspace (Field agent dashboard)',
    scenario: 'Full agent; mentors Theo.',
  },
  {
    userId: 'u-theo',
    name: 'Theo Jacobs',
    role: 'agent',
    agencyId: 'ag-cape',
    agencyName: 'Algoa Bay Estates',
    home: '/workspace (Field agent dashboard)',
    scenario: 'Candidate with assigned Richmond Hill tenancy ticket.',
  },
  {
    userId: 'u-cape-owner',
    name: 'Algoa Bay Holdings',
    role: 'landlord',
    agencyId: 'ag-cape',
    agencyName: 'Algoa Bay Estates',
    home: '/workspace/portals/owner',
    scenario: 'Algoa Bay landlord portal.',
  },
  {
    userId: 'u-aya',
    name: 'Aya Daniels',
    role: 'tenant',
    agencyId: 'ag-cape',
    agencyName: 'Algoa Bay Estates',
    home: '/workspace/portals/tenant',
    scenario: 'PE tenant — leaking tap ticket.',
  },
  {
    userId: 'u-bayfix',
    name: 'BayFix Electrical',
    role: 'contractor',
    agencyId: 'ag-cape',
    agencyName: 'Algoa Bay Estates',
    home: '/workspace/portals/contractor',
    scenario: 'Algoa Bay contractor jobs.',
  },
  {
    userId: 'u-gita',
    name: 'Gita Naicker',
    role: 'client_admin',
    agencyId: 'ag-garden',
    agencyName: 'Bayview Property Group',
    home: '/workspace (Agency ops dashboard)',
    scenario: 'Third agency; modules exclude broadcast + impersonate.',
  },
  {
    userId: 'u-leigh',
    name: 'Leigh Botha',
    role: 'ground_agent',
    agencyId: 'ag-garden',
    agencyName: 'Bayview Property Group',
    home: '/workspace (Field agent dashboard)',
    scenario: 'Framesby cottage tenancy + earth leakage job.',
  },
  {
    userId: 'u-mia',
    name: 'Mia Fortuin',
    role: 'tenant',
    agencyId: 'ag-garden',
    agencyName: 'Bayview Property Group',
    home: '/workspace/portals/tenant',
    scenario: 'Bayview tenant portal.',
  },
  {
    userId: 'u-coastal-fix',
    name: 'Coastal Fix Services',
    role: 'contractor',
    agencyId: 'ag-garden',
    agencyName: 'Bayview Property Group',
    home: '/workspace/portals/contractor',
    scenario: 'Bayview contractor portal.',
  },
]

/** Suggested click-paths for manual QA. */
export const WORKFLOW_SCENARIOS = [
  {
    id: 'role-homes',
    title: 'Role homes',
    steps: [
      'Open RoleSwitcher and pick each persona in DEMO_PERSONAS.',
      'Confirm Dashboard lands on the home listed for that persona.',
      'Confirm sidebar groups match role ∩ agency modules (Bayview has no Notifications).',
    ],
  },
  {
    id: 'people-split',
    title: 'People surfaces',
    steps: [
      'As Amelia (principal): People → Team, Tenants, Users.',
      'As Lerato (agency admin): People → Team only (+ Add team member); Tenants/Users hidden. Admin → Notifications (my agency / teammate only).',
      'Add person from Team → returns to Team after create.',
      'As James (no users.manage): Team/Users hidden; Tenants still visible if occupants.view.',
    ],
  },
  {
    id: 'multi-agency',
    title: 'Multi-agency isolation',
    steps: [
      'As Sipho (Algoa Bay): only Algoa Bay properties/tickets in ops views.',
      'As Super Admin: all three agencies on platform dashboard / Agencies.',
      'Impersonate (if permitted) an Algoa Bay tenant and confirm portal scope.',
    ],
  },
  {
    id: 'portal-loop',
    title: 'Portal maintenance loop',
    steps: [
      'As Lucas: report/view maintenance on tenant portal.',
      'As James: see ticket on field dashboard / Maintenance.',
      'As AquaFix: see assigned job on contractor portal.',
    ],
  },
  {
    id: 'month-simulation',
    title: 'Simulate a month (~30 days)',
    steps: [
      `Seed window: ${SIM_MONTH_START} → ${SIM_TODAY} (see src/data/monthSimulation.ts).`,
      'Reset localStorage (Admin → Reset data or clear propertyflow-v16) then hard-refresh.',
      'As Amelia: Properties → Map view — markers for Walmer / Humewood / Mill Park / Summerstrand stock.',
      'As James: Viewings + Payments — July rent Due, June Paid, microwave ticket In Progress.',
      'As Lucas: Tenant portal — rent reminder + TH-1 maintenance thread.',
      'As Sipho → Aya: Algoa Bay overdue June rent notice + leaking tap MT-4403.',
      'As Gita → Leigh → Mia: Bayview purchase APP-905, earth leakage MT-4404, COC document.',
      'Open property detail → Location map; edit address to re-geocode (Google key or mock).',
      'Documents tab: sample PDF URLs on leases / IDs / invoices.',
    ],
  },
  {
    id: 'maps-geocode',
    title: 'Google Maps (optional key)',
    steps: [
      'Copy .env.example → .env.local and set VITE_GOOGLE_MAPS_API_KEY (Maps JS + Geocoding).',
      'Restart vite. Properties Map + detail Location use Google; without key, Leaflet OSM.',
      'Add property with a Port Elizabeth / Summerstrand address — lat/lng should resolve near Algoa Bay.',
    ],
  },
] as const

/** Alias for docs / DEMO index — same as WORKFLOW_SCENARIOS month entry. */
export const MONTH_SIMULATION_SCENARIO = WORKFLOW_SCENARIOS.find((s) => s.id === 'month-simulation')!
