import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  Calculator,
  CircleDollarSign,
  Home,
  PiggyBank,
  ScrollText,
} from 'lucide-react'
import { Input, cn } from '../../components/ui'
import { formatZAR } from '../../data/seed'
import {
  amortize,
  bondAndTransferCosts,
  maxLoanFromPayment,
  monthlyPayment,
  parseMoney,
} from '../../lib/bondCalculators'

export const calculatorTools = [
  {
    id: 'mortgage-bond',
    title: 'Mortgage Bond Calculator',
    blurb: 'Estimate your monthly bond repayment.',
    icon: Home,
  },
  {
    id: 'affordability',
    title: 'Affordability Calculator',
    blurb: 'See how much home you can afford.',
    icon: CircleDollarSign,
  },
  {
    id: 'additional-payment',
    title: 'Additional Payment Calculator',
    blurb: 'Find out how extra payments shorten your bond.',
    icon: PiggyBank,
  },
  {
    id: 'bond-transfer',
    title: 'Bond and Transfer Calculator',
    blurb: 'Estimate transfer duty and conveyancing costs.',
    icon: ScrollText,
  },
] as const

export type CalculatorId = (typeof calculatorTools)[number]['id']

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-ink-500">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  )
}

function ResultCard({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string
  value: string
  hint?: string
  emphasize?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border px-4 py-3',
        emphasize ? 'border-primary bg-primary text-white' : 'border-primary-100 bg-primary-50',
      )}
    >
      <p className={cn('text-xs font-medium', emphasize ? 'text-white/80' : 'text-ink-500')}>{label}</p>
      <p className={cn('mt-1 text-xl font-bold tabular', emphasize ? 'text-white' : 'text-ink')}>{value}</p>
      {hint && (
        <p className={cn('mt-1 text-xs', emphasize ? 'text-white/75' : 'text-ink-500')}>{hint}</p>
      )}
    </div>
  )
}

function MoneyInput(props: React.ComponentProps<typeof Input>) {
  return <Input inputMode="decimal" className="min-h-11 tabular" {...props} />
}

function MortgageBondCalculator() {
  const [price, setPrice] = useState('2450000')
  const [deposit, setDeposit] = useState('245000')
  const [rate, setRate] = useState('11.75')
  const [years, setYears] = useState('20')

  const result = useMemo(() => {
    const p = parseMoney(price)
    const d = parseMoney(deposit)
    const loan = Math.max(0, p - d)
    const r = parseMoney(rate)
    const y = parseMoney(years)
    const monthly = monthlyPayment(loan, r, y)
    const total = monthly * y * 12
    return { loan, monthly, total, interest: Math.max(0, total - loan) }
  }, [price, deposit, rate, years])

  return (
    <CalculatorShell
      title="Mortgage Bond Calculator"
      description="Work out a typical monthly repayment for a South African home loan."
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4 rounded-3xl border border-primary-100 bg-white p-5 sm:p-6">
          <Field label="Purchase price" hint="ZAR">
            <MoneyInput value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Deposit" hint="Cash deposit reducing the loan amount">
            <MoneyInput value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </Field>
          <Field label="Interest rate" hint="% per year">
            <MoneyInput value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          <Field label="Loan term" hint="Years">
            <MoneyInput value={years} onChange={(e) => setYears(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-3">
          <ResultCard label="Loan amount" value={formatZAR(result.loan)} />
          <ResultCard label="Estimated monthly repayment" value={formatZAR(result.monthly)} emphasize />
          <ResultCard label="Total repayable" value={formatZAR(result.total)} hint={`Interest ~ ${formatZAR(result.interest)}`} />
          <p className="text-xs leading-relaxed text-ink-500">
            Estimate only — not a quote. Banks may include fees, insurance, and different rate structures.
          </p>
        </div>
      </div>
    </CalculatorShell>
  )
}

function AffordabilityCalculator() {
  const [income, setIncome] = useState('65000')
  const [expenses, setExpenses] = useState('22000')
  const [rate, setRate] = useState('11.75')
  const [years, setYears] = useState('20')
  const [deposit, setDeposit] = useState('200000')

  const result = useMemo(() => {
    const net = Math.max(0, parseMoney(income) - parseMoney(expenses))
    // Conservative: up to 30% of leftover income toward the bond
    const maxMonthly = net * 0.3
    const loan = maxLoanFromPayment(maxMonthly, parseMoney(rate), parseMoney(years))
    const depositAmt = parseMoney(deposit)
    return {
      net,
      maxMonthly,
      loan,
      purchase: loan + depositAmt,
    }
  }, [income, expenses, rate, years, deposit])

  return (
    <CalculatorShell
      title="Affordability Calculator"
      description="Estimate a comfortable purchase price from your monthly income and expenses."
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4 rounded-3xl border border-primary-100 bg-white p-5 sm:p-6">
          <Field label="Gross monthly income" hint="Salary and other income before tax">
            <MoneyInput value={income} onChange={(e) => setIncome(e.target.value)} />
          </Field>
          <Field label="Monthly expenses" hint="Debt repayments, living costs, commitments">
            <MoneyInput value={expenses} onChange={(e) => setExpenses(e.target.value)} />
          </Field>
          <Field label="Interest rate" hint="% per year">
            <MoneyInput value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          <Field label="Loan term" hint="Years">
            <MoneyInput value={years} onChange={(e) => setYears(e.target.value)} />
          </Field>
          <Field label="Available deposit" hint="Cash toward the purchase">
            <MoneyInput value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-3">
          <ResultCard label="Budget left after expenses" value={formatZAR(result.net)} />
          <ResultCard label="Suggested max monthly bond" value={formatZAR(result.maxMonthly)} />
          <ResultCard label="Estimated max loan" value={formatZAR(result.loan)} />
          <ResultCard label="Estimated purchase price" value={formatZAR(result.purchase)} emphasize />
          <p className="text-xs leading-relaxed text-ink-500">
            Estimate only — not a quote. Uses ~30% of leftover income as a guide. Lenders apply their own credit criteria.
          </p>
        </div>
      </div>
    </CalculatorShell>
  )
}

function AdditionalPaymentCalculator() {
  const [loan, setLoan] = useState('2200000')
  const [rate, setRate] = useState('11.75')
  const [years, setYears] = useState('20')
  const [extra, setExtra] = useState('2000')

  const result = useMemo(() => {
    const p = parseMoney(loan)
    const r = parseMoney(rate)
    const y = parseMoney(years)
    const x = parseMoney(extra)
    const base = amortize(p, r, y, 0)
    const withExtra = amortize(p, r, y, x)
    const monthsSaved = Math.max(0, base.months - withExtra.months)
    const interestSaved = Math.max(0, base.totalInterest - withExtra.totalInterest)
    return {
      basePayment: monthlyPayment(p, r, y),
      monthsSaved,
      interestSaved,
      newMonths: withExtra.months,
      baseMonths: base.months,
    }
  }, [loan, rate, years, extra])

  return (
    <CalculatorShell
      title="Additional Payment Calculator"
      description="See how paying a little extra each month can cut interest and shorten your term."
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4 rounded-3xl border border-primary-100 bg-white p-5 sm:p-6">
          <Field label="Loan amount" hint="Outstanding or new bond">
            <MoneyInput value={loan} onChange={(e) => setLoan(e.target.value)} />
          </Field>
          <Field label="Interest rate" hint="% per year">
            <MoneyInput value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          <Field label="Original term" hint="Years">
            <MoneyInput value={years} onChange={(e) => setYears(e.target.value)} />
          </Field>
          <Field label="Extra monthly payment" hint="Paid in addition to the instalment">
            <MoneyInput value={extra} onChange={(e) => setExtra(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-3">
          <ResultCard label="Standard monthly instalment" value={formatZAR(result.basePayment)} />
          <ResultCard
            label="Time saved"
            value={`${Math.floor(result.monthsSaved / 12)}y ${result.monthsSaved % 12}m`}
            hint={`${result.baseMonths} → ${result.newMonths} months`}
          />
          <ResultCard label="Interest saved" value={formatZAR(result.interestSaved)} emphasize />
          <p className="text-xs leading-relaxed text-ink-500">
            Estimate only — not a quote. Assumes extra payments go straight to capital. Confirm with your bank that early payments are allowed without penalties.
          </p>
        </div>
      </div>
    </CalculatorShell>
  )
}

function BondTransferCalculator() {
  const [price, setPrice] = useState('2450000')
  const [bond, setBond] = useState('2205000')

  const costs = useMemo(() => {
    const p = parseMoney(price)
    const b = Math.min(parseMoney(bond), p)
    return bondAndTransferCosts(p, b)
  }, [price, bond])

  return (
    <CalculatorShell
      title="Bond and Transfer Calculator"
      description="Estimate transfer duty, attorney fees, and deeds office costs when buying with a bond."
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4 rounded-3xl border border-primary-100 bg-white p-5 sm:p-6">
          <Field label="Purchase price" hint="ZAR">
            <MoneyInput value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Bond amount" hint="Usually purchase price minus deposit">
            <MoneyInput value={bond} onChange={(e) => setBond(e.target.value)} />
          </Field>
          <div className="rounded-2xl bg-primary-50 p-4 text-sm text-ink-600">
            Includes illustrative SARS transfer duty brackets, VAT on attorney fees, and guideline conveyancing scales.
          </div>
        </div>
        <div className="space-y-3">
          <ResultCard label="Transfer duty" value={formatZAR(costs.transferDuty)} />
          <ResultCard
            label="Transfer attorney + VAT"
            value={formatZAR(costs.transferAttorney + costs.transferVat)}
          />
          <ResultCard
            label="Bond attorney + VAT"
            value={formatZAR(costs.bondAttorney + costs.bondVat)}
          />
          <ResultCard
            label="Deeds office fees"
            value={formatZAR(costs.deedsOfficeTransfer + costs.deedsOfficeBond)}
          />
          <ResultCard label="Estimated total costs" value={formatZAR(costs.total)} emphasize />
          <p className="text-xs leading-relaxed text-ink-500">
            Not a quote — attorneys and banks set final fees. Transfer duty rules can change.
          </p>
        </div>
      </div>
    </CalculatorShell>
  )
}

function CalculatorShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-500 sm:text-base">{description}</p>
      <div className="mt-8">{children}</div>
    </div>
  )
}

export function CalculatorsIndex() {
  return (
    <div>
      <div className="max-w-2xl">
        <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
          <Calculator className="h-4 w-4" aria-hidden />
          Financial tools
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">Home loan calculators</h1>
        <p className="mt-3 text-base leading-relaxed text-ink-500">
          Plan your purchase with quick estimates for repayments, affordability, extra payments, and transfer costs.
          Estimates only — not a quote. Banks and attorneys set final figures.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2" data-tip-target="calc-tools">
        {calculatorTools.map((tool) => (
          <Link
            key={tool.id}
            to={`/calculators/${tool.id}`}
            className="group flex min-h-[140px] cursor-pointer flex-col justify-between rounded-3xl border border-primary-100 bg-white p-5 transition-colors duration-200 hover:border-primary-200 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary transition-colors duration-200 group-hover:bg-white">
                <tool.icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-ink">{tool.title}</h2>
              <p className="mt-1 text-sm text-ink-500">{tool.blurb}</p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              Open calculator
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function renderCalculator(toolId: string | undefined) {
  if (!toolId) return <CalculatorsIndex />
  const tool = calculatorTools.find((t) => t.id === toolId)
  if (!tool) return <Navigate to="/calculators" replace />

  switch (tool.id) {
    case 'mortgage-bond':
      return <MortgageBondCalculator />
    case 'affordability':
      return <AffordabilityCalculator />
    case 'additional-payment':
      return <AdditionalPaymentCalculator />
    case 'bond-transfer':
      return <BondTransferCalculator />
    default:
      return <Navigate to="/calculators" replace />
  }
}

function toolIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/calculators\/([^/]+)\/?$/)
  return match?.[1]
}

export default function CalculatorsPage() {
  const location = useLocation()
  const toolId = toolIdFromPath(location.pathname)

  return (
    <div className="min-h-[70vh] bg-primary-50/50">
      <div className="border-b border-primary-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <nav className="flex flex-wrap gap-2 text-sm" aria-label="Financial">
            <Link
              to="/calculators"
              className="min-h-11 cursor-pointer rounded-full bg-primary px-3.5 py-2 font-semibold text-white transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Calculators
            </Link>
            <span className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-400">Financial tools</span>
          </nav>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[240px_1fr] lg:px-8 lg:py-10">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Home loan calculators</p>
          <ul className="mt-3 space-y-1">
            <li>
              <Link
                to="/calculators"
                className={cn(
                  'block min-h-11 cursor-pointer rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  !toolId
                    ? 'bg-white text-primary shadow-sm ring-1 ring-primary-100'
                    : 'text-ink-600 hover:bg-white',
                )}
              >
                All calculators
              </Link>
            </li>
            {calculatorTools.map((tool) => {
              const active = toolId === tool.id
              return (
                <li key={tool.id}>
                  <Link
                    to={`/calculators/${tool.id}`}
                    className={cn(
                      'block min-h-11 cursor-pointer rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      active
                        ? 'bg-white text-primary shadow-sm ring-1 ring-primary-100'
                        : 'text-ink-600 hover:bg-white',
                    )}
                  >
                    {tool.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </aside>

        <div className="min-w-0 rounded-[1.75rem] border border-primary-100 bg-white p-5 shadow-sm sm:p-8">
          {renderCalculator(toolId)}
        </div>
      </div>
    </div>
  )
}
