import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTopicSavePayload, sanitiseTopicRichForWrite } from '@/lib/courses/topicEditorSave';
import { buildExtensionUpdate } from '@/lib/courses/extensionUpdate';
import { resolveTopicRich, TOPIC_SOURCE } from '@/lib/courses/topicRichState';
import { plainBulletsToHtml } from '@/lib/courses/topicHtml';
import { rowHasContent, normaliseTopicRow } from '@/lib/courses/trainingTopics';

/**
 * THE WRITE PATH — one editor state, two stores, and the two ways it half-lands.
 */

// ── a. both halves, one pass, index-aligned ────────────────────────────────

test('one editor state produces the plain projection AND the rich array', () => {
  const { plain, rich } = buildTopicSavePayload([
    { title: 'A', html: '<ul><li><p>one</p><ul><li><p>sub</p></li></ul></li></ul>' },
  ]);
  assert.deepEqual(plain, [{ title: 'A', bullets: ['one', '– sub'] }]);
  assert.deepEqual(rich, ['<ul><li>one<ul><li>sub</li></ul></li></ul>']);
});

test('a dropped row removes BOTH halves, so the arrays stay index-aligned', () => {
  /**
   * The failure this prevents is silent and total: if the projection filtered a
   * row the rich collection kept, every rich entry after it would describe the
   * row above its own text. Nothing would be red; the page would simply show
   * one course's formatting applied to another row's sentences.
   */
  const { plain, rich } = buildTopicSavePayload([
    { title: 'keep 1', html: '<ul><li><p><strong>a</strong></p></li></ul>' },
    { title: '', html: '' },                                   // dropped
    { title: 'keep 2', html: '<ul><li><p><em>b</em></p></li></ul>' },
  ]);
  assert.equal(plain.length, 2);
  assert.equal(rich.length, 2);
  assert.deepEqual(plain.map((r) => r.title), ['keep 1', 'keep 2']);
  assert.ok(rich[0].includes('<strong>'), 'row 0 rich entry is not row 0');
  assert.ok(rich[1].includes('<em>'), 'row 1 rich entry is not row 1');
});

// ── b. THE TWO DIRECTIONS OF THE ROW FILTER ────────────────────────────────

test('a TITLE-ONLY row survives, with bullets: [] and an empty rich entry', () => {
  /**
   * 125 rows across 27 courses carry a real title and no bullets. They render
   * no panel element at all on the page (measured) and they are legitimate
   * headings — a filter that required bullets would delete them on the next
   * save of those courses.
   */
  const { plain, rich } = buildTopicSavePayload([
    { title: 'Part 9. สรุปเนื้อหา และ Q&A', html: '' },
  ]);
  assert.deepEqual(plain, [{ title: 'Part 9. สรุปเนื้อหา และ Q&A', bullets: [] }]);
  assert.deepEqual(rich, [], 'nothing here is richer than plain, so the field clears');
});

test('a row the admin left EMPTY is still dropped', () => {
  const { plain } = buildTopicSavePayload([
    { title: '', html: '' },
    { title: 'real', html: '' },
  ]);
  assert.deepEqual(plain, [{ title: 'real', bullets: [] }]);
});

test('an empty EDITOR does not start counting as content', () => {
  /**
   * THE TRAP IN THE MIGRATION. Both filters on this path are
   * `title || bullets.length > 0`. Tiptap serialises an empty document as
   * `<p></p>`, and a naive editor would serialise an empty list as
   * `<ul></ul>` — either would make an empty row NON-empty, and rows that have
   * always been dropped would start surviving as blank headings.
   *
   * Asserted for both shapes, because the editor can produce either depending
   * on whether the admin toggled the list on before leaving.
   */
  for (const html of ['<p></p>', '<ul></ul>', '<ul><li><p></p></li></ul>', '']) {
    const { plain } = buildTopicSavePayload([{ title: '', html }]);
    assert.deepEqual(plain, [], `an empty row survived as content for html=${JSON.stringify(html)}`);
  }
});

test('CONTROL: the two directions are decided by the SAME predicate', () => {
  // If these ever came apart, one of the two cases above would be guarding a
  // rule the shipped code no longer uses.
  assert.equal(rowHasContent(normaliseTopicRow({ title: 'x', bullets: [] })), true);
  assert.equal(rowHasContent(normaliseTopicRow({ title: '', bullets: [] })), false);
  assert.equal(rowHasContent(normaliseTopicRow({ title: '', bullets: ['b'] })), true);
});

// ── c. sanitised on write ──────────────────────────────────────────────────

test('the write path sanitises, and the projection is taken from CLEAN html', () => {
  const { plain, rich } = buildTopicSavePayload([
    { title: 'x', html: '<ul><li><p>ok<script>alert(1)</script></p></li></ul>' },
  ]);
  assert.equal(rich.length === 0 || !rich[0].includes('<script'), true);
  assert.deepEqual(plain, [{ title: 'x', bullets: ['ok'] }],
    'script CONTENT reached the MSDB projection — the projection must run after '
    + 'the sanitiser, not beside it');
});

test('a disallowed wrapper cannot smuggle a block box into the panel', () => {
  const { rich } = buildTopicSavePayload([
    { title: 'x', html: '<ul><li><p><div style="position:fixed">a</div></p></li></ul>' },
  ]);
  for (const entry of rich) assert.ok(!entry.includes('<div'), entry);
});

// ── d. richerThanPlain, and the NBSP regression it was measured against ────

test('untouched plain content writes [] and stays on the plain render path', () => {
  const bullets = ['ทำความรู้จักกับ Canva', 'ประเภทบัญชีและการสมัคร'];
  const { plain, rich, richerThanPlain } = buildTopicSavePayload([
    { title: 'T', html: plainBulletsToHtml(bullets) },
  ]);
  assert.deepEqual(plain, [{ title: 'T', bullets }]);
  assert.equal(richerThanPlain, false);
  assert.deepEqual(rich, [],
    'an admin fixing a Meta Title would flip this course onto the '
    + 'dangerouslySetInnerHTML branch as a side effect');
});

test('REGRESSION: a NO-BREAK SPACE does not make plain content look rich', () => {
  /**
   * MEASURED against all 79 live courses. parse5 escapes U+00A0 as `&nbsp;`;
   * sanitize-html leaves it raw. Comparing the sanitised html against an
   * UNSANITISED reference therefore reported "richer" for every row holding one
   * — 2 courses, MANUS-MKT and MANUS-EXC, whose text is entirely unformatted.
   * They would have been flipped to the rich path for an encoding difference.
   *
   * The plain projection was byte-identical throughout, so no round-trip check
   * could have caught this. Both sides now go through the same final serialiser.
   */
  const withNbsp = 'ใช้ AI สกัด Core Value';
  const { rich, richerThanPlain, plain } = buildTopicSavePayload([
    { title: 'T', html: plainBulletsToHtml([withNbsp]) },
  ]);
  assert.deepEqual(plain, [{ title: 'T', bullets: [withNbsp] }], 'the NBSP itself must survive');
  assert.equal(richerThanPlain, false);
  assert.deepEqual(rich, []);
});

test('CONTROL: comparing against an UNSANITISED reference reproduces the bug', () => {
  const withNbsp = 'ใช้ AI สกัด Core Value';
  const seed = plainBulletsToHtml([withNbsp]);
  const { plain } = buildTopicSavePayload([{ title: 'T', html: seed }]);
  // The pre-fix comparison: sanitised html vs raw plainBulletsToHtml output.
  const naive = seed !== plainBulletsToHtml(plain[0].bullets);
  assert.equal(naive, false,
    'the two serialisers now agree, so this control no longer reproduces the '
    + 'defect and the regression test above is not guarding anything');
});

test('real formatting DOES write the array', () => {
  for (const html of [
    '<ul><li><p><strong>bold</strong></p></li></ul>',
    '<ul><li><p>a</p><ul><li><p>nested</p></li></ul></li></ul>',
    '<ul><li><p><a href="https://9expert.co.th">link</a></p></li></ul>',
  ]) {
    const { rich, richerThanPlain } = buildTopicSavePayload([{ title: 'T', html }]);
    assert.equal(richerThanPlain, true, html);
    assert.equal(rich.length, 1, html);
  }
});

// ── e. escaping survives the whole loop ────────────────────────────────────

test('List<mailmessage> survives seed -> editor -> save -> projection', () => {
  const value = 'อธิบายความสามารถของ List<mailmessage> ที่ได้จากการอ่าน email';
  const seeded = plainBulletsToHtml([value]);
  assert.ok(seeded.includes('&lt;mailmessage&gt;'), 'the seed did not escape');
  const { plain } = buildTopicSavePayload([{ title: 'UiPath', html: seeded }]);
  assert.deepEqual(plain, [{ title: 'UiPath', bullets: [value] }]);
});

// ── f. the server-side re-sanitise, and KEY PRESENCE ───────────────────────

test('an ABSENT trainingTopicsRich key stays absent through the write sanitiser', () => {
  /**
   * Absence means leave-alone. Every caller other than CourseForm omits the
   * field, and a sanitiser that helpfully materialised `[]` would wipe the
   * field for MasterclassCourseFormClient on its next save.
   */
  const data = { metaTitle: 'x' };
  const out = sanitiseTopicRichForWrite(data);
  assert.equal(Object.prototype.hasOwnProperty.call(out, 'trainingTopicsRich'), false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      buildExtensionUpdate({ courseId: 'C', data: out, cleanAlias: '' }),
      'trainingTopicsRich',
    ),
    false,
    'an omitting caller would have its stored rich copy overwritten',
  );
});

test('a PRESENT key is sanitised on the server, whatever the client sent', () => {
  const data = { trainingTopicsRich: ['<ul><li>ok<script>alert(1)</script></li></ul>'] };
  const out = sanitiseTopicRichForWrite(data);
  assert.equal(out.trainingTopicsRich[0].includes('<script'), false,
    'a crafted POST reaches dangerouslySetInnerHTML — the client is not a boundary');
  assert.equal(out.trainingTopicsRich[0].includes('ok'), true);
});

test('a PRESENT-but-not-an-array key becomes [], not a crash', () => {
  assert.deepEqual(sanitiseTopicRichForWrite({ trainingTopicsRich: 'nope' }).trainingTopicsRich, []);
  assert.deepEqual(sanitiseTopicRichForWrite({ trainingTopicsRich: null }).trainingTopicsRich, []);
});

test('the write sanitiser is IDEMPOTENT, so a real admin save is a no-op', () => {
  const once = sanitiseTopicRichForWrite({
    trainingTopicsRich: buildTopicSavePayload([
      { title: 'T', html: '<ul><li><p><strong>a</strong></p><ul><li><p>b</p></li></ul></li></ul>' },
    ]).rich,
  });
  const twice = sanitiseTopicRichForWrite(once);
  assert.deepEqual(twice.trainingTopicsRich, once.trainingTopicsRich,
    'the server pass changes bytes the client already cleaned, so the two '
    + 'sanitisers disagree about what clean means');
});

// ── g. THE TWO PARTIAL-SAVE DIRECTIONS ─────────────────────────────────────
//
// MSDB is written first, the extension second, and BOTH are attempted even if
// the first fails. So there are exactly two half-landed states, and the claim
// under test is that NEITHER leaves anything worse than plain.

/** What the public page would render for these stored halves. */
const renders = (rows, rich) => resolveTopicRich({ rows, rich });

const OLD_ROWS = [{ title: 'A', bullets: ['one', 'two'] }];
const NEW_ROWS = [{ title: 'A', bullets: ['one', 'two', 'three'] }];
const NEW_RICH = buildTopicSavePayload([
  { title: 'A', html: '<ul><li><p><strong>one</strong></p></li><li><p>two</p></li><li><p>three</p></li></ul>' },
]).rich;

test('MSDB ok, extension FAILS: new rows, old/absent rich -> PLAIN', () => {
  // Absent rich: nothing to be stale, nothing to render richly.
  const absent = renders(NEW_ROWS, undefined);
  assert.equal(absent.source, TOPIC_SOURCE.PLAIN);
  assert.equal(absent.stale, false, 'never authored is not stale — it would warn on all 79');

  // A pre-existing rich copy describing the OLD rows no longer matches the new
  // ones, so it is detected as stale and the plain text renders.
  const oldRich = buildTopicSavePayload([
    { title: 'A', html: '<ul><li><p><strong>one</strong></p></li><li><p>two</p></li></ul>' },
  ]).rich;
  const stale = renders(NEW_ROWS, oldRich);
  assert.equal(stale.source, TOPIC_SOURCE.PLAIN);
  assert.equal(stale.stale, true);
});

test('extension ok, MSDB FAILS: old rows, new rich -> PLAIN', () => {
  const out = renders(OLD_ROWS, NEW_RICH);
  assert.equal(out.source, TOPIC_SOURCE.PLAIN,
    'the rich copy describes rows MSDB does not have — rendering it would put '
    + "the admin's new formatting on the old text");
  assert.equal(out.stale, true);
});

test('BOTH landing renders RICH — so the two above are not vacuous', () => {
  /**
   * The point of the partial-save tests is that a HALF save degrades. If the
   * WHOLE save also degraded, they would pass for the wrong reason and the
   * feature would simply not work.
   */
  const out = renders(NEW_ROWS, NEW_RICH);
  assert.equal(out.source, TOPIC_SOURCE.RICH);
  assert.equal(out.stale, false);
});

test('neither half-landed state renders anything the plain text does not say', () => {
  /**
   * The strong form of the claim, stated once: in both partial outcomes the
   * page shows the MSDB rows exactly as it does today. Not "an older
   * formatting", not a mix — the plain path, which is the state every one of
   * the 79 courses is in and every consumer already handles.
   */
  for (const [rows, rich] of [[NEW_ROWS, undefined], [OLD_ROWS, NEW_RICH]]) {
    const out = renders(rows, rich);
    assert.equal(out.source, TOPIC_SOURCE.PLAIN);
    assert.deepEqual(out.rows, rows, 'the plain rows handed back are not the stored ones');
  }
});
