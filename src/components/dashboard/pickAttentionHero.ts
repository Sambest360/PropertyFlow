import type { Application, MaintenanceTicket, PropertyAsset, Viewing } from '../../types/domain'
import type { AttentionHeroProps } from './AttentionHero'

export type AttentionHeroKind = 'issue' | 'viewing' | 'application' | 'listing' | 'payment' | 'job'

export type PickedAttentionHero = AttentionHeroProps & {
  kind: AttentionHeroKind
  property?: PropertyAsset
}

export function pickAttentionHero(
  properties: PropertyAsset[],
  tickets: MaintenanceTicket[],
  viewings: Viewing[],
  applications: Application[],
): PickedAttentionHero | null {
  if (properties.length === 0 && tickets.length === 0 && viewings.length === 0 && applications.length === 0) {
    return null
  }

  const openHigh = tickets
    .filter(
      (t) =>
        t.status !== 'Completed' &&
        t.status !== 'Cancelled' &&
        ['High', 'Urgent', 'Emergency'].includes(t.priority),
    )
    .sort((a, b) => {
      const rank = (p: string) =>
        p === 'Emergency' ? 0 : p === 'Urgent' ? 1 : p === 'High' ? 2 : 3
      return rank(a.priority) - rank(b.priority) || b.openedAt.localeCompare(a.openedAt)
    })

  if (openHigh[0]) {
    const ticket = openHigh[0]
    const property = properties.find((p) => p.id === ticket.propertyId) ?? properties[0]
    const openOnProperty = property
      ? tickets.filter(
          (t) =>
            t.propertyId === property.id && t.status !== 'Completed' && t.status !== 'Cancelled',
        ).length
      : 0
    return {
      kind: 'issue',
      eyebrow: 'Needs your attention',
      title: ticket.title,
      detail: `${property?.title ?? ticket.assetLabel} · ${ticket.reportedBy}`,
      badge: ticket.priority,
      badgeTone: 'danger',
      secondaryBadge: property?.type,
      property,
      stats: [
        { label: 'Maintenance', value: ticket.id },
        { label: 'Open issues', value: String(openOnProperty) },
        {
          label: 'Location',
          value: property ? `${property.suburb}, ${property.city}` : ticket.assetLabel,
        },
      ],
      cta: {
        label: 'Open maintenance',
        to: `/workspace/operations/maintenance/${encodeURIComponent(ticket.id)}`,
      },
      secondaryCta: property
        ? { label: 'Property details', to: `/workspace/properties/${property.id}` }
        : undefined,
      propertyLink: property
        ? { to: `/workspace/properties/${property.id}` }
        : { to: '/workspace/operations/maintenance', label: 'View maintenance' },
      image: property?.images[0],
    }
  }

  const upcoming = viewings
    .filter((v) => v.status === 'Scheduled')
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))

  if (upcoming[0]) {
    const viewing = upcoming[0]
    const property = properties.find((p) => p.id === viewing.propertyId) ?? properties[0]
    return {
      kind: 'viewing',
      eyebrow: 'Upcoming viewing',
      title: property?.title ?? 'Viewing',
      detail: `${viewing.applicantName} · ${viewing.date} at ${viewing.time}`,
      badge: 'Scheduled',
      badgeTone: 'warning',
      secondaryBadge: property?.type,
      property,
      stats: [
        { label: 'When', value: `${viewing.date} ${viewing.time}` },
        { label: 'Applicant', value: viewing.applicantName },
        {
          label: 'Location',
          value: property ? `${property.suburb}, ${property.city}` : '—',
        },
      ],
      cta: {
        label: 'Manage viewing',
        to: property
          ? `/workspace/sales/viewings/property/${encodeURIComponent(property.id)}`
          : '/workspace/sales/viewings',
      },
      secondaryCta: property
        ? { label: 'Property details', to: `/workspace/properties/${property.id}` }
        : undefined,
      propertyLink: property
        ? { to: `/workspace/properties/${property.id}` }
        : { to: '/workspace/sales/viewings', label: 'Viewings' },
      image: property?.images[0],
    }
  }

  const awaiting = applications
    .filter((a) => a.progress < 100 && !['Active Tenancy', 'Rejected', 'Withdrawn'].includes(a.stage))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  if (awaiting[0]) {
    const app = awaiting[0]
    const property = properties.find((p) => p.id === app.propertyId) ?? properties[0]
    return {
      kind: 'application',
      eyebrow: 'Application waiting',
      title: app.applicantName,
      detail: `${property?.title ?? 'Property'} · ${app.stage}`,
      badge: app.stage,
      badgeTone: 'warning',
      secondaryBadge: property?.type,
      property,
      stats: [
        { label: 'App ID', value: app.id },
        { label: 'Type', value: app.type },
        {
          label: 'Location',
          value: property ? `${property.suburb}, ${property.city}` : '—',
        },
      ],
      cta: {
        label: 'Review application',
        to: `/workspace/sales/applications?application=${encodeURIComponent(app.id)}`,
      },
      secondaryCta: property
        ? { label: 'Property details', to: `/workspace/properties/${property.id}` }
        : undefined,
      propertyLink: property
        ? { to: `/workspace/properties/${property.id}` }
        : { to: '/workspace/sales/applications', label: 'Applications' },
      image: property?.images[0],
    }
  }

  if (properties.length === 0) return null

  const featured =
    properties.find((p) => p.featured || p.status === 'Featured') ??
    properties.find((p) => p.status === 'Published') ??
    properties[0]

  return {
    kind: 'listing',
    eyebrow: 'Portfolio spotlight',
    title: featured.title,
    detail: `${featured.suburb}, ${featured.city}`,
    badge: featured.featured || featured.status === 'Featured' ? 'Featured' : featured.status,
    badgeTone: 'brand',
    secondaryBadge: featured.type,
    property: featured,
    stats: [
      { label: 'Registry ID', value: featured.id },
      { label: 'Status', value: featured.status },
      { label: 'Location', value: `${featured.suburb}, ${featured.city}` },
    ],
    cta: {
      label: 'Open property',
      to: `/workspace/properties/${featured.id}`,
    },
    secondaryCta: { label: 'All properties', to: '/workspace/properties' },
    propertyLink: { to: `/workspace/properties/${featured.id}` },
    image: featured.images[0],
  }
}
