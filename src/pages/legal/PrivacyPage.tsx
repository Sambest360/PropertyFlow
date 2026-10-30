import { LEGAL_ENTITY } from '../../lib/legalEntity'
import { Entity, LegalPage, List, Section } from './LegalPage'

/** Privacy Policy (POPIA). Company details come from src/lib/legalEntity.ts. */
export default function PrivacyPage() {
  const brand = LEGAL_ENTITY.brand
  return (
    <LegalPage
      title="Privacy Policy"
      description={`How ${brand} collects, uses and protects personal information under POPIA.`}
      path="/privacy"
    >
      <Section title="1. Who we are">
        <p>
          {brand} ("we", "us") runs a property marketplace and the workspace estate agencies, landlords, tenants and
          contractors use to manage rentals and sales. This policy explains how we process personal information in
          line with the Protection of Personal Information Act, 2013 (POPIA).
        </p>
        <p>
          Information Officer: <Entity field="informationOfficer" />, <Entity field="privacyEmail" />.
        </p>
      </Section>

      <Section title="2. Who is responsible">
        <p>
          Each estate agency (or landlord) listed on {brand} is the responsible party for the personal information
          submitted to it through the platform: enquiries, rental applications and leases. {brand} is the operator
          that runs the platform for those agencies and processes that information on their behalf.
        </p>
        <p>
          {brand} is the responsible party for what it processes for its own purposes, as this policy and our Terms
          of Service describe: platform accounts and sign-in; our own billing; log records, device and browser details
          and other technical information; keeping the platform secure, preventing fraud and fixing problems;
          moderating listings, reviews and conduct reports; and the browser storage described in section 9.
        </p>
        <p>
          Our Information Officer is <Entity field="informationOfficer" />, reachable at{' '}
          <Entity field="privacyEmail" />. For information an agency holds about you (for example your enquiry,
          application or lease), contact the agency (or landlord) that manages the listing; the listing agent can put
          you in touch.
        </p>
      </Section>

      <Section title="3. What we collect">
        <List
          items={[
            'Account details: name, email address, phone number, password (stored only as a one-way hash) and your role.',
            'Identity and application details you submit: ID or passport number, employment and income, references, supporting documents, and the property you apply for.',
            'Background and credit check results, only with your separate, explicit consent for each check.',
            'Lease, payment, deposit and maintenance records linked to a tenancy, including photos you upload of a fault or inspection.',
            'Listing details and photos added by agencies and landlords.',
            'Messages, reviews and reports you send through the platform.',
            'Technical information: log records, device and browser details, and your location only when you choose "near me" search.',
          ]}
        />
      </Section>

      <Section title="4. Why we use it">
        <List
          items={[
            'To run your account and the service you asked for (contract).',
            'To let agencies and landlords assess rental and purchase applications, prepare leases and manage tenancies (contract, and the legitimate interests of the parties).',
            'To run background or credit checks you consented to (consent; you may withdraw it at any time).',
            'To keep trust account, payment and lease records that property and financial laws require (legal obligation).',
            'To send service messages such as viewing confirmations, lease and payment notices (contract).',
            'To keep the platform secure, prevent fraud and fix problems (legitimate interest).',
          ]}
        />
        <p>We do not sell personal information and we do not use it for third-party advertising.</p>
      </Section>

      <Section title="5. Who we share it with">
        <List
          items={[
            'The agency, landlord or contractor involved in your enquiry, application, tenancy or maintenance job, limited to what they need.',
            'Credit bureaus and screening providers, only for checks you consented to.',
            'PayFast, to process payments (we do not store full card details).',
            'Our email provider, to deliver messages, and Google Maps, to show maps and look up addresses.',
            'Our hosting provider in South Africa, which stores the platform and its database.',
            'Authorities, when the law requires it.',
          ]}
        />
        <p>
          Some of these providers (email and maps) may process information outside South Africa. We use them only
          where the law allows it, for example under binding agreements that give protection comparable to POPIA.
        </p>
      </Section>

      <Section title="6. How long we keep it">
        <p>
          We keep information only as long as needed for the purpose it was collected for, or as long as the law
          requires (for example, trust account and financial records must be kept for a minimum period). Detailed
          background check results are deleted automatically once their retention period ends; a summary of the
          outcome may remain on the application. When information is no longer needed we delete it or make it
          anonymous.
        </p>
      </Section>

      <Section title="7. How we protect it">
        <p>
          Access is limited by role so each user sees only what they need; connections are encrypted (HTTPS);
          passwords are hashed; and the database is backed up daily. If a security compromise affects your
          information, we will notify you and the Information Regulator as POPIA requires.
        </p>
      </Section>

      <Section title="8. Your rights">
        <List
          items={[
            'Ask whether we hold information about you and get a copy of it.',
            'Ask us to correct, update or delete it.',
            'Object to processing based on legitimate interest, and withdraw consent you gave (for example for credit checks).',
            'Not be subject to direct marketing without your consent.',
            'Complain to the Information Regulator (https://inforegulator.org.za) if you are not satisfied with how we handled a request.',
          ]}
        />
        <p>
          To use these rights, email <Entity field="privacyEmail" />. For information an agency or landlord controls,
          we will pass your request to them and help them answer it.
        </p>
      </Section>

      <Section title="9. Cookies and local storage">
        <p>
          We use your browser's storage to keep you signed in, remember preferences and make pages load faster. We do
          not use advertising or cross-site tracking cookies.
        </p>
      </Section>

      <Section title="10. Children">
        <p>The platform is for adults. We do not knowingly collect information about children.</p>
      </Section>

      <Section title="11. Changes">
        <p>
          We may update this policy. The effective date at the top shows the current version; we will tell account
          holders about material changes.
        </p>
      </Section>
    </LegalPage>
  )
}
