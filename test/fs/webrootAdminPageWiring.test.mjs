import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, sourceExists } from '../sourceScan.mjs';
import { resolvePageKey, ALL_PAGE_KEYS } from '@/lib/rbac/pages';

/**
 * THE SEAMS test/pure/webrootPropagation.test.mjs CANNOT REACH.
 *
 * The pure file proves the poll behaves. Three things it cannot touch, each of
 * which is where this page would go wrong quietly:
 *
 *   1. WHICH PERMISSION GUARDS THE PAGE. The page is a server component that
 *      imports next-auth; it cannot be imported into this tier.
 *   2. THAT THE PAGE NEVER COMPOSES A PATHNAME. The whole replace-only ruling
 *      rests on the client sending a receipt id and nothing else.
 *   3. THAT NESTING DID NOT DISTURB THE RBAC REGISTRY. 38 registered pages ==
 *      38 nav entries is pinned elsewhere; this proves the new route rides the
 *      existing `media` key instead of adding a 39th.
 */

const PAGE = 'src/app/admin/media/webroot-documents/page.jsx';
const CLIENT = 'src/app/admin/media/webroot-documents/_components/WebrootDocumentsClient.jsx';
const MEDIA_PAGE = 'src/app/admin/media/page.jsx';

test('CONTROL: the files under scan exist and were really read', () => {
  // Every "must not contain" assertion below passes vacuously against an empty
  // string, so anchor the inputs first.
  for (const rel of [PAGE, CLIENT, MEDIA_PAGE]) {
    assert.ok(sourceExists(rel), `${rel} is missing`);
    assert.ok(readSource(rel).code.length > 400, `${rel} scanned to almost nothing`);
  }
});

// ── 1. routing and permission ───────────────────────────────────────────────

test('the nested route resolves to the EXISTING media key, with no new page key', () => {
  assert.equal(resolvePageKey('/admin/media/webroot-documents'), 'media');
  assert.equal(
    ALL_PAGE_KEYS.length, 38,
    'a page key was added or removed. This route is supposed to inherit `media` '
    + 'by href prefix; a 39th key means a new checkbox in the role editor and a '
    + 'new NAV_GROUPS line, and rbacNavParity will say so',
  );
  assert.equal(ALL_PAGE_KEYS.includes('webroot_documents'), false,
    'a dedicated key appeared for this page — the ruling was to reuse `media`');
});

test('CONTROL: prefix resolution is real, and does not match by mere substring', () => {
  // Without this, "it resolves to media" would also hold for a resolver that
  // returned `media` for anything containing the word.
  assert.equal(resolvePageKey('/admin/mediaX'), null, 'the trailing-slash guard must hold');
  assert.equal(resolvePageKey('/admin/unknown-route'), null);
  assert.equal(resolvePageKey('/admin/media'), 'media', 'the parent still resolves');
});

test('the page guards on media before it does anything else', () => {
  const src = readSource(PAGE);
  assert.match(src.withImports, /from '@\/lib\/rbac\/guard'/);
  assert.match(src.code, /requirePage\(\s*'media'\s*\)/,
    'the page must guard on the media key, not on a new one and not on nothing');
  const guardAt = src.code.indexOf("requirePage('media')");
  const listAt = src.code.indexOf('listWebrootReplacements');
  assert.ok(guardAt > -1 && listAt > guardAt,
    'the guard must run BEFORE any data is read — history names archive keys and '
    + 'who replaced what, which is not for an unauthorised caller');
});

test('the page is deliberately NOT a sidebar entry, and IS linked from /admin/media', () => {
  // rbacNavParity asserts every NAV_GROUPS link is a registered page. A nav
  // entry here would redden it, so the way in is an ordinary link.
  const sidebar = readSource('src/components/layout/AdminSidebar.jsx');
  assert.equal(
    /webroot-documents/.test(sidebar.code), false,
    'a sidebar entry appeared for a route with no page key of its own — '
    + 'rbacNavParity will report it as nav-not-registered',
  );
  assert.match(
    readSource(MEDIA_PAGE).code, /\/admin\/media\/webroot-documents/,
    'with no sidebar entry, /admin/media is the only way in and must link to it',
  );
});

// ── 2. the page cannot choose a pathname ────────────────────────────────────

test('the client sends a receipt id and NOTHING else in clientPayload', () => {
  const src = readSource(CLIENT);
  const payload = src.code.slice(src.code.indexOf('clientPayload'));
  const literal = payload.slice(0, payload.indexOf('}'));
  assert.match(literal, /receiptId/, 'the receipt id is the whole payload');
  for (const forbidden of ['filename', 'pathname', 'blobPathname', 'publicPath']) {
    assert.equal(
      new RegExp(`\\b${forbidden}\\b`).test(literal), false,
      `clientPayload carries ${forbidden}. It is client-controlled: the route must `
      + 'read the filename from the stored receipt, or a receipt for one document '
      + 'authorises an overwrite of another',
    );
  }
});

test('the upload target comes from the SERVER reply, never from a string built here', () => {
  const src = readSource(CLIENT);
  assert.match(src.code, /upload\(\s*prep\.blobPathname/,
    'the pathname handed to upload() must be the one prepareWebrootReplacement '
    + 'returned, so this component never composes a destination');
  assert.equal(
    /['"`]webroot-documents\//.test(src.code), false,
    'a literal Blob prefix appeared in the client. Every pathname is derived '
    + 'server-side from the frozen list; a copy here is a second derivation that '
    + 'can disagree',
  );
});

test('the document list is the frozen three, taken from the shared module', () => {
  const src = readSource(PAGE);
  assert.match(src.withImports, /WEBROOT_DOCUMENTS/, 'the list must come from the shared module');
  assert.match(src.code, /WEBROOT_DOCUMENTS\.map/, 'and be mapped, not restated');
  for (const literal of ['9expert-company-profile', 'chatgpt-account', 'course-catalog']) {
    assert.equal(
      src.code.includes(literal), false,
      `${literal} is written out in the page. A fourth document must stay a code `
      + 'change in ONE place, and a hardcoded list here is a second place to forget',
    );
  }
});

// ── 3. the flow reuses what exists rather than reimplementing it ────────────

test('the client drives the EXISTING actions and the shared poll module', () => {
  const src = readSource(CLIENT);
  for (const name of ['prepareWebrootReplacement', 'recordWebrootReplacement', 'listWebrootReplacements']) {
    assert.match(src.withImports, new RegExp(name), `${name} must be imported, not reimplemented`);
    assert.match(src.code, new RegExp(`${name}\\(`), `${name} must actually be called`);
  }
  assert.match(src.withImports, /from '@\/lib\/webroot\/propagation\.mjs'/);
  assert.match(src.code, /pollForPropagation\(/, 'the poll is the shared, tested one');
});

test('no archive, receipt or record logic is re-implemented in the page', () => {
  const src = readSource(CLIENT);
  for (const forbidden of ['randomUUID', 'archivePathname =', 'copy(', 'head(']) {
    assert.equal(
      src.code.includes(forbidden), false,
      `the client contains "${forbidden}" — archiving, receipt minting and recording `
      + 'all already exist server-side and must not be duplicated here',
    );
  }
});

test('both one-PoP caveats are IN THE UI, not only in a comment', () => {
  // The subject is rendered text, so this reads the RAW file: `code` is scrubbed
  // of comments, which is exactly the distinction being asserted.
  const raw = readSource(CLIENT).raw;
  const rendered = readSource(CLIENT).code;
  assert.match(rendered, /CDN/, 'the single-PoP caveat must be rendered, not commented');
  assert.match(rendered, /เบราว์เซอร์/,
    'the browser-cache caveat must be rendered — the person most likely to think '
    + 'it failed is the one who just uploaded it');
  assert.ok(raw.length > rendered.length, 'the raw form must differ, or the scrub did nothing');
});

test('a timeout is not presented as a failure, and offers a re-check', () => {
  const src = readSource(CLIENT);
  assert.match(src.code, /remedyFor\(/, 'the remedy comes from the tested helper');
  assert.match(src.code, /onRecheck/, 'a re-check must be offered');

  // Anchored on the RENDERED result block, not on the first mention of the
  // phase constant — that first mention is in the state machine, several
  // hundred characters above the JSX, and slicing from it measured the wrong
  // region entirely (it caught the declaration of onReplace itself).
  const start = src.code.indexOf('result ?');
  const end = src.code.indexOf('prepared.length');
  assert.ok(start > -1 && end > start, 'could not locate the rendered result block');
  const resultBlock = src.code.slice(start, end);

  assert.match(resultBlock, /onRecheck/, 'the result block must offer the re-check');
  assert.equal(
    /onReplace/.test(resultBlock), false,
    'the timeout branch offers an upload. The remedy for "I cannot see it from '
    + 'here" is to look again; offering an upload invites the double-upload the '
    + 'busy lock exists to prevent',
  );
});
