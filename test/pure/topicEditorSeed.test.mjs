import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedTopicEditorRows, STALE_TOPIC_WARNING } from '@/lib/courses/topicEditorSeed';
import { prepareOutlineRichHtml } from '@/lib/courses/courseOutlineView';
import { resolveTopicRich, TOPIC_SOURCE } from '@/lib/courses/topicRichState';
import { buildTopicSavePayload } from '@/lib/courses/topicEditorSave';
import { plainBulletsToHtml, htmlToProjection } from '@/lib/courses/topicHtml';
import { sanitizeTopicHtml } from '@/lib/courses/sanitizeTopicHtml';

/** An MSDB course row, as /public-course returns it. */
const course = (training_topics, course_id = 'TEST-1') => ({ course_id, training_topics });

const UIPATH = course([{
  title: 'Email Automation',
  bullets: ['อธิบายความสามารถของ List<mailmessage> ที่ได้จากการอ่าน email'],
}], 'UIPATH');

const PLAIN = course([
  { title: 'A', bullets: ['one', 'two'] },
  { title: 'Part 9. สรุปเนื้อหา และ Q&A', bullets: [] },
]);

/** A rich copy that genuinely describes PLAIN's rows. */
const MATCHING_RICH = buildTopicSavePayload([
  { title: 'A', html: '<ul><li><p><strong>one</strong></p></li><li><p>two</p></li></ul>' },
  { title: 'Part 9. สรุปเนื้อหา และ Q&A', html: '' },
]).rich;

// ── a. the seed asks the SAME function the renderer asks ───────────────────

test('the seed and the public renderer reach the same decision, always', () => {
  /**
   * Not "an equivalent decision". `seedTopicEditorRows` and
   * `prepareOutlineRichHtml` both call `resolveTopicRich`. If they could
   * disagree, the admin edits formatting no visitor can see, or a visitor sees
   * formatting the form never loaded and the next save destroys.
   *
   * Swept across all three cases rather than asserted on one, because the two
   * only need to disagree in ONE state to lose work in it.
   */
  const cases = [
    ['no rich copy', PLAIN, null],
    ['matching rich copy', PLAIN, { trainingTopicsRich: MATCHING_RICH }],
    ['stale rich copy', course([{ title: 'A', bullets: ['CHANGED'] }]), { trainingTopicsRich: MATCHING_RICH }],
  ];
  for (const [label, c, ext] of cases) {
    const seed = seedTopicEditorRows({ course: c, extension: ext });
    const rendered = prepareOutlineRichHtml({ course: c, extension: ext, onStale: () => {} });
    const rendererUsedRich = rendered !== null;
    assert.equal(seed.source === TOPIC_SOURCE.RICH, rendererUsedRich,
      `${label}: the form and the page disagree about whether the rich copy is usable`);
  }
});

// ── b. PLAIN: seeded from the MSDB bullets, and ESCAPED ────────────────────

test('a plain course seeds from plainBulletsToHtml, one <ul> per row', () => {
  const { rows, source, stale, warning } = seedTopicEditorRows({ course: PLAIN, extension: null });
  assert.equal(source, TOPIC_SOURCE.PLAIN);
  assert.equal(stale, false);
  assert.equal(warning, '');
  assert.deepEqual(rows, [
    { title: 'A', html: '<ul><li>one</li><li>two</li></ul>' },
    { title: 'Part 9. สรุปเนื้อหา และ Q&A', html: '' },
  ]);
});

test('BARRIER 1 — the plain seed HTML-ESCAPES, so List<mailmessage> survives', () => {
  /**
   * ── THIS FIXTURE HAS NO RICH COPY AT ALL, DELIBERATELY ──────────────────
   * The staleness rule (barrier 2) is a genuinely independent mechanism and
   * usually catches this class of problem first. Testing escaping on a course
   * that ALSO has a stale copy would let either barrier carry the test, and a
   * green run would say nothing about which one works.
   *
   * So: `extension: null`. Nothing but the escaping stands between the stored
   * value and the editor. Unescaped, the browser parses `<mailmessage>` as an
   * unknown element, drops it, AND TAKES THE TEXT — the admin loses a live
   * bullet by doing nothing but opening the form.
   */
  const { rows, stale } = seedTopicEditorRows({ course: UIPATH, extension: null });
  assert.equal(stale, false, 'this fixture must not be able to lean on barrier 2');
  assert.equal(rows[0].html,
    '<ul><li>อธิบายความสามารถของ List&lt;mailmessage&gt; ที่ได้จากการอ่าน email</li></ul>');
  assert.ok(!rows[0].html.includes('<mailmessage>'), 'the angle bracket reached the DOM as a tag');
});

test('CONTROL: an unescaped seed loses the text the moment it is parsed', () => {
  /**
   * The failure barrier 1 prevents, reproduced. Concatenating the value into
   * markup is the shape any "just build the <li> yourself" refactor would take;
   * the parser then eats the element and the text with it.
   */
  const value = UIPATH.training_topics[0].bullets[0];
  const naive = `<ul><li>${value}</li></ul>`;

  /**
   * MEASURED, not assumed. The parser opens `<mailmessage>` as an unknown
   * element, so the TOKEN ITSELF is consumed and the type name is gone from the
   * bullet; the trailing text survives because it simply lands inside that
   * element and `ownText` walks into it. Partial loss, silent, and permanent
   * once saved — "List<mailmessage>" becomes "List".
   */
  assert.deepEqual(htmlToProjection(naive),
    ['อธิบายความสามารถของ List ที่ได้จากการอ่าน email'],
    'the naive seed did not lose the type name, so the escaping test proves nothing');
  assert.ok(!htmlToProjection(naive)[0].includes('List<mailmessage>'));
  assert.deepEqual(htmlToProjection(plainBulletsToHtml([value])), [value],
    'the escaped seed must round-trip the value byte-identically');
});

test('a TITLE-ONLY row seeds an EMPTY editor, not an empty list', () => {
  /**
   * 125 rows across 27 courses. They must open as an editor the admin can type
   * the first bullet into. `<ul></ul>` would also make the row count as content
   * to `title || bullets.length > 0` on the way back out.
   */
  const { rows } = seedTopicEditorRows({ course: course([{ title: 'heading', bullets: [] }]), extension: null });
  assert.deepEqual(rows, [{ title: 'heading', html: '' }]);
});

// ── c. RICH: seeded from the stored HTML ───────────────────────────────────

test('a matching rich copy seeds the editor from the STORED html', () => {
  const { rows, source, stale, warning } = seedTopicEditorRows({
    course: PLAIN, extension: { trainingTopicsRich: MATCHING_RICH },
  });
  assert.equal(source, TOPIC_SOURCE.RICH);
  assert.equal(stale, false);
  assert.equal(warning, '');
  assert.ok(rows[0].html.includes('<strong>one</strong>'),
    'the stored formatting did not reach the form — the admin would re-do it');
  assert.equal(rows[0].title, 'A', 'titles stay MSDB-owned even on the rich path');
});

// ── d. STALE: discard, fall back to plain, and WARN ────────────────────────

const STALE_COURSE = course([{ title: 'A', bullets: ['one', 'two', 'THREE ADDED UPSTREAM'] }]);

test('a stale rich copy is DISCARDED and the seed falls back to plain', () => {
  const { rows, source, stale } = seedTopicEditorRows({
    course: STALE_COURSE, extension: { trainingTopicsRich: MATCHING_RICH },
  });
  assert.equal(source, TOPIC_SOURCE.PLAIN);
  assert.equal(stale, true);
  assert.equal(rows[0].html, '<ul><li>one</li><li>two</li><li>THREE ADDED UPSTREAM</li></ul>',
    'the stale rich copy was opened for editing — it describes rows that no longer exist');
  assert.ok(!rows[0].html.includes('<strong>'), 'discarded means discarded');
});

test('THE WARNING FIRES, in Thai, and names what happened', () => {
  /**
   * The warning is the entire admin-facing consequence of the staleness rule.
   * Without it the mechanism is silent data loss: the admin opens the course,
   * sees plain text, assumes nobody had formatted it, saves, and the plain
   * projection overwrites the rich copy permanently. MSDB never had that copy.
   *
   * Asserted as the STRING THE ADMIN SEES, not as "a warning was produced" — a
   * guard that passes on an empty banner is the exact failure this prevents.
   */
  const { warning } = seedTopicEditorRows({
    course: STALE_COURSE, extension: { trainingTopicsRich: MATCHING_RICH },
  });
  assert.equal(warning, STALE_TOPIC_WARNING);
  assert.ok(warning.length > 0);
  // it must say WHAT happened, WHAT was done, and WHAT a save will do
  assert.match(warning, /ถูกทิ้งแล้ว/, 'does not say the formatting was discarded');
  assert.match(warning, /MSDB/, 'does not name where the change came from');
  assert.match(warning, /เขียนทับถาวร/, 'does not warn that saving overwrites it permanently');
});

test('the warning is EMPTY in both non-stale cases', () => {
  /**
   * An absent rich copy is not stale, it is absent. Conflating the two would
   * light this banner on all 79 courses that have never been touched, and a
   * banner that is always on is a banner nobody reads.
   */
  assert.equal(seedTopicEditorRows({ course: PLAIN, extension: null }).warning, '');
  assert.equal(
    seedTopicEditorRows({ course: PLAIN, extension: { trainingTopicsRich: MATCHING_RICH } }).warning,
    '',
  );
});

test('CONTROL: without the discard, the stale copy would open for editing', () => {
  // Seeding from `richRows` regardless of `source` — the one-line mistake.
  const state = resolveTopicRich({
    rows: STALE_COURSE.training_topics,
    rich: MATCHING_RICH,
  });
  assert.equal(state.richRows.length > 0, true,
    'the stale copy is not even present, so "discarded" is not being demonstrated');
  assert.ok(state.richRows[0].includes('<strong>'));
  assert.equal(state.source, TOPIC_SOURCE.PLAIN,
    'the resolver would have handed the rich copy over');
});

// ── e. BARRIER 2 — staleness, isolated from escaping ───────────────────────

test('BARRIER 2 — a rich copy whose element the sanitiser drops goes STALE first', () => {
  /**
   * ── NO ANGLE-BRACKET TEXT IN THIS FIXTURE, DELIBERATELY ─────────────────
   * The mirror of barrier 1's isolation. This content is ordinary text, so
   * escaping cannot be what saves it. What does is that a `<div>` contributes
   * text the sanitiser would remove, the rebuilt projection therefore stops
   * matching MSDB, and the copy is rejected as stale BEFORE the sanitiser is
   * ever consulted.
   *
   * Two independent mechanisms. Neither test can pass on the other's account.
   */
  const rows = [{ title: 'A', bullets: ['one'] }];
  const smuggled = ['<ul><li>one<div>SMUGGLED</div></li></ul>'];

  /**
   * MEASURED: `ownText` concatenates an element's text with no separator, so
   * the smuggled block fuses onto the bullet as `oneSMUGGLED`. Whatever the
   * exact string, the point is that it DIFFERS from the stored `one` — which is
   * what the staleness comparison has to notice for this barrier to be the one
   * doing the work here.
   */
  const projected = htmlToProjection(smuggled[0]);
  assert.deepEqual(projected, ['oneSMUGGLED']);
  assert.notDeepEqual(projected, ['one'],
    'the disallowed element contributes no extra text, so there is nothing for '
    + 'the staleness comparison to notice and this test is not exercising barrier 2');

  const seed = seedTopicEditorRows({ course: course(rows), extension: { trainingTopicsRich: smuggled } });
  assert.equal(seed.stale, true, 'the mismatch was not detected');
  assert.equal(seed.source, TOPIC_SOURCE.PLAIN);
  assert.equal(seed.rows[0].html, '<ul><li>one</li></ul>', 'the smuggled copy was opened');
});

test('CONTROL: the sanitiser is a SEPARATE defence and also removes the element', () => {
  /**
   * Barrier 2 stops the copy being USED. This shows the sanitiser would still
   * have stripped the element had the copy matched — so the two really are two,
   * and the earlier test is not silently relying on this one.
   */
  const cleaned = sanitizeTopicHtml('<ul><li>one<div>SMUGGLED</div></li></ul>');
  assert.ok(!cleaned.includes('<div'), 'the sanitiser kept the disallowed element');
  assert.ok(cleaned.includes('SMUGGLED'), 'unwrapping preserves text, as designed');
});

// ── f. the retired-shape tripwire still fires from the new seed ────────────

test('the tripwire still fires by name, and the rescue arm still rescues', () => {
  /**
   * This seed replaced `seedTrainingTopics`'s call site in CourseForm. It calls
   * that function rather than re-deriving the rows, so neither the tripwire nor
   * its rescue went quiet — a tripwire nothing calls is indistinguishable from
   * one that never fires.
   */
  const fired = [];
  const { rows } = seedTopicEditorRows({
    course: { course_id: 'LEGACY-1', training_topics: [{ topic: 'old heading', subtopics: ['a'] }] },
    extension: null,
    onLegacyShape: (info) => fired.push(info),
  });
  assert.deepEqual(fired, [{ rows: [0], course: 'LEGACY-1' }]);
  assert.deepEqual(rows, [{ title: 'old heading', html: '<ul><li>a</li></ul>' }],
    'the legacy row was blanked rather than rescued — the admin loses the form');
});

test('CONTROL: the tripwire stays silent on healthy rows', () => {
  const fired = [];
  seedTopicEditorRows({ course: PLAIN, extension: null, onLegacyShape: (i) => fired.push(i) });
  assert.deepEqual(fired, [], 'a tripwire that fires on good data is noise');
});

// ── g. degenerate inputs never throw ───────────────────────────────────────

test('a missing course, a non-array field, and a corrupt rich field all seed plain', () => {
  for (const input of [
    {},
    { course: null, extension: null },
    { course: course('nope'), extension: null },
    { course: PLAIN, extension: { trainingTopicsRich: 'not-an-array' } },
    { course: PLAIN, extension: { trainingTopicsRich: [1, 2] } },
  ]) {
    const out = seedTopicEditorRows(input);
    assert.equal(out.source, TOPIC_SOURCE.PLAIN);
    assert.equal(out.warning, '', 'a corrupt field is not an admin-facing staleness event');
    assert.ok(Array.isArray(out.rows));
  }
});
