import { FileText, History, PenLine } from 'lucide-react'
import { documents } from '../data/mock'
import { Badge, Button, Card, PageHeader, statusTone } from '../components/ui'

export default function Documents() {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Document Management"
        subtitle="Contracts, leases, OTPs, inspections, invoices, certificates, IDs — with versioning and e-signatures."
        actions={
          <>
            <Button variant="secondary">
              <PenLine className="h-4 w-4" /> Request signature
            </Button>
            <Button>Upload document</Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-ink-100 bg-ink-50/80 text-xs uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-900/50">
              <tr>
                <th className="px-4 py-3 font-medium">Document</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {documents.map((d) => (
                <tr key={d.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-900/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-brand-600" />
                      <div>
                        <p className="font-medium">{d.name}</p>
                        <p className="text-xs text-ink-400">{d.size}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{d.type}</td>
                  <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{d.property}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 tabular text-xs">
                      <History className="h-3.5 w-3.5 text-ink-400" />
                      {d.version}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                  </td>
                  <td className="px-4 py-3 tabular text-ink-500">{d.updated}</td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost">
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
