#!/bin/sh
# Letkaya API server launcher for launchd (outlives tool runner reaping).
cd /Users/samBest360/Desktop/propertyflow || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
set -a
. ./.env.local
set +a
exec node --require "$PWD/node_modules/tsx/dist/preflight.cjs" \
  --import "file://$PWD/node_modules/tsx/dist/loader.mjs" \
  server/index.ts
