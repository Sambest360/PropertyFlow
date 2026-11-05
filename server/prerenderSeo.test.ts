import { describe, expect, it } from 'vitest'
import { pageHtml } from './prerenderSeo'
import { seoCity, seoLandingMeta } from '../src/lib/seoPages'

const template = `<html><head><meta name="description" content="x" /><link rel="canonical" href="https://lekayarentals.site/" /><title>Old</title></head><body><div id="root">\n      <div id="pf-boot" style="x">\n        Loading Lekaya Rentals…\n      </div>\n    </div></body></html>`

describe('prerenderSeo', () => {
  it('fills title, description, canonical and a heading', () => {
    const html = pageHtml(template, seoLandingMeta('rent', seoCity('gqeberha')!))
    expect(html).toContain('<title>Property to rent in Gqeberha: houses, flats and apartments | Lekaya Rentals</title>')
    expect(html).toContain('href="https://lekayarentals.site/to-rent/gqeberha"')
    expect(html).toContain('<h1>Property to rent in Gqeberha</h1>')
    expect(html).toMatch(/name="description" content="Houses, flats/)
    expect(html).not.toContain('Loading Lekaya Rentals')
    expect(html).toMatch(/<div id="root"><main[\s\S]*<\/main>\s*<\/div>/)
  })
})
