import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * Two course fields the admin form used to render controls for and no
 * longer does: `bullets` (ไฮไลต์) and, as of this round, `title` (เนื้อหา).
 *
 * `bullets`: the user confirmed it unused, so it was deleted outright rather
 * than left inert — field, label, hint, note and counter all gone.
 *
 * `title`: MSDB returns this field on NO read route (measured 2026-08-31,
 * all 80 courses), so genesis could only ever show it blank. It used to stay
 * rendered anyway — read-only, with a note explaining why typing into it
 * saved nothing — because removing the only rich-text field on the form
 * would have left admins with no way to author long-form copy at all. This
 * round built one (`CourseBodyEditor`, `CourseExtension.descriptionRich`),
 * which replaces it as the field admins actually use, so the read-blind
 * textarea, its hint, and its note all follow bullets out entirely rather
 * than staying as a second inert control next to a working one.
 *
 * ── THE HALF THAT MATTERS MOST IS STILL THE PAYLOAD HALF ──────────────────
 * A control disappearing is cosmetic and fails loudly if it regresses —
 * someone notices a text box that used to be there. The payload omission
 * does NOT fail loudly: re-adding the key silently resumes overwriting real
 * upstream content, and this side cannot read the field to see the damage.
 * That half is asserted in test/fs/coursePayloadOmissions.test.mjs (title is
 * now in its `OMITTED` roster, same as bullets) and is not repeated here —
 * this file is about the rendered form only.
 */

const FORM = readSource('src/app/admin/courses/_components/CourseForm.jsx');
const BULLETS = readSource('src/components/admin/BulletTextarea.jsx');

test('the bullets field (ไฮไลต์) is gone — no control, no label, no note', () => {
  assert.doesNotMatch(FORM.code, /name="bullets"/, 'the bullets field input is still rendered');
  assert.doesNotMatch(FORM.code, /ไฮไลต์/, 'the bullets label text is still present');
});

test('the title field (เนื้อหา) is gone — no control, no label, no note', () => {
  assert.doesNotMatch(FORM.code, /name="title"/, 'the title field input is still rendered');
  assert.doesNotMatch(
    FORM.code, /MSDB ไม่ส่งค่านี้กลับมา/,
    'the read-blind note text is still present — its subject (the title textarea) is gone'
  );
});

test('CONTROL: เนื้อหา as a bare substring still exists elsewhere on the form, unrelated', () => {
  // Guards against a doesNotMatch above being satisfied by accident because
  // the whole word "เนื้อหา" happens to be scrubbed from the file somehow.
  // The left-column tab is still labelled เนื้อหาหลักสูตร — a different
  // string, and it must still be there. Source text, not rendered markup —
  // the tab's JSX puts the label on its own line, so this is a plain
  // substring match, not a `>label<` boundary (that convention is for
  // renderToStaticMarkup output, which this file's FORM.code is not).
  assert.match(FORM.code, /เนื้อหาหลักสูตร/, 'the section tab lost its label — matcher scope is wrong');
});

test('the READ_BLIND_NOTE constant is gone — nothing references it anymore', () => {
  assert.doesNotMatch(FORM.code, /READ_BLIND_NOTE/, 'the note constant (or a reference to it) survives removal');
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
