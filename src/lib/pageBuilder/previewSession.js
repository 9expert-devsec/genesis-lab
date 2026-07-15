import { createHmac, createHash, timingSafeEqual } from 'crypto';

/**
 * Preview session — a signed, slug-scoped cookie proving a visitor passed the
 * preview password. The password itself is never stored client-side and never
 * appears in a URL.
 *
 * The cookie is `<exp>.<hmac>` where the HMAC (keyed with AUTH_SECRET) covers:
 *     slug . passwordHash . passwordUpdatedAt . exp
 *
 * WHY the password material is in the payload — REVOCATION:
 *   - regeneratePreviewPassword() writes a new passwordHash AND a new
 *     passwordUpdatedAt → the payload changes → outstanding cookies stop
 *     verifying immediately.
 *   - revokePreviewAccess() clears passwordHash to '' (it does NOT touch
 *     passwordUpdatedAt) → binding to the HASH is what makes revoke
 *     self-enforcing at the signature layer, rather than depending only on
 *     the route's `enabled` check. Revoked means revoked.
 * Neither value leaks: the cookie carries only exp + the HMAC digest.
 *
 * The cookie NAME is derived from the slug, so a cookie minted for one page
 * can never unlock another, and Path further scopes it to that page's route.
 * TTL is capped at 30 minutes and never outlives the link's own expireDate.
 */

const TTL_MS = 30 * 60 * 1000; // 30-minute cap
const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';

/** Slug-bound cookie name — one preview cookie can't unlock another page. */
export function previewCookieName(slug) {
  const h = createHash('sha256').update(String(slug ?? '')).digest('hex').slice(0, 16);
  return `pbprev_${h}`;
}

function payload(slug, preview, exp) {
  const hash = String(preview?.passwordHash ?? '');
  const updated = preview?.passwordUpdatedAt ? new Date(preview.passwordUpdatedAt).getTime() : 0;
  return `${slug}.${hash}.${Number.isNaN(updated) ? 0 : updated}.${exp}`;
}

function sign(data) {
  return createHmac('sha256', SECRET).update(data).digest('base64url');
}

/**
 * Mint a cookie for a verified visitor. Returns { value, maxAge } or null if
 * there's no secret or the link is already expired.
 */
export function signPreviewCookie(slug, preview, now = Date.now()) {
  if (!SECRET || !slug) return null;
  const linkExp = preview?.expireDate ? new Date(preview.expireDate).getTime() : null;
  let exp = now + TTL_MS;
  // Never outlive the preview link itself.
  if (linkExp !== null && !Number.isNaN(linkExp) && linkExp < exp) exp = linkExp;
  if (exp <= now) return null;
  return {
    value: `${exp}.${sign(payload(slug, preview, exp))}`,
    maxAge: Math.max(1, Math.floor((exp - now) / 1000)),
  };
}

/** Constant-time verify against the CURRENT stored preview block. */
export function verifyPreviewCookie(value, slug, preview, now = Date.now()) {
  if (!SECRET || typeof value !== 'string' || !slug) return false;
  const dot = value.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(value.slice(0, dot));
  const sig = value.slice(dot + 1);
  if (!Number.isFinite(exp) || exp <= now) return false;
  const expected = sign(payload(slug, preview, exp));
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
