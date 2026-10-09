import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readSource } from '../sourceScan.mjs';
import { blurbPatch } from '@/lib/bundle/blurb';

/**
 * THE คำโปรย FIELD'S WIRING: it writes BOTH fields, through the one helper that
 * cannot write a non-string `blurb`.
 *
 * ── WHY A SOURCE SCAN ───────────────────────────────────────────────────────
 * The claim is about which function a call site uses, and the alternative
 * — rendering `SectionContentEditor` and driving the Tiptap editor to a save —
 * would be asserting Tiptap's behaviour rather than this repo's decision. The
 * decision is: nothing in the bundle editor patches `blurb` on its own, because
 * a patch that set the string without the doc (or the doc without the string)
 * would start them out disagreeing, and the drift rule would then throw the
 * author's rich text away on the next render.
 *
 * The BEHAVIOUR of the helper is pinned in test/pure/bundleBlurb, including the
 * `typeof blurb === 'string'` invariant on every input. Here the scan ties this
 * call site to it, and the last test re-asserts the invariant over the exact
 * shapes the editor can hand it.
 */

const EDITOR = 'src/components/pageBuilder/editor/SectionContentEditor.jsx';
const RTE = 'src/components/pageBuilder/editor/richText/RichTextEditor.jsx';
const EXTS = 'src/components/pageBuilder/editor/richText/tiptapExtensions.js';

test('the คำโปรย field is a RichTextEditor, not a TextArea', () => {
  const { code } = readSource(EDITOR);
  const at = code.indexOf('label="คำโปรย"');
  assert.ok(at > 0, 'the คำโปรย field is gone');
  const field = code.slice(at, at + 500);
  assert.match(field, /<RichTextEditor/, 'the field is not a rich-text editor');
  assert.equal(
    /<TextArea/.test(field), false,
    'the textarea is still there — two controls for one field',
  );
  // The hint is kept, as the round asked.
  assert.match(code.slice(at - 200, at + 200), /ประโยคสั้น ๆ ใต้ชื่อแพ็กเกจ/);
});

test('it is the RESTRICTED extension set and the inline toolbar', () => {
  const { code } = readSource(EDITOR);
  const at = code.indexOf('label="คำโปรย"');
  const field = code.slice(at, at + 500);
  assert.match(field, /extensions=\{BLURB_EXTENSIONS\}/, 'the blurb uses the full rich_text set');
  assert.match(field, /tools="inline"/, 'the blurb gets the full block toolbar');
  assert.match(code, /const BLURB_EXTENSIONS = blurbRichTextExtensions\(\)/);
});

test('the extension set is built ONCE, at module scope', () => {
  /**
   * `RichTextEditor` memoises on the array it is handed. A fresh array per
   * render is a new identity every render, which rebuilds the Tiptap instance
   * on every keystroke and loses the caret — a defect that reads as "the editor
   * is broken" rather than as a dependency mistake.
   */
  const { code } = readSource(EDITOR);
  const decl = code.indexOf('const BLURB_EXTENSIONS =');
  const field = code.indexOf('label="คำโปรย"');
  assert.ok(decl > 0 && field > 0);
  assert.ok(decl < field, 'the set is declared after the field that uses it');
  // Not inside any function: the declaration is at column 0.
  assert.match(code, /^const BLURB_EXTENSIONS = /m, 'the set is built inside a component');
  assert.equal(
    /extensions=\{blurbRichTextExtensions\(/.test(code), false,
    'the set is built inline at the call site — a new identity every render',
  );
});

test('the save goes through blurbPatch, and nothing patches blurb alone', () => {
  const { code } = readSource(EDITOR);
  assert.match(code, /onChange=\{\(doc\) => patch\(blurbPatch\(doc\)\)\}/, 'the save does not use blurbPatch');
  /**
   * THE ABSENCE THAT MATTERS. `patch({ blurb: … })` anywhere in this file would
   * be a path that writes the string without the doc — or, if it ever carried a
   * non-string, a path that writes an object into the field production reads.
   */
  assert.equal(
    /patch\(\{\s*blurb:/.test(code), false,
    'something patches blurb directly instead of through blurbPatch',
  );
  assert.equal(
    /patch\(\{\s*blurbDoc:/.test(code), false,
    'something patches blurbDoc directly instead of through blurbPatch',
  );
});

test('CONTROL: the direct-patch probe DOES fire on the shape it forbids', () => {
  // Both assertions above are absences. The sibling fields are written exactly
  // the way the blurb no longer is, so the probe has a live example to match.
  const { code } = readSource(EDITOR);
  assert.match(code, /patch\(\{ name: v \}\)/, 'the name field stopped patching directly');
  assert.ok(/patch\(\{\s*label:/.test(code), 'the label field stopped patching directly');
});

test('what opens in the editor is the DRIFT RULE, not the raw doc', () => {
  /**
   * An author opening a section a production admin last edited must see what
   * production stored, because that is also what the card is rendering. Reading
   * `content.blurbDoc` directly would show them the stale rich text instead.
   */
  const { code } = readSource(EDITOR);
  assert.match(code, /doc=\{blurbEditorDoc\(content\)\}/);
  assert.match(code, /resolveBlurbForRender\(content\)/);
  assert.match(code, /docFromPlainText\(choice\.text\)/);
  assert.equal(
    /doc=\{content\?\.blurbDoc\}/.test(code), false,
    'the editor opens the raw stored doc, bypassing the drift rule',
  );
});

// ── the editor cannot author what the sanitiser would strip ───────────────

test('the blurb extension set installs no node or mark the blurb forbids', () => {
  /**
   * A toolbar that does not offer a mark an author can still reach by keyboard
   * is the "looks right in the editor, publishes wrong" failure. StarterKit
   * binds Mod-Shift-S for strike and Mod-e for code, so both are switched off at
   * the EXTENSION rather than merely left off the toolbar.
   */
  const { code } = readSource(EXTS);
  const at = code.indexOf('export function blurbRichTextExtensions');
  assert.ok(at > 0, 'the blurb extension factory is gone');
  const fn = code.slice(at);
  for (const off of [
    'heading', 'bulletList', 'orderedList', 'listItem',
    'blockquote', 'horizontalRule', 'codeBlock', 'strike', 'code',
  ]) {
    assert.match(
      fn, new RegExp(`${off}:\\s*false`),
      `${off} is not switched off in the blurb extension set`,
    );
  }
  // And the extensions the full set installs are simply not here.
  for (const absent of ['Underline', 'Image', 'TextAlign', 'TextStyle', 'Color']) {
    assert.equal(
      new RegExp(`^\\s+${absent}[,.]`, 'm').test(fn), false,
      `${absent} is installed in the blurb extension set`,
    );
  }
  // The link allowlist is the shared one.
  assert.match(fn, /isAllowedUri: \(url\) => Boolean\(safeUrl\(url\)\)/);
});

test('the full rich_text editor is UNCHANGED — its props default to today', () => {
  /**
   * The two new props exist for the blurb. Every rich_text section must get the
   * extension set and the toolbar it got before they existed, or this round has
   * quietly restyled a different feature.
   */
  const { code } = readSource(RTE);
  assert.match(code, /tools = 'all'/, 'the toolbar default moved');
  assert.match(
    code, /extensionsProp \?\? richTextExtensions\(\{ placeholder \}\)/,
    'the extension default moved',
  );
  // The rich_text section's own call site passes neither.
  const { code: editor } = readSource(EDITOR);
  assert.match(
    editor, /<RichTextEditor doc=\{content\?\.doc\} onChange=\{\(doc\) => patch\(\{ doc \}\)\} \/>/,
    'the rich_text section call site changed',
  );
});

// ── and the invariant, over the shapes this call site can produce ─────────

test('every doc the editor can emit yields a STRING blurb', () => {
  /**
   * Re-asserted here rather than left to the helper's own file, because this is
   * the claim the round has to be able to make about THE EDITOR: no save path
   * writes a non-string `blurb`. The inputs are what Tiptap's `getJSON` produces
   * for an empty editor, a plain line, a marked line, and a doc that somehow
   * carried a node the set does not install.
   */
  const inputs = [
    { type: 'doc', content: [] },
    { type: 'doc', content: [{ type: 'paragraph' }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: 'a', marks: [{ type: 'bold' }] },
      { type: 'hardBreak' },
      { type: 'text', text: 'b', marks: [{ type: 'link', attrs: { href: 'https://x.test' } }] },
    ] }] },
    { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'h' }] }] },
    null,
    undefined,
  ];
  for (const input of inputs) {
    const patch = blurbPatch(input);
    assert.equal(typeof patch.blurb, 'string', `blurb is ${typeof patch.blurb}`);
    assert.equal(typeof patch.blurbDoc, 'object');
    assert.equal(patch.blurbDoc.type, 'doc');
  }
});
