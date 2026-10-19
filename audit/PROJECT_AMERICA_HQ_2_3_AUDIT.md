# Project America HQ 2.3 — Program, Sports-Science & Software Audit

**Status: AUDIT ONLY. Nothing in the application, baseline, tests or user data was modified, deployed or installed.**
Everything below is read-only analysis plus separate scripts in `audit/scripts/` and their synthetic-data outputs in `audit/data/`.

**Revision 2 (roadmap update, planning only).** Per your instruction, the roadmap no longer recommends shortening the default workouts because of their duration. Giant A/B and the optional sessions stay exactly as programmed, and **Full Session remains the default**. Where the earlier text treated session length as a defect or a reason to remove work (SW-12, P2-1, P2-2, ROI item 5, three narrative remarks), it has been rewritten. Time pressure is now addressed by an **optional Time-Constrained Session mode**, planned in section I.1 and finding SW-17. Nothing is implemented; the existing program is unchanged.

---

## 0. How to read this document

### 0.1 Evidence labels

| Label | Meaning |
|---|---|
| **VERIFIED** | Reproduced by a script in `audit/scripts/` against the baseline app (headless Chrome, synthetic data) or directly readable in source with a quoted line. |
| **SOURCE-READ** | Established by reading the code; not exercised at runtime. |
| **MODELLED** | Derived from a stated model (assumptions listed). An estimate, not a measurement. |
| **JUDGEMENT** | Training-science or design opinion. Not a defect. |
| **UNTESTED** | Not examined, or not examinable with available material. |

Severity: P0 safety/data integrity, P1 high impact, P2 performance/efficiency, P3 optional. Confidence: High / Medium / Low.

### 0.2 Sources examined (discovery)

| Source | Status |
|---|---|
| `baseline/hq-2.3/index.html` (220,861 bytes) — authoritative HQ 2.3 | Examined. All line numbers below refer to this file. |
| `app/index.html` — Sprint 1 backup/restore candidate (`082bff0`) | Examined. Program data (31 structures dumped) is **byte-identical** in JSON to baseline (`diff -rq audit/data/baseline audit/data/candidate` clean). The candidate changed no workout logic. |
| `README.txt`, `CHANGELOG_*.txt`, `sw.js`, `install.js` | Examined as documentation of intent only. |
| Deployed/live app | **Not available.** UNTESTED. |
| "Fuel" app source | **Not available.** UNTESTED. |
| Historical user backups / real workout history | **Not available.** All behaviour tested with synthetic data. No claim about the athlete's real data. |
| Real iOS/Android devices | **Not tested.** Viewport tests were emulated 390×844 in Chrome only. |

### 0.3 Names in the brief that do not exist in the source (VERIFIED by search)

- **"ENGINE A / ENGINE B"** — there is one `conditioning` template (subtitle "ENGINE"). It always renders both a Zone 2 card and an Intervals card (`special`, lines ~425–426). Monday and Saturday show the same screen. "ZONE 2 + ABS A" and "INTERVALS + ABS B" exist only as labels in `PA20.schedule` (~1310) and Schedule Negotiator text.
- **"FORGE"** — 0 occurrences.
- **"ABS A / ABS B"** — no abs workout content exists. Core exercises are only in optional Giant C (3 direct sets) and the reference library.

These are reported as *documentation/label vs. implementation gaps*, not as defects in code that exists.

### 0.4 Method and reproducibility

```
node audit/scripts/extract.js baseline/hq-2.3 audit/data/baseline        # dumps 31 program structures
node audit/scripts/effective_prescription.js ...                          # 130 effective-default rows
node audit/scripts/behavior_probes.js  baseline/hq-2.3 audit/data/probes_baseline.json   # P1–P8
node audit/scripts/behavior_probes2.js baseline/hq-2.3 audit/data/probes2_baseline.json  # Q1–Q5
node audit/scripts/analysis.js ...                                        # weekly-set matrix + duration model
```

Self-correction during the audit: an early probe flag (`sideLogging: true`) was a false positive caused by matching CSS (`text-align:left`). The probe was fixed to use visible text and the log-function source; it now reports `sideWordsInVisibleText:false`, `sideFieldInLogSetSource:false`. The conclusion (no left/right logging) was confirmed by reading `logSet`/`baseRecord` (lines ~1100–1115).

### 0.5 Evidence-base caveat

Citations in Section 8 were checked against live search results (titles, journals, numbers in abstracts/summaries). I did **not** read full texts. Items marked *provisional* rest on secondary summaries (e.g. tendon-loading parameters). Nothing here is clinical advice. Items needing professional clearance are tagged **[CLINICIAN]**.

---

## A. Executive assessment

**Overall:** HQ 2.3 is a well-organized, internally consistent *logging and prescription-display* system. The training template is competently built around full-body-ish Giants A/B, intensifiers restricted to the last set, strength methods restricted to main lifts, and knee/elbow-friendly exercise choices (hack/leg press/machines, supported rows). The data it records for hypertrophy intensifiers is accurate and structured.

It is **not** an adaptive coach. Its "OS" layer (readiness, evidence engine, adaptive plan, schedule negotiator) is mostly advisory text, and two parts are demonstrably broken or misleading:

1. **VERIFIED defect:** the weekly Training Budget, Progress Story, AAR and Coach Handoff all report **zero completed sessions** because `finishSession` writes `status:'complete'` (line 1149) while `recentSessions` filters `'completed'` (line 1321).
2. **VERIFIED weakness:** the Evidence Engine flags false "deteriorating" states (up to **ACT**) from normal rep-range/intensifier variation; progression targets ignore reps and can point at a back-off load.
3. **VERIFIED design gap relevant to this athlete:** the app has no knee-specific logic, no left/right logging, no pain/symptom field, no return-to-run/jump criteria, and the readiness score can show **GREEN** with joints = 1/5.

**Program (JUDGEMENT):** default weekly volume is low for the stated size goals (e.g. 3 direct quad sets, 2 direct sets each for biceps/triceps/side/rear delts and calves in a normal A+B week). That may be a deliberate knee- or elbow-conserving choice, but it is not compatible with "Reacher-like size" unless the optional Upper/Lower days (or extra sessions) are run — and the optional Lower day (`bl`) concentrates 11 direct quad sets (17 counting intensifier efforts) into one session, a large jump for a post-ACL/MCL/meniscus knee **[CLINICIAN]**.

**Athletic goals (JUDGEMENT/VERIFIED coverage):** sprinting is supported only to 10–20 m once weekly; no rope-climb work exists at all; jumping is CMJ 3×3 only; there is no hamstring-specific (Nordic/eccentric) or approach-jump work. The pull-up goal is represented by a weighted pull-up slot with a hard-coded skill tree that does not scale with bodyweight.

**Verdict:** *Usable and safe to keep logging with*, **not** ready to be trusted as an adaptive progression/injury-management system. Highest-value work is (1) fixing the status-string mismatch, (2) making readiness/progression logic honest or removing misleading claims, and (3) a clinician-reviewed knee/elbow plan before any volume or intensity increase.

---

## B. Complete program inventory

### B.1 Schedule (`PA20.schedule`, ~1310; SOURCE-READ and matches brief)

| Day | Label | Template |
|---|---|---|
| Sun | Giant A | `a` |
| Mon | Zone 2 + Abs A (label only) | `conditioning` |
| Tue | Giant B | `b` |
| Wed | Mobility | mobility |
| Thu | Athletic | `athletic` |
| Fri | Mobility | mobility |
| Sat | Intervals + Abs B (label only) | `conditioning` |

Optional: `bu` (Giant B Upper), `bl` (Giant B Lower), `c` (Giant C). Block 2–7 variants (`BLOCKS`, 788–911) and practice sessions (`bodycontrol`, `athletepractice`, `combatintro`, `waterpractice`, `carrypractice`, `practicalskills`; 914–986).

### B.2 Exercise library (lines 254–299; VERIFIED counts)

- 225 `E(...)` entries, 223 unique names (duplicates: `Farmer Carry (DB)`, `Tibialis Raise`).
- **101** are offered in at least one slot; **122 are reference-only** and cannot be logged in a workout (e.g. Nordic Curl, Back Squat, Trap-Bar Deadlift, Sled Push, Pendlay Row).
- Only **71 of 223** have exercise-specific description text (12 in `EX_GUIDE`, 60 in `VARIANT_NOTES`); others get generic keyword text.
- **69** offered options have no exact loaded-stretch entry and fall back to muscle-level text (e.g. Bulgarian split squat, leg extension and hack squat all receive the identical "Loaded Quad Bottom Hold").

### B.3 Effective default prescription (VERIFIED, `effective_prescription.json`, 130 rows)

**Giant A (7 slots, 14 straight sets)**

| Slot | Default | Sets × reps | Method |
|---|---|---|---|
| Horizontal Press | Bench Press (BB) | 3 × 4–8 | Primer + Paused Top/Back-Offs |
| Horizontal Row | Chest-Supported Row (DB) | 2 × 6–10 | Cluster Sets |
| Squat Press | Hack Squat | 2 × 6–10 | Top Set + Back-Offs |
| Leg Curl | Seated Leg Curl | 2 × 8–12 | Final set Myo-Reps |
| Lateral Raise | Cable Lateral Raise | 2 × 10–20 | Final set Myo-Reps |
| Vertical Pull | Weighted Pull-Up | 2 × 4–8 | Cluster Sets |
| Loaded Carry | Farmer Carry (DB) | 3 × 30–60 s | Load/Distance Progression |

**Giant B (8 slots)** — Incline DB 2×8–12 (straight), Lat Pulldown 2×8–12, RDL (BB) 2×6–10 @ RIR 2 (straight), Rear-delt fly 2×12–20, Curl 2×8–12, Pressdown 2×8–15, Widowmaker (Leg Press) 1×15–20, Calf 2×8–15. Intensifier budget rotates every 3rd completed `b` session (`giantBRotation`, line 475): cycle 0 rear-delt Myo-Reps + curl DC Rest-Pause; cycle 1 pulldown Rest-Pause + pressdown Myo-Reps; cycle 2 Widowmaker only. The Widowmaker slot is therefore a straight single set in 2 of 3 cycles.

**`bu` (optional Upper, 9 slots):** 17 straight sets + 32 staged efforts; every slot has an intensifier, including FST-7 laterals.
**`bl` (optional Lower, 8 slots):** RDL 3, Hack 3, Leg Press 3 (final-set Widowmaker), Bulgarian 2, Leg Curl 3 (Myo), Leg Extension 3 (final FST-7 = 2 + 7 efforts), Adductor 2 (RP), Calves 4 (Myo). 11 direct quad sets / 17 efforts.
**`c` (optional):** weighted pull-up, OHP, carry, core, dead hang.

**Conditioning (`special`, 425–426):** Zone 2 "25–40 min • conversational pace"; Intervals "15–20 sec hard • then recover", 6 rounds, 90 s rest (~2 min total hard work).
**Athletic:** 10 m ×3, 15–20 m ×2, CMJ 3×3, pogos, snapdown, skater→stick, dead hang, scapular pull-up.

### B.4 Intensifiers (line 442) and strength methods (511)

- **9 hypertrophy intensifiers:** Straight Sets, Rest-Pause, DC Rest-Pause, Myo-Reps, FST-7, Widowmaker, BFR, Lengthened Partials, Mechanical Drop Set.
- **12 strength methods:** Straight Heavy Sets, Top Set + Back-Offs, Cluster Sets, Heavy Primer + Work Sets, Primer + Paused Top/Back-Offs, Paused Reps, Wave Loading, Dead-Stop/Pin Work, Speed/Dynamic Work, Rep-PR Set, Density Progression, Load/Distance Progression.
- Stages per method (`methodStages`, 1085): DC RP 3, RP 3, Myo 4 (expandable to 20), FST-7 7, BFR 4, Lengthened Partials 2, Mechanical Drop 3.

### B.5 Resolution of intensifier on a given set (SOURCE-READ, 507, 1066, 1077)

`todayInt` returns Straight Sets when the session is compact, the slot is strength-eligible, or week mode is busy; otherwise stored value or `getInt`→`autoDefaultInt`. The intensifier applies only on the final work set (`setMode(i,j,n)` when `j===workSetCount(i)`). **Strength-method slots cannot carry hypertrophy intensifiers** (by design).

---

## C. Workout-by-workout analysis

**Giant A (Sun).** MODELLED ≈ 87 min (70 core + 12 warm-up + 5 cool-down; 79 without loaded stretches). On a 390 px phone ≈ 11,800 px tall (~14 screens). Strengths: main lifts prioritized, strength methods only where progression is measurable, intensifiers limited to isolations. Concerns: (1) Weighted pull-ups under **Cluster Sets** and Squat Press under **Top Set + Back-Offs** are reasonable but the app cannot record rest or side; (2) loaded stretches on 7 slots add ~8–10 min and include deep-flexion loaded knee holds **[CLINICIAN]**; (3) the modelled duration is informational only. The full session is the intended stimulus and is not a defect; days when less time is available are handled by the optional Time-Constrained Session mode (section I.1), not by shortening this template.

**Giant B (Tue).** MODELLED ≈ 73–76 min; 8 loaded stretches; ≈12,700 px. Hinge (RDL) at RIR 2 is appropriately conservative. The single Widowmaker leg-press set is rotated in 1 of 3 cycles (good for knee dose control) but is a 15–20 rep deep-flexion effort at "RIR hard" — **[CLINICIAN]** whether acceptable. DC Rest-Pause curls on cycle 0 stress the elbow flexors the athlete has tendinopathy history in (JUDGEMENT; see §G).

**`bu` (optional).** MODELLED ≈ 101 min, 9 loaded stretches, ≈19,400 px (~23 screens). Intensifier on every slot including FST-7 laterals is intensifier-forward; chest rises to 11 direct sets and lats to 9 in an extra-time week. Warm-up is the Giant B ramp (incline press) — reasonable for Upper.

**`bl` (optional).** MODELLED ≈ 105 min. Quads jump from 3 to 14 direct sets/week (20 counting efforts). Warm-up is the Giant B bookend (**incline-press ramp, RDL primer; no squat/leg-press ramp** — `GIANT_BOOKENDS.bu=GIANT_BOOKENDS.bl=GIANT_BOOKENDS.b`, line 911). Highest single-session knee load in the app.

**`c` (optional).** ≈ 65 min. Only source of direct core work (3 sets) and dead hang.

**Conditioning (Mon/Sat).** Zone 2 25–40 min at "conversational pace" with no HR/RPE guidance; Intervals ≈ 2 min total hard work (very low dose for an "interval" day). Saturday intervals precede Sunday Giant A (squat press, pull-ups) — SOURCE-READ.

**Athletic (Thu).** Reasonable low-dose speed/jump exposure but capped at 20 m and CMJ. `athletepractice` (block 4) is explicitly "not a prescription for maximal sprinting".

**Mobility (Wed/Fri).** Present; no knee- or elbow-specific content.

---

## D. Muscle-group coverage matrix (VERIFIED/MODELLED, `analysis.json`)

Weekly programmed *direct* sets; indirect sets weighted 0.5 for the "indirect" column; parentheses = counting each intensifier effort (Myo-Rep, RP, FST-7 stage) as a set ("efforts"). These are programmed sets, **not effort-adjusted**.

| Muscle | Normal A+B week (direct) | Indirect (×0.5) | With `bu` | With `bl` | Assessment (JUDGEMENT) |
|---|---|---|---|---|---|
| Chest | 5 | 0 | 11 | 5 | Low for size goal unless `bu` run |
| Lats | 4 (4.7 efforts) | – | 9 | 4 | Low-moderate; pull-up goal is supported by weighted pull-up slot |
| Mid-back/upper back | 2 | 0 | 5 | 2 | Low |
| Quads | **3** | 0 | 3 | **14** (17 in one session) | Very low normal; sharp jump with `bl` |
| Hamstrings | 4 (7 efforts) | 0 | 4 | 10 | Moderate |
| Glutes | 2 | 1 | 2 | 5 | Low |
| Biceps | 2 | 3 | 5 | 2 | Low direct |
| Triceps | 2 | 2.5 | 5 | 2 | Low direct; no overhead variant |
| Side delts | 2 (5 efforts) | 0 | 5 | 2 | Low direct |
| Rear delts | 2 (3 efforts) | 1 | 5 | 2 | Low |
| Front delts | 0 | 2.5 | 0 | 0 | Fine (pressing covers) |
| Calves | 2 | 0 | 2 | 6 | Low |
| Adductors | 0 | 0 | 0 | 2 | Minimal |
| Core | **0** | 0 | 0 | 0 | No direct core except optional Giant C (3) |
| Grip/trunk/traps | 3 | 0 | 3 | 3 | Carry only |

*Observations:* the normal week sits below the ≥10-sets/muscle region where the Schoenfeld 2017 meta-regression showed the largest gains (trend only), and Pelland 2025 shows continued but diminishing returns. Whether low volume is intentional (time, knee, elbow) is unknown; I flag it as a **goal/volume mismatch**, not a bug. Alternating `bu`/`bl` weeks halves the extra figures.

---

## E. Intensifier matrix

Decision labels: **Retain / Modify / Restrict / Remove**. These are recommendations only — no change is made.

| Method | Where used (default) | Evidence (see §8) | Athlete-specific risk | Recommendation |
|---|---|---|---|---|
| Straight Sets | Bench/incline/RDL/hinge/etc. | Baseline; comparable hypertrophy to advanced methods (PMC11022786) | None | **Retain** |
| Myo-Reps | Cable lateral, leg curl, rear delt, pressdown | Bradshaw 2026: similar size/strength with ~30% less volume load | Pressdown Myo-Reps on elbows (JUDGEMENT) | **Retain** for laterals/curls/rear delts; **Modify** pressdown (RIR cap) |
| Rest-Pause | Lat pulldown | Modest hypertrophy advantage in one meta-analysis (PMC12922048); time-efficient | Low | **Retain** |
| DC Rest-Pause | Biceps curls (cycle 0) | No unique evidence beyond Rest-Pause | Distal biceps/elbow flexors, tendinopathy history | **Restrict** (cap intensity or move to machines/cable; **[CLINICIAN]**) |
| FST-7 | Lateral (bu), leg extension (bl) | Advanced-system pooled hypertrophy effect ≈ 0 (g = 0.046, n.s.) | Leg extension FST-7 = 9 loaded knee-extension efforts in one session, post-ACL knee **[CLINICIAN]** | **Restrict** (keep on side delts; remove from leg extension pending clearance) |
| Widowmaker | Leg press/hack (B, bl) | Anecdotal; no direct RCT located | High-rep deep-flexion knee loading, high systemic cost | **Restrict** (**[CLINICIAN]**); rotation (1 in 3) is appropriate |
| BFR | In list, stages defined (30/15/15/15) | Not reviewed in depth | **No cuff pressure, safety screening or contraindication text in source** (grep: no "occlusion/cuff/blood flow") | **Restrict**: do not recommend use until safety guidance exists; not a default anywhere |
| Lengthened Partials | In list | Wolf 2023: trivial full-ROM advantage overall, possible lengthened-partial advantage (wide CI) | Elbow at long length; knee deep flexion | **Retain** as option; **Modify** for elbow/knee exercises |
| Mechanical Drop Set | In list | Drop sets ≈ equal hypertrophy, time saved (Sports Med Open 2023) | Low | **Retain** |
| Loaded stretch (every slot) | 7–9 per session | Warneke 2024: small chronic-stretch hypertrophy effect (d≈0.20) mainly with ≥15 min/session, >6 wk, frequent; applies to calf/ankle in that literature | Deep loaded flexion at knee (hack/leg press/Bulgarian/leg ext. text identical); long-length biceps (incline/Bayesian) and overhead triceps for elbows | **Safety review only** (not for duration): knee and elbow holds need clinician clearance (§G.1). Full-session content is otherwise unchanged. In a Time-Constrained Session these holds are among the first items to be omitted (section I.1) |

Strength methods: appropriately limited to 5 slot labels; methods are not hypertrophy intensifiers and are stored as `strengthMethod`. See finding SW-06 for reporting distortions.

---

## F. Athletic capability matrix

| Goal | What the app provides (VERIFIED) | Gap (JUDGEMENT unless noted) | Support level |
|---|---|---|---|
| **Sub-5.0 s 40-yd** | Thu athletic: 10 m ×3, 15–20 m ×2; free-text test log; skill tree `SPEED` (5 nodes) | No >20 m, no max-velocity or flying sprint, no timing method field (VERIFIED), no hamstring Nordic/eccentric in any slot (library only) | **Weak** |
| **10-ft rim dunk** | CMJ 3×3, pogos, skater→stick; `DUNK` skill tree | No approach/one-leg jumps, no depth/loaded jumps, no height log with method; jump exercise list contains only "Cable Wood Chop" (VERIFIED) | **Weak–moderate** (plyometric evidence supports CMJ gains, Stojanović 2017 ES 1.09, Ramirez-Campillo 2020 ES 0.82, but **[CLINICIAN]** for post-ACL knee) |
| **15-ft arms-only rope climb** | Dead hang, scapular pull-up, weighted pull-up, carries | **No rope-climb or towel/rope pull exercise** (`hasRopeExercise: []`, VERIFIED); no legless climb progression | **Weak** |
| **10 strict pull-ups at 300 lb system weight** | Weighted pull-up default (Giant A, Cluster Sets); `PULL` skill tree | Skill nodes hard-coded ('10 strict BW', '+25', '+45', '+70', '+90', '300-lb ×10') and **do not scale with editable bodyweight** (default 189 lb → +111 lb added = elite-level target) | **Moderate** (tracking) / **Low** (specificity) |
| **Captain America physique + Reacher size** | Hypertrophy templates and intensifiers | No target bodyweight/composition, no calorie/protein logic (VERIFIED `fuel:{}` unused) | **Moderate** |

**Goal conflict (JUDGEMENT):** large-muscle-mass accrual, a sub-5.0 s 40, and a 300-lb-system-weight pull-up compete on bodyweight; the app does not model this. Concurrent training evidence (Schumann 2022) shows hypertrophy and max strength are preserved, but *explosive strength* is attenuated, more so when done in the same session.

---

## G. Safety and recovery assessment

### G.1 Items requiring professional clearance **[CLINICIAN]**
- Left-knee progression and any quad volume jump (`bl`: 3 → 14 direct sets/week).
- Loaded deep-flexion holds on hack/leg press/Bulgarian/leg extension.
- Widowmaker and FST-7 leg extension.
- Return-to-run and return-to-jump criteria (app has none; Grindem 2016: return to level-I sport before 9 months → higher reinjury rate, quadriceps strength symmetry predicted reinjury — the app cannot record left/right strength).
- Elbow loaded stretches (incline/Bayesian curl holds, overhead triceps) and DC Rest-Pause on curls, given bilateral tendinopathy history. Evidence for exercise in tendinopathy is real but small with low certainty (BJSM 2020 meta-analysis); load-management parameters I looked up (Cook & Purdam continuum; HSR parameters) are **provisional**.

### G.2 What the app does well
- Compact mode/busy mode strip intensifiers and cap sets (VERIFIED, probes Q1/Q2).
- Machine/supported variants are the defaults for knees and spine.
- Hinge is at RIR 2, not failure.
- Final-set-only intensifier placement limits fatigue.

### G.3 What it does not do (VERIFIED)
- No left/right logging; no side field in `logSet`/`baseRecord`.
- No pain/symptom field anywhere (finish panel: Recovery Good/Mixed/Poor + notes).
- No knee-specific logic; only generic text ("pain-free", "knees tracking naturally", "Joint discomfort").
- No rest/tempo logged; `clusterSplit` is free text, no intra-cluster rest.
- Readiness check-in is a single overwritten object; no history.

### G.4 Disruption simulations

| Scenario | How tested | Result |
|---|---|---|
| Missed Giant A / B | SOURCE-READ (`todayMission`, 1346) | **Not modelled.** Mission depends only on weekday; no re-planning. |
| Poor sleep | Probe P1 | Readiness is advisory text; prescription identical green vs red (`redEqualsGreenPrescription:true`). |
| Knee irritation | SOURCE-READ + Q4 | **No logic.** "Lower today" only sets `compact=true`. |
| Overtime / extra week | Probe Q1 | `extra` mode adds the optional `bu`/`bl` day; no spacing logic. |
| 3 days off | SOURCE-READ | **Not modelled** (no regression/rebuild rule). |
| Limited equipment | **UNTESTED** | `adaptivePlan(minutes,equipment,intensity)` (1378) has an equipment parameter; substitution quality not probed. |
| Severe DOMS | SOURCE-READ | "Low soreness / freshness" is one of five equally weighted readiness items. |
| High motivation, poor recovery | Probe P1 | Equal-weight sum; joints = 1 with all others 5 → score 84, GREEN, "Run as programmed". |
| 30 min available | Probe P5 | "NO CLEAN SLOT" for A/B; compact versions not scheduled. |
| Weekday-only 45 min | Probe P5 | Same. |
| Only Sun + Mon free | Probe P5 | Giant A Sun, Giant B Mon (consecutive; no recovery spacing check). |

---

## H. Software findings register

Format: **ID — title** · file/function · lines · observed vs intended · severity · confidence · test/probe · action.
All file references are `baseline/hq-2.3/index.html`. Actions are *recommendations*.

**SW-01 — Completed-session status mismatch.** `finishSession` (1144–1149) sets `status='complete'`; `recentSessions` (1321) filters `x.status==='completed'`. Observed: with two complete sessions in storage `recentSessions(7)=0` and `(42)=0`; budget all zeros; coach summary "Completed sessions: 0". Intended: count finished sessions. Other code (474, 1259, 1280, 1288, 1169) correctly uses `'complete'`. **P0/P1 data-integrity of derived views; confidence High; VERIFIED (probe P2).** Action: align the string (one-token change) with a regression test; no stored data changes needed.

**SW-02 — Evidence engine false positives.** `performanceValue` (1324) applies Epley to any rep range; `evidenceDecision` (1325) compares last 4 dates; `maxE1` (751) mixes intensifier records. Observed: Leg Press 300×8 ×3 dates then one 200×20 Widowmaker → values [380,380,380,333], −12.3%, state **ACT** "deteriorating". A progressing leg curl followed by one light day → INVESTIGATE (−10%); bench followed by one back-off-only day → INVESTIGATE (−12.5%). **P1; High; VERIFIED (Q3).** Action: restrict to comparable records (same intensifier/strengthMethod, rep range ≤ 12, top set) and require ≥2 consecutive declines; add tests.

**SW-03 — Progression is advisory text, not an algorithm.** `targetMode` (682) ignores reps: 12 reps and 3 reps both yield "100 lb • progress within Straight Sets". `targetStrength` (546) uses the last logged set: after 200×5 top set and 170×8 back-off, NEXT = "170 lb • earn reps/quality before +5 lb" (the back-off). No double progression, deload, plateau, post-layoff or return-from-injury rule. **P1; High; VERIFIED (P3).** Note: this may be intended as manual "coach-in-pocket"; the README describes guidance. The defect is that the label "NEXT" implies a computed target. Action: pick top set explicitly; add rep-range-aware text; leave algorithm design to a separate approved project.

**SW-04 — Readiness is not safety-aware.** `readinessScore` (1319) = sum of five items ÷ 25 ×100; GREEN ≥76, YELLOW ≥58. Observed: never-checked-in default scores 72 (YELLOW); joints = 1 with all others 5 → 84 GREEN "Run as programmed"; a five-year-old check-in still shows GREEN; no history. **P1 (athlete has joint history); High; VERIFIED (P1).** Action: add joint/pain floor veto and staleness expiry; store dated history. (Behaviour change — needs approval.)

**SW-05 — No pain, side, rest or tempo logging.** `logSet`/`baseRecord` (1100–1115) records `{id,sessionId,name,intensifier,strengthMethod,template,block,setNumber,finalSet,date,w,reps,rir,clusterSplit}`. No side, pain, rest, tempo. **P1 for knee-history athlete; High; VERIFIED (Q4 + source).** Action: additive optional fields (schema-compatible), plus clinician-advised pain scale.

**SW-06 — Strength methods lumped into "Straight Sets" in review.** `performanceSummary` (1279) and Block Review (`openReview`, 1287) filter `intensifier==='Straight Sets'`; strength methods are stored with that value plus `strengthMethod`. Cluster, Paused and Top-Set records are therefore mixed with plain straight sets. **P2; High; VERIFIED (P3 record shapes).** Action: group by (intensifier, strengthMethod).

**SW-07 — Prototype-name collision in `evidenceDecision`.** `by[x.name]` (1325) on a plain object throws TypeError for an exercise named `constructor` (requires hand-edited data). **P3; High; VERIFIED (Sprint-1 QA carry-over).** Action: use `Object.create(null)`/`Map`.

**SW-08 — Adaptive intensity is not applied.** `adaptivePlan`/`applyAdaptive` (1378–1382): "Lower today" sets only `compact=true`; `adaptiveIntensity` is written and never read (grep: single occurrence). RIR placeholders stay 1–2 while the text says "~2–3 RIR". **P2; High; VERIFIED (P6/P6b).**

**SW-09 — Schedule Negotiator ignores recovery and compact fallbacks.** `runSchedule` (1388): fixed minimum minutes (A/B 50, Zone 2 25, intervals 25, athletic 20), preferred days only. No spacing or fatigue check; with 30 min daily returns "NO CLEAN SLOT" rather than scheduling compact versions. **P2; High; VERIFIED (P5).**

**SW-10 — Library: reference-only and duplicate entries.** Lines 254–299: 122 of 223 names never loggable; duplicate names `Farmer Carry (DB)`, `Tibialis Raise`. **P3; High; VERIFIED.** Reference entries named in the brief's goals (Nordic Curl, Sled Push) cannot be used in a workout.

**SW-11 — Skill tree & tests.** `SKILLS` (1361): PULL nodes hard-coded; test values free text; "VERIFIED" tag only means recency (≤70 days) regardless of timing method; Combine has no timing-method field. **P2; High; SOURCE-READ.**

**SW-12 — Duration labels vs. reality (informational).** 50–75 min is labelled "FULL SESSION" (the Adaptive Session time list), while MODELLED durations are A ≈ 87 min, B ≈ 73–76, `bu` ≈ 101, `bl` ≈ 105. This is a labelling mismatch only. The sessions themselves are not recommended for shortening. An honest estimate helps the athlete choose between Full and Time-Constrained. Assumptions: 45 s work/set, 60 s setup/exercise, 65 s per loaded stretch, 12 min warm-up, 5 min cool-down, 25 s per intensifier stage. **P3; Medium (modelled).**

**SW-13 — Warm-up reuse for `bu`/`bl`.** Line 911 sets `bu`/`bl` bookends equal to Giant B: Lower gets incline-press ramp + RDL primer, no quad ramp. Blocks 3–7 and bonus sessions use generic warm-up text. **P2; High; SOURCE-READ.**

**SW-14 — Nutrition absent.** `fuel:{}` in `pa_os_v2` (1315) is unused; no energy/protein logic; Fuel app source unavailable. Documentation/brief gap, not a defect. **Informational; High.**

**SW-15 — Cardio dose and parameters.** Zone 2 text has no HR/RPE; intervals ≈ 2 min total hard work; weekly Zone 2 ≈ 30 min as written; machine fields log duration/distance/resistance/cadence/HR/calories only. **P2; High; SOURCE-READ.**

**SW-16 — Backup/restore.** Covered by Sprint 1 and the Turn-3 QA; out of scope here unless relevant. Candidate not re-audited beyond confirming identical program data.

**SW-17 — Existing reduced-session paths omit work silently and distort the intensifier rotation.** `adaptivePlan` (1378), `applyAdaptive` (1382), `compactSlot` (566), render (666). **P1 (planning input for section I.1); High; VERIFIED (probe + source).**
- The time answer is only a threshold: `compact=minutes<50`. The 10–15, 20–30 and 35–45 min options all produce the same COMPACT result. KEEP/TRADE/CUT lists are static strings per template, not computed from the slots.
- `applyAdaptive` stores only `compact:true` and `adaptiveContext`. Omitted slots are not rendered at all (`if(currentSession?.compact&&!compactSlot(active,i))return`) and are not recorded anywhere, so the athlete cannot see afterwards what was dropped.
- Repeated COMPACT use removes whole muscle groups with no tracking. COMPACT Giant A drops leg curl, lateral raise and carry. COMPACT Giant B drops rear delts, triceps, Widowmaker and calves.
- A finished COMPACT Giant B **advances the Giant B intensifier rotation exactly like a full one** (`completedTemplateCount('b')` counts any `complete` session). In the probe (`audit/scripts/compact_rotation_probe.js`, output `audit/data/probe_compact_rotation_baseline.json`), after one COMPACT B the rotation moves from cycle 0 (rear-delt Myo-Reps, curl DC Rest-Pause) to cycle 1. Cycle 0's intensifiers were never performed and are not made up.
- Warm-up and cool-down bookends are rendered unchanged in COMPACT (`renderBookend`, 666), so they are neither adapted nor reduced.
- Skipped work is **not** marked completed: completion rests on logged records or checks. The risks are invisibility and the rotation counter, not false completion.
- The ≤15 min text says "Do not create make-up debt", while section I.1 needs a visible record of what was deferred. Both can hold if deferrals are optional, capped suggestions (see I.1).

**Unresolved/UNTESTED:** deployed app behaviour; real-device Safari/iOS; equipment-substitution quality; BFR flows beyond text; offline/service-worker behaviour (`sw.js`); accessibility audit; performance on large histories.

---

## I. Optimization roadmap (recommendations only — nothing approved or implemented)

Each item: current → proposed · justification · benefit · downside · effort · testing · data/behaviour change.

### P0 — Safety and data integrity

**P0-1. Fix `'complete'` vs `'completed'` (SW-01).** Current: all OS summaries show zero sessions. Proposed: use the same string everywhere. Justification: verified defect; one-token. Benefit: Budget/AAR/Story/Coach become truthful. Downside: numbers will jump from 0 to real values (could surprise the user). Effort: tiny (1 line + tests). Testing: add regression test with seeded complete sessions; run existing 30-test suite. Data change: none. Behaviour change: yes (summaries).

**P0-2. Clinician-reviewed knee/elbow plan.** Current: no knee/elbow logic. Proposed: a written clinician-approved limit list (quad sets/week and per session, deep-flexion holds, leg-extension FST-7, Widowmaker, plyometric progression, running return criteria; elbow: DC RP curls, long-length curl/overhead triceps holds). Justification: athlete history; app cannot self-regulate. Benefit: informs every later change. Downside: external dependency. Effort: not a code task. Testing: n/a. Data/behaviour: none until approved.

**P0-3. Readiness safety floor and staleness (SW-04).** Current: joints=1 can be GREEN; stale check-ins displayed. Proposed: any joints ≤2 (or pain flag) caps readiness at YELLOW/RED; check-ins >24–48 h old shown as "not checked in". Benefit: removes a misleading green. Downside: behaviour change; thresholds are judgement. Effort: small. Testing: extend probe P1 into tests. Data change: new dated history array (additive). Needs approval.

**P0-4. Additive pain/side/rest fields (SW-05).** Optional per-set side (L/R/Both) and pain 0–10; per-session knee/elbow symptom check. Additive schema; old records remain valid; backup/restore must be re-tested. Effort: medium. Data: additive.

### P1 — High-impact defects

**P1-1. Evidence engine comparability filter (SW-02).** Effort small–medium; tests from Q3.
**P1-2. Progression "NEXT" semantics (SW-03).** Use top set and rep range; leave algorithm design for later. Effort small.
**P1-3. Review grouping by strength method (SW-06).** Effort small.
**P1-4. Restrict optional `bl`/`bu` defaults pending P0-2** (e.g. leg-extension FST-7 → straight, Widowmaker → straight, DC RP → RP) — behaviour change, requires explicit approval and clinician input.
**P1-5. Rope/hamstring/sprint gaps (JUDGEMENT).** Add opt-in rope pull/towel pull, Nordic/slider hamstring, longer sprint progression only after P0-2; these are *program changes* and out of the audit's remit.

### P2 — Performance and efficiency

**P2-1. Optional Time-Constrained Session mode (section I.1).** Current: a threshold-based COMPACT toggle that silently omits work (SW-17). Proposed: an opt-in planner that asks for the available time, prioritizes, shows exactly what was reduced, omitted or deferred, and never marks omitted work as done. **Full Session stays the default and is unchanged.** Effort: medium–large. Needs approval before any build.
**P2-2. Honest duration estimates (SW-12).** Show a modelled or personally calibrated duration next to the existing Full Session label. This is informational only and removes no work. Effort: small.
**P2-3. Warm-up specificity for Lower (SW-13).**
**P2-4. Negotiator spacing/compact fallback (SW-09)** and adaptive intensity application (SW-08).
**P2-5. Cardio prescriptions with HR/RPE targets and interval dose (SW-15)** — coach/clinician decision.

### I.1 Planned: optional Time-Constrained Session mode (PLANNING ONLY — nothing is implemented)

**Status: awaiting approval. No code, program, template, exercise, progression or data change is made by this section.**

**Hard requirements (yours, verbatim in intent)**
1. Full Session is the default and stays complete, with its intended stimulus. The Time-Constrained Session is an optional alternative. It is never preselected or suggested in place of the Full Session, and it never rewrites the master template.
2. It asks how much time is available.
3. It prioritizes the highest-value exercises and training goals.
4. It includes an appropriate warm-up and cool-down.
5. It adjusts or defers lower-priority work intelligently.
6. It clearly identifies what was omitted, reduced or rescheduled.
7. It does not automatically mark skipped work as completed.
8. It never compromises injury safeguards to fit the time limit.

**Where it would sit.** It would extend the existing Adaptive Session screen (`renderAdaptivePage`, ~1380), which already asks about time, rather than add a parallel system. The entry point is a secondary "Short on time?" control beside the normal session start. The normal start button always begins the Full Session.

**Inputs (all optional except time):** minutes available (presets plus a custom value), today's equipment (already exists), the readiness label (already exists), and an optional goal emphasis.
Goal weights (physique, speed, jump, rope, pull-up) must be set by the athlete. I will not invent a default priority order.

**Inviolable safeguards (a hard rule layer that time can never override)**
- The time-constrained plan may only **remove or reduce** work. It never adds sets, adds an intensifier, raises a load target, shortens rest on heavy lifts, adds failure work to compensate, or substitutes an exercise outside the slot's existing options.
- The warm-up for the first loaded movement is retained: a ramp specific to that lift plus the existing joint-prep content. A minimum warm-up and cool-down time is defined once, with your clinician (see `CLINICAL_QUESTIONS_AND_INTERIM_SAFEGUARDS.md`), and is reserved before anything else is scheduled. Iversen 2021 supports exercise-specific warm-ups as the efficient form; the general portion may be compressed, the specific portion is not.
- Any clinician-set limits on flagged knee or elbow work (once P0-2 exists) apply identically to Full and Time-Constrained sessions. A time-constrained plan cannot lift a limit.
- The readiness joint override (Fix 3) still applies. A RED joint flag cannot be turned into a shorter, harder session. The mode may offer only reduced work or rest.
- Pain-stop rules remain visible and unchanged.
- No supersets or circuits. You dislike unnecessary supersets, so they are excluded from this mode. (Iversen 2021 reports that advanced pairing techniques roughly halve time, so this is a preference-driven exclusion, not an evidence one.)
- If the time is below the safeguard floor (warm-up + cool-down + one primary movement), the planner **recommends rescheduling** and shows the minimum feasible time. It does not squeeze the session below the floor.

**Prioritization model (proposed, tiered; the tiers need your approval)**

| Tier | Contents (from the existing slot data) | Treatment under time pressure |
|---|---|---|
| T1 | Slots carrying a strength method (press, row, squat press, vertical pull, carry), plus any slot tied to a stated goal (for example pull-ups for the pull-up goal) | Kept. If needed, back-off sets are reduced before the top set, and the top set is never removed. |
| T2 | Main hypertrophy compounds (incline press, pulldown, hinge) | Kept, reduced to the lower set count only if needed |
| T3 | Isolation and accessory slots | Reduced to one working set before any slot is omitted. A slot is omitted only if its muscle group has already received direct work this week. |
| T4 | Intensifier extra efforts (Myo-Rep, rest-pause, FST-7 stages) and loaded stretches | First to go. The straight working set remains. These are the lowest-cost stimulus losses per minute saved (advanced techniques are about equal to straight sets for hypertrophy in the evidence reviewed in §8). |

Levels applied in order until the plan fits: L1 remove T4; L2 reduce T3 and T2 to the lower set count; L3 omit T3 slots (deferred); L4 reduce T2. T1 is never removed. If the plan still does not fit, the mode recommends reschedule instead of cutting T1 or the safeguard floor.

**Weekly coverage awareness.** The planner reads the week's logged sets (this depends on P0-1, because `recentSessions` is broken today) so that it protects muscle groups that have had no direct work. This matters because the normal week already has only about 2 direct sets for several groups (§D). Dropping a slot there removes the group's whole weekly dose. Evidence is consistent with this: volume shows diminishing returns (Pelland 2025), so the first sets contribute the most, and Iversen 2021 recommends at least about 4 weekly sets per muscle group for time-efficient programs. Reducing to one set preserves more than omitting.
Honest caveat: single-set evidence is mostly for strength in men with trained status, and suboptimal compared with multiple sets (Androulakis-Korakakis 2020 Sports Med, doi 10.1007/s40279-019-01236-0; Krieger meta-regression of single vs multiple sets, PMID 19661829). This mode is a fallback for short days, not a replacement for the Full Session.

**Time model.** Per-slot cost is computed from the app's own data: sets × (set time + the exercise's `rest` value or the intensifier's `IP` rest), plus setup, plus intensifier stages and loaded stretches. This is the same method used for the audit's duration model (assumptions in `analysis.json`), with the estimate shown to the athlete as an estimate. Optionally calibrate a personal pace factor from past `startedAt`/`finishedAt` against set counts. A 10% buffer is reserved.

**What the athlete sees (preview before starting):**
- Time available, estimated time, and the reserved warm-up and cool-down.
- **INCLUDED** (unchanged), **REDUCED** (from → to sets or efforts, with the reason), **OMITTED** (with the reason and a deferral note), and **SAFEGUARDS** applied (for example "warm-up retained", "no intensifiers added", "clinician limits unchanged").
- Two equal buttons: **Do the Full Session instead** and **Start time-constrained version**.
- During the session, omitted and reduced rows stay visible as greyed "NOT DONE" lines, not hidden. A "I have more time" control restores the full session at any point.

**Completion and records (additive, no historical change)**
- A session carries `mode: 'full' | 'timeConstrained'` and a `timePlan` object: minutes available, estimate, reserved minutes, and per-item `status` (included, reduced, omitted, deferred) with planned versus full sets and a reason code.
- Omitted items never create `pa_hist` records, checks or set counts. Nothing is auto-completed. A derived "full-session equivalence" figure may be shown, but it never changes the completion status.
- Compatibility: sessions without these fields are Full Sessions. The backup validator (`validateBackup`) and the schema in the QA-controlled backup/restore candidate must be extended additively so old backups still restore and new ones validate. That must be coordinated with that change, not applied silently.

**Deferral and rescheduling (suggestions, not debt)**
- Omitted T3 work is offered as an optional add-on to the next suitable session of the same type. The athlete may dismiss it.
- Guard rails: at most one session's worth of deferred work is carried, suggestions expire after 7 days, and a later session is never inflated beyond the Full Session volume.
- This reconciles the existing "do not create make-up debt" wording in the ≤15 min text with the need to show what was rescheduled.
- The Giant B intensifier rotation must not advance for a time-constrained session that skipped the active intensifier slots (see SW-17). This is a behaviour change to the rotation counter and needs explicit approval.

**Evidence summary (see §8; citations checked by search, abstracts only):** Iversen, Norum, Schoenfeld & Fimland 2021, *Sports Med* 51(10):2079–2095 (time-efficient program design, narrative review); Androulakis-Korakakis et al. 2020, *Sports Med* (minimum effective dose, resistance-trained men); Krieger, single vs multiple sets meta-regression (PMID 19661829); plus the volume and advanced-technique sources already in §8. None of these validates a specific set of thresholds for this athlete. The tiering above is a design judgement, labelled as such.

**Risks.** (1) A wrong estimate can mislead, so time is shown as an estimate. (2) A reduction rule could remove work the athlete wanted, so the preview and the "do full instead" button are mandatory. (3) Rotation, weekly-coverage and validator changes touch existing logic and need tests. (4) Reduced loading must never be silently treated as a PR baseline for progression, so time-constrained records should be tagged and excluded from progression comparisons (which relates to Fix 2's comparable-series logic).

**Tests required before any release (all written failing-first):** Full Session unchanged by the feature's presence (byte-identical rendering of the default start); preview lists every slot as included, reduced, omitted or deferred; omitted work creates no records; no intensifier or set is ever added; safeguards hold at every time value; time below the floor returns "reschedule"; the rotation does not advance on a skipped intensifier slot; old backups restore, and a new backup round-trips; deferral caps and expiry; and a readiness joint flag blocks the mode's "go" path.

**Effort and sequencing (technical).** Depends on P0-1 (session status), the Fix 2 series logic, and P0-2 (clinician-approved limits). Touches `adaptivePlan`/`applyAdaptive`, `compactSlot`, the render path, `giantBRotation`/`completedTemplateCount`, the session schema and `validateBackup`. It is a medium-to-large, multi-component change and should be built only after approval and after the three reliability fixes are released.

### P3 — Optional
Skill-tree bodyweight scaling (SW-11); timing-method field for tests; library cleanup (SW-10); abs content or relabel Mon/Sat; prototype-safe maps (SW-07); nutrition module (separate project).

---

## J. Final recommendation — the 16 questions

1. **Is the program appropriately designed?** Mostly yes structurally, with a low default weekly volume for stated size goals (§D). Session length is not a design problem, and the full sessions are the intended stimulus. The optional Lower day has a sharp quad-volume jump that I'd flag for clinician review. (JUDGEMENT.)
2. **Is it recoverable?** Partly. Full A+B week with two rest-ish mobility days is plausible, but the app has no spacing logic, no readiness-driven reduction, and Saturday intervals precede Sunday A. Recovery is entirely user-managed.
3. **Are the exercises optimal?** Defaults are sensible for knee/elbow/spine (machine, supported). Gaps: no overhead triceps extension (Maeo 2022/2023 favors it for triceps growth), no rope/climb, no Nordic/hamstring-eccentric, no abs. 122 reference-only exercises cannot be logged.
4. **Are the intensifiers justified?** Hypertrophy intensifiers are justified mainly as *time-saving*, not as superior stimulus (advanced-method pooled hypertrophy g≈0.05, n.s.; Myo-Reps ≈ equal with less volume). Restrict DC RP curls, FST-7 leg extension, Widowmaker, BFR for this athlete (§E).
5. **Is hypertrophy volume appropriate?** Not for Reacher-level size on default A+B only; appropriate for maintenance. Volume decisions interact with knee/elbow caps.
6. **Is strength training specific?** Moderately: main lifts get specific methods; pull-ups progress via weighted pull-up. Specificity to a 300-lb-system pull-up is not tracked (hard-coded tree).
7. **Is cardio structured properly?** Not yet: Zone 2 lacks HR/RPE, intervals are ~2 min hard, no progression.
8. **Are sprint, jump and rope goals supported?** Sprint weakly, jump weakly-to-moderately, rope **not at all** (VERIFIED).
9. **Are warmups and cooldowns appropriate?** Giant A/B generally yes; `bl`/`bu` reuse B's; Blocks 3–7 generic.
10. **Is injury handling intelligent?** No. There is generic text only; no pain, side or knee logic (VERIFIED).
11. **Does adaptive scheduling work?** Partially. Compact/busy work; negotiator is rule-based and rigid; "lower intensity" doesn't change prescription; no missed-workout re-plan.
12. **Does progression respond to performance?** Not algorithmically. Targets are text derived from the last set; the Evidence Engine yields false deterioration flags.
13. **Are specialized methods logged accurately?** Hypertrophy intensifiers: **yes** (structured efforts, verified). Strength methods: stored but summarized as Straight Sets; no rest/tempo/side.
14. **Which components should remain untouched?** Slot/exercise data model and `slots` format; hypertrophy stage logging (`saveCluster`); compact/busy stripping; final-set-only intensifier rule; Giant B rotation concept; Sprint-1 backup/restore work (pending its own approval); stored record schema (extend additively only).
15. **Top 5 ROI improvements:**
    1. Fix `'complete'`/`'completed'` (tiny, restores all summaries).
    2. Readiness joint-floor + staleness (small, big safety impact).
    3. Evidence-engine comparability filter (small–medium; stops false ACT).
    4. Additive pain/side logging (medium; enables everything clinical).
    5. Optional Time-Constrained Session mode with an omitted/reduced/deferred ledger (medium; protects the training stimulus on short days without touching the Full Session; section I.1).
16. **Single highest-priority next action:** authorize a narrowly scoped, test-first patch for SW-01 (status mismatch) — and, in parallel (non-code), obtain clinician input on the knee/elbow limits in §G.1 before any program or intensity change.

---

## 8. Evidence table

Citations were checked via web search (titles/journals/abstract numbers); full texts were not read. Strength of evidence is my reading, not the authors'.

| Topic | Source | Finding used | Strength / caveat |
|---|---|---|---|
| Volume | Schoenfeld, Ogborn & Krieger 2017, *J Sports Sci* 35(11):1073–1082 | ≈+0.37% growth per extra weekly set; <5/5–9/10+ sets ≈ 5.4/6.6/9.8% (trend only, P=0.074) | Moderate; trend |
| Volume | Pelland et al., *Sports Med* (Dec 2025; preprint SportRxiv 460) | Hypertrophy rises with volume, diminishing returns; no clear independent frequency effect | Moderate; recent, check final publication |
| Proximity to failure | Robinson et al. 2024, *Sports Med* | Hypertrophy improves nearer failure; strength similar across RIR | Exploratory |
| ROM / partials | Wolf et al. 2023 *Int J Strength Cond*; Pedrosa 2022 *Eur J Sport Sci*; Kassiano 2023 *JSCR* | Trivial overall full-ROM advantage; possible lengthened-partial benefit (wide CI) | Low–moderate |
| Triceps | Maeo et al., *Eur J Sport Sci* (online 2022, print 2023) | Overhead extension > pushdown for triceps growth (whole triceps +19.9% vs +13.9%) | Moderate; single lab |
| Advanced techniques | PMC11022786; *Sports Med Open* 2023 (drop sets); PMC12922048; Bradshaw 2026 *JSCR* (Myo-Reps) | ≈ equal hypertrophy; time savings; Myo-Reps similar results with ~30% less volume load | Low–moderate; small studies |
| Concurrent training | Schumann et al. 2022 *Sports Med* 52:601–612; Lundberg 2022 | Hypertrophy/max strength preserved; explosive strength attenuated | Moderate |
| Protein | Morton et al. 2018 *BJSM* 52:376 | ≈1.6 g/kg/day plateau (CI 1.03–2.20) | Moderate (app has no nutrition module) |
| ACL return to sport | Grindem et al. 2016 *BJSM* 50:804 | Earlier return → higher reinjury; quad symmetry predicts reinjury; criteria association not significant (p=0.075) | Observational |
| Plyometrics | Stojanović 2017 *Sports Med*; Ramirez-Campillo 2020 | CMJ ES 1.09 / 0.82 | Moderate; not post-ACL specific |
| Stretching | Warneke 2024 *Sports Med Open* 10:45; Warneke 2023 *JSCR* | Small hypertrophy effect (d=0.20), needs high dose | Low–moderate |
| Time-efficient training | Iversen et al. 2021 *Sports Med* 51(10):2079–2095 | Prioritize multi-joint lifts; ≥4 weekly sets/muscle; exercise-specific warm-up; advanced pairing techniques roughly halve time | Narrative review |
| Minimum dose | Androulakis-Korakakis et al. 2020 *Sports Med* (doi 10.1007/s40279-019-01236-0); Krieger single vs multiple sets meta-regression (PMID 19661829) | One hard set can raise 1RM in trained men; multiple sets better | Low–moderate; men, strength-focused |
| Sleep | Walsh 2021 *BJSM* 55:356 | Expert consensus; individualized sleep need | Consensus, not trial |
| Tendinopathy | Cook & Purdam 2009 *BJSM*; BJSM 2020 lateral-elbow exercise meta-analysis | Continuum model; exercise effect small, certainty low | Provisional for loading parameters |

---

## STOP

**This is an audit. No code, exercise, progression logic, intensifier, workout history or data has been changed. Nothing is merged, deployed or installed.**

Awaiting explicit approval on:
1. Whether to proceed with P0-1 (status-string fix, test-first).
2. Whether to commission clinician input (P0-2) before any program changes.
3. Which of P0-3/P0-4/P1 items, if any, to authorize.
4. Whether to approve the planned **optional Time-Constrained Session mode** (section I.1) for design and build. Full Session stays the default and unchanged either way. Open decisions: the tier assignments, the minimum warm-up and cool-down floor (clinician input), goal weights, and the rotation-counter change.

No further action will be taken until you reply.
