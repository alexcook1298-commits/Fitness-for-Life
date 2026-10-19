# Project America HQ 2.3 — Limited reliability repair: implementation and verification report

**Recommendation: READY FOR YOUR REVIEW, NOT RELEASED. STOP for approval.**
Nothing was deployed, restored or merged. `baseline/hq-2.3/` and the backup/restore candidate in `app/` were not modified. Their SHA-256 values are unchanged: baseline `index.html` `93fc2f46…455ec`, candidate `index.html` `5a6fd882…a847`.

## 1. Where the change lives

The repair is delivered as a **separate patch**, not as an edit to the candidate. It was developed against the baseline and then shown to apply to the candidate, so the two can be combined later.

| Item | Path |
|---|---|
| Patch (one hunk, 3 fixes) | `reliability/reliability-repair.patch` |
| New regression suite (35 tests) | `tests/reliability.test.js` (committed **before** the fix) |
| Re-run everything from scratch | `reliability/apply_and_test.sh` (builds disposable copies, never touches `baseline/` or `app/`) |
| Results (JSON) | `reliability/results_*.json`, `reliability/probes/` |
| Item 4 design (not implemented) | `reliability/PROGRESSION_DESIGN_PROPOSAL.md` |
| Knee/elbow questions and safeguards | `reliability/CLINICAL_QUESTIONS_AND_INTERIM_SAFEGUARDS.md` |

**Files changed in the application:** only `index.html`, three functions, one hunk (about 23 changed lines):
`readinessDecision`, `recentSessions`, `evidenceDecision` (plus one new helper `evidenceSeriesKey`).
`sw.js`, `install.js`, the manifest and all data structures are untouched.

**Conflict check with the backup/restore candidate:** the patch applies to the candidate with a 90-line offset and no fuzz or conflict. The candidate's own edits (backup validation and OS-text escaping, around lines 1088–1480) do not overlap these functions.

## 2. Test-first evidence

| Run | Result |
|---|---|
| New suite on **unmodified baseline** (tests written first) | **16 pass, 19 fail** |
| New suite on unpatched candidate (control) | 16 pass, 19 fail (same failures) |
| New suite on baseline + patch | **35 / 35 pass** |
| New suite on candidate + patch | **35 / 35 pass** |
| Existing 30-test backup/restore suite on candidate + patch | **30 / 30 pass** |
| Program data (32 structures) and the 130-row effective prescription, baseline vs patched | **byte-identical** |
| Audit probes P3–P8, Q1, Q2, Q4, Q5 on patched app | identical to baseline; only the P1, P2 and Q3 outputs differ, as intended |

The 19 tests that fail on the baseline are: S1.1, S1.3, S1.4, S1.5, S1.6, S1.8 (Fix 1); E1.1–E1.5, E1.14, E1.15 (Fix 2); R1.1, R1.2, R1.5, R1.7, R1.9, R1.10 (Fix 3). S1.8 fails first only because sessions are not counted at all. E1.14 and E1.15 are robustness checks (null records, prototype-named exercises) that the rewritten engine also satisfies.
The 16 tests that pass on both sides are deliberate guards, so true positives, legacy data, default states and read-only behaviour must not change: S1.2, S1.7, E1.6–E1.13, E1.16, R1.3, R1.4, R1.6, R1.8, R1.11.

## 3. Fix 1 — session status (`complete` vs `completed`)

**Cause (VERIFIED):** `finishSession` writes `status:'complete'` and `finishedAt`; `recentSessions` accepted only `'completed'` and ignored `finishedAt`.
**Change:** accept `'complete'` and legacy `'completed'`; date from `finishedAt || completedAt || updatedAt || startedAt`; tolerate non-array or null storage values. No stored data is changed.

| Before (baseline) | After |
|---|---|
| 2 complete sessions → `recentSessions(7)=0`, `(42)=0` | 2 and 2 |
| Budget all zeros | Strength 1, Hypertrophy 1 (the two synthetic sessions in the probe) |
| Coach Handoff "Completed sessions: 0" | "Completed sessions: 1" after finishing one real session via `finishSession()` (S1.6) |
| Malformed `pa_sessions_v2` (`{}`) throws | returns 0 |

**Edge cases tested:** drafts excluded, 7 vs 42 day windows, missing or invalid dates, legacy `completed`, null and garbage storage, storage unchanged after reads (S1.1–S1.7).

**Unmasked pre-existing issue (not fixed — needs your decision).** `budgetData` (line 1327) classifies templates by substring: `includes('a')` and `includes('b')`. Once sessions are counted, `athletic` also counts as Strength, and `mobility` also counts as Hypertrophy (S1.8 documents the current behaviour). This was previously hidden because every count was zero. The fix is small (match template names exactly) but is outside what you authorized. I recommend approving it together with this patch; otherwise Training Budget will show correct totals with partly wrong categories.

## 4. Fix 2 — false deterioration signals

**Cause (VERIFIED):** the engine grouped by exercise name only, applied Epley across intensifiers, strength methods and rep ranges, and compared the last exposure with the first.
**Change (see patch):**
1. Series are built per **exercise × intensifier × strengthMethod × rep band** (reps ≤12 or >12). Missing fields default to "Straight Sets", so legacy records still form one series.
2. A decline counts only if it is **sustained**: the latest two exposures must both sit more than 2.5% below the best earlier exposure in the window. One light day cannot raise INVESTIGATE or ACT.
3. Grouping now uses a `Map`, so exercise names such as `constructor` no longer throw. This is an incidental hardening and is tested (E1.15).
4. Structured intensifier records remain excluded. Per-date representative (maximum), the 4-date window, the thresholds, the messages, and the UI are unchanged.

| Scenario (synthetic) | Before | After |
|---|---|---|
| Leg Press 300×8 ×3, then 1 Widowmaker 200×20 | **ACT**, −12.3% | OBSERVE |
| Leg curl progressing, then 1 light day | INVESTIGATE, −10% | OBSERVE |
| Paused bench progressing, then 1 back-off-only day | INVESTIGATE, −12.5% | OBSERVE |
| Cluster-set rows ×3, then straight-set rows | **ACT** | OBSERVE |
| Hack squat 250×5 ×3, then 160×16 | **ACT** | OBSERVE |
| Lat pulldown 150→145→140→130 (4 dates) | ACT | **ACT (preserved)** |
| Incline press 80→75→70 (3 dates) | INVESTIGATE | **INVESTIGATE (preserved)** |
| Legacy records without new fields, declining | ACT | **ACT (preserved)** |

**Trade-offs (honest):**
- It is now more conservative. A genuine decline that crosses the 12-rep boundary is split across two series and may be missed. A single bad day is never flagged, even when it is a real problem.
- The 2.5% margin and the 12-rep boundary are judgement calls that mirror the engine's existing thresholds. They are not trial-derived.
- Epley remains the performance measure. I did not change it.

## 5. Fix 3 — readiness and joint warnings

**Cause (VERIFIED):** the five items were averaged with equal weight, so joints = 1/5 with everything else 5/5 scored 84 and showed GREEN "Run as programmed".
**Change:** classification only. The score formula and stored data are unchanged.
- Joint status 1/5 → **RED**, with text saying that joint status overrides the overall score.
- Joint status 2/5 → never GREEN: capped at **YELLOW** with joint-qualified text. A base YELLOW or RED stays as it was.
- Joint status 3, 4 or 5, missing, or non-numeric (treated as 3, as before) → identical to the original rule.

| Check-in | Before | After |
|---|---|---|
| Joints 1, others 5 (score 84) | GREEN | **RED** |
| Joints 1, soreness 1, others 5 (68) | YELLOW | **RED** |
| Joints 2, others 5 (88) | GREEN | **YELLOW** (joint text) |
| Joints 3–5, others 5 | GREEN | GREEN, text unchanged |
| Never checked in (72) | YELLOW | YELLOW |

**Verified:** all 3,125 possible check-ins (R1.5) — the label never improves, is identical whenever joints ≥3, joints 1 is always RED and joints 2 is never GREEN. The Readiness page, Mission Status card and Coach Handoff all show the new label (R1.9, R1.10). Stored `pa_os_v2` is unchanged (R1.11).
**Known limits:** the page still prints the unchanged numeric score next to RED (for example "RED • 84 / 100"). The explanatory text states the override. Stale check-ins (a five-year-old GREEN) and missing check-in history are **not** addressed here; they were not authorized. Thresholds (1 → RED, 2 → not GREEN) are a safety judgement for you to confirm.

## 6. Item 4 — progression (investigation only)

I reproduced nine behaviours (`reliability/progression_investigation_baseline.json`). The most important:
- The "NEXT" text ignores the slot's rep range: 12 reps and 5 reps both read "100 lb • progress within Straight Sets".
- With Top Set + Back-Offs the target is the **back-off** load (200×5 top then 170×8 gives "170 lb").
- After a deliberately easy session the target ratchets **down** to that session's load.
- A last exposure 120 days ago is treated like yesterday.

A minimal, display-only design is in `PROGRESSION_DESIGN_PROPOSAL.md`. **Nothing is implemented.** It lists the decisions I need from you.

## 7. Migration and compatibility risks

| Risk | Detail | Mitigation |
|---|---|---|
| Summaries change on first view | Counts jump from 0 to real values | Expected; no stored data changes. Release note recommended. |
| Training Budget categories | Substring classification now visible (see §3) | Decide whether to include an exact-match fix |
| Fewer evidence flags | Fix 2 is deliberately conservative | Documented trade-offs in §4 |
| Readiness label vs score | RED beside a high number | Explanatory text; thresholds up to you |
| Backup/restore | Backup format, validation and `pa_*` keys are unchanged. Patch applies to the candidate. 30/30 backup tests pass on candidate + patch | Re-run `apply_and_test.sh` after any merge |
| Service worker | `sw.js` caches `index.html` under `project-america-shell-v2-3-training-20261006`. A release needs a cache-name bump so installed PWAs pick up the change | **Not done** (release not authorized) |
| Real devices | Only emulated Chrome, synthetic data. No iOS Safari or Android run | Needs a device pass before release |
| Real data | The athlete's real history was not available | Verify on a restored copy of real data before release |

## 8. Not done, by instruction

No deployment, no data restoration, no new exercises, no volume changes, no workout restructuring, no injury-specific exercise prescriptions, no architectural redesign, no progression change.

## 9. STOP — approvals requested

1. Approve (or amend thresholds for) Fixes 1–3 for release packaging, including the `sw.js` cache bump.
2. Decide whether to include the exact-match budget classification fix (§3).
3. Review the Item 4 design and answer its three questions.
4. Take the clinical question list to your clinician. Nothing about the knee or elbow was changed in code.
