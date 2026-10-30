import { Link } from 'react-router-dom'
import { usePageMeta } from '../hooks/usePageMeta'
import { LEGAL_ENTITY } from '../lib/legalEntity'
import { Entity, Section } from './legal/LegalPage'

/**
 * Public contact page (T5 footer). The addresses come from src/lib/legalEntity.ts,
 * which Samuel fills in (spec r4 T6); a blank one shows a "to be confirmed" marker.
 */
export default function ContactPage() {
  const brand = LEGAL_ENTITY.brand
  usePageMeta({ title: 'Contact us', description: `How to reach ${brand}.`, path: '/contact' })
  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <header className="space-y-2 border-b border-primary-100 pb-6">
        <h1 className="font-display text-3xl font-semibold text-ink">Contact us</h1>
      </header>
      <Section title="General questions">
        <p>
          Email <Entity field="supportEmail" />.
        </p>
      </Section>
      <Section title="Privacy requests">
        <p>
          Our Information Officer is <Entity field="informationOfficer" />, at <Entity field="privacyEmail" />. See
          the{' '}
          <Link className="text-primary underline" to="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>
      <Section title="A listing, enquiry, application or lease">
        <p>
          Contact the agent, agency or landlord that listed the property. They manage that information, as the
          Privacy Policy explains.
        </p>
      </Section>
      <Section title="List with us">
        <p>
          Landlords can{' '}
          <Link className="text-primary underline" to="/register">
            create an account
          </Link>{' '}
          and list their own properties. Agencies, email <Entity field="supportEmail" />.
        </p>
      </Section>
    </article>
  )
}
