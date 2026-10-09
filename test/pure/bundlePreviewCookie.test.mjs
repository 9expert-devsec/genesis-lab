import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from '../sourceScan.mjs';

/**
 * THE AUTHORISED PREVIEW PATH — the one 2a53d36d never exercised.
 *
 * ── WHAT WENT WRONG, AND WHY NO TEST SAW IT ───────────────────────────────
 * That round proved both REFUSALS end to end (flag without a cookie → 403;
 * no flag → 404) and could not prove the acceptance, because the preview
 * password is bcrypt-hashed and was not available. The one path left unchecked
 * was the one that mattered: an author who HAD unlocked the page clicked the
 * bundle's register button and was refused.
 *
 * The gate was correct. The cookie never arrived. `previewAccess` set
 * `Path=/preview/<slug>`, and measured in headless Chrome with a cookie minted
 * exactly as that action mints one:
 *
 *   SENT      /preview/claude-duo
 *   NOT SENT  /registration/bundle/step-1?…&preview=1
 *   NOT SENT  /api/registration/bundle?preview=1
 *
 * ── SO THIS FILE TESTS THE TWO HALVES SEPARATELY ──────────────────────────
 * The CRYPTO half — mint exactly as the unlock action does, then verify as the
 * gate does — is pure and is driven directly below. The TRANSPORT half is a
 * cookie attribute no unit test can observe: a `Path` is not a value any
 * function returns, it is an instruction to a browser. That half is pinned as
 * a source assertion here and proven for real in the browser tier.
 *
 * `AUTH_SECRET` is set before a DYNAMIC import, because previewSession reads it
 * into a module constant at import time — the idiom test/pure/previewExpiry
 * established and explains at length.
 */
process.env.AUTH_SECRET = process.env.AUTH_SECRET || 'round45-preview-secret';
const { signPreviewCookie, verifyPreviewCookie, previewCookieName } =
  await import('@/lib/pageBuilder/previewSession');

const SLUG = 'claude-duo';
/** A stored preview block, shaped as the page document holds one. */
const PREVIEW = {
  enabled: true,
  passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
  passwordUpdatedAt: '2026-10-01T00:00:00.000Z',
  expireDate: '2099-01-01T00:00:00.000Z',
};

/** Mint exactly as `previewAccess.unlockPreview` does: slug + stored block. */
const mint = (slug = SLUG, preview = PREVIEW, now = Date.now()) =>
  signPreviewCookie(slug, preview, now);

// ── the authorised path ────────────────────────────────────────────────────

test('a cookie minted as the unlock action mints it VERIFIES for that page', () => {
  const signed = mint();
  assert.notEqual(signed, null, 'the unlock action could not mint a cookie at all');
  assert.equal(
    verifyPreviewCookie(signed.value, SLUG, PREVIEW),
    true,
    'the gate rejects a cookie the unlock action just minted — the authorised path is broken',
  );
});

test('the cookie name is slug-derived, so one page’s cookie is invisible to another', () => {
  /**
   * This is what carries the scoping now that Path does not. A reader for
   * another page looks up a different NAME and finds nothing — it never gets
   * as far as checking a signature.
   */
  const a = previewCookieName(SLUG);
  const b = previewCookieName('some-other-page');
  assert.match(a, /^pbprev_[0-9a-f]{16}$/);
  assert.notEqual(a, b, 'two slugs share a cookie name');
  assert.equal(previewCookieName(SLUG), a, 'the name is not stable for one slug');
});

// ── every refusal ──────────────────────────────────────────────────────────

test('a cookie minted for ANOTHER slug is refused', () => {
  const other = mint('some-other-page');
  assert.equal(
    verifyPreviewCookie(other.value, SLUG, PREVIEW),
    false,
    'a cookie for another page unlocks this one',
  );
});

test('a TAMPERED signature is refused', () => {
  const signed = mint();
  const [exp, sig] = signed.value.split('.');
  // Flip one character of the digest, keeping the length (the compare is
  // length-guarded before it is constant-time).
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  assert.equal(verifyPreviewCookie(`${exp}.${flipped}`, SLUG, PREVIEW), false);
  // …and a lengthened one, which takes the other branch.
  assert.equal(verifyPreviewCookie(`${exp}.${sig}x`, SLUG, PREVIEW), false);
  // …and a re-dated one: `exp` is signed, so moving it invalidates the digest.
  assert.equal(verifyPreviewCookie(`${Number(exp) + 60000}.${sig}`, SLUG, PREVIEW), false);
});

test('an EXPIRED cookie is refused even though its signature is good', () => {
  const past = Date.now() - 60 * 60 * 1000;
  const signed = mint(SLUG, PREVIEW, past);
  assert.notEqual(signed, null);
  // Signed an hour ago with a 30-minute cap → already dead.
  assert.equal(verifyPreviewCookie(signed.value, SLUG, PREVIEW), false);
});

test('a ROTATED password and a REVOKED one both invalidate an outstanding cookie', () => {
  /**
   * The payload covers `passwordHash` and `passwordUpdatedAt`, which is what
   * makes revocation self-enforcing at the signature layer rather than
   * depending on the route's `enabled` check alone.
   */
  const signed = mint();
  assert.equal(
    verifyPreviewCookie(signed.value, SLUG, { ...PREVIEW, passwordHash: '$2b$10$DIFFERENTDIFFERENT' }),
    false,
    'a rotated password leaves old cookies valid',
  );
  assert.equal(
    verifyPreviewCookie(signed.value, SLUG, { ...PREVIEW, passwordUpdatedAt: '2026-10-02T00:00:00.000Z' }),
    false,
    'a re-stamped password leaves old cookies valid',
  );
  assert.equal(
    verifyPreviewCookie(signed.value, SLUG, { ...PREVIEW, passwordHash: '' }),
    false,
    'REVOKE leaves old cookies valid',
  );
});

test('garbage is refused rather than thrown on', () => {
  for (const v of ['', 'x', '.', 'abc.def', '123', null, undefined, 12345]) {
    assert.equal(
      verifyPreviewCookie(v, SLUG, PREVIEW),
      false,
      `${JSON.stringify(v)} was accepted`,
    );
  }
});

// ── the transport half ─────────────────────────────────────────────────────

test('the unlock action sets the cookie on `/`, and keeps every other attribute', () => {
  /**
   * THE REGRESSION, PINNED. `Path=/preview/<slug>` meant the browser never
   * sent this cookie to the bundle wizard or its POST route, so an unlocked
   * author was refused by a gate that never saw it. A `Path` is an instruction
   * to a browser rather than a value any function returns, so this is the only
   * tier that can hold the line — the browser tier proves it for real.
   *
   * The three attributes that DO carry the security are asserted alongside, so
   * widening the path cannot quietly take one of them with it.
   */
  const code = readSource('src/lib/actions/previewAccess.js').code;
  assert.match(code, /path: '\/'/, 'the preview cookie is not set on the root path');
  assert.equal(
    /path: `\/preview\//.test(code),
    false,
    'the narrow preview path is back — the wizard will stop receiving the cookie',
  );
  assert.match(code, /httpOnly: true/, 'the cookie is readable by script');
  assert.match(code, /sameSite: 'lax'/, 'the cookie lost its SameSite protection');
  assert.match(code, /secure: process\.env\.NODE_ENV === 'production'/, 'Secure is no longer set in production');
  assert.match(code, /maxAge: signed\.maxAge/, 'the cookie no longer expires with its signature');
});

test('the gate and the preview page look the cookie up by the SAME name', () => {
  /**
   * Two readers, one naming scheme. If either spelled the name itself, a slug
   * with an unusual character would unlock one surface and not the other —
   * and the failure mode is the one this round is fixing, arriving silently.
   */
  for (const rel of [
    'src/app/(public)/preview/[slug]/page.jsx',
    'src/lib/registration/bundlePreviewGate.js',
  ]) {
    assert.match(
      readSource(rel).code,
      /previewCookieName\(/,
      `${rel} does not use the shared cookie-name helper`,
    );
  }
});
