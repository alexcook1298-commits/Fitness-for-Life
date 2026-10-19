# Intensifier-Rotation Correction — State Model (design only)

**Status: DESIGN ONLY.** No app file or stored record is changed. The state model is made executable in `model/rotation_model.js` (not loaded by the app); its 15 checks all pass (`model/rotation_model_results.json`). Those checks test the *design* against synthetic histories. They are not tests of the app.

## 1. What the app does today (VERIFIED)

Source (baseline `index.html`):

```
474  function completedTemplateCount(k){return sessions?.filter?.(x=>x.status==='complete'&&x.template===k).length||0}
475  function giantBRotation(i,n){
476   const cycle=completedTemplateCount('b')%3, activeSlots=[[3,4],[1,5],[0,6]][cycle];
```

- Giant B rotates which slots carry their default intensifier: group 0 = slots 3,4 (Rear Delts, Biceps), group 1 = slots 1,5 (Vertical Pull, Triceps), group 2 = slots 0,6 (Incline Press, Widowmaker). Slots outside the active group run **Straight Sets**. Slot 2 (Hip Hinge, RDL) never rotates in. In group 2 the Incline Press default is itself Straight Sets for the dumbbell exercise, so group 2 is in practice the Widowmaker slot.
- The group is **`(number of sessions with status 'complete' and template 'b') mod 3`**, evaluated live at render time.
- It applies to template `b` only. `bu`/`bl` use fixed per-slot defaults (`extraBDefaultInt`) and `a` has no rotation. A stored per-slot `pa_int_*` default bypasses it.

**Defects relative to your decision 5 (VERIFIED where marked):**
1. **A completed workout advances the rotation whether or not the intensifier was performed.** Finishing requires only one logged record or one checked item (`finishSession`), so a B in which the presented intensifier slots were never done still advances. (Verified for compact B in `audit/data/probe_compact_rotation_baseline.json`: after one compact B and after one full B the next B is identical: `identical: true`.)
2. **COMPACT hides non-kept slots,** so the presented intensifier slots are often not performed, yet count (the same probe).
3. **The count is global, not exposure-based:** a skipped group is simply skipped, and its method may not recur for three more B sessions. (Inference from 1 and 2, not separately measured.)
4. **Interrupted drafts do not advance** (status is not `complete`) even if the intensifier was done. (Source-verified by the predicate.)

## 2. What "performed" means (VERIFIED from `saveCluster` and the record rules)

- A structured intensifier record exists only after `saveCluster` succeeds. Myo-Reps needs at least 2 efforts. Rest-Pause, DC Rest-Pause and FST-7 need all of their stages. Widowmaker is a single-set record.
- `pa_hist` ids are `sessionId|slot|name|set|mode`; `date` is the log-time.
- So **"performed" can be derived from records that already exist.** No new field is needed to know whether Myo-Reps on Rear Delts really happened in session S.

## 3. Options considered

| Option | Description | Problem | Verdict |
|---|---|---|---|
| A | Keep the counter as is | Does not fix defects 1-4 | Rejected |
| B | New per-group ledger in a new `pa_` key | The candidate backup validator rejects unknown `pa_` keys; adding one needs a validator change to a patch you said not to modify; second source of truth that can disagree with `pa_hist` after a restore | Rejected |
| **C** | **Derive credit from session snapshots + `pa_hist` at read time; snapshot the presented group into the session when it starts** | Slightly more computation (trivial at this data size); needs the snapshot field | **Recommended** |
| D | C, but also re-derive *historical* credit from `pa_hist` for every old B | Changes which group is next for existing users at upgrade; rewrites the *meaning* of history (not the records) | Optional, off by default (decision R3) |

## 4. Recommended state model (Option C)

### 4.1 Stored state: one additive snapshot per Giant B session

```json
"rotation": { "v": 1, "group": 0, "slots": [3, 4],
              "methods": { "3": "Myo-Reps", "4": "DC Rest-Pause" },
              "basis": "ledger" }
```

- Written once, when the session is created by `start('b')`, from the derived "next group" (§4.3). It is the **presentation record** ("what this session offered").
- The session's rendering uses the snapshot, not a live recomputation. This is required: under Option C the derived ledger changes as soon as records are logged, so a live computation would flip the displayed intensifiers *during* the workout. (Today this cannot happen because the count only changes at finish.)
- Resume of a draft uses its own snapshot, so a resumed draft is identical to when it started.
- `methods` records what `todayInt` produced for each presented slot at start. A mid-workout exercise swap that changes the method is judged by the record's `mode` (§4.2).
- Sessions with no `rotation` field are **pre-era** (all existing history).

### 4.2 Credit rule (evidence-based, idempotent)

A session S with a snapshot **credits** group `g = S.rotation.group` at most once, if:
1. at least one presented slot `i` (in `S.rotation.slots`) has a non-straight presented method, and
2. a **structured, complete** `pa_hist` record exists with `sessionId = S.id`, `slot = i`, `mode != 'Straight Sets'`, under the existing completeness rules (§2).

Notes:
- **Session status does not matter for credit.** A draft that performed the intensifier credits it (the work was done). A finished session that did not, does not.
- **Credit policy (decision R1):** `any` (recommended: one presented slot performed credits the group) or `all` (every presented intensifier slot must be performed). The model supports both.
- **A group with no non-straight presented method** (e.g. a swapped exercise whose default is straight) credits when the session is `complete`, so rotation cannot stall on a group that offers nothing to perform.
- **Manual overrides do not credit.** If the athlete sets Myo-Reps on a slot outside the presented group, it does not credit that other group (only what the plan prescribed and the athlete did counts).
- **Partial intensifiers earn nothing:** an incomplete cluster is not a structured record, so no credit. (Open question R2: whether a partial exposure should count; default no.)
- **Skipped / hidden slots** (COMPACT, TCS omission, manual skip) produce no records, so no credit.
- Credit is keyed `(sessionId, group)`, so duplicates (a merged restore, a repeated record id, a resumed draft) cannot double-count.

### 4.3 Derivation of the next group

Process Giant B sessions in chronological order, keeping `last[g]` (position of the last credit of each group):

1. **Pre-era sessions** (no `rotation`): each `status === 'complete'` one credits group `k mod 3`, where `k` is its index among pre-era complete B sessions. This reproduces the legacy counter exactly (parity, §5).
2. **New-era sessions**: credit per §4.2.
3. **Lapse rule (decision R4):** if a *finished* session presented group `g` and earned no credit, that is an *uncredited presentation*. After `lapseAfter` consecutive uncredited finished presentations of the same group (default 2), the group is moved to the back (a lapse marker, not an exposure). This prevents a group the athlete cannot or will not do (for example because of an elbow limitation) from blocking rotation forever and prevents repeated unintended exposure of the same group. A draft with no records neither credits nor counts toward the lapse.
4. **Next group** = the group with the oldest `last[g]` (never-credited counts as oldest; ties go to the lowest index 0, 1, 2).

No stored counter. It is recomputed from `pa_sessions_v2` and `pa_hist`, so it is backup/restore-safe and survives any restore because both inputs are in the backup.

### 4.4 State diagram (per session)

```
(start B) -> PRESENTED(g, snapshot)
PRESENTED --records show presented method performed--> CREDITED(g)   [rotation advances past g]
PRESENTED --finished, no evidence, streak < lapseAfter--> UNCREDITED(g)  [g offered again]
PRESENTED --finished, no evidence, streak = lapseAfter--> LAPSED(g)  [g moved back; no exposure counted]
PRESENTED --draft, no evidence--> OPEN [no effect; resume keeps the snapshot]
```

### 4.5 Interaction with TCS
- A TCS Giant B snapshots the **same group the Full Session would have shown**, so TCS and Full are interchangeable for rotation purposes.
- TCS removes intensifier efforts early in its ladder (after loaded stretches). A removed method produces no non-straight record, so no credit and the group is offered again at the next B (subject to lapse). Nothing is "owed": the next B is a normal Giant B that simply shows the group.
- TCS never *adds* an intensifier to compensate for earlier omissions.
- Rotation credit is independent of whether the session is a TCS, a COMPACT or a Full session. The rule is "was it performed."

## 5. Compatibility

**Parity guarantee (tested in the model).** For any history with no snapshot sessions, the derived next group equals the legacy `completedTemplateCount('b') % 3` result (checked for 0-40 sessions, ROT-PARITY-01), and for any mixture of pre-era sessions followed by fully performed new-era sessions the sequence continues 0,1,2,0,... (200 randomized trials, ROT-PARITY-03). So an athlete who always performs the presented intensifiers sees **no change at all**.

**Where behaviour deliberately differs:** only after a new-era B in which a presented intensifier was not performed. The group is offered again rather than skipped. This is the correction you asked for.

**Historical records.** No `pa_hist` record, session or key is modified. Derivation is read-only (ROT-HIST-01 deep-freezes the inputs). Pre-era sessions that were compact or skipped intensifiers still count under the legacy rule, because re-judging them would change the upgrade behaviour. Option D (re-derive from records) is available if you want a one-time "recalibrate from my history" action (R3).

**Status string.** Pre-era credit uses exactly `status === 'complete'`, as today. (The reliability patch accepts `complete` and `completed` in `recentSessions` only. The app never writes `completed`, and the candidate backup validator accepts only `draft` and `complete`, so the rotation does not widen the status set.)

**`pa_int_*` stored defaults** still bypass the rotation as today (unchanged); the credit rule only looks at records, so a stored default simply produces records or does not.

## 6. Edge cases and their intended results

| Case | Result |
|---|---|
| Presented method performed fully | Credited; rotation advances |
| Intensifier skipped, session finished | Not credited; same group offered next; lapse after 2 |
| Intensifier partially done (1 Myo effort; incomplete rest-pause) | Not credited (R2) |
| Only one of two presented slots performed | Credited under `any`, not under `all` (R1) |
| Draft interrupted after performing it | Credited once; resuming and finishing does not double-count |
| Draft interrupted before performing it | No credit, no lapse count |
| Compact or TCS B hid the slots | Not credited |
| Manual override of a slot outside the group | No credit for the other group |
| Duplicate session or record after restore/merge | Counted once |
| Pre-era history only | Identical to the legacy counter |
| Group offers no non-straight method | Credited when the session completes |
| Two B sessions the same day | Each is judged on its own snapshot; the second sees the first's credit |
| Restore from an older backup | Derived from restored data; no separate counter to disagree |

## 7. Risks
- **R-1 Two B sessions started from stale state.** Both snapshot the same group (e.g. a draft left open, then a new `start('b')`). `start(k)` already resumes a same-template draft, so this needs the athlete to have two devices; credit is per session and idempotent, so the worst result is the same group offered twice (bounded by the lapse rule).
- **R-2 Snapshot field absent after a restore from an older backup:** the session is pre-era and is treated as legacy. Safe.
- **R-3 Behaviour change for compact/skip-prone users:** intended, but visible. Show a one-line explanation in the B header ("Rotation: Group 1 offered again — last session's method wasn't done").
- **R-4 Credit policy and partial exposure are judgement calls:** see R1/R2 in the decisions document.
- **R-5 Not verified in the real app.** The model validates the design's logic, not the integration. The test plan has app-level tests (`TCS-ROT-*`) to write first.
