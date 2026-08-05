export type MaintenanceTicketDef = {
  feId: string
  propertyFeId: string
  categoryKey: string
  title: string
  description: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY'
  status: 'OPEN' | 'TRIAGED' | 'IN_PROGRESS' | 'AWAITING_PARTS' | 'RESOLVED' | 'CANCELLED'
  contractorFeId?: string
  agentFeId: string
  warrantyCovered?: boolean
}

/** Demo maintenance tickets — mix of assigned and claimable jobs for contractor portal testing. */
export const MAINTENANCE_TICKETS: MaintenanceTicketDef[] = [
  {
    feId: 'MT-SCB-001',
    propertyFeId: 'PR-SCB-001',
    categoryKey: 'PLUMBING',
    title: 'Kitchen tap dripping — slow leak',
    description: 'Tenant reports constant drip from mixer tap. Cupboard base starting to swell.',
    priority: 'MEDIUM',
    status: 'IN_PROGRESS',
    contractorFeId: 'u-contractor-aquafix',
    agentFeId: 'u-agent-james',
  },
  {
    feId: 'MT-SCB-002',
    propertyFeId: 'PR-SCB-002',
    categoryKey: 'ELECTRICAL',
    title: 'Bedroom circuit trips breaker',
    description: 'Master bedroom sockets trip the DB after ~10 minutes of use. Possible loose connection.',
    priority: 'HIGH',
    status: 'OPEN',
    contractorFeId: 'u-contractor-voltpro',
    agentFeId: 'u-agent-priya',
  },
  {
    feId: 'MT-SCB-003',
    propertyFeId: 'PR-SCB-003',
    categoryKey: 'HVAC',
    title: 'Split unit not cooling',
    description: 'Lounge AC runs but blows room-temperature air. Filter cleaned last month.',
    priority: 'MEDIUM',
    status: 'TRIAGED',
    contractorFeId: 'u-contractor-coolair',
    agentFeId: 'u-agent-themba',
  },
  {
    feId: 'MT-SCB-004',
    propertyFeId: 'PR-SCB-004',
    categoryKey: 'GENERAL',
    title: 'Loose balcony railing bracket',
    description: 'Bracket on west-facing railing moves when pressed. Safety concern before summer.',
    priority: 'HIGH',
    status: 'OPEN',
    agentFeId: 'u-agent-nadia',
  },
  {
    feId: 'MT-SCB-005',
    propertyFeId: 'PR-SCB-005',
    categoryKey: 'PLUMBING',
    title: 'Geyser overflow pipe dripping',
    description: 'External overflow dripping continuously. No hot-water pressure loss yet.',
    priority: 'LOW',
    status: 'OPEN',
    agentFeId: 'u-agent-nadia',
    warrantyCovered: true,
  },
]
