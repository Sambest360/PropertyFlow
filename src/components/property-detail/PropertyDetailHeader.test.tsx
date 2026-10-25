import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { PropertyAsset } from '../../types/domain'
import { PropertyDetailHeader } from './PropertyDetailHeader'

const property = {
  id: 'PR-1',
  title: 'Sea view flat',
  status: 'Published',
  featured: true,
  suburb: 'Summerstrand',
  city: 'Gqeberha',
} as unknown as PropertyAsset

const render = (canFeature: boolean) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <PropertyDetailHeader property={property} canManage canFeature={canFeature} onToggleFeatured={() => {}} />
    </MemoryRouter>,
  )

describe('featuring a listing (paid, super admin only)', () => {
  it('shows Feature / Unfeature only to a super admin', () => {
    expect(render(true)).toContain('Unfeature')
    expect(render(false)).not.toContain('Unfeature')
  })

  it('still shows everyone that the listing is featured', () => {
    expect(render(false)).toContain('>Featured<')
  })
})
