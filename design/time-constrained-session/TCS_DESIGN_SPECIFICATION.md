# Time-Constrained Session (TCS) — Feature Specification

**Status: DESIGN ONLY. Nothing here is implemented.** No app file, program, exercise, set, intensifier, warm-up, cool-down, progression rule or stored record is changed by this document. `baseline/hq-2.3/index.html` and `app/index.html` are untouched.

**How to read the evidence labels.** `VERIFIED` = read from the HQ 2.3 source or probed in a browser in an earlier phase. `MODELLED` = produced by the non-production design model in `model/` using the app's own prescription data and *placeholder* timing constants. `PROPOSED` = my design choice, awaiting your approval. Nothing in this document has been measured on a real device or against real training timestamps.

Companion documents: `TCS_ROTATION_STATE_MODEL.md`, `TCS_COMPATIBILITY_AND_SEQUENCE.md`, `TCS_TEST_PLAN.md`, `TCS_DECISIONS_AND_CLINICAL_QUESTIONS.md`.

---

## 1. Purpose and non-goals

**Purpose.** On a day when the athlete has fewer minutes than the Full Session needs, produce an honest, previewable plan that does as much of the highest-value work as the time allows, and records exactly what was and was not done.

**Non-goals (hard).**
- It does not change, shorten or replace any Full Session, template, prescription, set count, rest, intensifier, warm-up or cool-down. Full Session remains the default and the normal start button always starts it.
- It does not add work. It can only keep, reduce or omit.
- It does not substitute a different (shorter) session automatically, and it does not use supersets, circuits or paired sets.
- It does not mark anything it did not perform as done, and it does not create training debt.
- It does not modify the existing COMPACT / adaptive path, the backup/restore patch, or the reliability patch.

## 2. How each of your ten decisions is satisfied

| # | Your decision | Where / how |
|---|---|---|
| 1 | Preserve every Full Session element; Full is default | §1; §12 (TCS is a *view over* a Full Session snapshot, the master template is never edited); tests `TCS-FULL-*` |
| 2 | Time-driven; goal/primary first, then accessories, then optional intensifier efforts; strength-method exercises not absolutely mandatory | §5 (ladder: loaded stretches and intensifier efforts go first, then accessories, then core sets, and only then core movements); the draft tiers do **not** mark any exercise "never removable" except that a feasible plan keeps at least one primary movement |
| 3 | Activity-specific warm-ups and safety kept; no universal minimum; clinical questions flagged | §6 (warm-up/cool-down are *tagged per movement*, kept with retained work, never given an invented duration); `TCS_DECISIONS_AND_CLINICAL_QUESTIONS.md` §C |
| 4 | Hypertrophy and strength first; dedicated sprint/jump/rope/conditioning/mobility development preserved | §5.4 and §5.5 (TCS never removes or reschedules another session; non-lifting sessions get their own profile) |
| 5 | Intensifier-rotation correction | `TCS_ROTATION_STATE_MODEL.md` |
| 6 | Deferred work optional; no debt; no automatic workload increase | §10 |
| 7 | Preview of included / reduced / omitted / deferred; omitted stays NOT DONE | §8 |
| 8 | No automatic shorter-session substitution; no supersets | §1, §4 step 5, §5.3 |
| 9 | Tests for 10–15, 20–30, 35–45, 50+ min; interrupted; partial intensifiers; skipped; RED joint; historical rotation | `TCS_TEST_PLAN.md` |
| 10 | Coordinate with reliability and backup/restore work without modifying either patch | `TCS_COMPATIBILITY_AND_SEQUENCE.md` §B |

## 3. User flow

1. **Entry.** Home / session start shows the normal **Start Giant A/B** button (unchanged). A secondary text control "Short on time?" opens the TCS planner. TCS is never preselected, never auto-suggested in place of Full, and never changes the label of the main button. (`PROPOSED`; today's adaptive page already asks about time at `renderAdaptivePage`, ~line 1380 of the baseline, so TCS extends that screen rather than adding a parallel one.)
2. **Time.** Presets 10 / 15 / 20 / 30 / 45 / 60 / 90 and a custom minutes field. This is *total* time including warm-up and cool-down (decision needed: §14 D6).
3. **Gates, evaluated before any plan is shown.**
   - Readiness: if the (patched) `readinessDecision` returns `jointOverride` the planner enters **safety mode** (§7).
   - A draft of the same template already exists: offer **Resume** first (`start(k)` already resumes a same-template draft). TCS never silently creates a second draft.
4. **Preview.** One screen, no scrolling surprises: header with budget and modelled estimate range, then four groups (§8). The athlete can (a) accept, (b) change the time, (c) toggle "prefer depth / prefer breadth" (§5.3), (d) remove any further item, (e) switch to the Full Session. They cannot add anything back above the Full Session prescription, and cannot override a safety omission.
5. **Start.** The session is created exactly like a Full session of that template, with the TCS snapshot (§12) attached. Rendering shows only the planned items, set counts capped to the plan, and a persistent banner "Time-Constrained Session — N items not done today".
6. **During.** Normal logging. A "Running short?" action can re-plan *only the remaining* work (never edits logged work and never adds work) and updates the snapshot's `revisions[]`.
7. **Finish.** The finish summary lists done / reduced-and-done / not done. Omitted items remain NOT DONE in the record. Finish uses the existing `finishSession` rules.

## 4. Planning algorithm (deterministic, reduce-only)

Inputs: template, rotation snapshot (so the plan sees the same intensifiers a Full B would), available minutes `T`, equipment/exercise selections (existing), readiness decision, policy (breadth/depth), calibrated or default timing constants.

1. Build the **Full Session item list** from the existing effective prescription (sets, rest, method on the final work set, loaded stretch flag, rotation-aware). Estimate its time (§9). If `Full <= budget`, the plan **is** the Full Session unchanged and the preview says so. (`budget = T x (1 - 10%)`.)
2. Otherwise apply the reduction ladder, stopping as soon as the estimate fits:
   1. Remove loaded stretches (lowest priority first).
   2. Remove intensifier extra efforts; the final work set stays as a straight set.
   3. Trim the cool-down to its general down-shift item (**decision D4**; the model does this before touching any sets).
   4. Reduce accessory slots to 1 set (lowest priority first).
   5. Omit accessory slots (lowest priority first).
   6. Reduce core slots (breadth policy: reduce all core slots toward 1 set before omitting any; depth policy: omit lowest-priority core slots down to 2 core movements first).
   7. Omit core slots, lowest priority first, never below 1 core movement.
3. If it still does not fit: **infeasible**. Show the minimum feasible time and recommend rescheduling. Do not cut below the retained work's own warm-up, do not auto-pick another session, and do not squeeze.
4. Never raise a set count, add or change a method, add a loaded stretch, shorten a rest, or change an exercise.
5. Never introduce supersets or paired work.

The ladder, the invariants and the grid check are executable in `model/tcs_planner_model.js` (`node model/tcs_planner_model.js`). **MODELLED result: 0 invariant violations over 1,008 plans** (Giant A and Giant B rotation groups 0/1/2, both policies, 5–130 minutes).

## 5. Prioritization rules

### 5.1 Priority classes (PROPOSED)

| Class | Meaning | Treatment |
|---|---|---|
| P1 | Goal-specific and primary training work (see tier tables) | Kept longest; reduced in sets before any P1 is omitted; at least one P1 movement is kept in every feasible plan |
| P2 | Remaining main hypertrophy/strength work | Reduced before P1; omitted before P1 |
| P3 | Accessories / isolations | Reduced to 1 set, then omitted, before any core reduction |
| P4 | Optional intensifier extra efforts and loaded stretches | First to go |

Safety, warm-up for retained work, and pain-stop rules are **not** a class. They sit outside the ladder and cannot be traded for time.

### 5.2 Draft per-slot order (needs your approval; D1)

Order within a template is "keep first -> cut last". These come from the existing slot labels; I did not invent exercises.

| Template | Core (cut last; order shown is keep-first) | Accessory (cut first; order shown is keep-first) |
|---|---|---|
| Giant A | Vertical Pull, Horizontal Press, Squat Press, Horizontal Row, Loaded Carry | Leg Curl, Lateral Raise |
| Giant B | Vertical Pull, Incline Press, Hip Hinge, Biceps | Triceps, Rear Delts, Calves, Widowmaker |

Things you should look at in that draft:
- Vertical Pull first is a **goal-based** choice (your PULL/ROPE skill tracks, `SKILLS.json`), and it means that at about 20 minutes or less the plan keeps a pull and not the bench press. If you would rather protect the press, say so (D1).
- Strength-method slots (cluster sets on weighted pull-ups, top set + back-offs on squat press) are *not* treated as mandatory, per your decision 2. In the draft they are cut in order like any other core slot, after accessories and intensifier efforts.
- When a strength-method slot is reduced, back-off sets go before the top set; the top set is never the thing removed from a retained slot (`PROPOSED`; needs the strength-method set structure read from `pa_strength_*` at implementation time).
- Biceps sits in Giant B's core list in the draft because it is the DC Rest-Pause carrier in rotation group 0. This is a weak justification and you may prefer it as an accessory (D1). It also touches the elbow question (`CLINICAL_QUESTIONS`, elbow) so it needs your call.

### 5.3 Breadth versus depth (D2)
- **Breadth** (draft default): keep more movements at fewer sets.
- **Depth**: keep fewer movements at their full set count.
Both are produced by the same ladder; they differ only in step 6/7 ordering. The athlete can toggle them in the preview. MODELLED examples are in §13. The default is a recommendation, not a finding; there is no dataset in this repo that says which is better for this athlete.

### 5.4 Non-lifting sessions: dedicated development is protected
- TCS **never removes, shortens or reschedules** another session. Choosing TCS on a Giant day does not touch the athletic, conditioning, mobility or body-control days.
- The planner shows (read-only) the week's other dedicated sessions that are still outstanding, so a short Giant day is not accidentally paid for by skipping sprint/jump/rope/conditioning/mobility work. It never suggests adding them to today.

### 5.5 Template profiles (`PROPOSED`; only Giant A/B are modelled in numbers)

| Template | TCS behaviour | Why |
|---|---|---|
| `a`, `b` | Full ladder above | Only templates with modelled data |
| `bu`, `bl`, `b2a`-`b7b`, `bonusarms`, `bonusback` | Same ladder, same rules, tier tables to be defined by you; **not in the first release** | `GIANT_BOOKENDS` exist for them, so warm-up tagging is possible |
| `c` | Same ladder; Weighted Vertical Pull and Grip Hang are tagged goal-specific (PULL/ROPE) and kept longest | Existing slots |
| `athletic` (speed, jump) | **Reduce volume only**: fewer sets of acceleration, countermovement jump, skater stick; keep the preparation sequence (fast march -> snapdown -> pogos) that precedes the fast work; never shorten rests on speed/power work; never convert to conditioning | Quality work needs recovery between reps; the warm-up items are the existing ones |
| `conditioning` | Duration/rounds scale: Zone 2 shortened, intervals rounds reduced. **Blocked until you decide D8**: the Zone 2 text says 25-40 min and the template has **no defined warm-up** (VERIFIED), so a time-driven warm-up would have to be invented | Not invented |
| `mobility` | Select the existing 5/10/15/30 min tier that fits; never shorten inside a tier | Tiers already exist (`MOB`, `mobTier`) |
| `bodycontrol`, `athletepractice`, `carrypractice`, `combatintro`, `waterpractice`, `practicalskills` | **Out of scope for v1**: skill/practice/coached sessions have no time-reduction logic that I can justify | Not invented |

## 6. Warm-up and cool-down

- Every warm-up and cool-down item in `GIANT_BOOKENDS` is tagged with the movements it prepares, or `general`. This tagging is derived from the existing item text (e.g. "Bench-Specific Ramp" prepares Horizontal Press) and is **PROPOSED data** that you should confirm (D5).
- A warm-up item is kept if **any retained movement** needs it, or if it is `general`. An item is removed only when everything it prepares is omitted. Items are kept whole. **No item is shortened and no universal minimum duration is invented** (your decision 3).
- Cool-down items follow the same rule, except for the one open choice: whether the plan may trim the cool-down to the down-shift item (D4). The MODELLED effect is large:

| Case (breadth) | Cool-down trimmed (model default) | Cool-down never trimmed |
|---|---|---|
| Giant A, 25 min | Press 1 set + Pull 1 set | Pull 1 set only |
| Giant A, 40 min | Press, Squat Press, Pull at 1 set each | Press + Pull at 1 set each |
| Giant B, 25 min | Incline Press + Pull at 1 set each | Pull 1 set only |
| Smallest feasible time, Giant A / B | 12 / 12 min | 15 / 16 min |

- If the retained work's warm-up alone exceeds the budget the plan is infeasible; the preview shows the minimum feasible time.
- **Observation for you (not a change):** in the existing bookends there is no pull-up-specific ramp for Vertical Pull. The Giant A warm-up has a bench ramp and a "Row / Squat-Press Primer" but only Wall Slides for the pull. The TCS reproduces the Full Session faithfully, so a short plan that keeps only the pull inherits that. Whether a pull-specific ramp should exist is a coaching/clinical question for the Full Session too (C-4).
- **Warm-up dominates short plans (MODELLED).** At 12 minutes on Giant A the retained plan is about 4.8 min of work and 4.7 min of warm-up. That fixed cost is why 10-15 minute availability produces a one-movement session.

## 7. Safety layer (cannot be traded for time)

1. **Reduce-only.** See §4.
2. **Readiness joint override.** If `readinessDecision(...).jointOverride` is true (joint 1/5 = RED, 2/5 = capped YELLOW, from the reliability patch):
   - **RED:** TCS offers only: straight sets, no intensifier efforts, no loaded stretches, no breadth/depth toggle that increases sets, plus the existing pain-stop text. It does not present itself as a way to "still train hard." It shows rest as an equal option. The existing reliability text for RED mentions COMPACT; TCS never replaces COMPACT or contradicts that text.
   - **YELLOW (joint-qualified):** the plan may not include intensifier efforts or loaded stretches (the same text says "keep primary work only, cap optional intensity").
   - The check-in stores a joint *score*, not *which* joint. So today **TCS cannot know which exercises a flagged joint affects.** Interim: safety mode removes the highest-risk *categories* (loaded stretches, intensifiers) and asks the athlete to mark any slot "skip for safety" in the preview, which records `SAFETY-HELD` (never `deferred`). A joint -> slot map needs clinician input (C-1, C-2).
3. **Clinician limits.** When P0-2 (knee/elbow flags from the audit) exists, those limits apply identically to Full and TCS. TCS cannot lift a limit. Until then, the loaded-stretch ladder step removes the knee/elbow-relevant loaded stretches first, which is the conservative direction.
4. **Pain-stop rules** stay visible on every exercise.
5. **No clinical thresholds are invented here.** Return-to-running, jumping and knee/elbow loading are not touched.

## 8. Preview and status vocabulary

Four groups, always in this order, with these exact labels. Omitted work is never shown with a check, a percent, or the word "skipped" in a way that could be read as completed.

| Label | Meaning | Recorded as |
|---|---|---|
| **INCLUDED** | Exactly as in the Full Session | normal |
| **REDUCED** | Fewer sets and/or without intensifier efforts or loaded stretch. Shows what changed ("sets 3 -> 1; no loaded stretch") | normal records for what is logged |
| **OMITTED - NOT DONE** | Not part of today's session | no records; `tcs.items[].status='omitted'`; counts as not done |
| **DEFERRED (optional)** | Informational: an omitted item offered for a future TCS or Full session. Dismissible. Not a debt | derived (§10); never stored as a task |
| **SAFETY-HELD** | Removed because of readiness/joint safeguards | `status='safety'`; excluded from deferral |

Header: `Time available`, `Planning budget` (after the 10% buffer), `Modelled estimate` with range (+/-15%), and an explicit sentence: "This is an estimate, not a promise." If the plan is the Full Session: "Your Full Session fits."

## 9. Time-estimation methodology

`MODELLED`, uncalibrated placeholders. The formula matches the audit's estimate structure.

```
slotTime = setup (60 s)
         + straightSets x (work 45 s + prescribed rest)
         + [if intensifier block on final set]
             stages x 25 s + (stages-1) x method rest   (+ Widowmaker extra 90 s)
         + [if loaded stretch] 65 s
total    = sum(slotTime) + sum(retained warm-up items) + sum(retained cool-down items)
budget   = available x (1 - 0.10)
range    = estimate x (1 +/- 0.15)
```

- Prescribed rests come from the existing prescription (they are never shortened).
- Stage counts: DC Rest-Pause 3, Rest-Pause 3, Myo-Reps 4, FST-7 7, BFR 4, Lengthened Partials 2, Mechanical Drop Set 3, Widowmaker 1.
- **MODELLED Full Session estimates:** Giant A 90.4 min (65.9 work + 18.5 warm-up + 6.0 cool-down); Giant B 82.4 / 81.0 / 79.8 min for rotation groups 0/1/2. The audit's headline figure for Giant A was about 87 min because it used rounded per-set values; the difference (about 3 min) is a modelling-detail difference, and both are uncalibrated.

**Calibration (PROPOSED, privacy-preserving, no new storage key):**
1. `pa_hist` records carry a log-time `date`. Per session, the gap between consecutive records approximates `work + logging + rest`. Subtract the prescribed rest to estimate the athlete's work+logging time; take a median, not a mean.
2. Gaps over 15 minutes are discarded (phone-down, interruptions). The first record of a slot absorbs setup; use it for setup.
3. Require at least 30 qualifying gaps before replacing defaults; otherwise use defaults and say "default timing".
4. The calibrated pace factor is **derived each time** from history; it is not stored (a stored value would need a new key and validator change, see the compatibility document).
5. Show the calibration state in the preview ("based on your last N sessions" / "default timing").

**What I cannot do here:** validate against real workouts. Pre-release requirement: collect real timestamps from several Giant A/B sessions (Full and TCS), compare estimate and actual, and report error before this ships. The +/-15% band and 10% buffer are placeholders until then.

## 10. Deferred work

- **Derived, not stored.** The deferred list is computed from the snapshots of recent TCS sessions of the same template (`tcs.items[].status==='omitted'`), and expires after the next completed session of that template or 14 days, whichever comes first (the 14 days is a placeholder; D9).
- **Never debt.** No notification, streak, counter, red badge, progress bar, or "behind" wording. It is shown only inside the TCS preview and as an optional dismissible line in the next Full Session's header. Dismissing is permanent for that session.
- **No automatic workload increase.** TCS never adds sets, a session, or an extra exercise because of earlier omissions. The Full Session is the same Full Session the next time.
- **Only effect on a later TCS:** a tie-breaker, not an add-on. Among slots of the **same priority class**, a slot omitted in the last TCS of that template is kept ahead of its peer. It cannot cross a class boundary, cannot raise any set count, and does not change total workload (the budget is the same). Default OFF until you approve (D9).
- The existing text "Do not create make-up debt" for the <=15-minute adaptive tier (SW-17) is consistent with all of the above.

## 11. In-session behaviour

| Situation | Behaviour |
|---|---|
| Athlete skips a planned exercise | Status becomes `omitted-in-session` in the snapshot; no record is written; it stays NOT DONE. It is not deferred automatically unless the athlete leaves it unmarked at finish (then it appears under "not done today") |
| Athlete does fewer sets than planned | Records exist only for logged sets; nothing is back-filled |
| Interrupted workout | Same as today: session stays `draft`, `start(k)` resumes it with its snapshot. The snapshot is immutable except `revisions[]` |
| "Running short" mid-session | Re-plan the remaining items only, reduce-only, appended to `revisions[]`; logged work untouched |
| Intensifier started but not completed | An unstructured/incomplete record does not count as performed (rotation: no credit; see rotation document) |
| Finish with nothing logged | Existing rule (finish blocked unless something is logged or checked) |

## 12. Data model (additive; no new top-level `pa_` key)

Stored inside the existing session object (`pa_sessions_v2`, mirrored in `pa_current_session` while a draft):

```json
{
  "tcs": {
    "v": 1,
    "availableMin": 25,
    "budgetMin": 22.5,
    "estMin": 21.2,
    "estRangeMin": [18, 24],
    "timing": "default",
    "policy": "breadth",
    "safetyMode": null,
    "items": [
      { "slot": 0, "label": "Horizontal Press", "exercise": "Bench Press (BB)",
        "status": "reduced", "fullSets": 3, "plannedSets": 1,
        "changes": ["sets 3->1", "no loaded stretch"] },
      { "slot": 1, "label": "Horizontal Row", "status": "omitted", "fullSets": 2, "plannedSets": 0 }
    ],
    "warmup": ["Raise Temperature", "Wall Slides"],
    "cooldown": ["Downshift Breathing"],
    "revisions": []
  },
  "rotation": { "v": 1, "group": 0, "slots": [3, 4], "methods": { "3": "Myo-Reps", "4": "DC Rest-Pause" }, "basis": "ledger" }
}
```

- Must stay small (a few KB) and use only strings that pass the existing import `safeString` rule (under 2,000 characters, no control characters) and nesting depth well under 12.
- `status` of the *session* stays `draft` / `complete` (never `completed`; see compatibility §A).
- No new `pa_` key is required. The candidate import validator rejects unknown `pa_` keys, so new keys would force a change to the backup patch, which you asked not to modify.
- Existing exercise records in `pa_hist` are unchanged in shape. TCS adds none.

## 13. Worked examples (MODELLED, default constants, uncalibrated)

Full-session sets in parentheses. "Method off" = intensifier extra efforts removed, final set kept straight.

| Template | Min | Policy | Est. min (range) | Kept (planned/full sets) | Omitted - NOT DONE |
|---|---|---|---|---|---|
| Giant A | 12 | breadth | 9.9 (8-11) | Vertical Pull 1/2 | Press, Row, Squat Press, Leg Curl, Lateral Raise, Carry |
| Giant A | 25 | either | 21.2 (18-24) | Press 1/3; Vertical Pull 1/2 | Row, Squat Press, Leg Curl, Lateral Raise, Carry |
| Giant A | 40 | breadth | 31.6 (27-36) | Press 1/3; Squat Press 1/2; Vertical Pull 1/2 | Row, Leg Curl, Lateral Raise, Carry |
| Giant A | 40 | depth | 33.4 (28-38) | Press 3/3; Vertical Pull 2/2 | Row, Squat Press, Leg Curl, Lateral Raise, Carry |
| Giant A | 60 | breadth | 54.0 (46-62) | Press 3/3; Row 1/2; Squat Press 1/2; Vertical Pull 2/2; Carry 1/3 | Leg Curl, Lateral Raise |
| Giant A | 60 | depth | 48.1 (41-55) | Press 3/3; Squat Press 2/2; Vertical Pull 2/2 | Row, Leg Curl, Lateral Raise, Carry |
| Giant A | 90 | breadth | 77.0 (65-89) | all 7 slots at full sets; Leg Curl and Lateral Raise method off; no loaded stretches | none |
| Giant A | 110 | breadth | 90.4 | Full Session unchanged | none |
| Giant B (group 0) | 12 | breadth | 10.1 (9-12) | Vertical Pull 1/2 | Incline Press, Hip Hinge, Rear Delts, Biceps, Triceps, Widowmaker, Calves |
| Giant B (group 0) | 25 | breadth | 18.3 (16-21) | Incline Press 1/2; Vertical Pull 1/2 | the other 6 |
| Giant B (group 0) | 40 | breadth | 33.3 (28-38) | Incline 1/2; Vertical Pull 1/2; Hip Hinge 1/2; Biceps 1/2 (method off) | Rear Delts, Triceps, Widowmaker, Calves |
| Giant B (group 0) | 60 | breadth | 52.1 (44-60) | Incline 2/2; Vertical Pull 2/2; Hip Hinge 2/2; Rear Delts 1/2 (method off); Biceps 2/2 (method off); Triceps 1/2 | Widowmaker, Calves |
| Giant B (group 0) | 90 | breadth | 80.3 (68-92) | all 8 slots at full sets; no loaded stretches | none |

Full table with both policies: `model/worked_examples.json`.

**Findings from the model that you should weigh (not hidden):**
1. **10-11 minutes is infeasible** on both Giant templates under the default (cool-down-trimmed) model, and 10-15 minutes yields a single movement with its warm-up. The honest outputs at 10-15 minutes are therefore: a one-movement plan (from 12 min), or "reschedule". Mobility is an *existing* separate session; the planner may *mention* it as an option the athlete can choose themselves, never select it.
2. **Time is not always fully used.** Because warm-up for a movement is a fixed cost, the plan can leave 4-10 minutes unused (Giant A at 20 or 35 min; Giant B depth at 40). The planner says so; it does not fill the gap with work the athlete did not choose. A "use remaining time" step is possible but adds complexity (D2).
3. **Depth vs breadth differ materially** (Giant A, 40 min: three single sets versus bench and pull at full sets).
4. **Cool-down policy changes plans materially** (§6 table).

## 14. Known limitations
- All timing is modelled; none is measured.
- Tier order, warm-up tagging, cool-down trimming and the 10% / 15% / 14-day constants are drafts awaiting you.
- Real-device behaviour (mobile layout of the preview, timer interplay, resume after the OS kills the tab) is untested; it is a pre-release gate, not a claim.
- Non-lifting templates have only a behavioural profile, not numbers.
- `bu`/`bl` and variants are not modelled. They have no rotation of the Giant B kind (fixed defaults by slot label), so the rotation correction does not apply to them.
