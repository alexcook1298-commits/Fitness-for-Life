'use strict';
// DESIGN MODEL — NOT PRODUCTION CODE. Not loaded by the app. Reads and writes no app file or app data.
// Purpose: make the proposed intensifier-rotation state model (Option C in TCS_ROTATION_STATE_MODEL.md)
// executable so its parity, anti-double-counting and no-history-mutation properties can be checked before approval.
// Usage: node design/time-constrained-session/model/rotation_model.js
const assert = require('assert');

const GROUPS = [[3, 4], [1, 5], [0, 6]];
const STRAIGHT = 'Straight Sets';
const DEFAULTS = { creditPolicy: 'any', lapseAfter: 2 };

const legacyGroup = sessions => sessions.filter(s => s.template === 'b' && s.status === 'complete').length % 3;

function evidence(session, hist, policy) {
  const snap = session.rotation;
  const mine = hist.filter(h => h.sessionId === session.id);
  const need = snap.slots.filter(i => snap.methods[i] && snap.methods[i] !== STRAIGHT);
  if (!need.length) return { credited: session.status === 'complete', reason: 'no-method-presented' };
  const done = need.filter(i => mine.some(h => h.slot === i && h.mode !== STRAIGHT && h.complete));
  const ok = policy === 'all' ? done.length === need.length : done.length >= 1;
  return { credited: ok, reason: ok ? 'performed' : 'not-performed', done, need };
}

function derive(sessions, hist, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const bs = sessions.filter(s => s.template === 'b').slice().sort((a, b) => a.startedAt - b.startedAt);
  const last = [-1, -1, -1], streak = [0, 0, 0], log = [];
  let seq = 0;
  const pre = bs.filter(s => !s.rotation && s.status === 'complete');
  for (const s of pre) { last[seq % 3] = seq; log.push({ id: s.id, group: seq % 3, kind: 'legacy-credit' }); seq++; }
  const seen = new Set();
  for (const s of bs.filter(x => x.rotation)) {
    const key = s.id + '|' + s.rotation.group;
    if (seen.has(key)) continue;
    seen.add(key);
    const g = s.rotation.group, finished = s.status === 'complete';
    const ev = evidence(s, hist, o.creditPolicy);
    if (ev.credited) { last[g] = seq; streak[g] = 0; log.push({ id: s.id, group: g, kind: 'credit', reason: ev.reason }); seq++; }
    else if (finished) {
      streak[g]++;
      if (streak[g] >= o.lapseAfter) { last[g] = seq; streak[g] = 0; log.push({ id: s.id, group: g, kind: 'lapse-advance' }); }
      else log.push({ id: s.id, group: g, kind: 'uncredited' });
      seq++;
    } else log.push({ id: s.id, group: g, kind: 'draft-uncredited' });
  }
  let next = 0;
  for (let g = 1; g < 3; g++) if (last[g] < last[next]) next = g;
  return { next, last, streak, log };
}

let nid = 0;
function mkSession(g, status, t, methods) {
  const slots = GROUPS[g];
  return { id: 's' + (++nid), template: 'b', status, startedAt: t, rotation: { v: 1, group: g, slots, methods: methods || Object.fromEntries(slots.map(i => [i, i === 0 ? STRAIGHT : 'Myo-Reps'])) } };
}
const rec = (s, slot, complete = true, mode = 'Myo-Reps') => ({ sessionId: s.id, slot, mode, complete });
const deepFreeze = o => { Object.values(o).forEach(v => typeof v === 'object' && v && deepFreeze(v)); return Object.freeze(o); };

const results = [];
function t(name, fn) { try { fn(); results.push({ name, pass: true }); } catch (e) { results.push({ name, pass: false, error: e.message }); } }

t('ROT-PARITY-01 legacy history (no snapshots) reproduces the legacy counter for 0..40 complete B', () => {
  for (let n = 0; n <= 40; n++) {
    const ss = Array.from({ length: n }, (_, k) => ({ id: 'p' + k, template: 'b', status: 'complete', startedAt: k }));
    assert.strictEqual(derive(ss, []).next, legacyGroup(ss), 'n=' + n);
  }
});
t('ROT-PARITY-02 legacy history ignores drafts and non-B like the legacy counter', () => {
  const ss = [{ id: 'x1', template: 'b', status: 'complete', startedAt: 1 }, { id: 'x2', template: 'a', status: 'complete', startedAt: 2 }, { id: 'x3', template: 'b', status: 'draft', startedAt: 3 }, { id: 'x4', template: 'b', status: 'complete', startedAt: 4 }];
  assert.strictEqual(derive(ss, []).next, legacyGroup(ss));
});
t('ROT-PARITY-03 fully performed new-era sessions follow the legacy sequence 0,1,2,0,1,2 (property, 200 random lengths and pre-era offsets)', () => {
  for (let trial = 0; trial < 200; trial++) {
    const pre = trial % 7, ss = [], h = [];
    for (let k = 0; k < pre; k++) ss.push({ id: 'p' + trial + '_' + k, template: 'b', status: 'complete', startedAt: k });
    let expected = pre % 3;
    for (let k = 0; k < (trial % 11) + 1; k++) {
      const d = derive(ss, h);
      assert.strictEqual(d.next, expected, `trial ${trial} step ${k}`);
      const s = mkSession(d.next, 'complete', 1000 + k);
      ss.push(s); GROUPS[d.next].forEach(i => { if (i !== 0) h.push(rec(s, i)); });
      expected = (expected + 1) % 3;
    }
  }
});
t('ROT-SKIP-01 a completed B that skipped the presented intensifiers does not advance rotation', () => {
  const s = mkSession(0, 'complete', 1);
  assert.strictEqual(derive([s], []).next, 0);
});
t('ROT-SKIP-02 skipping is not repeated forever: lapse advances the group after 2 finished uncredited presentations', () => {
  const a = mkSession(0, 'complete', 1), b = mkSession(0, 'complete', 2);
  assert.strictEqual(derive([a], []).next, 0);
  const d = derive([a, b], []);
  assert.strictEqual(d.next, 1);
  assert.ok(d.log.some(x => x.kind === 'lapse-advance'));
});
t('ROT-PART-01 a partially completed intensifier (incomplete record) earns no credit', () => {
  const s = mkSession(0, 'complete', 1);
  assert.strictEqual(derive([s], [rec(s, 3, false), rec(s, 4, false)]).next, 0);
});
t('ROT-PART-02 credit policy: one of two slots performed credits under "any" and not under "all"', () => {
  const s = mkSession(0, 'complete', 1), h = [rec(s, 3, true)];
  assert.strictEqual(derive([s], h, { creditPolicy: 'any' }).next, 1);
  assert.strictEqual(derive([s], h, { creditPolicy: 'all' }).next, 0);
});
t('ROT-COMPACT-01 compact/time-constrained B whose presented slots were hidden or run straight earns no credit', () => {
  const s = mkSession(1, 'complete', 1, { 1: 'Rest-Pause', 5: 'Myo-Reps' });
  const h = [rec(s, 1, true, STRAIGHT)];
  assert.strictEqual(derive([s], h).next, 0, 'group 0 untouched, group 1 uncredited, tie -> lowest index');
  assert.strictEqual(derive([s], h).last[1], -1);
});
t('ROT-DRAFT-01 an interrupted draft with performed intensifier earns credit once, and resuming does not double-count', () => {
  const s = mkSession(0, 'draft', 1), h = [rec(s, 3), rec(s, 4)];
  const d1 = derive([s], h);
  assert.strictEqual(d1.next, 1);
  const resumed = { ...s, status: 'complete' };
  const d2 = derive([resumed], h.concat([rec(s, 3)]));
  assert.strictEqual(d2.next, 1);
  assert.strictEqual(d2.log.filter(x => x.kind === 'credit').length, 1);
});
t('ROT-DRAFT-02 an abandoned draft without records neither credits nor counts toward lapse', () => {
  const ds = [mkSession(0, 'draft', 1), mkSession(0, 'draft', 2), mkSession(0, 'draft', 3)];
  assert.strictEqual(derive(ds, []).next, 0);
  assert.deepStrictEqual(derive(ds, []).streak, [0, 0, 0]);
});
t('ROT-DUP-01 duplicate sessions or duplicate records (for example after a merged restore) do not double-credit', () => {
  const s = mkSession(0, 'complete', 1), h = [rec(s, 3), rec(s, 4)];
  const once = derive([s], h), twice = derive([s, { ...s }], h.concat(h));
  assert.deepStrictEqual(twice.last, once.last);
  assert.strictEqual(twice.log.filter(x => x.kind === 'credit').length, 1);
});
t('ROT-HIST-01 derivation never mutates its inputs (history, records, sessions)', () => {
  const s = mkSession(0, 'complete', 1), ss = deepFreeze([s]), h = deepFreeze([rec(s, 3)]);
  derive(ss, h, {});
});
t('ROT-NOMETHOD-01 a presented group with no non-straight method credits on completion (cannot stall)', () => {
  const s = mkSession(2, 'complete', 1, { 0: STRAIGHT, 6: STRAIGHT });
  assert.strictEqual(derive([s], []).last[2], 0);
});
t('ROT-MANUAL-01 manual intensifier override on a slot outside the presented group earns no credit', () => {
  const s = mkSession(0, 'complete', 1);
  assert.strictEqual(derive([s], [rec(s, 5)]).next, 0);
});
t('ROT-MIX-01 pre-era history followed by new-era sessions is seamless', () => {
  const pre = [0, 1, 2, 3].map(k => ({ id: 'p' + k, template: 'b', status: 'complete', startedAt: k }));
  assert.strictEqual(derive(pre, []).next, 1);
  const s = mkSession(1, 'complete', 100);
  assert.strictEqual(derive(pre.concat([s]), [rec(s, 1), rec(s, 5)]).next, 2);
});

const failed = results.filter(r => !r.pass);
console.log(JSON.stringify({ model: 'rotation_model', defaults: DEFAULTS, total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 1));
process.exitCode = failed.length ? 1 : 0;
module.exports = { derive, legacyGroup, GROUPS };
