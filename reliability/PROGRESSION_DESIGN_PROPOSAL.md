# Item 4 — Progression recommendations: investigation and design proposal

**Status: DESIGN ONLY. Nothing in this document is implemented. Awaiting your review.**
Evidence: `reliability/progression_investigation_baseline.json` (produced by `reliability/scripts/progression_investigation.js`, read-only, synthetic data, unmodified HQ 2.3).

## 1. What the app does today (VERIFIED)

Three functions produce the "NEXT" text under each exercise:

| Function (baseline line) | Used for | Logic |
|---|---|---|
| `targetMode(n,iv,range)` (682) | Straight sets and hypertrophy intensifiers | Takes `histFor(n).filter(intensifier===iv).at(-1)` and prints `"<w> lb • progress within <iv>"`. The `range` argument is **never read**. For `reps`/`time` exercises it prints "Beat this mode's previous performance". |
| `targetStrength(n,m)` (546) | Strength methods | Takes the last record of that method and prints `"<w> lb • earn reps/quality before +<inc> lb"`. Some methods print fixed text. |
| `target(n,range)` (687) | Legacy | Same pattern, `"beat reps, then +<inc> lb"`. |

## 2. Reproduced behaviour (Seated Leg Curl / Hack Squat, 8–12 and 6–10 ranges)

| # | Scenario | NEXT shown | Problem |
|---|---|---|---|
| A | Top of range reached (2 sets × 12 @ RIR 1) | `100 lb • progress within Straight Sets` | No cue to add load |
| B | Bottom of range (1 × 8 @ RIR 0) | identical text | Indistinguishable from A |
| C | Far below range (1 × 5 @ RIR 0) | identical text | Never says to reduce or hold |
| D | Two sets, last-logged set lighter (105×10, then 100×8) | `100 lb` | Last *record* is used, not the representative set |
| E | Last exposure 120 days ago | `100 lb` | No staleness handling |
| F | Top Set + Back-Offs, 200×5 top, 170×8 back-off | `170 lb • earn reps/quality before +10 lb` | Target is the **back-off** load |
| G | Top set earned (200×10 on 6–10) | `200 lb • earn reps/quality before +10 lb` | Still says "earn", although the range top is reached |
| H | Records not in date order | uses the last array element | Order-dependent (matters mainly after a restore or merge) |
| I | Deliberately easy session (70×10 @ RIR 4) after 100×10 | `70 lb` | Target ratchets **down** to the easy session |

Also relevant: 176 of 225 library exercises have `inc = 5` lb, including dumbbell and cable lateral raises (a 5 lb step is about 25% of a 20 lb load). This is exercise *data* and is out of scope for any code fix.

## 3. Minimal proposed correction (display text only)

Goal: make "NEXT" reflect the slot's rep range and the last comparable exposure. **No change to prescriptions, stored data, methods, or the evidence engine.**

1. **Pick the reference set** from the most recent comparable session, where comparable means the same exercise, intensifier and `strengthMethod`:
   - for `Top Set + Back-Offs` and `Primer + Paused Top/Back-Offs`: the `setNumber === 1` record (top set);
   - otherwise: the heaviest-load work set, with ties broken by reps.
   - Order by `date`, not array position.
2. **Double-progression text** (all thresholds are conventional heuristics, not trial-derived):
   - every work set at or above the top of the range at RIR ≤ the slot RIR → `Add <inc> lb, aim for the bottom of the range`;
   - within the range → `Repeat <w> lb, aim for <reps+1> reps`;
   - below the bottom of the range → `Repeat <w> lb until the bottom of the range is reached` (never automatic load reduction).
3. **Easy-session guard:** if the reference set was logged at RIR ≥ 4 (deliberately easy), keep showing the previous best comparable load, labelled "last hard session".
4. **Staleness label only:** if the last exposure is older than 21 days, append `last done N days ago — re-establish, don't jump`. No automatic percentage reductions. Anything after injury or a layoff belongs to your clinician or coach.
5. **Strength-method text** (fixed strings such as "Beat clean load or distance/time…") stays as is.

## 4. Evidence and honesty

- I did not find a trial that validates a specific double-progression threshold. This is standard practice, and it fits the research on proximity to failure (Robinson et al. 2024, exploratory) and on volume. It is not a proven optimum.
- The problem is a documented logic defect (the `range` argument is unused, back-off load shown as the target), not a contested training-science question.

## 5. Proposed tests (failing first)

Scenarios A–I above, each with expected text. Legacy records with no `strengthMethod`, `reps`-only and `time` exercises, empty history, records out of order, and non-mutation of `pa_hist`. The existing prescription-identity check (`effective_prescription.json`) must stay identical.

## 6. Risks

- Text-only change, so low risk to data. Any wording change affects what the athlete sees every session.
- Thresholds are heuristics. A wrong "Add load" cue could encourage a too-early jump on a knee or elbow-sensitive exercise. Default them conservatively and let you choose whether to show "Add load" at all for flagged exercises.

## 7. Decisions needed from you

1. Display text only (this proposal), or also a per-exercise "progression stalled" flag?
2. Should the 5 lb increment on small-load isolation exercises be reviewed separately as a data change?
3. Preferred staleness window (21 days proposed).
