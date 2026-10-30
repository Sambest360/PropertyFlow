#!/usr/bin/env bash
# Daily backup of PropertyFlow: the Postgres database and uploaded photos.
# Reads only: pg_dump never changes the database.
#
#   bash deploy/backup.sh            (cron runs it daily, see deploy/crons.sh)
#
# Writes to BACKUP_DIR (default /var/backups/propertyflow), keeps
# BACKUP_KEEP_DAYS days (default 14). A backup on the same disk does not
# survive losing the server: set BACKUP_RSYNC_TARGET in .env (for example
# backup@other-host:/backups/propertyflow, with an SSH key for root) to copy
# each backup off the server.
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/propertyflow}"
cd "$APP_DIR"
envval() { (grep "^$1=" .env || true) | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
BACKUP_DIR="${BACKUP_DIR:-$(envval BACKUP_DIR)}"; BACKUP_DIR="${BACKUP_DIR:-/var/backups/propertyflow}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-$(envval BACKUP_KEEP_DAYS)}"; KEEP_DAYS="${KEEP_DAYS:-14}"
RSYNC_TARGET="${BACKUP_RSYNC_TARGET:-$(envval BACKUP_RSYNC_TARGET)}"
UPLOADS="$(envval UPLOADS_DIR)"; UPLOADS="${UPLOADS:-uploads}"

STAMP=$(date -u +%Y-%m-%dT%H%M%SZ)
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
DUMP="$BACKUP_DIR/db-$STAMP.dump"

# pg_dump with the app's own DATABASE_URL, parsed by Node: the password may
# contain characters (such as @) that psql/pg_dump URL parsing gets wrong.
node --env-file=.env -e '
const u = new URL(process.env.DATABASE_URL)
const { spawnSync } = require("child_process")
const r = spawnSync("pg_dump", ["-Fc", "--no-owner", "-f", process.argv[1]], {
  stdio: "inherit",
  env: { ...process.env, PGHOST: u.hostname, PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)) },
})
process.exit(r.status ?? 1)' "$DUMP"
# A dump that cannot be listed is not a backup.
pg_restore --list "$DUMP" >/dev/null
chmod 600 "$DUMP"

if [ "$UPLOADS" = "off" ]; then
  echo "Photos: disk storage is off (UPLOADS_DIR=off), nothing to copy"
elif [ -d "$UPLOADS" ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")"
  chmod 600 "$BACKUP_DIR/uploads-$STAMP.tar.gz"
else
  echo "Photos: no $UPLOADS folder yet, nothing to copy"
fi

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete

if [ -n "$RSYNC_TARGET" ]; then
  rsync -a --delete "$BACKUP_DIR"/ "$RSYNC_TARGET"/
  echo "Copied off the server to $RSYNC_TARGET"
fi
echo "Backup OK: $(ls -lh "$DUMP" | awk '{print $5}') database dump in $BACKUP_DIR"
