# Project America HQ 2.3 — Phase 2: Data Integrity & Workout Semantics

**Status: DEVELOPMENT CANDIDATE. Not deployed. Not merged. No real user data touched. No new training exercises. No Time-Constrained Session code.**
Deployment remains prohibited until at least **October 23, 2026**, and requires separate approval.
Branch: `cursor/phase2-data-integrity-75d6` (isolated; based on `cursor/integration-candidate-75d6`, PR #5). **STOPPED at the verification gate.**

All testing is synthetic data in disposable headless-Chrome profiles on Linux. It is not evidence of real-device behaviour (section 11).

---

## 1. Verdict

Priorities 1, 2, 3 and 5 are implemented test-first. Priority 4 is **split**, as you instructed: the conflict check with the approved TCS design and the progression proposal found that its rotation and progression parts are significant behaviour changes, so those are **not implemented** and are presented for approval (`integration/PHASE2_COMPLETION_SEMANTICS_DESIGN.md`). The additive, derived, label-only part is implemented.

All five suites pass on the candidate: **216 of 216** (backup 30, reliability 35, integration 32, gym-workflow 56, Phase 2 63). The Full Session prescriptions are byte-identical to the baseline (130 effective-prescription rows, 32 program structures).

## 2. Commits (oldest first, all on this branch)

| Commit | Content |
|---|---|
| `e75a2d8` | P5: S1.8 corrected; original preserved in `tests/historical/`; run-time date anchor in reliability tests |
| `81969aa` | Tests first: RD1-RD20 (14 fail); frozen-clock helper |
| `ffa8f2d` | P2 fix, **patch 06** |
| `0b97374` | Tests first: CB1-CB15 (9 fail) |
| `4e63f48` | P1 fix, **patch 07** |
| `8bc702e` | Tests first: BU1-BU9 (7 fail) |
| `8112257` | P3 fix, **patch 08** |
| `77c6a5d` | Tests first: CS1-CS18 (15 fail; the commit message says 14, the saved result file `CS_BEFORE_fix.json` says 15 and is correct) + P4 design and conflict analysis |
| `24dd770` | P4 additive layer, **patch 09**; G6.2 characterization updated |
| next | Service-worker cache name, **patch 10**; `run_all.sh`; K-test notice race fix; final results; this report |

`integration/build.sh` reapplies patches 01-10 to the untouched `app/` and proves byte-identity with `integration/app` (last run: OK).

## 3. Priority 1 — cardio backup compatibility

**Source-grounded findings**
* Logging accepted any text in a cardio field. The backup validator rejected any `<` or `>` in cardio records, so the app's own export could not be restored (confirmed in Phase 1 as G7.4).
* A second, worse defect: `cardioPrevious` interpolated stored values and keys **unescaped** into `innerHTML`. A stored value such as `<img src=x onerror=...>` executed from the cardio "PREVIOUS" line (test CB6 demonstrates it on the Phase 1 candidate).

**Fix (patch 07)** — field-specific validation shared by logging and import, plus safe rendering
* Cardio field names must match `^[A-Za-z][A-Za-z0-9_]{0,31}$`; `constructor`, `prototype`, `__proto__` are refused. (Shape, not an allow-list, because fixtures use `minutes`/`output`, and an allow-list would reject real history.)
* Values: finite number or string under 2000 characters with no control characters, and **not HTML-like**. HTML-like means a complete tag (`</?letter ...>`) or `<!` or `<?`. Comparison text such as `<10:00`, `>150 bpm`, `a<b` is accepted and preserved exactly.
* `cardioPrevious` now escapes keys and values. Rendering is safe even for stored tag-like text.
* Import and logging give a precise message (`Cardio entry 3, field "notes" looks like HTML...`).
* Lifting `clusterSplit` handling is unchanged. The generic `<`/`>` ban for other record types is unchanged: import was **not** broadly weakened.

**Evidence** `CB_BEFORE_fix.json` 9 of 15 fail → `CB_AFTER_fix.json` 16 of 16 pass (round trip of legitimate `<`/`>`; malicious payloads; malformed files; historical compatibility).

**Residual risk (decision U1)** A historical cardio record that already contains tag-like text (accepted by the old logger) is still refused on restore under the strict rule; the file is not altered and the message names the entry. The restore refusal is a deliberate trade for injection safety. Options: leave, or offer a "restore, escaping this one field" path. Neither was implemented because it would silently alter a record.

## 4. Priority 2 — readiness freshness

**Source-grounded findings** The Phase 1 rule was a provisional 48-hour threshold (`READINESS_STALE_HOURS`). It called a 30-hour-old check-in fresh and a 2-minute-old one from before midnight fresh too.

**Fix (patch 06)** `readinessFreshness(r, now)` — fresh only if the check-in is on the **same local calendar day** as now, in the device's current time zone.
* Date-only strings (`YYYY-MM-DD`) are local days; numbers are epoch ms; missing, empty, invalid, non-text → "never". More than 5 minutes in the future → "future" (not fresh).
* Stale or never: the card says STALE CHECK-IN / NOT CHECKED IN, shows the saved score, and the training recommendation does not use it. A saved joint flag still applies, and only in the restricting direction (decision U3).
* Scoring formula (`readinessScore`, thresholds 76/58) is untouched.
* Midnight: the Home card refreshes on `visibilitychange` and `focus`, and a timer is scheduled for the next local midnight.

**Evidence** `RD_BEFORE_fix.json` 14 of 20 fail → 20 of 20 pass: 23:59:59 fresh, 00:01 stale, every hour of the day, midnight live transition, missing/invalid timestamps, three time zones, legacy shapes, formula unchanged.

**Judgement call (U4)** "Today" is judged in the device's *current* zone. Travelling west after a morning check-in can keep it fresh past local midnight of the origin zone; travelling east can make it stale early. This is the literal reading of "same local calendar day".

**Test-suite fallout fixed** Phase 1 tests that used "N hours ago" became time-of-day dependent under the calendar-day rule; they now use a frozen clock (`tests/lib/clock.js`). Phase 1's `S1.*` reliability tests used a fixed anchor date (2026-10-19), which would silently expire after 2026-10-25 (a time-bomb); they now anchor to run time.

## 5. Priority 3 — Training Budget classification

**Source audit (template title/purpose line, block membership):**

| Template | Source says | Mapping | Status |
|---|---|---|---|
| `c` Giant C | "OPTIONAL • CAPABILITY" (self-labelled), `block 1` | Capability | **Implemented** (unambiguous: it names its own category) |
| `b3c` Expansion C | "BLOCK 3 • OPTIONAL", Hypertrophy under the existing exact-key rule | Hypertrophy (unchanged) | **Inconsistent with `c`** — U5 |
| `bodycontrol` | "RELATIVE STRENGTH • 20–30 MIN" | none | **Not classified**, awaiting approval |
| `athletepractice` | "QUALITY BEFORE FATIGUE • 20–30 MIN" | none | **Not classified** |
| `combatintro` | "COACH-LED SKILL SESSION" | none | **Not classified** |
| `waterpractice` | "INSTRUCTOR / LIFEGUARDED POOL" | none | **Not classified** |
| `carrypractice` | "CARRY + EASY WALK • 20–30 MIN" | none | **Not classified** |
| `practicalskills` | "CERTIFIED / INSTRUCTOR-LED" | none | **Not classified** |

* The baseline classified by **substring**, so every practice template was silently miscounted as Strength or Hypertrophy. They now count in no bar.
* Model: exact template key → at most the six existing categories (Strength, Hypertrophy, Explosive, High-intensity engine, Low-intensity engine, Capability). No category was invented. `budgetData()` still returns exactly those six keys.
* Instead of forcing the six unclassified templates into a bar, they are **disclosed**: the Budget page shows "NOT COUNTED IN ANY BAR" with counts, and Coach Handoff carries the same note, so totals can never imply the bars are the whole week.
* The one assumption I could not check from source: whether `c` should also count Strength (it contains Weighted Vertical Pull and Overhead Press). Left as Capability only (U5).

**Evidence** `BU_BEFORE_fix.json` 7 of 9 fail → 9 of 9 pass. Integration B8 updated.

## 6. Priority 4 — workout completion semantics

Full analysis and the decision table are in `integration/PHASE2_COMPLETION_SEMANTICS_DESIGN.md`.

**Conflict determination**
* TCS: no conflict for the additive field (it is named `completion`, TCS uses `tcs` and `rotation`).
* **Rotation** (do not advance for unperformed intensifier methods): overlaps TCS Step 2 ("rotation snapshot + derived ledger", the design's highest-risk step) and its open credit-policy questions R1/R2. **Not implemented.**
* **Progression/evidence gating**: overlaps the progression proposal. `evidenceDecision` reads every `pa_hist` record, drafts included. **Not implemented.**

**Implemented (patch 09), additive only**
* `session.completion = {v, basis, scope, prescription, prescribed, performed, extra, exercises[]}` written once at Finish.
* Session lifecycle: unchanged, `draft` / `complete`. **Abandoned is not supported** and cannot be added without a new status value that every shipped validator rejects.
* Prescription: `full` / `partial` / `none`; `unknown` for legacy sessions (read-time only, never stored). **A one-set workout is never full.**
* Exercise execution: `performed` / `partial` / `skipped` / `not_reached`. `skipped` vs `not_reached` is an **inference** (a movement before the last logged one vs after it) and each exercise carries a `basis` field saying so. The app has no skip control.
* Judged against the prescription the athlete was shown (`scope` full / busy / compact). A completed compact session is "full (compact)", never a Full Session.
* Labels only: a line on the Finish panel, the "Workout saved" notice, and one Coach Handoff line with Full / Partial / None / Not recorded counts. No redesign.
* Validator bounds on `completion` (closed enumerations, integer limits, internal consistency, exercise names must be catalog names, no unknown keys).

**Not changed (pinned by characterization tests CS15, CS16):** session counts, Giant B rotation, Training Budget exposure counting, the evidence engine, any prescription.

**Historical data** Every session finished before this patch reads as `unknown`. Their prescription cannot be reconstructed: the prescribed counts are not stored, `compact` toggles mid-session are not recorded, and the busy-week cap is not in the record. They are not back-filled (CS17 proves byte-identity).

**Evidence** `CS_BEFORE_fix.json` 15 of 18 fail (3 characterization tests pass by design) → 18 of 18 pass.

## 7. Priority 5 — regression suite

* `S1.8` was an obsolete defect assertion, not a product regression: it asserted the baseline's substring miscounting (`mobility` as Hypertrophy, `athletic` as Strength).
* Preserved verbatim in intent as `tests/historical/S1.8_original_defect_assertion.test.js` (exit 0 = defect present). `run_all.sh` runs it: **defect present** on PR #1 + patch 01, **defect absent** on the candidate. It is not part of the active suite and is never reported as a pass.
* The active `S1.8` now asserts the desired behaviour (`athletic` → Explosive + Capability only; `mobility` → Low-intensity engine only).
* Phase 1's "adjusted total" that excluded S1.8 is gone. **Raw totals are reported with no adjustment.**
* One flaky test fixed: integration `K2` failed once in 7 runs. Cause: `restoreViaUI` could mistake a "Restore failed" notice left on screen from the earlier deliberate failure for the new attempt's outcome. The helper now clears the notice first. After the fix: 6 of 6 full-suite runs and 5 of 5 K-group runs pass. This was a test race, not a product defect.

## 8. Exact results (candidate `integration/app`, `integration/results/`)

| Suite | Passed | Failed | Total |
|---|---|---|---|
| Backup / restore | 30 | 0 | 30 |
| Reliability | 35 | 0 | 35 |
| Integration | 32 | 0 | 32 |
| Gym workflow | 56 | 0 | 56 |
| Phase 2 (RD 20, CB 16, BU 9, CS 18) | 63 | 0 | 63 |
| **Total** | **216** | **0** | **216** |

Gym G9.3 also passes when updating from the original baseline install (`gym_G9_3_update_from_ORIGINAL_BASELINE.json`).

Context (earlier trees, failures expected): Phase 2 suite on the **Phase 1 candidate**: 17 of 63 pass (RD 6/20, CB 6/16, BU 2/9, CS 3/18). Backup suite on the original baseline: 9 of 30. Reliability on PR #1: 16 of 35. Integration on PR #1: 8 of 32.

Test changes made after code existed (disclosed): G6.2 rewritten to the new behaviour (it asserted the gap this patch narrows); G6.3 title narrowed (still passes); G9.1/G9.3 cache-name expectation updated for patch 10; gym G7.4 was rewritten earlier in this phase.

## 9. Schema and storage changes

| Item | Change |
|---|---|
| New `pa_` keys | none |
| Session `status` values | none (`draft`, `complete`) |
| Session fields | **one additive field, `completion`** (written once at Finish; absent on every historical session) |
| Cardio / readiness records | none (validation and rendering only) |
| Backup format | `format`/`version` unchanged. Compatibility probe (`results/phase2/compat_completion_probe.json`): a Phase 2 backup carrying `completion` is **accepted** by the original baseline, PR #1, and Phase 1 validators; a legacy-shape backup is accepted by Phase 2. |
| Service worker | cache name `project-america-shell-v2-3-phase2-20261019` (installed copies see an update prompt, not mid-workout) |

## 10. Full Session prescriptions

**Unchanged.** `integration/scripts/verify_program_identity.sh` on this head: program structures byte-identical across 32 files; effective prescription byte-identical baseline vs candidate (130 rows); matches the committed audit data. `baseline/hq-2.3/index.html` SHA-256 `93fc2f46…1455ec` and `app/index.html` `5a6fd882…a847` are unmodified. Candidate `index.html` is now `f361ad23…e822e3cd`. The tests for completion read the prescription from `baseSlots`, and CS2 asserts `prescribed` equals the unchanged Full Session set total.

## 11. Compatibility and release-readiness assessment

| Area | Assessment |
|---|---|
| Cardio backup | Round trip works for legitimate text; injection closed in both import and rendering. One known restore refusal for legacy tag-like text (U1). |
| Readiness | Rule is deterministic and tested around midnight; zone semantics are a judgement (U4). |
| Budget | No longer misleading, because unclassifiable sessions are disclosed rather than forced. Six templates await your classification. |
| Completion | Labels honest for new sessions; legacy shown as "not recorded". Rotation and progression still treat a one-set session as a full exposure, now visibly labelled. |
| Data | No migration, no key additions, forward and backward restore verified against three earlier validators. |
| Tests | 216 of 216 in a headless browser. |

**Release readiness:** technically ready for real-device testing; **not ready for release.** Blocking items before any deployment decision: (a) real-device verification below; (b) your decisions on U1-U8; (c) the earliest-date constraint (October 23, 2026, plus separate approval). The unresolved rotation behaviour (D1) is a known-and-labelled limitation, not a new regression.

**Recommended real-device test (one phone, installed PWA, own data export taken first):**
1. Install, take a full backup, confirm it restores on a second profile.
2. Log a legitimate cardio note containing `<10:00`, export, restore.
3. Check in on one evening, reopen the next morning: the card must say stale and the recommendation must not use it; leave the app open across midnight and bring it forward.
4. Do one real short, interrupted Giant A (a few sets, then Finish): confirm the label wording is understandable and that skipped vs not-reached matches what actually happened. Record how often you work out of order (informs D2).
5. Open Budget with a Body Control or practice session logged and confirm the disclosure reads correctly.
6. Update from the currently installed version and confirm the update prompt does not interrupt a workout.

## 12. Unresolved decisions

| ID | Decision |
|---|---|
| U1 | Legacy cardio records with tag-like text block restore under the strict rule. Leave, or add an explicit, user-confirmed escaping step? |
| U2 | Classification of `bodycontrol`, `athletepractice`, `combatintro`, `waterpractice`, `carrypractice`, `practicalskills` (source does not settle them) |
| U3 | Stale check-in keeps a saved joint flag as a restriction. Keep restrict-only? |
| U4 | "Same local day" judged in the device's current time zone |
| U5 | `b3c` (Hypertrophy) vs `c` (Capability) inconsistency; should `c` also count Strength? |
| U6 | The S1.8 decision: kept as historical evidence plus corrected assertion. Confirm. |
| D1 | Rotation credit only for performed intensifier methods (TCS Step 2, R1/R2) |
| D2 | Explicit per-movement Skip control instead of inference |
| D3 | Whether compact / busy completions may satisfy any progression criterion (recommended no) |
| D4 | Exclude or down-weight partial/none sessions (and draft records) in the evidence engine |
| D5 | Whether partial sessions count as Budget exposure |
| D6 | "Abandoned" lifecycle state (recommended: do not add) |
| D7 | Checklist templates: are all items required? Source does not say |

Not implemented anywhere: production deployment, merges, real-data changes, new exercises, Time-Constrained Session code, rotation changes, progression changes.
