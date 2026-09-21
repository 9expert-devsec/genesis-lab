import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHost, recordStaticNotFound } from '@/lib/redirects/recordStaticNotFound';

/**
 * lib/redirects/recordStaticNotFound — the 404 logger for ISR routes.
 *
 * The catch-all logs through notFoundBoundary, which reads `headers()`; on
 * `/articles/[slug]` and `/masterclass/[slug]` that one read would make the
 * whole route per-request again. This helper has to log WITHOUT it: canonical
 * host, deferred through `after()`, and nothing that can throw out of a 404.
 * Every seam is injectable, so each of those claims is a test.
 */

const noop = () => {};

test('canonicalHost is the host of the site URL, and empty for an unparseable one', () => {
  assert.equal(canonicalHost('https://www.9experttraining.com'), 'www.9experttraining.com');
  assert.equal(canonicalHost('https://staging.example.test:3000/x'), 'staging.example.test:3000');
  assert.equal(canonicalHost(''), '');
  assert.equal(canonicalHost('not a url'), '');
  assert.equal(canonicalHost(null), '');
  // undefined takes the default — the canonical site URL.
  assert.equal(canonicalHost(undefined), canonicalHost());
  assert.ok(canonicalHost().length > 0);
});

test('the write is DEFERRED: schedule receives a function and record is not called synchronously', () => {
  const calls = [];
  let scheduled = null;
  const r = recordStaticNotFound('/articles/does-not-exist', {
    schedule: (fn) => { scheduled = fn; },
    record: async (args) => { calls.push(args); return { recorded: true }; },
    host: 'www.example.test',
    warn: noop,
  });
  assert.deepEqual(r, { scheduled: true });
  assert.equal(typeof scheduled, 'function');
  assert.equal(calls.length, 0, 'nothing wrote before the scheduled callback ran');
});

test('when the deferred callback runs, record gets the canonical host and the raw path', async () => {
  const calls = [];
  let scheduled = null;
  recordStaticNotFound('/articles/%e0%b8%81-Thai-Slug', {
    schedule: (fn) => { scheduled = fn; },
    record: async (args) => { calls.push(args); return { recorded: true }; },
    host: 'www.9experttraining.com',
    warn: noop,
  });
  await scheduled();
  assert.deepEqual(calls, [{ host: 'www.9experttraining.com', path: '/articles/%e0%b8%81-Thai-Slug' }]);
});

test('the host defaults to the canonical site host, never a request header', () => {
  let seen = null;
  let scheduled = null;
  recordStaticNotFound('/masterclass/nope', {
    schedule: (fn) => { scheduled = fn; },
    record: async (args) => { seen = args; },
    warn: noop,
  });
  return scheduled().then(() => {
    assert.equal(seen.host, canonicalHost());
    assert.ok(seen.host.length > 0, 'the default site URL parses to a host');
  });
});

test('a rejecting record is swallowed through warn — the 404 never becomes a 500', async () => {
  const warned = [];
  let scheduled = null;
  recordStaticNotFound('/articles/x', {
    schedule: (fn) => { scheduled = fn; },
    record: async () => { throw new Error('mongo down'); },
    host: 'h',
    warn: (...a) => warned.push(a),
  });
  await assert.doesNotReject(() => scheduled());
  assert.equal(warned.length, 1);
  assert.match(String(warned[0][1]), /mongo down/);
});

test('a THROWING record (sync) is swallowed the same way', async () => {
  const warned = [];
  let scheduled = null;
  recordStaticNotFound('/articles/x', {
    schedule: (fn) => { scheduled = fn; },
    record: () => { throw new Error('sync boom'); },
    host: 'h',
    warn: (...a) => warned.push(a),
  });
  await assert.doesNotReject(() => scheduled());
  assert.equal(warned.length, 1);
});

test('schedule throwing (no request scope) is swallowed: { scheduled: false }, a warning, no throw', () => {
  const warned = [];
  const r = recordStaticNotFound('/articles/x', {
    schedule: () => { throw new Error('after() called outside a request scope'); },
    record: async () => {},
    host: 'h',
    warn: (...a) => warned.push(a),
  });
  assert.deepEqual(r, { scheduled: false });
  assert.equal(warned.length, 1);
});
