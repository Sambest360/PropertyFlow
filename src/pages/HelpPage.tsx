/**
 * Lightweight workspace Help — no admin Guard.
 * Short guide + Show page tips (reuses resetPageTipsForUser).
 * CR7: Raise a ticket, My tickets, and the help desk for desk roles.
 */
import { ChevronDown, CircleHelp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { resetPageTipsForUser } from '../lib/pageTips'
import { Button, Card, PageHeader } from '../components/ui'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'
import { HelpDesk } from '../components/help/HelpDesk'

const ICON_STROKE = 1.6

/** Short answers, closed until opened, so the page stays calm. */
const GUIDES: Array<{ q: string; a: string }> = [
  {
    q: 'Find my way around',
    a: 'Use the sidebar (or the More menu on a phone) for Properties, Applications, Leases, Messages, Trust and your portals. Admin settings sit under your role menu if you have admin access.',
  },
  {
    q: 'Move an application on',
    a: "Open the application's Overview. Every stage has Approve and Decline: Approve moves it to the next stage, Decline needs a reason the applicant sees. Set the stages in Admin → Application Pipeline.",
  },
  {
    q: 'Get help on a form',
    a: 'Look for the small question-mark icon next to a field or section title for a short explanation.',
  },
  {
    q: 'Message a tenant, owner or the agency',
    a: 'Use Messages. Conversations stay inside Lekaya Rentals, not WhatsApp or SMS.',
  },
  {
    q: 'Renew a lease or set an escalation',
    a: 'Open the Leases directory or the lease on the tenant’s page.',
  },
  {
    q: 'Import, export or allocate trust money',
    a: 'Use the Trust cashbook. The question-mark icons on the Trust pages explain the current limits.',
  },
]

export default function HelpPage() {
  const { user } = useAuth()
  const alert = useSuiteAlert()

  const showPageTips = () => {
    if (!user?.id) return
    resetPageTipsForUser(user.id)
    void alert.success({
      title: 'Page tips enabled',
      text: 'Walkthrough tips will show again as you move through the workspace.',
      tone: 'success',
    })
  }

  return (
    <div className="animate-fade-in space-y-5" data-testid="workspace-help-page">
      <PageHeader
        title="Help & support"
        subtitle="Raise a ticket, follow up a complaint, or find a quick answer."
        actions={
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 cursor-pointer"
            onClick={showPageTips}
            data-testid="help-show-page-tips"
            title="Replay the walkthrough tips on each workspace page"
          >
            <CircleHelp className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Show page tips
          </Button>
        }
      />

      <HelpDesk />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Complaint about someone?</h2>
          <p className="text-sm text-ink-500">
            Complain about an agent, landlord, tenant or contractor, and follow it up. Warnings on your account show there too.
          </p>
        </div>
        <Link to="/workspace/conduct?tab=complain">
          <Button variant="secondary">Complaints & warnings</Button>
        </Link>
      </Card>

      <Card className="p-0">
        <h2 className="px-5 pb-1 pt-4 font-display text-lg font-semibold text-ink">How do I…?</h2>
        <ul className="divide-y divide-primary-50">
          {GUIDES.map((g) => (
            <li key={g.q}>
              <details className="group px-5 py-3">
                <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  {g.q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-ink-400 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-500">{g.a}</p>
              </details>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
