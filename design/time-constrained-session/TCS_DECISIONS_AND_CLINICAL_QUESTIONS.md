# TCS — Decisions Requiring Your Approval, and Clinical Questions

**Status: DESIGN ONLY.** Nothing is implemented. Each decision below has a recommended default so you can approve in bulk, but none of them is applied until you say so. "Evidence" states what supports the recommendation; where there is none, it says so.

## A. Feature decisions

| ID | Decision | Options | Recommended default | Evidence / why | If you do not decide |
|---|---|---|---|---|---|
| D1 | **Per-slot priority order** (spec §5.2) | (a) the draft order; (b) your own order; (c) goal-weighted (you set weights) | (a) as a starting point, but **you must confirm two things**: Vertical Pull ranked first in both templates (it means a pull is kept over the bench press at 20 min or less), and Biceps counted as a Giant B core slot | Draft derives from your PULL/ROPE skill tracks and from which slots carry strength methods. No data says which order is best for you | TCS cannot be built; the order is the single most consequential setting |
| D2 | **Breadth vs depth default**, and whether to add a "use remaining time" step | breadth / depth; fill step yes/no | Breadth default, athlete can toggle; **no** fill step in v1 | The two policies produce materially different plans (Giant A, 40 min: three single sets, or bench and pull at full sets). No evidence in this repository decides which is better for you, and I am not citing any | Breadth |
| D3 | **Goal emphasis input** (physique / pull-up / rope / speed / jump) | none / optional selector | None in v1 (use the fixed order from D1) | Avoids inventing goal weights, which you said you would set | None |
| D4 | **Cool-down trimming** | (a) trim to the down-shift item before cutting sets (model default); (b) never trim; (c) trim only to a clinician-approved minimum | **(c) if your clinician will give one, otherwise (b)**. I do not recommend (a) as a default because it is a quiet reduction of something you asked me to keep | The model shows (a) vs (b) changes plans materially: Giant A at 25 min is Press + Pull under (a) but Pull only under (b); smallest feasible time 12 vs 15 (A) and 12 vs 16 (B). No evidence on cool-down duration is cited here | (b), the safer reading of "appropriate cooldown" |
| D5 | **Warm-up and cool-down tagging** (which movement each existing item prepares) | approve the draft tags / edit | Approve after reading `model/tcs_planner_model.js` `WARM` and `COOL` (derived from existing item text, durations modelled, text unchanged) | Tags are my reading of item text such as "Bench-Specific Ramp" and "Knee-to-Wall Ankle Rocks" | Cannot build |
| D6 | **What the time number means** | total session time incl. warm-up and cool-down / training time only | Total time | A planner that ignores the warm-up reports a plan that does not fit the real time | Total |
| D7 | **Buffer and band constants** (10% planning buffer, +/-15% displayed range) | keep / change | Keep as placeholders; replace from real timing data | These are not derived from data | Placeholders |
| D8 | **Conditioning and its warm-up** | (a) no TCS for conditioning; (b) you or a coach define a conditioning warm-up and the shortest valid Zone 2 / interval structure | (a) until (b) is provided | The existing template has **no defined warm-up** (VERIFIED), and the Zone 2 text says 25-40 min. Anything I wrote would be invented | (a) |
| D9 | **Deferred work behaviour** | (a) informational only; (b) (a) plus same-class tie-break in the next TCS; (c) (b) plus an optional dismissible add-on line after the next Full | (a) in v1; (b) only if you want it; expiry 14 days or next completed session of that template (placeholder) | Your decision 6: optional, no debt, no automatic workload increase. (b) changes only *which* items are cut within the same class, not total work | (a) |
| D10 | **Scope of first release** | Giant A/B only / add C / add athletic and mobility profiles | Giant A and B only | Only these were modelled; others need data or decisions (D8, spec §5.5) | A and B |
| D11 | **Entry point and wording** ("Short on time?" secondary control; Full always the main button) | approve / edit | Approve; wording to be reviewed on a device | Matches "Full Session remains the default" | As proposed |
| D12 | **Real timing data collection** before release | you log several real Giant A/B sessions (with timestamps) / a stopwatch protocol / none | Collect, because the estimator is otherwise uncalibrated | Nothing in this repository is real timing data | Release is blocked on this |
| D13 | **Mobility as a manual option** at 10-15 min | mention it in the infeasible message / do not mention | Mention only, never select | You excluded automatic substitution; showing an existing 5/10/15 min session as a *choice* is not a substitution | Mention |
| D14 | **Approval to start Step 0 and Step 1-3 of the sequence** (inert planner module, rotation snapshot, additive fields) | yes / no | Yes only after D1, D4, D5 | The first user-visible step is 4 | No implementation |

## B. Rotation decisions (see `TCS_ROTATION_STATE_MODEL.md`)

| ID | Decision | Options | Recommended default | Why |
|---|---|---|---|---|
| R1 | **Credit policy** when a group presents two intensifier slots | any slot performed credits the group / all presented slots must be performed | **any** | Requiring both would repeat a group after a normal day where one of the two was reasonably dropped; the risk is that the other slot's method goes unexposed until the group comes round again |
| R2 | **Does a partial intensifier count?** | no credit / credit if at least one effort was logged | **no credit** | Matches the existing record rules (a structured record needs the full stage set); a partial cluster is not a performed method |
| R3 | **Pre-era history** | keep the legacy meaning (parity) / re-derive credit from `pa_hist` once | **keep legacy** (parity), offer re-derivation later only if you want it | Re-deriving changes which group is next at upgrade for existing users |
| R4 | **Lapse constant** | 1, 2, 3 or never | **2** consecutive finished uncredited presentations | Prevents an undoable group from blocking rotation, and limits repeated exposure; the number is a judgement, not evidence |
| R5 | **Whether the correction applies to Full Session B as well as TCS** | all B sessions / TCS and COMPACT only | **all B sessions** | The defect exists whenever a finished B skipped the method; applying it only to TCS would leave Full B with the distortion |

## C. Clinical questions requiring professional input (TCS-specific; the knee/elbow list already in `reliability/CLINICAL_QUESTIONS_AND_INTERIM_SAFEGUARDS.md` still applies in full)

I am not prescribing anything here. These are questions to take to a qualified clinician or coach. Until answered, the design only removes risk-relevant work (loaded stretches, intensifier efforts) and never adds any.

| ID | Question |
|---|---|
| C-1 | When the readiness check-in reports a low joint score, **which joint is it, and which exercises does that joint make unsuitable?** The app stores only a 1-5 joint score, so a joint-to-exercise map is needed for safety mode. Who should define it, and for which joints (left knee, elbows, others)? |
| C-2 | What restrictions should apply on a **RED** day and on a **joint-qualified YELLOW** day when the athlete still wants to train a reduced session? Is "straight sets, no loaded stretch, primary work only" appropriate, or should some movements be excluded entirely? |
| C-3 | Is there any **warm-up or cool-down content that must always accompany a specific movement** (for example before deep knee flexion under load, or before weighted pull-ups with the elbow history)? This decides what the tags in D5 must treat as non-negotiable. |
| C-4 | In the existing warm-ups, vertical pulling (weighted pull-ups under Cluster Sets) has **no dedicated ramp**, only Wall Slides. Is that adequate for the loads used, given the elbow history? (This applies to the Full Session too; TCS reproduces it faithfully.) |
| C-5 | Is it acceptable for a **single movement session** (for example one set of pulling) to be the whole workout from a safety and tissue-preparation standpoint, or should the app refuse below some preparation that you specify? This is the question behind "do not invent a universal minimum". |
| C-6 | Is there any **minimum cool-down** you want after loaded work (D4 option c)? |
| C-7 | For the athletic day: **which preparation items must precede any sprint or jump work** (the existing fast march, snapdown, pogos), and may the number of repetitions be reduced when time is short without changing the rest between repetitions? |
| C-8 | For conditioning: what warm-up and what shortest valid Zone 2 or interval structure do you accept (D8)? |
| C-9 | Is reducing a **strength-method slot** (cluster sets, top set + back-offs) to one set acceptable for tendon and joint reasons, or does a reduced set need to be a lighter set? (TCS never changes load; this asks whether it should be able to.) |
| C-10 | How should **pain reported during a TCS** be handled differently, if at all, from the same report in a Full Session? |

## D. What I did and did not do in this phase

Did: wrote the specification, rotation model, compatibility analysis, test plan and this list; built and ran two non-production models and one read-only compatibility probe; verified that nothing in either app file changed.
Did not: change any app file, either patch, the audit, any stored data, or any program content; merge; deploy; write app-level tests; measure anything on a device or against real workout timing; contact any clinician.

**STOP.** Waiting for your decisions on D1, D4, D5 and R1-R5 at minimum before any implementation step.
