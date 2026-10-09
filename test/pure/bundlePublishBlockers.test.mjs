import { test } from 'node:test';
import assert from 'node:assert/strict';

import { publishBlockers } from '@/lib/pageBuilder/publishReadiness';

/**
 * The two bundle blockers the offered-rounds round adds, and the line between
 * a blocker and a warning.
 *
 * Both of these are facts about the STORED DOCUMENT and will still be true
 * tomorrow. Whether a sequential chain exists is not — it depends on live
 * status and can fix itself with nobody touching the page — so that one is a
 * warning in the editor and deliberately not here.
 */

const page = (sections) => ({ title: 'T', slug: 's', sections });

const bundle = (content) => [{ id: 'sec-1', type: 'promotion_bundle', content }];

/**
 * The TARGET status is the second argument, and it matters: publishBlockers
 * returns [] for draft/closed/archived by design, so a half-typed bundle saves
 * freely and only a publish is refused. A fixture that omitted it would get an
 * empty list for every case and every "does not block" test would pass
 * vacuously — which is exactly what the first draft of this file did.
 */
const messages = (sections) => publishBlockers(page(sections), 'published').map((b) => b.message);
const matching = (sections, re) => messages(sections).filter((m) => re.test(m));

test('an item with NO offered round blocks the publish', () => {
  const out = matching(bundle({
    name: 'ชุดคู่', listPrice: 100, netPrice: 80,
    items: [{ id: 'i1', courseId: 'MSE-L1', rounds: [] }],
  }), /ยังไม่ได้เลือกรอบ/);
  assert.equal(out.length, 1);
  assert.match(out[0], /ชุดคู่/, 'the bundle is named');
  assert.match(out[0], /MSE-L1/, 'and so is the course');
});

test('a LEGACY item with no roundId blocks too — the stored shape is normalised', () => {
  assert.equal(matching(bundle({
    items: [{ id: 'i1', courseId: 'MSE-L1', roundId: '' }],
  }), /ยังไม่ได้เลือกรอบ/).length, 1);
});

test('a LEGACY item WITH a roundId does not block — it offers one round', () => {
  assert.equal(matching(bundle({
    items: [{ id: 'i1', courseId: 'MSE-L1', roundId: 'r1' }],
  }), /ยังไม่ได้เลือกรอบ/).length, 0);
});

test('an item with offered rounds does not block', () => {
  assert.equal(matching(bundle({
    items: [{ id: 'i1', courseId: 'MSE-L1', rounds: [{ id: 'r1' }, { id: 'r2' }] }],
  }), /ยังไม่ได้เลือกรอบ/).length, 0);
});

test('a pickUntil LATER than the day before the round starts blocks', () => {
  const out = matching(bundle({
    name: 'ชุดคู่',
    items: [{
      id: 'i1', courseId: 'MSE-L1',
      rounds: [{ id: 'r1', snapshot: { id: 'r1', dates: ['2026-11-12'], type: '' }, pickUntil: '2026-12-25' }],
    }],
  }), /วันสุดท้ายที่เลือกรอบได้/);
  assert.equal(out.length, 1);
  assert.match(out[0], /2026-12-25/, 'it quotes the offending value');
  assert.match(out[0], /2026-11-11/, 'and the latest one that would work');
});

test('a pickUntil ON or BEFORE the cap does not block', () => {
  for (const pickUntil of ['2026-11-11', '2026-10-01']) {
    assert.equal(matching(bundle({
      items: [{
        id: 'i1', courseId: 'C',
        rounds: [{ id: 'r1', snapshot: { id: 'r1', dates: ['2026-11-12'], type: '' }, pickUntil }],
      }],
    }), /วันสุดท้ายที่เลือกรอบได้/).length, 0, pickUntil);
  }
});

test('an ABSENT pickUntil never blocks', () => {
  assert.equal(matching(bundle({
    items: [{ id: 'i1', courseId: 'C', rounds: [{ id: 'r1', snapshot: { id: 'r1', dates: ['2026-11-12'], type: '' } }] }],
  }), /วันสุดท้ายที่เลือกรอบได้/).length, 0);
});

test('a round with no readable dates cannot be too late — nothing to exceed', () => {
  assert.equal(matching(bundle({
    items: [{ id: 'i1', courseId: 'C', rounds: [{ id: 'r1', pickUntil: '2026-12-25' }] }],
  }), /วันสุดท้ายที่เลือกรอบได้/).length, 0);
});

test('CONTROL: the inverted-price blocker still fires, and the new ones do not swallow it', () => {
  const out = messages(bundle({
    name: 'ชุดคู่', listPrice: 80, netPrice: 100,
    items: [{ id: 'i1', courseId: 'C', rounds: [{ id: 'r1' }] }],
  }));
  assert.equal(out.filter((m) => /ราคาสุทธิสูงกว่าราคาปกติ/.test(m)).length, 1);
});

test('CONTROL: a well-formed bundle produces NO blockers at all', () => {
  assert.deepEqual(messages(bundle({
    name: 'ชุดคู่', listPrice: 100, netPrice: 80,
    items: [
      { id: 'i1', courseId: 'A', rounds: [{ id: 'r1', snapshot: { id: 'r1', dates: ['2026-11-12'], type: '' }, pickUntil: '2026-11-01' }] },
      { id: 'i2', courseId: 'B', rounds: [{ id: 'r2' }] },
    ],
  })), []);
});

test('every item is reported, not just the first', () => {
  assert.equal(matching(bundle({
    items: [
      { id: 'i1', courseId: 'A', rounds: [] },
      { id: 'i2', courseId: 'B', rounds: [] },
    ],
  }), /ยังไม่ได้เลือกรอบ/).length, 2);
});

// ── one course = one item ──────────────────────────────────────────────────

test('the SAME courseId in two items blocks the publish', () => {
  const out = matching(bundle({
    name: 'ชุดคู่',
    items: [
      { id: 'i1', courseId: 'MSE-L1', rounds: [{ id: 'r1' }] },
      { id: 'i2', courseId: 'MSE-L1', rounds: [{ id: 'r2' }] },
    ],
  }), /อยู่ในแพ็กเกจ/);
  assert.equal(out.length, 1, 'one message per repeated course, not one per item');
  assert.match(out[0], /MSE-L1/);
  assert.match(out[0], /2 ครั้ง/);
  assert.match(out[0], /เพิ่มรอบในการ์ดนั้น/, 'it says what to do instead');
});

test('three items of one course report the count, still as one message', () => {
  const out = matching(bundle({
    items: [
      { id: 'i1', courseId: 'A', rounds: [{ id: 'r1' }] },
      { id: 'i2', courseId: 'A', rounds: [{ id: 'r2' }] },
      { id: 'i3', courseId: 'A', rounds: [{ id: 'r3' }] },
    ],
  }), /อยู่ในแพ็กเกจ/);
  assert.equal(out.length, 1);
  assert.match(out[0], /3 ครั้ง/);
});

test('TWO different repeated courses give two messages', () => {
  assert.equal(matching(bundle({
    items: [
      { id: 'i1', courseId: 'A', rounds: [{ id: 'r1' }] },
      { id: 'i2', courseId: 'A', rounds: [{ id: 'r2' }] },
      { id: 'i3', courseId: 'B', rounds: [{ id: 'r3' }] },
      { id: 'i4', courseId: 'B', rounds: [{ id: 'r4' }] },
    ],
  }), /อยู่ในแพ็กเกจ/).length, 2);
});

test('CONTROL: distinct courses do not block, and neither does an unnamed one', () => {
  assert.equal(matching(bundle({
    items: [
      { id: 'i1', courseId: 'A', rounds: [{ id: 'r1' }] },
      { id: 'i2', courseId: 'B', rounds: [{ id: 'r2' }] },
    ],
  }), /อยู่ในแพ็กเกจ/).length, 0);

  // Two items with no course yet is a half-authored bundle, not a duplicate —
  // they are already caught by the no-round blocker, and calling them the same
  // course would be a message the author cannot act on.
  assert.equal(matching(bundle({
    items: [{ id: 'i1', courseId: '', rounds: [] }, { id: 'i2', courseId: '', rounds: [] }],
  }), /อยู่ในแพ็กเกจ/).length, 0);
});

test('a LEGACY pair of items for one course blocks — the old model is retired', () => {
  // The shape the retired "add the course again for another round" model
  // produced. MEASURED: no stored bundle actually has one, so this blocks
  // nothing that exists; it exists so the model cannot come back by hand.
  assert.equal(matching(bundle({
    items: [
      { id: 'i1', courseId: 'MSE-L1', roundId: 'r1' },
      { id: 'i2', courseId: 'MSE-L1', roundId: 'r2' },
    ],
  }), /อยู่ในแพ็กเกจ/).length, 1);
});
