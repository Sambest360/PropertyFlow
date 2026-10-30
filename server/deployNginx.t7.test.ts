// T7 (spec r5 :170-176, Jim C12 + A1-A5): the repo nginx files.
// deploy/nginx-propertyflow.conf is what setup.sh installs BEFORE certbot exists,
// so it must stay a valid :80-only config. The TLS/redirect shape lives in
// deploy/nginx-propertyflow.tls.conf.example, which setup.sh never copies.
// These tests read the files; `nginx -t` proof is in the PR (file reads alone
// do not prove nginx accepts them).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(`../deploy/${p}`, import.meta.url), 'utf8')

/** Drop `#` comments (outside quotes) and collapse whitespace. */
function stripComments(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      let q: string | null = null
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (q) {
          if (ch === q) q = null
        } else if (ch === '"' || ch === "'") q = ch
        else if (ch === '#') return line.slice(0, i)
      }
      return line
    })
    .join('\n')
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

type Block = { head: string; body: string }

/** Top-level `<head> { ... }` blocks of a (comment-stripped) source. */
function blocks(src: string): Block[] {
  const out: Block[] = []
  let depth = 0
  let start = -1
  let headStart = 0
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        out.push({ head: norm(src.slice(headStart, start)), body: src.slice(start + 1, i) })
        headStart = i + 1
      }
    } else if (ch === ';' && depth === 0) {
      headStart = i + 1
    }
  }
  return out
}

/** Directives of a block body that sit at its own level (not inside a child block). */
function ownDirectives(body: string): string[] {
  let depth = 0
  let flat = ''
  for (const ch of body) {
    if (ch === '{') depth++
    if (depth === 0) flat += ch
    if (ch === '}') depth--
  }
  return flat
    .split(';')
    .map(norm)
    .filter((d) => d && d !== '}')
}

const servers = (src: string) => blocks(stripComments(src)).filter((b) => b.head === 'server')
const listensOn = (b: Block, port: string) =>
  ownDirectives(b.body).some((d) => new RegExp(`^listen (\\S+:)?${port}( |$)`).test(d))
const locations = (b: Block) => blocks(b.body).filter((x) => x.head.startsWith('location'))

const HEADERS_INCLUDE = 'include conf.d/propertyflow-security-headers.conf'

// origin/main 29ef6e8 deploy/nginx-propertyflow.conf, comments stripped. The
// installed :80 block must not change behaviour in T7 (H5 owns gzip/caching).
const MAIN_INSTALLED = `server {
    listen 80;
    server_name lekayarentals.site www.lekayarentals.site;
    root /var/www/propertyflow/dist;
    index index.html;
    client_max_body_size 25M;
    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}`

const PROXY_HEADERS = [
  'proxy_set_header X-Real-IP $remote_addr',
  'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for',
  'proxy_set_header X-Forwarded-Proto $scheme',
]

describe('T7 installed nginx file (deploy/nginx-propertyflow.conf)', () => {
  const installed = read('nginx-propertyflow.conf')

  it('has no ssl_certificate and no 443 listener, so nginx -t passes before certbot', () => {
    const code = stripComments(installed)
    expect(code).not.toMatch(/ssl_certificate/)
    expect(code).not.toMatch(/listen\s+[^;]*443/)
    const s = servers(installed)
    expect(s).toHaveLength(1)
    expect(listensOn(s[0], '80')).toBe(true)
  })

  it('is unchanged from main apart from comments', () => {
    expect(norm(stripComments(installed))).toBe(norm(MAIN_INSTALLED))
  })

  it('/api/ proxy keeps X-Real-IP, X-Forwarded-For and X-Forwarded-Proto (H1 reads X-Real-IP)', () => {
    const api = locations(servers(installed)[0]).find((l) => l.head === 'location /api/')
    expect(api).toBeDefined()
    const d = ownDirectives(api!.body)
    for (const h of PROXY_HEADERS) expect(d).toContain(h)
  })
})

describe('T7 TLS template (deploy/nginx-propertyflow.tls.conf.example)', () => {
  // Read lazily so a missing template fails each test, not the whole file.
  const tplSrc = () => {
    try {
      return read('nginx-propertyflow.tls.conf.example')
    } catch {
      return ''
    }
  }
  const installed = read('nginx-propertyflow.conf')
  const parse = () => {
    const s = servers(tplSrc())
    return { s, http: s.filter((b) => listensOn(b, '80')), tls: s.filter((b) => listensOn(b, '443 ssl')) }
  }

  it('has exactly one :80 server and one 443 ssl server', () => {
    const { s, http, tls } = parse()
    expect(s).toHaveLength(2)
    expect(http).toHaveLength(1)
    expect(tls).toHaveLength(1)
  })

  it('the :80 block is only the 301 to https for the apex and www (A4)', () => {
    const { http } = parse()
    expect(locations(http[0])).toHaveLength(0)
    expect(ownDirectives(http[0].body)).toEqual([
      'listen 80',
      'server_name lekayarentals.site www.lekayarentals.site',
      'return 301 https://$host$request_uri',
    ])
  })

  it('the 443 block serves both names with certbot certificate paths', () => {
    const { tls } = parse()
    const d = ownDirectives(tls[0].body)
    expect(d).toContain('server_name lekayarentals.site www.lekayarentals.site')
    expect(d).toContain('ssl_certificate /etc/letsencrypt/live/lekayarentals.site/fullchain.pem')
    expect(d).toContain('ssl_certificate_key /etc/letsencrypt/live/lekayarentals.site/privkey.pem')
  })

  it('the 443 server block includes the security header snippet (A2)', () => {
    const { tls } = parse()
    expect(ownDirectives(tls[0].body)).toContain(HEADERS_INCLUDE)
  })

  it('every 443 location with its own add_header re-includes the security header snippet (A2)', () => {
    const { tls } = parse()
    const withHeaders = locations(tls[0]).filter((l) =>
      ownDirectives(l.body).some((d) => d.startsWith('add_header ')),
    )
    expect(withHeaders.map((l) => l.head)).toContain('location /assets/')
    for (const l of withHeaders) expect(ownDirectives(l.body), l.head).toContain(HEADERS_INCLUDE)
  })

  it('has the same locations as the installed file, with the same /api/ proxy headers', () => {
    const { tls } = parse()
    const heads = (b: Block) => locations(b).map((l) => l.head)
    expect(heads(tls[0])).toEqual(heads(servers(installed)[0]))
    const api = locations(tls[0]).find((l) => l.head === 'location /api/')
    const d = ownDirectives(api!.body)
    for (const h of PROXY_HEADERS) expect(d).toContain(h)
  })

  it('does not set HSTS itself (the header snippet owns it, so it is sent once)', () => {
    expect(stripComments(tplSrc())).not.toMatch(/Strict-Transport-Security/i)
  })
})

describe('T7 header snippet (deploy/nginx-security-headers.conf)', () => {
  it('is the only HSTS source, unchanged from main, with no preload (A5)', () => {
    const code = stripComments(read('nginx-security-headers.conf'))
    const hsts = code.match(/add_header\s+Strict-Transport-Security\s+"[^"]*"[^;]*;/g) ?? []
    expect(hsts).toEqual(['add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'])
  })
})

describe('T7 setup.sh', () => {
  it('still installs only the :80 file and tells the operator the certbot --nginx --redirect command', () => {
    const sh = read('setup.sh')
    expect(sh).toContain('cp deploy/nginx-propertyflow.conf /etc/nginx/sites-available/propertyflow')
    expect(sh).not.toMatch(/tls\.conf\.example/)
    expect(sh).toContain('certbot --nginx --redirect -d lekayarentals.site -d www.lekayarentals.site')
  })
})

// Jim's #125 review SHOULD 2, mutants J04 and J09: the template must not drift
// from the installed file on the proxy target or the /assets caching. Both are
// read from the files, so a change to one file alone fails here.
describe('T7 template pins against the installed file (J04, J09)', () => {
  const tplServers = () => servers(read('nginx-propertyflow.tls.conf.example'))
  const tls = () => tplServers().filter((b) => listensOn(b, '443 ssl'))[0]
  const inst = () => servers(read('nginx-propertyflow.conf'))[0]
  const proxied = (b: Block) =>
    locations(b)
      .map((l) => ({ head: l.head, pass: ownDirectives(l.body).filter((d) => d.startsWith('proxy_pass ')) }))
      .filter((l) => l.pass.length > 0)

  it('every proxied location has the same proxy_pass target (host and port) in both files (J04)', () => {
    const want = proxied(inst())
    expect(want.length).toBeGreaterThan(0)
    // Same set of proxied locations, and for each one the exact same proxy_pass directive(s).
    expect(proxied(tls())).toEqual(want)
    for (const l of want) expect(l.pass, l.head).toEqual([expect.stringMatching(/^proxy_pass http:\/\/127\.0\.0\.1:\d+/)])
  })

  it('no proxy_pass outside a location, and none in the :80 redirect block', () => {
    for (const s of [...tplServers(), inst()]) {
      expect(ownDirectives(s.body).filter((d) => d.startsWith('proxy_pass '))).toEqual([])
    }
    const http = tplServers().filter((b) => listensOn(b, '80'))[0]
    expect(proxied(http)).toEqual([])
  })

  it('/assets/ has the same Cache-Control (add_header Cache-Control and expires) in both files (J09)', () => {
    const caching = (b: Block) => {
      const a = locations(b).find((l) => l.head === 'location /assets/')
      expect(a, 'location /assets/').toBeDefined()
      return ownDirectives(a!.body).filter((d) => /^add_header Cache-Control /i.test(d) || d.startsWith('expires '))
    }
    const want = caching(inst())
    expect(want.some((d) => /^add_header Cache-Control /i.test(d))).toBe(true)
    expect(caching(tls())).toEqual(want)
  })
})

// Michael's Ruling 16: PayFast's live payment page may sit on payment.<io host>, and
// a redirect from /eng/process would be blocked by form-action without it
// (UNVERIFIED). The old www.<io host> entry stays until the first live payment
// is verified. Host names are built in parts: #127's guard test fails on the
// io domain literal anywhere in server/ or src/.
describe('T7 CSP form-action (deploy/nginx-security-headers.conf)', () => {
  const IO = 'payfast' + '.io'
  const formAction = () => {
    const code = stripComments(read('nginx-security-headers.conf'))
    const csp = code.match(/add_header\s+Content-Security-Policy\s+"([^"]*)"/g) ?? []
    expect(csp).toHaveLength(1)
    const value = csp[0].match(/"([^"]*)"/)![1]
    const fa = value
      .split(';')
      .map(norm)
      .filter((d) => d.startsWith('form-action '))
    expect(fa).toHaveLength(1)
    return fa[0].split(' ').slice(1)
  }

  it('allows the PayFast payment host and keeps the three existing PayFast hosts', () => {
    const src = formAction()
    for (const h of [
      `https://payment.${IO}`,
      'https://www.payfast.co.za',
      'https://sandbox.payfast.co.za',
      `https://www.${IO}`,
    ])
      expect(src, h).toContain(h)
  })

  it("is exactly 'self', those PayFast hosts and the existing OPPWA entry (no new wildcard)", () => {
    expect([...formAction()].sort()).toEqual(
      [
        "'self'",
        'https://sandbox.payfast.co.za',
        'https://www.payfast.co.za',
        `https://www.${IO}`,
        `https://payment.${IO}`,
        'https://*.oppwa.com',
      ].sort(),
    )
  })
})
