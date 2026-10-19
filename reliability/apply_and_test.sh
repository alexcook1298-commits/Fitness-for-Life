#!/usr/bin/env bash
# Builds disposable copies (never touches baseline/ or app/), applies the reliability patch, runs the suites.
# Usage: reliability/apply_and_test.sh   (from the repo root; needs Node 22 + headless Chrome as for tests/)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; W="$(mktemp -d)"
build(){ cp -r "$1" "$W/$2"; chmod -R u+w "$W/$2"; (cd "$W/$2" && patch -p1 -s < "$ROOT/reliability/reliability-repair.patch"); }
build "$ROOT/baseline/hq-2.3" baseline_plus_patch
build "$ROOT/app" candidate_plus_patch
echo "== reliability suite: baseline + patch";  node "$ROOT/tests/reliability.test.js" "$W/baseline_plus_patch"  | tail -1
echo "== reliability suite: candidate + patch"; node "$ROOT/tests/reliability.test.js" "$W/candidate_plus_patch" | tail -1
echo "== backup/restore suite: candidate + patch"; node "$ROOT/tests/regression.test.js" "$W/candidate_plus_patch" | tail -1
echo "== control: reliability suite on UNPATCHED baseline (expected: 19 failures)"; node "$ROOT/tests/reliability.test.js" "$ROOT/baseline/hq-2.3" | tail -1 || true
echo "Disposable copies in $W"
