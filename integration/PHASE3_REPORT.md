# Project America HQ 2.3: Phase 3, Training Accuracy & Device Readiness

Branch `cursor/phase3-training-accuracy-75d6`, stacked on the Phase 2 candidate (PR #6, `cursor/phase2-data-integrity-75d6`). Nothing is merged, deployed or run against real data.
Original baseline (`baseline/hq-2.3/index.html` SHA-256 `93fc2f46…1455ec`) and PR #1's `app/` (`5a6fd882…a847`) are unmodified. All Phase 3 code lives in numbered patches 11-15 over `app/`; `integration/build.sh` proves they reproduce `integration/app` byte for byte (candidate `index.html` `085864e1…112bac`, `sw.js` `00fd93f2…6587`).

## 1. Verdict

| Question | Answer |
|---|---|
| Release / deployment | **NO-GO** |
| Isolated real-device testing on a disposable origin | **GO**, once you approve the test hosting. Real-device testing has **not** been done: there is no iPhone here. |
| Existing tests | 216 of 216 pass; Phase 3 adds 53, all pass |
| 130 prescription rows / 32 structures | identical to the original |

## 2. Commits (oldest first)

| Commit | What |
|---|---|
| `92bea8a` | Tests first: rotation (RT1-RT19); 11 fail on behaviour |
| `7acf20d` | Rotation credited by performed method (patch 11) |
| `86769c4` | Tests first: explicit skip (SK1-SK11); all 11 fail |
| `7fc04e4` | Explicit exercise skip (patch 12) |
| `6c00990` | Tests first: budget logged exposure (BX1-BX8); 7 fail |
| `9af3931` | Training Budget logged-exposure reporting (patch 13) |
| `9fae7d8` | Tests first: tag-like cardio text (HB1-HB9); 4 fail, 5 guard tests |
| `991ec10` | Cardio text that only resembles a tag is accepted as plain text (patch 14) |
| `8a7439f` | Evidence audit E1-E10 and EV1-EV6 guard tests, no engine change |
| `81b5f98` | Evidence audit and design-only proposals D1-D4 |
| `f039cc7` | Service-worker cache name (patch 15) |
| `4dc9bfe` | Device test bundle, seed generator, server, rehearsal, iPhone checklist |
| `2a04065` | Phase 3 compatibility probe and `run_all.sh` additions |
| `152bea9` | Program-identity check forces the Giant B cycle through history (see 8) |

## 3. Test-first evidence

Tests were committed before each implementation and run against the unchanged Phase 2 code (`integration/results/phase3_*_BEFORE_fix.json`), then again after (`*_AFTER_fix.json`).

| Group | Before the fix | After the fix | Failing before (behaviour, not missing function) |
|---|---|---|---|
| RT rotation | 8 of 19 | **19 of 19** | RT2, 4, 5, 7, 8, 9, 10, 11, 13, 16, 17: skipped, partial, duplicate, interrupted, busy/compact, lapse, manual, snapshot, read-only, validator |
| SK skip | 0 of 11 | **11 of 11** | all |
| BX budget | 1 of 8 | **8 of 8** | BX1, 3-8 (BX2 pins the unchanged bars and passed) |
| HB cardio text | 5 of 9 | **9 of 9** | HB1, 2, 3, 6 (the five passing ones pin refusal of real HTML, attributes, comments, other record types) |
| EV evidence | n/a | 6 of 6 | audit first, then characterization guards; no engine change, so there was nothing to fail |

The rotation parity test (RT1) passed before and after: for history with no rotation snapshot, the derived group equals the legacy `completedTemplateCount('b') % 3` for 0-8 completed Giant B.

## 4. Priority results

### P1 Intensifier rotation accuracy (patch 11)
Implements the "Option C" model from PR #4's `TCS_ROTATION_STATE_MODEL.md` with its recommended defaults: credit is **derived at read time** from per-session snapshots plus `pa_hist`; there is no stored counter and no new `pa_` key.
- A new Giant B writes `session.rotation = {v,group,slots,methods,basis[,repeat]}` when it starts. Resuming a draft re-uses it, so displayed methods cannot change mid-workout.
- A group is credited once per session when a presented slot has a **performed** record (`structured` cluster, or the single Widowmaker set). Skipped (no record), partial (a Myo-Reps block with one effort cannot be saved), busy/compact-suppressed, manual out-of-group intensifiers and other templates give **no credit**.
- Draft sessions that performed the intensifier credit it once; resume and finish do not credit again. Duplicated sessions or records credit once.
- Pre-change sessions keep their legacy meaning in sequence (no re-judging, parity preserved). Sessions with no snapshot (an older install's draft) never get one invented.
- Lapse: after two consecutive finished-but-uncredited presentations of a group, it moves to the back, so rotation can never be blocked and the same method is not offered forever. A draft with no records neither credits nor counts toward the lapse.
- Reconciliation with PR #4: R1 `any`, R2 partial earns nothing, R3 pre-era history kept as legacy, R4 lapse after 2, R5 applies to every Giant B, all as recommended there. Deviations (documented, all conservative): pre-era sessions are de-duplicated by id; snapshot methods ignore busy/compact suppression, so busy and compact Giant B sessions are not credited (PR #4 §6 lists compact as "not credited" as well); the ledger orders by start time then array index.
- Needed from you: confirm R1-R5 as the design intends (they were the recommended defaults, not decisions you gave).

### P2 Evidence and progression (design only)
Audit scenarios E1-E10 (`tests/audit/evidence_partial_audit.js`, results in `results/phase3_evidence_audit.json`). Omitted and skipped work never enters a series and never reads as decline (E1, E7, EV1, EV4); structured intensifier blocks are excluded (E8); partial exposures carry the same evidence as full ones when the performed sets are like for like (E2, EV2, EV3); no function raises a load (E10, EV6). **Four limitations found** and left design-only in `PHASE3_EVIDENCE_AUDIT_AND_DESIGN.md` because fixing them changes the evidence engine beyond approved corrections: E3 back-off-only partials can produce a false `ACT`; E5 an evening session straddling UTC midnight counts as two exposures; E6 draft records are counted; E9 target text anchors on the last logged set.

### P3 Explicit skip (patch 12)
One **SKIP** control per displayed exercise of lifting templates; reversible while the session is a draft; refused if the slot already has logged sets; a logged set lifts a skip (records always win). It writes only `session.skips[slot]=true`: no record is created, no set is checked, no intensifier is credited. Completion distinguishes performed / partial / **skipped (explicit)** / skipped (not marked) / not reached; skipping never makes a session full. Finishing with only skips is still refused by the existing "Log some work" rule.

### P4 Training Budget (patch 13)
Bars are unchanged. Giant C stays Capability; the six ambiguous templates stay unclassified and disclosed. New per-bar line reports full / partial / none / not-recorded sessions, with sets logged (lifting) and checklist items ticked (checklist templates) as **separate units, never combined**; the same lines appear in the Coach Handoff. No equivalence between sets, intensifier efforts and workout categories is invented.

### P5 Historical backup compatibility (patch 14)
Cardio text such as `<Z2>` or `<easy>` that only resembles a tag is now accepted as plain text; every rendering path escapes it. Still refused: any complete real element (checked by building it with `createElement`, so `<b>`, `</script>`, `<img …>` are refused), `<!` and `<?` always, any element carrying attributes, comments, processing instructions, doctype, CDATA, control characters, over-long text, bad keys, non-text values; `<`/`>` in every other record type remains refused. Judging text never executes or loads it (HB7). **Not solved:** a legacy cardio record containing a *real* HTML element still blocks a strict restore. **Proposal only**: a user-confirmed restore step that previews each such record and stores its text with `<`/`>` replaced by visible look-alikes, keeping the original in the user's own file and the pre-restore snapshot. It was not implemented because it alters stored values and needs your decision.

### P6 Real-device readiness
`integration/device/`: `build_device_bundle.js` (red TEST label, distinct title, cache name and manifest `name`/`short_name`/`id`; origin guard with allow/forbid lists; `--check` proves the bundle differs from the source only in those places), `make_disposable_backup.js` (synthetic backup driven through the app, includes a partial, an explicit skip, a performed Giant B intensifier, tag-like cardio text and an unfinished draft), `serve_bundle.js` (no-cache headers, hot-swap for the update test, refuses non-test directories), `rehearse.js` (12 desktop-Chrome checks D1-D12, 12 of 12 pass in four consecutive runs), and `DEVICE_TEST_PROCEDURE.md` (hard safety rules, tunnel steps, 41-row manual iPhone checklist, cleanup). **Real-device testing is incomplete: not performed.** The rehearsal proves logic, not iOS WebKit behaviour.

## 5. Exact results (`integration/results/`)

| Suite | Passed | Failed | Total |
|---|---|---|---|
| Backup / restore | 30 | 0 | 30 |
| Reliability | 35 | 0 | 35 |
| Integration | 32 | 0 | 32 |
| Gym workflow | 56 | 0 | 56 |
| Phase 2 (RD, CB, BU, CS) | 63 | 0 | 63 |
| **Existing total** | **216** | **0** | **216** |
| Phase 3 (RT 19, EV 6, SK 11, BX 8, HB 9) | 53 | 0 | 53 |
| Device rehearsal D1-D12 | 12 | 0 | 12 |

Gym G9.3 also passes when updating from the original baseline install. Context failures on earlier trees are expected (backup suite on the original baseline 9 of 30; reliability on PR #1 16 of 35; integration on PR #1 8 of 32). `bash integration/build.sh` reports OK.

Program identity (`results/program_identity_verification.txt`): 32 program structures byte-identical; the effective prescription (130 rows across every template, slot and Giant B cycle) is byte-identical between baseline and candidate and equals the committed `audit/data/effective_prescription.json`.

## 6. Schema and storage changes

| Item | Change |
|---|---|
| New `pa_` keys | none |
| Session `status` values | none |
| Session fields | two additive optional fields: `rotation` (Giant B only), `skips` (draft or finished lifting session when used). `completion` gains the exercise basis value `explicit` for skipped exercises. All three are absent on historical sessions. |
| Cardio import | accepts tag-like text only; validation otherwise unchanged |
| Service worker | cache name `project-america-shell-v2-3-phase3-20261019`; installed copies see the update prompt, never mid-workout |

Compatibility probe (`results/phase3/compat_phase3_probe.json`), each tree's own `validateBackup`:

| Backup content | Baseline | PR #1 | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|---|
| `rotation` + `skips` + `completion` basis `explicit` | accepted | accepted | accepted | **rejected** ("Invalid completion record (exercise status)") | accepted |
| same, with the `explicit` basis replaced | accepted | accepted | accepted | accepted | accepted |
| tag-like cardio text (`<Z2>`) | rejected | rejected | rejected | rejected | accepted |
| Phase 2-shape and pre-Phase-2-shape backups | n/a | n/a | n/a | n/a | accepted |

Malformed `rotation` or `skips` (bad group, wrong template, bad value, unknown slot) are still refused by Phase 3.

## 7. Compatibility and migration risks

1. **Downgrade to Phase 2 is unsafe once an explicit skip exists.** A Phase 3 backup containing a skipped exercise (basis `explicit`) is refused by the Phase 2 validator. Phase 2 has not shipped, so this only bites if Phase 2 is released alone and then rolled forward and back. Keep Phase 2 and 3 in one release, or accept that Phase 3 data is not restorable into Phase 2.
2. **Rotation behaviour changes for some users:** an athlete who finishes a Giant B without performing the presented intensifier now sees that group again (this is the requested correction); after two such presentations it lapses to the back. Busy and compact Giant B sessions no longer advance rotation. An athlete who always performs the presented intensifiers sees no change (RT3).
3. **First Giant B after upgrade:** continues from the legacy counter (parity). History is not re-judged.
4. **The rotation ledger is a read-time derivation.** A restore reproduces it exactly (inputs are in the backup). A restore of old data into the new app, then a new Giant B, behaves as in item 3.
5. **Older installs:** a Giant B draft started on an older version resumes on the new version with no invented snapshot and legacy credit (RT18).
6. **New UI control:** the SKIP button was verified in headless Chrome only. One-handed use and tap-target size at the gym are unverified.
7. **iOS storage separation** (to be confirmed on the phone): the installed Home-Screen app has its own storage, separate from Safari. Any real migration to the installed app must go through backup export/import; the checklist records what the phone actually does (I3).
8. **Evidence engine limitations E3, E5, E6, E9** remain and can produce a false `ACT` or a split exposure (see the design document).
9. **Legacy cardio records with real HTML** still block a strict restore (P5 proposal).
10. **Full Session prescriptions, exercises and volume are not changed.** Giant B displays the same slots; only which group is presented can differ after uncredited sessions.

## 8. Disclosed test and tooling changes made after code existed

- SK7: the test ticked no checklist item and so tripped the existing "Log some work" rule; it now ticks one first.
- SK8: filtered inferred skips as well as explicit ones; it now filters on `basis==='explicit'`.
- SK11: matched the slot label; the screen shows the movement name; regex corrected.
- HB1: `a<b>c` contains a real `<b>`; moved from the lookalike list to the real-HTML list (a correct refusal).
- HB4/CB4/CB5/CB16: the first implementation accepted `<!DOCTYPE html>` and ignored a stray `</script>`; the implementation, not the tests, was changed (unconditional `<!`/`<?` refusal, createElement check).
- EV3, EV4: first drafts had wrong series keys and a wrong assertion; corrected before the first commit of the EV group.
- Gym G9.1/G9.3: cache-name expectation moved to the Phase 3 name (as in Phase 2).
- **Program-identity check.** The original `audit/scripts/effective_prescription.js` forces the Giant B cycle by overriding `completedTemplateCount`; the new rotation intentionally no longer reads that function, so with it the candidate showed 7 of the 130 rows different (the harness could not select cycles 1 and 2). I left that script unchanged and added `integration/scripts/effective_prescription_by_history.js`, which forces the cycle by seeding finished Giant B sessions into history. On the baseline both methods give identical output and match the committed audit data; on the candidate the 130 rows are identical to the baseline. This is a change of verification method, not of prescription, and I want it visible.
- The device rehearsal and bundle tooling were written after the code they exercise (they are tooling, not product behaviour), so there is no "failing first" evidence for them. The guard's first version failed (D3) and was corrected.

## 9. Remaining release blockers

1. **Real-device testing not performed** (iPhone Safari, Home-Screen install, offline, interrupted workout, intensifier logging, backup round trip, update). Run `DEVICE_TEST_PROCEDURE.md` and record the result table.
2. Your decisions: confirm rotation defaults R1-R5; evidence proposals D1-D4; the cardio real-HTML proposal; classification of the six ambiguous templates (still unclassified); and the open Phase 2 decisions U3-U6, D3-D7 in `PHASE2_REPORT.md`.
3. Ordering: PR #6 (Phase 2) and this branch must ship together or in that order (risk 1).
4. Earliest deployment date constraint (October 23, 2026) and your separate approval; nothing here deploys or merges.
5. The Time-Constrained Session mode is **not** implemented and not started.

## 10. Real-device test instructions

See `integration/device/DEVICE_TEST_PROCEDURE.md`. Summary: build two clearly labelled test bundles with `build_device_bundle.js` (add your real host to `--forbid`), generate the synthetic backup, run `rehearse.js`, serve bundle A behind an HTTPS tunnel on a separate origin, work through checklist sections S, I, O, W, X, B, R, U on the phone using only the disposable file, then do the cleanup section. Never import, export, restore or delete against your real installed app.

## 11. GO / NO-GO

- **Release or deployment: NO-GO.** Blockers 1 to 4 above stand.
- **Isolated real-device test of this candidate on a disposable origin: GO**, on your approval of where the tunnel runs.
- Stopped at the verification gate: no merge, no deploy, no real data touched, no Time-Constrained Session code.
