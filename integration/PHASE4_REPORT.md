# Project America HQ 2.3: Phase 4, iPhone acceptance preparation and evidence-engine defects

Branch `cursor/phase4-iphone-evidence-qa-75d6`, stacked on Phase 3 (PR #7). Nothing is merged or deployed. No real data, real origin or real history was touched. The original baseline (`baseline/hq-2.3/index.html` SHA-256 `93fc2f46…1455ec`) and PR #1's `app/` (`5a6fd882…a847`) are unmodified; earlier candidates (Phase 1 to 3) are preserved on their branches.

## 1. Verdict

| Question | Answer |
|---|---|
| **iPhone testing** | **Not performed. No iPhone result exists yet.** Nothing is running that your phone can reach (see section 2). Every iPhone item is "not run". |
| Evidence defects | All four reproduced with failing tests, fixed test-first with small isolated changes, no schema change, thresholds untouched |
| Existing tests (269) | **269 of 269 pass** |
| New tests | EN 26 of 26 pass; device rehearsal 13 of 13 (desktop only) |
| 130 prescription rows / 32 structures | identical to the original |
| Release / deployment | **NO-GO** |
| Next step | **GO** for your iPhone test on your own Wi-Fi (tier 1 now, tier 2 for offline and update) |

## 2. Real-device test setup and security

**I cannot start a server your phone can reach.** The agent runs in a cloud VM (172.30.0.2) that is not on your Wi-Fi, so "the exact URL" cannot exist until you start the server on your own computer. I did not open any tunnel. Full detail in `integration/device/PHASE4_IPHONE_ACCEPTANCE_GUIDE.md`.

What is ready (all verified on the desktop; `lan_up.sh` ran to the point of printing its URL in the VM):

| Piece | What it does |
|---|---|
| `lan_up.sh` | One command: builds disposable builds A and B (checked to differ from the candidate only by guard, label, title, cache name, manifest name), makes the synthetic backup, starts the server for A, prints the exact URL |
| `lan_test_server.js` | Binds only to a private Wi-Fi address (refuses public addresses and `0.0.0.0`; verified); answers only private/loopback clients (403 and log otherwise); serves only a bundle that contains `TEST_BUNDLE.json` and never that file; optional HTTPS; serves the synthetic backup for download; logs every request; stops after `--ttl` minutes (default 120) or Ctrl+C |
| Origin guard | Existing guard plus `--allow-private-network` (10.x, 192.168.x, 172.16-31.x, 169.254.x, name.local). Public hosts stay blocked; `--forbid <your real host>` always wins. Checked on 31 host-name cases in the rehearsal (D2, D2b) |
| Test label | `TEST A • DISPOSABLE • id xxxx • BROWSER or HOME-SCREEN • https or NOT-SECURE • sw on/off • online/OFFLINE`. The `id` is a random value kept in `localStorage` key `paTestStoreId` (not a `pa_` key, so it never enters a backup): equal ids in Safari and the Home-Screen app mean shared storage |

**Why plain LAN HTTP is insufficient:** iOS runs service workers, offline mode, Home-Screen app behaviour and the update flow only over HTTPS. `http://192.168.x.y` is not a secure context. So tier 1 (HTTP) covers layout, logging, intensifiers, skip, recovery, completion, history, budget, backup and the storage probe; tier 2 (LAN HTTPS using `mkcert`, with a CA profile on the phone that you remove afterwards) is needed for offline, install and update.

**Tunnel:** not necessary, not started, and not requested. If you ever approve one it would run on your computer (e.g. cloudflared), would expose the test app at a public unguessable URL with no login (the only protections would be the origin guard and synthetic data), and would stop with Ctrl+C or when the terminal closes.

**Storage sharing (Safari vs Home-Screen app): unknown, not assumed.** The probe (ST1 to ST3) records it on your phone.

## 3. Actual iPhone results versus desktop-only results

| Area | iPhone | Desktop headless Chrome |
|---|---|---|
| Safari launch and layout (G1) | **not run** | label and manifest load (D5) |
| Home-Screen install, storage sharing (G2) | **not run** | n/a |
| Full workout, intensifiers, skip, completion (G3) | **not run** | RT, SK, CS tests; D11 Myo-Reps cluster |
| Interrupted recovery (G4) | **not run** | D8 |
| History and budget (G5) | **not run** | BX tests |
| Backup export/import (G6) | **not run** | D7, D10 round trip, seed import |
| Offline (G7) | **not run** | D9 |
| Update and cache (G8) | **not run** | D12, gym G9.3 |
| Refresh and persistence (G9) | **not run** | D7, D8 |

The desktop results prove logic only, not iOS WebKit behaviour (storage separation, keyboard, share-sheet downloads, lock-screen timers, eviction).

## 4. Evidence-engine defects: reproduction, cause, correction, before and after

All code references are to the Phase 3 candidate before the fix. Tests: `tests/phase4.test.js` (EN1 to EN5), written and committed before the fix (`Tests first…`: 12 of 26 failed, 14 guards passed), results in `integration/results/phase4_EN_BEFORE_fix.json` and `phase4_EN_AFTER_fix.json`. Fix: patch 16.

A fact found while investigating: Bench Press (BB) defaults to **Primer + Paused Top/Back-Offs**, not Top Set + Back-Offs. Both methods have lighter back-off sets, so both are covered.

| # | Defect | Reproduced | Responsible code | Correction (smallest) | Before | After |
|---|---|---|---|---|---|---|
| 1 | Back-off-only partial sessions give a false ACT | three sessions that logged only back-offs after a 200 lb top set: `ACT` ("deteriorating"), values 233, 198, 198, 198 (EN1a, EN1e) | `evidenceDecision` (line 1675): series key ignores set role, best-of-day then picks a back-off | back-off records of the two top/back-off methods (setNumber above 1) are left out of the series. Top-set values are unchanged. A genuine top-set decline still reaches ACT (EN1c, EN1e). Other methods untouched (EN1d, EN1f) | ACT | OBSERVE |
| 2 | Evening session counted as two exposures | one session with sets at 23:56 and 00:09 UTC: 4 exposures from 3 sessions (EN2a) | `evidenceDecision` groups by `String(date).slice(0,10)` | a session's records are placed on the UTC day of the session's earliest record (by `sessionId`). Two sessions on one day still merge to the best set; legacy records without a session id keep the old grouping (EN2b, EN2c) | 2 exposures | 1 exposure |
| 3 | Unfinished drafts influence evidence | a draft's light set joined a finished series: values 133, 133, 133, 80 (EN3a); the running workout moved the decision (EN3c) | `evidenceDecision` reads all of `pa_hist` | records belonging to a session whose status is `draft` are held back; they count as soon as the session is finished (EN3b). Records with no matching session are still used (EN3d). Nothing is written | draft counted | draft held back |
| 4 | NEXT anchors on the last logged set | after top 200 and back-offs 170: "NEXT 170 lb" (EN4a); a back-off-only partial lowered it (EN4b); for straight sets a fatigued last set lowered it (EN4d); the same in `targetMode` (EN4e) | `targetStrength` (line 583) and `targetMode` (line 719) use `h.at(-1)` | new `targetAnchor`: the best performed set of the most recent session of that series (for the two back-off methods, back-offs are excluded; if no top set exists, "Establish … baseline" instead of inventing a weight, EN4c). Guidance text for other methods is identical (EN4f). End to end on the workout screen (EN4g, EN4h) | 170 lb | 200 lb |

**Preserved:** a finished partial session still adds the exposure of what was actually done (EV3, EN5a); omitted and skipped work still never enters a series or reads as decline (EV1, EV4, EN5a); structured intensifier blocks stay excluded (EN5d); nothing raises a load automatically (EV6, EN5b); reads never write (EN5c). Workout prescriptions are untouched (EN5e; the identity check below).

**Policy assessment:** the thresholds (2.5 percent, 5 percent, four exposures) and the OBSERVE / INVESTIGATE / ACT meaning are unchanged; the engine still only reports a decline and never recommends a load. The fixes change which records feed that comparison and one line of text. I judged that not to be a significant change of progression policy, so I implemented it. Two points are yours to confirm:
- Draft exclusion means sets from an *abandoned* draft never count (they stay in storage). Alternative: count drafts older than N hours. One-line change.
- Back-off sets no longer feed any series, so back-off progression is not tracked by the evidence engine (before, it could appear only by accident).

**Behaviour differential** (`tests/audit/evidence_differential.js`, 300 seeded synthetic histories per scenario, `results/phase4_evidence_differential.json`):
- With none of the four defect conditions present: **300 of 300 identical** decisions and NEXT targets between Phase 3 and Phase 4.
- With the defect conditions present: the decision changed in 200 of 300 (many by one value shifting inside the same state): 50 INVESTIGATE to OBSERVE, 14 ACT to INVESTIGATE, 9 OBSERVE to INVESTIGATE, 3 INVESTIGATE to ACT, 2 OBSERVE to ACT, the rest unchanged state. **Severity rose in 14 of 300** (all with draft, back-off-only or straddle conditions): in those the old behaviour had a defect artifact (a draft set, a back-off, or a split session) hiding a real decline of the finished top sets, for example Lat Pulldown 148.8, 136.8, 134.2, 144 (the 144 was a draft) now reads 157.1, 148.8, 136.8, 134.2. This is the intended correction, but it means some users may see an INVESTIGATE or ACT they did not see before.
- The earlier audit scenarios E3, E5, E6, E9 are now SAFE (`results/phase4_evidence_audit_AFTER.json`; before: `…_BEFORE_fix.json`).

Not changed: the PREVIOUS line (`prevStrength`, `prevMode`) still shows what was last logged, which is its job.

## 5. Exact regression totals (`integration/results/`)

| Suite | Passed | Failed | Total |
|---|---|---|---|
| Backup / restore | 30 | 0 | 30 |
| Reliability | 35 | 0 | 35 |
| Integration | 32 | 0 | 32 |
| Gym workflow | 56 | 0 | 56 |
| Phase 2 | 63 | 0 | 63 |
| Phase 3 (RT 19, EV 6, SK 11, BX 8, HB 9) | 53 | 0 | 53 |
| **Existing total** | **269** | **0** | **269** |
| Phase 4 EN | 26 | 0 | 26 |
| **Combined** | **295** | **0** | **295** |
| Device rehearsal (desktop) | 13 | 0 | 13 |

Gym G9.3 from the original baseline also passes. Context failures on earlier trees are expected (backup suite on the original baseline 9 of 30; reliability on PR #1 16 of 35; integration on PR #1 8 of 32). `bash integration/build.sh` is OK (patches 11 to 17 reproduce `integration/app` byte for byte; candidate `index.html` `71c7cb80…2e60`, `sw.js` `a2a9a805…d449`).
Prescriptions (`program_identity_verification.txt`): 32 of 32 program structures identical; the effective prescription is identical for all **130 rows**.

Test changes after code existed: gym G9.1 and G9.3 cache-name expectation updated for patch 17 (as before). EN3c and EN4g were rewritten before the fix to be non-vacuous (EN3c first logged into the wrong exercise; EN4g first assumed the wrong default method), and EN1e, EN4h were added once I found Bench defaults to Primer + Paused. Rehearsal D5 was updated for the new label and storage id.

## 6. Compatibility and downgrade limitations

Phase 4 changes **no schema, no key, no session field and no validator**; only evidence reads, target text and the cache name. Probe (`results/phase4/compat_probe.json`, each tree's own validator):

| Backup content | Baseline | PR #1 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|---|---|---|---|---|---|---|
| Phase 4 backup with rotation, skips, explicit-skip completion | accepted | accepted | accepted | **rejected** (explicit-skip basis) | accepted | accepted |
| same, explicit basis replaced | accepted | accepted | accepted | accepted | accepted | accepted |
| tag-like cardio text `<Z2>` | rejected | rejected | rejected | rejected | accepted | accepted |
| Phase 2-shape and older backups | n/a | n/a | n/a | n/a | n/a | accepted |

Downgrade limits: (1) a backup containing an explicit skip cannot be restored into Phase 2; (2) tag-like cardio text cannot be restored into any build before Phase 3; (3) going back to Phase 3 restores everything but the evidence will again use the old rules (a false ACT is possible again); (4) a stored Giant B rotation snapshot is ignored by builds before Phase 3 (their counter-based rotation resumes). No downgrade loses stored records.

## 7. Unresolved release blockers

1. **iPhone testing has not been done** (G1 to G9). This is the main blocker.
2. Your decisions: draft exclusion rule; accepting that back-offs no longer feed evidence; rotation defaults R1 to R5; evidence proposals still open (none now: D1 to D4 are implemented in minimal form, see section 4); cardio real-HTML restore proposal; the six unclassified templates; Phase 2 items U3 to U6 and D3 to D7.
3. Ordering: PR #6 then PR #7 then this branch (Phase 2 validator rejects explicit skips).
4. Earliest-date constraint (October 23, 2026) and your separate approval.
5. Tier 2 (HTTPS) needs `mkcert` and a temporary CA profile on your phone; if you will not install one, offline, install and update cannot be tested without a tunnel (needs separate approval).

## 8. GO / NO-GO

- **Production deployment or merge: NO-GO.** Blockers 1 to 4.
- **Isolated iPhone test on your Wi-Fi: GO**, starting with tier 1: `integration/device/lan_up.sh --forbid YOUR-REAL-HOST`, then follow `PHASE4_IPHONE_ACCEPTANCE_GUIDE.md` group by group and send results in the one-line format. Tier 2 follows if tier 1 is clean.
- Stopped before deployment and merging.
