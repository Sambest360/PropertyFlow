import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PropertyFeaturePicker } from './PropertyFeaturePicker'

describe('PropertyFeaturePicker agency features', () => {
  it("lists the agency's extra features as chips, not as saved custom tags", () => {
    const html = renderToStaticMarkup(
      <PropertyFeaturePicker
        value={['Borehole', 'Old tag']}
        onChange={() => {}}
        listingMode="rent"
        agencyFeatures={['Borehole', 'Wine cellar']}
      />,
    )
    expect(html).toContain("Your agency&#x27;s features")
    expect(html).toContain('Wine cellar')
    const custom = html.slice(html.indexOf('Saved custom tags'))
    expect(custom).toContain('Old tag')
    expect(custom).not.toContain('Borehole')
  })
})
