# Time-Constrained Session (TCS) — design package

**DESIGN AND TEST SPECIFICATION ONLY. Nothing is implemented, merged or deployed.** No app file, either earlier patch (backup/restore, reliability), the audit, or any stored data is modified. Full Session remains the default.

Read in this order:

| File | Contents |
|---|---|
| `TCS_DESIGN_SPECIFICATION.md` | Feature spec, prioritization rules, warm-up/cool-down handling, safety layer, time-estimation methodology, preview, deferral, data model, modelled worked examples |
| `TCS_ROTATION_STATE_MODEL.md` | Intensifier-rotation correction: current behaviour and defects, options, recommended state model, parity and compatibility |
| `TCS_COMPATIBILITY_AND_SEQUENCE.md` | Verified compatibility facts, coordination with the two patches, risk register, smallest implementation sequence |
| `TCS_TEST_PLAN.md` | 106 test IDs covering every scenario you listed |
| `TCS_DECISIONS_AND_CLINICAL_QUESTIONS.md` | Decisions requiring your approval (with recommended defaults) and clinical questions |

Supporting, non-production material (not loaded by the app; it reads only `audit/data/*`):

| Path | Purpose | Reproduce |
|---|---|---|
| `model/tcs_planner_model.js` | Reduction-ladder planner, time model, invariant and monotonicity grid | `node design/time-constrained-session/model/tcs_planner_model.js design/time-constrained-session/model/worked_examples.json` |
| `model/rotation_model.js` | Executable rotation state model; 15 checks | `node design/time-constrained-session/model/rotation_model.js` |
| `model/worked_examples.json`, `model/rotation_model_results.json` | Last outputs | |
| `probes/compat_probe.js` | Read-only: asks the app's own `validateBackup` whether additive TCS fields are accepted | `node design/time-constrained-session/probes/compat_probe.js app` (also `baseline/hq-2.3`) |
| `probes/compat_results_*.json` | Last outputs | |

**What is and is not evidenced.** All timings are modelled with placeholder constants and are uncalibrated. Nothing was measured on a real device or from real workout timestamps. The tier order, warm-up tags and constants are drafts awaiting approval.
