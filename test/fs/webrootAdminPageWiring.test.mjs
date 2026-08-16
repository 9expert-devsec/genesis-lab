import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource, sourceExists, walkSources } from '../sourceScan.mjs';
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

/**
 * THE ONLY WAY IN HAS TO LOOK LIKE ONE.
 *
 * The assertion above proves a link EXISTS. It passed while that link was a
 * single line of blue text tucked under the page description, above a file
 * browser that owns the entire visual weight of the screen — so "reachable"
 * and "findable" came apart, and the test could not tell them apart either.
 *
 * This pins the shape: a heading, the three published paths, and a real button
 * — rendered ABOVE the browser rather than beneath the prose. It is a source
 * scan, so it proves the markup is written, not that a human notices it; that
 * limit is the reason the assertions below are about STRUCTURE (an element
 * carrying the primary-button classes) rather than about prominence, which no
 * scan can measure.
 */
test('the entry point is a CARD above the browser, not a line of text under the prose', () => {
  const { code } = readSource(MEDIA_PAGE);

  // A section element carrying the card classes this admin already uses.
  assert.match(
    code,
    /<section className="[^"]*rounded-9e-lg border border-\[var\(--surface-border\)\][^"]*">/,
    'the entry point is not a card — it should use the same card styling as the rest of /admin',
  );

  // The link is the PRIMARY BUTTON style, not bare underlined text.
  const link = /<Link\s+href="\/admin\/media\/webroot-documents"[\s\S]{0,400}?<\/Link>/.exec(code)?.[0];
  assert.ok(link, 'the link to the webroot page is gone');
  assert.match(link, /bg-9e-action/, 'the way in is not styled as a button');
  assert.match(link, /font-bold text-white/, 'the button does not use the primary button treatment');

  // It sits ABOVE the file browser.
  const cardAt = code.indexOf('<section');
  const browserAt = code.indexOf('<MediaClient');
  assert.ok(cardAt > -1 && browserAt > -1, 'the page changed shape');
  assert.ok(cardAt < browserAt, 'the entry section renders below the file browser');
});

test('the three filenames are SINGLE-SOURCED, never retyped on the media page', () => {
  /**
   * Retyping them would be a fourth copy of a list that the rewrites, the
   * upload target and both models already read — and the copy nobody would
   * think to update is the one on a screen that only says what exists.
   */
  const { code, withImports } = readSource(MEDIA_PAGE);
  assert.match(
    withImports, /import \{ WEBROOT_DOCUMENTS, webrootPublicPath \} from '@\/lib\/webrootDocuments\.mjs'/,
    'the media page does not read the frozen document list',
  );
  assert.match(code, /WEBROOT_DOCUMENTS\.map\(/, 'the list is imported but not rendered');
  for (const literal of ['9expert-company-profile.pdf', 'how-to-create-chatgpt-account.pdf']) {
    assert.equal(
      code.includes(literal), false,
      `"${literal}" is hardcoded on the media page — it must come from WEBROOT_DOCUMENTS`,
    );
  }
});

/**
 * THE HISTORY ROW RENDERS THROUGH THE SHARED FORMATTER.
 *
 * Added because reverting the call site to its old `(bytes / 1024 / 1024)
 * .toFixed(1)` left the whole suite GREEN. test/pure/formatBytes proves the
 * FUNCTION is right; nothing proved this component CALLS it, so the defect the
 * extraction exists to fix could have been reinstated in one line without a
 * single test noticing. This is that missing half.
 *
 * The inline-arithmetic ban is the part that actually bites: a fourth
 * hand-rolled formatter is exactly how the third one got here.
 */
test('the history row formats bytes through the shared formatter, not inline arithmetic', () => {
  const { code, withImports } = readSource(CLIENT);
  assert.match(
    withImports, /import \{ formatBytes \} from '@\/lib\/formatBytes\.mjs'/,
    'the client does not import the shared byte formatter',
  );
  assert.match(code, /\{formatBytes\(r\.bytes\)\}/, 'the history row does not use it');
  assert.equal(
    /1024\s*\/\s*1024/.test(code), false,
    'the client computes a size inline again — that is the 0.0 MB defect returning',
  );
});

test('NO admin component hand-rolls a byte formatter any more', () => {
  /**
   * The extraction removed two byte-identical private copies and one divergent
   * third. This is what stops a fourth: any admin component that wants a size
   * has one place to get it from.
   */
  const offenders = walkSources('src/app/admin')
    .filter((f) => /1024\s*\/\s*1024|1024\s*\*\s*1024/.test(f.code))
    .map((f) => f.rel);
  assert.deepEqual(
    offenders, [],
    'an admin component is computing byte units itself:\n  ' + offenders.join('\n  '),
  );
});

test('the webroot page carries a back-link to /admin/media', () => {
  // It is a nested route with no sidebar entry of its own, so the only way back
  // to where the admin came from is a link on the page.
  const { code } = readSource(PAGE);
  assert.match(
    code, /<Link\s+href="\/admin\/media"/,
    'the nested page has no way back to /admin/media',
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
