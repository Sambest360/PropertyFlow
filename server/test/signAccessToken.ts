import { SignJWT } from 'jose'

export async function signHs256AccessToken(opts: {
  sub: string
  secret: string
  issuer: string
  audience?: string
  exp: number
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(opts.sub)
    .setIssuer(opts.issuer)
    .setAudience(opts.audience ?? 'authenticated')
    .setIssuedAt(Math.min(now, opts.exp - 1))
    .setExpirationTime(opts.exp)
    .sign(new TextEncoder().encode(opts.secret))
}
