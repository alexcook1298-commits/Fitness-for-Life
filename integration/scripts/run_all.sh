#!/usr/bin/env bash
# Runs every suite against the integration candidate and, for context, the earlier trees. Writes raw JSON to integration/results/.
# Raw counts are reported unchanged; nothing is adjusted. (Phase 1 excluded the old S1.8 defect assertion from an "adjusted" total.
# Phase 2 replaced it with a corrected assertion and preserved the original under tests/historical, so no adjustment remains.)
# Usage: integration/scripts/run_all.sh        (needs Node 22 and Chrome; ~2 minutes)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; R="$ROOT/integration/results"; mkdir -p "$R"; cd "$ROOT"
C=integration/app
run(){ local label="$1"; shift; echo "== $label"; node "$@" 2>&1 | tail -3 | sed 's/^/   /'; }
run "backup/restore suite (30) on candidate"        tests/regression.test.js  $C --json "$R/backup_30_candidate.json"
run "reliability suite (35) on candidate"           tests/reliability.test.js $C --json "$R/reliability_35_candidate.json"
run "integration suite (32) on candidate"           tests/integration.test.js $C --json "$R/integration_32_candidate.json"
run "gym-workflow suite (56) on candidate"          tests/gym-workflow.test.js $C --old-app app --json "$R/gym_workflow_integration_candidate.json"
run "Phase 2 suite (RD readiness, CB cardio, BU budget, CS completion) on candidate" tests/phase2.test.js $C --json "$R/phase2_candidate.json"
run "G9.3 again, updating from the ORIGINAL baseline install" tests/gym-workflow.test.js $C --old-app baseline/hq-2.3 --only G9.3 --json "$R/gym_G9_3_update_from_ORIGINAL_BASELINE.json"
echo "-- context: same suites on earlier trees (failures here are expected and show what each layer fixed) --"
run "backup suite on ORIGINAL BASELINE"             tests/regression.test.js  baseline/hq-2.3 --json "$R/context_backup_on_baseline.json"
run "reliability suite on PR#1 candidate (app/)"    tests/reliability.test.js app --json "$R/context_reliability_on_app_PR1.json"
run "integration suite on PR#1 candidate (app/)"    tests/integration.test.js app --json "$R/context_integration_on_app_PR1.json"
echo "-- historical evidence: the ORIGINAL S1.8 defect assertion (exit 0 = defect present). Valid on trees with PR #3 but without patch 02 --"
H="$(mktemp -d)"; cp -r app/. "$H"; chmod -R u+w "$H"; (cd "$H" && patch -p1 -s --no-backup-if-mismatch < "$ROOT"/integration/patches/01-*.patch)
node tests/historical/S1.8_original_defect_assertion.test.js "$H" 2>&1 | tail -2 | sed 's/^/   [PR#1 + patch 01] /'; echo "   (exit $?; expected: defect present)"
node tests/historical/S1.8_original_defect_assertion.test.js $C 2>&1 | tail -2 | sed 's/^/   [candidate] /'
rm -rf "$H"
echo "== completion field compatibility with earlier shipped validators"; node integration/scripts/compat_completion_probe.js $C baseline=baseline/hq-2.3 pr1=app | tee "$R/phase2/compat_completion_probe.json"
echo "== program identity"; integration/scripts/verify_program_identity.sh | tee "$R/program_identity_verification.txt"
node -e '
const fs=require("fs"),R=process.argv[1];const L=f=>JSON.parse(fs.readFileSync(R+"/"+f,"utf8"));
const rows=[["backup/restore","backup_30_candidate.json"],["reliability","reliability_35_candidate.json"],["integration","integration_32_candidate.json"],["gym-workflow","gym_workflow_integration_candidate.json"],["phase2","phase2_candidate.json"]];
let p=0,t=0;const out={};for(const [n,f] of rows){const j=L(f);const tot=j.passed+j.failed;out[n]={passed:j.passed,failed:j.failed,total:tot,failedIds:j.results.filter(x=>!x.pass).map(x=>x.id)};p+=j.passed;t+=tot}
out.raw={passed:p,total:t,failed:t-p};
fs.writeFileSync(R+"/SUMMARY_candidate.json",JSON.stringify(out,null,1));console.log(JSON.stringify(out,null,1))' "$R"
