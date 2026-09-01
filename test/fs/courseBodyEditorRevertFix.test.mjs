import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The data-loss fix, at the source level — see `test/pure/
 * courseBodyEditorRevertBug.test.mjs` for the reproduction and
 * `CourseBodyEditor.jsx`'s own header for the full diagnosis.
 *
 * ── WHY SOURCE-LEVEL, NOT AN INTERACTIVE RENDER TEST ────────────────────────
 * `test/render/courseEditorUnsavedGuard.test.mjs` already states the limit
 * this suite runs under: "there is no jsdom in this runner, so typing and
 * clicking cannot be simulated here." A live Tiptap/ProseMirror editor needs
 * a real `Selection`/`Range` implementation jsdom does not fully provide, so
 * a genuine focus/blur/type reproduction is not attempted — the pure-tier
 * test proves the DECISION LOGIC; this file proves the FIX actually landed
 * in the shipped source, not just in a function nobody calls.
 */

const EDITOR = readSource('src/components/admin/CourseBodyEditor.jsx');
const FORM = readSource('src/app/admin/courses/_components/CourseForm.jsx');

// ── the buggy re-seed effect is gone ────────────────────────────────────────

test('CourseBodyEditor no longer calls setContent anywhere', () => {
  // The removed effect's only setContent call, and the only one that ever
  // existed in this file — there is no other legitimate reason for this
  // editor to replace its own document after creation.
  assert.doesNotMatch(
    EDITOR.code, /\.setContent\(/,
    'setContent is still called somewhere — the re-seed effect (or an '
    + 'equivalent) is back, and with it the mid-life reconciliation this fix removed',
  );
});

test('CourseBodyEditor no longer branches on editor.isFocused', () => {
  // The proxy signal the old guard relied on instead of verifying authorship.
  assert.doesNotMatch(
    EDITOR.code, /isFocused/,
    'editor.isFocused is still referenced — the focus-based guard was not fully removed',
  );
});

test('the document is still seeded from `value` at creation', () => {
  // The one remaining, correct use of `value`: content is passed to
  // useEditor once, at creation. Losing this would mean the editor never
  // shows a course's existing rich body at all.
  assert.match(
    EDITOR.code, /content:\s*value\s*\?\?\s*''/,
    'CourseBodyEditor no longer seeds its document from `value` at creation',
  );
});

test('CONTROL: the file still has a real onUpdate reporting HTML out', () => {
  // Proves the file was not gutted wholesale — the other half of the
  // controlled-on-output contract (value in via content, html out via
  // onChange) must still exist.
  assert.match(EDITOR.code, /onUpdate:\s*\(\s*\{\s*editor:\s*ed\s*\}\s*\)\s*=>\s*onChange\?\.\(ed\.getHTML\(\)\)/);
});

// ── extensions/editorProps no longer rebuilt inline on every render ────────

test('the Tiptap extensions array is memoised, not rebuilt inline in useEditor', () => {
  assert.match(
    EDITOR.code, /const extensions = useMemo\(/,
    'courseBodyEditorExtensions() is called inline again — every render gives '
    + "Tiptap's compareOptions() a fresh array it always reads as \"changed\"",
  );
});

test('editorProps is memoised, not a fresh object literal in useEditor', () => {
  assert.match(EDITOR.code, /const editorProps = useMemo\(/);
});

// ── the external-change path: a key, not a value comparison ────────────────

test('CourseForm keys CourseBodyEditor on the course, not on descriptionRich', () => {
  const block = FORM.code.slice(
    FORM.code.indexOf('<CourseBodyEditor'),
    FORM.code.indexOf('<CourseBodyEditor') + 200,
  );
  assert.match(
    block, /key=\{initial\?\.course_id/,
    'CourseBodyEditor is not keyed on the course — a genuine course switch '
    + 'has no mechanism to reset a live, actively-edited document',
  );
});

test('CONTROL: the key slice actually starts at the real call site', () => {
  assert.notEqual(FORM.code.indexOf('<CourseBodyEditor'), -1,
    'CourseBodyEditor is not rendered in CourseForm at all — the probe above proves nothing');
});
