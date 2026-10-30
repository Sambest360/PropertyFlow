import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LEGAL_ENTITY, type LegalField } from '../../lib/legalEntity'
import { usePageMeta } from '../../hooks/usePageMeta'

const FIELD_LABEL: Record<LegalField, string> = {
  brand: 'trading name',
  legalName: 'company name',
  registrationNumber: 'registration number',
  address: 'address',
  informationOfficer: 'Information Officer',
  privacyEmail: 'privacy email',
  supportEmail: 'support email',
  effectiveDate: 'effective date',
}

/** A company detail from LEGAL_ENTITY, or a visible marker while it is blank. */
export function Entity({ field }: { field: LegalField }) {
  const value = LEGAL_ENTITY[field]?.trim()
  if (value) return <>{value}</>
  return (
    <span className="rounded bg-amber-100 px-1 text-amber-900" data-testid={`legal-missing-${field}`}>
      [{FIELD_LABEL[field]} to be confirmed]
    </span>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-ink-600">{children}</div>
    </section>
  )
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

export function LegalPage({
  title,
  description,
  path,
  children,
}: {
  title: string
  description: string
  path: string
  children: ReactNode
}) {
  usePageMeta({ title, description, path })
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <header className="space-y-2 border-b border-primary-100 pb-6">
        <h1 className="font-display text-3xl font-semibold text-ink">{title}</h1>
        <p className="text-sm text-ink-500">
          Effective {LEGAL_ENTITY.effectiveDate}. {LEGAL_ENTITY.brand} is operated by <Entity field="legalName" />{' '}
          (<Entity field="registrationNumber" />), <Entity field="address" />.
        </p>
      </header>
      {children}
      <footer className="border-t border-primary-100 pt-6 text-sm text-ink-500">
        See also: <Link className="text-primary underline" to="/privacy">Privacy Policy</Link> ·{' '}
        <Link className="text-primary underline" to="/terms">Terms of Service</Link>
      </footer>
    </article>
  )
}
