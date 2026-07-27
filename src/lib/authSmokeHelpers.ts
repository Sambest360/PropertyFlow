/** Mirrors server ROLE_TO_DB for unit smoke (keep in sync with server/writes.ts / auth.ts). */
export const ROLE_TO_DB_SMOKE: Record<string, string> = {
    super_admin: 'SUPER_ADMIN',
    client_admin: 'AGENCY_ADMIN',
    agency_admin: 'AGENCY_ADMIN',
    agent_admin: 'AGENT_ADMIN',
    agent: 'GROUND_AGENT',
    ground_agent: 'GROUND_AGENT',
    landlord: 'LANDLORD',
    tenant: 'END_USER',
    applicant: 'END_USER',
    contractor: 'CONTRACTOR',
  }
  