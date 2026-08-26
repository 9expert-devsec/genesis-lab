import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeTopicHtml, ALLOWED_TOPIC_TAGS, ALLOWED_TOPIC_SCHEMES } from '@/lib/courses/sanitizeTopicHtml';
import { htmlToProjection, MAX_TOPIC_DEPTH } from '@/lib/courses/topicHtml';
import { sanitizePageHtml } from '@/lib/customPages/sanitizePageHtml';
import { readSource } from '../sourceScan.mjs';

/**
 * The rich-bullet sanitizer.
 *
 * ── WHY IT IS NOT sanitizePageHtml ──────────────────────────────────────────
 * That module allows div, table, iframe and h1 — correct for a custom PAGE
 * body, wrong inside an <li>. The outline accordion body is height-constrained
 * (CourseOutline.jsx renders max-h-[800px] / max-h-0 with overflow-hidden on
 * one element), so a block box in a single bullet clips or breaks the reveal
 * animation for the whole course section. The two are asserted DIFFERENT below
 * by RUNNING BOTH on one fixture — not by comparing source text — so a future
 * "just reuse the page one" refactor goes red on behaviour rather than on
 * spelling.
 *
 * ── SOURCE-SCANNING ASSERTIONS READ THROUGH test/sourceScan.mjs ─────────────
 * The single reader for that in this suite. It strips comments, and this file
 * NEEDS that: both modules' headers discuss `sanitizePageHtml` and `jsdom` by
 * name at length, so a raw-text `includes()` would be satisfied by the very
 * prose explaining why the thing is NOT used — defect 2 in that module's header,
 * shipped here before.
 */

const proj = (html) => htmlToProjection(sanitizeTopicHtml(html));

// ── the tag allow-list ─────────────────────────────────────────────────────

test('every allowed inline mark survives', () => {
  const html =
    '<ul><li><strong>b</strong><em>i</em><u>u</u><s>s</s><sup>x</sup><sub>y</sub><code>c</code>t<br>u</li></ul>';
  const out = sanitizeTopicHtml(html);
  for (const tag of ['strong', 'em', 'u', 's', 'sup', 'sub', 'code', 'br']) {
    assert.ok(out.includes(`<${tag}`), `<${tag}> was stripped but is on the allow-list`);
  }
});

test('block boxes are removed while their TEXT survives', () => {
  // The text must not be lost — losing an admin's words is the failure this
  // whole pipeline is arranged to avoid. Only the box goes.
  const out = sanitizeTopicHtml(
    '<ul><li><div>d</div><table><tr><td>t</td></tr></table><h1>h</h1>keep</li></ul>',
  );
  for (const tag of ['div', 'table', 'tr', 'td', 'h1', 'h2', 'p']) {
    assert.ok(!out.includes(`<${tag}`), `<${tag}> survived into an <li>`);
  }
  assert.deepEqual(htmlToProjection(out), ['dthkeep']);
});

test('iframe and script are removed, and script CONTENT does not leak as text', () => {
  assert.deepEqual(proj('<ul><li>a<script>alert(1)</script></li></ul>'), ['a']);
  assert.deepEqual(proj('<ul><li>a<iframe src="https://docs.google.com/x"></iframe></li></ul>'), ['a']);
});

test('the allow-list is exactly the twelve tags this surface needs', () => {
  assert.deepEqual(
    [...ALLOWED_TOPIC_TAGS].sort(),
    ['a', 'br', 'code', 'em', 'li', 's', 'span', 'strong', 'sub', 'sup', 'u', 'ul'].sort(),
  );
  assert.ok(!ALLOWED_TOPIC_TAGS.includes('ol'), 'ol is converted to ul, never allowed through');
});

test('CONTROL: this allow-list is genuinely NARROWER than the custom-page one', () => {
  /**
   * RUNS BOTH SANITIZERS ON ONE FIXTURE rather than comparing source text.
   *
   * The first draft of this control asserted `page.code.includes("'div'")` and
   * went RED against a correct file: sanitizePageHtml never spells `div`, it
   * SPREADS `sanitizeHtml.defaults.allowedTags`, which contains it. That is
   * defect 7 in sourceScan.mjs's header — a matcher bound to the shape of an
   * expression, reading a place the value does not live — and here it failed
   * loudly rather than quietly only by luck.
   *
   * Comparing behaviour cannot rot that way: it asks what each function DOES
   * with a block box, which is the actual claim.
   */
  const fixture = '<ul><li><div>d</div><h1>h</h1><table><tr><td>t</td></tr></table>keep</li></ul>';
  const page = sanitizePageHtml(fixture);
  const topic = sanitizeTopicHtml(fixture);

  for (const tag of ['div', 'h1', 'table']) {
    assert.ok(
      page.includes(`<${tag}`),
      `the page sanitizer no longer keeps <${tag}> — re-check this guard, it is `
      + 'the half that proves the two configs still differ',
    );
    assert.ok(!topic.includes(`<${tag}`), `<${tag}> survived the topic sanitizer`);
  }
  assert.notEqual(page, topic, 'the two sanitizers now produce identical output');
});

test('the topic sanitizer does NOT import the custom-page one', () => {
  // Read WITH imports: a "does not import" guard read from comment-and-import
  // -stripped source passes vacuously, because there are no import lines left
  // to find. sourceScan's header names this exact trap.
  const { withImports } = readSource('src/lib/courses/sanitizeTopicHtml.js');
  assert.ok(
    !withImports.includes('customPages/sanitizePageHtml'),
    'sanitizeTopicHtml is importing the custom-page sanitizer — its allow-list '
    + 'permits div/table/iframe/h1, none of which may appear inside an <li>',
  );
});

test('CONTROL: that guard can see an import when one is really there', () => {
  // Proves the assertion above is not passing because the reader returns
  // nothing. The module genuinely does import topicHtml, and the same read
  // finds it.
  const { withImports } = readSource('src/lib/courses/sanitizeTopicHtml.js');
  assert.ok(withImports.includes('courses/topicHtml'), 'the reader found no imports at all');
  assert.ok(withImports.includes('sanitize-html'), 'the reader found no sanitize-html import');
});

// ── attributes, schemes and styles ─────────────────────────────────────────

test('a link keeps href/target/rel and nothing else', () => {
  const out = sanitizeTopicHtml('<ul><li><a href="https://9expert.co.th" target="_blank" rel="noopener" onclick="x()" class="c">L</a></li></ul>');
  assert.ok(out.includes('href="https://9expert.co.th"'));
  assert.ok(out.includes('target="_blank"'));
  assert.ok(out.includes('rel="noopener"'));
  assert.ok(!out.includes('onclick'), 'an event handler survived');
  assert.ok(!out.includes('class='), 'an unlisted attribute survived');
});

test('the scheme list is exactly http/https/mailto, single-sourced', () => {
  /**
   * ASSERTED ON THE CONSTANT because a control found the global
   * `allowedSchemes` assignment to be UNOBSERVABLE: `a[href]` is the only
   * URL-bearing attribute on the allow-list, and `allowedSchemesByTag` wins for
   * it, so deleting the global line reddened nothing. Rather than manufacture
   * independence for it, the value is single-sourced into this constant and the
   * constant is pinned — which is the half a test can actually see.
   */
  assert.deepEqual([...ALLOWED_TOPIC_SCHEMES], ['http', 'https', 'mailto']);
  assert.ok(!ALLOWED_TOPIC_SCHEMES.includes('ftp'), 'ftp is in the library default and must not be here');
  assert.ok(!ALLOWED_TOPIC_SCHEMES.includes('tel'), 'tel is in the library default and must not be here');
});

test('only http, https and mailto are accepted — ftp and tel are NOT', () => {
  // sanitize-html's DEFAULT scheme list is ['http','https','ftp','mailto','tel'],
  // so this is a property of our config, not of the library. Verified.
  for (const [href, keep] of [
    ['https://x.co', true], ['http://x.co', true], ['mailto:a@b.c', true],
    ['ftp://x.co', false], ['tel:0800000000', false], ['javascript:alert(1)', false],
    ['data:text/html;base64,PHNjcmlwdD4=', false],
  ]) {
    const out = sanitizeTopicHtml(`<ul><li><a href="${href}">L</a></li></ul>`);
    assert.equal(out.includes(`href="${href}"`), keep, `${href} was handled wrongly`);
  }
});

test('span style keeps colour and font-size and strips everything else', () => {
  const out = sanitizeTopicHtml(
    '<ul><li><span style="color:#ff0000;font-size:14px;position:fixed;width:9999px;display:block">x</span></li></ul>',
  );
  assert.ok(out.includes('color:#ff0000'), 'colour was stripped');
  assert.ok(out.includes('font-size:14px'), 'font-size was stripped');
  for (const hole of ['position', 'width', 'display']) {
    assert.ok(!out.includes(hole), `${hole} survived — an unrestricted style is a layout hole`);
  }
});

test('CONTROL: the style filter is not simply dropping every style', () => {
  // If it were, the positive halves above would be meaningless and the
  // colour/font-size buttons would silently do nothing.
  const out = sanitizeTopicHtml('<ul><li><span style="color:#005CFF">x</span></li></ul>');
  assert.ok(out.includes('style="color:#005CFF"'), 'a valid colour did not survive');
});

test('a malformed or non-picker colour value is refused', () => {
  for (const v of ['red', 'expression(x)', 'url(javascript:1)', '#ggg']) {
    const out = sanitizeTopicHtml(`<ul><li><span style="color:${v}">x</span></li></ul>`);
    assert.ok(!out.includes(v), `${v} passed the colour filter`);
  }
  assert.ok(sanitizeTopicHtml('<ul><li><span style="color:rgb(0,92,255)">x</span></li></ul>').includes('rgb('));
});

test('style on a tag other than span is stripped', () => {
  const out = sanitizeTopicHtml('<ul><li style="position:fixed">x</li></ul>');
  assert.ok(!out.includes('style'), 'style survived on an <li>');
});

// ── ol → ul ────────────────────────────────────────────────────────────────

test('a pasted numbered list becomes a bullet list, keeping its items intact', () => {
  assert.deepEqual(proj('<ol><li>a</li><li>b</li></ol>'), ['a', 'b']);
  assert.ok(!sanitizeTopicHtml('<ol><li>a</li></ol>').includes('<ol'), 'an <ol> reached the output');
});

test('CONTROL: leaving ol merely disallowed would MANGLE it, which is why it is converted', () => {
  // Verified against sanitize-html 2.17.5: with `ol` absent and `li` allowed,
  // the unwrap orphans the items into `<li>a<li>b</li></li>`. The conversion is
  // not cosmetic — it is what stops a pasted list becoming malformed nesting.
  const nested = '<ul><li>a<ol><li>b</li></ol></li></ul>';
  assert.deepEqual(proj(nested), ['a', '– b'], 'the nested numbered list lost its level');
});

// ── order: sanitise first, THEN clamp ──────────────────────────────────────

test('SANITISATION DESTROYS NO LIST ELEMENT — the invariant the ordering rests on', () => {
  /**
   * This is the real content of the "sanitise then clamp" decision, and it is
   * asserted here because a control proved the ORDER ITSELF is not separable:
   * swapping the two calls produces byte-identical output on div-wrapped,
   * ol-nested and plain four-level fixtures.
   *
   * The two orders are interchangeable only while sanitisation preserves every
   * level — which it does because `ol` is CONVERTED to `ul` rather than
   * disallowed. Remove that conversion and a level vanishes mid-pipeline, at
   * which point the order starts to matter and this test goes red first.
   */
  const countLists = (s) => (s.match(/<(?:ul|ol)\b/gi) || []).length;
  for (const input of [
    '<ul><li>a<ol><li>b</li></ol></li></ul>',
    '<ol><li>a<ul><li>b</li></ul></li></ol>',
    '<div><ul><li>a<div><ol><li>b</li></ol></div></li></ul></div>',
  ]) {
    assert.equal(
      countLists(sanitizeTopicHtml(input)),
      countLists(input),
      `a list level was destroyed by sanitisation: ${input}`,
    );
  }
});

test('the depth cap holds on the OUTPUT, whatever sanitisation did to the tree', () => {
  const messy =
    '<div><ul><li>1<div><ol><li>2<ul><li>3<ul><li>4</li></ul></li></ul></li></ol></div></li></ul></div>';
  const out = sanitizeTopicHtml(messy);
  assert.ok(!/<ul>[\s\S]*<ul>[\s\S]*<ul>[\s\S]*<ul>/.test(out), 'output exceeds the depth cap');
  const lines = htmlToProjection(out);
  for (const n of ['1', '2', '3', '4']) {
    assert.ok(lines.some((s) => s.endsWith(n)), `level ${n} was lost`);
  }
  for (const line of lines) assert.ok(!line.startsWith('– – –'), `over-deep prefix: ${line}`);
});

test('CONTROL: that fixture genuinely changes depth under sanitisation', () => {
  // If the wrappers did not affect nesting, the ordering claim above would be
  // untestable and this file would be asserting a property with no teeth.
  const wrapped = '<div><ul><li>a</li></ul></div>';
  assert.ok(sanitizeTopicHtml(wrapped).startsWith('<ul>'), 'the div was not unwrapped');
  assert.equal(MAX_TOPIC_DEPTH, 3);
});

// ── failing closed, and never losing a save ────────────────────────────────

test('empty input returns an empty string', () => {
  for (const v of ['', null, undefined, 0]) assert.equal(sanitizeTopicHtml(v), '');
});

test('a hostile payload reduces to its text, never to markup', () => {
  const out = sanitizeTopicHtml(
    '<ul><li><img src=x onerror=alert(1)><svg/onload=alert(1)><a href="javascript:alert(1)">click</a></li></ul>',
  );
  assert.ok(!out.includes('onerror') && !out.includes('onload') && !out.includes('javascript:'));
  assert.deepEqual(htmlToProjection(out), ['click']);
});

test('plain text with no markup passes through unharmed', () => {
  // The 3,614 stored bullets are plain. Sanitising one must not alter it.
  const plain = 'อธิบายความสามารถของ List&lt;mailmessage&gt; ที่ได้จากการอ่าน email';
  assert.deepEqual(
    htmlToProjection(sanitizeTopicHtml(`<ul><li>${plain}</li></ul>`)),
    ['อธิบายความสามารถของ List<mailmessage> ที่ได้จากการอ่าน email'],
  );
});

// ── neither module may pull a devDependency onto the runtime path ──────────

test('NEITHER module imports jsdom — it is a devDependency', () => {
  // jsdom is declared in devDependencies (test/render/ uses it). Importing it
  // from src/ would break `npm ci --omit=dev` and `next build`. Read WITH
  // imports for the reason given above; comments are still stripped, and both
  // headers discuss jsdom by name.
  for (const rel of ['src/lib/courses/topicHtml.js', 'src/lib/courses/sanitizeTopicHtml.js']) {
    assert.ok(!readSource(rel).withImports.includes('jsdom'), `${rel} imports jsdom`);
  }
});

test('CONTROL: jsdom really is dev-only, so that guard is about a real hazard', () => {
  const pkg = JSON.parse(readSource('package.json').raw);
  assert.ok(pkg.devDependencies?.jsdom, 'jsdom is not a devDependency — re-check this guard');
  assert.ok(!pkg.dependencies?.jsdom, 'jsdom became a runtime dependency');
  assert.ok(pkg.dependencies?.parse5, 'parse5 must be a RUNTIME dependency — it is imported from src/');
});
