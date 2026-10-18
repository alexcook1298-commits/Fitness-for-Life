# Project America HQ 2.3 — Backup/Restore Repair Candidate (Sprint 1)

**Recommendation: READY FOR INDEPENDENT QA.** This is not a release recommendation; see the limitations below. Nothing has been deployed.

## 1. Baseline preservation

| Item | SHA-256 |
|---|---|
| `Project_America_HQ_2_3.zip` (authoritative baseline, untouched) | `b42ac938d99e7d6f74a14a2108606386a4a3999ddab01a7a76534eadd72394f4` |
| `Project_America_Backup_Repair_Candidate.zip` (reference only, not applied) | `05a5cbf95ad61be0d31da783400c59b37e5244a7ea95d192d8d1e6f0b7dfb34f` |
| Baseline `index.html` | `93fc2f462bd2b78b999935765f5eea5d3a021a5e031c9414ebb961285c1455ec` |
| Baseline `sw.js` | `da225cdbb03a5eb7aa34060fbcb1369e2d6749b7436cc97ebdace81fe1e2a8f4` |

- `baseline/hq-2.3/` is the read-only extraction. Per-file hashes are in `baseline/BASELINE_SHA256.txt`, and they were re-verified intact after all work.
- Git history: the baseline commit `b46bf7a` holds `app/` byte-identical to the baseline. The reproduction tests were committed (`49f1b6a`) before any fix, and the repair is in `a08483a`.
- No dependencies were installed and nothing was deployed or published. Only synthetic data in disposable browser profiles was used; no production data was touched.

## 2. Exact files modified

Only two application files changed. The other 14 files in the app ZIP are byte-identical to the baseline.

| File | Change | New SHA-256 |
|---|---|---|
| `index.html` | Lines 1091, 1114, 1117 (legacy `clusters`); backup/restore block lines 1155–1303 (baseline 1155–1213); OS render lines 1438, 1440, 1444, 1454, 1457, 1477 | `5a6fd882a9428cbbec2126d3a75a4515a8a891f0518235b991310a77d495a847` |
| `sw.js` | Line 1: cache name `project-america-shell-v2-3-training-20261006` → `project-america-shell-v2-3-backup-repair-20261018` | `190256e0b7872605929d493772bbbb477155df160fb999f35217609a9da63667` |

The full unified diff is in `docs/backup-restore-repair.patch`; running `patch -p1` against the baseline reproduces the candidate exactly. No workout templates, slots, defaults, progression logic, methods, CSS or visible version labels were changed.

## 3. Defects and fixes

| # | Defect (reproduced on baseline) | Fix |
|---|---|---|
| 1 | `pa_os_v2` is exported, but restore rejects it ("Unrecognized … pa_os_v2"), so every backup from an OS user is unrestorable. | `pa_os_v2` is allowed and validated by a new `validateOSState`. The validator is strict about structure, rejecting unknown fields, enum violations, out-of-range numbers, `__proto__`/`constructor`/`prototype` keys, keys or text containing control characters, nesting deeper than 12 levels, non-finite numbers, and text over 100,000 characters per field. `readiness`, `tests` and `skill` are required because the screens read them unconditionally; `fuel`, `notes` and the 2.1 fields are optional, so older OS states still restore. This replaces the reference candidate's rule that required `fuel` and `notes`. |
| 2 | `pa_strength_hist` matches the `pa_strength_*` preference rule, so any heavy-primer history fails with "Unknown strength method". | A new `isStrengthPreference()` excludes `pa_strength_hist`. Preference keys are still checked against `STRENGTH_METHODS`, and the history list still gets full record validation. |
| 3 | A cluster-split note containing `<` or `>` (for example `3+3 <20s>`) makes the whole backup unrestorable. | The `<`/`>` ban is lifted only for the top-level `clusterSplit` field of `pa_hist` records, which must be a string of under 2,000 characters with no control characters. That note is only ever rendered escaped. Every other history text field, including exercise names, keeps the ban. |
| 4 | There is a single snapshot key, so a second restore overwrites the original data. A failed restore still overwrites the previous snapshot. Downloaded snapshots contain `pa_os_v2`/`pa_strength_hist`, so they cannot be re-imported. Quota failures give a raw browser error. | Two generations are kept (`pa_restore_rollback` holds the newest, `pa_restore_rollback_2` the older). The older one is dropped only when both cannot fit. If even one snapshot cannot be stored, restore is refused before any change, with a plain-language error. A failure partway through writing rolls back both the data and the snapshot keys. Snapshots are stored as full backup files, so they are restorable through the normal import. Snapshots written by HQ 2.3 in the old bare-map format are still readable. The Backup page shows snapshot dates and offers an "older snapshot" download button when one exists. |
| 5 | Validation requires `clusters` on every session, so legacy drafts are rejected. Resuming such a draft crashes when Myo/DC/RP stages render (`TypeError … reading 'lift:3:…'`). | `clusters` is optional in validation; if present it must still be an object with counts from 2 to 20. Reads use `?.`, and `addMiniSet` creates the field only when the user adds a mini-set. No migration writes to stored data. |
| 6 | OS text reaches `innerHTML` unescaped: the 40-yard value on Home (this runs on every load), all six test values and bodyweight on Athlete, all seven Combine fields including the textarea, the experiment status in Lab, availability in Schedule, and the mode badge. | `esc()` is applied at all 8 affected interpolation sites. Together they cover the mode badge, bodyweight, all six test values (on Home and Athlete), all seven Combine fields, the experiment status and the daily availability values. An audit of every remaining `${…}` in the OS section found only constants, numbers, already-escaped values, or plain text (the Coach summary is escaped as a whole). |

Supporting changes needed so that exported backups can be restored:

- Export, snapshots and restore operate only on keys this version can validate (`BACKUP_KEY`). Any other localStorage key, including unknown `pa_*` keys, is left untouched by restore instead of being exported into a file that restore would then reject.
- Export and snapshot downloads still always deliver the file, but now show a warning if this version could not restore it (for example, a preference that names an exercise no longer in the catalog).
- Clearer errors: "This file is not valid JSON…", "Backup entry X is not valid JSON.", and the storage-full messages.

## 4. Test results

The suite is `tests/regression.test.js` (30 tests, one of which runs 41 malicious-payload cases). It drives the real app in the locally installed headless Chrome 154 over the DevTools protocol, using Node 22 built-ins only. Each test uses a fresh browser profile with isolated localStorage and service worker. Clicks are real mouse events, files go through the real file input, and downloads are the real downloaded files. Storage-failure tests hit Chrome's real ~5.24M-character localStorage quota; nothing is mocked.

```
node tests/regression.test.js app                 # repaired: 30 passed, 0 failed (two consecutive full runs)
node tests/regression.test.js baseline/hq-2.3     # baseline:  9 passed, 21 failed
```

Raw output and JSON are in `docs/test-results/`. Totals: repaired 30/30; baseline 9 passed, 21 failed; reference candidate 8 passed, 22 failed.

| Area | Tests | Baseline HQ 2.3 | Reference candidate | Repaired |
|---|---|---|---|---|
| 1 `pa_os_v2` | D1.1–D1.2 | FAIL | FAIL (hits defect 2) | PASS |
| 2 `pa_strength_hist` | D2.1 (real UI primer), D2.2–D2.3 (validation kept) | FAIL / PASS / PASS | FAIL / PASS / PASS | PASS |
| 3 cluster notes | D3.1 (real UI logging), D3.2–D3.4 (escaping and rejection kept) | FAIL / PASS ×3 | FAIL / PASS ×3 | PASS |
| 4 rollback | D4.1–D4.6 (incl. real-quota failures and HQ 2.3-format snapshots) | FAIL ×6 | FAIL ×6 | PASS |
| 5 legacy drafts | D5.1–D5.2 (real UI resume), D5.3 | FAIL / FAIL / PASS | FAIL / FAIL / PASS | PASS |
| 6 OS escaping | D6.1 (Home + all 15 OS screens), D6.2 (import → restore → render) | FAIL / FAIL | FAIL / FAIL | PASS |
| Normal data | N1–N8: full dataset round-trip, specialized methods, OS shapes, unfinished sessions, unknown keys, export warning, offline reload, no external requests | 1 of 8 pass | 1 of 8 pass | PASS |
| Malicious imports | M (41 cases), M37 (tampered after preview) | PASS | FAIL (accepts control-character key names; also accepts a 200k-character field, which is a policy difference from this repair's 100k limit) | PASS |

What the passing tests establish on the repaired app:

- Every rejected import leaves localStorage byte-identical.
- The full realistic dataset (every key the app writes, including OS, primer, activator, Myo/DC efforts, a draft and a completed session, and preferences) round-trips byte-identically.
- Non-Project-America keys and unknown `pa_*` keys survive restore.
- No page errors and no external requests occurred.

Seven screenshots of the real UI (mobile viewport) were captured as review evidence.

## 5. Comparison with the baseline (behavior)

- **Unchanged:** all workout programming, templates, progression, method defaults, logging, UI layout and styling, the import validation rules not listed above, the 15 MB file and 10M-character entry limits, and the PWA identity.
- **Intentionally changed:**
  - Restore is refused when no rollback snapshot fits. Previously, a failed snapshot write also failed the restore, but with a raw error.
  - Unknown `pa_*` keys are no longer exported (previously they were exported and made the file unrestorable) and are preserved on restore.
  - There is a new 100,000-character limit per OS text field.
  - Backup page: one conditional button, one line of snapshot status text, and one sentence of preview wording.
  - Service worker cache name.

## 6. Remaining limitations

- **No real-device verification.** Testing used headless Chrome on Linux only, with a mobile viewport emulated for screenshots. Safari/iOS (WebKit quota and storage behavior, home-screen PWA), Android Chrome and Firefox were not tested. This matters if the athlete uses an iPhone home-screen install.
- Quota sizes in D4.3–D4.5 are calibrated to Chrome's ~5.24M characters; other browsers' quotas differ, although the logic does not depend on the exact figure.
- A user whose data is too large to keep any snapshot cannot restore on that device until space is freed. This is a deliberate safety choice.
- Legacy sessions are tolerated only for a missing `clusters` field; sessions missing `forms`, `checks`, `choices` or `modes` are still rejected, as on the baseline.
- `pa_phase_entered` and `pa_current_session` values are still only type- and size-checked (unchanged; neither is rendered).
- The Progress page still renders exercise names unescaped (unchanged). This is safe only because import still bans `<`/`>` in those names and local names come from the catalog.
- Very long unbroken text in OS fields can widen the page layout. This is cosmetic, unchanged from the baseline, and has no security effect.
- Visible version labels and `appVersion` remain "2.3". Assign a repair version at release time if wanted.
- Before deploying, verify the existing save-before-update path with the new cache name on a real installed PWA. Users should export a real backup before any real restore.

## 7. Rollback instructions

The candidate has not been deployed, so the live app needs no rollback. If it is later deployed and must be reverted:

1. Redeploy the untouched baseline from `Project_America_HQ_2_3.zip` (SHA-256 above), or `baseline/hq-2.3/`. Both `index.html` and `sw.js` must be restored together.
2. Because the cache name changes, redeploying the baseline `sw.js` makes installed PWAs fetch the baseline shell through the normal update prompt. For a forced revert, use a third cache name with the baseline `index.html` so clients do not keep the repair cache.
3. User data needs no migration in either direction; the repair never rewrites stored data. The only new key, `pa_restore_rollback_2`, is ignored by HQ 2.3. Note that HQ 2.3 treats it as ordinary data, exports it and then rejects that export, so before reverting a user can download it from the Backup page, or clear it, if export matters.
4. In source control: `git revert a08483a`, or check out `b46bf7a`.

## 8. Deliverables

- `deliverables/Project_America_HQ_2_3_Backup_Repair_Candidate.zip`: revised application source, same 16-entry layout as the baseline ZIP.
- `deliverables/Project_America_Backup_Repair_QA_Kit.zip`: this report, the patch, the test suite, test results and baseline hashes.
- `docs/backup-restore-repair.patch`, `docs/test-results/`, `tests/`.
