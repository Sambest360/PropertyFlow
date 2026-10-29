import type { Role } from '../types/domain'

export type PageTipContent = {
  /** Stable id for per-user dismissal storage */
  id: string
  title: string
  body: string
}

export type PageTourStep = {
  title: string
  body: string
  /** Short extra points shown under the body. */
  bullets?: string[]
  /**
   * CSS selector for the highlighted element; omit for a centred step.
   * Several selectors joined with " || " are tried in order (most specific first).
   */
  target?: string
  placement?: 'center' | 'above' | 'below'
  /** Shows a "New" badge — for recently added features. */
  isNew?: boolean
}

/** First visible element for a step target ("a || b" tries a, then b). */
export function findTipTarget(target: string | undefined): Element | null {
  if (!target || typeof document === 'undefined') return null
  for (const sel of target.split('||').map((t) => t.trim()).filter(Boolean)) {
    let nodes: NodeListOf<Element>
    try {
      nodes = document.querySelectorAll(sel)
    } catch {
      continue
    }
    for (const el of Array.from(nodes)) {
      const r = el.getBoundingClientRect()
      if (r.width >= 2 && r.height >= 2) return el
    }
  }
  return null
}

export type PageTour = {
  id: string
  steps: PageTourStep[]
}

/** Multi-step walkthroughs (shown before single-step route tips). */
const WALKTHROUGH_RULES: Array<{
  match: (pathname: string) => boolean
  roles?: Role[]
  /** Same gate as the tenant sidebar: only after approved occupancy. */
  requireTenantOccupancy?: boolean
  tour: (role: Role | null) => PageTour
}> = [
  {
    match: exact('/'),
    tour: () => ({
      id: 'tour-market-home',
      steps: [
        {
          title: 'Welcome to Lekaya Rentals',
          body: 'Browse buy, rent, and commercial listings across South Africa. This quick tour shows where to search, save favourites, and sign in when you are ready to apply.',
          placement: 'center',
        },
        {
          title: 'Buy & rent',
          body: 'Switch between sale and rental inventory — or explore commercial and bond calculators from the top navigation.',
          target: '[data-tip-target="market-nav"]',
          placement: 'below',
        },
        {
          title: 'Search by area',
          body: 'Enter a suburb, city, or keyword to jump straight into filtered results on the browse page.',
          target: '[data-tip-target="market-search"]',
          placement: 'below',
        },
        {
          title: 'Saved homes',
          body: 'Heart listings to keep them on your wishlist. Sign in to sync saves across devices.',
          target: '[data-tip-target="market-saved"]',
          placement: 'below',
        },
        {
          title: 'Apply when ready',
          body: 'Browsing is free — create an account only when you want to apply for a property or track an application.',
          target: '[data-tip-target="market-auth"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: prefix('/browse'),
    tour: () => ({
      id: 'tour-market-browse',
      steps: [
        {
          title: 'Refine your search',
          body: 'Use Buy, Rent, or Commercial in the top navigation to switch listing types, then open filters for price, beds, and amenities.',
          target: '[data-tip-target="market-nav"]',
          placement: 'below',
        },
        {
          title: 'Filters & sort',
          body: 'Open filters for price, beds, amenities, and grading — then sort by featured, price, or newest.',
          target: '[data-tip-target="browse-filters"]',
          placement: 'below',
        },
        {
          title: 'Map view',
          body: 'Toggle the map to compare suburbs and spot clusters of available homes.',
          target: '[data-tip-target="browse-map"]',
          placement: 'below',
        },
        {
          title: 'Open a listing',
          body: 'Tap any card for photos, fees, and viewing slots. You only need an account when you apply.',
          placement: 'center',
        },
      ],
    }),
  },
  {
    match: exact('/saved'),
    tour: () => ({
      id: 'tour-market-saved',
      steps: [
        {
          title: 'Your saved homes',
          body: 'Listings you heart while browsing collect here. Sign in to keep them across devices and apply from your tenant portal.',
          placement: 'center',
        },
        {
          title: 'Saved shortcut',
          body: 'Use the heart icon in the header anytime — signed-in users land on their wishlist instead.',
          target: '[data-tip-target="market-saved"]',
          placement: 'below',
        },
        {
          title: 'Keep browsing',
          body: 'Jump back to Buy, Rent, or Commercial from the top navigation to find more homes.',
          target: '[data-tip-target="market-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/calculators'),
    tour: () => ({
      id: 'tour-market-calculators',
      steps: [
        {
          title: 'Plan your purchase',
          body: 'Run affordability, bond, and transfer-cost estimates before you apply. Results are indicative — share them with your agent or bank.',
          placement: 'center',
        },
        {
          title: 'Pick a calculator',
          body: 'Open any tool for repayments, affordability, extra payments, or bond and transfer costs.',
          target: '[data-tip-target="calc-tools"]',
          placement: 'below',
        },
        {
          title: 'Marketplace navigation',
          body: 'Return to listings or switch modes from the top navigation whenever you are ready to browse again.',
          target: '[data-tip-target="market-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace'),
    roles: ['client_admin', 'agent_admin', 'ground_agent', 'agent'],
    tour: (role) => ({
      id: 'tour-workspace-home',
      steps: [
        {
          title: role === 'ground_agent' || role === 'agent' ? 'Your day at a glance' : 'Agency command centre',
          body:
            role === 'ground_agent' || role === 'agent'
              ? 'Viewings, tickets, and follow-ups assigned to you surface here first.'
              : 'Start with the overview tab for items needing attention, then jump into properties, sales, or operations.',
          placement: 'center',
        },
        {
          title: 'Navigation',
          body: 'The sidebar groups properties, sales pipeline, operations, and people — only modules your role can access are shown.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
        {
          title: 'Quick search',
          body: 'Use spotlight search to jump to a property, lead, tenant, or page anywhere in the workspace.',
          bullets: ['Type a street, tenant name or reference number', 'Switch between this agency and Global results'],
          target: '[data-tip-target="workspace-search"]',
          placement: 'below',
        },
        {
          title: 'Properties',
          body: 'Every building and unit you manage. Unassigned listings can be assigned to an agent straight from the list.',
          target: '[data-tip-nav="/workspace/properties"] || [data-tip-target="workspace-nav"]',
          placement: 'below',
        },
        {
          title: 'Escalations',
          body: 'Faults and help-desk tickets that waited too long move up automatically: first to the agent, then the agency admin, then the platform team. Upcoming yearly rent increases are listed here too.',
          bullets: ['Acknowledge or resolve an escalation from its card', 'Agency admins set response and fix times under Rules'],
          target: '[data-tip-nav="/workspace/operations/escalations"] || [data-tip-target="workspace-nav"]',
          placement: 'below',
          isNew: true,
        },
        {
          title: 'Reports',
          body: 'Owner statements, the rent roll and portfolio reports now live together under one Reports link.',
          target: '[data-tip-nav="/workspace/insights/reports"] || [data-tip-target="workspace-nav"]',
          placement: 'below',
          isNew: true,
        },
      ],
    }),
  },
  {
    match: exact('/workspace'),
    roles: ['super_admin'],
    tour: () => ({
      id: 'tour-workspace-home-super',
      steps: [
        {
          title: 'Platform overview',
          body: 'You see every agency on Lekaya. Use the sidebar to manage agencies, users, storage and the help desk.',
          placement: 'center',
        },
        {
          title: 'Agencies',
          body: 'Create agencies, switch modules on or off for each one, and open an agency to see its team and listings.',
          target: '[data-tip-nav="/workspace/admin/agencies"] || [data-tip-target="workspace-nav"]',
          placement: 'below',
        },
        {
          title: 'Storage',
          body: 'See how much space each agency uses, give each one an allowance, and get a notification when an agency nears or passes it.',
          bullets: ['Use +1 GB / -1 GB for quick changes', 'Set the warning level per agency (80% by default)'],
          target: '[data-tip-nav="/workspace/admin/storage"] || [data-tip-target="workspace-nav"]',
          placement: 'below',
          isNew: true,
        },
        {
          title: 'Escalations',
          body: 'Faults and tickets that sat too long at any agency reach you here at the last level.',
          target: '[data-tip-nav="/workspace/operations/escalations"] || [data-tip-target="workspace-nav"]',
          placement: 'below',
          isNew: true,
        },
      ],
    }),
  },
  {
    match: exact('/workspace/properties/new'),
    tour: () => ({
      id: 'tour-property-create',
      steps: [
        {
          title: 'Add a property',
          body: 'This wizard walks you through building, unit, and listing details in order. You can save a draft at any time and publish when ready.',
          placement: 'center',
        },
        {
          title: 'Step-by-step progress',
          body: 'Each step unlocks the next. Click a completed step in the sidebar to jump back and edit without losing your work.',
          target: '[data-tip-target="wizard-steps"]',
          placement: 'below',
        },
        {
          title: 'Guidance for this step',
          body: 'The panel on the left explains what the current step needs. It updates as you move through type, location, rooms, media, and pricing.',
          target: '[data-tip-target="wizard-step-tip"]',
          placement: 'below',
        },
        {
          title: 'Live preview',
          body: 'See how your listing will look on the marketplace as you fill in photos, pricing, and title.',
          target: '[data-tip-target="wizard-preview"]',
          placement: 'below',
        },
        {
          title: 'Need help on a field?',
          body: 'Look for the ? icons next to labels — tap them for quick explanations of what to enter. Use Continue when each step is complete.',
          target: '[data-tip-target="wizard-form"]',
          placement: 'below',
        },
      ],
    }),
  },
  // —— Staff list pages ——
  {
    match: exact('/workspace/properties'),
    roles: ['client_admin', 'agent_admin', 'ground_agent', 'agent'],
    tour: () => ({
      id: 'tour-properties-list',
      steps: [
        {
          title: 'Property portfolio',
          body: 'Browse buildings and units, filter by status or listing mode, then open a property to manage photos, tenants, and documents.',
          placement: 'center',
        },
        {
          title: 'Page tools',
          body: 'Use the header actions to add a property or open the archive when your role allows it.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Jump to sales, operations, or people from the workspace navigation — only modules you can access appear here.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/sales/viewings'),
    roles: ['client_admin', 'agent_admin', 'ground_agent', 'agent'],
    tour: () => ({
      id: 'tour-sales-viewings',
      steps: [
        {
          title: 'Viewing schedule',
          body: 'Day strip and calendar views show upcoming appointments. Create a viewing to invite guests and link it to the listing.',
          placement: 'center',
        },
        {
          title: 'Schedule tools',
          body: 'Create a viewing from the header, then pick a day to scan the agenda by time.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Leads and applicants sit under Sales in the sidebar when you need to follow up after a viewing.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/sales/crm'),
    roles: ['client_admin', 'agent_admin', 'ground_agent', 'agent'],
    tour: () => ({
      id: 'tour-sales-crm',
      steps: [
        {
          title: 'Lead pipeline',
          body: 'Track enquiries in board or list view. Open a lead to log calls, schedule follow-ups, and link them to a property.',
          placement: 'center',
        },
        {
          title: 'Pipeline tools',
          body: 'Filter, sort, or create a walk-in lead from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Move between leads, applicants, and viewings from Sales in the sidebar.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/sales/applications'),
    roles: ['client_admin', 'agent_admin', 'ground_agent', 'agent'],
    tour: () => ({
      id: 'tour-sales-applications',
      steps: [
        {
          title: 'Rental applications',
          body: 'Review incoming applicants, run checks, and move promising ones forward. Open an applicant for full detail.',
          placement: 'center',
        },
        {
          title: 'Applicant list',
          body: 'Use filters in the header area to narrow by stage or property before opening a record.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Leads and viewings are one click away in the Sales group.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/operations/maintenance'),
    roles: ['client_admin', 'agent_admin', 'ground_agent', 'agent'],
    tour: () => ({
      id: 'tour-ops-maintenance',
      steps: [
        {
          title: 'Maintenance queue',
          body: 'Every fault reported by tenants, landlords and staff. Filter by priority or status to see what needs you first.',
          bullets: ['Emergency and Urgent faults sit at the top', 'Open a fault to assign a contractor, add photos and close it'],
          placement: 'center',
        },
        {
          title: 'Log or switch views',
          body: 'Log a new fault, or switch between the board and list views.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Faults escalate on their own',
          body: 'If nobody responds in time, the fault is escalated to the agency admin and then the platform team. You can also press Escalate on any open fault.',
          target: '[data-tip-nav="/workspace/operations/escalations"] || [data-tip-target="workspace-nav"]',
          placement: 'below',
          isNew: true,
        },
      ]
    }),
  },
  {
    match: exact('/workspace/operations/escalations'),
    tour: () => ({
      id: 'tour-ops-escalations',
      steps: [
        {
          title: 'Escalations',
          body: 'Anything that waited too long lands here, highest level first. Level 1 goes to the agent and agency admin, level 2 to the agency admin again, level 3 to the platform team.',
          placement: 'center',
          isNew: true,
        },
        {
          title: 'Issues, rent increases and rules',
          body: 'Issues lists overdue faults and help-desk tickets. Rent increases shows each lease\u2019s next yearly increase. Rules sets the response and fix times per priority.',
          bullets: ['Tenants, landlords and agents are told before a rent increase', 'Rent can be raised automatically on the date'],
          target: '[data-tip-target="escalation-tabs"]',
          placement: 'below',
        },
        {
          title: 'Refresh',
          body: 'Escalations are checked every hour. Refresh runs the check now.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/admin/storage'),
    roles: ['super_admin'],
    tour: () => ({
      id: 'tour-admin-storage',
      steps: [
        {
          title: 'Storage per agency',
          body: 'Total space used across the platform, and how many agencies are nearly full or over their allowance.',
          target: '[data-tip-target="storage-summary"]',
          placement: 'below',
          isNew: true,
        },
        {
          title: 'Set allowances',
          body: 'Each card shows what the agency uses (photos and records). Change the allowance with +1 GB / -1 GB or type a size, and choose when you want to be warned.',
          bullets: ['Leave the allowance empty for unlimited', 'You get a notification when an agency reaches the warning level, and daily while it is over'],
          target: '[data-tip-target="storage-agencies"]',
          placement: 'above',
        },
      ],
    }),
  },
  {
    match: detailSegment('/workspace/properties', 'id'),
    roles: ['super_admin', 'client_admin', 'agent_admin', 'ground_agent', 'agent'],
    tour: () => ({
      id: 'tour-property-detail',
      steps: [
        {
          title: 'Everything about this property',
          body: 'Each tab covers one part of the property: its map and floor plan, applicants and viewings, maintenance, payments and documents.',
          target: '[data-tip-target="property-tabs"]',
          placement: 'below',
        },
        {
          title: 'List it on property portals',
          body: 'The Portals tab gives you a listing pack for Property24 and Private Property, a checklist of what is missing, and a way to mark where it is listed.',
          target: '[data-tip-target="property-tabs"]',
          placement: 'below',
          isNew: true,
        },
        {
          title: 'Edit or go back',
          body: 'Edit the property, delete it, or return to all properties from here.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/operations/payments'),
    roles: ['client_admin', 'agent_admin', 'ground_agent'],
    tour: () => ({
      id: 'tour-ops-payments',
      steps: [
        {
          title: 'Rent & payments',
          body: 'See what is due, overdue, and paid across your properties. Open a payment to add proof or mark it paid.',
          placement: 'center',
        },
        {
          title: 'Payment tools',
          body: 'Filter the ledger and jump to overdue items from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Trust accounting and arrears sit nearby when your agency has those modules enabled.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/operations/documents'),
    roles: ['client_admin', 'agent_admin', 'ground_agent', 'agent'],
    tour: () => ({
      id: 'tour-ops-documents',
      steps: [
        {
          title: 'Document library',
          body: 'Leases, FICA, and compliance files live here. Filter by property or type, and approve pending uploads.',
          placement: 'center',
        },
        {
          title: 'Library tools',
          body: 'Upload or filter documents from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Related people and property pages are linked from the workspace navigation.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/operations/communications'),
    roles: ['client_admin', 'agent_admin', 'ground_agent', 'agent'],
    tour: () => ({
      id: 'tour-ops-communications',
      steps: [
        {
          title: 'Messages hub',
          body: 'Write to tenants and owners here. Messages stay inside Lekaya, not SMS or WhatsApp.',
          placement: 'center',
        },
        {
          title: 'Compose tools',
          body: 'Start a message or pick a template from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Operations modules stay grouped in the sidebar for quick switching.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/trust'),
    roles: ['client_admin', 'agent_admin', 'ground_agent'],
    tour: () => ({
      id: 'tour-trust-dashboard',
      steps: [
        {
          title: 'Trust dashboard',
          body: 'See trust balances, recent movements, and alerts that need attention across your agency.',
          placement: 'center',
        },
        {
          title: 'Trust overview',
          body: 'Use the header and cards to drill into cashbook, deposits, or arrears.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Trust navigation',
          body: 'Cashbook, deposits, and arrears are listed under Trust & Banking in the sidebar.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/trust/cashbook'),
    roles: ['client_admin', 'agent_admin', 'ground_agent'],
    tour: () => ({
      id: 'tour-trust-cashbook',
      steps: [
        {
          title: 'Trust cashbook',
          body: 'Every amount in and out of the trust book, newest first. Open a row to check it before you allocate or pay anything.',
          placement: 'center',
        },
        {
          title: 'Cashbook tools',
          body: 'Filter or export entries from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Unallocated funds and payouts appear here when your role can allocate or approve them.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/trust/unallocated'),
    roles: ['client_admin', 'agent_admin'],
    tour: () => ({
      id: 'tour-trust-unallocated',
      steps: [
        {
          title: 'Unallocated funds',
          body: 'Match unidentified receipts to the right tenant or property so the cashbook stays clean.',
          placement: 'center',
        },
        {
          title: 'Allocation tools',
          body: 'Select a receipt. Allocate it from the selection panel.',
          target: '[data-tip-target="trust-unallocated-selection"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Payouts and deposits sit alongside unallocated under Trust & Banking.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/trust/payouts'),
    roles: ['client_admin', 'agent_admin'],
    tour: () => ({
      id: 'tour-trust-payouts',
      steps: [
        {
          title: 'Owner payouts',
          body: 'Propose, approve, and submit owner payouts in Lekaya. This does not send a bank transfer.',
          placement: 'center',
        },
        {
          title: 'Payout tools',
          body: 'Propose a payout here. Approve it or submit it from its row in the list.',
          target: '[data-tip-target="trust-propose-payout"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Return to the trust dashboard or cashbook from Trust & Banking.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/trust/deposits'),
    roles: ['client_admin', 'agent_admin', 'ground_agent'],
    tour: () => ({
      id: 'tour-trust-deposits',
      steps: [
        {
          title: 'Deposits',
          body: 'Track deposits held in trust per tenancy, including amounts due for refund or transfer.',
          placement: 'center',
        },
        {
          title: 'Deposit tools',
          body: 'Filter deposits and open a row for full detail from this page.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Arrears and cashbook are one click away under Trust & Banking.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/trust/arrears'),
    roles: ['client_admin', 'agent_admin', 'ground_agent'],
    tour: () => ({
      id: 'tour-trust-arrears',
      steps: [
        {
          title: 'Arrears',
          body: 'Tenancies that are behind on rent, with the amount owed.',
          placement: 'center',
        },
        {
          title: 'Arrears tools',
          body: 'Use the message button on a row to write to that tenant in Lekaya.',
          target: '[data-tip-target="trust-arrears-message"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Jump to payments or trust cashbook when you need to post a receipt.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/compliance'),
    roles: ['client_admin', 'agent_admin'],
    tour: () => ({
      id: 'tour-compliance',
      steps: [
        {
          title: 'Compliance',
          body: 'Monitor FICA, lease, and inspection obligations across the portfolio.',
          placement: 'center',
        },
        {
          title: 'Compliance tools',
          body: 'Filter open items and drill into a property from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Documents and people directories support the compliance workflow.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/people/staff'),
    roles: ['client_admin', 'agent_admin'],
    tour: () => ({
      id: 'tour-people-staff',
      steps: [
        {
          title: 'Team directory',
          body: 'Browse agents and admins in your agency. Open a profile to adjust permissions or contact details.',
          placement: 'center',
        },
        {
          title: 'Team tools',
          body: 'Invite or filter staff from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Tenants, leases, landlords, and contractors sit under People.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/people/tenants'),
    roles: ['client_admin', 'agent_admin', 'ground_agent', 'agent'],
    tour: () => ({
      id: 'tour-people-tenants',
      steps: [
        {
          title: 'Tenant directory',
          body: 'Search occupants by name, property, or lease status. Open a record for payment history and portal access.',
          placement: 'center',
        },
        {
          title: 'Directory tools',
          body: 'Search and filter tenants from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Leases and landlords are grouped with tenants under People.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/people/leases'),
    roles: ['client_admin', 'agent_admin', 'ground_agent', 'agent'],
    tour: () => ({
      id: 'tour-people-leases',
      steps: [
        {
          title: 'Leases',
          body: 'Review active and upcoming leases, renewal dates, and linked occupants.',
          placement: 'center',
        },
        {
          title: 'Lease tools',
          body: 'Filter by status or property from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Open the matching tenant or landlord from People when you need more context.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/people/landlords'),
    roles: ['client_admin', 'agent_admin', 'ground_agent'],
    tour: () => ({
      id: 'tour-people-landlords',
      steps: [
        {
          title: 'Landlords',
          body: 'Directory of property owners linked to your agency. Open a record for contact details and portfolio links.',
          placement: 'center',
        },
        {
          title: 'Landlord tools',
          body: 'Search or invite landlords from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Properties and trust payouts connect owners to the rest of the workspace.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/operations/contractors'),
    roles: ['client_admin', 'agent_admin', 'ground_agent'],
    tour: () => ({
      id: 'tour-ops-contractors',
      steps: [
        {
          title: 'Contractors',
          body: 'Manage vendors who handle maintenance jobs. Check trades, verification, and open assignments.',
          placement: 'center',
        },
        {
          title: 'Contractor tools',
          body: 'Add or filter contractors from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Maintenance tickets that need vendors live under Operations.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/admin/config'),
    roles: ['super_admin', 'client_admin', 'agent_admin'],
    tour: () => ({
      id: 'tour-admin-config',
      steps: [
        {
          title: 'Configuration',
          body: 'Manage lookup values, property features, and agency-wide defaults that flow through to forms.',
          placement: 'center',
        },
        {
          title: 'Config tools',
          body: 'Switch sections and save changes from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Admin navigation',
          body: 'Lead pipeline and notifications sit under Admin in the sidebar.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/admin/pipeline'),
    roles: ['super_admin', 'client_admin', 'agent_admin'],
    tour: () => ({
      id: 'tour-admin-pipeline',
      steps: [
        {
          title: 'Lead pipeline settings',
          body: 'Configure stages and board columns used on the sales CRM.',
          placement: 'center',
        },
        {
          title: 'Pipeline tools',
          body: 'Add or reorder stages from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Open Leads under Sales to see these stages on the live board.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/admin/notifications'),
    roles: ['super_admin', 'client_admin', 'agent_admin'],
    tour: () => ({
      id: 'tour-admin-notifications',
      steps: [
        {
          title: 'Broadcast notifications',
          body: 'Send announcements to roles or entire agencies. Preview message text before sending.',
          placement: 'center',
        },
        {
          title: 'Broadcast tools',
          body: 'Compose and schedule broadcasts from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Other admin settings stay grouped under Admin.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/insights/reports'),
    roles: ['super_admin', 'client_admin', 'agent_admin'],
    tour: () => ({
      id: 'tour-insights-reports',
      steps: [
        {
          title: 'Reports & analytics',
          body: 'Pick a report tab, then export.',
          placement: 'center',
        },
        {
          title: 'Report tools',
          body: 'Pick a report tab, then set the dates.',
          target: '[data-tip-target="report-tabs"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Reports stays at the bottom of the workspace navigation when your role can view them.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  // —— Super admin ——
  {
    match: exact('/workspace/admin/agencies'),
    roles: ['super_admin'],
    tour: () => ({
      id: 'tour-admin-agencies',
      steps: [
        {
          title: 'Agency management',
          body: 'Each agency has its own data boundary. Open an agency to configure modules, billing, and principal contacts.',
          placement: 'center',
        },
        {
          title: 'Agency tools',
          body: 'Onboard a new agency or search existing ones from the page header.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Platform navigation',
          body: 'All users, configuration, and reports are available from the sidebar.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/admin/all-users'),
    roles: ['super_admin'],
    tour: () => ({
      id: 'tour-admin-all-users',
      steps: [
        {
          title: 'All users',
          body: 'Every account on the platform — open a row to troubleshoot or impersonate when needed.',
          placement: 'center',
        },
        {
          title: 'User directory',
          body: 'Search and filter accounts from the page header. Directory details stay on this page.',
          target: '[data-tip-target="page-actions"] || [data-tip-target="page-header"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Agencies and platform configuration sit under Admin.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  // —— Tenant portal ——
  {
    match: exact('/workspace/portals/tenant'),
    roles: ['tenant'],
    tour: () => ({
      id: 'tour-portal-tenant-home',
      steps: [
        {
          title: 'Your tenancy hub',
          body: 'Check applications, wishlist, and — once approved — rent due, maintenance, and messages with your agency.',
          placement: 'center',
        },
        {
          title: 'Portal overview',
          body: 'The hero summarises your status and links to applications or browsing.',
          target: '[data-tip-target="tenant-hero"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Applications, viewings, and wishlist are always available. Maintenance, messages, and complaints appear after you have a tenancy.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/portals/tenant/applications'),
    roles: ['tenant'],
    tour: () => ({
      id: 'tour-portal-tenant-applications',
      steps: [
        {
          title: 'Your applications',
          body: 'Track each rental application from submission to decision. Upload missing documents when an agent requests them.',
          placement: 'center',
        },
        {
          title: 'Application list',
          body: 'Open any application card for status, documents, and next steps.',
          target: '[data-tip-target="tenant-applications"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Viewings and wishlist stay in My portal while you wait on a decision.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/portals/tenant/viewings'),
    roles: ['tenant'],
    tour: () => ({
      id: 'tour-portal-tenant-viewings',
      steps: [
        {
          title: 'Your viewings',
          body: 'Every viewing booked under your name — past and upcoming — with a link back to each listing.',
          placement: 'center',
        },
        {
          title: 'Viewing list',
          body: 'Filter upcoming or past appointments and open the listing from each row.',
          target: '[data-tip-target="tenant-viewings"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Return to applications or wishlist from the portal navigation.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/account/wishlist'),
    roles: ['tenant'],
    tour: () => ({
      id: 'tour-account-wishlist',
      steps: [
        {
          title: 'Saved listings',
          body: 'Properties you hearted while browsing appear here. Apply directly or remove listings you no longer want.',
          placement: 'center',
        },
        {
          title: 'Wishlist',
          body: 'Browse saved homes or jump back to the marketplace to heart more.',
          target: '[data-tip-target="tenant-wishlist"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Applications and viewings stay under My portal.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/portals/tenant/maintenance'),
    roles: ['tenant'],
    requireTenantOccupancy: true,
    tour: () => ({
      id: 'tour-portal-tenant-maintenance',
      steps: [
        {
          title: 'Report a fault',
          body: 'Report anything broken with photos and urgency. Updates and replies appear here as the person responsible for your home works on it.',
          placement: 'center',
        },
        {
          title: 'Fault form',
          body: 'Describe what is broken and submit — it goes to the agent responsible for your property, and your landlord is told.',
          target: '[data-tip-target="tenant-maintenance"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Messages and complaints appear alongside faults once your tenancy is active.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/portals/tenant/messages'),
    roles: ['tenant'],
    requireTenantOccupancy: true,
    tour: () => ({
      id: 'tour-portal-tenant-messages',
      steps: [
        {
          title: 'Messages',
          body: 'Conversation history with your agency stays in one place. Reply here instead of chasing email threads.',
          placement: 'center',
        },
        {
          title: 'Inbox',
          body: 'Open a thread or start a new message from this page.',
          target: '[data-tip-target="tenant-messages"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Maintenance and complaints are next to messages in the portal nav.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
  {
    match: exact('/workspace/portals/tenant/complaints'),
    roles: ['tenant'],
    requireTenantOccupancy: true,
    tour: () => ({
      id: 'tour-portal-tenant-complaints',
      steps: [
        {
          title: 'Complaints',
          body: 'Escalate serious issues formally so they are tracked and resolved. Include dates and details for a faster response.',
          placement: 'center',
        },
        {
          title: 'Complaint form',
          body: 'Lodge a formal complaint that your agency must acknowledge and track.',
          target: '[data-tip-target="tenant-complaints"]',
          placement: 'below',
        },
        {
          title: 'Sidebar',
          body: 'Maintenance and messages remain available from the portal navigation.',
          target: '[data-tip-target="workspace-nav"]',
          placement: 'below',
        },
      ],
    }),
  },
]

export type ResolvePageTourOptions = {
  /** Same occupancy gate the tenant sidebar uses for maintenance / messages / complaints. */
  tenantOccupancyReady?: boolean
}

export function resolvePageTour(
  pathname: string,
  role: Role | null,
  options?: ResolvePageTourOptions,
): PageTour | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'

  for (const rule of WALKTHROUGH_RULES) {
    if (!rule.match(normalized)) continue
    if (rule.roles && (!role || !rule.roles.includes(role))) continue
    if (rule.requireTenantOccupancy && !options?.tenantOccupancyReady) continue
    return rule.tour(role)
  }

  return null
}

type TipRule = {
  match: (pathname: string) => boolean
  /** When set, only these roles see this tip (others get no tip for this route). */
  roles?: Role[]
  content: (role: Role | null) => PageTipContent
}

function exact(path: string) {
  return (pathname: string) => pathname === path
}

function prefix(path: string) {
  return (pathname: string) => pathname === path || pathname.startsWith(`${path}/`)
}

function detailSegment(path: string, _segment: string) {
  const re = new RegExp(`^${path.replace(/\//g, '\\/')}/[^/]+$`)
  return (pathname: string) => re.test(pathname) && !pathname.endsWith('/new')
}

const RULES: TipRule[] = [
  // —— Marketplace ——
  {
    match: exact('/'),
    content: () => ({
      id: 'market-home',
      title: 'Welcome to Lekaya Rentals',
      body: 'Search by area to browse buy, rent, and commercial listings. Save favourites when signed in, or open Calculators to estimate bond costs.',
    }),
  },
  {
    match: prefix('/browse'),
    content: () => ({
      id: 'market-browse',
      title: 'Refine your search',
      body: 'Switch between buy, rent, and commercial modes, then filter by price, beds, and property type. Map view helps compare neighbourhoods at a glance.',
    }),
  },
  {
    match: (p) => /^\/listing\/[^/]+$/.test(p),
    content: () => ({
      id: 'market-listing',
      title: 'Listing details',
      body: 'Review photos, features, and location before booking a viewing. Use the heart icon to save listings to your wishlist when signed in.',
    }),
  },
  {
    match: exact('/saved'),
    content: () => ({
      id: 'market-saved',
      title: 'Your saved listings',
      body: 'Listings you heart while browsing appear here. Sign in to keep them across devices and apply from your tenant portal.',
    }),
  },
  {
    match: prefix('/calculators'),
    content: () => ({
      id: 'market-calculators',
      title: 'Plan your purchase',
      body: 'Run affordability, bond, and transfer-cost estimates before you apply. Results are indicative — share them with your agent or bank.',
    }),
  },

  // —— Workspace dashboard ——
  {
    match: exact('/workspace'),
    roles: ['client_admin', 'agent_admin'],
    content: () => ({
      id: 'dashboard-agency',
      title: 'Your agency command centre',
      body: 'The overview tab surfaces items needing attention today. Switch tabs for properties, viewings, maintenance, and applications — or use Create to add something new.',
    }),
  },
  {
    match: exact('/workspace'),
    roles: ['ground_agent', 'agent'],
    content: () => ({
      id: 'dashboard-field',
      title: 'Your day at a glance',
      body: 'Viewings, tickets, and follow-ups assigned to you appear here. Tap any row to open details and update status on the go.',
    }),
  },

  // —— Properties ——
  {
    match: exact('/workspace/properties'),
    content: () => ({
      id: 'properties-list',
      title: 'Property portfolio',
      body: 'Switch between list, card, and map views. Filter by status or listing mode, then open a property to manage photos, tenants, and documents.',
    }),
  },
  {
    match: exact('/workspace/properties/new'),
    content: () => ({
      id: 'properties-create',
      title: 'Add a property',
      body: 'Complete each step — location, details, and media — before publishing. Drafts stay private until you mark the listing live.',
    }),
  },
  {
    match: detailSegment('/workspace/properties', 'id'),
    content: () => ({
      id: 'property-detail',
      title: 'Property workspace',
      body: 'Use the tabs to manage overview, applicants, maintenance, payments, and documents without leaving this page.',
    }),
  },

  // —— Sales ——
  {
    match: exact('/workspace/sales/crm'),
    content: () => ({
      id: 'sales-crm',
      title: 'Lead pipeline',
      body: 'Toggle board or list view to track enquiry stages. Open a lead to log calls, schedule follow-ups, and link them to a property.',
    }),
  },
  {
    match: detailSegment('/workspace/sales/crm', 'id'),
    content: () => ({
      id: 'lead-detail',
      title: 'Lead record',
      body: 'Timeline entries capture every touchpoint. Update stage and assign an agent so nothing slips through the cracks.',
    }),
  },
  {
    match: exact('/workspace/sales/applications'),
    content: () => ({
      id: 'sales-applications',
      title: 'Rental applications',
      body: 'Review incoming applicants, run checks, and move promising ones forward. Blocked applicants are hidden from new submissions.',
    }),
  },
  {
    match: detailSegment('/workspace/sales/applications', 'id'),
    content: () => ({
      id: 'applicant-detail',
      title: 'Applicant review',
      body: 'Verify employment, references, and ID before approving. Use the history tab to see every status change.',
    }),
  },
  {
    match: exact('/workspace/sales/viewings'),
    content: () => ({
      id: 'sales-viewings',
      title: 'Viewing schedule',
      body: 'Day strip and calendar views show upcoming appointments. Create a viewing to invite guests and link it to the listing.',
    }),
  },
  {
    match: prefix('/workspace/sales/viewings/property'),
    content: () => ({
      id: 'viewings-property',
      title: 'Property viewings',
      body: 'All scheduled and past viewings for this address appear here. Add notes after each visit to inform the owner.',
    }),
  },

  // —— Operations ——
  {
    match: exact('/workspace/operations/maintenance'),
    content: () => ({
      id: 'ops-maintenance',
      title: 'Maintenance queue',
      body: 'Filter by priority or status to triage open tickets. Assign a contractor and track photos until the job is marked complete.',
    }),
  },
  {
    match: detailSegment('/workspace/operations/maintenance', 'id'),
    content: () => ({
      id: 'maintenance-detail',
      title: 'Ticket details',
      body: 'Log updates, attach photos, and change priority as the situation evolves. Tenants see status changes in their portal.',
    }),
  },
  {
    match: exact('/workspace/operations/documents'),
    content: () => ({
      id: 'ops-documents',
      title: 'Document library',
      body: 'Leases, FICA, and compliance files live here. Filter by property or type, and approve pending uploads from tenants or owners.',
    }),
  },
  {
    match: exact('/workspace/operations/communications'),
    content: () => ({
      id: 'ops-communications',
      title: 'Messages hub',
      body: 'Message tenants and owners in Lekaya. Open a thread to reply or start a new one.',
    }),
  },
  {
    match: exact('/workspace/operations/payments'),
    content: () => ({
      id: 'ops-payments',
      title: 'Rent & payments',
      body: 'Track due, overdue, and paid amounts across your portfolio. Open a payment to attach proof or mark it paid.',
    }),
  },
  {
    match: detailSegment('/workspace/operations/payments', 'id'),
    content: () => ({
      id: 'payment-detail',
      title: 'Payment record',
      body: 'Check the amount, period, and tenant before you mark it paid. Attach proof of payment for your records.',
    }),
  },

  // —— Portals ——
  {
    match: exact('/workspace/portals/owner'),
    roles: ['landlord'],
    content: () => ({
      id: 'portal-owner',
      title: 'Owner portfolio',
      body: 'See occupancy, rent collected, and open maintenance across your properties. Messages from your agency appear in the overview.',
    }),
  },
  {
    match: exact('/workspace/portals/tenant'),
    roles: ['tenant'],
    content: () => ({
      id: 'portal-tenant-home',
      title: 'Your tenancy hub',
      body: 'Check rent due, lease dates, and quick links to maintenance and messages. Saved listings live under Wishlist in the sidebar.',
    }),
  },
  {
    match: exact('/workspace/portals/tenant/applications'),
    roles: ['tenant'],
    content: () => ({
      id: 'portal-tenant-applications',
      title: 'Your applications',
      body: 'Track each rental application from submission to decision. Upload any missing documents when an agent requests them.',
    }),
  },
  {
    match: exact('/workspace/portals/tenant/viewings'),
    roles: ['tenant'],
    content: () => ({
      id: 'portal-tenant-viewings',
      title: 'Your viewings',
      body: 'Every viewing booked under your name — past and upcoming — with a link back to each listing.',
    }),
  },
  {
    match: exact('/workspace/portals/tenant/maintenance'),
    roles: ['tenant'],
    content: () => ({
      id: 'portal-tenant-maintenance',
      title: 'Report a fault',
      body: 'Report anything broken with photos and urgency. You will see updates and replies here, and can confirm when it is fixed.',
    }),
  },
  {
    match: exact('/workspace/portals/tenant/messages'),
    roles: ['tenant'],
    content: () => ({
      id: 'portal-tenant-messages',
      title: 'Messages',
      body: 'Conversation history with your agency stays in one place. Reply here instead of chasing email threads.',
    }),
  },
  {
    match: exact('/workspace/portals/tenant/complaints'),
    roles: ['tenant'],
    content: () => ({
      id: 'portal-tenant-complaints',
      title: 'Complaints',
      body: 'Escalate serious issues formally so they are tracked and resolved. Include dates and details for a faster response.',
    }),
  },
  {
    match: exact('/workspace/account/wishlist'),
    roles: ['tenant'],
    content: () => ({
      id: 'account-wishlist',
      title: 'Saved listings',
      body: 'Properties you hearted while browsing appear here. Apply directly or remove listings you are no longer considering.',
    }),
  },
  {
    match: exact('/workspace/portals/contractor'),
    roles: ['contractor'],
    content: () => ({
      id: 'portal-contractor',
      title: 'Your job board',
      body: 'Assigned maintenance tickets show address, priority, and access notes. Mark jobs complete and upload after photos when finished.',
    }),
  },

  // —— People ——
  {
    match: exact('/workspace/people/staff'),
    content: () => ({
      id: 'people-staff',
      title: 'Team directory',
      body: 'Browse agents and admins in your agency. Open a profile to adjust permissions, workload, or contact details.',
    }),
  },
  {
    match: detailSegment('/workspace/people/staff', 'id'),
    content: () => ({
      id: 'staff-detail',
      title: 'Team member profile',
      body: 'Review assigned properties, open tasks, and permission overrides. Changes here affect what this person can see in the workspace.',
    }),
  },
  {
    match: exact('/workspace/people/tenants'),
    content: () => ({
      id: 'people-tenants',
      title: 'Tenant directory',
      body: 'Search occupants by name, property, or lease status. Open a record for payment history, documents, and portal access.',
    }),
  },
  {
    match: detailSegment('/workspace/people/tenants', 'id'),
    content: () => ({
      id: 'tenant-detail',
      title: 'Tenant record',
      body: 'Lease terms, payment standing, and maintenance history are grouped by tab. Use this view before calling or emailing a tenant.',
    }),
  },

  // —— Insights & admin ——
  {
    match: exact('/workspace/insights/reports'),
    content: () => ({
      id: 'insights-reports',
      title: 'Reports & analytics',
      body: 'Switch report types to see occupancy, collections, and pipeline trends. Adjust the date range before exporting or sharing.',
    }),
  },
  {
    match: exact('/workspace/admin'),
    content: () => ({
      id: 'admin-hub',
      title: 'Administration',
      body: 'Shortcuts to users, configuration, and notifications. Only sections your role allows appear in the sidebar.',
    }),
  },
  {
    match: exact('/workspace/admin/users'),
    content: () => ({
      id: 'admin-users',
      title: 'User management',
      body: 'Create staff, assign roles, and enable agency modules per person. Search by name or filter by role to find someone quickly.',
    }),
  },
  {
    match: exact('/workspace/admin/users/new'),
    content: () => ({
      id: 'admin-user-create',
      title: 'Invite a user',
      body: 'Pick a role template, then fine-tune permissions. Preview shows which sidebar items they will see before you save.',
    }),
  },
  {
    match: detailSegment('/workspace/admin/users', 'id'),
    content: () => ({
      id: 'admin-user-detail',
      title: 'User profile',
      body: 'Update contact info, verification status, and permission overrides. Deactivate accounts instead of deleting to preserve history.',
    }),
  },
  {
    match: exact('/workspace/admin/agencies'),
    roles: ['super_admin'],
    content: () => ({
      id: 'admin-agencies',
      title: 'Agency management',
      body: 'Each agency has its own data boundary. Open an agency to configure modules, billing, and principal contacts.',
    }),
  },
  {
    match: exact('/workspace/admin/agencies/new'),
    roles: ['super_admin'],
    content: () => ({
      id: 'admin-agency-create',
      title: 'Onboard an agency',
      body: 'Set the agency name, region, and enabled modules. The principal admin receives workspace access once the record is saved.',
    }),
  },
  {
    match: detailSegment('/workspace/admin/agencies', 'id'),
    roles: ['super_admin'],
    content: () => ({
      id: 'admin-agency-detail',
      title: 'Agency settings',
      body: 'Toggle modules, review staff, and inspect capability checklists. Changes apply to all users under this agency.',
    }),
  },
  {
    match: exact('/workspace/admin/config'),
    content: () => ({
      id: 'admin-config',
      title: 'Configuration',
      body: 'Manage lookup values, property features, and agency-wide defaults. Edits here flow through to forms across the workspace.',
    }),
  },
  {
    match: exact('/workspace/admin/notifications'),
    content: () => ({
      id: 'admin-notifications',
      title: 'Broadcast notifications',
      body: 'Send announcements to roles or entire agencies. Schedule delivery and preview message text before sending.',
    }),
  },
  {
    match: exact('/workspace/platform/billing'),
    roles: ['super_admin'],
    content: () => ({
      id: 'platform-billing',
      title: 'Platform billing',
      body: 'Review subscription status and invoice history per agency. Contact finance before changing plan tiers in production.',
    }),
  },
]

/**
 * Resolve the first-visit tip for a pathname and optional role.
 * Role-gated rules only match when the user's role is listed.
 */
export function resolvePageTip(pathname: string, role: Role | null): PageTipContent | null {
  const normalized = pathname.replace(/\/+$/, '') || '/'

  for (const rule of RULES) {
    if (!rule.match(normalized)) continue
    if (rule.roles && (!role || !rule.roles.includes(role))) continue
    return rule.content(role)
  }

  return null
}

const STORAGE_KEY = 'pf-page-tips-v2'
// v2: tips are on by default (v1 auto-recorded "off" for everyone on first visit).
const PREFS_KEY = 'pf-page-tips-prefs-v2'
const SESSION_COOLDOWN_KEY = 'pf-page-tips-cooldown'
/** Minimum gap between walkthroughs in the same browser session. */
export const TOUR_SESSION_COOLDOWN_MS = 20 * 60 * 1000

type SeenMap = Record<string, string[]>
type TipsPrefs = { disabled: boolean; decidedAt: string }
type PrefsMap = Record<string, TipsPrefs>

const memorySeen = new Map<string, SeenMap>()
const memoryPrefs = new Map<string, PrefsMap>()
let memoryCooldownAt: number | null = null

type PageTipsListener = () => void
const tipsListeners = new Set<PageTipsListener>()
let tipsChangeVersion = 0

/** Subscribe to tips preference/seen changes; returns an unsubscribe function. */
export function subscribeToPageTipsChanges(listener: PageTipsListener): () => void {
  tipsListeners.add(listener)
  return () => {
    tipsListeners.delete(listener)
  }
}

function emitPageTipsChange(): void {
  tipsChangeVersion += 1
  for (const listener of [...tipsListeners]) {
    try {
      listener()
    } catch {
      /* one broken listener must not break the rest */
    }
  }
}

function readSeenMap(): SeenMap {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as SeenMap
        return parsed && typeof parsed === 'object' ? parsed : {}
      }
    } catch {
      /* fall through to memory */
    }
  }
  return memorySeen.get(STORAGE_KEY) ?? {}
}

function writeSeenMap(map: SeenMap) {
  memorySeen.set(STORAGE_KEY, map)
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* memory already updated */
  }
}

export function hasSeenPageTip(userId: string, tipId: string): boolean {
  if (!userId) return true
  const map = readSeenMap()
  return map[userId]?.includes(tipId) ?? false
}

export function markPageTipSeen(userId: string, tipId: string): void {
  if (!userId) return
  const map = readSeenMap()
  const seen = map[userId] ?? []
  if (seen.includes(tipId)) return
  map[userId] = [...seen, tipId]
  writeSeenMap(map)
  markTourSessionCooldown()
  emitPageTipsChange()
}

function readPrefsMap(): PrefsMap {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(PREFS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as PrefsMap
        return parsed && typeof parsed === 'object' ? parsed : {}
      }
    } catch {
      /* fall through */
    }
  }
  return memoryPrefs.get(PREFS_KEY) ?? {}
}

function writePrefsMap(map: PrefsMap) {
  memoryPrefs.set(PREFS_KEY, map)
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(map))
  } catch {
    /* memory already updated */
  }
}

export function hasPageTipsPreference(userId: string): boolean {
  if (!userId || userId === 'anon') return true
  return Boolean(readPrefsMap()[userId])
}

export function arePageTipsDisabled(userId: string): boolean {
  if (!userId) return true
  return readPrefsMap()[userId]?.disabled === true
}

function writePageTipsPreference(userId: string, disabled: boolean): void {
  const map = readPrefsMap()
  map[userId] = { disabled, decidedAt: new Date().toISOString() }
  writePrefsMap(map)
}

export function setPageTipsPreference(userId: string, disabled: boolean): void {
  if (!userId || userId === 'anon') return
  writePageTipsPreference(userId, disabled)
  emitPageTipsChange()
}

export function markTourSessionCooldown(): void {
  memoryCooldownAt = Date.now()
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(SESSION_COOLDOWN_KEY, String(memoryCooldownAt))
  } catch {
    /* ignore */
  }
}

export function isTourSessionCooldownActive(
  cooldownMs = TOUR_SESSION_COOLDOWN_MS,
): boolean {
  let ts = memoryCooldownAt
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(SESSION_COOLDOWN_KEY)
      if (raw) ts = Number(raw)
    } catch {
      /* use memory */
    }
  }
  if (ts == null || !Number.isFinite(ts)) return false
  memoryCooldownAt = ts
  return Date.now() - ts < cooldownMs
}

/** Test helper — clears preference for a user. */
export function clearPageTipsPreference(userId: string): void {
  const map = readPrefsMap()
  delete map[userId]
  writePrefsMap(map)
  emitPageTipsChange()
}

/** Test helper — clears stored tips for a user. */
export function clearPageTipsForUser(userId: string): void {
  const map = readSeenMap()
  delete map[userId]
  writeSeenMap(map)
  emitPageTipsChange()
}

/** Clear the session cooldown so a walkthrough may start immediately. */
export function clearTourSessionCooldown(): void {
  memoryCooldownAt = null
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(SESSION_COOLDOWN_KEY)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Record a first-visit preference without a blocking modal (FW-05 / E2E P13).
 * Tips are ON by default; the user can skip a tour or turn tips off from the tip itself.
 */
export function ensurePageTipsPreferenceForFirstVisit(
  userId: string,
  hasTourOnPage: boolean,
): void {
  if (!userId || userId === 'guest' || userId === 'anon') return
  if (!hasTourOnPage || hasPageTipsPreference(userId)) return
  // Runs during PageTipsPreferenceDialog's render: write now (the sibling
  // walkthrough reads storage as it renders) but notify subscribers after the
  // render — their setState inside another component's render is a React error.
  writePageTipsPreference(userId, false)
  queueMicrotask(emitPageTipsChange)
}

/** Re-enable tips for a user and clear seen marks so walkthroughs replay immediately. */
export function resetPageTipsForUser(userId: string): void {
  if (!userId || userId === 'anon') return
  setPageTipsPreference(userId, false)
  clearPageTipsForUser(userId)
  clearTourSessionCooldown()
}


/** Test helper — clears all stored tips. */
export function clearAllPageTips(): void {
  memorySeen.delete(STORAGE_KEY)
  memoryPrefs.delete(PREFS_KEY)
  memoryCooldownAt = null
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(PREFS_KEY)
    } catch {
      /* ignore */
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(SESSION_COOLDOWN_KEY)
    } catch {
      /* ignore */
    }
  }
}
