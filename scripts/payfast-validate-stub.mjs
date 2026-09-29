/**
 * Local PayFast validate stub. Binds 127.0.0.1 only and never calls PayFast.
 *
 *   PAYFAST_VALIDATE_STUB_RESULT=VALID node scripts/payfast-validate-stub.mjs
 *   PAYFAST_VALIDATE_STUB_RESULT=INVALID node scripts/payfast-validate-stub.mjs
 *
 * Point the API at it with PAYFAST_VALIDATE_URL=http://127.0.0.1:8799/validate
 * and leave PAYFAST_VALIDATE_STUB unset so the API performs the POST.
 * The result is this process's env, not a header from the ITN caller.
 */
import { createServer } from 'node:http'

const result = (process.env.PAYFAST_VALIDATE_STUB_RESULT ?? 'VALID').trim().toUpperCase()
if (result !== 'VALID' && result !== 'INVALID') {
  console.error('PAYFAST_VALIDATE_STUB_RESULT must be VALID or INVALID')
  process.exit(1)
}
const port = Number(process.env.PAYFAST_VALIDATE_STUB_PORT ?? 8799)
const server = createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405)
    res.end('POST only')
    return
  }
  req.resume()
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(result)
  })
})
server.listen(port, '127.0.0.1', () => {
  console.log(`PayFast validate stub on http://127.0.0.1:${port}/validate → ${result}`)
})
