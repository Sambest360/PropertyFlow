# PropertyFlow — Preview Run Doc

Full-stack demo: **vite** dev server (SPA, port **5173**) proxying `/api` to a **Hono + Postgres** API server (port **8787**). Node v22 (nvm path used by launchers).

## 1. Reproduce uncommitted artifacts (fresh checkout)

- **Copy `.env.local` from the main checkout** (`/Users/samBest360/Desktop/propertyflow/.env.local`) into the worktree. Never symlink and never commit it. It holds Supabase/Postgres connection vars and `PAYFAST_*` credentials (sandbox merchant + passphrase). Port values inside may need adapting per worktree.
- Install deps with npm: `npm install` (lockfile is the source of truth).
- Database: the API talks to Postgres through `DIRECT_URL`/`DATABASE_URL` in `.env.local` — no local DB files to copy. If the DB was reset/reseeded, see `npm run db:*` scripts and `scripts/seed/` (seed demo data + trust books via `scripts/seed/seedDemo.ts`).
- No build artifacts are needed for preview (vite serves from source with HMR).

## 2. Run the servers

Default ports: vite **5173** (`--strictPort`), API **8787**. If taken, pick a free port and adjust the vite proxy target in `vite.config.ts` (or the API script).

**API** (long-lived; survives runner reaping once orphaned):

```sh
cd /Users/samBest360/Desktop/propertyflow
nohup ./.freebuff/pf-api-run.sh > /tmp/pf-api.log 2>&1 < /dev/null &
```

- Health check: `curl -s http://127.0.0.1:8787/api/health` → `{"ok":true,"database":"up",...}`

**Vite** (the fragile one — see launch recipe below):

```sh
./.freebuff/start-vite-robust.sh   # sets env, runs node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
```

### Detach recipe (macOS, this runner)

1. Try the plain recipe first — it sometimes gets reaped, so verify after ~5s:
   `{ nohup ./.freebuff/start-vite-robust.sh > ".freebuff/preview-a94720e4-a48a-4173-9e06-aafa7a00b641.log" 2>&1 < /dev/null & echo "pid=$!"; disown; }`
2. **`launchctl submit` is NOT reliable on this box** (jobs stick at "spawn scheduled" forever). Do not use it.
3. If the pid is reaped (`kill -0 <pid>` fails), daemonize with a Python double-fork + setsid — this is proven to survive the runner's process-group kill:

```python
# python3 heredoc; child execs vite directly with the nvm node binary
import os
log = open('<log path>', 'ab', 0)
pid = os.fork()
if pid == 0:
    os.setsid()
    if os.fork() == 0:
        os.chdir('/Users/samBest360/Desktop/propertyflow')
        devnull = os.open(os.devnull, os.O_RDONLY)
        os.dup2(devnull, 0); os.dup2(log.fileno(), 1); os.dup2(log.fileno(), 2)
        os.execve('/Users/samBest360/.nvm/versions/node/v22.23.2/bin/node',
                  ['node', 'node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
                  dict(os.environ))
    os._exit(0)
os.waitpid(pid, 0)
```

Then confirm: `kill -0 <pid>` and `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5173/` → 200, plus `/api/health` through the proxy.

## 3. Verify the app renders

- `/` and `/browse` render the SPA (title "Buy & rent property in South Africa | PropertyFlow").
- `/workspace/trust/arrears` (staff) — Trust pages must NOT show the Dashboard/Cashbook/Unallocated/Payouts/Deposits/Arrears subnav strip (removed by design; sidebar provides navigation).
- `/payfast/return?ref=<paymentId>` renders the payment-confirmation page.
- Register the preview with the **vite** pid after the URL answers HTTP 200.
