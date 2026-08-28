import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrainingTopicsEditor } from '@/components/admin/TrainingTopicsEditor';
import { STALE_TOPIC_WARNING, seedTopicEditorRows } from '@/lib/courses/topicEditorSeed';
import { buildTopicSavePayload } from '@/lib/courses/topicEditorSave';

/**
 * WHAT THE ADMIN ACTUALLY SEES on the section-7 form.
 *
 * ── WHAT THIS TIER CAN AND CANNOT REACH ────────────────────────────────────
 * `useEditor` is configured `immediatelyRender: false`, so on the server the
 * editor instance is null and `TopicBulletsEditor` renders its loading
 * fallback. That is a real limit and it is stated rather than worked around:
 * the Tiptap DOCUMENT cannot be asserted here, and it is asserted instead in
 * test/pure/topicEditorContract against the schema directly.
 *
 * What this tier CAN establish is the part that decides whether work gets
 * lost: the warning banner is on the page, and every row — including a
 * title-only one — gets an editor slot.
 */

const render = (props) =>
  renderToStaticMarkup(createElement(TrainingTopicsEditor, { name: 'training_topics', ...props }));

const seed = (rows, ext = null) =>
  seedTopicEditorRows({ course: { course_id: 'T', training_topics: rows }, extension: ext });

// ── the stale warning ──────────────────────────────────────────────────────

test('THE STALE WARNING RENDERS ON THE FORM, in Thai', () => {
  /**
   * REVERT THIS FIRES ON: the stale warning removed from the form.
   *
   * Without the banner the staleness rule's whole admin-facing consequence is
   * silent destruction: the admin opens a course whose rich copy was
   * discarded, sees plain text, assumes nobody had formatted it, saves, and
   * the plain projection overwrites the only copy of that work.
   *
   * Asserted on the TEXT, not on a class or a role, because a banner that
   * renders empty would satisfy anything weaker.
   */
  const html = render({ initialTopics: [{ title: 'A', html: '' }], staleWarning: STALE_TOPIC_WARNING });
  assert.ok(html.includes('role="alert"'), 'the warning is not announced to assistive tech');
  assert.ok(html.includes('ถูกทิ้งแล้ว'), 'the warning text is not on the page');
  assert.ok(html.includes('เขียนทับถาวร'),
    'the page does not tell the admin that saving overwrites the formatting permanently');
});

test('no banner at all when nothing is stale', () => {
  /**
   * An absent rich copy is not stale. A banner on all 79 untouched courses is
   * a banner nobody reads, and then it does not work the one time it matters.
   */
  const html = render({ initialTopics: [{ title: 'A', html: '' }], staleWarning: '' });
  assert.equal(html.includes('role="alert"'), false);
  assert.equal(html.includes('ถูกทิ้งแล้ว'), false);
});

test('the warning the form shows is the one the seed produced', () => {
  /**
   * Ties the two halves together. A form that rendered its own hardcoded string
   * would keep passing while the seed stopped detecting anything.
   */
  const rich = buildTopicSavePayload([
    { title: 'A', html: '<ul><li><p><strong>one</strong></p></li></ul>' },
  ]).rich;
  const stale = seed([{ title: 'A', bullets: ['CHANGED UPSTREAM'] }], { trainingTopicsRich: rich });
  assert.equal(stale.stale, true, 'the fixture is not stale, so this proves nothing');

  const html = render({ initialTopics: stale.rows, staleWarning: stale.warning });
  assert.ok(html.includes('ถูกทิ้งแล้ว'));
});

// ── a title-only row still gets an editor ──────────────────────────────────

test('a TITLE-ONLY row renders a full row with an editor slot', () => {
  /**
   * 125 rows across 27 courses. On the PAGE they render no panel element at all
   * (measured at 360 and 1280 against real data); on the FORM they must still
   * be typeable into, or they become the only rows in the catalogue that cannot
   * gain a first bullet.
   */
  const { rows } = seed([{ title: 'Part 9. สรุปเนื้อหา และ Q&A', bullets: [] }]);
  assert.deepEqual(rows, [{ title: 'Part 9. สรุปเนื้อหา และ Q&A', html: '' }]);

  const html = render({ initialTopics: rows });
  assert.ok(html.includes('Part 9.'), 'the heading is not on the form');
  assert.ok(html.includes('กำลังโหลดตัวแก้ไข'),
    'the row has no editor at all — a title-only row cannot gain its first bullet');
  assert.equal((html.match(/หัวข้อที่ /g) ?? []).length, 1, 'the row was dropped or duplicated');
});

test('every row gets exactly one editor, bullets or not', () => {
  const { rows } = seed([
    { title: 'has bullets', bullets: ['a', 'b'] },
    { title: 'title only', bullets: [] },
    { title: 'also has', bullets: ['c'] },
  ]);
  const html = render({ initialTopics: rows });
  assert.equal((html.match(/หัวข้อที่ /g) ?? []).length, 3);
  assert.equal((html.match(/กำลังโหลดตัวแก้ไข/g) ?? []).length, 3,
    'a row is missing its editor — the title-only one is the likely victim');
});

// ── the hidden input still carries the plain projection ────────────────────

test('the hidden input carries [{title,bullets}] and never the HTML', () => {
  /**
   * MSDB's schema, its own admin form, and every consortium consumer of
   * GET /api/ai/public-course read that shape. The rich HTML accompanies it in
   * a separate store; it never replaces it.
   */
  const { rows } = seed([{ title: 'A', bullets: ['one', 'two'] }]);
  const html = render({ initialTopics: rows });
  const m = /<input type="hidden" name="training_topics" value="([^"]*)"/.exec(html);
  assert.ok(m, 'the hidden input is gone');
  const json = m[1]
    .replaceAll('&quot;', '"').replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
  assert.deepEqual(JSON.parse(json), [{ title: 'A', bullets: ['one', 'two'] }]);
  assert.equal(json.includes('<ul>'), false, 'HTML leaked into the field MSDB stores');
  assert.equal(json.includes('"html":'), false);
});

test('an empty row is not serialised, and a title-only row is', () => {
  const html = render({
    initialTopics: [{ title: '', html: '' }, { title: 'kept', html: '' }],
  });
  const m = /<input type="hidden" name="training_topics" value="([^"]*)"/.exec(html);
  const json = m[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&');
  assert.deepEqual(JSON.parse(json), [{ title: 'kept', bullets: [] }]);
});
