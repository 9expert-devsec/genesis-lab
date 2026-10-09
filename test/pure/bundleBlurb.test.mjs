import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BLURB_MARKS,
  blurbPatch,
  blurbPlainText,
  docFromPlainText,
  emptyBlurbDoc,
  isBlurbDocEmpty,
  resolveBlurbForRender,
  sanitizeBlurbDoc,
} from '@/lib/bundle/blurb';

/**
 * THE BUNDLE BLURB'S TWO FIELDS, AND THE RULE THAT KEEPS THEM HONEST.
 *
 * `blurb` is a plain string forever; `blurbDoc` is the Tiptap document the
 * staging editor writes beside it. The reason is in the module's header and it
 * is operational: staging and production share one MongoDB, and the production
 * branch throws, prints `[object Object]`, or locks the section out of its own
 * editor when `blurb` is not a string.
 *
 * So the property under test is not "rich text works". It is that the STRING
 * ALWAYS WINS when the two disagree, because the string is the field both
 * branches write and therefore the one that cannot be stale.
 */

const p = (...inline) => ({ type: 'paragraph', content: inline });
const t = (text, marks) => (marks ? { type: 'text', text, marks } : { type: 'text', text });
const doc = (...content) => ({ type: 'doc', content });

// ── plain text out, doc in ────────────────────────────────────────────────

test('blurbPlainText joins paragraphs with \\n and renders a hard break as one', () => {
  assert.equal(
    blurbPlainText(doc(p(t('หนึ่ง')), p(t('สอง')))),
    'หนึ่ง\nสอง',
  );
  assert.equal(
    blurbPlainText(doc(p(t('ก'), { type: 'hardBreak' }, t('ข')))),
    'ก\nข',
  );
});

test('blurbPlainText keeps the TEXT of a mark and drops the mark', () => {
  assert.equal(blurbPlainText(doc(p(t('ตัวหนา', [{ type: 'bold' }])))), 'ตัวหนา');
  assert.equal(
    blurbPlainText(doc(p(t('ไป '), t('ที่นี่', [{ type: 'link', attrs: { href: 'https://x.test' } }])))),
    'ไป ที่นี่',
  );
});

test('blurbPlainText accepts a STRING too, trimmed', () => {
  // Callers hold "the blurb", which is a string on a legacy section. A helper
  // that refused one shape would push the shape test out to every call site.
  assert.equal(blurbPlainText('  spaced  '), 'spaced');
  assert.equal(blurbPlainText(''), '');
  assert.equal(blurbPlainText(null), '');
  assert.equal(blurbPlainText(undefined), '');
});

test('blurbPlainText trims, so a matching pair cannot look stale', () => {
  assert.equal(blurbPlainText(doc(p(t('x')), p(t('   ')))), 'x');
});

// ── doc in, from a legacy string ──────────────────────────────────────────

test('docFromPlainText makes one paragraph per line and drops blank ones', () => {
  assert.deepEqual(
    docFromPlainText('บรรทัดหนึ่ง\n\nบรรทัดสอง'),
    doc(p(t('บรรทัดหนึ่ง')), p(t('บรรทัดสอง'))),
  );
  assert.deepEqual(docFromPlainText('   '), emptyBlurbDoc());
  assert.deepEqual(docFromPlainText(null), emptyBlurbDoc());
});

test('docFromPlainText escapes BY CONSTRUCTION — stored markup stays visible text', () => {
  /**
   * A legacy blurb holding `<b>x</b>` renders those five visible characters
   * today, because React escapes a string child. Opening it in the editor must
   * not turn it into formatting: the value becomes a text node's `text`
   * property, never markup.
   */
  const d = docFromPlainText('<b>x</b> & <script>alert(1)</script>');
  assert.equal(d.content.length, 1);
  assert.deepEqual(d.content[0].content, [t('<b>x</b> & <script>alert(1)</script>')]);
  assert.equal(blurbPlainText(d), '<b>x</b> & <script>alert(1)</script>');
});

test('a string survives the round trip through a doc and back', () => {
  for (const s of ['หนึ่ง', 'หนึ่ง\nสอง', 'a\nb\nc']) {
    assert.equal(blurbPlainText(docFromPlainText(s)), s, s);
  }
});

// ── the restriction ───────────────────────────────────────────────────────

test('only paragraph / text / hardBreak survive; other blocks are UNWRAPPED', () => {
  /**
   * Unwrapped, not discarded: a heading an author pasted in still has words in
   * it, and losing the words is the worse outcome. `renderTiptap` would render
   * a heading or a list perfectly well — `rich_text` sections legitimately
   * contain them — which is exactly why the narrowing is this module's job and
   * not the walker's.
   */
  const messy = doc(
    { type: 'heading', attrs: { level: 2 }, content: [t('หัวข้อ')] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('ข้อ'))] }] },
    { type: 'image', attrs: { src: 'https://x.test/a.png' } },
    { type: 'horizontalRule' },
    p(t('ย่อหน้า')),
  );
  const clean = sanitizeBlurbDoc(messy);
  assert.deepEqual(clean.content.map((n) => n.type), ['paragraph', 'paragraph', 'paragraph']);
  assert.equal(blurbPlainText(clean), 'หัวข้อ\nข้อ\nย่อหน้า');
  // The image contributed no text, so it left no empty paragraph behind.
  assert.equal(JSON.stringify(clean).includes('image'), false);
  assert.equal(JSON.stringify(clean).includes('heading'), false);
});

test('only bold / italic / link survive as marks', () => {
  assert.deepEqual(BLURB_MARKS, ['bold', 'italic', 'link']);
  const clean = sanitizeBlurbDoc(doc(p(
    t('a', [{ type: 'bold' }]),
    t('b', [{ type: 'italic' }]),
    t('c', [{ type: 'underline' }]),
    t('d', [{ type: 'strike' }]),
    t('e', [{ type: 'code' }]),
    t('f', [{ type: 'textStyle', attrs: { color: '#ff0000' } }]),
  )));
  assert.deepEqual(
    clean.content[0].content.map((n) => (n.marks ?? []).map((m) => m.type)),
    [['bold'], ['italic'], [], [], [], []],
  );
  // Every character is still there — the text survives, the formatting does not.
  assert.equal(blurbPlainText(clean), 'abcdef');
});

test('a javascript: link loses its MARK and keeps its text', () => {
  const clean = sanitizeBlurbDoc(doc(p(
    // eslint-disable-next-line no-script-url
    t('กดที่นี่', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
  )));
  assert.deepEqual(clean.content[0].content[0].marks ?? [], []);
  assert.equal(blurbPlainText(clean), 'กดที่นี่');
});

test('the link allowlist is safeUrl own — http/https/mailto/tel, /path, #anchor', () => {
  const hrefOf = (href) => {
    const clean = sanitizeBlurbDoc(doc(p(t('x', [{ type: 'link', attrs: { href } }]))));
    return clean.content[0].content[0].marks?.[0]?.attrs?.href ?? null;
  };
  for (const ok of ['https://x.test/a', 'http://x.test', 'mailto:a@b.test', 'tel:0812345678', '/promotions', '#x']) {
    assert.equal(hrefOf(ok), ok, ok);
  }
  for (const bad of ['javascript:alert(1)', '//evil.test', 'ftp://x.test', 'data:text/html,x']) {
    assert.equal(hrefOf(bad), null, bad);
  }
});

test('junk in, empty doc out — never a throw', () => {
  for (const junk of [null, undefined, '', 'a string', 42, [], {}, { type: 'paragraph' }, { type: 'doc' }]) {
    assert.deepEqual(sanitizeBlurbDoc(junk), emptyBlurbDoc(), JSON.stringify(junk));
  }
});

test('emptyBlurbDoc hands out a FRESH object each time', () => {
  // Shared mutable module state is how one section's edit reaches another.
  const a = emptyBlurbDoc();
  a.content.push(p(t('x')));
  assert.deepEqual(emptyBlurbDoc(), { type: 'doc', content: [] });
});

// ── emptiness ─────────────────────────────────────────────────────────────

test('isBlurbDocEmpty is format-agnostic', () => {
  for (const empty of ['', '   ', null, undefined, emptyBlurbDoc(), doc(), doc(p()), doc(p(t('')))]) {
    assert.equal(isBlurbDocEmpty(empty), true, JSON.stringify(empty));
  }
  assert.equal(isBlurbDocEmpty('x'), false);
  assert.equal(isBlurbDocEmpty(doc(p(t('x')))), false);
});

// ── THE DRIFT RULE ────────────────────────────────────────────────────────

test('NO DOC → the string, which is every section nobody has saved on staging', () => {
  assert.deepEqual(
    resolveBlurbForRender({ blurb: 'คำโปรยเดิม' }),
    { kind: 'text', text: 'คำโปรยเดิม' },
  );
  assert.deepEqual(
    resolveBlurbForRender({ blurb: 'x', blurbDoc: null }),
    { kind: 'text', text: 'x' },
  );
});

test('DOC MATCHING its string → the doc', () => {
  const d = doc(p(t('เริ่มต้นใช้ '), t('Claude AI', [{ type: 'bold' }])));
  const got = resolveBlurbForRender({ blurb: 'เริ่มต้นใช้ Claude AI', blurbDoc: d });
  assert.equal(got.kind, 'doc');
  assert.equal(blurbPlainText(got.doc), 'เริ่มต้นใช้ Claude AI');
});

test('DOC STALE against an edited string → the string', () => {
  /**
   * THE CASE THIS WHOLE DESIGN EXISTS FOR. A production admin edits the
   * คำโปรย textarea on `dev`: `blurb` changes, and the stale `blurbDoc`
   * survives because that branch's bundle content schema is `.passthrough()`.
   * The string is what production wrote, so the string is what renders.
   */
  const stale = doc(p(t('ข้อความเก่า')));
  assert.deepEqual(
    resolveBlurbForRender({ blurb: 'ข้อความใหม่จากโปรดักชัน', blurbDoc: stale }),
    { kind: 'text', text: 'ข้อความใหม่จากโปรดักชัน' },
  );
});

test('DOC PRESENT but the string emptied → the empty string', () => {
  // A production admin who cleared the field. Nothing may resurrect the doc.
  assert.deepEqual(
    resolveBlurbForRender({ blurb: '', blurbDoc: doc(p(t('ยังอยู่'))) }),
    { kind: 'text', text: '' },
  );
});

test('an EMPTY doc beside a real string → the string', () => {
  assert.deepEqual(
    resolveBlurbForRender({ blurb: 'x', blurbDoc: emptyBlurbDoc() }),
    { kind: 'text', text: 'x' },
  );
});

test('whitespace drift is FORGIVEN, a changed word is not', () => {
  /**
   * The difference to tolerate is a double space or a stray newline a human
   * typed into a textarea — not a changed word. Runs of whitespace collapse to
   * one space for the comparison; the doc is still rendered as authored.
   */
  const d = doc(p(t('หนึ่ง')), p(t('สอง')));
  assert.equal(resolveBlurbForRender({ blurb: 'หนึ่ง สอง', blurbDoc: d }).kind, 'doc');
  assert.equal(resolveBlurbForRender({ blurb: 'หนึ่ง   สอง', blurbDoc: d }).kind, 'doc');
  assert.equal(resolveBlurbForRender({ blurb: 'หนึ่ง สองสาม', blurbDoc: d }).kind, 'text');
});

test('a doc whose only link is unsafe still matches on its TEXT', () => {
  // The mark is stripped by the sanitiser, so the doc's plain text is unchanged
  // and the pair is not drift. The chip renders as text, not as a dead link.
  const d = doc(p(t('กดที่นี่', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])));
  const got = resolveBlurbForRender({ blurb: 'กดที่นี่', blurbDoc: d });
  assert.equal(got.kind, 'doc');
  assert.equal(JSON.stringify(got.doc).includes('javascript'), false);
});

test('a non-string blurb is never returned as one', () => {
  // Defence in depth: if an object ever reached `blurb` despite the invariant,
  // this must not hand it to a React child.
  for (const bad of [{ type: 'doc' }, 42, [], null, undefined]) {
    const got = resolveBlurbForRender({ blurb: bad });
    assert.equal(got.kind, 'text');
    assert.equal(typeof got.text, 'string');
    assert.equal(got.text, '');
  }
});

// ── the save patch ────────────────────────────────────────────────────────

test('blurbPatch writes BOTH fields, and blurb is ALWAYS a string', () => {
  /**
   * The invariant the two-field arrangement rests on. `blurb` is produced from
   * the doc rather than carried beside it, so there is no path on which a
   * caller supplies the two independently and they start out disagreeing.
   */
  const cases = [
    doc(p(t('หนึ่ง'))),
    doc(p(t('a', [{ type: 'bold' }])), p(t('b'))),
    doc({ type: 'heading', attrs: { level: 1 }, content: [t('h')] }),
    emptyBlurbDoc(),
    null,
    'a legacy string',
    42,
  ];
  for (const input of cases) {
    const patch = blurbPatch(input);
    assert.deepEqual(Object.keys(patch).sort(), ['blurb', 'blurbDoc'], JSON.stringify(input));
    assert.equal(typeof patch.blurb, 'string', `blurb is ${typeof patch.blurb} for ${JSON.stringify(input)}`);
    assert.equal(patch.blurbDoc.type, 'doc');
    // And the two agree by construction.
    assert.equal(blurbPlainText(patch.blurbDoc), patch.blurb);
  }
});

test('an EMPTIED editor writes an empty string and an empty doc, not undefined', () => {
  // `undefined` does not survive a JSON round trip, so a removal expressed
  // that way would leave the previous value in the stored document.
  const patch = blurbPatch(emptyBlurbDoc());
  assert.deepEqual(patch, { blurb: '', blurbDoc: { type: 'doc', content: [] } });
  assert.deepEqual(blurbPatch(doc(p(t('   ')))), { blurb: '', blurbDoc: { type: 'doc', content: [] } });
});

test('what blurbPatch writes always resolves back to the DOC it wrote', () => {
  // The round trip that matters: save, then render. If this failed, every save
  // would immediately read back as drift and the rich text would never show.
  const d = doc(p(t('ไป '), t('ที่นี่', [{ type: 'link', attrs: { href: 'https://x.test' } }])));
  const patch = blurbPatch(d);
  const got = resolveBlurbForRender(patch);
  assert.equal(got.kind, 'doc');
  assert.equal(blurbPlainText(got.doc), 'ไป ที่นี่');
});
