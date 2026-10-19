# Project America HQ 2.3 — Phase 1 Integration & Reliability Report

**Status: DEVELOPMENT CANDIDATE. Not deployed. Not merged to `main`. No real user data touched.**
Earliest deployment: **October 23, 2026. This is not an automatic release date.**
Branch: `cursor/integration-candidate-75d6` (draft PR, base `cursor/reliability-repair-75d6`). Nothing here is approved until you say so.

All testing used synthetic data in disposable headless-Chrome profiles on Linux. **That is not evidence of real-device behaviour.** Section 8 lists what only a real phone can tell us.

---

## 1. Verdict in one paragraph

The unified candidate (`integration/app/`) contains all six requested repairs. Every suite passes except one test that asserts the very defect patch 02 fixes (reliability `S1.8`, intentionally left unedited). **152 of 153 raw, 153 of 153 once that superseded test is excluded.** Program data is byte-identical to the original baseline (32 structures, 130 effective-prescription rows). Verdict on real-device testing: **conditional GO** (section 9). Deployment: **NO-GO** until the decisions in section 7 are made and real-device results are in.

---

## 2. Step 1 — what the repository actually contained (verified, not assumed)

| Item | Branch / PR | Exact commit | Contains |
|---|---|---|---|
| Original HQ 2.3 baseline | `baseline/hq-2.3/` | unchanged since the first sprint | `index.html` SHA-256 `93fc2f46…1455ec`, archive SHA `b42ac938…2394f4` |
| PR #1 — backup/restore candidate | `cursor/backup-restore-repair-75d6` | `082bff0` | `app/` (index SHA `5a6fd882…a847`) + 30-test suite |
| PR #2 — comprehensive audit | `cursor/hq-2-3-audit-75d6` | `e3c378e` | read-only audit, `audit/data/effective_prescription.json` |
| PR #3 — reliability repair | `cursor/reliability-repair-75d6` | `b108897` (merge `6c9a502`) | `reliability/reliability-repair.patch`, 35 tests, progression design |
| PR #4 — Time-Constrained Session design | `cursor/tcs-design-75d6` | `3d51825` | design only. **Not included** in this candidate. |

Findings about integration state (nothing was already integrated):

* The reliability patch (PR #3) is a patch against the **baseline**; PR #1 changes the same file. They were never combined. I applied the reliability patch **unchanged** onto PR #1's `app/index.html`. It applied with no rejected hunks, and both suites (30 and 35) still passed (35 passed at that point; `S1.8` only began failing once patch 02 landed). Result in commit `d22f834`. No conflict between PR #1 and PR #3 was found, so nothing was rewritten.
* The candidate gets its own service-worker cache name (patch 05), so installed copies always see a changed `sw.js` and an update prompt.

---

## 3. Step 2 — what was integrated

Branch commits, in order:

| Commit | Purpose |
|---|---|
| `6c9a502` | branch base (reliability branch tip) |
| `d22f834` | PR #1 candidate + PR #3 reliability patch, applied unchanged |
| `f349540` | **tests first** for items 4 and 5 and the restore-message edge case: 18 of 32 fail on the candidate (evidence: `integration/results/integration_suite_BEFORE_fix_on_candidate_plus_reliability.json`) |
| `2ce3843` | implementation: 32 of 32 pass |
| `3ecc95f` | gym-workflow suite |
| `407fc14` | removes a stray `index.html.orig` that `patch` left behind; `build.sh` now uses `--no-backup-if-mismatch` |
| (this commit) | identity/run-all scripts, results, this report |

| # | Requested repair | Where | How verified |
|---|---|---|---|
| 1 | Session-status correction with legacy compatibility (`draft`/`complete`; legacy `completed` read, never written) | patch 01 (PR #3, unchanged) | reliability `S1.*`; backup suite; gym G5.2–G5.7 |
| 2 | Evidence engine: incompatible set comparisons | patch 01 (PR #3, unchanged) | reliability `S2.*`, `E*` |
| 3 | Readiness joint-warning override | patch 01 (PR #3, unchanged) | reliability `R1.*`; integration R-series |
| 4 | **Training Budget classification** (exact-match templates instead of substring) | patch 02, `budgetData()` at `integration/app/index.html:1437` | tests B1–B12 written first, 7 failed before the fix (B3, B4, B6–B10) |
| 5 | **Stale-readiness detection** (`READINESS_STALE_HOURS=48`, `readinessFreshness`, `readinessStatus`) | patch 03, `index.html:1419–1435`; used by Home, Readiness page and Coach Handoff | tests R1–R15 written first, 10 failed before the fix (R2–R10, R15) |
| 6 | Backup/restore repairs incl. edge cases | PR #1 (unchanged) + `constructor`-named exercise (in PR #3) + **honest restore-failure message** (patch 04, `replacePAData`/`restoreBackup`, `index.html:1287–1303`) | backup 30; integration K1–K5 (forced setItem failures); gym G7–G8 |

What the new behaviour is, in plain terms:

* **Budget.** Only Giant A (`a`, `b2a`–`b7a`) counts as Strength; the B family counts as Hypertrophy; `athletic` counts as Explosive + Capability; `conditioning` and `mobility` count as engine work. `athletic` and `mobility` no longer also count as Strength/Hypertrophy.
* **Stale readiness.** A check-in older than 48 h (or dated in the future, or never made) is shown as `STALE CHECK-IN` / `NOT CHECKED IN`, with its age, and **no traffic-light colour or score is presented as current**. If the stale check-in carried a joint flag of 1 or 2, the joint warning is still shown, labelled with its age, until the athlete updates the check-in. Stored readiness data is never modified.
* **Restore failure.** If a restore fails and the automatic rollback also fails, the message now says so and tells the user to use DOWNLOAD PRE-RESTORE SNAPSHOT, instead of the earlier "original data was retained".

Patches are separate and ordered (`integration/patches/01…05`); `integration/build.sh` rebuilds the candidate from untouched `app/` and proves it is byte-identical to `integration/app/` (last run: **OK**). Candidate SHA-256: `index.html` `24c43b06…f736bd`, `sw.js` `ef45a887…dd6caf`.

Not changed (as instructed): evidence thresholds, exercise prescriptions, training volume, intensifier methods, progression logic.

---

## 4. Step 3 — gym workflow verification (synthetic data, real UI events)

`tests/gym-workflow.test.js` drives the real app with real mouse clicks, real typing, a real file input, real downloads and the real browser storage quota. **56 tests, 56 pass** on the candidate. The same suite on PR #1's `app/` gives 52/56: the four failures are exactly the Budget, the cache name and the update path, which is evidence the suite discriminates.

| Area requested | Tests | Result |
|---|---|---|
| Workout selection and display (Home, Train, 29 templates, warm-up/cool-down) | G1.1, G1.6–G1.8 | pass |
| Exercise order and prescriptions vs baseline ground truth (Giant A; Giant B rotation cycles 0, 1, 2) | G1.2–G1.5 | pass (slot order, default exercise, set count, final-set method all equal to `effective_prescription.json`) |
| Straight-set logging, validation, undo, bodyweight, whole-workout | G2.1–G2.5 | pass |
| Myo-Reps, DC Rest-Pause, Rest-Pause, FST-7, lengthened partials, mechanical drop set, Widowmaker, BFR, cluster sets, heavy primer, loaded stretch holds, activator, cardio | G3.1–G3.15 | pass. Incomplete structured blocks (1 Myo effort, gaps, 2 of 3 DC efforts, 5 of 7 FST-7 sets) are refused and write nothing. |
| Draft persistence and interrupted-session recovery | G4.1–G4.6 | pass (same session id after reload; typed-but-unlogged values, chosen exercise, Myo effort rows, timer all return; no duplicate drafts; two drafts coexist) |
| Session completion and correct history records | G5.1–G5.4 | pass |
| Summaries and budget | G5.5–G5.6 | pass |
| Refresh and reopen persistence | G5.7 | pass |
| Backup export/import round trip | G7.1 | pass (clean profile; every stored value identical; draft resumes with its typed input) |
| Malformed import rejection | G7.2, G7.3 | pass (16 hostile/malformed files and a file tampered after preview: restore never offered or refused; storage unchanged) |
| Storage-failure handling (real quota) | G8.1–G8.3 | pass (clear message, no partial record, set not shown as done, recovers after space is freed; failed finish stays a draft; oversized restore refused with all data unchanged) |
| PWA offline and cache updates | G9.1–G9.4 | pass (SW installs and controls; app starts, logs and finishes a workout offline; **old install → new version** shows an update prompt, does not replace itself mid-workout, keeps the draft, deletes the old cache; verified for updating from both PR #1's build and the **original baseline**; every pre-cached file exists) |

Test-development note (honest accounting): the first run was 41 of 55. All 14 failures were test mistakes, not app defects: seeding sessions without reloading (in-memory list), using a Giant A slot whose second set is a Myo-Reps final set, clicking `EXIT` and expecting Home (it lands on Train), a pre-filled loaded-stretch hold time, the update button living on Home, and comparing storage that legitimately moves a draft's `updatedAt` when you navigate. Each was corrected in the test; none required a change to the app.

### Can the athlete tell recorded, skipped, incomplete and completed work apart?

| State | Answer | Evidence |
|---|---|---|
| **Recorded** | Yes while training: ✓ vs ○ per set; structured blocks show "UPDATE FINAL BLOCK" after save; an incomplete structured block is refused with a message. | G6.1, G3.1–G3.10 |
| **Incomplete** | Only as a *draft*. An unfinished workout appears under "Unfinished workouts" with RESUME and never counts as an exposure. | G6.4 |
| **Completed** | Yes, but **a workout finished with one logged set out of about 20 is counted exactly like a full workout** in Training Budget, Coach Handoff and Home. The set count is stored but never shown. | G6.2 |
| **Skipped** | **No.** Skipped exercises and sets leave no record and no label anywhere after finishing; there is no per-session history screen. | G6.3 |

This is current behaviour of the baseline and is characterised, not changed. The characterisation tests pass while the gap exists; they will fail (intentionally) the day someone fixes it, which is the signal to update this report.

---

## 5. Step 4 — full regression results

Command: `integration/scripts/run_all.sh` (≈4 minutes; needs Node 22 and Chrome). Raw JSON is in `integration/results/`; summary in `SUMMARY_candidate.json`.

| Suite | Tree | Passed | Failed | Total | Notes |
|---|---|---|---|---|---|
| Backup/restore (`tests/regression.test.js`) | candidate | **30** | 0 | 30 | the reported 30 |
| Reliability (`tests/reliability.test.js`) | candidate | **34** | **1** | 35 | failure is `S1.8`, see below |
| Integration (`tests/integration.test.js`) | candidate | **32** | 0 | 32 | new |
| Gym workflow (`tests/gym-workflow.test.js`) | candidate | **56** | 0 | 56 | new |
| **Total, raw** | | **152** | **1** | **153** | |
| **Total, excluding superseded `S1.8`** | | **153** | 0 | 153 | |

**`S1.8` (reliability) — a deliberate, reported exception.** It is titled "KNOWN LIMITATION (not changed in this phase)" and passes only if `athletic`/`mobility` are *wrongly* counted as Strength/Hypertrophy. Item 4 fixes exactly that, so the test now fails with `mobility counted as Hypertrophy (known) | 0 !== 1`. I did **not** edit the original suite; the replacement assertions are integration tests B1–B12. Reproduce: `node tests/reliability.test.js integration/app --only S1.8`.

Context runs (failures here are expected and show what each layer fixes): backup suite on the original baseline 9/30; reliability suite on PR #1 alone 16/35; integration suite on PR #1 alone 9/32; integration suite before the fix, on candidate + reliability, 14/32 (B3, B4, B6–B10, R2–R10, R15, K1 failing).

**Prescription identity** (`integration/scripts/verify_program_identity.sh`, result in `integration/results/program_identity_verification.txt`):

* 32 program-definition structures extracted from the original baseline and the candidate: **byte-identical** (all 32 files).
* Effective prescription for every template, slot and Giant B rotation cycle: **130 rows, byte-identical**, and identical to the committed `audit/data/effective_prescription.json`.
* Differences from the baseline package outside `index.html`: **one file, `sw.js`, one line (the cache name)**. `install.js`, `manifest.webmanifest`, icons, `_headers`, README and changelogs are identical.

---

## 6. Deliverables 4 and 5 — files changed, and what is untouched

Compared with the branch base `6c9a502`, this branch is **purely additive (no existing file modified or deleted; 26 files at the implementation commit, plus the scripts, results and this report)**:

* `integration/app/**` — the candidate (15 files; only `index.html` and `sw.js` differ from `app/`)
* `integration/patches/01…05-*.patch`, `integration/build.sh`
* `integration/scripts/verify_program_identity.sh`, `integration/scripts/run_all.sh`
* `integration/results/*` — raw results and the "before" evidence
* `integration/INTEGRATION_REPORT.md` — this file
* `tests/integration.test.js`, `tests/gym-workflow.test.js`

**Confirmed untouched** (`git diff 6c9a502..HEAD` is empty for these; SHA-256 re-checked after the final run):

| Path | SHA-256 / status |
|---|---|
| `baseline/hq-2.3/index.html` | `93fc2f462bd2b78b999935765f5eea5d3a021a5e031c9414ebb961285c1455ec` unchanged |
| `app/index.html` (PR #1 candidate) | `5a6fd882a9428cbbec2126d3a75a4515a8a891f0518235b991310a77d495a847` unchanged |
| `reliability/*`, `audit/*`, `docs/*`, `tests/regression.test.js`, `tests/reliability.test.js`, `tests/lib/*`, `tests/fixtures.js` | no diff |
| `design/*` (PR #4) | not on this branch; PR #4 is not implemented |

Workout prescriptions, volume, intensifier methods, progression logic and evidence thresholds: unchanged (identity checks above).

---

## 7. Step 5 — prioritised findings

### 7.1 Confirmed defects (reproduced)

| # | Sev. | Finding | Reproduction | Decision needed |
|---|---|---|---|---|
| D1 | **Medium** | **The app can export a backup that its own import refuses.** The import validator rejects any `<` or `>` in `pa_hist`, `pa_ls_hist`, `pa_cardio_hist`, `pa_strength_hist`, `pa_activator_hist` strings (`index.html:1240`; `clusterSplit` is exempt). The cardio screen's free-text field accepts them (the `pace` field is the only one with a text keyboard; the others use a decimal keypad), and the draft session store has no such rule. Result: typing "<10:00" saves normally, and later `validateBackup(backupPayload())` fails with "Invalid text in pa_cardio_hist". | `node tests/gym-workflow.test.js integration/app --only G7.4` (characterisation test, passes while the defect exists) | Choose: (a) refuse/strip `<>` at cardio input time, or (b) allow them on import and rely on the app's output escaping (needs a render-path audit first). I changed nothing; this is a security-vs-usability trade-off, and you said not to silently rewrite. |
| D2 | Medium | Partial and full workouts are indistinguishable once finished (1 set of ~20 counts as a full session in Budget, Handoff, Home). | G6.2 | Product decision. Phase 2. |
| D3 | Medium | Skipped work leaves no trace; there is no per-session history view. | G6.3 | Product decision. Phase 2. |
| D4 | Low-Med | Seven templates are in no Budget category: `c`, `bodycontrol`, `athletepractice`, `combatintro`, `waterpractice`, `carrypractice`, `practicalskills`. Completing one adds nothing to any Budget category. | scripted run of `budgetData()` per template | Which categories should they map to (a coaching decision). |
| D5 | Low | A RED readiness label still prints the numeric score; the joint-override explanation is correct but the number can read as more precise than it is. | `readinessStatus` / Readiness page | Wording decision. |
| D6 | Info | Reliability `S1.8` fails on the candidate by design (section 5). | — | Accept, or rewrite the test with approval. |
| D7 | Info | Progression "NEXT" text defects A–I (unused `range` argument, back-off load as target, ratchet-down to an easy session, etc.) remain. Not implemented. | `reliability/progression_investigation_baseline.json` | See 7.6. |

### 7.2 Unverified concerns

1. **48-hour stale threshold** (`READINESS_STALE_HOURS`) is my choice, not evidence-derived. Needs your confirmation; it is a single constant.
2. **Real user data.** No real data was available or used. Real histories may contain keys, shapes or characters the synthetic fixtures do not (see 7.4).
3. **Interaction of stale-readiness with the evidence engine and the compact/rotation logic**: tested only where the code reads the new helper (Home, Readiness page, Coach Handoff). `readinessDecision` has a single caller (`readinessStatus`); I did not audit every other consumer of raw readiness values (for example the evidence engine's inputs), so a real week of use is the real test.
4. **Cardio `<`/`>` rule on a phone keypad**: untested on a real keyboard; D1 may be rarer on a phone than on a desktop.
5. **Clinical content** (knee/elbow questions, `reliability/CLINICAL_QUESTIONS_AND_INTERIM_SAFEGUARDS.md`) is still waiting on your clinician; nothing in the app changed for it.

### 7.3 Mobile / PWA risks (none verifiable in headless Chrome)

1. **iOS Safari / installed web app was not tested at all.** Storage eviction rules, the 5–10 MB localStorage ceiling, and backgrounding behaviour differ from desktop Chrome.
2. **Export and restore file handling on iOS** (Blob download, file picker from Files/iCloud) is the least certain path; it is also the data-safety net. Test first.
3. **Service-worker update path on a real installed PWA.** Update works in headless Chrome, but iOS typically needs the app fully closed before the waiting worker can activate. The update button is on Home only (by design; G9.3 asserts it is not on the workout screen).
4. **HTTPS requirement.** The service worker only runs on HTTPS or `localhost`. Testing on a phone needs a staging HTTPS origin. A new origin has separate storage, which protects real data, but creating one is a deployment-like action that I did not take (decision for you).
5. **Rest-timer behaviour when the phone sleeps or the app is backgrounded** (timer end time is saved, G4.5; the alert/notification behaviour is not).
6. **`_headers`** is Netlify-specific; host-specific caching behaviour is unverified.
7. **Cache-name bump**: the candidate's cache name is new. Upgrading a real installed copy is the exact scenario to rehearse on a device (G9.3 covers it in Chrome only).

### 7.4 Historical-data compatibility risks

1. Legacy sessions with `status: "completed"` are read correctly (reliability tests) and never written; rewriting is not done on load.
2. Legacy history records without `sessionId`, `efforts`, `structured`, `finalSet` or `strengthMethod`: covered by synthetic fixtures; real mixes untested.
3. **Whitelist risk.** Import accepts only the `pa_` keys in `BACKUP_KEY` (`index.html:1156`). A real install with an older or unlisted `pa_` key would export a backup that import rejects. The G7.1 round trip covers every key the current workflow writes; it cannot cover keys written by earlier app versions. **Recommended before anyone trusts restore with real data:** export from the production install and import that file into a disposable profile (a read-only dry run).
4. Evidence/readiness values saved before the readiness freshness field existed are handled (missing date shows `NOT CHECKED IN`); real data may differ.
5. Draft sessions created by the old build persist across the upgrade (G9.3 verifies a draft survives the update).

### 7.5 Issues safe to defer until after deployment

Per-session history and partial-vs-full labelling (D2, D3); Budget categories for practice templates (D4) if you accept them uncounted at first; RED numeric label wording (D5); `S1.8` rewrite; progression display text (7.6); TCS (PR #4); loaded-stretch and cardio detail screens; any exercise-data cleanup such as the 5 lb increment on lateral raises.

### 7.6 Review of the progression design proposal (not implemented)

I read `reliability/PROGRESSION_DESIGN_PROPOSAL.md` against the integrated candidate.

* **Defect is real and independent of this integration.** The `range` argument is unused; the target for top-set methods is taken from the back-off set. Reproduced scenarios A–I still apply to the candidate unchanged.
* **The proposal is correctly scoped** as display text only. I agree with the "never automatic load reduction" and "label, don't compute" choices.
* **Two interactions the proposal does not yet address**, both found during this integration:
  1. *Partial sessions (D2).* A session with one logged set is a valid "most recent comparable session". The reference-set rule should require comparable work sets only, and probably ignore sessions with fewer than the prescribed work sets, otherwise a rushed day can lower the next target.
  2. *Stale readiness.* "Add load" cues should not be shown on a day when the readiness is stale or red/joint-flagged. Use the same `readinessStatus` helper so the two stay consistent.
* **Heuristics** (top-of-range ⇒ add load, RIR ≥ 4 guard, 21-day staleness label) are conventional, not trial-validated; the proposal says so. Keep them conservative and make "Add load" suppressible for flagged joints.
* **Recommendation:** approve only after D2/D3 are decided, because they change what "comparable" means. Tests A–I first, with `effective_prescription.json` identity as a gate.

---

## 8. Known risks and unresolved decisions (consolidated)

1. D1 `<`/`>` rule: sanitise input, relax import, or both?
2. 48-hour stale threshold: confirm or change.
3. Budget category for the seven uncounted templates.
4. Whether to show partial/skipped state (D2/D3) before or after deployment.
5. How to run real-device testing without deploying production: staging HTTPS origin or not?
6. Whether to keep `S1.8` as-is, delete it, or replace it with B-series references.
7. RED label wording.
8. TCS rotation rules remain design-only; **Full Session remains the unchanged default**.
9. Clinical answers pending (knee/elbow).

---

## 9. Explicit GO / NO-GO

| Decision | Assessment |
|---|---|
| **Beginning real-device testing** | **CONDITIONAL GO** |
| Deploying to production | **NO-GO** (until real-device results and the section 8 decisions) |

Why conditional GO: every automated check that can be done without a phone passes; the app's data paths (log, draft, recover, finish, export, malformed import, quota failure, offline, cache update) behave correctly on synthetic data; prescriptions are byte-identical; the only confirmed defect that touches data safety (D1) needs a deliberate, unusual input and is easy to avoid during testing.

Conditions:

1. Use a **separate origin/profile** from real data, with synthetic or disposable data only. Do not import production data into the device build until step 3.
2. First device test: **export → delete app data → import** on the actual phone and browser/PWA you will use (iOS Safari and installed PWA if applicable). This is the least-verified path and the data-safety net.
3. Do the read-only dry run of a *real* production backup into a disposable profile (7.4.3).
4. Avoid `<` and `>` in the cardio pace field until D1 is decided.
5. Rehearse the service-worker update from the currently installed version to the candidate on the device.

Nothing in the device test should be treated as a pass based on this report; headless Chrome results here do not establish phone compatibility.

---

## 10. Recommended Phase 2 (for your approval; nothing started)

1. Decide D1 and implement the chosen fix test-first; add the restore dry-run for real production data.
2. Real-device test plan and checklist: iOS Safari, installed PWA, Android Chrome; timers while backgrounded; export/import via the Files app; offline start; update rehearsal.
3. Session history view and partial/skipped labelling (D2, D3), display only, no change to prescriptions.
4. Budget categories for the practice templates (D4) once you choose them.
5. Progression display text (7.6), after D2/D3 are decided, test-first with identity gate.
6. Clinician answers, then the restrict-only safeguards.
7. Time-Constrained Session implementation only after the above, starting with the design's smallest sequence; Full Session stays the default.
8. Optional: a `?` help line explaining stale check-ins and the Budget, once wording is approved.

---

## 11. Reproduce everything

```
integration/build.sh                          # patches 01-05 applied to app/ reproduce integration/app byte-for-byte
integration/scripts/verify_program_identity.sh # baseline vs candidate program data
integration/scripts/run_all.sh                # all suites; writes integration/results/*
node tests/gym-workflow.test.js integration/app --old-app app             # G9.3 from the PR #1 install
node tests/gym-workflow.test.js integration/app --old-app baseline/hq-2.3 --only G9.3   # from the original install
```
