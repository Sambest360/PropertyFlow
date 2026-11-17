import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { usePageMeta } from '../../hooks/usePageMeta'
import {
  EXAMPLE_PORTFOLIOS,
  MAINTENANCE_INCLUDES,
  MAINTENANCE_TIERS,
  MAX_QUOTED_PROPERTIES,
  ONBOARDING_FEES,
  PER_PROPERTY_BANDS,
  PER_PROPERTY_INCLUDES,
  quote,
  rand,
} from '../../lib/publicPricing'

const wrap = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'
const h2 = 'font-display text-2xl font-semibold text-ink sm:text-3xl'
const th = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-500'
const td = 'px-4 py-3 text-sm text-ink-700'
const num = `${td} whitespace-nowrap text-right tabular-nums`

const FAQ: Array<[string, string]> = [
  [
    'What counts as a property?',
    'One property is one full property: a house, flat, townhouse or commercial unit. The number of rooms inside does not matter; a house let room by room is still 1 property. In a block of separately let flats, each flat is 1 property. Vacant and occupied properties both count; archived properties (sold, mandate ended) do not.',
  ],
  ['Do you take a percentage of rent?', 'No. Lekaya never holds or moves money and never takes a share of what you earn.'],
  [
    'What happens when we grow into the next tier?',
    'Monthly payers move up a maintenance tier only after 2 months in a row above the tier limit, and get a notice at 90% of the limit. Annual payers lock their tier for 12 months.',
  ],
  ['Do tenants and contractors pay?', 'No, never.'],
  ['Is VAT included?', 'No, all prices exclude VAT.'],
]

export default function PricingPage() {
  usePageMeta({
    title: 'Pricing: pay per property, no share of your rent',
    description:
      'Lekaya Rentals pricing for agencies and landlords: R25 per property per month plus a fixed maintenance fee for your size, excl. VAT. No share of rent, no per-user fees.',
    path: '/pricing',
  })
  const [raw, setRaw] = useState('30')
  const n = Number(raw)
  const valid = raw.trim() !== '' && Number.isInteger(n) && n >= 1
  const q = valid ? quote(n) : null

  return (
    <div className="bg-white">
      <header className="border-b border-primary-100 bg-primary-50/60">
        <div className={`${wrap} py-12 sm:py-16`}>
          <h1 className="max-w-3xl font-display text-3xl font-semibold leading-tight text-ink sm:text-5xl">
            Pay per property. No share of your rent, ever.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-600 sm:text-lg">
            One fee per property, plus one fixed maintenance fee for your size. Tenants and contractors use Lekaya free.
          </p>
          <p className="mt-3 text-sm text-ink-500">All prices in rand per month, excl. VAT. No share of your rent. No per-user fees.</p>
        </div>
      </header>

      <section className="py-12 sm:py-16" aria-labelledby="calc-h">
        <div className={`${wrap} grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-14`}>
          <div>
            <h2 id="calc-h" className={h2}>
              Work out your price
            </h2>
            <label htmlFor="calc-n" className="mt-5 block text-sm font-semibold text-ink">
              Number of properties
            </label>
            <input
              id="calc-n"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              aria-describedby="calc-hint"
              className="mt-2 min-h-12 w-full max-w-xs rounded-xl border border-primary-200 px-4 text-lg tabular-nums text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p id="calc-hint" className="mt-2 text-sm text-ink-500">
              A whole number from 1 to {rand(MAX_QUOTED_PROPERTIES).slice(1)}. Archived properties don’t count.
            </p>
          </div>
          <div className="rounded-3xl border border-primary-100 bg-primary-50/60 p-5 sm:p-7" aria-live="polite">
            {valid && n > MAX_QUOTED_PROPERTIES ? (
              <div>
                <p className="font-display text-2xl font-semibold text-ink">Contact us for a quote</p>
                <p className="mt-2 text-sm text-ink-600">Portfolios above 2 000 properties are priced on the Enterprise+ tier.</p>
                <Link
                  to="/contact"
                  className="mt-5 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  Contact us
                </Link>
              </div>
            ) : q ? (
              <>
                <p className="text-sm font-medium text-ink-500">Monthly total, excl. VAT</p>
                <p className="mt-1 font-display text-4xl font-semibold tabular-nums text-ink">{rand(q.monthlyTotal)}</p>
                <p className="mt-1 text-sm text-ink-600">
                  {rand(q.effectivePerProperty, true)} per property per month, effective
                </p>
                <dl className="mt-6 grid gap-x-8 gap-y-3 border-t border-primary-100 pt-5 text-sm sm:grid-cols-2">
                  {(
                    [
                      ['Per-property fee', rand(q.perProperty)],
                      ['Maintenance fee', rand(q.maintenance)],
                      ['Once-off onboarding', rand(q.onboarding)],
                      ['Annual (pay 10 months, get 12)', `${rand(q.annual)} a year`],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4">
                      <dt className="text-ink-600">{k}</dt>
                      <dd className="whitespace-nowrap font-semibold tabular-nums text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="text-sm text-ink-600">Type a whole number of properties from 1 to 2 000.</p>
            )}
          </div>
        </div>
      </section>

      <section className="border-t border-primary-100 bg-primary-50/60 py-12 sm:py-16">
        <div className={wrap}>
          <h2 className={h2}>What agencies pay</h2>
          <p className="mt-2 text-sm text-ink-500">Per month, excl. VAT.</p>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-primary-100 bg-white">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-primary-100">
                <tr>
                  <th scope="col" className={th}>Properties</th>
                  <th scope="col" className={`${th} text-right`}>Per property</th>
                  <th scope="col" className={`${th} text-right`}>Maintenance</th>
                  <th scope="col" className={`${th} text-right`}>Monthly total</th>
                  <th scope="col" className={`${th} text-right`}>Effective per property</th>
                  <th scope="col" className={`${th} text-right`}>Onboarding (once-off)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-50">
                {EXAMPLE_PORTFOLIOS.map((p) => {
                  const r = quote(p)!
                  return (
                    <tr key={p}>
                      <th scope="row" className={`${td} text-left font-semibold tabular-nums text-ink`}>
                        {rand(p).slice(1)}
                      </th>
                      <td className={num}>{rand(r.perProperty)}</td>
                      <td className={num}>{rand(r.maintenance)}</td>
                      <td className={`${num} font-semibold text-ink`}>{rand(r.monthlyTotal)}</td>
                      <td className={num}>{rand(r.effectivePerProperty, true)}</td>
                      <td className={num}>{rand(r.onboarding)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className={`${wrap} grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14`}>
          <div>
            <h2 className={h2}>1. Per property, graduated</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              Each band is charged at its own rate, like tax brackets, so the bill never jumps when you add one property.
            </p>
            <PriceTable head={['Properties', 'Per property per month']} rows={PER_PROPERTY_BANDS.map((b) => [b.label, rand(b.rate)])} />
            <Included items={PER_PROPERTY_INCLUDES} />
          </div>
          <div>
            <h2 className={h2}>2. Maintenance, fixed by size</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              One fixed monthly fee for your tier. Monthly payers move up only after 2 months in a row above the limit, with a notice at 90%.
              Annual payers lock their tier for 12 months.
            </p>
            <PriceTable
              head={['Tier', 'Properties', 'Maintenance per month']}
              rows={[
                ...MAINTENANCE_TIERS.map((t) => [t.name, t.range, rand(t.fee)]),
                ['Enterprise+', '2 001+', 'Contact us for a quote'],
              ]}
            />
            <Included items={MAINTENANCE_INCLUDES} />
          </div>
        </div>
      </section>

      <section className="border-t border-primary-100 bg-primary-50/60 py-12 sm:py-16">
        <div className={`${wrap} grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14`}>
          <div>
            <h2 className={h2}>Once-off onboarding</h2>
            <p className="mt-2 text-sm text-ink-500">Setup, data import and training.</p>
            <PriceTable head={['Portfolio', 'Onboarding']} rows={ONBOARDING_FEES.map((o) => [o.range, rand(o.fee)])} />
          </div>
          <div>
            <h2 className={h2}>Also good to know</h2>
            <Included
              items={[
                'Annual payment: pay 10 months, get 12.',
                'Tenants and contractors always use Lekaya free.',
                'No share of your rent. No per-user fees.',
                'All prices exclude VAT.',
              ]}
            />
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className={`${wrap} max-w-3xl`}>
          <h2 className={h2}>Questions</h2>
          <div className="mt-4 divide-y divide-primary-100 border-y border-primary-100">
            {FAQ.map(([qn, a]) => (
              <details key={qn} className="group py-4">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-4 font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  {qn}
                  <span className="text-primary transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{a}</p>
              </details>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/contact"
              className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-white hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Book a walkthrough
            </Link>
            <Link
              to="/register?role=landlord"
              className="inline-flex min-h-11 items-center rounded-full border border-primary-200 px-5 text-sm font-semibold text-primary hover:border-primary hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              List your property
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function PriceTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-2xl border border-primary-100 bg-white">
      <table className="w-full">
        <thead className="border-b border-primary-100">
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={`${th} ${i === head.length - 1 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-primary-50">
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => (
                <td
                  key={i}
                  className={
                    i === r.length - 1
                      ? `${c.startsWith('R') ? num : `${td} text-right`} font-semibold text-ink`
                      : i === 0
                        ? `${td} font-medium text-ink`
                        : `${td} whitespace-nowrap`
                  }
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Included({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-2">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 text-sm text-ink-700">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  )
}
