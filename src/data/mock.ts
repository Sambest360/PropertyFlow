export type PropertyType =
  | 'House'
  | 'Apartment'
  | 'Townhouse'
  | 'Commercial'
  | 'Office'
  | 'Vacant Land'
  | 'Farm'
  | 'Student Accommodation'

export type ListingStatus = 'Draft' | 'Published' | 'Featured' | 'Under Offer' | 'Sold' | 'Rented' | 'Archived'
export type LeadStage =
  | 'New Lead'
  | 'Contacted'
  | 'Viewing Scheduled'
  | 'Viewing Completed'
  | 'Application Submitted'
  | 'Documents Verified'
  | 'Credit Check'
  | 'Approved'
  | 'Offer Sent'
  | 'Offer Accepted'
  | 'Deposit Paid'
  | 'Lease Signed'
  | 'Sale Completed'
  | 'Move In'
  | 'Property Managed'

export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent'
export type TicketStatus = 'Requested' | 'In Progress' | 'Awaiting Parts' | 'Completed' | 'Cancelled'

export const pipelineStages: LeadStage[] = [
  'New Lead',
  'Contacted',
  'Viewing Scheduled',
  'Viewing Completed',
  'Application Submitted',
  'Documents Verified',
  'Credit Check',
  'Approved',
  'Offer Sent',
  'Offer Accepted',
  'Deposit Paid',
  'Lease Signed',
  'Sale Completed',
  'Move In',
  'Property Managed',
]

export const kpis = {
  activeListings: 148,
  propertiesSold: 32,
  propertiesRented: 67,
  applicationsAwaiting: 19,
  newLeads: 41,
  scheduledViewings: 28,
  maintenanceRequests: 14,
  occupancyRate: 92.4,
  revenue: 4_850_000,
  commission: 412_500,
}

export const recentActivities = [
  { id: 1, type: 'lead', text: 'New enquiry on Sandton Apartment #SA-204', time: '4 min ago', user: 'System' },
  { id: 2, type: 'viewing', text: 'Viewing completed — 14 Rosebank Ave with Thabo M.', time: '22 min ago', user: 'Lerato Nkosi' },
  { id: 3, type: 'application', text: 'Application submitted by Nomsa Dlamini', time: '1 hr ago', user: 'Portal' },
  { id: 4, type: 'payment', text: 'Deposit received — R25,000 for Unit B12', time: '2 hrs ago', user: 'Payments' },
  { id: 5, type: 'maintenance', text: 'High priority ticket opened — leaking geyser', time: '3 hrs ago', user: 'Tenant Portal' },
  { id: 6, type: 'document', text: 'Lease signed digitally — Waterfall Estate', time: '5 hrs ago', user: 'E-Sign' },
]

export const properties = [
  {
    id: 'PR-1001',
    title: 'Modern 3-Bed House in Midrand',
    type: 'House' as PropertyType,
    status: 'Published' as ListingStatus,
    price: 2_450_000,
    rent: null as number | null,
    beds: 3,
    baths: 2,
    parking: 2,
    area: 210,
    city: 'Midrand',
    suburb: 'Carlswald',
    agent: 'Lerato Nkosi',
    owner: 'J. van der Berg',
    lat: -25.9992,
    lng: 28.1282,
    featured: true,
    image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
    amenities: ['Garden', 'Security Estate', 'Pool', 'Fibre'],
    nearby: { schools: ['Curro Midrand', 'Midrand Primary'], shopping: ['Mall of Africa'] },
  },
  {
    id: 'PR-1002',
    title: 'Sandton Skyline Apartment',
    type: 'Apartment' as PropertyType,
    status: 'Featured' as ListingStatus,
    price: 3_200_000,
    rent: 28_500,
    beds: 2,
    baths: 2,
    parking: 1,
    area: 98,
    city: 'Sandton',
    suburb: 'Sandown',
    agent: 'James Okonkwo',
    owner: 'Horizon Trust',
    lat: -26.1076,
    lng: 28.0567,
    featured: true,
    image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80',
    amenities: ['Gym', 'Concierge', 'Balcony', 'Generator'],
    nearby: { schools: ['Brescia House'], shopping: ['Sandton City', 'Nelson Mandela Square'] },
  },
  {
    id: 'PR-1003',
    title: 'Rosebank Townhouse Complex',
    type: 'Townhouse' as PropertyType,
    status: 'Under Offer' as ListingStatus,
    price: 1_890_000,
    rent: null,
    beds: 3,
    baths: 2.5,
    parking: 2,
    area: 145,
    city: 'Johannesburg',
    suburb: 'Rosebank',
    agent: 'Priya Naidoo',
    owner: 'M. Botha',
    lat: -26.1465,
    lng: 28.0436,
    featured: false,
    image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
    amenities: ['Pet Friendly', 'Clubhouse', '24h Security'],
    nearby: { schools: ['St Teresa\'s'], shopping: ['The Zone@Rosebank'] },
  },
  {
    id: 'PR-1004',
    title: 'Cape Town Waterfront Office Suite',
    type: 'Office' as PropertyType,
    status: 'Published' as ListingStatus,
    price: 8_500_000,
    rent: 95_000,
    beds: 0,
    baths: 2,
    parking: 6,
    area: 420,
    city: 'Cape Town',
    suburb: 'V&A Waterfront',
    agent: 'Sipho Molefe',
    owner: 'Atlantic Holdings',
    lat: -33.9036,
    lng: 18.4201,
    featured: false,
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
    amenities: ['Boardroom', 'Fibre', 'Parking Bay', 'Sea View'],
    nearby: { schools: [], shopping: ['V&A Waterfront'] },
  },
  {
    id: 'PR-1005',
    title: 'Stellenbosch Student Loft',
    type: 'Student Accommodation' as PropertyType,
    status: 'Rented' as ListingStatus,
    price: null as number | null,
    rent: 6_800,
    beds: 1,
    baths: 1,
    parking: 0,
    area: 28,
    city: 'Stellenbosch',
    suburb: 'Central',
    agent: 'Lerato Nkosi',
    owner: 'Campus Living Pty',
    lat: -33.9321,
    lng: 18.8602,
    featured: false,
    image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80',
    amenities: ['Furnished', 'WiFi', 'Laundry'],
    nearby: { schools: ['Stellenbosch University'], shopping: ['Eikestad Mall'] },
  },
  {
    id: 'PR-1006',
    title: 'Pretoria East Vacant Land',
    type: 'Vacant Land' as PropertyType,
    status: 'Published' as ListingStatus,
    price: 950_000,
    rent: null,
    beds: 0,
    baths: 0,
    parking: 0,
    area: 1200,
    city: 'Pretoria',
    suburb: 'Faerie Glen',
    agent: 'James Okonkwo',
    owner: 'LandBank Estates',
    lat: -25.7831,
    lng: 28.2984,
    featured: false,
    image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80',
    amenities: ['Corner Stand', 'Services Nearby'],
    nearby: { schools: ['Hoërskool Waterkloof'], shopping: ['Menlyn Park'] },
  },
  {
    id: 'PR-1007',
    title: 'Durban North Commercial Unit',
    type: 'Commercial' as PropertyType,
    status: 'Sold' as ListingStatus,
    price: 4_100_000,
    rent: null,
    beds: 0,
    baths: 1,
    parking: 4,
    area: 280,
    city: 'Durban',
    suburb: 'Umhlanga',
    agent: 'Priya Naidoo',
    owner: 'Coastal Prop Co',
    lat: -29.7259,
    lng: 31.0850,
    featured: false,
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80',
    amenities: ['High Visibility', 'Loading Bay'],
    nearby: { schools: [], shopping: ['Gateway Theatre of Shopping'] },
  },
  {
    id: 'PR-1008',
    title: 'Free State Mixed Farm',
    type: 'Farm' as PropertyType,
    status: 'Draft' as ListingStatus,
    price: 12_500_000,
    rent: null,
    beds: 4,
    baths: 3,
    parking: 5,
    area: 850000,
    city: 'Bloemfontein',
    suburb: 'Rural',
    agent: 'Sipho Molefe',
    owner: 'du Plessis Family Trust',
    lat: -29.0852,
    lng: 26.1596,
    featured: false,
    image: 'https://images.unsplash.com/photo-1500076656116-558758c991c1?w=800&q=80',
    amenities: ['Borehole', 'Outbuildings', 'Irrigation'],
    nearby: { schools: [], shopping: [] },
  },
]

export const leads = [
  {
    id: 'LD-2201',
    name: 'Thabo Molefe',
    email: 'thabo.m@email.com',
    phone: '+27 82 441 2290',
    channel: 'WhatsApp',
    property: 'Sandton Skyline Apartment',
    stage: 'Viewing Scheduled' as LeadStage,
    agent: 'James Okonkwo',
    lastContact: '2026-07-22',
    value: 3_200_000,
    type: 'Buy',
  },
  {
    id: 'LD-2202',
    name: 'Nomsa Dlamini',
    email: 'nomsa.d@email.com',
    phone: '+27 71 883 1102',
    channel: 'Web Form',
    property: 'Modern 3-Bed House in Midrand',
    stage: 'Application Submitted' as LeadStage,
    agent: 'Lerato Nkosi',
    lastContact: '2026-07-21',
    value: 2_450_000,
    type: 'Buy',
  },
  {
    id: 'LD-2203',
    name: 'Lucas Pretorius',
    email: 'lucas.p@email.com',
    phone: '+27 83 220 9911',
    channel: 'Email',
    property: 'Stellenbosch Student Loft',
    stage: 'Deposit Paid' as LeadStage,
    agent: 'Lerato Nkosi',
    lastContact: '2026-07-20',
    value: 6_800,
    type: 'Rent',
  },
  {
    id: 'LD-2204',
    name: 'Ayesha Khan',
    email: 'ayesha.k@email.com',
    phone: '+27 76 554 3321',
    channel: 'Call',
    property: 'Rosebank Townhouse Complex',
    stage: 'Offer Sent' as LeadStage,
    agent: 'Priya Naidoo',
    lastContact: '2026-07-22',
    value: 1_890_000,
    type: 'Buy',
  },
  {
    id: 'LD-2205',
    name: 'Johan Botha',
    email: 'j.botha@corp.co.za',
    phone: '+27 11 555 0199',
    channel: 'Referral',
    property: 'Cape Town Waterfront Office Suite',
    stage: 'New Lead' as LeadStage,
    agent: 'Sipho Molefe',
    lastContact: '2026-07-22',
    value: 95_000,
    type: 'Rent',
  },
  {
    id: 'LD-2206',
    name: 'Fatima Jacobs',
    email: 'fatima.j@email.com',
    phone: '+27 84 112 7788',
    channel: 'WhatsApp',
    property: 'Sandton Skyline Apartment',
    stage: 'Credit Check' as LeadStage,
    agent: 'James Okonkwo',
    lastContact: '2026-07-19',
    value: 28_500,
    type: 'Rent',
  },
  {
    id: 'LD-2207',
    name: 'David Chen',
    email: 'd.chen@email.com',
    phone: '+27 72 990 4455',
    channel: 'Web Form',
    property: 'Pretoria East Vacant Land',
    stage: 'Contacted' as LeadStage,
    agent: 'James Okonkwo',
    lastContact: '2026-07-21',
    value: 950_000,
    type: 'Buy',
  },
  {
    id: 'LD-2208',
    name: 'Sarah Williams',
    email: 's.williams@email.com',
    phone: '+27 79 331 2200',
    channel: 'Email',
    property: 'Modern 3-Bed House in Midrand',
    stage: 'Viewing Completed' as LeadStage,
    agent: 'Lerato Nkosi',
    lastContact: '2026-07-18',
    value: 2_450_000,
    type: 'Buy',
  },
]

export const leadTimeline = [
  { id: 1, at: '2026-07-22 09:14', channel: 'WhatsApp', title: 'Enquiry received', detail: 'Asked about parking and fibre availability.' },
  { id: 2, at: '2026-07-22 09:40', channel: 'Call', title: 'Agent called back', detail: 'Confirmed budget R3–3.5M. Interested in Sandton.' },
  { id: 3, at: '2026-07-22 11:05', channel: 'Email', title: 'Brochure sent', detail: 'Floor plans + virtual tour link shared.' },
  { id: 4, at: '2026-07-22 14:30', channel: 'System', title: 'Viewing scheduled', detail: '23 Jul 2026, 10:00 — Sandton Skyline Apt.' },
  { id: 5, at: '2026-07-21 16:00', channel: 'Note', title: 'Internal note', detail: 'Prefers north-facing units. Has pre-approval letter.' },
]

export const applications = [
  {
    id: 'APP-901',
    applicant: 'Nomsa Dlamini',
    property: 'Modern 3-Bed House in Midrand',
    type: 'Purchase',
    progress: 72,
    stage: 'Documents Verified',
    creditCheck: 'Pending',
    income: 85_000,
    employment: 'Absa — Senior Analyst',
    agent: 'Lerato Nkosi',
    submitted: '2026-07-21',
    docs: ['ID', 'Payslips', 'Bank Statements', 'References'],
  },
  {
    id: 'APP-902',
    applicant: 'Fatima Jacobs',
    property: 'Sandton Skyline Apartment',
    type: 'Rental',
    progress: 88,
    stage: 'Credit Check',
    creditCheck: 'In Progress',
    income: 48_000,
    employment: 'Deloitte — Consultant',
    agent: 'James Okonkwo',
    submitted: '2026-07-19',
    docs: ['ID', 'Payslips', 'Bank Statements', 'Employment Letter'],
  },
  {
    id: 'APP-903',
    applicant: 'Lucas Pretorius',
    property: 'Stellenbosch Student Loft',
    type: 'Rental',
    progress: 100,
    stage: 'Approved',
    creditCheck: 'Passed',
    income: 0,
    employment: 'Student — Guarantor parent',
    agent: 'Lerato Nkosi',
    submitted: '2026-07-15',
    docs: ['ID', 'Guarantor Docs', 'University Proof'],
  },
  {
    id: 'APP-904',
    applicant: 'Ayesha Khan',
    property: 'Rosebank Townhouse Complex',
    type: 'Purchase',
    progress: 55,
    stage: 'Application Submitted',
    creditCheck: 'Not Started',
    income: 72_000,
    employment: 'Discovery — Product Lead',
    agent: 'Priya Naidoo',
    submitted: '2026-07-22',
    docs: ['ID', 'Payslips'],
  },
]

export const viewings = [
  { id: 'VW-1', property: 'Sandton Skyline Apartment', agent: 'James Okonkwo', applicant: 'Thabo Molefe', date: '2026-07-23', time: '10:00', status: 'Scheduled', attendance: '—' },
  { id: 'VW-2', property: 'Modern 3-Bed House in Midrand', agent: 'Lerato Nkosi', applicant: 'Sarah Williams', date: '2026-07-21', time: '15:30', status: 'Completed', attendance: 'Attended', feedback: 'Loved the garden; concerned about commute.' },
  { id: 'VW-3', property: 'Rosebank Townhouse Complex', agent: 'Priya Naidoo', applicant: 'Ayesha Khan', date: '2026-07-22', time: '11:00', status: 'Completed', attendance: 'Attended', feedback: 'Ready to submit offer.' },
  { id: 'VW-4', property: 'Cape Town Waterfront Office Suite', agent: 'Sipho Molefe', applicant: 'Johan Botha', date: '2026-07-24', time: '09:00', status: 'Scheduled', attendance: '—' },
  { id: 'VW-5', property: 'Sandton Skyline Apartment', agent: 'James Okonkwo', applicant: 'Fatima Jacobs', date: '2026-07-18', time: '16:00', status: 'No-show', attendance: 'No-show' },
]

export const maintenanceTickets = [
  { id: 'MT-4401', title: 'Leaking geyser — Unit B12', property: 'Sandton Skyline Apartment', tenant: 'Lucas Pretorius', priority: 'High' as Priority, status: 'In Progress' as TicketStatus, contractor: 'AquaFix Plumbing', cost: 4_850, opened: '2026-07-22', photos: 3 },
  { id: 'MT-4402', title: 'Broken intercom', property: 'Rosebank Townhouse Complex', tenant: 'M. Sithole', priority: 'Medium' as Priority, status: 'Requested' as TicketStatus, contractor: 'Unassigned', cost: 0, opened: '2026-07-21', photos: 1 },
  { id: 'MT-4403', title: 'Garden irrigation fault', property: 'Modern 3-Bed House in Midrand', tenant: 'Owner occupied', priority: 'Low' as Priority, status: 'Completed' as TicketStatus, contractor: 'GreenScape', cost: 2_200, opened: '2026-07-10', photos: 2 },
  { id: 'MT-4404', title: 'AC not cooling — Office 4', property: 'Cape Town Waterfront Office Suite', tenant: 'Atlantic Soft', priority: 'Urgent' as Priority, status: 'Awaiting Parts' as TicketStatus, contractor: 'CoolAir CT', cost: 12_400, opened: '2026-07-20', photos: 4 },
  { id: 'MT-4405', title: 'Lock replacement', property: 'Stellenbosch Student Loft', tenant: 'Lucas Pretorius', priority: 'High' as Priority, status: 'Completed' as TicketStatus, contractor: 'SecureLock', cost: 890, opened: '2026-07-05', photos: 1 },
]

export const documents = [
  { id: 'DOC-1', name: 'Offer to Purchase — Rosebank TH', type: 'Offer to Purchase', property: 'Rosebank Townhouse Complex', version: 'v3', status: 'Signed', updated: '2026-07-22', size: '1.2 MB' },
  { id: 'DOC-2', name: 'Lease Agreement — Student Loft', type: 'Lease', property: 'Stellenbosch Student Loft', version: 'v2', status: 'Signed', updated: '2026-07-16', size: '890 KB' },
  { id: 'DOC-3', name: 'Inspection Report — Unit B12', type: 'Inspection Report', property: 'Sandton Skyline Apartment', version: 'v1', status: 'Draft', updated: '2026-07-21', size: '3.4 MB' },
  { id: 'DOC-4', name: 'Invoice INV-8821', type: 'Invoice', property: 'Sandton Skyline Apartment', version: 'v1', status: 'Sent', updated: '2026-07-22', size: '210 KB' },
  { id: 'DOC-5', name: 'Occupancy Certificate', type: 'Certificate', property: 'Modern 3-Bed House in Midrand', version: 'v1', status: 'Verified', updated: '2026-07-12', size: '540 KB' },
  { id: 'DOC-6', name: 'ID — Nomsa Dlamini', type: 'Identity Document', property: '—', version: 'v1', status: 'Verified', updated: '2026-07-21', size: '1.1 MB' },
]

export const conversations = [
  { id: 'C1', with: 'Thabo Molefe', channel: 'WhatsApp', property: 'Sandton Skyline', preview: 'Is the viewing still on for Thursday?', unread: 2, time: '09:41' },
  { id: 'C2', with: 'Nomsa Dlamini', channel: 'Email', property: 'Midrand House', preview: 'I have uploaded my bank statements…', unread: 0, time: 'Yesterday' },
  { id: 'C3', with: 'AquaFix Plumbing', channel: 'SMS', property: 'Unit B12', preview: 'Parts arriving tomorrow morning.', unread: 1, time: '08:12' },
  { id: 'C4', with: 'Ayesha Khan', channel: 'Email', property: 'Rosebank TH', preview: 'Please send the OTP for e-signature.', unread: 0, time: 'Mon' },
  { id: 'C5', with: 'Internal — Midrand deal', channel: 'Note', property: 'Midrand House', preview: 'Bond attorney: Cliffe Dekker.', unread: 0, time: 'Mon' },
]

export const payments = [
  { id: 'PAY-1', type: 'Deposit', party: 'Lucas Pretorius', property: 'Stellenbosch Student Loft', amount: 13_600, status: 'Paid', date: '2026-07-16', method: 'EFT' },
  { id: 'PAY-2', type: 'Rent', party: 'Lucas Pretorius', property: 'Stellenbosch Student Loft', amount: 6_800, status: 'Paid', date: '2026-07-01', method: 'Debit Order' },
  { id: 'PAY-3', type: 'Commission', party: 'Horizon Realty', property: 'Durban North Commercial', amount: 205_000, status: 'Paid', date: '2026-07-08', method: 'EFT' },
  { id: 'PAY-4', type: 'Sale', party: 'Buyer — Coastal Prop', property: 'Durban North Commercial', amount: 4_100_000, status: 'Settled', date: '2026-07-05', method: 'Transfer' },
  { id: 'PAY-5', type: 'Invoice', party: 'AquaFix Plumbing', property: 'Sandton Skyline', amount: 4_850, status: 'Outstanding', date: '2026-07-22', method: '—' },
  { id: 'PAY-6', type: 'Rent', party: 'Atlantic Soft', property: 'CT Waterfront Office', amount: 95_000, status: 'Overdue', date: '2026-07-01', method: '—' },
  { id: 'PAY-7', type: 'Refund', party: 'Ex-tenant Unit A3', property: 'Rosebank Townhouse', amount: 8_500, status: 'Processing', date: '2026-07-20', method: 'EFT' },
]

export const staff = [
  { id: 'S1', name: 'Lerato Nkosi', role: 'Senior Agent', branch: 'Johannesburg Central', email: 'lerato@propertyflow.co.za', phone: '+27 11 555 0101', deals: 24, avatar: 'LN' },
  { id: 'S2', name: 'James Okonkwo', role: 'Agent', branch: 'Sandton', email: 'james@propertyflow.co.za', phone: '+27 11 555 0102', deals: 18, avatar: 'JO' },
  { id: 'S3', name: 'Priya Naidoo', role: 'Agent', branch: 'Rosebank', email: 'priya@propertyflow.co.za', phone: '+27 11 555 0103', deals: 15, avatar: 'PN' },
  { id: 'S4', name: 'Sipho Molefe', role: 'Commercial Agent', branch: 'Cape Town', email: 'sipho@propertyflow.co.za', phone: '+27 21 555 0104', deals: 9, avatar: 'SM' },
  { id: 'S5', name: 'Amelia Roux', role: 'Branch Manager', branch: 'Johannesburg Central', email: 'amelia@propertyflow.co.za', phone: '+27 11 555 0100', deals: 0, avatar: 'AR' },
  { id: 'S6', name: 'Kagiso Modise', role: 'Admin', branch: 'Head Office', email: 'kagiso@propertyflow.co.za', phone: '+27 11 555 0199', deals: 0, avatar: 'KM' },
]

export const tenants = [
  { id: 'T1', name: 'Lucas Pretorius', unit: 'Student Loft 4B', property: 'Stellenbosch Student Loft', leaseEnd: '2026-12-31', status: 'Active', avatar: 'LP' },
  { id: 'T2', name: 'M. Sithole', unit: 'Unit 7', property: 'Rosebank Townhouse Complex', leaseEnd: '2027-03-15', status: 'Active', avatar: 'MS' },
  { id: 'T3', name: 'Atlantic Soft Pty', unit: 'Suite 4', property: 'CT Waterfront Office', leaseEnd: '2028-01-01', status: 'Active', avatar: 'AS' },
  { id: 'T4', name: 'Zanele Mokoena', unit: 'A12', property: 'Sandton Skyline Apartment', leaseEnd: '2026-09-30', status: 'Notice Given', avatar: 'ZM' },
  { id: 'T5', name: 'Chris van Wyk', unit: 'Garden Flat', property: 'Midrand House', leaseEnd: '2026-06-30', status: 'Ended', avatar: 'CV' },
]

export const contractors = [
  { id: 'CT1', name: 'AquaFix Plumbing', specialty: 'Plumbing', jobs: 12, rating: 4.8, earnings: 68_400 },
  { id: 'CT2', name: 'CoolAir CT', specialty: 'HVAC', jobs: 7, rating: 4.5, earnings: 94_200 },
  { id: 'CT3', name: 'GreenScape', specialty: 'Landscaping', jobs: 15, rating: 4.9, earnings: 41_000 },
  { id: 'CT4', name: 'SecureLock', specialty: 'Security & Locks', jobs: 22, rating: 4.7, earnings: 28_900 },
]

export const revenueByMonth = [
  { month: 'Jan', sales: 2.1, rentals: 0.82, maintenance: 0.12 },
  { month: 'Feb', sales: 1.8, rentals: 0.85, maintenance: 0.09 },
  { month: 'Mar', sales: 3.2, rentals: 0.88, maintenance: 0.15 },
  { month: 'Apr', sales: 2.4, rentals: 0.91, maintenance: 0.11 },
  { month: 'May', sales: 2.9, rentals: 0.94, maintenance: 0.18 },
  { month: 'Jun', sales: 3.5, rentals: 0.96, maintenance: 0.14 },
  { month: 'Jul', sales: 4.1, rentals: 0.98, maintenance: 0.16 },
]

export const agentPerformance = [
  { name: 'Lerato', closed: 24, conversion: 38 },
  { name: 'James', closed: 18, conversion: 31 },
  { name: 'Priya', closed: 15, conversion: 29 },
  { name: 'Sipho', closed: 9, conversion: 22 },
]

export const adminConfig = {
  propertyTypes: ['House', 'Apartment', 'Townhouse', 'Commercial', 'Office', 'Vacant Land', 'Farm', 'Student Accommodation'],
  leadStages: pipelineStages,
  documentTypes: ['Contract', 'Lease', 'Offer to Purchase', 'Inspection Report', 'Invoice', 'Certificate', 'Identity Document', 'Signed PDF'],
  maintenanceCategories: ['Plumbing', 'Electrical', 'HVAC', 'Structural', 'Security', 'Garden', 'Appliances'],
  amenities: ['Pool', 'Garden', 'Gym', 'Fibre', 'Security Estate', 'Parking', 'Pet Friendly', 'Furnished', 'Generator', 'Balcony'],
  roles: ['Super Admin', 'Lead', 'Branch Manager', 'Agent', 'Staff', 'Owner', 'Buyer', 'Tenant', 'Contractor', 'Maintenance'],
}

export function formatZAR(n: number | null | undefined) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(n)
}
