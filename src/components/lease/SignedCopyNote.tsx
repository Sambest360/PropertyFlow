import { signedCopyState } from '../../lib/lease/signedCopy'

export function SignedCopyNote({ eSign }: { eSign: Parameters<typeof signedCopyState>[0] }) {
  const s = signedCopyState(eSign)
  if (s.kind === 'hidden') return null
  if (s.kind === 'link') {
    return (
      <a href={s.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary hover:underline">
        Download signed lease
      </a>
    )
  }
  return (
    <p className="text-sm text-ink-500" data-testid="signed-copy-none">
      {s.text}
    </p>
  )
}
