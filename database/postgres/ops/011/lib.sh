# Shared helpers for the 011 apply / rollback scripts. Sourced, not executed.
ops_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

resolve_database_url() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    DATABASE_URL_RESOLVED="$DATABASE_URL"
  elif [[ -n "${DIRECT_URL:-}" ]]; then
    DATABASE_URL_RESOLVED="$DIRECT_URL"
    echo "DATABASE_URL is unset; using DIRECT_URL. Prefer exporting DATABASE_URL set to the direct (port 5432) URI." >&2
  else
    echo "Set DATABASE_URL to a Postgres URI. Do not use port 6543." >&2
    return 1
  fi
  case "$DATABASE_URL_RESOLVED" in
    *:6543|*:6543/*|*:6543\?*)
      echo "Refusing port 6543. Session settings and a single migration transaction are not reliable there. Use a direct connection on port 5432." >&2
      return 1
      ;;
  esac
}

assert_transaction_safe() {
  local file="$1"
  python3 - "$file" << 'PY'
import re, sys
path = sys.argv[1]
text = open(path).read()
out = []
i = 0
n = len(text)
while i < n:
    if text.startswith('--', i):
        nl = text.find('\n', i)
        i = n if nl < 0 else nl
        continue
    if text.startswith('/*', i):
        end = text.find('*/', i + 2)
        i = n if end < 0 else end + 2
        continue
    if text[i] == "'":
        i += 1
        while i < n:
            if text[i] == "'":
                if i + 1 < n and text[i + 1] == "'":
                    i += 2
                    continue
                i += 1
                break
            i += 1
        continue
    if text[i] == '$':
        m = re.match(r'\$[A-Za-z0-9_]*\$', text[i:])
        if m:
            tag = m.group(0)
            end = text.find(tag, i + len(tag))
            i = n if end < 0 else end + len(tag)
            continue
    out.append(text[i])
    i += 1
stripped = ''.join(out)
checks = [
    (r'(?i)\bCREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY\b', 'CREATE INDEX CONCURRENTLY cannot run inside a transaction'),
    (r'(?i)\bDROP\s+INDEX\s+CONCURRENTLY\b', 'DROP INDEX CONCURRENTLY cannot run inside a transaction'),
    (r'(?i)\bREINDEX\s+CONCURRENTLY\b', 'REINDEX CONCURRENTLY cannot run inside a transaction'),
    (r'(?i)\bVACUUM\b', 'VACUUM cannot run inside a transaction'),
    (r'(?i)\bALTER\s+TYPE\b[^;]*\bADD\s+VALUE\b', 'ALTER TYPE ... ADD VALUE is unsafe inside the same transaction that uses the new value'),
    (r'(?im)^\s*BEGIN\s*(WORK|TRANSACTION)?\s*;', 'top-level BEGIN would break psql --single-transaction'),
    (r'(?im)^\s*COMMIT\s*;', 'top-level COMMIT would break psql --single-transaction'),
    (r'(?im)^\s*ROLLBACK\s*;', 'top-level ROLLBACK would break psql --single-transaction'),
    (r'(?im)^\s*START\s+TRANSACTION\b', 'top-level START TRANSACTION would break psql --single-transaction'),
    (r'(?im)^\s*END\s*;', 'top-level END would break psql --single-transaction'),
]
failed = False
for pattern, message in checks:
    if re.search(pattern, stripped):
        print(f'{path}: {message}', file=sys.stderr)
        failed = True
if failed:
    sys.exit(1)
print(f'transaction-safe: {path}')
PY
}

psql_in_one_transaction() {
  # --single-transaction wraps every -c and -f in one BEGIN/COMMIT.
  # lock_timeout fails the apply instead of queueing behind live traffic.
  local args=()
  local file
  for file in "$@"; do
    args+=(-f "$file")
  done
  psql "$DATABASE_URL_RESOLVED" \
    -v ON_ERROR_STOP=1 \
    --single-transaction \
    -c "SET lock_timeout = '5s'" \
    -c "SET statement_timeout = '60s'" \
    -c "SET idle_in_transaction_session_timeout = '60s'" \
    "${args[@]}"
}
