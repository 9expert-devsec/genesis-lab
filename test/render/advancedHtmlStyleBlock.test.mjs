import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { getSchema } from '@tiptap/core';
import { DOMParser as PMDOMParser, DOMSerializer } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { StyleNode } from '@/app/admin/pages/_components/extensions/StyleNode';
import { IframeNode } from '@/app/admin/pages/_components/extensions/IframeNode';
import { sanitizePageHtml } from '@/lib/customPages/sanitizePageHtml';

/**
 * AN ADVANCED HTML PAGE MUST BE ABLE TO KEEP ITS `<style>`.
 *
 * The reported symptom was that toggling /yearly-promotion into raw-HTML mode
 * and back dropped the stylesheet. It had two independent causes and both are
 * pinned here, because fixing either alone leaves the feature broken:
 *
 *   1. THE EDITOR. Tiptap had no schema entry for `<style>`, and ProseMirror
 *      discards what it does not recognise. That happened on `setContent()`
 *      coming back from source mode — and, worse, on the initial
 *      `content: page.body` parse, so merely opening the page and saving wrote
 *      the stripped body to Mongo. StyleNode fixes the schema.
 *   2. THE RENDERER. `sanitizePageHtml` does not list `style` in allowedTags,
 *      so even a correctly stored block would never reach a visitor. The
 *      `allowStyle` opt-in fixes that for this page type ONLY.
 *
 * ── THE ROUND TRIP IS THE REAL ONE, NOT A STAND-IN ──────────────────────────
 * `setContent(html)` is ProseMirror's DOMParser against the editor schema and
 * `getHTML()` is its DOMSerializer. This drives exactly those two through the
 * schema Tiptap builds from the extension list, over jsdom. It is not a
 * reimplementation of the round trip — it is the round trip, minus the React
 * view layer that has no say in what survives.
 *
 * ── AND WHY THE CONTROL BELOW IS THE POINT ──────────────────────────────────
 * Every assertion that `<style>` SURVIVES would also pass against a schema that
 * kept everything. The paired control round-trips the same HTML through the
 * same code with StyleNode removed and asserts the block is GONE — which is the
 * defect as it shipped, reproduced.
 */

/** The editor's own round trip: parse HTML → doc → serialise back to HTML. */
function roundTrip(html, extensions) {
  const schema = getSchema(extensions);
  const { document } = new JSDOM(`<body>${html}</body>`).window;
  const doc = PMDOMParser.fromSchema(schema).parse(document.body);
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(doc.content, {
    document,
  });
  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}

/** The extension set CustomPageForm actually registers, narrowed to what bears on this. */
const WITH_STYLE = [StarterKit, IframeNode, StyleNode];
/** The same set as it shipped — the defect. */
const WITHOUT_STYLE = [StarterKit, IframeNode];

const STYLE_BLOCK =
  '<style>.promo-grid > .card { color: #ff4b55; }\n' +
  '.promo-grid .card::after { content: "★"; }</style>';

/**
 * VERBATIM from the stored /yearly-promotion document, read out of Mongo on
 * 2026-09-02. Kept exactly as it is — Thai text, the “ ” quotes, the → arrows
 * and the 👥 emoji — because those are the characters an HTML round trip is
 * most likely to mangle, and a fixture retyped in ASCII would not notice.
 *
 * NOTE ON WHAT THIS SAMPLE IS: by the time this was investigated the stored
 * body had ALREADY been flattened — zero `<style>`, and not one `div` or
 * `span`, only Tiptap's own vocabulary. So this is the page AFTER the defect,
 * and the `<style>` below is reattached to it rather than recovered. There was
 * nothing to recover from: `custom_pages` keeps no version history, and neither
 * `page_versions` nor `page_audit_logs` holds a row for this slug.
 */
const REAL_BODY =
  '<h1>โปรโมชันและเงื่อนไขการสำรองที่นั่ง</h1>' +
  '<p>สถาบันฝึกอบรม 9EXPERT Training</p>' +
  '<h2>👥 โปร: ชวนทีมมาเรียน ยิ่งครบทีม…ยิ่งคุ้ม!</h2>' +
  '<p>สมัครเรียน หลักสูตรเดียวกัน และรอบเดียวกัน รับส่วนลดพิเศษสำหรับ “ผู้เข้าอบรมท่านสุดท้าย”</p>' +
  '<ul><li><p>สมัคร 2 ท่าน → <strong>ท่านที่ 2 ลด 10%</strong></p></li>' +
  '<li><p>สมัคร 3 ท่าน → <strong>ท่านที่ 3 ลด 15%</strong></p></li>' +
  '<li><p><strong>สมัคร 7 ท่าน → ฟรี 1 ท่าน (ชำระเพียง 6 ท่าน)</strong></p></li></ul>';

// ── 1. the editor round trip ────────────────────────────────────────────────

test('a <style> block survives the source-mode round trip', () => {
  const out = roundTrip(`${STYLE_BLOCK}<p>hi</p>`, WITH_STYLE);
  assert.match(out, /<style>/, 'the block did not come back');
  assert.match(out, /\.promo-grid > \.card \{ color: #ff4b55; \}/, 'the CSS body was lost');
});

test('CONTROL: without StyleNode the same HTML loses the block', () => {
  /*
   * The defect, reproduced. If this ever passes, either the schema gained a
   * `<style>` entry from somewhere else — in which case the extension here is
   * no longer what is doing the work and the test above proves nothing — or
   * this control stopped exercising the parse at all.
   */
  const out = roundTrip(`${STYLE_BLOCK}<p>hi</p>`, WITHOUT_STYLE);
  assert.doesNotMatch(out, /<style>/, 'nothing was dropped — the control is inert');
  assert.match(out, /<p>hi<\/p>/, 'the control dropped the whole document, not just the style');
});

test('the CSS survives character for character — > and & are not escaped', () => {
  /*
   * `<style>` is a raw-text element: a browser does NOT decode entities inside
   * it. An escaped `&gt;` would therefore not be a cosmetic difference, it
   * would be a broken child selector. Same for the `&` and the quotes.
   */
  const css = '.a > .b { content: "&"; } .c[data-x="1"] { color: red }';
  const out = roundTrip(`<style>${css}</style>`, WITH_STYLE);
  assert.ok(out.includes(css), `CSS was altered:\n  in : ${css}\n  out: ${out}`);
  assert.doesNotMatch(out, /&gt;|&amp;|&quot;/, 'entities leaked into the stylesheet');
});

test('a block in the middle of the document keeps its position and neighbours', () => {
  const out = roundTrip(`<p>before</p>${STYLE_BLOCK}<p>after</p>`, WITH_STYLE);
  assert.ok(out.indexOf('<p>before</p>') < out.indexOf('<style>'));
  assert.ok(out.indexOf('<style>') < out.indexOf('<p>after</p>'));
});

test('two separate blocks both survive', () => {
  const out = roundTrip('<style>a{b:c}</style><p>x</p><style>d{e:f}</style>', WITH_STYLE);
  assert.equal((out.match(/<style>/g) ?? []).length, 2);
  assert.match(out, /a\{b:c\}/);
  assert.match(out, /d\{e:f\}/);
});

test('the real /yearly-promotion body round-trips unchanged, with its style', () => {
  /*
   * The whole point, on real bytes. A second pass is asserted too: an admin who
   * toggles in and out twice must not lose anything on the second trip either,
   * which is what a lossy-but-idempotent normalisation would look like.
   */
  const input = `${STYLE_BLOCK}${REAL_BODY}`;
  const once = roundTrip(input, WITH_STYLE);
  const twice = roundTrip(once, WITH_STYLE);

  assert.match(once, /<style>/, 'the stylesheet did not survive the real page');
  assert.ok(once.includes('👥 โปร: ชวนทีมมาเรียน ยิ่งครบทีม…ยิ่งคุ้ม!'), 'Thai heading mangled');
  assert.ok(once.includes('“ผู้เข้าอบรมท่านสุดท้าย”'), 'curly quotes mangled');
  assert.ok(once.includes('สมัคร 2 ท่าน → '), 'arrow mangled');
  assert.equal(twice, once, 'a second round trip changed the document');
});

test('CONTROL: the real body loses its stylesheet without the fix', () => {
  const out = roundTrip(`${STYLE_BLOCK}${REAL_BODY}`, WITHOUT_STYLE);
  assert.doesNotMatch(out, /<style>/);
  assert.ok(out.includes('9EXPERT Training'), 'the control lost the body too');
});

// ── 2. the renderer ─────────────────────────────────────────────────────────

test('the Advanced HTML page renderer keeps <style> when it opts in', () => {
  const out = sanitizePageHtml(`${STYLE_BLOCK}<p>hi</p>`, { allowStyle: true });
  assert.match(out, /<style>/);
  assert.match(out, /\.promo-grid > \.card/, 'the CSS body was emptied');
});

test('every other body type still drops <style> — the default is unchanged', () => {
  /*
   * The load-bearing half of the exemption. The page-builder preview route
   * renders its PREVIEW banner outside PageBuilderView and its comment says in
   * as many words that "customHtml cannot inject a <style> to hide it (the
   * shared sanitizer drops <style> entirely)". Three page-builder surfaces call
   * this sanitizer with no options; all three must keep that guarantee.
   */
  for (const call of [
    () => sanitizePageHtml(`${STYLE_BLOCK}<p>hi</p>`),
    () => sanitizePageHtml(`${STYLE_BLOCK}<p>hi</p>`, {}),
    () => sanitizePageHtml(`${STYLE_BLOCK}<p>hi</p>`, { allowStyle: false }),
  ]) {
    const out = call();
    assert.doesNotMatch(out, /<style/, 'a default caller kept a <style> block');
    assert.doesNotMatch(out, /promo-grid/, 'the CSS text leaked out as text');
    assert.match(out, /<p>hi<\/p>/, 'the rest of the document was dropped too');
  }
});

test('opting in does NOT open a script path', () => {
  /*
   * The exemption is for CSS and must buy nothing else. A `</style>` break-out
   * and a trailing event handler are both still stripped; a `<script>` written
   * INSIDE the block survives only as CSS text, which the HTML parser never
   * executes because `<style>` is a raw-text element.
   */
  const opts = { allowStyle: true };
  assert.doesNotMatch(
    sanitizePageHtml('<style>a{}</style><script>alert(1)</script>', opts),
    /<script/,
    'a script escaped through the style exemption',
  );
  assert.doesNotMatch(
    sanitizePageHtml('<style>x{}</style><img src=x onerror=alert(1)>', opts),
    /onerror/,
    'an event handler escaped through the style exemption',
  );
});

test('the sanitizer still refuses a non-whitelisted iframe with style allowed', () => {
  // The exemption must not widen anything else this config decides.
  const out = sanitizePageHtml(
    '<style>a{}</style><iframe src="https://evil.example/x"></iframe>',
    { allowStyle: true },
  );
  assert.match(out, /<style>/);
  assert.doesNotMatch(out, /evil\.example/, 'the iframe host whitelist stopped applying');
});

test('an empty or missing body is still the empty string', () => {
  assert.equal(sanitizePageHtml('', { allowStyle: true }), '');
  assert.equal(sanitizePageHtml(null, { allowStyle: true }), '');
  assert.equal(sanitizePageHtml(undefined), '');
});

// ── 3. the two halves meet ──────────────────────────────────────────────────

test('editor output feeds the renderer and the stylesheet is still there', () => {
  /*
   * The end-to-end claim, composed from the two real functions rather than
   * asserted twice about the same string: what the editor would save is what
   * the renderer is handed.
   */
  const saved = roundTrip(`${STYLE_BLOCK}${REAL_BODY}`, WITH_STYLE);
  const served = sanitizePageHtml(saved, { allowStyle: true });
  assert.match(served, /<style>/, 'lost between the editor and the page');
  assert.match(served, /\.promo-grid > \.card \{ color: #ff4b55; \}/);
  assert.ok(served.includes('9EXPERT Training'), 'the page body did not survive');
});
