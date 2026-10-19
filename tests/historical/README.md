# Historical evidence (not part of the active regression suites)

`S1.8_original_defect_assertion.test.js` is the original reliability test `S1.8` from PR #3, preserved verbatim in intent.
It asserts the **defective** behaviour of the baseline Training Budget: `budgetData()` classified templates by substring, so
`mobility` counted as Hypertrophy and `athletic` counted as Strength. It was written to document a known limitation, not to guard
desired behaviour. It is meaningful only on trees that already count `complete` sessions (the PR #3 session-status fix), because the
budget reads `recentSessions`. It **passes (defect present)** on baseline + the PR #3 patch and on PR #1 `app/` + `integration/patches/01`,
and **fails (defect absent)** on the integration candidate and later. On the unpatched baseline and on `app/` alone it also reports
"absent", but for a different reason (those trees do not count `complete` sessions at all, so the budget is empty).

The active suite (`tests/reliability.test.js`) now contains `S1.8` as a corrected regression assertion of the desired behaviour.

    # baseline + PR #3 patch (build a scratch copy first), exit 0 = defect present (historical):
    cp -r baseline/hq-2.3 /tmp/p3 && (cd /tmp/p3 && patch -p1 < ../path/to/reliability/reliability-repair.patch)
    node tests/historical/S1.8_original_defect_assertion.test.js /tmp/p3
    node tests/historical/S1.8_original_defect_assertion.test.js integration/app     # exit 1: defect fixed
