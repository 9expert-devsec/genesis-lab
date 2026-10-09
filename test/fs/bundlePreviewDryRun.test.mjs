import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * PREVIEW MODE MUST NOT BE ABLE TO WRITE, AND THE FLAG MUST NOT BE ABLE TO
 * AUTHORISE ITSELF.
 *
 * ── THE HOLE THIS CLOSES, NAMED ────────────────────────────────────────────
 * 1c77b6ce made the preview card emit `?preview=1`. Neither the wizard nor the
 * registration route read it, and both loaded the PUBLISHED page — so for a
 * page that is published and has a draft on top, a preview click entered the
 * REAL wizard and its submit would have written a REAL registration. The flag
 * was live and unhonoured for one commit. This file is the guard on both
 * halves of the fix.
 *
 * ── WHY A SOURCE SCAN AND NOT AN INVOCATION ───────────────────────────────
 * The route is a Next handler that opens a Mongo transaction and reads
 * `cookies()`; the wizard's server half awaits three upstream fetches. Neither
 * is reachable from this suite without standing up both. What IS checkable,
 * and is the property that actually matters, is STRUCTURAL: the preview return
 * is positioned before every write and send CALL SITE, so the write path is
 * not guarded-inside but unreachable-from.
 *
 * Position is the whole claim. A flag checked INSIDE `writeLegsAtomically`
 * would satisfy any "does it mention preview" test and would still be one
 * mistaken early-return away from writing.
 */

const ROUTE = 'src/app/api/registration/bundle/route.js';
const WIZARD = 'src/app/(public)/registration/bundle/BundlePageContent.jsx';
const GATE = 'src/lib/registration/bundlePreviewGate.js';
const FLAG = 'src/lib/registration/bundlePreview.js';

/** The body of POST, so a match cannot land in an import or a helper above it. */
function postBody(code) {
  const at = code.indexOf('export async function POST(');
  assert.ok(at > -1, 'POST is gone from the route');
  return code.slice(at);
}

/**
 * THE DRY-RUN RETURN, anchored on the return ITSELF and not on `if (preview)`.
 *
 * There are TWO preview branches in POST and they do different jobs: the
 * first chooses which document to load, the second ends the request. An
 * `indexOf('if (preview)')` finds the loader — which sits above the
 * validation — and every position assertion below it then measures the wrong
 * line. Caught by this file's own control, which is what it is for.
 */
const DRY_RUN_RETURN = 'return NextResponse.json({ ok: true, preview: true });';
function dryRunAt(body) {
  const at = body.indexOf(DRY_RUN_RETURN);
  assert.ok(at > -1, 'the route has no dry-run return at all');
  assert.equal(
    body.indexOf(DRY_RUN_RETURN, at + 1), -1,
    'there is more than one dry-run return — which one ends the request?',
  );
  return at;
}
// ── the route: the write path is unreachable in preview ────────────────────

test('the preview return comes BEFORE every write and send call site', () => {
  const body = postBody(readSource(ROUTE).code);

  const ret = dryRunAt(body);

  /**
   * Every call that mints, builds, writes or sends. Checked by CALL SITE —
   * `foo(` — so the import list and the function definitions above POST
   * cannot satisfy it, and so a new write added below the return is caught by
   * the same rule rather than needing a new test.
   */
  for (const call of [
    'new mongoose.Types.ObjectId(',
    'buildBundleTag(',
    'buildBundleLegs(',
    'orderLegsMarkerLast(',
    'writeLegsAtomically(',
    'sendBundleRegistrationEmail(',
  ]) {
    const at = body.indexOf(call);
    assert.ok(at > -1, `${call} is gone from POST — this guard is now asserting nothing`);
    assert.ok(
      at > ret,
      `${call} is reachable in preview mode: it appears BEFORE the preview return`,
    );
  }
});

test('CONTROL: the position probe can tell before from after', () => {
  /**
   * Without this, `at > ret` passes for free if `ret` were ever -1 or if the
   * slice were empty. So: something real must exist on BOTH sides of the
   * return — the validation above it and the write below it.
   */
  const body = postBody(readSource(ROUTE).code);
  const ret = dryRunAt(body);
  const validate = body.indexOf('validateBundlePicks(');
  const write = body.indexOf('writeLegsAtomically(');
  assert.ok(validate > -1 && ret > -1 && write > -1);
  assert.ok(validate < ret, 'validation no longer runs before the preview return');
  assert.ok(ret < write, 'the probe cannot tell the two sides apart');
});

test('the full validation still runs in preview — it is a dry RUN, not a skip', () => {
  /**
   * A preview that short-circuited the checks would answer a question nobody
   * asked. Every step a real submission takes must happen above the return:
   * the section gate, the live schedules, today's Bangkok date, the live
   * status map and the pick verdict.
   */
  const body = postBody(readSource(ROUTE).code);
  const ret = dryRunAt(body);
  for (const call of [
    'resolveBundleRequest(',
    'resolveSectionData(',
    'siteTodayKey(',
    'bundleLiveStatusById(',
    'validateBundlePicks(',
  ]) {
    const at = body.indexOf(call);
    assert.ok(at > -1, `${call} is gone from POST`);
    assert.ok(at < ret, `${call} is skipped in preview mode — the dry run is not a real run`);
  }
});

// ── the route: the flag never authorises itself ────────────────────────────

test('a flagged request is gated, and NEVER falls back to the published page', () => {
  const body = postBody(readSource(ROUTE).code);

  // The gate is what decides, and a failure is a 403 rather than a fall-through.
  assert.match(body, /resolveBundlePreviewPage\(/, 'the route does not call the preview gate');
  assert.match(body, /status: 403/, 'a refused preview is not a 403');

  /**
   * THE BRANCH IS EXCLUSIVE. The published loader must sit in the `else`, so
   * there is no path on which a flagged request that failed the gate goes on
   * to read the published document — which is exactly what would turn an
   * unauthorised preview into a real registration.
   */
  const branch = body.slice(body.indexOf('if (preview) {'), body.indexOf('validateBundlePicks('));
  assert.match(branch, /\} else \{/, 'the preview and published loads are not exclusive');
  const gateAt = branch.indexOf('resolveBundlePreviewPage(');
  const pubAt = branch.indexOf('getPublishedPageBuilderPageById(');
  const elseAt = branch.indexOf('} else {');
  assert.ok(gateAt > -1 && pubAt > -1 && elseAt > -1);
  assert.ok(gateAt < elseAt, 'the gate is not in the preview arm');
  assert.ok(pubAt > elseAt, 'the published load is reachable from the preview arm');
});

test('`allowUnpublished` only ever carries the GATE\'s verdict, in both readers', () => {
  /**
   * The visibility relaxation is the second half of this round's fix: a
   * previewed page is unpublished by definition, so `isPubliclyVisible`
   * refused every authorised preview even once the cookie reached the gate.
   *
   * It is also the one parameter here that could become a hole. `preview` is
   * assigned exactly once in each file, from `wantsBundlePreview`, and is
   * reassigned nowhere; a failed gate returns before any `resolveBundleRequest`
   * call. So the only value `allowUnpublished` can take is the one the cookie
   * check produced — asserted as "the literal `allowUnpublished: preview`, and
   * never a bare `true`".
   */
  for (const rel of [ROUTE, WIZARD]) {
    const code = readSource(rel).code;
    const uses = [...code.matchAll(/allowUnpublished:\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    assert.ok(uses.length >= 2, `${rel} does not pass allowUnpublished to both resolve calls`);
    for (const v of uses) {
      assert.equal(v, 'preview', `${rel} passes allowUnpublished: ${v} — not the gate's verdict`);
    }
    /**
     * DECIDED ONCE AND BINDING. `const` is the assertion, not a count of `=`
     * signs — a first draft counted those and tripped over `preview={preview}`,
     * which is a JSX prop rather than an assignment. A `const` cannot be
     * reassigned at all, so one declaration and no `let`/`var` is the whole
     * guarantee that the value reaching `allowUnpublished` is the one the
     * cookie check produced.
     */
    const decls = [...code.matchAll(/\b(?:const|let|var)\s+preview\s*=/g)].map((m) => m[0]);
    assert.equal(decls.length, 1, `${rel} declares \`preview\` ${decls.length} times`);
    assert.match(decls[0], /^const\s/, `${rel} declares \`preview\` mutably: ${decls[0]}`);
    assert.match(code, /const preview = wantsBundlePreview\(/, `${rel} does not derive preview from the flag reader`);
  }
});

test('the preview flag is read from the URL, not from the validated body', () => {
  /**
   * The body is checked against `bundleRegistrationSchema`, which every real
   * submission shares. A mode flag in there would be a field on the live
   * contract that only one mode uses — and a schema is the wrong place to
   * carry a routing hint that grants nothing.
   */
  const body = postBody(readSource(ROUTE).code);
  assert.match(body, /wantsBundlePreview\(\s*Object\.fromEntries\(new URL\(req\.url\)\.searchParams\)/);
  assert.equal(
    /data\.preview/.test(body),
    false,
    'the flag is being read off the parsed body',
  );
});

// ── the wizard's server half ───────────────────────────────────────────────

test('the wizard gates on the cookie too, and refuses rather than falling back', () => {
  const code = readSource(WIZARD).code;
  assert.match(code, /resolveBundlePreviewPage\(/, 'the wizard does not call the preview gate');
  assert.match(code, /renderPreviewForbidden\(\)/, 'a refused preview is not refused');

  const branch = code.slice(code.indexOf('const preview = wantsBundlePreview('), code.indexOf('const cheap ='));
  const gateAt = branch.indexOf('resolveBundlePreviewPage(');
  const elseAt = branch.indexOf('} else {');
  const pubAt = branch.indexOf('getPublishedPageBuilderPageById(');
  assert.ok(gateAt > -1 && elseAt > -1 && pubAt > -1, 'the load is not a two-armed branch');
  assert.ok(gateAt < elseAt && pubAt > elseAt, 'a refused preview can reach the published load');
});

test('BOTH readers go through the ONE gate — neither opens the draft itself', () => {
  /**
   * The gate is a shared module precisely so the two cannot disagree, and the
   * cheaper mistake — the route accepting a cookie the wizard rejected — is
   * the one that writes. So neither file may call the unfiltered page loader
   * directly; that call belongs to the gate alone.
   */
  for (const rel of [ROUTE, WIZARD]) {
    const code = readSource(rel).code;
    assert.equal(
      /getPageBuilderPageById\(/.test(code),
      false,
      `${rel} loads the unfiltered page itself instead of going through the gate`,
    );
  }
  assert.match(readSource(GATE).code, /getPageBuilderPageById\(/, 'the gate no longer loads the page');
});

// ── the gate itself ────────────────────────────────────────────────────────

test('the gate re-asks all four preview questions, every request', () => {
  /**
   * Not "they got past /preview once". The checks are the preview route's, and
   * the cookie one is slug-scoped by construction — the cookie NAME is a hash
   * of the slug and the signature covers the password hash — so a page id in
   * a URL buys nothing without a cookie for the slug it resolves to.
   */
  const code = readSource(GATE).code;
  assert.match(code, /pv\.enabled/, 'preview-disabled is not checked');
  assert.match(code, /pv\.passwordHash/, 'a page with no password is not refused');
  assert.match(code, /expireDate/, 'expiry is not checked');
  assert.match(code, /previewCookieName\(page\.slug\)/, 'the cookie is not scoped to this page’s slug');
  assert.match(code, /verifyPreviewCookie\(cookie, page\.slug, pv/, 'the cookie signature is not verified');

  // Every failure is a refusal — the function has no path that returns a page
  // without having verified the cookie.
  const afterVerify = code.slice(code.indexOf('verifyPreviewCookie('));
  assert.match(afterVerify, /return \{ ok: true/, 'the success return moved above the cookie check');
  const okAt = code.indexOf('return { ok: true');
  const verifyAt = code.indexOf('verifyPreviewCookie(');
  assert.ok(verifyAt < okAt, 'the gate can return a page before verifying the cookie');
});

test('the gate restores `_id`, without which nothing downstream can be looked up', () => {
  // `composeWorkingView` returns the editable surface and `_id` is in neither
  // key list — the same omission that cost the preview page its button.
  assert.match(readSource(GATE).code, /_id: page\._id/);
});

// ── the words ──────────────────────────────────────────────────────────────

test('the preview strings are back, and every one of them has a reader', () => {
  /**
   * 74c381a5 removed four of these because nothing read them. They return with
   * their callers, and this is the guard that keeps the pair honest: each
   * export is named by at least one file other than its own.
   */
  const flag = readSource(FLAG).code;
  const readers = {
    BUNDLE_PREVIEW_BANNER: [WIZARD],
    BUNDLE_PREVIEW_FORBIDDEN: [WIZARD],
    BUNDLE_PREVIEW_FORBIDDEN_BODY: [WIZARD],
    BUNDLE_PREVIEW_SUBMIT: ['src/components/registration/BundleWizard.jsx'],
    BUNDLE_PREVIEW_SUCCESS_TITLE: ['src/components/registration/BundleWizard.jsx'],
    BUNDLE_PREVIEW_SUCCESS_BODY: ['src/components/registration/BundleWizard.jsx'],
  };
  for (const [name, files] of Object.entries(readers)) {
    assert.match(flag, new RegExp(`export const ${name}\\b`), `${name} is not exported`);
    for (const f of files) {
      assert.match(
        readSource(f).withImports,
        new RegExp(`\\b${name}\\b`),
        `${name} has no reader in ${f}`,
      );
    }
  }
});

test('the banner states the CONSEQUENCE, not just the mode', () => {
  // "preview" is a word an author can read as "preview of the page" and walk
  // past on the way to filling in a form that looks entirely real.
  const flag = readSource(FLAG).code;
  assert.match(flag, /โหมดพรีวิว — การสมัครนี้จะไม่ถูกบันทึก/);
  assert.match(flag, /ตรวจสอบ \(ไม่บันทึก\)/);
});
