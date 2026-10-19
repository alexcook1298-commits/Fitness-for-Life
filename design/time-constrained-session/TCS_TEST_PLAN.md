# TCS — Test Specification

**Status: SPECIFICATION ONLY. None of these app-level tests is written or run.** What *has* run: (a) the planner model's invariant grid (`model/tcs_planner_model.js`, 1,008 plans, 0 invariant violations and 0 monotonicity violations); (b) the rotation model's 15 checks (`model/rotation_model.js`, 15/15 pass); (c) the compatibility probe (`probes/compat_probe.js`). Those validate the design logic, not the app. Expected values below that come from the model are marked **[M]** and are placeholders to be re-derived after timing calibration; every other expectation is a rule.

**Method.** Same harness as the existing suites (headless Chrome through `tests/lib/cdp.js`, synthetic data, disposable profiles). Write each test first and watch it fail on the unmodified patched base before implementing (the same discipline used for the reliability patch). Gate for every run: the existing 30 backup tests and 35 reliability tests still pass.

## 1. Planner properties (pure module; run over every minute 5-130, templates A and B, rotation groups 0-2, both policies)

| ID | Property |
|---|---|
| TCS-PLAN-01 | Reduce-only: no slot has more sets than the Full Session |
| TCS-PLAN-02 | No method, loaded stretch or exercise is added or changed |
| TCS-PLAN-03 | A feasible plan's estimate is at or under the budget (`T x 0.9`) |
| TCS-PLAN-04 | If the Full Session estimate fits the budget, the plan is the Full Session exactly (no item REDUCED or OMITTED) |
| TCS-PLAN-05 | A feasible plan keeps at least one core movement |
| TCS-PLAN-06 | Every warm-up item tagged to a retained movement is retained; no item is shortened; no item is invented |
| TCS-PLAN-07 | An infeasible request returns `feasible:false` with the minimum feasible minutes and no plan |
| TCS-PLAN-08 | Deterministic: same inputs give the same plan |
| TCS-PLAN-09 | Monotone: more minutes never gives a plan with less total work (sets) than fewer minutes, within the same policy [model: 0 violations on the same grid, measured by total planned sets] |
| TCS-PLAN-10 | No superset, circuit or paired-work representation exists in the output |
| TCS-PLAN-11 | Planned order equals the Full Session order for retained items |

## 2. Availability tiers (expected plans are MODELLED, default constants, cool-down trimmed)

| ID | Case | Expected |
|---|---|---|
| **10-15 min** | | |
| TCS-T10-01 | Giant A and B, 10 and 11 min | Infeasible; message states the minimum feasible time [M: 12]; no plan; mobility mentioned only as a manual option, never selected |
| TCS-T10-02 | Giant A, 12 / 13 / 15 min | Vertical Pull 1/2 only; warm-up = Raise Temperature + Wall Slides; cool-down = Downshift Breathing; est 9.9 [M] |
| TCS-T10-03 | Giant B, 12 / 15 min | Vertical Pull 1/2 only; est 10.1 [M] |
| TCS-T10-04 | 10-15 min plan has no intensifier effort, no loaded stretch, nothing added to fill the gap | rule |
| **20-30 min** | | |
| TCS-T20-01 | Giant A, 20 min | Vertical Pull 1/2 (9.9) [M] and the preview states unused time |
| TCS-T20-02 | Giant A, 25 and 30 min | Horizontal Press 1/3 + Vertical Pull 1/2 (21.2) [M], both policies identical |
| TCS-T20-03 | Giant B, 20 / 25 / 30 min | 20: Vertical Pull 1/2; 25 and 30: Incline Press 1/2 + Vertical Pull 1/2 (18.3) [M] |
| TCS-T20-04 | Every omitted slot is labelled OMITTED - NOT DONE and has no records after a simulated finish | rule |
| **35-45 min** | | |
| TCS-T35-01 | Giant A, 35 min | Press 1 + Pull 1 (21.2, ~10 min unused) [M] |
| TCS-T35-02 | Giant A, 40 min, breadth / depth | Breadth: Press, Squat Press, Pull at 1 set each (31.6); depth: Press 3/3 + Pull 2/2 (33.4) [M] |
| TCS-T35-03 | Giant A, 45 min | Press, Row, Squat Press, Pull at 1 set each (38.5) [M] |
| TCS-T35-04 | Giant B, 35 / 40 / 45 min | 35: Incline 1, Pull 1, Hinge 1; 40 breadth adds Biceps 1/2 with method off; 45: Incline 2, Pull 2, Hinge 1, Biceps 1 [M] |
| TCS-T35-05 | Preview total never exceeds the budget; range shown | rule |
| **50+ min** | | |
| TCS-T50-01 | Giant A, 50 min | Press, Row, Squat Press, Pull, Carry at 1 set each (41.8) [M] |
| TCS-T50-02 | Giant A, 60 min breadth / depth | Breadth: Press 3, Row 1, Squat 1, Pull 2, Carry 1 (54.0); depth: Press 3, Squat 2, Pull 2 (48.1) [M] |
| TCS-T50-03 | Giant A, 90 min | All 7 slots at full sets; Leg Curl and Lateral Raise without Myo efforts; no loaded stretch (77.0) [M] |
| TCS-T50-04 | Giant A, 110 min and Giant B, 110 min | Full Session unchanged; preview says "Your Full Session fits" |
| TCS-T50-05 | Giant B, 60 / 90 min | 60: as in the specification table (52.1); 90: all 8 slots at full sets (80.3) [M] |
| TCS-T50-06 | Every 50+ plan keeps Full-Session rests and the original exercise selections | rule |

## 3. Warm-up and cool-down

| ID | Test |
|---|---|
| TCS-WARM-01 | Retained bench work keeps the Bench-Specific Ramp; omitting the bench removes only the items tagged to it |
| TCS-WARM-02 | General items (Raise Temperature) are retained in every feasible plan |
| TCS-WARM-03 | No warm-up or cool-down item shows a changed duration or text versus the Full Session |
| TCS-WARM-04 | Where the retained work's warm-up alone exceeds the budget the plan is infeasible; nothing is cut below it |
| TCS-WARM-05 | Cool-down policy flag (decision D4) switches between trimmed and never-trimmed; both pass the plan properties |
| TCS-WARM-06 | Conditioning TCS is not offered while D8 is unresolved |

## 4. Safety (RED / YELLOW joint warnings and reduce-only)

| ID | Test |
|---|---|
| TCS-SAFE-01 | Readiness joint 1/5 (RED, `jointOverride`): the preview shows straight sets only, no loaded stretches, no intensifier efforts, rest as an equal option, pain-stop text visible |
| TCS-SAFE-02 | RED: no plan, toggle or preset can raise any set count or add a method |
| TCS-SAFE-03 | RED: the athlete can mark any slot "skip for safety"; it records `SAFETY-HELD`, never `deferred`, and is excluded from the deferred list |
| TCS-SAFE-04 | Joint 2/5 (capped YELLOW): no intensifier efforts and no loaded stretches; primary work only |
| TCS-SAFE-05 | Joint 3-5: no TCS-specific safety restriction beyond the standard plan; behaviour equals the standard planner |
| TCS-SAFE-06 | A short time cannot override a safety omission (property over all minutes with RED) |
| TCS-SAFE-07 | Loaded-stretch removal is the first ladder step in every reduced plan; no plan retains a loaded stretch while removing a core set |
| TCS-SAFE-08 | Pain-stop rules render on every retained exercise |
| TCS-SAFE-09 | Knee/elbow clinician limits (when P0-2 exists) apply identically in Full and TCS: a limited slot is never more loaded in TCS than in Full [blocked until the limits exist] |
| TCS-SAFE-10 | With `jointOverride` the reliability patch's own readiness result is unchanged (TCS only reads it) |

## 5. Interrupted, skipped, partial

| ID | Test |
|---|---|
| TCS-INT-01 | Reload or tab kill mid-session: the draft resumes with the same `tcs` snapshot and the same rotation group |
| TCS-INT-02 | `start('b')` with an existing B draft resumes instead of creating a second session |
| TCS-INT-03 | The snapshot's plan fields are immutable after start; only `revisions[]` can grow |
| TCS-INT-04 | "Running short" mid-session re-plans only the remaining items, reduce-only; logged work is untouched; a revision entry is appended |
| TCS-INT-05 | An abandoned TCS draft with no records does not credit rotation and does not affect the deferred list |
| TCS-SKIP-01 | Skipping a planned exercise writes no record, shows NOT DONE, and does not change rotation credit |
| TCS-SKIP-02 | Skipped exercises are not counted in `setCount`, the evidence engine, or percent-complete displays |
| TCS-SKIP-03 | A skipped exercise is not auto-deferred beyond the derived list rules |
| TCS-PART-01 | Myo-Reps with 1 effort (no structured record): no rotation credit; the set is logged as a normal set only if the existing rules log it |
| TCS-PART-02 | Rest-Pause / DC Rest-Pause / FST-7 with missing stages: no structured record, no credit |
| TCS-PART-03 | Widowmaker single-set record: credit |
| TCS-PART-04 | TCS removed intensifier efforts: the final set renders as a straight set and writes `Straight Sets` records |
| TCS-PART-05 | Partial session finish: the summary lists done / not done; omitted items remain NOT DONE |

## 6. Intensifier rotation, including historical compatibility

| ID | Test |
|---|---|
| TCS-ROT-01 | **Parity:** for 0-40 pre-era complete B sessions the next group equals `completedTemplateCount('b') % 3` |
| TCS-ROT-02 | Pre-era history mixing A, drafts and B: identical to the legacy predicate |
| TCS-ROT-03 | New-era fully performed sessions continue 0,1,2,0,... from any pre-era offset (property, randomised) |
| TCS-ROT-04 | Skipped presented intensifier, session finished: same group offered next; after 2 such, the group moves back |
| TCS-ROT-05 | Partial intensifier earns no credit; `any` vs `all` policy each behave per decision R1 |
| TCS-ROT-06 | Logging records mid-session does not change the displayed intensifiers (snapshot is used) |
| TCS-ROT-07 | Compact B and TCS B with hidden presented slots: no credit |
| TCS-ROT-08 | Interrupted draft that performed the method: credited once; resume + finish does not double-count |
| TCS-ROT-09 | Duplicate session or duplicate record ids (merged restore): credited once |
| TCS-ROT-10 | Manual intensifier override on a slot outside the presented group: no credit for another group |
| TCS-ROT-11 | Existing `pa_hist` records, sessions and keys byte-identical before and after rotation derivation (snapshot comparison) |
| TCS-ROT-12 | Stored `pa_int_*` defaults still bypass rotation exactly as today |
| TCS-ROT-13 | Restore of a backup taken before this feature: sessions are pre-era; next group equals the legacy result |
| TCS-ROT-14 | Restore of a backup containing new-era sessions: derived state equals the pre-backup derived state |
| TCS-ROT-15 | A group with no non-straight presented method credits on completion |
| TCS-ROT-16 | `bu`, `bl`, Giant A: no rotation behaviour change at all |
| TCS-ROT-17 | The header explanation appears only when a group is re-offered |

## 7. Deferred work and "no debt"

| ID | Test |
|---|---|
| TCS-DEF-01 | Omitted items appear as optional, dismissible suggestions, derived from the last TCS snapshot of the same template |
| TCS-DEF-02 | The deferred list expires after the next completed session of that template, or the expiry constant [D9] |
| TCS-DEF-03 | No counter, streak, badge, red indicator or "behind" wording is rendered anywhere (DOM text scan) |
| TCS-DEF-04 | A Full Session after a TCS is identical to a Full Session after a Full (same sets, methods, rests) |
| TCS-DEF-05 | A TCS after a TCS has the same total budget; the tie-break (if enabled) only reorders within the same priority class and never raises a set count |
| TCS-DEF-06 | Dismissed suggestions do not reappear for that session |

## 8. Never-done / records / evidence

| ID | Test |
|---|---|
| TCS-DONE-01 | After finishing a TCS, omitted items have zero `pa_hist` records and no completion mark in any view |
| TCS-DONE-02 | The finish summary and history show OMITTED - NOT DONE, not "skipped 100%" or a check |
| TCS-EVID-01 | The reliability evidence engine ignores planned reductions: a TCS set at the same load/reps as the Full series does not create a deterioration signal |
| TCS-EVID-02 | `recentSessions` counts a finished TCS session exactly as a finished Full session |
| TCS-FULL-01 | The Full Session render for A, B, C and all other templates is identical (HTML snapshot) before and after the feature |
| TCS-FULL-02 | The normal start button always starts the Full Session; TCS is never preselected |
| TCS-FULL-03 | Master templates and `T`, `slots`, `GIANT_BOOKENDS` objects are deep-equal before and after use of TCS |
| TCS-COMPAT-03 | `adaptivePlan` / COMPACT behaviour is unchanged (existing behaviour preserved, including its known issues) |
| TCS-COMPAT-05 | `pa_todayint_*` / `pa_int_*` unaffected by TCS suppression |

## 9. Backup / restore and storage

| ID | Test |
|---|---|
| TCS-BKP-01 | A backup containing draft and complete sessions with `tcs` and `rotation` imports and round-trips unchanged (probe accepted both) |
| TCS-BKP-02 | `status:'completed'` is not written by any TCS code path (probe rejected it) |
| TCS-BKP-03 | No new `pa_` key is created (key-set comparison) |
| TCS-BKP-04 | Oversized or control-character TCS strings are rejected on import and never written by the app |
| TCS-BKP-05 | **Downgrade:** a backup with TCS sessions restores into the unmodified patched base and the sessions remain valid |
| TCS-BKP-06 | Storage-failure rollback (backup patch) still leaves the data intact when a TCS session write fails |
| TCS-BKP-07 | Escaping: exercise and label text in the preview and finish summary are escaped (injection strings in custom selections do not execute) |

## 10. UI and estimation

| ID | Test |
|---|---|
| TCS-UI-01 | The preview shows the four groups in the specified order with the specified labels |
| TCS-UI-02 | "This is an estimate" wording and the range are shown; "default timing" is shown when uncalibrated |
| TCS-UI-03 | The athlete can remove items but cannot add or raise sets above Full |
| TCS-UI-04 | 390 px layout: no horizontal scroll, controls reachable [real-device pass required before release; emulation is not a substitute] |
| TCS-TIME-01 | Calibration needs at least 30 qualifying gaps; otherwise defaults |
| TCS-TIME-02 | Gaps over 15 minutes are excluded from calibration |
| TCS-TIME-03 | Calibration uses `pa_hist` log-time only and stores nothing |
| TCS-TIME-04 | **Pre-release gate (manual):** on several real Giant A/B sessions the estimate falls inside the +/-15% band at least the agreed fraction of the time (threshold to be set by you) |

## 11. Counts and run order

106 test IDs: planner properties 11; availability tiers 19 (10-15 min: 4, 20-30: 4, 35-45: 5, 50+: 6); warm-up 6; safety 10; interrupted, skipped, partial 13; rotation 17; deferral 6; done/evidence/Full/compat 9; backup and storage 7; UI and timing 8.
Run order: planner properties, rotation, storage, then browser flow. Blocked tests: TCS-SAFE-09 (needs clinician limits to exist), TCS-WARM-06 (needs decision D8), TCS-UI-04 and TCS-TIME-04 (need a real device and real timing).
