import { LEGAL_ENTITY } from '../../lib/legalEntity'
import { Entity, LegalPage, List, Section } from './LegalPage'

/** Terms of Service. Company details come from src/lib/legalEntity.ts. */
export default function TermsPage() {
  const brand = LEGAL_ENTITY.brand
  return (
    <LegalPage
      title="Terms of Service"
      description={`The terms for using the ${brand} marketplace and workspace.`}
      path="/terms"
    >
      <Section title="1. These terms">
        <p>
          These terms apply to everyone who uses {brand}: visitors, applicants, tenants, landlords, estate agencies
          and their staff, and contractors. By creating an account or using the platform you agree to them. Our{' '}
          Privacy Policy explains how we handle personal information.
        </p>
      </Section>

      <Section title="2. What we provide">
        <p>
          {brand} is a property marketplace and software for managing listings, viewings, applications, leases,
          payments, maintenance and trust records. We are a technology platform: unless we say otherwise in writing,
          we are not an estate agency, landlord or party to any lease or sale between users.
        </p>
      </Section>

      <Section title="3. Accounts">
        <List
          items={[
            'Give accurate details and keep them up to date.',
            'Keep your password private; you are responsible for activity on your account.',
            'Agencies are responsible for the staff accounts they create and the access they give them.',
            'Tell us at once if you suspect unauthorised use of your account.',
          ]}
        />
      </Section>

      <Section title="4. Listings and agencies">
        <List
          items={[
            'Agencies and landlords are responsible for their listings being accurate, lawful and properly mandated.',
            'Estate agencies remain responsible for complying with the Property Practitioners Act and its regulations, including trust account rules; the platform supports, but does not replace, their own records and obligations.',
            'We may remove listings or content that is misleading, unlawful or breaches these terms.',
          ]}
        />
      </Section>

      <Section title="5. Applications, screening and leases">
        <p>
          Decisions on applications are made by the agency or landlord, not by us. Background and credit checks run
          only with the applicant's explicit consent. Leases signed on the platform are agreements between the
          parties named in them; electronic signatures are used as provided for in the Electronic Communications and
          Transactions Act, 2002.
        </p>
      </Section>

      <Section title="6. Payments and fees">
        <p>
          Payments made through the platform are processed by PayFast under its terms. Fees for agencies and other
          paying users are as shown when they subscribe or as agreed in writing. Refunds of rent, deposits or other
          amounts between users are handled between those users and their agency.
        </p>
      </Section>

      <Section title="7. Acceptable use">
        <List
          items={[
            'No false, discriminatory, fraudulent or unlawful listings, applications or messages.',
            'No harassment, abuse or threats toward other users.',
            "No attempts to access other users' information, break security or overload the service.",
            'No copying or reselling the platform or its data without our written permission.',
          ]}
        />
        <p>We may suspend or close accounts that break these rules.</p>
      </Section>

      <Section title="8. Reviews and reports">
        <p>
          Reviews must be honest and based on your own experience. We review reports about reviews and conduct, and
          we may moderate or remove reviews or act under section 7.
        </p>
      </Section>

      <Section title="9. Availability and changes">
        <p>
          We work to keep the platform available and secure but cannot promise it will always be uninterrupted or
          error-free. We may change or improve features, and will give reasonable notice of changes that materially
          affect paying users.
        </p>
      </Section>

      <Section title="10. Liability">
        <p>
          To the extent the law allows, we are not liable for indirect or consequential loss, for the conduct of
          other users, or for decisions agencies, landlords and tenants make using the platform. Nothing in these
          terms limits rights you have under the Consumer Protection Act, 2008, or liability that cannot be limited
          by law.
        </p>
      </Section>

      <Section title="11. Ending your use">
        <p>
          You may close your account at any time. We may keep information we are required to keep by law, as set out
          in the Privacy Policy.
        </p>
      </Section>

      <Section title="12. Law and contact">
        <p>
          These terms are governed by the laws of the Republic of South Africa. Questions:{' '}
          <Entity field="supportEmail" />.
        </p>
      </Section>
    </LegalPage>
  )
}
