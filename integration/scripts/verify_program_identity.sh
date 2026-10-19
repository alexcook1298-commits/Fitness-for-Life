#!/usr/bin/env bash
# Proves the integration candidate prescribes exactly what the original HQ 2.3 baseline prescribes.
#  1. Extracts every program-definition structure (audit/scripts/extract.js) from both apps and byte-compares them.
#  2. Computes the effective prescription for every template/slot/rotation cycle (audit/scripts/effective_prescription.js),
#     byte-compares baseline vs candidate, and against the committed audit/data/effective_prescription.json.
#  3. Lists every non-index.html file that differs between baseline and candidate.
# Read-only; synthetic empty storage in disposable headless-Chrome profiles. Usage: integration/scripts/verify_program_identity.sh [candidateDir]
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; CAND="${1:-$ROOT/integration/app}"; BASE="$ROOT/baseline/hq-2.3"; W="$(mktemp -d)"; rc=0
node "$ROOT/audit/scripts/extract.js" "$BASE" "$W/base" >/dev/null; node "$ROOT/audit/scripts/extract.js" "$CAND" "$W/cand" >/dev/null
n=$(ls "$W/base" | wc -l); echo "structures extracted: $n (baseline) / $(ls "$W/cand" | wc -l) (candidate)"
if diff -r "$W/base" "$W/cand" >/dev/null; then echo "PASS program structures byte-identical across all $n files"; else echo "FAIL program structures differ:"; diff -rq "$W/base" "$W/cand"; rc=1; fi
# Phase 3: the Giant B cycle is forced by seeding finished Giant B sessions into history (works on both trees). The original audit script forced it by
# overriding completedTemplateCount, which the Phase 3 rotation intentionally no longer reads; on the baseline both methods give identical output.
node "$ROOT/integration/scripts/effective_prescription_by_history.js" "$BASE" "$W/eff_base.json" >/dev/null; node "$ROOT/integration/scripts/effective_prescription_by_history.js" "$CAND" "$W/eff_cand.json" >/dev/null
node "$ROOT/audit/scripts/effective_prescription.js" "$BASE" "$W/eff_base_orig.json" >/dev/null; if cmp -s "$W/eff_base.json" "$W/eff_base_orig.json"; then echo "PASS both forcing methods agree on the baseline"; else echo "FAIL forcing methods disagree on the baseline"; rc=1; fi
rows=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$W/eff_base.json','utf8')).length)")
if cmp -s "$W/eff_base.json" "$W/eff_cand.json"; then echo "PASS effective prescription byte-identical baseline vs candidate ($rows rows)"; else echo "FAIL effective prescription differs"; rc=1; fi
if cmp -s "$W/eff_base.json" "$ROOT/audit/data/effective_prescription.json"; then echo "PASS baseline output matches committed audit/data/effective_prescription.json"; else echo "FAIL baseline output differs from audit/data/effective_prescription.json"; rc=1; fi
echo "files differing from the baseline package (non-index.html):"; diff -rq "$BASE" "$CAND" | grep -v 'index.html' | sed 's/^/  /' || true
echo "sha256 baseline index.html:  $(sha256sum "$BASE/index.html" | cut -d' ' -f1)"
echo "sha256 candidate index.html: $(sha256sum "$CAND/index.html" | cut -d' ' -f1)"
rm -rf "$W"; exit $rc
