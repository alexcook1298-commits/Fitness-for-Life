# Phase 3, Priority 2: evidence engine versus partial sessions

Status: **audit complete, no engine change made.** Four limitations were found. Fixing any of them changes how evidence is
built from stored records, which goes beyond the corrections already approved, so each one is a design proposal that needs a
decision. Nothing here raises a load automatically; nothing in the app does (E10).

Reproduce: `node tests/audit/evidence_partial_audit.js integration/app --json out.json` (read-only; scenarios E1-E10).
Guard tests that pin the behaviour that is already safe: `node tests/phase3.test.js integration/app --group EV` (EV1-EV6, 6/6 pass).
Raw audit output: `integration/results/phase3_evidence_audit.json`.

## How the engine reads data (`evidenceDecision`)

- Reads every record in `pa_hist` (finished and draft sessions alike).
- Drops `structured` records (Myo-Reps, Rest-Pause, and so on).
- Series key: name + intensifier + strengthMethod + rep band. Takes the best estimated 1RM per UTC calendar date and needs at least 2 dates.
- Output is only `OBSERVE` / `INVESTIGATE` / `ACT` about a *decline*. Target text only says "earn reps/quality before +N lb".

## Audit result

| # | Scenario | Result | Meaning |
|---|---|---|---|
| E1 | Exercise omitted from the latest session | SAFE | No records, so the series is untouched. Omission never reads as decline. |
| E2 | Fewer sets than prescribed at the same load | SAFE | Best performed set per exposure, so a one-set partial equals a full session. |
| E3 | Partial session logs only the back-off set of Top Set + Back-Offs, three sessions running | LIMITATION | `ACT` ("deteriorating"). Back-off sets (lighter by design) are compared with top sets in the same series, so a lighter performed set reads as decline. A false decline from performed work, not from omitted work. |
| E4 | Same, but every set logged (control) | SAFE | `OBSERVE`. |
| E5 | One evening session whose sets straddle UTC midnight | LIMITATION | Counted as two exposures (4 exposures from 3 sessions). Can create or mask a trend. |
| E6 | Records of an unfinished (draft) session | LIMITATION | Counted as evidence. Performed sets in an interrupted workout are legitimate, but the engine cannot tell sessions apart. |
| E7 | Explicit skip in a finished session | SAFE | A skip creates no record and cannot enter any series. |
| E8 | Structured intensifier blocks | SAFE | Excluded, so a smaller or incomplete cluster cannot read as decline. |
| E9 | Target text after a back-off-only partial | LIMITATION | Anchors on the last logged record (a back-off set), not on the top set. |
| E10 | Any automatic load increase? | NONE | Confirmed by source inspection (EV6). |

What this means for the six requirements:

- *Compare genuinely comparable performed sets*: true for like-for-like sets (EV2, EV3). Not true when back-off and top sets share a key (E3).
- *Never infer performance from skipped or unlogged work*: true (E1, E7, EV1, EV4).
- *Do not interpret omitted exercises as deterioration*: true.
- *Preserve legitimate progression evidence from partial workouts*: true for finished partial sessions (EV3). Draft records are also counted (E6), which is legitimate for performed sets but not flagged.
- *Prevent inappropriate progression recommendations*: the app has no automatic progression. The remaining risk is a false `ACT` (E3).

## Design-only proposals (none implemented)

### D1. Role-aware series key for Top Set + Back-Offs (fixes E3, part of E9)

Add the set role (`top` for setNumber 1, `backoff` for later sets) to the series key, or compare only top sets for decline.
- Effect: a back-off-only partial would create no top-set exposure, so no false decline.
- Cost: changes series for existing history, because past back-offs move out of the top series. Needs a rule for sessions that logged only back-offs (new series, or skipped). Existing evidence decisions can change, so it needs a decision.

### D2. Session-based exposure instead of the UTC date slice (fixes E5)

Group by `sessionId` (already on every record) and use the session start, falling back to the date slice for legacy records without a usable session.
- Effect: an evening session counts once. Legacy parity is kept through the fallback.
- Cost: changes exposure counts and therefore the 2-date minimum for borderline histories.

### D3. Draft records: include, exclude or flag (E6)

Options: (a) keep, since performed sets are valid; (b) exclude drafts older than N days that were never finished; (c) keep but mark the exposure as "unfinished session".
- Recommendation: (a) with an on-screen "includes an unfinished session" note, because performed sets are real data and silent exclusion would discard legitimate evidence.
- This needs your decision. Excluding drafts would also discard data from interrupted workouts, which Phase 2 aims to preserve.

### D4. Target anchored on the top or best set (E9)

Anchor `targetStrength`/`targetMode` on the best estimated set of the latest exposure instead of the last logged one.
- Effect: a back-off-only partial no longer lowers the displayed target.
- Cost: changes visible text for existing history.

## What is deliberately not proposed

- Any automatic load increase. The existing design (`OBSERVE` / `INVESTIGATE` / `ACT` about decline only) is the guard against inappropriate progression; the proposals above only reduce false declines.
- Using completion metadata (full/partial) as a weight. That would invent an equivalence between partial and full exposure, which Priority 4 rules out.

## Decisions needed

| Decision | Options | Recommendation |
|---|---|---|
| D1 role-aware key | adopt / not | adopt in a later phase with a migration test over real-shaped history |
| D2 session exposure | adopt / not | adopt with legacy fallback |
| D3 drafts | include / exclude / flag | include and flag |
| D4 target anchor | adopt / not | adopt together with D1 |

Until then: E3 is a known false-`ACT` risk when the same Top Set + Back-Offs exercise is repeatedly done as back-off-only partials. It needs a user who logs back-offs but not the top set, three or more sessions in a row.
