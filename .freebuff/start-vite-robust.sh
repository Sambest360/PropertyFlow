#!/bin/bash
# Robust launcher that keeps vite alive using script(1) for PTY
export PATH="/Users/samBest360/.nvm/versions/node/v22.23.2/bin:$PATH"
cd /Users/samBest360/Desktop/propertyflow || exit 1
set -a
. ./.env.local
set +a
exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
