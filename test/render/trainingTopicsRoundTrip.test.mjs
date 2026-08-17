import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TrainingTopicsEditor } from '@/components/admin/TrainingTopicsEditor';
import {
  parseTrainingTopicsValue, normaliseTopicRow, rowHasContent, seedTrainingTopics,
} from '@/lib/courses/trainingTopics';
import { seedTopicEditorRows } from '@/lib/courses/topicEditorSeed';

/**
 * The admin round trip must return upstream data UNCHANGED.
 *
 * ══ THE BUG THIS PINS, WHICH REACHED PRODUCTION DATA ════════════════════════
 *
 * MSDB stores `training_topics` as `{ title, bullets[] }` — measured
 * 2026-08-09: 823 subdocuments across 77 courses, and ZERO carrying `topic` or
 * `subtopics`. Genesis read and wrote `{ topic, subtopics }` on both sides. The
 * editor therefore rendered blank against perfectly good data, and a save
 * serialised those blanks back under key names upstream discards, leaving
 * subdocuments stripped to `{ title: '', bullets: [] }`. One course
 * (COPILOT-STU) reached that state: nine numbered accordion rows with no
 * headings on the public page.
 *
 * Both halves were wrong in the same direction, which is why nothing caught it
 * — the editor agreed with itself. So the assertion here is deliberately NOT
 * "the editor emits the right key names"; it is that DATA SURVIVES THE FULL
 * LOOP: upstream shape → editor render → serialised hidden input → server
 * parse → identical upstream shape. That is the only claim that would have
 * failed before the fix.
 *
 * ── WHY THIS IS A RENDER TEST ───────────────────────────────────────────────
 * The serialisation lives in the component's useMemo, reachable only by
 * rendering it. The parse is imported from src/lib/courses/trainingTopics.js
 * — the module the server action actually calls — rather than reimplemented
 * here, because a copy of the parser in the test would have stayed green
 * through the entire bug.
 *
 * ── PROBES MATCH KEY BOUNDARIES, NEVER BARE SUBSTRINGS ──────────────────────
 * `"topic"` is a substring of `"training_topics"`, and `"bullets"` a substring
 * of nothing useful either — a naive `includes('topic')` assertion passes on
 * the hidden input's own `name="training_topics"` attribute and proves the
 * opposite of what it claims. Every key probe below is written as `"key":`.
 */

/**
 * ══ B3: THE EDITOR'S PROP IS NOW `{ title, html }` ═════════════════════════
 *
 * Section 7's bullets are edited as rich HTML, so `initialTopics` carries
 * `{ title, html }` and the MSDB → editor conversion moved into
 * `seedTopicEditorRows`. Every test below therefore starts at the MSDB ROW and
 * seeds through that function.
 *
 * THAT IS A STRENGTHENING, NOT AN ACCOMMODATION. Section (d) of this file
 * already argued the loop must begin at the row rather than at the editor's
 * props, because the defect it pins lived in the seed map. Before B3 only two
 * tests did; now they all do, and the escaping step — the one that decides
 * whether `List<mailmessage>` survives being opened — is inside the loop
 * rather than beside it.
 */
function seedRows(trainingTopics, opts) {
  return seedTopicEditorRows({ course: { training_topics: trainingTopics }, extension: null, ...opts }).rows;
}

/** Render the editor and pull the JSON out of its hidden input. */
function serialisedPayload(initialTopics) {
  const html = renderToStaticMarkup(
    createElement(TrainingTopicsEditor, { name: 'training_topics', initialTopics })
  );
  const m = /<input type="hidden" name="training_topics" value="([^"]*)"/.exec(html);
  assert.ok(m, 'expected a hidden training_topics input in the rendered editor');
  const decoded = m[1]
    .replaceAll('&quot;', '"').replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
  return { html, json: decoded };
}

const UPSTREAM = [
  { title: 'ปูพื้นฐาน Canva', bullets: ['ทำความรู้จักกับ Canva', 'ประเภทบัญชีและการสมัคร'] },
  { title: 'Part 9. สรุปเนื้อหา และ Q&A', bullets: [] },
  { title: 'Advanced', bullets: ['one', 'two', 'three'] },
];

// ── a. the round trip ───────────────────────────────────────────────────────
test('round trip: upstream {title,bullets} survives editor → payload → parse', () => {
  const { json } = serialisedPayload(seedRows(UPSTREAM));
  const back = parseTrainingTopicsValue(json);
  assert.deepEqual(back, UPSTREAM);
});

test('round trip: the payload itself is already the upstream shape', () => {
  const { json } = serialisedPayload(seedRows(UPSTREAM));
  assert.deepEqual(JSON.parse(json), UPSTREAM);
});

test('CONTROL: the round trip CAN fail — a renamed key does not survive', () => {
  /**
   * Exactly the pre-fix situation: data arrives under the retired names only.
   *
   * ── THIS ONE DELIBERATELY DOES NOT GO THROUGH `seedRows` ────────────────
   * Every other test in this file seeds first, because the loop must start at
   * the MSDB row. This control is about THE EDITOR, and the seed would answer
   * for it: `seedTopicEditorRows` delegates to `seedTrainingTopics`, whose
   * documented RESCUE ARM maps a legacy row across so the shape does not take
   * the admin's form away. Seeding here would make the control assert that the
   * rescue works — which it does, and which is not what this is for.
   *
   * Fed straight to the editor, a retired-shape row carries neither `title`
   * nor `html`, is dropped, and the payload is empty. That is the claim: the
   * EDITOR does not rescue, so the round-trip assertions above are genuinely
   * sensitive to key names.
   */
  const legacyOnly = [{ topic: 'heading', subtopics: ['a', 'b'] }];
  const { json } = serialisedPayload(legacyOnly);
  const back = parseTrainingTopicsValue(json);
  assert.notDeepEqual(back, [{ title: 'heading', bullets: ['a', 'b'] }],
    'if this passes, the editor is silently rescuing the retired shape and the '
    + 'round-trip assertions above prove nothing about key names');
  assert.deepEqual(back, [], 'a row with neither title nor bullets is dropped');
});

// ── b. title-only rows survive ──────────────────────────────────────────────
test('a title-only row (bullets: []) survives the full round trip', () => {
  const titleOnly = [{ title: 'Part 9. สรุปเนื้อหา และ Q&A', bullets: [] }];
  const { json } = serialisedPayload(seedRows(titleOnly));
  const back = parseTrainingTopicsValue(json);
  assert.equal(back.length, 1, '121 real headings upstream have no bullets — none may be dropped');
  assert.deepEqual(back, titleOnly);
});

test('CONTROL: a "drop rows without bullets" filter WOULD redden the test above', () => {
  // The reintroduced defect, applied to the same fixture the real test uses.
  const titleOnly = [{ title: 'Part 9. สรุปเนื้อหา และ Q&A', bullets: [] }];
  const withBadFilter = titleOnly
    .map(normaliseTopicRow)
    .filter((r) => r.bullets.length > 0);          // ← the filter that must never return
  assert.equal(withBadFilter.length, 0,
    'this control asserts the bad filter really does delete the row; if it does not, '
    + 'the title-only test is not guarding anything');

  // and the shipped predicate must disagree with it
  assert.equal(rowHasContent(normaliseTopicRow(titleOnly[0])), true);
});

test('a row with NEITHER title nor bullets is still dropped', () => {
  const { json } = serialisedPayload(seedRows([{ title: '', bullets: [] }, ...UPSTREAM]));
  assert.deepEqual(parseTrainingTopicsValue(json), UPSTREAM);
});

// ── c. no retired key names anywhere in the payload ─────────────────────────
test('the serialised payload contains no "topic" and no "subtopics" KEY', () => {
  const { json } = serialisedPayload(seedRows(UPSTREAM));
  assert.equal(json.includes('"topic":'), false, 'retired key `topic` is in the payload');
  assert.equal(json.includes('"subtopics":'), false, 'retired key `subtopics` is in the payload');
  assert.equal(json.includes('"title":'), true);
  assert.equal(json.includes('"bullets":'), true);
});

// ── d. THE LOOP STARTS AT THE MSDB ROW, NOT AT THE EDITOR'S PROPS ───────────
//
// Everything above hands `{ title, bullets }` straight to the editor, which is
// ONE STEP DOWNSTREAM OF WHERE THE DEFECT WAS. The admin form's seed map is
// what asked upstream rows for `t.topic`; a suite that begins after that
// mapping stays green for the whole life of that bug. These two start at the
// row as CourseForm receives it from MSDB.

/** An MSDB course row, exactly as `/public-course` returns it. */
const MSDB_ROW = {
  _id: '692519bbfd2c3d20b79f0e7b',
  course_id: 'CANVA-L1',
  course_name: 'Canva Pro for Smart Working',
  training_topics: UPSTREAM,
};

test('round trip from the MSDB ROW: seed → editor → payload → parse is lossless', () => {
  const seeded = seedTopicEditorRows({ course: MSDB_ROW, extension: null }).rows;
  const { json } = serialisedPayload(seeded);
  assert.deepEqual(parseTrainingTopicsValue(json), MSDB_ROW.training_topics);
});

test('CONTROL: reverting the seed to `t.topic` reddens the round trip above', () => {
  // The exact defect, re-applied to the same MSDB row: read the retired key
  // first and fall back to nothing. This is the one-line change that must not
  // be able to pass.
  const revertedSeed = (initial) => (initial?.training_topics ?? []).map((t) => ({
    title: t?.topic ?? '',
    bullets: Array.isArray(t?.subtopics) ? t.subtopics : '',
  }));

  const { json } = serialisedPayload(seedRows(revertedSeed(MSDB_ROW)));
  const back = parseTrainingTopicsValue(json);

  assert.notDeepEqual(back, MSDB_ROW.training_topics,
    'the reverted seed produced the correct upstream shape, which means the round-trip '
    + 'assertion above is NOT sensitive to the seed mapping and would survive the bug');
  assert.deepEqual(back, [],
    'and it is lossless in the worst way: every row empties, which is exactly how '
    + 'COPILOT-STU ended up with nine blank headings');

  // NOTE: this control deliberately does NOT also assert that the shipped seed
  // still works. It did at first, and that made it fail alongside the real test
  // whenever the seed was broken — two reds for one finding, with the reader
  // left to work out which was which. A control that fails when its subject
  // fails is measuring the subject. The shipped behaviour is the test above.
});

test('the tripwire fires — by name — when a row arrives in the retired shape', () => {
  const fired = [];
  const seeded = seedTrainingTopics(
    { course_id: 'LEGACY-1', training_topics: [{ topic: 'old heading', subtopics: ['a'] }] },
    { onLegacyShape: (info) => fired.push(info) }
  );
  assert.deepEqual(fired, [{ rows: [0], course: 'LEGACY-1' }],
    'an unreachable branch that fires silently is indistinguishable from one that never fires');
  // and it still rescues the row rather than blocking the admin
  assert.deepEqual(seeded, [{ title: 'old heading', bullets: ['a'] }]);
});

test('CONTROL: the tripwire stays silent on healthy upstream rows', () => {
  const fired = [];
  seedTrainingTopics(MSDB_ROW, { onLegacyShape: (info) => fired.push(info) });
  assert.deepEqual(fired, [], 'a tripwire that fires on good data is noise, not a signal');
});

test('CONTROL: the key probe reddens when the old key name is put back', () => {
  // The probe must catch the retired name in a payload that otherwise looks fine.
  const reverted = JSON.stringify([{ topic: 'heading', subtopics: ['a'] }]);
  assert.equal(reverted.includes('"topic":'), true,
    'the probe cannot see the retired key — it would pass through a full revert');
  assert.equal(reverted.includes('"subtopics":'), true);

  // And the boundary matters: a bare substring probe is satisfied by the input's
  // own name attribute, which is why every probe above is written as `"key":`.
  const { html } = serialisedPayload(seedRows(UPSTREAM));
  assert.equal(html.includes('topic'), true,
    'proves the bare-substring form is useless here: "training_topics" contains "topic"');
  assert.equal(html.includes('"topic":'), false);
});
