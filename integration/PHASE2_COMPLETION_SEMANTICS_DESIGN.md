# Phase 2 — Priority 4: workout completion semantics (design, conflict check, and what is and is not implemented)

You asked for a conflict check against the approved Time-Constrained Session (TCS) design and the pending progression proposal **before** implementing, and a STOP if a significant schema or rotation change is required. This is that check. The outcome is a split:

| Part | Conflicts with TCS / progression proposal? | Decision |
|---|---|---|
| Additive, derived `completion` field on a session, written once at Finish, plus labels | No (different field names, no reader of it changes behaviour) | **Implemented** (patch 09) |
| Rotation: stop advancing the Giant B intensifier group when its method was not performed | **Yes. This is TCS Step 2 (rotation snapshot + derived ledger)** | **Not implemented. Awaiting approval** |
| Evidence/progression gating by completion (partial sessions excluded or down-weighted) | **Yes. This is the progression proposal's territory** | **Not implemented. Awaiting approval** |
| Counting partial sessions differently in Budget / session counts | Changes counts you asked to preserve | **Not implemented** |
| A new "Abandoned" lifecycle state, or an explicit per-exercise "skip" control | New status value (rejected by every shipped validator) / new UI | **Not implemented. Awaiting approval** |

## 1. Source facts the design rests on

All line references are `integration/app/index.html` at the Phase 2 head before patch 09.

1. **Lifecycle today is two-valued.** `start` creates `status:'draft'`; `finishSession` (line 1145) sets `'complete'`. The validator accepts only those two (line 1241). There is no code path that abandons a session. A draft that is never finished stays a draft forever and is listed under "Unfinished workouts". So *Abandoned is not supported* and cannot be added without a new status value, which every shipped version (baseline, PR #3, PR #4, this candidate) rejects on restore.
2. **Finishing needs only one thing.** `finishSession` refuses only if there are no lifting records, no checked items, no cardio and no loaded-stretch records. One set out of ~16 finishes as an ordinary completed session. `setCount` and `checkCount` are stored but never displayed (existing characterization G6.2).
3. **The prescription is not stored with the session.** It is `slots[template][i][2]` (sets per movement) after two session-level adjustments: `weekMode==='busy'` caps each movement at 2 (`applySessionSlots`) and `compact` hides all but the keep-list (`compactSlot`) and caps at 2 (`workSetCount`). `compact` can be toggled mid-session and only its final value survives. A finished historical session therefore cannot prove what was prescribed unless nothing was toggled.
4. **A performed set exists only as a `pa_hist` record** with id `sessionId|slot|name|set|mode`. The slot index is recoverable from the id; the prescribed set count is not on the record.
5. **Checklist templates** (Conditioning, Athletic, Mobility, `bodycontrol` and the practice templates) have no `slots`. Their "work" is `button.check` toggles whose keys include the chooser value and the mobility tier. `session.checks` accumulates keys from every tier or chooser value ever rendered, so counting `checks` over-counts. Only the DOM visible at Finish says what the athlete was shown.
6. **Giant B rotation** is `completedTemplateCount('b') % 3` (line 474), i.e. every `complete` B session advances it, whatever was done. The TCS rotation document (Option C: snapshot at start + derived ledger) proposes to change exactly this and calls it the "highest-risk step, delivered and reviewed separately".
7. **The evidence engine** (`evidenceDecision`, ~line 1503) reads every `pa_hist` record, including records of *draft* sessions, groups them by exercise and series, takes the best value per calendar day, and can reach INVESTIGATE or ACT on a decline. It does not advance load; nothing in the app auto-progresses. A partial session that logs only a light set can still contribute a low "best of the day" and look like a decline.

## 2. Conflict analysis

* **TCS.** TCS design (`cursor/tcs-design-75d6`) adds session fields `tcs` and `rotation`, and Step 2 changes rotation credit to "performed, not merely completed". The additive field here is named `completion` and does not collide with `tcs`, `rotation`, `compact`, or `adaptivePlan`. TCS Step 3 expects additive session fields and reader tolerance for absence; `completion` follows the same rule (absent means "not recorded"). TCS risk C6 ("omitted work read as done by existing readers") is *reduced* by this change, because the omitted work now carries a label. No conflict.
* **Rotation.** The requirement "do not silently advance intensifier rotations for unperformed methods" cannot be met by a label. It needs the rotation reader to ignore sessions in which the presented group was not performed. That *is* TCS Step 2, with its decisions R1/R2 (credit policy and partial exposure) still open. **Implementing it here would pre-empt that approval, so it is not implemented.** What is implemented instead is the data that decision needs: each new session records, per exercise, how many sets were logged, so a later rotation ledger can be derived without a second source of truth. Today's rotation behaviour is pinned by characterization tests (CS14, CS15) so any later change is visible.
* **Progression proposal.** Gating the evidence engine by completion changes which records an existing decision reads. It overlaps the proposal's series model. Not implemented. The characterization test CS16 documents today's behaviour (a one-set session contributes to the evidence series).

Conclusion: the label-and-record layer is safe to ship; rotation and progression gating are significant behaviour changes and are brought to you for approval.

## 3. What is implemented

### 3.1 Three separate dimensions

| Dimension | Values | Where it comes from |
|---|---|---|
| Session lifecycle | `draft`, `complete` (**Abandoned: not supported**) | existing `status`, unchanged |
| Prescription completion | `full`, `partial`, `none` (legacy: `unknown`) | new `session.completion.prescription`, derived at Finish |
| Exercise execution (lifting templates) | `performed`, `partial`, `skipped`, `not_reached` | new `session.completion.exercises[]`, derived at Finish |

### 3.2 Stored shape (additive, one object per session, written once at Finish)

```json
"completion": {
  "v": 1,
  "basis": "sets",
  "scope": "full",
  "prescription": "partial",
  "prescribed": 16,
  "performed": 3,
  "extra": 0,
  "exercises": [
    {"slot": 0, "name": "Horizontal Press", "prescribed": 3, "performed": 3, "status": "performed", "basis": "logged"},
    {"slot": 1, "name": "Horizontal Row",   "prescribed": 2, "performed": 0, "status": "skipped",   "basis": "later-work-logged"},
    {"slot": 6, "name": "Loaded Carry",     "prescribed": 3, "performed": 0, "status": "not_reached","basis": "no-later-work"}
  ]
}
```

* `basis: "sets"` for lifting templates (units = prescribed work sets, from the same `workSetCount` the screen uses); `basis: "items"` for checklist templates (units = checklist items shown at Finish; `exercises` is empty).
* `scope` is `full`, `busy` or `compact`, taken from the session's own flags. **Completion is judged against the prescription the athlete was shown.** A fully completed compact session reports `prescription:"full"` with `scope:"compact"`; it is never presented as a Full Session. (Decision D3.)
* `extra` is sets logged beyond the prescribed count, or in movements outside the shown scope. They are recorded, never added to `performed`.
* Nothing is written for `performed` that is not a stored record. No set is invented.

### 3.3 Rules

* `none`: zero units performed. `full`: every shown unit performed **and at least two units performed**. Everything else is `partial`. So **a one-set workout is never full**, even if a template were prescribed one set.
* `skipped` versus `not_reached`: the app has no skip control, so this is an inference and is labelled as one through `basis`. A movement with no logged sets **earlier than** the last movement that has logged sets is `skipped` (`later-work-logged`); one **after** the last logged movement is `not_reached` (`no-later-work`), the signature of an interrupted session. An athlete who deliberately does movements out of order will be read as having skipped the earlier ones. This limitation is stated rather than hidden. Decision D2 asks whether to add an explicit skip control.
* **Legacy sessions** (every session finished before this patch) have no `completion`. They are reported as `unknown` ("finished before completion was recorded") and are **never back-filled or altered**. Their counts, rotation credit and budget exposure are exactly as before. Even the stored `setCount` cannot establish completion because the prescription, `compact` toggles and busy-week cap are not stored.

### 3.4 Labels (no layout redesign)

* The Finish panel shows one line before confirming, e.g. "Prescription: partial, 3 of 16 sets logged. Not logged: Horizontal Row (skipped), Loaded Carry (not reached)."
* The "Workout saved" notice says the same.
* Coach Handoff gains one line under "Completed sessions: N" with counts of full / partial / none / not recorded, plus up to three partial sessions. N itself is unchanged.
* Block review, Home and the Budget page are not changed.

### 3.5 Validator

`completion`, if present, must be an object with the keys and bounds above (`v` is 1; enumerations are closed; integers are 0-500; at most 40 exercises; `full` is rejected if `performed < prescribed` or `performed < 2`). A malformed value is refused with "Invalid completion record." Older shipped versions already accept the additive field (verified in the CS tests against the Phase 1 candidate), so a backup written by this version restores on them and a backup from them restores here.

## 4. What is not implemented, and the decision needed

| ID | Decision | Recommendation |
|---|---|---|
| D1 | Rotation credit only for performed methods (TCS Step 2, R1/R2) | Approve with TCS Step 2, using `completion.exercises` as the ledger source for new sessions |
| D2 | Add an explicit per-movement "Skip" control so deliberate skipping is recorded rather than inferred | Defer until real-device testing shows how often athletes work out of order |
| D3 | Whether a fully completed compact or busy-week session may satisfy any future progression criterion | No. Treat `scope!=="full"` as non-qualifying by default |
| D4 | Exclude or down-weight `partial` / `none` sessions in `evidenceDecision` (and read only `complete` sessions' records; today drafts are read too) | Approve with the progression proposal |
| D5 | Whether `partial` sessions count as Training Budget exposure | Leave counted until you decide; the label now makes it visible |
| D6 | An "Abandoned" lifecycle state | Do not add. It needs a new status value rejected by every shipped validator; a derived label ("draft untouched for N days") is possible without a schema change |
| D7 | Checklist templates: are all listed items required, or are some optional? | The source does not say. "Full" for a checklist means every item shown was ticked |
