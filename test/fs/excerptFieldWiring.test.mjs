import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource } from '../sourceScan.mjs';

/**
 * That the excerpt field is actually wired to the rule.
 *
 * test/pure/excerptStatus covers what the rule DECIDES. This covers that the
 * form asks it — which a pure test structurally cannot see, and which is where
 * the whole change would quietly revert to "no counter, no check, find out at
 * save". ArticleForm is a 1,900-line client component built on Tiptap and full
 * of `useState`; the render tier has no interaction and cannot exercise it, so
 * the wiring is asserted from source with that limitation stated rather than
 * hidden.
 *
 * Read from `code` (imports stripped) unless an assertion is about an import.
 */

const FORM = 'src/app/admin/articles/_components/ArticleForm.jsx';

test('the excerpt textarea has NO maxLength', () => {
  /**
   * The one-line "fix" that must never be applied. maxLength truncates a paste
   * SILENTLY: the admin pastes 2,340 characters, the browser keeps 2,000, and
   * nothing says the rest was discarded — by the time anyone notices, it is
   * gone from the clipboard too.
   *
   * Asserted across the WHOLE form, not just the excerpt element: the rule is
   * "this form does not silently truncate anything", and scoping it to one
   * element would let the same mistake land on the title or the SEO fields.
   */
  const { code } = readSource(FORM);
  assert.ok(
    !/maxLength/i.test(code),
    'a maxLength attribute destroys text the admin cannot see was lost — the ' +
      'counter says what happened instead'
  );
});

test('the form derives the excerpt state from the shared rule', () => {
  const { code } = readSource(FORM);
  assert.match(code, /excerptStatus\(excerpt,\s*\{\s*seoDescription\s*\}\)/,
    'the state must come from the module, with the sibling field passed in — ' +
    'the warn threshold only applies when the excerpt IS the meta description');
});

test('the counter renders the live length against the cap', () => {
  const { code } = readSource(FORM);
  assert.match(code, /excerptState\.length/, 'a live count, not a validation-only message');
  assert.match(code, /EXCERPT_BLOCK_AT/, 'shown against the cap, so "how much room" is answerable');
  assert.match(code, /ตัวอักษร/, 'same unit as the editor footer counter it follows');
});

test('the counter is the same shape as the editor footer counter it follows', () => {
  // The local precedent (the Tiptap stats row). Two counters on one screen in
  // two type scales read as a stat and a validation rather than one idea.
  const { code } = readSource(FORM);
  assert.match(code, /\{charCount\} ตัวอักษร/, 'the precedent must still exist');
  const counter = code.slice(code.indexOf('id="excerpt-status"'));
  assert.match(counter.slice(0, 400), /text-\[11px\]/, 'same 11px muted scale');
});

test('BLOCK gates the save; WARN does not', () => {
  const { code } = readSource(FORM);

  // The submit path checks the rule and returns early.
  const submit = code.slice(code.indexOf('const submit = useCallback'));
  assert.match(submit.slice(0, 2500), /excerptStatus\(excerpt,\s*\{\s*seoDescription\s*\}\)/,
    'submit must consult the rule, not just the render');
  assert.match(submit.slice(0, 2500), /\.blocked\b/, 'and gate on `blocked`');

  // And it gates on `blocked` — never on the level, which would sweep `warn` in
  // and turn "your meta description will be shortened" into a refusal to save.
  assert.ok(
    !/level\s*===\s*'warn'[^\n]*return/.test(submit.slice(0, 2500)),
    'a warning must never stop a save'
  );
});

test('a server rejection is attached to the field, not only to the banner', () => {
  const { code } = readSource(FORM);
  assert.match(code, /fieldFromActionError\(/, 'the server message must be routed');
  assert.match(code, /fieldError\?\.field === 'excerpt'/, 'and matched to this field');
  assert.match(code, /excerptFieldError/, 'and rendered');

  // The banner stays. Unattributable errors ('ไม่พบบทความ') have no field to
  // land on, and dropping the banner would lose them entirely.
  assert.match(code, /\{error && \(/, 'the top banner must still render');
});

test('the field error sits next to the live count, so "over by how much" is answerable', () => {
  // The specific complaint being fixed: the message named the field and then
  // appeared at the top of a scrolling page, as far from it as the layout
  // allows. Both must be inside the same status element.
  const { code } = readSource(FORM);
  const status = code.slice(code.indexOf('id="excerpt-status"'));
  const block = status.slice(0, status.indexOf('</div>'));
  assert.match(block, /excerptState\.length/);
  assert.match(block, /excerptFieldError/);
});

test('the textarea marks itself invalid for assistive tech', () => {
  const { code } = readSource(FORM);
  assert.match(code, /aria-invalid=\{excerptState\.blocked \|\| excerptFieldError/);
  assert.match(code, /aria-describedby="excerpt-status"/);
});
