import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTopicRich,
  parseTopicRich,
  richToProjection,
  TOPIC_SOURCE,
} from '@/lib/courses/topicRichState';
import { plainBulletsToHtml } from '@/lib/courses/topicHtml';

/**
 * The ONE staleness rule the renderer (B2) and the editor seed (B3) will share.
 *
 * ── WHY IT IS TESTED BEFORE IT IS WIRED ─────────────────────────────────────
 * The decision it makes is "whose formatting lands on whose sentence". Getting
 * it wrong does not throw and does not look broken — it renders confidently
 * wrong. So the rule is built and pinned first, with nothing calling it, and
 * the wiring rounds inherit a function that already has its controls.
 *
 * ── FIXTURES ARE IN THE API'S SHAPE ─────────────────────────────────────────
 * `rows` is MSDB `training_topics`: [{ title, bullets[] }] — exactly what
 * GET /api/ai/public-course returns and what the admin edit page seeds from.
 * The rich side is built by running the REAL `plainBulletsToHtml` over those
 * same bullets, so the "matching" fixtures are matching for the reason
 * production would make them match, not because they were typed to agree.
 */

/** Two MSDB rows, in the shape the API returns. */
const ROWS = () => [
  { title: 'เข้าใจ Power BI Semantic Model', bullets: ['ทบทวนองค์ประกอบ', 'Data Sharping'] },
  { title: 'การเรียงลำดับข้อมูล', bullets: ['a', 'b', 'c'] },
];

/** The rich field a save would have produced for exactly those rows. */
const richFor = (rows) => rows.map((r) => plainBulletsToHtml(r.bullets));

// ── 1. no rich copy — where all 79 live courses are ────────────────────────

test('an EMPTY rich field means plain, and is NOT stale', () => {
  /**
   * The distinction matters: "absent" and "out of date" are different states,
   * and conflating them would light a staleness warning on every course that
   * has never been touched — 79 of 79 today.
   */
  for (const rich of [[], null, undefined, 0, false, '']) {
    const out = resolveTopicRich({ rows: ROWS(), rich });
    assert.equal(out.source, TOPIC_SOURCE.PLAIN, `rich=${JSON.stringify(rich)}`);
    assert.equal(out.stale, false, `rich=${JSON.stringify(rich)} must not report stale`);
    assert.deepEqual(out.richRows, []);
  }
});

test('the MSDB rows are handed back untouched for the plain path', () => {
  const rows = ROWS();
  assert.deepEqual(resolveTopicRich({ rows, rich: [] }).rows, rows);
});

test('missing rows do not throw — an empty course resolves to plain', () => {
  for (const rows of [undefined, null, [], 'nonsense', {}]) {
    const out = resolveTopicRich({ rows, rich: [] });
    assert.equal(out.source, TOPIC_SOURCE.PLAIN);
    assert.equal(out.stale, false);
  }
  assert.equal(resolveTopicRich().source, TOPIC_SOURCE.PLAIN);
});

// ── 2. a rich copy that still describes these rows ─────────────────────────

test('a rich copy that flattens back to the MSDB rows is USED', () => {
  const rows = ROWS();
  const out = resolveTopicRich({ rows, rich: richFor(rows) });
  assert.equal(out.source, TOPIC_SOURCE.RICH);
  assert.equal(out.stale, false);
  assert.equal(out.richRows.length, 2);
});

test('CONTROL: that fixture is genuinely round-tripping, not trivially equal', () => {
  // If plainBulletsToHtml produced '' for everything, the match above would be
  // an artefact of two empty things comparing equal.
  const rows = ROWS();
  const decoded = parseTopicRich(richFor(rows));
  assert.ok(decoded[0].includes('<li>'), 'the rich fixture holds no list items');
  assert.ok(decoded[0].includes('ทบทวนองค์ประกอบ'), 'the rich fixture lost its text');
  assert.notEqual(decoded[0], '');
});

test('a row with no bullets is normal — its rich entry is the empty string', () => {
  // 125 of the 829 live rows carry no bullets at all.
  const rows = [{ title: 'สรุปเนื้อหา และ Q&A', bullets: [] }];
  const out = resolveTopicRich({ rows, rich: richFor(rows) });
  assert.deepEqual(out.richRows, ['']);
  assert.equal(out.source, TOPIC_SOURCE.RICH);
  assert.equal(out.stale, false);
});

test('formatting inside a bullet does not make it stale — the TEXT is what matches', () => {
  // The whole point of the split store: markup lives in genesis, and the rich
  // copy is valid exactly while its flattened text still equals MSDB's.
  const rows = [{ title: 'T', bullets: ['bold one', 'plain two'] }];
  const rich = ['<ul><li><strong>bold</strong> one</li><li>plain two</li></ul>'];
  const out = resolveTopicRich({ rows, rich });
  assert.equal(out.source, TOPIC_SOURCE.RICH);
  assert.equal(out.stale, false);
});

// ── 3. STALE — it exists and no longer matches ─────────────────────────────

test('an APPENDED upstream row makes the WHOLE course stale', () => {
  /**
   * This is the case a length check exists for, and the one that reddened
   * nothing before `projectionEquals` compared lengths: the loop only ran to
   * a.length, so extra rows on the far end compared equal. Here it is caught
   * twice over — `richToProjection` refuses to align mismatched lengths, and
   * `projectionEquals` would catch it anyway.
   */
  const rows = ROWS();
  const rich = richFor(rows);
  rows.push({ title: 'ใหม่', bullets: ['x'] });
  const out = resolveTopicRich({ rows, rich });
  assert.equal(out.source, TOPIC_SOURCE.PLAIN);
  assert.equal(out.stale, true);
});

test('an INSERTED upstream row makes the WHOLE course stale, not just that row', () => {
  // Per-index matching would keep row 0's formatting and apply row 0's markup
  // to the inserted row's text. Whole-array is the only safe reading.
  const rows = ROWS();
  const rich = richFor(rows);
  rows.splice(1, 0, { title: 'แทรก', bullets: ['y'] });
  const out = resolveTopicRich({ rows, rich });
  assert.equal(out.source, TOPIC_SOURCE.PLAIN);
  assert.equal(out.stale, true);
});

test('a REORDER makes it stale', () => {
  const rows = ROWS();
  const rich = richFor(rows);
  const out = resolveTopicRich({ rows: rows.slice().reverse(), rich });
  assert.equal(out.source, TOPIC_SOURCE.PLAIN);
  assert.equal(out.stale, true);
});

test('a DELETED row makes it stale', () => {
  const rows = ROWS();
  const rich = richFor(rows);
  const out = resolveTopicRich({ rows: rows.slice(0, 1), rich });
  assert.equal(out.source, TOPIC_SOURCE.PLAIN);
  assert.equal(out.stale, true);
});

test('an EDITED bullet upstream makes it stale', () => {
  const rows = ROWS();
  const rich = richFor(rows);
  rows[1].bullets[0] = 'edited upstream';
  const out = resolveTopicRich({ rows, rich });
  assert.equal(out.source, TOPIC_SOURCE.PLAIN);
  assert.equal(out.stale, true);
});

test('an EDITED TITLE alone does NOT invalidate the rich copy', () => {
  /**
   * ── THIS TEST WAS WRITTEN THE OTHER WAY ROUND FIRST, AND WAS WRONG ────────
   * The first draft asserted a retitled row IS stale, reasoning that "a
   * retitled row is a different row". It went red, and the red was correct:
   * `richToProjection` takes every title FROM the MSDB rows, so both sides of
   * the comparison always carry the same titles and a rename cannot possibly
   * register.
   *
   * Chasing the red would have meant storing titles in the rich field to make
   * them discriminate. That would have been the wrong fix, because the
   * behaviour it was chasing is wrong: the rich copy is per-row BULLET
   * formatting, and renaming a heading leaves every bullet under it untouched.
   * The formatting still describes exactly the bullets it was authored for.
   *
   * What genuinely invalidates is anything that changes WHICH BULLETS SIT AT
   * INDEX i — insert, append, delete, reorder — and every one of those is
   * covered above. A rename is not one of them.
   */
  const rows = ROWS();
  const rich = richFor(rows);
  rows[0].title = 'หัวข้อใหม่';
  const out = resolveTopicRich({ rows, rich });
  assert.equal(out.source, TOPIC_SOURCE.RICH);
  assert.equal(out.stale, false);
});

test('CONTROL: titles are carried from MSDB on BOTH sides, so they cannot discriminate', () => {
  /**
   * Stated as a fact about the code rather than left for a reader to infer from
   * the test above. `projectionEquals` does compare titles — it is the settled
   * comparison function and is used unmodified — but here both operands take
   * their titles from the same `plainRows`, so the discriminating power comes
   * entirely from the BULLETS and the LENGTH. Anyone changing this file should
   * know that before concluding the title check is doing work.
   */
  const rows = ROWS();
  const rebuilt = richToProjection(parseTopicRich(richFor(rows)), rows);
  assert.deepEqual(rebuilt.map((r) => r.title), rows.map((r) => r.title));
});

test('a bullet ADDED to one row makes it stale', () => {
  const rows = ROWS();
  const rich = richFor(rows);
  rows[0].bullets.push('extra');
  const out = resolveTopicRich({ rows, rich });
  assert.equal(out.source, TOPIC_SOURCE.PLAIN);
  assert.equal(out.stale, true);
});

// ── every uncertainty resolves to plain ────────────────────────────────────

test('a STRUCTURALLY WRONG rich field degrades to plain and never throws', () => {
  /**
   * The field is a real `[String]`, so there is no parse step and no
   * syntactically-broken state — only structurally wrong ones. Mongo hands back
   * whatever is in the document, and a hand-edited row or a future migration
   * can put anything there.
   *
   * Every one of these reads as ABSENT rather than stale: the resolver cannot
   * tell what was intended, so it must not claim a rich copy exists and is out
   * of date. It falls back to exactly today's behaviour and says nothing.
   */
  const rows = ROWS();
  for (const rich of [
    '<ul></ul>',                       // a bare string, not an array
    { 0: '<ul></ul>' },                // an object
    [1, 2],                            // array of non-strings
    [null],                            // array with a null
    ['<ul></ul>', 7],                  // ONE bad entry poisons the whole field
    [undefined],                       // array with a hole
    [['<ul></ul>']],                   // nested array
  ]) {
    const out = resolveTopicRich({ rows, rich });
    const label = JSON.stringify(rich);
    assert.equal(out.source, TOPIC_SOURCE.PLAIN, `rich=${label}`);
    assert.equal(out.stale, false, `${label}: unreadable is ABSENT, not stale`);
    assert.deepEqual(out.richRows, [], `rich=${label}`);
  }
});

test('a rich array of the WRONG LENGTH is stale, not a crash', () => {
  const rows = ROWS();
  for (const rich of [['<ul><li>a</li></ul>'], ['', '', '']]) {
    const out = resolveTopicRich({ rows, rich });
    assert.equal(out.source, TOPIC_SOURCE.PLAIN);
    assert.equal(out.stale, true, `${JSON.stringify(rich)}: a readable but misaligned copy IS stale`);
  }
});

test('richToProjection refuses to align mismatched inputs', () => {
  assert.equal(richToProjection(['<ul></ul>'], ROWS()), null, 'aligned two rows to one');
  assert.equal(richToProjection('nope', ROWS()), null);
  assert.equal(richToProjection([], 'nope'), null);
});

test('CONTROL: the resolver is not simply always-plain', () => {
  /**
   * Every negative above lands on PLAIN, so a resolver that returned PLAIN
   * unconditionally would pass all of them and be worthless. This is the one
   * assertion that fails if RICH becomes unreachable.
   */
  const rows = ROWS();
  assert.equal(resolveTopicRich({ rows, rich: richFor(rows) }).source, TOPIC_SOURCE.RICH);
});

test('CONTROL: the resolver is not simply always-rich either', () => {
  const rows = ROWS();
  assert.equal(resolveTopicRich({ rows, rich: [] }).source, TOPIC_SOURCE.PLAIN);
  assert.equal(
    resolveTopicRich({ rows, rich: ['<ul><li>different</li></ul>', ''] }).source,
    TOPIC_SOURCE.PLAIN,
  );
});

test('the two stale-vs-absent states are distinguishable by the caller', () => {
  // B2 shows a warning for one and nothing for the other. If both reported the
  // same pair of values the caller could not tell them apart.
  const rows = ROWS();
  const absent = resolveTopicRich({ rows, rich: [] });
  const stale = resolveTopicRich({ rows, rich: ['<ul><li>x</li></ul>', ''] });
  assert.deepEqual(
    [absent.source, absent.stale], [TOPIC_SOURCE.PLAIN, false],
  );
  assert.deepEqual(
    [stale.source, stale.stale], [TOPIC_SOURCE.PLAIN, true],
  );
});

// ── the encoding ───────────────────────────────────────────────────────────

test('parseTopicRich takes a per-row array and rejects everything else', () => {
  // It reads the array Mongo returns. No JSON, no parse step — an earlier
  // draft of this module decoded a JSON string and the schema was ruled to be
  // a real [String] instead, which removes that failure mode entirely.
  assert.deepEqual(parseTopicRich(['<ul></ul>', '']), ['<ul></ul>', '']);
  assert.deepEqual(parseTopicRich([]), []);
  for (const bad of [
    '', '  ', null, undefined, 5, {}, [1], { a: 1 }, 'x',
    '["<ul></ul>"]',   // the JSON-string form is NOT accepted — it is a string
  ]) {
    assert.deepEqual(parseTopicRich(bad), [], `parseTopicRich(${JSON.stringify(bad)})`);
  }
});
