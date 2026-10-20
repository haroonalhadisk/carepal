#!/usr/bin/env bash
# Build the CarePal site into ./app (capture mode is enabled by ?capture), then
# render the showcase. Usage: ./build.sh [render]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
site="$here/../../../site"
(cd "$site" && npx vite build --base ./ --outDir "$here/app" --emptyOutDir)
if [ "${1:-}" = "render" ]; then
  cd "$here"
  npx hyperframes render . --fps 30 --workers 1 -o renders/carepal-showcase.mp4
  mkdir -p "$here/../renders" "$site/dist/media"
  cp renders/carepal-showcase.mp4 "$here/../renders/carepal-showcase.mp4"
  cp renders/carepal-showcase.mp4 "$site/dist/media/carepal-showcase.mp4"
fi
