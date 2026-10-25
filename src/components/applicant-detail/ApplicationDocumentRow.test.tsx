import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ApplicationDocument } from '../../types/domain'
import { ApplicationDocumentRow } from './ApplicationDocumentRow'

const doc = (status: ApplicationDocument['status']): ApplicationDocument => ({ key: 'id', label: 'ID copy', status })

describe('ApplicationDocumentRow upload', () => {
  it('starts with Choose file — nothing is uploaded until the file is saved', () => {
    const html = renderToStaticMarkup(
      <ApplicationDocumentRow doc={doc('required')} canUpload canReview={false} onUpload={async () => true} onSetStatus={() => {}} />,
    )
    expect(html).toContain('Choose file')
    expect(html).not.toContain('Save document')
  })

  it('offers a replacement for a rejected document', () => {
    const html = renderToStaticMarkup(
      <ApplicationDocumentRow doc={doc('rejected')} canUpload canReview={false} onUpload={async () => true} onSetStatus={() => {}} />,
    )
    expect(html).toContain('Choose replacement file')
  })
})
