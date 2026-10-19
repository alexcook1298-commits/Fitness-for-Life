#!/usr/bin/env bash
# Rebuilds the integration candidate from the untouched PR #1 candidate (app/) by applying every patch in integration/patches/ in numeric order,
# then proves the result is byte-identical to integration/app. Never modifies baseline/ or app/.
# Usage: integration/build.sh   (from anywhere; needs `patch`)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; W="$(mktemp -d)"
cp -r "$ROOT/app" "$W/build"; chmod -R u+w "$W/build"
for p in "$ROOT"/integration/patches/[0-9]*.patch; do (cd "$W/build" && patch -p1 -s --no-backup-if-mismatch < "$p") && echo "applied $(basename "$p")"; done
if diff -r "$W/build" "$ROOT/integration/app" >/dev/null; then echo "OK: patches applied to app/ reproduce integration/app byte-for-byte"; else echo "MISMATCH"; diff -rq "$W/build" "$ROOT/integration/app"; exit 1; fi
sha256sum "$ROOT/integration/app/index.html" "$ROOT/integration/app/sw.js"
rm -rf "$W"
