/**
 * TOTP (RFC 6238) helpers — Google Authenticator / Authy / 1Password
 * compatible.
 *
 * `step: 30` matches the GA default 30-second window.
 * `window: 1` accepts ±1 step (±30s) of clock drift, which trades a
 * tiny security window for far fewer "invalid code" complaints from
 * users with skewed device clocks.
 */

import { authenticator } from 'otplib';

authenticator.options = {
  step: 30,
  window: 1,
};

const APP_NAME = '9Expert Admin';

/** Generate a fresh base32 secret for an admin. */
export function generateTotpSecret() {
  return authenticator.generateSecret();
}

/**
 * Build the otpauth:// URI to embed in a QR code. Format is fixed by
 * the spec; authenticator apps parse `otpauth://totp/<issuer>:<account>?secret=...&issuer=...`.
 */
export function generateTotpUri(secret, account) {
  return authenticator.keyuri(account, APP_NAME, secret);
}

/** Verify a 6-digit token against a secret. Never throws. */
export function verifyTotp(token, secret) {
  if (!token || !secret) return false;
  try {
    return authenticator.verify({ token: String(token).trim(), secret });
  } catch {
    return false;
  }
}
