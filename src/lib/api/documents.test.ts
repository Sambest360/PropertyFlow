import { describe, expect, it } from 'vitest'
import {
  documentCategoryVisibleToRole,
  filterDocumentsForRole,
  isSafeDocumentHref,
  resolveDocumentUrl,
  visibleDocumentCategoriesForRole,
} from './documents'

describe('document category visibility', () => {
  it('landlords see Title, Compliance, and Lease only', () => {
    const allowed = visibleDocumentCategoriesForRole('landlord')
    expect(allowed).not.toBe('all')
    if (allowed === 'all') return
    expect([...allowed].sort()).toEqual(['Compliance', 'Lease', 'Title'])
    expect(documentCategoryVisibleToRole('Marketing', 'landlord')).toBe(false)
    expect(documentCategoryVisibleToRole('Lease', 'landlord')).toBe(true)
  })

  it('tenants see Lease and Compliance', () => {
    expect(documentCategoryVisibleToRole('Lease', 'tenant')).toBe(true)
    expect(documentCategoryVisibleToRole('Title', 'tenant')).toBe(false)
    expect(documentCategoryVisibleToRole('Inspection', 'tenant')).toBe(false)
  })

  it('staff see all categories', () => {
    expect(visibleDocumentCategoriesForRole('ground_agent')).toBe('all')
    const rows = filterDocumentsForRole(
      [
        { category: 'Marketing' as const },
        { category: 'Lease' as const },
      ],
      'agent_admin',
    )
    expect(rows).toHaveLength(2)
  })
})

describe('resolveDocumentUrl', () => {
  it('prefers a safe explicit fileUrl', () => {
    expect(
      resolveDocumentUrl({
        name: 'Lease.pdf',
        category: 'Lease',
        fileUrl: 'https://files.example.com/lease.pdf',
      }),
    ).toBe('https://files.example.com/lease.pdf')
  })

  it('rejects unsafe schemes', () => {
    expect(
      resolveDocumentUrl({
        name: 'x',
        category: 'Lease',
        fileUrl: 'javascript:alert(1)',
      }),
    ).toBeNull()
    expect(isSafeDocumentHref('javascript:alert(1)')).toBe(false)
    expect(isSafeDocumentHref('/media/docs/lease.pdf')).toBe(true)
  })

  it('does not invent a URL for required rows without fileUrl', () => {
    expect(
      resolveDocumentUrl({
        name: 'Sale agreement draft',
        category: 'Other',
        status: 'required',
      }),
    ).toBeNull()
  })

  it('allows demo fallback for uploaded rows without fileUrl in DEV', () => {
    const href = resolveDocumentUrl({
      name: 'Signed lease',
      category: 'Lease',
      status: 'verified',
    })
    expect(href).toBeTruthy()
    expect(href).toContain('pdf.pdf')
  })
})
