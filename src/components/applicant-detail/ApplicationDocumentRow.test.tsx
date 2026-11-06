// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ApplicationDocument } from '../../types/domain'
import { ApplicationDocumentRow } from './ApplicationDocumentRow'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const doc = (status: ApplicationDocument['status']): ApplicationDocument => ({ key: 'id', label: 'ID copy', status })

describe('ApplicationDocumentRow upload', () => {
  it('offers Upload file for a missing document, with no separate save step', () => {
    const html = renderToStaticMarkup(
      <ApplicationDocumentRow doc={doc('required')} canUpload canReview={false} onUpload={async () => true} onSetStatus={() => {}} />,
    )
    expect(html).toContain('Upload file')
    expect(html).not.toContain('Save document')
  })

  it('offers a new upload for a rejected document', () => {
    const html = renderToStaticMarkup(
      <ApplicationDocumentRow doc={doc('rejected')} canUpload canReview={false} onUpload={async () => true} onSetStatus={() => {}} />,
    )
    expect(html).toContain('Upload a new file')
  })
})

describe('ApplicationDocumentRow upload loader', () => {
  let host: HTMLElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const choose = async () => {
    const input = host.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['%PDF-1.4 test'], 'id.pdf', { type: 'application/pdf' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    // Let the file read finish.
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
  }

  it('shows the loader while the file uploads, then clears it', async () => {
    let finish: (ok: boolean) => void = () => {}
    const sent: string[] = []
    act(() => {
      root.render(
        <ApplicationDocumentRow
          doc={doc('required')}
          canUpload
          canReview={false}
          onUpload={(f) => {
            sent.push(f.name)
            return new Promise<boolean>((r) => (finish = r))
          }}
          onSetStatus={() => {}}
        />,
      )
    })
    await choose()
    expect(sent).toEqual(['id.pdf'])
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Uploading id.pdf')
    await act(async () => finish(true))
    expect(host.querySelector('[role="status"]')).toBeNull()
    expect(host.textContent).not.toContain('Upload failed')
  })

  it('says when the upload failed and offers to try the same file again', async () => {
    let calls = 0
    act(() => {
      root.render(
        <ApplicationDocumentRow
          doc={doc('required')}
          canUpload
          canReview={false}
          onUpload={async () => {
            calls++
            return calls > 1
          }}
          onSetStatus={() => {}}
        />,
      )
    })
    await choose()
    expect(host.textContent).toContain('Upload failed')
    const retry = Array.from(host.querySelectorAll('button')).find((b) => /Try again/.test(b.textContent ?? ''))!
    await act(async () => {
      retry.click()
    })
    expect(calls).toBe(2)
    expect(host.textContent).not.toContain('Upload failed')
  })
})
