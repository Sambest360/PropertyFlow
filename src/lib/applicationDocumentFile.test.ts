import { describe, expect, it, vi, afterEach } from 'vitest'
import { downloadApplicationDocumentFile, openApplicationDocumentFile } from './applicationDocumentFile'

const pdfDataUrl = 'data:application/pdf;base64,JVBERi0xLjQK'
const jpegDataUrl =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQADAP/Z'

describe('applicationDocumentFile', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens a PDF via object URL', () => {
    const open = vi.fn(() => ({ closed: false }))
    vi.stubGlobal('window', {
      open,
      setTimeout: (fn: () => void) => {
        fn()
        return 0
      },
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
    expect(openApplicationDocumentFile({ name: 'bank.pdf', mimeType: 'application/pdf', dataUrl: pdfDataUrl })).toBe(
      true,
    )
    expect(open).toHaveBeenCalledWith('blob:mock', '_blank', 'noopener')
  })

  it('downloads a JPEG via object URL', () => {
    const click = vi.fn()
    const anchor = { href: '', download: '', rel: '', click } as HTMLAnchorElement
    vi.stubGlobal('document', {
      createElement: () => anchor,
    })
    vi.stubGlobal('window', {
      setTimeout: (fn: () => void) => {
        fn()
        return 0
      },
    })
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
    expect(
      downloadApplicationDocumentFile({ name: 'id.jpg', mimeType: 'image/jpeg', dataUrl: jpegDataUrl }),
    ).toBe(true)
    expect(anchor.download).toBe('id.jpg')
    expect(click).toHaveBeenCalled()
  })

  it('returns false for invalid data URLs', () => {
    vi.stubGlobal('window', { open: vi.fn(), setTimeout: () => 0 })
    expect(openApplicationDocumentFile({ name: 'x.pdf', dataUrl: 'not-a-data-url' })).toBe(false)
  })
})
