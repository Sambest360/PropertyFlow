import { describe, expect, it } from 'vitest'
import { buildReportMetrics } from './reportMetrics'
import type { AppState } from '../context/AppStore'

function emptyState(over: Partial<AppState> = {}): AppState {
  return {
    agencies: [],
    users: [],
    properties: [],
    buildings: [],
    units: [],
    infraRooms: [],
    internalAssets: [],
    lookups: [],
    leads: [],
    applications: [],
    viewingSlots: [],
    viewings: [],
    payments: [],
    tenancies: [],
    threads: [],
    messages: [],
    notifications: [],
    notificationBroadcasts: [],
    suiteAlerts: [],
    tickets: [],
    activities: [],
    propertyDocuments: [],
    propertyEvents: [],
    billingPlans: [],
    clientSubscriptions: [],
    invoices: [],
    vendorRoutes: [],
    ...over,
  }
}

describe('buildReportMetrics scoping', () => {
  const state = emptyState({
    properties: [
      { id: 'p-a', agencyId: 'ag-a', status: 'Available' } as AppState['properties'][number],
      { id: 'p-b', agencyId: 'ag-b', status: 'Available' } as AppState['properties'][number],
    ],
    payments: [
      {
        id: 'pay-a',
        agencyId: 'ag-a',
        amount: 1000,
        status: 'Paid',
        dueDate: '2026-01-01',
      } as AppState['payments'][number],
      {
        id: 'pay-b',
        agencyId: 'ag-b',
        amount: 5000,
        status: 'Paid',
        dueDate: '2026-01-01',
      } as AppState['payments'][number],
    ],
    leads: [
      { id: 'l-a', agencyId: 'ag-a', stage: 'New' } as AppState['leads'][number],
      { id: 'l-b', agencyId: 'ag-b', stage: 'New' } as AppState['leads'][number],
    ],
  })

  it('limits metrics to the selected agency filter', () => {
    const metrics = buildReportMetrics(state, 'ag-a', () => true)
    expect(metrics.kpis.properties).toBe(1)
    expect(metrics.kpis.openLeads).toBe(1)
    expect(metrics.kpis.paidTotal).toBe(1000)
  })

  it('uses scopeAgency when no explicit agency filter is set', () => {
    const scopeAgency = (id: string | null | undefined) => id === 'ag-b'
    const metrics = buildReportMetrics(state, null, scopeAgency)
    expect(metrics.kpis.properties).toBe(1)
    expect(metrics.kpis.openLeads).toBe(1)
    expect(metrics.kpis.paidTotal).toBe(5000)
  })

  it('does not mix agencies when scopeAgency is strict', () => {
    const scopeAgency = (id: string | null | undefined) => id === 'ag-a'
    const metrics = buildReportMetrics(state, null, scopeAgency)
    expect(metrics.kpis.properties).toBe(1)
    expect(metrics.kpis.paidTotal).not.toBe(6000)
  })
})
