import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRequestMeta,
  matchesTrustedOrigin,
  requestMetaField,
  requestMetaFor,
  requestMetaSummary,
  REQUEST_META_KEYS,
  TRUSTED_ORIGINS,
} from '@/lib/registration/requestMeta';

/** The `.get()`-only surface the helper is allowed to rely on. */
const H = (entries) => {
  const map = new Map(Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name) => map.get(String(name).toLowerCase()) ?? null };
};

const OURS = {
  origin: 'https://www.9experttraining.com',
  referer: 'https://www.9experttraining.com/registration/public?course=PBI-L1&email=a@b.co',
  host: 'www.9experttraining.com',
  'user-agent': 'Mozilla/5.0 (Linux; Android 14) Line/14.1.0',
  'accept-language': 'th-TH,th;q=0.9,en;q=0.8',
  'x-forwarded-for': '203.0.113.7',
  'x-vercel-ip-country': 'TH',
  'x-vercel-ip-city': 'Bang%20Kapi',
};

test('every field is read from its header', () => {
  const meta = buildRequestMeta(H(OURS));
  assert.deepEqual(meta, {
    origin: 'https://www.9experttraining.com',
    referer_host: 'www.9experttraining.com',
    referer_path: '/registration/public',
    host: 'www.9experttraining.com',
    user_agent: 'Mozilla/5.0 (Linux; Android 14) Line/14.1.0',
    accept_language: 'th-TH,th;q=0.9,en;q=0.8',
    forwarded_for: '203.0.113.7',
    vercel_ip_country: 'TH',
    vercel_ip_city: 'Bang Kapi',
    origin_trusted: true,
  });
});

test('referer: host and path only — the query string is never kept', () => {
  const meta = buildRequestMeta(H(OURS));
  assert.equal(JSON.stringify(meta).includes('email'), false);
  assert.equal(JSON.stringify(meta).includes('course='), false);
});

test('x-forwarded-host wins over host; the full forwarded-for chain is kept', () => {
  const meta = buildRequestMeta(H({ host: 'internal', 'x-forwarded-host': 'mirror.example', 'x-forwarded-for': '1.1.1.1, 10.0.0.2, 10.0.0.3' }));
  assert.equal(meta.host, 'mirror.example');
  assert.equal(meta.forwarded_for, '1.1.1.1, 10.0.0.2, 10.0.0.3');
});

test('a Thai city is URI-decoded; a malformed escape is kept as it arrived', () => {
  assert.equal(buildRequestMeta(H({ 'x-vercel-ip-city': '%E0%B8%9A%E0%B8%B2%E0%B8%87%E0%B8%81%E0%B8%B0%E0%B8%9B%E0%B8%B4' })).vercel_ip_city, 'บางกะปิ');
  assert.equal(buildRequestMeta(H({ 'x-vercel-ip-city': '%E0%B8' })).vercel_ip_city, '%E0%B8');
});

test('control characters are stripped from every value', () => {
  const meta = buildRequestMeta(H({ 'user-agent': 'UA\u0000\u0007x\u007F', 'accept-language': 'th\r\nX-Evil: 1' }));
  assert.equal(meta.user_agent, 'UAx');
  assert.equal(meta.accept_language, 'thX-Evil: 1');
});

test('caps: origin 200, user_agent 300, accept_language 100, forwarded_for 300, referer_path 200', () => {
  const meta = buildRequestMeta(H({
    origin: 'https://' + 'a'.repeat(400),
    'user-agent': 'u'.repeat(500),
    'accept-language': 'l'.repeat(500),
    'x-forwarded-for': '1'.repeat(500),
    referer: 'https://www.9experttraining.com/' + 'p'.repeat(500),
  }));
  assert.equal(meta.origin.length, 200);
  assert.equal(meta.user_agent.length, 300);
  assert.equal(meta.accept_language.length, 100);
  assert.equal(meta.forwarded_for.length, 300);
  assert.equal(meta.referer_path.length, 200);
});

test('empty fields are omitted; no headers at all is {}', () => {
  assert.deepEqual(buildRequestMeta(H({})), {});
  assert.deepEqual(buildRequestMeta(H({ origin: '   ', 'user-agent': '' })), {});
});

test('never throws: null, a non-object, a get that throws, an unparseable referer', () => {
  assert.deepEqual(buildRequestMeta(null), {});
  assert.deepEqual(buildRequestMeta(42), {});
  assert.deepEqual(buildRequestMeta({ get() { throw new Error('boom'); } }), {});
  const meta = buildRequestMeta(H({ referer: 'not a url' }));
  assert.equal('referer_host' in meta, false);
  assert.equal('origin_trusted' in meta, false);
});

test('origin_trusted: false for a mirror, a lookalike, and the literal "null" origin', () => {
  assert.equal(buildRequestMeta(H({ origin: 'https://9expert-register.example' })).origin_trusted, false);
  assert.equal(buildRequestMeta(H({ origin: 'https://www.9experttraining.com.evil.io' })).origin_trusted, false);
  assert.equal(buildRequestMeta(H({ origin: 'null' })).origin_trusted, false);
});

test('origin_trusted: falls back to the referer origin when Origin is absent; omitted when neither exists', () => {
  assert.equal(buildRequestMeta(H({ referer: 'https://9experttraining.com/x' })).origin_trusted, true);
  assert.equal(buildRequestMeta(H({ referer: 'https://mirror.example/x' })).origin_trusted, false);
  assert.equal('origin_trusted' in buildRequestMeta(H({ 'user-agent': 'x' })), false);
});

test('origin_trusted: Origin is judged before Referer', () => {
  const meta = buildRequestMeta(H({ origin: 'https://mirror.example', referer: 'https://www.9experttraining.com/' }));
  assert.equal(meta.origin_trusted, false);
});

test('TRUSTED_ORIGINS: production, preview and Vercel deployment URLs of this project', () => {
  for (const o of [
    'https://www.9experttraining.com',
    'https://9experttraining.com',
    'https://genesis-lab.9expert.app',
    'https://genesis-lab-abc123-team.vercel.app',
    'https://genesis-lab-git-staging-team.vercel.app',
    'https://WWW.9experttraining.com/',
  ]) assert.equal(matchesTrustedOrigin(o), true, o);
  for (const o of [
    'http://www.9experttraining.com',
    'https://evil-genesis-lab-x.vercel.app',
    'https://genesis-lab.vercel.app.evil.io',
    'https://other.vercel.app',
    '',
  ]) assert.equal(matchesTrustedOrigin(o), false, o);
});

// test/run.mjs sets NODE_ENV=production before anything loads, so the suite
// sees the PRODUCTION list; a bare runner sees the development one. Both are
// asserted against whichever this process loaded, and the pattern itself is
// checked with an explicit development list.
test('localhost is trusted in development only', () => {
  const dev = process.env.NODE_ENV !== 'production';
  assert.equal(TRUSTED_ORIGINS.includes('http://localhost:*'), dev);
  assert.equal(matchesTrustedOrigin('http://localhost:3000'), dev);
  const devList = [...TRUSTED_ORIGINS.filter((o) => !o.startsWith('http://localhost')), 'http://localhost:*'];
  assert.equal(matchesTrustedOrigin('http://localhost:3000', devList), true);
  assert.equal(matchesTrustedOrigin('http://localhost.evil.io:3000', devList), false);
});

test('requestMetaFor: one warn for an untrusted origin, with no personal data; none for ours', () => {
  const calls = [];
  const saved = console.warn;
  console.warn = (...args) => calls.push(args);
  try {
    requestMetaFor('public', H(OURS));
    assert.equal(calls.length, 0);
    const meta = requestMetaFor('public', H({ ...OURS, origin: 'https://mirror.example', host: 'www.9experttraining.com' }));
    assert.equal(meta.origin_trusted, false);
  } finally {
    console.warn = saved;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '[registration] untrusted origin');
  assert.deepEqual(Object.keys(calls[0][1]).sort(), ['host', 'kind', 'origin', 'referer_host']);
  assert.equal(calls[0][1].kind, 'public');
});

test('requestMetaField: a key only when there is something to store', () => {
  assert.deepEqual(requestMetaField({}), {});
  assert.deepEqual(requestMetaField(undefined), {});
  assert.deepEqual(requestMetaField({ host: 'h' }), { requestMeta: { host: 'h' } });
});

test('summary: every field gets a row, absent values are empty strings, the untrusted flag is carried', () => {
  const s = requestMetaSummary({ origin: 'https://mirror.example', origin_trusted: false });
  assert.equal(s.untrusted, true);
  assert.equal(s.rows.length, REQUEST_META_KEYS.length);
  for (const row of s.rows) {
    assert.equal(typeof row.value, 'string');
    assert.notEqual(row.value, 'undefined');
    assert.notEqual(row.value, 'null');
  }
  assert.equal(s.rows.find((r) => r.label === 'ต้นทางเชื่อถือได้').value, 'ไม่ใช่');
  assert.equal(requestMetaSummary({ host: 'h' }).untrusted, false);
});

test('summary: null for a record filed before capture began', () => {
  assert.equal(requestMetaSummary(undefined), null);
  assert.equal(requestMetaSummary(null), null);
  assert.equal(requestMetaSummary({}), null);
});
