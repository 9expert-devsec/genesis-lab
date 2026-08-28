import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * The admin course edit Preview bug: the old anchor was a plain
 * `<a href={previewHref} target="_blank">` with no onClick and no state
 * serialisation, so an unsaved edit was never sent anywhere — pressing it
 * just opened whatever MSDB already had. The fix is not a draft store (there
 * is none for courses; they live in MSDB, not Mongo) — it is being honest
 * about what the button shows, plus a guided path that saves first:
 *
 *   1. RELABEL. The saved-content-only anchor is "ดูหน้าจริง", not "Preview"
 *      — a name a truthfully unsaved-showing button cannot carry — and warns
 *      before opening while the form is dirty instead of silently serving
 *      stale content.
 *   2. "บันทึกแล้วดูหน้าจริง" — a SECOND submit button reusing the existing
 *      save handler (not a forked path), which reveals a plain `<a>` the
 *      admin clicks themselves ONLY once courseSaveOutcome reports the JOINT
 *      success (MSDB write AND the extension upsert). Two clicks, not one:
 *      `window.open()` after an `await` loses the user gesture and gets
 *      blocked, so this never calls it — it reveals a real anchor for a real
 *      click instead.
 *
 * A source scan because both are wired through a click handler inside a large
 * client component with two independent async writes behind it — the same
 * reason test/fs/courseCreateWriteOrder and test/fs/courseSaveStaysPut scan
 * this same file rather than executing it.
 */

const FORM = readSource('src/app/admin/courses/_components/CourseForm.jsx');

/** The body of `handleSubmit`, from its declaration to its closing brace. */
const HANDLE_SUBMIT = (() => {
  const start = FORM.code.indexOf('async function handleSubmit');
  assert.notEqual(start, -1, 'handleSubmit is gone — has submit been rewritten?');
  const end = FORM.code.indexOf('\n  }\n', start);
  assert.notEqual(end, -1, 'could not find the end of handleSubmit');
  return FORM.code.slice(start, end);
})();

/**
 * The EDIT arm only — starting at the save-and-preview wiring, which is the
 * first statement after the CREATE branch's own `return;`. Anchoring here
 * (rather than at `if (isCreate) {`) matters because the create branch has its
 * OWN `startTransition(async () => {`; including it would make the very first
 * occurrence in the slice the wrong one.
 */
const EDIT_ARM = HANDLE_SUBMIT.slice(HANDLE_SUBMIT.indexOf('const wantsPreviewAfterSave'));

// ── R1a: the relabel, and what it must not silently do ─────────────────────

test('the saved-content anchor is no longer labelled "Preview"', () => {
  assert.doesNotMatch(FORM.code, />\s*Preview\s*</, 'a control still literally says "Preview"');
  assert.match(FORM.code, /ดูหน้าจริง/, 'the relabel is gone entirely');
});

test('the ดูหน้าจริง anchor carries a tooltip saying it shows saved content only', () => {
  const start = FORM.code.indexOf('href={previewHref}');
  assert.notEqual(start, -1, 'the anchor lost its previewHref binding');
  const tag = FORM.code.slice(start, FORM.code.indexOf('</a>', start));
  assert.match(tag, /title="[^"]*บันทึก/, 'no title/tooltip mentions saved content');
});

test('ดูหน้าจริง warns (does not silently open) while the form is dirty', () => {
  const start = FORM.code.indexOf('href={previewHref}');
  const tag = FORM.code.slice(start, FORM.code.indexOf('</a>', start));
  assert.match(tag, /onClick=\{/, 'no click handler at all — nothing can warn');
  assert.match(tag, /dirty\s*&&\s*!window\.confirm\(/, 'the warn is not gated on dirty');
  assert.match(tag, /e\.preventDefault\(\)/, 'declining the warning does not stop the navigation');
});

test('the anchor is still target="_blank" — the guard relies on that to skip it', () => {
  const start = FORM.code.indexOf('href={previewHref}');
  const tag = FORM.code.slice(start, FORM.code.indexOf('</a>', start));
  assert.match(tag, /target="_blank"/, 'losing target="_blank" makes this an in-page exit the click guard must now handle');
});

// ── R1b: the guard's own comment was written about "Preview" ───────────────

test('the click-guard comment near the target!==_self check no longer describes "Preview"', () => {
  // .raw, deliberately — this assertion is ABOUT a comment's wording, and
  // `.code` strips comments entirely (see sourceScan.mjs's Defect 7 note on
  // choosing raw vs. code for the right guard).
  const guardStart = FORM.raw.indexOf('const onClick = (e) => {');
  assert.notEqual(guardStart, -1, 'the document click guard is gone');
  const guardBody = FORM.raw.slice(guardStart, FORM.raw.indexOf('document.addEventListener', guardStart));
  assert.doesNotMatch(
    guardBody,
    /\bPreview\b/,
    'a comment inside the guard still names the retired "Preview" button'
  );
  assert.match(
    guardBody,
    /ดูหน้าจริง/,
    'the guard has no comment explaining the _blank skip in terms of the current button'
  );
});

// ── R2a: "บันทึกแล้วดูหน้าจริง" reuses handleSubmit, never forks it ─────────

test('a second submit button carries data-intent="save-and-preview"', () => {
  assert.match(
    FORM.code,
    /data-intent="save-and-preview"/,
    'no button identifies itself as the save-and-preview submit'
  );
  // It must be a real <button type="submit">, not type="button" — a
  // type="button" would never trigger handleSubmit at all and the feature
  // would be dead on arrival.
  const idx = FORM.code.indexOf('data-intent="save-and-preview"');
  const tagStart = FORM.code.lastIndexOf('<button', idx);
  const tag = FORM.code.slice(tagStart, FORM.code.indexOf('>', idx) + 1);
  assert.match(tag, /type="submit"/, 'the save-and-preview control is not a submit button');
});

test('handleSubmit reads the submitter SYNCHRONOUSLY, before the async transition starts', () => {
  const read = EDIT_ARM.indexOf('e.nativeEvent?.submitter?.dataset?.intent');
  const transition = EDIT_ARM.indexOf('startTransition(async () => {');
  assert.notEqual(read, -1, 'handleSubmit no longer reads which button submitted');
  assert.notEqual(transition, -1, 'the async transition is gone');
  assert.ok(
    read < transition,
    'the submitter is read inside the async callback — by then the click event and its gesture are gone'
  );
});

test('the reveal is gated on the JOINT success outcome, never on a partial save', () => {
  const allOkStart = EDIT_ARM.indexOf('if (outcome.allOk) {');
  const allOkEnd = EDIT_ARM.indexOf('setSaveReport(outcome)', allOkStart);
  assert.notEqual(allOkStart, -1, 'the allOk branch is gone');
  const successBranch = EDIT_ARM.slice(allOkStart, allOkEnd);
  const partialBranch = EDIT_ARM.slice(allOkEnd);
  assert.match(
    successBranch,
    /if\s*\(wantsPreviewAfterSave\)\s*setPreviewReady\(true\)/,
    'the reveal is not armed inside the full-success branch'
  );
  assert.doesNotMatch(
    partialBranch,
    /setPreviewReady\(true\)/,
    'a partial save can still arm the reveal — courseSaveOutcome exists precisely to prevent this'
  );
});

test('a fresh submit clears any reveal left over from a previous save', () => {
  // Otherwise a plain "บันทึก" click after a prior "บันทึกแล้วดูหน้าจริง" leaves
  // เปิดหน้าจริง visible while a NEW (possibly still-in-flight or partial) save
  // is running, claiming freshness about content that may not have landed.
  const beforeTransition = EDIT_ARM.slice(0, EDIT_ARM.indexOf('startTransition(async () => {'));
  assert.match(beforeTransition, /setPreviewReady\(false\)/, 'previewReady is not reset before the new save runs');
});

// ── R2b: two clicks, never a scripted window.open() ─────────────────────────

test('CONTROL: no window.open() exists anywhere in this file', () => {
  // The hard constraint this whole feature turns on: window.open() called
  // after an await loses the user gesture and is blocked by the popup blocker
  // silently. The reveal-a-real-<a> design exists so this never has to be
  // called at all. `.code` (comments stripped), not `.raw` — this file's own
  // comments explain the constraint using the literal text "window.open()".
  assert.doesNotMatch(FORM.code, /window\.open\(/);
});

test('the post-save control is a plain target="_blank" anchor, not a button', () => {
  const idx = FORM.code.indexOf('previewReady && !dirty');
  assert.notEqual(idx, -1, 'the post-save reveal condition is gone');
  const block = FORM.code.slice(idx, FORM.code.indexOf('เปิดหน้าจริง', idx) + 'เปิดหน้าจริง'.length);
  assert.match(block, /<a\b/, 'the reveal is not an anchor');
  assert.match(block, /target="_blank"/, 'the reveal anchor does not open a new tab');
  assert.doesNotMatch(block, /onClick=\{[^}]*window\.open/, 'the reveal still scripts window.open on click');
});

// ── R2c: hidden exactly where ดูหน้าจริง itself is hidden ───────────────────

test('the save-and-preview button is gated on !isCreate, close enough to bind to it', () => {
  // Same reason ดูหน้าจริง itself is hidden while creating: there is no
  // upstream course yet to point either at. Not full brace-matching — a small
  // lookbehind window, on the same basis test/fs guards elsewhere in this repo
  // use CODE.slice() proximity rather than a parser.
  const btnIdx = FORM.code.indexOf('data-intent="save-and-preview"');
  assert.notEqual(btnIdx, -1);
  const lookbehind = FORM.code.slice(Math.max(0, btnIdx - 200), btnIdx);
  assert.match(lookbehind, /\{!isCreate && \(/, 'no nearby !isCreate gate precedes the save-and-preview button');
});

// ── CONTROL: proves the presence checks above can actually go red ──────────

test('CONTROL: the pre-fix single Preview anchor fails every presence check here', () => {
  // Reconstructs exactly the shape the bug report described: a plain anchor,
  // no onClick, no data-intent button, no submitter read, no previewReady.
  const preFix = `
          <a
            href={previewHref}
            target="_blank"
            rel="noopener noreferrer"
            className="..."
          >
            <Eye className="h-4 w-4" /> Preview
          </a>
`;
  assert.doesNotMatch(preFix, /ดูหน้าจริง/);
  assert.doesNotMatch(preFix, /onClick=\{/);
  assert.doesNotMatch(preFix, /data-intent="save-and-preview"/);
  assert.doesNotMatch(preFix, /previewReady/);
});
