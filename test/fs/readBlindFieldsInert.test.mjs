import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The two read-blind course fields say so, and still write nothing.
 *
 * `title` and `bullets` are returned by NO MSDB read route — measured across
 * all 80 courses, list and detail alike. So genesis cannot preserve them and
 * 346911f removed both from the payload. That left two controls that accepted
 * typing and saved nothing, which is the state this guard is about: the inputs
 * now declare it.
 *
 * ── THE HALF THAT MATTERS MOST IS THE PAYLOAD HALF ────────────────────────
 * Making an input read-only is cosmetic and fails loudly if it regresses — the
 * box becomes editable again and someone notices. The payload omission does
 * NOT fail loudly: re-adding either key silently resumes overwriting real
 * upstream content, and this side cannot read the field to see the damage. So
 * the omission is asserted here as well as in coursePayloadOmissions, and the
 * two are deliberately not the same file: one is about the write, this one is
 * about the pair of claims staying consistent.
 */

const FORM = readSource('src/app/admin/courses/_components/CourseForm.jsx');
const BULLETS = readSource('src/components/admin/BulletTextarea.jsx');
const ACTIONS = readSource('src/lib/actions/courses.js');

test('the note is ONE constant, not two copies', () => {
  // Two controls broken for the same reason must not be able to describe it
  // differently.
  assert.match(FORM.code, /const READ_BLIND_NOTE\s*=/);
  const uses = FORM.code.match(/READ_BLIND_NOTE/g) ?? [];
  assert.ok(uses.length >= 3, `expected the declaration plus two uses, found ${uses.length}`);
});

test('the note says what it needs to say, in Thai', () => {
  assert.match(
    FORM.code,
    /MSDB ไม่ส่งค่านี้กลับมา จึงแก้ที่นี่ไม่ได้ — แก้ที่ MSDB โดยตรง/,
    'the note text changed; if that was deliberate, update this assertion with it'
  );
});

test('the เนื้อหา (title) textarea is readOnly', () => {
  // Matched as an ATTRIBUTE. A bare `readOnly` word search would hit the prop
  // name, the docstring and the BulletTextarea import alike.
  const block = FORM.code.slice(
    FORM.code.indexOf('name="title"') - 200,
    FORM.code.indexOf('name="title"') + 400
  );
  assert.match(block, /\n\s*readOnly\n/, 'the title textarea is editable again');
});

test('the bullets field is passed readOnly and the note', () => {
  const at = FORM.code.indexOf('name="bullets"');
  assert.ok(at > 0, 'the bullets field is gone');
  const block = FORM.code.slice(at, at + 400);
  assert.match(block, /\n\s*readOnly\n/, 'bullets is editable again');
  assert.match(block, /note=\{READ_BLIND_NOTE\}/, 'bullets lost its note');
});

test('BulletTextarea forwards readOnly to the real control, not just to a class', () => {
  // The prop existing is not the claim; the attribute reaching the <textarea>
  // is. A styled-but-editable box is the exact failure this would hide.
  assert.match(BULLETS.code, /readOnly = false/, 'the prop is not declared with an off default');
  assert.match(BULLETS.code, /<textarea[\s\S]{0,400}?readOnly=\{readOnly\}/, 'the attribute is not forwarded');
});

test('CONTROL: readOnly is OFF by default, so the shared consumers are unaffected', () => {
  // BulletTextarea is also used by the career-path and masterclass forms. If the
  // default flipped, those fields would silently become uneditable.
  assert.match(BULLETS.code, /readOnly = false/);
  const CAREER = readSource('src/app/admin/career-paths/_components/CareerPathForm.jsx');
  assert.doesNotMatch(
    CAREER.code,
    /readOnly/,
    'the career-path form now mentions readOnly — check it did not inherit the muted state'
  );
});

test('the payload STILL omits both keys — the inert input is not a write path', () => {
  for (const key of ['title', 'bullets']) {
    assert.doesNotMatch(
      ACTIONS.code,
      new RegExp(`\\n {4}${key}:\\s*`),
      `${key} is emitted again — a read-only input does not make writing it safe, ` +
        `and '' or [] still overwrites real upstream content`
    );
  }
});

test('CONTROL: the omission matcher still sees the keys that ARE emitted', () => {
  // Without this, an inert matcher would satisfy the test above for every key.
  for (const key of ['course_teaser', 'course_objectives']) {
    assert.match(ACTIONS.code, new RegExp(`\\n {4}${key}:\\s*`), `${key} should still be emitted`);
  }
});

test('neither field was deleted or hidden — they still render', () => {
  // The instruction was to make them honest, not to remove them. A hidden field
  // would lose the only thing they are still good for: showing an admin that the
  // data exists somewhere and where to go for it.
  assert.match(FORM.code, /name="title"/, 'the title field was removed');
  assert.match(FORM.code, /name="bullets"/, 'the bullets field was removed');
  assert.doesNotMatch(FORM.code, /type="hidden"[^>]*name="title"/, 'title was hidden');
});
