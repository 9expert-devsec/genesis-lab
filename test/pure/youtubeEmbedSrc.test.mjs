import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isYoutubeEmbedSrc, YOUTUBE_EMBED_HOSTS } from '@/lib/editor/youtubeEmbed';

/**
 * The predicate that keeps the widened iframe parse rule narrow.
 *
 * `YoutubeEmbed`'s second parse rule matches the `iframe` TAG — every iframe in
 * a stored body reaches it — and this function is the whole of what decides
 * which ones become a `youtube` node. So the editor's blast radius is exactly
 * this function's `true` set, which makes it worth pinning separately from the
 * round trip (test/render/articleEditorEmbedRoundTrip.test.mjs) that proves the
 * rule is wired up at all.
 *
 * Every `true` case below is a real stored src, lifted from the read-only
 * census of all 499 articles; every `false` case is a shape the article
 * sanitiser already refuses to store, so accepting one here could only ever
 * widen the editor PAST the sanitiser.
 */

test('every stored src shape is accepted', () => {
  for (const src of [
    'https://www.youtube-nocookie.com/embed/6RQ2NpRz1rs?rel=1',
    'https://www.youtube-nocookie.com/embed/2U4lxHVIbRU?start=329&rel=1',
    'https://www.youtube-nocookie.com/embed/euOPBynlh74?rel=1',
    'http://www.youtube-nocookie.com/embed/x',   // http, which SRC_SCHEMES admits
    'https://youtube-nocookie.com/embed/x',      // bare host, no www
    'https://www.youtube.com/embed/x',
    'https://youtube.com/embed/x',
  ]) {
    assert.equal(isYoutubeEmbedSrc(src), true, `${src} was refused`);
  }
});

test('the host is matched EXACTLY, so no look-alike gets in', () => {
  for (const src of [
    'https://evilyoutube.com/embed/x',                  // suffix, not the host
    'https://www.youtube.com.attacker.test/embed/x',    // host as a prefix
    'https://youtube-nocookie.com.attacker.test/e/x',
    'https://m.youtube.com/embed/x',                    // real YouTube, NOT on
    'https://music.youtube.com/embed/x',                // the sanitiser's list
    'https://youtu.be/x',                               // a share link, ditto
    'https://docs.google.com/forms/d/e/x/viewform',
    'https://player.vimeo.com/video/1',
  ]) {
    assert.equal(isYoutubeEmbedSrc(src), false, `${src} was admitted`);
  }
});

test('a src with no absolute http(s) scheme is refused', () => {
  /**
   * `sanitizeRichHtml` sets `allowIframeRelativeUrls: false` and
   * `allowProtocolRelative: false`, so none of these can be in a stored body.
   * The scheme test runs BEFORE `new URL`, because `new URL` with no base
   * throws on the relative ones and would make the refusal an accident of the
   * catch rather than a rule.
   */
  for (const src of [
    '/embed/x',
    '//www.youtube.com/embed/x',
    'embed/x',
    'javascript:alert(1)',                              // eslint-disable-line no-script-url
    'data:text/html,<p>x',
    'ftp://www.youtube.com/embed/x',
  ]) {
    assert.equal(isYoutubeEmbedSrc(src), false, `${src} was admitted`);
  }
});

test('an absent, empty or non-string src is refused without throwing', () => {
  for (const src of [undefined, null, '', '   ', 0, {}, []]) {
    assert.equal(isYoutubeEmbedSrc(src), false, `${JSON.stringify(src)} was admitted`);
  }
});

test('the host comparison ignores case, because a DOM attribute does not', () => {
  // `getAttribute('src')` returns the authored bytes; a pasted
  // `HTTPS://WWW.YOUTUBE.COM/embed/x` is the same host to every browser.
  assert.equal(isYoutubeEmbedSrc('https://WWW.YOUTUBE.COM/embed/x'), true);
  assert.equal(isYoutubeEmbedSrc('HTTPS://Www.Youtube-NoCookie.com/embed/x'), true);
});

test('the host list is frozen, so nothing can widen it at runtime', () => {
  assert.equal(Object.isFrozen(YOUTUBE_EMBED_HOSTS), true);
});
