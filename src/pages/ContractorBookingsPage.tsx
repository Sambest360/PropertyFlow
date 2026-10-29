/** Contractor: booking requests from agencies (accept / decline / mark done). */
import { PageHeader } from '../components/ui'
import { BookingsPanel } from '../components/contractors/BookingsPanel'

export default function ContractorBookingsPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Bookings" subtitle="Agencies book you for a date. Accept or decline, and mark the visit done afterwards." />
      <BookingsPanel mode="contractor" />
    </div>
  )
}
