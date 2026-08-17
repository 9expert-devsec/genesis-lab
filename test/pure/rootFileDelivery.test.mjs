import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ROOT_FILE, ROOT_FILE_TAG, serveRootFile } from '@/lib/rootFileDelivery';
import { ROOT_FILE_EXTENSIONS, rootDocumentKey } from '@/lib/rootDocuments.mjs';
import { WEBROOT_DOCUMENTS } from '@/lib/webrootDocuments.mjs';

/**
 * THE ROOT-FILE HANDLER, driven entirely through injected dependencies.
 *
 * ══ WHAT THESE DO NOT PROVE ═════════════════════════════════════════════════
 *
 * NOT ONE BYTE HAS BEEN SERVED FROM A REAL REGISTRY ROW. Every case below runs
 * against a fake lookup and a fake fetch, so they establish the ORDER, the
 * REFUSALS and the header handling — and NOTHING about Blob answering a real
 * Range request for a real published file. That proof needs a row, a row needs
 * the publish UI, and the UI is a later round.
 *
 * The alternative — writing a row from a test to read it back — is refused on
 * purpose: a registry a test has written to is no longer evidence about the
 * registry.
 */

const BASE = 'https://blob.example.com';

/**
 * THE blobPathname IS DELIBERATELY NOT DERIVABLE FROM THE PUBLIC PATH.
 *
 * MEASURED while proving these tests redden: with it set to the obvious
 * `root-documents/<name>.pdf`, a revert that built the upstream URL from the
 * REQUEST PATH instead of from the row produced a byte-identical URL and no
 * test noticed. A fixture whose two candidate derivations agree cannot tell
 * them apart. The extra segment is what makes "from the record, never from the
 * request" a falsifiable claim.
 */
const published = (over = {}) => ({
  publicPath: '/annual-report-2026.pdf',
  blobPathname: 'root-documents/2026/q1/annual-report-2026.pdf',
  contentType: 'application/pdf',
  status: 'published',
  ...over,
});

/**
 * A fake upstream Response that records whether anything BUFFERED it.
 *
 * `arrayBuffer`/`text`/`json` are spies rather than absent, because "the code
 * did not buffer" and "the fixture had no way to buffer" look identical from a
 * count of zero. A control below calls one of them to prove the spy counts.
 */
function upstream({ status = 200, headers = {}, body = '%PDF-1.4 fixture' } = {}) {
  const calls = { arrayBuffer: 0, text: 0, json: 0 };
  const stream = new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode(body)); c.close(); },
  });
  return {
    calls,
    res: {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(headers),
      body: stream,
      arrayBuffer: async () => { calls.arrayBuffer += 1; return new ArrayBuffer(0); },
      text: async () => { calls.text += 1; return ''; },
      json: async () => { calls.json += 1; return ''; },
    },
  };
}

/** Injected deps that record everything they were asked. */
function deps({ row = published(), throwOnLookup = false, up = upstream() } = {}) {
  const seen = { keys: [], urls: [], init: [], lookupCalls: 0 };
  return {
    seen,
    up,
    deps: {
      blobBase: BASE,
      lookup: async (key) => {
        seen.lookupCalls += 1;
        seen.keys.push(key);
        if (throwOnLookup) throw new Error('replica set unreachable');
        return row;
      },
      fetchImpl: async (url, init) => {
        seen.urls.push(url);
        seen.init.push(init);
        return up.res;
      },
    },
  };
}

const req = (path, headers = {}) => new Request(`https://9expert.co.th${path}`, { headers });

const run = (path, d, over = {}) => serveRootFile(
  req(path, over.headers ?? {}), { requestPath: path, method: over.method ?? 'GET' }, d.deps,
);

// ── the happy path ──────────────────────────────────────────────────────────

test('a published row is served, from the blobPathname on the ROW', async () => {
  const d = deps();
  const { outcome, response, key } = await run('/annual-report-2026.pdf', d);

  assert.equal(outcome, ROOT_FILE.SERVED);
  assert.equal(key, '/annual-report-2026.pdf');
  assert.equal(response.status, 200);
  assert.deepEqual(d.seen.urls, [`${BASE}/root-documents/2026/q1/annual-report-2026.pdf`],
    'the upstream URL must be built from the RECORD, never from the request path. '
    + 'The fixture key is /annual-report-2026.pdf, which derives a DIFFERENT '
    + 'pathname — that is what makes this assertion falsifiable');
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(response.headers.get('x-legacy-delivery'), ROOT_FILE_TAG);
});

test('THE RANGE HEADER IS FORWARDED VERBATIM', async () => {
  // The whole reason these documents are held out of the edge cache. A viewer
  // reads the header, jumps to the xref table at the tail, and pulls page 1.
  const d = deps();
  await run('/annual-report-2026.pdf', d, { headers: { range: 'bytes=1024-4095' } });

  const forwarded = d.seen.init[0]?.headers;
  assert.ok(forwarded, 'nothing was forwarded at all');
  assert.equal(forwarded.get('range'), 'bytes=1024-4095',
    'a rewritten or dropped Range turns a seek into a full download');
});

test('CONTROL: with no Range on the request, none is invented', async () => {
  // Without this, "the range is forwarded" would pass for an implementation
  // that hardcoded one.
  const d = deps();
  await run('/annual-report-2026.pdf', d);
  assert.equal(d.seen.init[0].headers.get('range'), null);
});

test('an upstream 206 passes through WITH its Content-Range', async () => {
  // MEASURED (S2): Blob answers a Range request with 206 and an exact
  // Content-Range for all three objects. The handler must not construct either
  // — it passes the upstream's own status and header through.
  const up = upstream({
    status: 206,
    headers: { 'content-range': 'bytes 1024-4095/44647587', 'content-length': '3072' },
  });
  const d = deps({ up });
  const { response } = await run('/annual-report-2026.pdf', d, { headers: { range: 'bytes=1024-4095' } });

  assert.equal(response.status, 206, 'the status must propagate verbatim');
  assert.equal(response.headers.get('content-range'), 'bytes 1024-4095/44647587');
  assert.equal(response.headers.get('content-length'), '3072');
});

test('CONTROL: a 200 upstream yields a 200 with no Content-Range', async () => {
  // Pairs with the case above: without it, "206 passes through" could not be
  // told apart from a handler that always answers 206.
  const d = deps();
  const { response } = await run('/annual-report-2026.pdf', d);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-range'), null);
});

test('THE BODY IS STREAMED — nothing buffers the upstream', async () => {
  // `.arrayBuffer()` first would pull a whole document into function memory.
  const d = deps();
  const { response } = await run('/annual-report-2026.pdf', d);

  assert.equal(d.up.calls.arrayBuffer, 0, 'THE UPSTREAM WAS BUFFERED INTO MEMORY');
  assert.equal(d.up.calls.text, 0);
  assert.equal(d.up.calls.json, 0);
  assert.ok(response.body, 'and something must actually come back');
});

test('CONTROL: the buffering spy DOES count when something calls it', async () => {
  // Without this, the three zeros above would pass for a fixture that cannot
  // record — which is every assertion in this file's most important test.
  const up = upstream();
  assert.equal(up.calls.arrayBuffer, 0);
  await up.res.arrayBuffer();
  assert.equal(up.calls.arrayBuffer, 1, 'the spy does not record, so the zeros prove nothing');
});

test('the handler sets NO cache-control — the headers() rule owns it', async () => {
  // MEASURED: no-store for these paths comes from next.config.mjs's headers()
  // rule, keyed on NO_STORE_DOCUMENT_EXTENSIONS and matched by request path.
  // proxyUpstream's DEFAULT is a 24-hour shared cache, which is the opposite,
  // so silence here is the feature.
  const d = deps();
  const { response } = await run('/annual-report-2026.pdf', d);
  assert.equal(response.headers.get('cache-control'), null,
    'a cache-control here is a SECOND claim about the same response, and this '
    + 'one would say cache a no-store document for a day');
});

// ── THE CASE RULE, end to end ───────────────────────────────────────────────

test('a MIXED-CASE request path looks up the SAME key as lower case', async () => {
  // routes-manifest caseSensitive is false, so these are one URL. If the
  // handler looked up the path as typed, /Annual-Report-2026.PDF would 404
  // against a row published as /annual-report-2026.pdf.
  const mixed = deps();
  await run('/Annual-Report-2026.PDF', mixed);
  const lower = deps();
  await run('/annual-report-2026.pdf', lower);

  assert.deepEqual(mixed.seen.keys, ['/annual-report-2026.pdf']);
  assert.deepEqual(mixed.seen.keys, lower.seen.keys,
    'the two spellings are the same URL and must reach the same row');
  assert.equal(mixed.seen.keys[0], rootDocumentKey('/Annual-Report-2026.PDF'),
    'and the key comes from the shared derivation, not a second lowercasing');
});

// ── the refusals ────────────────────────────────────────────────────────────

test('a WITHDRAWN row is a 404 — not a 403, not a redirect', async () => {
  const d = deps({ row: published({ status: 'withdrawn' }) });
  const { outcome, response } = await run('/annual-report-2026.pdf', d);

  assert.equal(outcome, ROOT_FILE.NOT_FOUND);
  assert.equal(response.status, 404);
  assert.equal(d.seen.urls.length, 0, 'a withdrawn document must not be fetched at all');
});

test('a withdrawn row is INDISTINGUISHABLE from a missing one', async () => {
  // That is the point of withdrawing something. A 403 confirms the file exists
  // and a distinct body or tag leaks exactly what an operator withdrew it to
  // stop publishing.
  const gone = deps({ row: null });
  const drawn = deps({ row: published({ status: 'withdrawn' }) });
  const a = await run('/annual-report-2026.pdf', gone);
  const b = await run('/annual-report-2026.pdf', drawn);

  assert.equal(a.response.status, b.response.status);
  assert.equal(await a.response.text(), await b.response.text());
  assert.equal(
    a.response.headers.get('x-legacy-delivery'),
    b.response.headers.get('x-legacy-delivery'),
  );
});

test('no row at all is a 404, and nothing is fetched', async () => {
  const d = deps({ row: null });
  const { outcome, response } = await run('/never-published.pdf', d);
  assert.equal(outcome, ROOT_FILE.NOT_FOUND);
  assert.equal(response.status, 404);
  assert.equal(d.seen.urls.length, 0);
});

test('each of the FROZEN THREE is refused, and the registry is never asked', async () => {
  // The read-side half of protecting them. Defence in depth: once the rewrite
  // rule exists these names are claimed above this route. It is here because
  // the measured failure (M4) was a rule ORDER problem — a document-extension
  // rule placed above the three webroot rules once STOLE a published PDF.
  for (const filename of WEBROOT_DOCUMENTS) {
    const d = deps();
    const { outcome, response } = await run(`/${filename}`, d);
    assert.equal(outcome, ROOT_FILE.REFUSED_FROZEN, `${filename} was not refused`);
    assert.equal(response.status, 404);
    assert.equal(d.seen.lookupCalls, 0,
      `${filename} reached the registry. A row claiming it should not exist, but `
      + 'the refusal must not DEPEND on that being true');
  }
});

test('the frozen refusal is case-insensitive, because the URL is', async () => {
  const d = deps();
  const { outcome } = await run(`/${WEBROOT_DOCUMENTS[2].toUpperCase()}`, d);
  assert.equal(outcome, ROOT_FILE.REFUSED_FROZEN);
  assert.equal(d.seen.lookupCalls, 0);
});

test('CONTROL: the lookup spy DOES count on a path that is not refused', async () => {
  // Without this, every `lookupCalls === 0` above would pass for a fixture that
  // never records — the refusals would all be vacuous.
  const d = deps();
  await run('/annual-report-2026.pdf', d);
  assert.equal(d.seen.lookupCalls, 1, 'the spy does not record, so the zeros prove nothing');
});

// ── the extension gate, and how it inherits the subset proof ────────────────

test('every extension this route serves is one ROOT_FILE_EXTENSIONS allows', async () => {
  // THE LINK TO THE CACHE RULE. The subset property — ROOT_FILE_EXTENSIONS is a
  // subset of NO_STORE_DOCUMENT_EXTENSIONS — is proved once in
  // test/pure/rootDocumentsPolicy.test.mjs and NOT re-proved here. What this
  // asserts is the other half: that the set this route will actually serve is
  // that same set, so the shipped proof reaches this route.
  for (const ext of ROOT_FILE_EXTENSIONS) {
    const d = deps({ row: published({ publicPath: `/doc.${ext}`, blobPathname: `root-documents/nested/doc.${ext}` }) });
    const { outcome } = await run(`/doc.${ext}`, d);
    assert.equal(outcome, ROOT_FILE.SERVED, `${ext} is allowed by policy but not served`);
  }
});

test('an extension OUTSIDE the list is refused before the registry is asked', async () => {
  // txt is deliberately absent from NO_STORE — nothing range-requests it — so a
  // .txt served here would be edge-cached and a cache HIT would answer a Range
  // request with 200.
  for (const bad of ['txt', 'csv', 'mp3', 'exe']) {
    const d = deps();
    const { outcome, response } = await run(`/thing.${bad}`, d);
    assert.equal(outcome, ROOT_FILE.REFUSED_EXTENSION, `.${bad} was not refused`);
    assert.equal(response.status, 404);
    assert.equal(d.seen.lookupCalls, 0);
  }
});

// ── a broken registry is not a missing file ─────────────────────────────────

test('a lookup that THROWS is 503, never 404', async () => {
  // A 404 would send somebody hunting for a document that is published and
  // fine. Same ruling as the legacy resolver's 503.
  const d = deps({ throwOnLookup: true });
  const { outcome, response } = await run('/annual-report-2026.pdf', d);

  assert.equal(outcome, ROOT_FILE.LOOKUP_FAILED);
  assert.equal(response.status, 503);
  assert.match(await response.text(), /replica set unreachable/,
    'the message must carry the underlying reason');
  assert.equal(d.seen.urls.length, 0);
});

// ── HEAD ────────────────────────────────────────────────────────────────────

test('HEAD returns the headers with no body', async () => {
  const d = deps();
  const { response } = await run('/annual-report-2026.pdf', d, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(response.body, null, 'a HEAD must not carry a body');
  assert.equal(d.seen.init[0].method, 'HEAD', 'and the method must reach the upstream');
});
