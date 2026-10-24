import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DataTableSkeleton, PageSkeleton, skeletonVariantForPath } from './PageSkeleton'

describe('skeletonVariantForPath', () => {
  it.each([
    ['/', 'cards'],
    ['/browse', 'cards'],
    ['/listing/PR-C21-CT02', 'listing'],
    ['/login', 'form'],
    ['/workspace', 'dashboard'],
    ['/workspace/portals/tenant/payments', 'dashboard'],
    ['/workspace/sales/crm', 'list'],
    ['/workspace/sales/applications', 'list'],
    ['/workspace/properties', 'list'],
    ['/workspace/properties/', 'list'],
    ['/workspace/properties/new', 'form'],
    ['/workspace/operations/maintenance/abc/edit', 'form'],
    ['/workspace/properties/PR-C21-CT02', 'detail'],
    ['/workspace/sales/crm/lead-1', 'detail'],
    ['/workspace/admin/users', 'list'],
    ['/workspace/admin/config', 'form'],
  ])('%s → %s', (path, variant) => {
    expect(skeletonVariantForPath(path)).toBe(variant)
  })
})

describe('PageSkeleton', () => {
  it('renders a labelled, busy placeholder of the requested shape', () => {
    const html = renderToStaticMarkup(<PageSkeleton variant="list" label="Loading leads…" />)
    expect(html).toContain('data-testid="page-skeleton"')
    expect(html).toContain('data-variant="list"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading leads…')
  })
})

describe('DataTableSkeleton', () => {
  it('renders only ghost table rows, announced as loading', () => {
    const html = renderToStaticMarkup(<DataTableSkeleton rows={3} label="Loading leads…" />)
    expect(html).toContain('data-testid="data-table-skeleton"')
    expect(html).toContain('role="status"')
    expect(html).toContain('Loading leads…')
    expect(html).not.toContain('data-testid="page-skeleton"')
  })
})
