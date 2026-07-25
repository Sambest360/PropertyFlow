#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
HOST="${MYSQL_HOST:-127.0.0.1}"
PORT="${MYSQL_PORT:-3306}"
USER="${MYSQL_USER:-root}"

echo "Loading schema into MySQL at ${HOST}:${PORT} as ${USER}..."
mysql -h "$HOST" -P "$PORT" -u "$USER" ${MYSQL_PWD:+-p"$MYSQL_PWD"} < "$ROOT/schema.sql"
echo "Loading seed data..."
mysql -h "$HOST" -P "$PORT" -u "$USER" ${MYSQL_PWD:+-p"$MYSQL_PWD"} < "$ROOT/seed.sql"
echo "Done. Open database 'propertyflow' in TablePlus."
