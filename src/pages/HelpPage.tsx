/**
 * Lightweight workspace Help — no admin Guard.
 * Short guide + Show page tips (reuses resetPageTipsForUser).
 * CR7: Raise a ticket, My tickets, and the help desk for desk roles.
 */
import { CircleHelp, Lightbulb, LifeBuoy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { resetPageTipsForUser } from '../lib/pageTips'
import { Button, Card, PageHeader } from '../components/ui'
import { useSuiteAlert } from '../components/alerts/SuiteAlert'
import { HelpDesk } from '../components/help/HelpDesk'

const ICON_STROKE = 1.6

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
        subtitle="Quick guidance for Lekaya — tips, navigation, and support tickets."
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
            <h2 className="font-display text-lg font-semibold text-ink">Show page tips</h2>
          </div>
          <p className="text-sm leading-relaxed text-ink-500">
            Replay the in-app walkthrough tips for your account. Tips appear on key workspace
            pages after you reset them.
          </p>
          <Button
            type="button"
            className="min-h-11 cursor-pointer"
            onClick={showPageTips}
            data-testid="help-show-page-tips"
          >
            <CircleHelp className="h-4 w-4" strokeWidth={ICON_STROKE} aria-hidden />
            Show page tips
          </Button>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" strokeWidth={ICON_STROKE} aria-hidden />
            <h2 className="font-display text-lg font-semibold text-ink">Getting around</h2>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-500">
            <li>
              Use the sidebar (or mobile More menu) to open Properties, Applications, Leases,
              Messages, Trust, and portals for your role.
            </li>
            <li>
              Circle-help icons on forms open short field tips — look for them next to labels and
              section titles.
            </li>
            <li>
              Administration stays under the role menu for staff with admin permissions — Help is
              not Administration.
            </li>
          </ul>
          <p className="text-sm text-ink-500">
            Need your home screen?{' '}
            <Link
              to="/workspace"
              className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Back to workspace
            </Link>
            .
          </p>
        </Card>
      </div>

      <Card className="space-y-2 p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Quick guide</h2>
        <div className="grid gap-3 text-sm text-ink-500 sm:grid-cols-2">
          <p>
            <strong className="text-ink">Applications:</strong> track FICA pack, screening, and PCR
            soft gates from the application lifecycle. Gate status shows under each section when
            you have review permission.
          </p>
          <p>
            <strong className="text-ink">Trust:</strong> cashbook import/export and allocate are
            in-app book tools. Use field-help icons on Trust pages for current limits.
          </p>
          <p>
            <strong className="text-ink">Messages:</strong> owner↔tenant and agency threads stay
            inside Lekaya (not WhatsApp/SMS).
          </p>
          <p>
            <strong className="text-ink">Leases:</strong> renewals and scheduled escalation live on
            the Leases directory and tenant lease panels.
          </p>
        </div>
      </Card>
    </div>
  )
}
