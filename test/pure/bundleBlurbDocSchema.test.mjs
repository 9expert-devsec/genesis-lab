import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sectionSchema } from '@/lib/schemas/pageBuilder';
import { blurbPatch, docFromPlainText } from '@/lib/bundle/blurb';

/**
 * `blurbDoc` AT THE SCHEMA, which is the last place a malformed doc can be
 * refused before it is stored.
 *
 * ── WHY THIS PARSE IS THE ONE THAT MATTERS ──────────────────────────────────
 * `updateSection` (lib/actions/pageBuilder.js) merges the patch over the stored
 * section and re-parses THE WHOLE THING — `sectionSchema.safeParse({ ...current,
 * ...patch })`. So a section that already holds a `blurbDoc` must still parse
 * when an author edits an unrelated field, or that bundle becomes uneditable:
 * the save returns a Zod message and nothing on the page can be changed.
 *
 * That is not hypothetical — it is exactly the failure mode that stopped `blurb`
 * itself from becoming a doc. The production branch's `blurb: z.string()` would
 * have refused every merged section carrying an object, locking production
 * admins out of the price, the items and the rounds. This file is the guard that
 * the NEW field cannot do the same thing on staging.
 */

const section = (content) => ({
  id: 'sec-1',
  type: 'promotion_bundle',
  content: { name: 'แพ็กเกจ', blurb: '', ...content },
});

const parse = (content) => sectionSchema.safeParse(section(content));
const ok = (content, why) => {
  const r = parse(content);
  assert.equal(r.success, true, `${why}: ${r.success ? '' : JSON.stringify(r.error.issues)}`);
  return r.data.content;
};

test('a merged section parses WITHOUT blurbDoc — every section stored today', () => {
  const content = ok({ blurb: 'คำโปรยเดิม' }, 'no doc');
  assert.equal(content.blurb, 'คำโปรยเดิม');
  // ABSENT STAYS ABSENT. A default would stamp an empty doc onto every bundle
  // nobody has touched, including the ones production saves.
  assert.equal('blurbDoc' in content, false, 'a blurbDoc appeared from nowhere');
});

test('a merged section parses WITH blurbDoc, and keeps it', () => {
  const patch = blurbPatch(docFromPlainText('หนึ่ง\nสอง'));
  const content = ok(patch, 'with a doc');
  assert.equal(content.blurb, 'หนึ่ง\nสอง');
  assert.deepEqual(content.blurbDoc.content.map((n) => n.type), ['paragraph', 'paragraph']);
});

test('every mark the blurb allows survives the parse', () => {
  const content = ok({
    blurb: 'a b c',
    blurbDoc: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' b', marks: [{ type: 'italic' }] },
          { type: 'text', text: ' c', marks: [{ type: 'link', attrs: { href: 'https://x.test' } }] },
          { type: 'hardBreak' },
        ],
      }],
    },
  }, 'allowed marks');
  assert.equal(content.blurbDoc.content[0].content.length, 4);
});

test('an empty doc parses, and so does a paragraph with no content', () => {
  ok({ blurbDoc: { type: 'doc', content: [] } }, 'empty doc');
  ok({ blurbDoc: { type: 'doc', content: [{ type: 'paragraph' }] } }, 'bare paragraph');
  // `content` defaults, so a doc that omits it is not a parse failure.
  ok({ blurbDoc: { type: 'doc' } }, 'doc without content');
});

// ── what the schema REFUSES ───────────────────────────────────────────────

test('the schema REFUSES a node or mark the blurb does not allow', () => {
  /**
   * The schema is deliberately not permissive here. A `z.record(z.any())` would
   * accept a heading, a table or a `javascript:` link and leave all the
   * narrowing to render time — the "looks right in the editor, publishes wrong"
   * failure the rich-text contract file exists to prevent.
   *
   * These reach the schema only from a hand-edited document or an import; the
   * editor cannot author them, because its extension set does not install them.
   */
  const refused = {
    heading: { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [] }] },
    list: { type: 'doc', content: [{ type: 'bulletList', content: [] }] },
    image: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: 'x' } }] }] },
    strikeMark: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'strike' }] }] }],
    },
    colourMark: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'textStyle' }] }] }],
    },
    notADoc: { type: 'paragraph', content: [] },
  };
  for (const [why, blurbDoc] of Object.entries(refused)) {
    assert.equal(parse({ blurbDoc }).success, false, `${why} was accepted`);
  }
});

test('`blurb` ITSELF still refuses anything but a string', () => {
  /**
   * THE INVARIANT THE WHOLE TWO-FIELD ARRANGEMENT RESTS ON. Production reads
   * this field and throws on an object. The schema is the backstop that makes
   * "no staging path writes a non-string blurb" enforceable rather than merely
   * intended.
   */
  for (const bad of [{ type: 'doc', content: [] }, 42, [], true]) {
    assert.equal(parse({ blurb: bad }).success, false, `blurb accepted a ${typeof bad}`);
  }
  assert.equal(parse({ blurb: '' }).success, true);
});

test('CONTROL: the refusals are the DOC shape, not a section-level reject', () => {
  // Every `refused` fixture above shares the same section wrapper as the
  // accepted ones, so a parse failure caused by something else — a bad id, a
  // missing type — would make that test pass for the wrong reason.
  assert.equal(parse({}).success, true, 'the bare section fixture does not parse');
  assert.equal(
    parse({ blurbDoc: { type: 'doc', content: [{ type: 'paragraph' }] } }).success, true,
    'the minimal valid doc does not parse',
  );
});
