import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareOutlineRichHtml } from '@/lib/courses/courseOutlineView';
import { plainBulletsToHtml } from '@/lib/courses/topicHtml';

/**
 * The server-side preparation for section 7: decide, sanitise, signal.
 *
 * Fixtures are MSDB course rows and CourseExtension documents in the shapes
 * `resolveCourse` actually hands `CourseDetail` — `{ course_id,
 * training_topics: [{title, bullets}] }` and `{ trainingTopicsRich: [String] }`
 * — not props already shaped for the component.
 */

const COURSE = () => ({
  course_id: 'POWER-BI-XDM',
  training_topics: [
    { title: 'เข้าใจ Power BI Semantic Model', bullets: ['หนึ่ง', 'สอง'] },
    { title: 'สรุปเนื้อหา และ Q&A', bullets: [] },
  ],
});

/** The extension a save would have written for exactly those rows. */
const extFor = (course) => ({
  trainingTopicsRich: course.training_topics.map((r) => plainBulletsToHtml(r.bullets)),
});

const silent = () => {};

// ── every course today ─────────────────────────────────────────────────────

test('NO rich copy returns null — the state all 79 courses are in', () => {
  for (const extension of [null, undefined, {}, { trainingTopicsRich: [] }]) {
    assert.equal(
      prepareOutlineRichHtml({ course: COURSE(), extension, onStale: silent }), null,
      `extension=${JSON.stringify(extension)} did not return null`,
    );
  }
});

test('null is returned for a missing or malformed course too, never a throw', () => {
  for (const course of [undefined, null, {}, { training_topics: 'nope' }, { training_topics: [] }]) {
    assert.equal(prepareOutlineRichHtml({ course, extension: null, onStale: silent }), null);
  }
  assert.equal(prepareOutlineRichHtml(), null, 'called with no arguments at all');
});

// ── the rich path ──────────────────────────────────────────────────────────

test('a MATCHING rich copy comes back as per-row HTML', () => {
  const course = COURSE();
  const out = prepareOutlineRichHtml({ course, extension: extFor(course), onStale: silent });
  assert.ok(Array.isArray(out), 'expected an array of per-row HTML');
  assert.equal(out.length, 2, 'one entry per row, index-aligned');
  assert.ok(out[0].includes('<li>หนึ่ง</li>'), 'row 0 lost its content');
  assert.equal(out[1], '', 'a bullet-less row must stay an empty entry');
});

test('THE SANITISER RUNS — a block box is stripped while its text survives', () => {
  /**
   * This is the assertion that makes render-side sanitisation real rather than
   * decorative. B3 will also sanitise on write; this exists because stored
   * bytes can predate a sanitiser change, and the write path is not the only
   * thing that could ever put bytes in that field.
   *
   * The `<div>` is invisible to the staleness check — `htmlToProjection` walks
   * INTO non-list elements, so the flattened text is still "keep" and the copy
   * matches. It therefore reaches the rich path and the sanitiser is the ONLY
   * thing that removes it. That is exactly the case worth pinning: markup that
   * survives the comparison and must not survive the render.
   */
  const course = { course_id: 'C', training_topics: [{ title: 'T', bullets: ['keep'] }] };
  const out = prepareOutlineRichHtml({
    course,
    extension: { trainingTopicsRich: ['<ul><li><div>keep</div></li></ul>'] },
    onStale: silent,
  });
  assert.ok(Array.isArray(out), 'the fixture did not reach the rich path');
  assert.ok(!out[0].includes('<div'), '<div> survived into an <li> — the sanitiser did not run');
  assert.ok(out[0].includes('keep'), 'the text was lost along with the markup');
});

test('a <script> cannot reach the rich path AT ALL — the projection rejects it first', () => {
  /**
   * FOUND BY A FIXTURE THAT FAILED, and worth keeping as its own property.
   *
   * The first draft of the test above bundled a `<script>alert(1)</script>` in
   * with the `<div>` and asserted both were stripped. It went red, correctly:
   * `htmlToProjection` treats script CONTENT as text, so the flattened row
   * became "dalert(1)keep", which no longer equalled the MSDB bullet — the copy
   * was STALE and never reached the sanitiser at all.
   *
   * So there are two independent barriers, not one. The staleness comparison
   * rejects any injected text that changes what the row says, and the sanitiser
   * handles what gets through because it does NOT change the text. Neither is
   * load-bearing alone, and knowing which one caught a given payload matters.
   */
  const course = { course_id: 'C', training_topics: [{ title: 'T', bullets: ['keep'] }] };
  const seen = [];
  const out = prepareOutlineRichHtml({
    course,
    extension: { trainingTopicsRich: ['<ul><li><script>alert(1)</script>keep</li></ul>'] },
    onStale: (e) => seen.push(e),
  });
  assert.equal(out, null, 'a script-bearing row reached the rich path');
  assert.equal(seen.length, 1, 'it should have been reported as stale');
});

test('a hostile href is stripped while the link text survives', () => {
  const course = { course_id: 'C', training_topics: [{ title: 'T', bullets: ['click'] }] };
  const out = prepareOutlineRichHtml({
    course,
    extension: { trainingTopicsRich: ['<ul><li><a href="javascript:alert(1)">click</a></li></ul>'] },
    onStale: silent,
  });
  assert.ok(!out[0].includes('javascript:'), 'a javascript: href survived');
  assert.ok(out[0].includes('click'), 'the link text was lost');
});

// ── the stale signal ───────────────────────────────────────────────────────

test('STALE renders plain and REPORTS, naming the course', () => {
  /**
   * On the public page stale means render plain, silently — visitors are not
   * the audience for a data-sync problem. But the signal must not be swallowed:
   * a rich copy that has quietly stopped being used is indistinguishable from
   * one that was never authored, and that is exactly the state where someone's
   * formatting work has stopped reaching the page.
   */
  const course = COURSE();
  const extension = extFor(course);
  course.training_topics.push({ title: 'แทรกจาก MSDB', bullets: ['ใหม่'] });

  const seen = [];
  const out = prepareOutlineRichHtml({ course, extension, onStale: (e) => seen.push(e) });

  assert.equal(out, null, 'a stale course must render PLAIN');
  assert.equal(seen.length, 1, 'the stale signal did not fire exactly once');
  assert.equal(seen[0].courseId, 'POWER-BI-XDM', 'the report does not name the course');
  assert.equal(seen[0].rows, 3);
  assert.equal(seen[0].richRows, 2);
});

test('the stale signal does NOT fire when there is simply no rich copy', () => {
  // 79 of 79 today. Reporting them would be a warning on every course on every
  // ISR pass, which is how a real signal gets tuned out.
  const seen = [];
  prepareOutlineRichHtml({ course: COURSE(), extension: null, onStale: () => seen.push(1) });
  prepareOutlineRichHtml({ course: COURSE(), extension: { trainingTopicsRich: [] }, onStale: () => seen.push(1) });
  assert.deepEqual(seen, [], 'absent was reported as stale');
});

test('the stale signal does NOT fire when the rich copy still matches', () => {
  const course = COURSE();
  const seen = [];
  prepareOutlineRichHtml({ course, extension: extFor(course), onStale: () => seen.push(1) });
  assert.deepEqual(seen, [], 'a matching copy was reported as stale');
});

test('a structurally broken field is ABSENT, not stale, and renders plain', () => {
  const seen = [];
  for (const trainingTopicsRich of ['a string', [1, 2], [null], { 0: 'x' }]) {
    const out = prepareOutlineRichHtml({
      course: COURSE(), extension: { trainingTopicsRich }, onStale: () => seen.push(1),
    });
    assert.equal(out, null, `${JSON.stringify(trainingTopicsRich)} did not render plain`);
  }
  assert.deepEqual(seen, [], 'unreadable was reported as stale');
});

// ── index alignment with what the component actually renders ───────────────

test('rows are filtered the SAME WAY the component filters them', () => {
  /**
   * CourseOutline does `training_topics.filter(Boolean)` before rendering. If
   * this module resolved against the UNFILTERED array, the rich entries would be
   * index-aligned with a different list than the one on screen — and index
   * alignment is the entire contract of the field. A null row is the case that
   * separates them.
   */
  const course = {
    course_id: 'C',
    training_topics: [null, { title: 'A', bullets: ['a'] }, { title: 'B', bullets: ['b'] }],
  };
  // Two SURVIVING rows, so a two-entry rich copy must match.
  const extension = { trainingTopicsRich: [plainBulletsToHtml(['a']), plainBulletsToHtml(['b'])] };
  const out = prepareOutlineRichHtml({ course, extension, onStale: silent });
  assert.ok(Array.isArray(out), 'the null row was counted, so the lengths disagreed');
  assert.equal(out.length, 2);
});

test('CONTROL: an UNfiltered resolve would have gone stale on that fixture', () => {
  // Proves the test above is not passing for an unrelated reason: a three-entry
  // rich copy (one per raw row, including the null) must NOT match.
  const course = {
    course_id: 'C',
    training_topics: [null, { title: 'A', bullets: ['a'] }, { title: 'B', bullets: ['b'] }],
  };
  const out = prepareOutlineRichHtml({
    course,
    extension: { trainingTopicsRich: ['', plainBulletsToHtml(['a']), plainBulletsToHtml(['b'])] },
    onStale: silent,
  });
  assert.equal(out, null, 'a raw-length rich copy matched the filtered rows');
});

test('CONTROL: the rich path is reachable, so the null assertions are not vacuous', () => {
  const course = COURSE();
  assert.ok(
    Array.isArray(prepareOutlineRichHtml({ course, extension: extFor(course), onStale: silent })),
    'nothing can ever reach the rich path — every "returns null" test above is vacuous',
  );
});
