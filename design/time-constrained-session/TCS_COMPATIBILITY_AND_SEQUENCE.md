# TCS — Compatibility, Migration Risks, Coordination and Implementation Sequence

**Status: DESIGN ONLY.** No app file, patch, test suite or stored data is modified. The one thing executed against the app is a **read-only probe** (`probes/compat_probe.js`) that asks the app's own `validateBackup` whether a session carrying the proposed additive fields survives import. Nothing is written to either app directory.

SHA-256 of the two app files, unchanged by this work:
`baseline/hq-2.3/index.html` `93fc2f46...455ec`; `app/index.html` (backup-repair candidate) `5a6fd882...a847`.

## A. Verified compatibility facts

Probe results (`probes/compat_results_candidate.json`, `probes/compat_results_baseline.json`; identical on both):

| Probe | Result | Meaning for the design |
|---|---|---|
| Plain session | accepted | control |
| Session with additive `tcs` and `rotation` objects (draft) | **accepted** | Additive session fields survive backup import. No validator change is needed |
| Same, `status:'complete'` | **accepted** | Same |
| Session `status:'completed'` | **rejected** ("Invalid session record") | The only valid statuses are `draft` and `complete`. The reliability patch's `recentSessions` also tolerates `completed` for legacy compatibility, but TCS and rotation must write and read `complete` only |
| New top-level key (`pa_tcs_v1`) | **rejected** ("Unrecognized or oversized backup entry") | Confirms: no new `pa_` keys. This is why the design stores everything inside the session |
| A `tcs` string containing a control character | **rejected** | All TCS strings must be sanitised before storing. Exercise names and labels come from the app's own lists, so this is a defence against future free-text only |
| A `tcs` string over 2,000 characters | **rejected** | Keep every string short; never store free text in the snapshot |

Other VERIFIED facts that constrain the design:
- `start(k)` resumes any same-template draft (baseline line 661). TCS must offer Resume rather than create a second draft.
- `workSetCount(i)` caps compact sessions at 2 sets (line 1077). TCS needs its own per-slot cap and must not reuse `compact`.
- The rotation is read live from the `sessions` array (line 476). Under Option C it must be snapshotted at session start (see the rotation document).
- Backup entries are limited to 10,000,000 characters each and nesting to depth 12. A TCS snapshot is a few KB.
- The backup patch's rollback key `pa_restore_rollback` is excluded from backups. TCS adds no key, so nothing new needs excluding.
- Existing historical sessions have no `tcs`/`rotation` field; every reader must treat their absence as "pre-era / Full Session".

## B. Coordination with the two patches (neither is modified)

| Patch | Branch / PR | What TCS depends on | Overlap with TCS touch points | Rule |
|---|---|---|---|---|
| Backup/restore repair (candidate `082bff0`) | `cursor/backup-restore-repair-75d6` (PR #1) | Import validator and safe-text rules (Section A); rollback behaviour; escaping of dynamic text | Its changed baseline lines are 1091-1218 (clusters, validator) and 1348-1387 (OS pages). TCS touch points are 474-476, 566, 661-673, 1077, 1378-1382. **No changed line is shared** (verified by diffing the two files); adjacent hunks near 1378-1387 could still textually conflict | Implement **on top of** the patched file. Do not edit the validator. All TCS preview text must go through the same escaping (`esc`) the backup patch relies on. A TCS test imports a backup containing TCS sessions (TCS-BKP-*) |
| Reliability repair | `cursor/reliability-repair-75d6` (PR #3) | `readinessDecision` returning `jointOverride`; `recentSessions` accepting `complete`/`completed`; series-based `evidenceDecision` | Its single hunk is baseline lines 1317-1342. TCS does not edit those functions | TCS **consumes** `jointOverride`; it does not reimplement the joint rule. TCS never changes the evidence engine. TCS sessions must be counted by `recentSessions` and the evidence engine exactly like Full sessions (a TCS record is just a normal record) |
| Progression (item 4, design only) | `reliability/PROGRESSION_DESIGN_PROPOSAL.md` | Nothing yet | None | A TCS set that is reduced is never an input that lowers the progression target; progression must read records, not "planned" sets. Noted for the progression review |

**Practical branching rule for implementation:** create the TCS branch from a branch that already contains both patches (merged or stacked); never rewrite either patch's commits; if either patch changes after review, rebase TCS onto it and re-run both existing suites (30 backup tests, 35 reliability tests) as a gate before any TCS test counts.

## C. Compatibility and migration risks

| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| C1 | **Rotation behaviour change.** After a new-era B with a skipped presented intensifier, the group repeats rather than advancing | Certain by design / Low-Medium (visible) | Parity for athletes who always perform presented methods is tested; one-line header explanation; lapse rule bounds repetition; decisions R1-R4 |
| C2 | **Snapshot absent or stale.** Pre-era sessions, or sessions restored from older backups, have no `rotation` | Certain / Low | Pre-era rule reproduces the legacy counter exactly |
| C3 | **Live recomputation flips intensifiers mid-workout** if the rotation is not snapshotted | Would occur if implemented naively / High | The snapshot at `start('b')` is mandatory; resume uses it; test TCS-ROT-06 |
| C4 | **TCS reuses `compact` and inherits its silent omission and rotation distortion (SW-17)** | Plausible shortcut / High | TCS gets its own fields; `compact` and `adaptivePlan` are not edited; test TCS-COMPAT-03 |
| C5 | **TCS-shaped sessions rejected on restore** | Low (probe accepted) / High (data loss on restore) | Additive fields only; strings bounded; TCS-BKP tests including an oversize and a control-character negative |
| C6 | **Omitted work read as done** by existing readers (percent complete, evidence, mission status) | Medium / High | Omitted items write no records; check every consumer that counts sets or `setCount`; tests TCS-DONE-* |
| C7 | **Progression or evidence reading reduced sets as underperformance** | Medium / Medium | Those engines read records; a planned reduction creates no record; test TCS-EVID-01 |
| C8 | **Deferred list turning into debt** (streaks, badges, auto-add) | Design drift / High (trust) | Derived and expiring; UI wording rules in the spec §10; test TCS-DEF-* |
| C9 | **Time model is wrong.** Estimates are placeholders | Certain until calibrated / Medium | Range plus "estimate, not a promise"; calibration rule; pre-release real-timing gate |
| C10 | **Warm-up tagging mismatches the real intent** of an existing item | Medium / Medium | The tags are PROPOSED data for your confirmation (D5); the model checks that every retained movement keeps its tagged items |
| C11 | **Interaction with `pa_int_*` stored defaults and `pa_todayint_*`** (they bypass rotation and are cleared at start) | Medium / Low | TCS suppression of an intensifier uses its own per-session field, not those keys; test TCS-COMPAT-05 |
| C12 | **Service worker / cache**: a new `index.html` is served from the old cache | Known risk of this PWA / Medium | Standard cache-version bump at implementation (outside this design) |
| C13 | **Two devices / duplicate sessions** | Low / Low | Credit is idempotent per session and group |
| C14 | **Mobile layout and real-device behaviour of the preview** | Unknown / Medium | Pre-release device test; no claim made here |
| C15 | **Conditioning has no defined warm-up** in the existing app (VERIFIED) | Certain / Medium | TCS for conditioning is blocked until you decide D8 |

## D. Smallest implementation sequence (each step independently reviewable, testable and reversible)

Gate before every step: both existing suites pass (backup 30, reliability 35) on the patched base. Steps 1-3 change nothing a user can see.

| Step | Scope | Visible change | Notes |
|---|---|---|---|
| 0 | **Approvals** (decisions document) and **real timestamp collection** from several real Giant A/B sessions | None | Without step 0 the estimator is uncalibrated; ship nothing user-facing before it |
| 1 | **Pure planner module** (the ladder and estimator, no UI, no storage) behind a test harness, ported from `model/tcs_planner_model.js` with the app's own prescription data | None | Property tests: reduce-only, fits-or-infeasible, Full-fits-means-Full, warm-up kept, grid of minutes, determinism |
| 2 | **Rotation snapshot + derived ledger** with parity tests; app behaviour identical for fully-performed histories | None for athletes who perform the presented methods; a one-line header message otherwise | Highest-risk step; deliver and review **separately** from the TCS screens; off by flag until parity is demonstrated in the app, not just the model |
| 3 | **Additive session fields** (`tcs`, `rotation`) with reader tolerance for absence; validator probe tests | None | Includes backup/restore round trip with TCS sessions |
| 4 | **Preview screen** (read-only plan, no start button yet) | New secondary "Short on time?" control; no workout change | Real-device layout test |
| 5 | **Start a TCS session**: filtered render, per-slot set caps, per-slot method suppression, banner, finish summary | TCS usable | Full Session path regression tests must be byte-for-byte identical in output |
| 6 | **Safety mode** wired to `jointOverride` and "skip for safety" | RED/YELLOW behaviour in TCS | Needs the clinical answers for any joint-specific rule |
| 7 | **Deferred display** (derived, informational only) | Optional line | Off by default if D9 is not approved |
| 8 | Non-lifting profiles (athletic, mobility, then conditioning) | Per template | Conditioning only after D8 |

**Rollback:** Steps 1-3 are inert and revert by removing the module and the snapshot write. Because all new data is additive inside sessions and ignored by older readers, rolling the app back leaves the data valid (older versions simply ignore `tcs` and `rotation`). That claim needs an explicit downgrade test (TCS-BKP-05).

**Not in the smallest sequence:** `bu`/`bl`/variant templates, calibration UI, goal-weight UI, any change to COMPACT or the adaptive page, any progression change.
