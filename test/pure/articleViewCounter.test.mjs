import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isBotUserAgent,
  isCountableArticle,
  parseViewBody,
  viewDay,
  viewSessionKey,
  MAX_VIEW_BODY_BYTES,
} from '@/lib/articles/viewCounter';

const CHROME_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const LINE_IN_APP =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0';
const FACEBOOK_IN_APP =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]';
const CUBOT_PHONE =
  'Mozilla/5.0 (Linux; Android 12; CUBOT KINGKONG 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

test('bots: crawlers, preview fetchers, headless and scripted clients are rejected', () => {
  for (const ua of [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36',
    'curl/8.9.1',
    'python-requests/2.32.3',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 vercel-screenshot/1.0',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  ]) {
    assert.equal(isBotUserAgent(ua), true, `missed bot: ${ua}`);
  }
});

test('missing or empty UA counts as automation', () => {
  for (const ua of [undefined, null, '', '   ']) assert.equal(isBotUserAgent(ua), true);
});

test('real browsers, including in-app browsers, are counted', () => {
  for (const ua of [CHROME_DESKTOP, SAFARI_IPHONE, LINE_IN_APP, FACEBOOK_IN_APP, CUBOT_PHONE]) {
    assert.equal(isBotUserAgent(ua), false, `over-fired on a reader: ${ua}`);
  }
});

test('day key is the Asia/Bangkok calendar day (UTC+7 boundary)', () => {
  assert.equal(viewDay(Date.parse('2026-10-06T16:59:59.999Z')), '2026-10-06'); // 23:59:59 Bangkok
  assert.equal(viewDay(Date.parse('2026-10-06T17:00:00.000Z')), '2026-10-07'); // 00:00 Bangkok
});

test('body: only { id: <24-hex> } is accepted', () => {
  const id = '6a6c457dee271b6f1c03c67a';
  assert.equal(parseViewBody(JSON.stringify({ id })), id);
  assert.equal(parseViewBody(JSON.stringify({ id: id.toUpperCase() })), id, 'normalised to lower case');
  for (const bad of [
    '', 'not json', '[]', 'null', '"x"',
    JSON.stringify({}),
    JSON.stringify({ id: 'power-bi-คืออะไร' }),
    JSON.stringify({ id: id.slice(1) }),
    JSON.stringify({ id: 123 }),
    JSON.stringify({ id, pad: 'x'.repeat(MAX_VIEW_BODY_BYTES) }),
  ]) {
    assert.equal(parseViewBody(bad), null, `accepted: ${bad.slice(0, 60)}`);
  }
  assert.equal(parseViewBody(undefined), null);
});

test('drafts never count: inactive, or no publishedAt', () => {
  const live = { _id: 'a', active: true, publishedAt: '2026-10-01T00:00:00.000Z' };
  assert.equal(isCountableArticle(live), true);
  assert.equal(isCountableArticle({ ...live, active: false }), false);
  assert.equal(isCountableArticle({ ...live, publishedAt: null }), false);
  assert.equal(isCountableArticle({ ...live, _id: undefined }), false);
  assert.equal(isCountableArticle(null), false);
});

test('the session key is av:<id>:<day>', () => {
  assert.equal(viewSessionKey('abc', '2026-10-06'), 'av:abc:2026-10-06');
});
