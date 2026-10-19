#!/usr/bin/env bash
# One command for the iPhone trial on your own Wi-Fi. Builds the two disposable test builds (A and B), makes the synthetic backup, and starts the
# private-network server for build A. Nothing is deployed, no tunnel is opened, no real data is read.
# Usage: integration/device/lan_up.sh [--forbid your-real-host.example] [--bind 192.168.x.y] [--port 8787] [--ttl 120] [--https cert.pem key.pem]
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$D/../.." && pwd)"; cd "$ROOT"
FORBID=(); EXTRA=(); CERT=(); 
while [ $# -gt 0 ]; do case "$1" in
  --forbid) FORBID+=(--forbid "$2"); shift 2;;
  --bind|--port|--ttl) EXTRA+=("$1" "$2"); shift 2;;
  --https) CERT=(--cert "$2" --key "$3"); shift 3;;
  *) echo "unknown option $1"; exit 2;;
esac; done
for t in A B; do node "$D/build_device_bundle.js" --tag "$t" --out "$D/dist/$t" --allow-private-network "${FORBID[@]}"; node "$D/build_device_bundle.js" --check "$D/dist/$t"; done
node "$D/make_disposable_backup.js" --out "$D/dist/DISPOSABLE_TEST_BACKUP.json" >/dev/null && echo "synthetic backup: $D/dist/DISPOSABLE_TEST_BACKUP.json"
exec node "$D/lan_test_server.js" "$D/dist/A" --seed "$D/dist/DISPOSABLE_TEST_BACKUP.json" "${EXTRA[@]}" "${CERT[@]}"
