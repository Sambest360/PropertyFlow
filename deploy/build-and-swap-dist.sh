#!/usr/bin/env bash
# Sourced by deploy/release.sh and deploy/update.sh (not run directly).
# Build into dist-next, keep recent live assets, verify, then swap with
# rollback if the second mv fails so nginx root is never left missing.
propertyflow_build_and_swap_dist() {
  rm -rf dist-next
  BUILD_OUT_DIR=dist-next NODE_OPTIONS=--max-old-space-size=2048 npx vite build
  # Keep the previous release's page files for a week, so a tab opened before
  # this release can still load the pages it asks for.
  if [ -d dist/assets ]; then
    mkdir -p dist-next/assets
    cp -rpn dist/assets/. dist-next/assets/ 2>/dev/null || true
    find dist-next/assets -type f -mtime +7 -delete
  fi

  if [ ! -f dist-next/index.html ]; then
    echo "dist-next/index.html is missing — leaving live dist/ untouched." >&2
    exit 1
  fi
  if [ ! -d dist-next/assets ] || [ -z "$(ls -A dist-next/assets 2>/dev/null)" ]; then
    echo "dist-next/assets is missing or empty — leaving live dist/ untouched." >&2
    exit 1
  fi

  rm -rf dist-prev
  if [ -d dist ]; then
    mv dist dist-prev
  fi
  if ! mv dist-next dist; then
    echo "swap failed: could not mv dist-next to dist" >&2
    if [ -d dist-prev ]; then
      if ! mv dist-prev dist; then
        echo "rollback failed: live dist/ is missing and dist-prev could not be restored" >&2
        exit 1
      fi
      echo "swap failed: restored dist-prev to dist" >&2
    fi
    exit 1
  fi
}
