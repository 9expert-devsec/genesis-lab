import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizePageHtml } from '@/lib/customPages/sanitizePageHtml';

/**
 * The iframe host whitelist, asserted THROUGH THE SANITIZER.
 *
 * test/pure/iframeHostWhitelist checks the shape of the constant. This checks
 * what actually reaches a reader, which is a different claim: a host can sit in
 * the array and still not survive, because three other pieces of the config get
 * a say — `allowedIframeHostnames`, `allowedSchemesByTag.iframe`, and the
 * `exclusiveFilter` that drops any iframe left without a src. Only the rendered
 * output settles it.
 *
 * ── WHY THE REJECTION ASSERTION LOOKS FOR NO <iframe> AT ALL ────────────────
 * When sanitize-html rejects a host it strips the `src` and leaves a bare
 * `<iframe></iframe>` behind. Asserting merely that the host is gone from the
 * output would pass on that empty shell — a visible, focusable, layout-taking
 * frame on the page. `exclusiveFilter` exists to remove it, so the assertion is
 * that the ELEMENT is gone, not just its attribute.
 *
 * Sets are exact. `iframeSrcs` returns every surviving iframe's src, so the
 * rejection case asserts deepEqual to [] rather than "fewer than before".
 */

/** The publish-to-web URL shape the Power BI service hands a report author. */
const POWERBI_SRC = 'https://app.powerbi.com/view?r=eyJrIjoiTEVTVCJ9';

const box = (src) =>
  '<div style="position:relative;padding-bottom:56.25%;height:0">'
  + `<iframe src="${src}" style="position:absolute;top:0;left:0;width:100%;height:100%" `
  + 'frameborder="0" allowfullscreen width="800" height="450"></iframe></div>';

/**
 * Every surviving iframe's `src`, in document order.
 *
 * Matched on the ELEMENT (`<iframe … >`) rather than by searching the whole
 * document for the URL text: a src that had been moved onto some other tag, or
 * left lying in a text node, would satisfy a bare substring search while being
 * nothing a browser would load.
 */
function iframeSrcs(html) {
  return [...html.matchAll(/<iframe\b[^>]*?\ssrc="([^"]*)"[^>]*>/g)].map((m) => m[1]);
}

/** Count of iframe ELEMENTS, whether or not they kept a src. */
const iframeCount = (html) => (html.match(/<iframe\b/g) ?? []).length;

test('an app.powerbi.com iframe survives with its src intact', () => {
  const out = sanitizePageHtml(box(POWERBI_SRC), { allowStyle: true });
  assert.deepEqual(
    iframeSrcs(out), [POWERBI_SRC],
    'the Power BI embed did not survive the sanitizer with its src'
  );
});

test('and it keeps the attributes that make it a responsive embed', () => {
  /*
   * The stored body positions the iframe inside a padding-bottom aspect-ratio
   * box, so `style` on the iframe is load-bearing: without it the frame
   * collapses to its intrinsic size in the corner of a zero-height box. `style`
   * is not in allowedAttributes.iframe — it arrives through the `'*'` wildcard,
   * which is easy to narrow by accident while tightening some other tag.
   */
  const out = sanitizePageHtml(box(POWERBI_SRC), { allowStyle: true });
  const el = /<iframe\b[^>]*>/.exec(out)?.[0] ?? '';
  assert.match(el, /\sstyle="position:absolute;top:0;left:0;width:100%;height:100%"/,
    'the iframe lost its positioning style — the embed will not be responsive');
  assert.match(el, /\sallowfullscreen/, 'allowfullscreen was dropped');
  assert.match(el, /\sframeborder="0"/, 'frameborder was dropped');
});

test('an iframe on a host that is NOT whitelisted is removed entirely', () => {
  const out = sanitizePageHtml(box('https://evil.example/report'), { allowStyle: true });
  assert.doesNotMatch(out, /<iframe/i, 'a bare <iframe> shell survived the rejection');
  assert.equal(iframeCount(out), 0);
  assert.deepEqual(iframeSrcs(out), []);
  assert.doesNotMatch(out, /evil\.example/, 'the rejected host leaked into the output as text');
  // The surrounding document is untouched — otherwise this could pass by the
  // sanitizer having emptied everything.
  assert.match(out, /<div style="position:relative;padding-bottom:56\.25%;height:0"><\/div>/);
});

test('a look-alike host that merely CONTAINS the whitelisted one is rejected', () => {
  /*
   * Exact-host matching, stated as behaviour. `app.powerbi.com.evil.test` and
   * `notapp.powerbi.com` both contain the whitelisted string and are both
   * different origins; a whitelist compared with `includes` would admit them.
   */
  for (const host of ['app.powerbi.com.evil.test', 'notapp.powerbi.com', 'app.powerbi.com.co']) {
    const out = sanitizePageHtml(box(`https://${host}/view?r=x`), { allowStyle: true });
    assert.doesNotMatch(out, /<iframe/i, `a look-alike host survived: ${host}`);
    assert.deepEqual(iframeSrcs(out), []);
  }
});

test('CONTROL: the matchers see an iframe when there really is one', () => {
  /*
   * Every rejection assertion above is a doesNotMatch or a deepEqual to [], and
   * all of them pass against an empty string. This proves the detectors fire on
   * a document that does contain an iframe, so the zeros above are measurements
   * rather than the matchers reading nothing.
   */
  const planted = box('https://www.youtube.com/embed/xyz');
  const out = sanitizePageHtml(planted, { allowStyle: true });
  assert.equal(iframeCount(out), 1, 'iframeCount cannot see an iframe that survived');
  assert.deepEqual(iframeSrcs(out), ['https://www.youtube.com/embed/xyz']);
  assert.match(out, /<iframe/i);
  // …and on raw markup the sanitizer has not touched, so a bug that emptied
  // every document could not make the control pass either.
  assert.equal(iframeCount(planted), 1);
  assert.deepEqual(iframeSrcs(planted), ['https://www.youtube.com/embed/xyz']);
});

test('the Power BI host does not leak into the default (no-allowStyle) callers', () => {
  /*
   * Three page-builder surfaces call this sanitizer with no options. The host
   * whitelist is shared by all four callers deliberately — one list, no drift —
   * so the embed must behave the same there, and the <style> exemption must not
   * be what is carrying it.
   */
  const out = sanitizePageHtml(box(POWERBI_SRC));
  assert.deepEqual(iframeSrcs(out), [POWERBI_SRC]);
  assert.doesNotMatch(out, /<style/, 'the default caller gained a <style> block');
});
