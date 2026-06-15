/**
 * Minimal Omise REST client. We call the Omise API directly with fetch
 * + HTTP Basic auth (secret key as the username, blank password) rather
 * than pulling in the `omise` npm SDK — keeps the dependency surface
 * small and the call path obvious, matching our Postmark wrapper.
 *
 * Docs: https://docs.opn.ooo/api  (Omise / Opn Payments)
 */

const OMISE_API = 'https://api.omise.co';

// Warn if test key is active on production
if (
  typeof process !== 'undefined' &&
  process.env.NODE_ENV === 'production' &&
  process.env.OMISE_SECRET_KEY?.startsWith('skey_test_')
) {
  console.warn('[omise] ⚠️  Using TEST secret key on production environment.');
}

function authHeader() {
  const secret = process.env.OMISE_SECRET_KEY;
  if (!secret) return null;
  // Basic auth: base64("secretKey:")
  const token = Buffer.from(`${secret}:`).toString('base64');
  return `Basic ${token}`;
}

async function omiseFetch(path, { method = 'POST', body } = {}) {
  const auth = authHeader();
  if (!auth) {
    return { ok: false, error: 'omise_not_configured' };
  }
  try {
    const res = await fetch(`${OMISE_API}${path}`, {
      method,
      headers: {
        Authorization: auth,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body ? new URLSearchParams(body).toString() : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.object === 'error') {
      return { ok: false, error: data.code || 'omise_error', detail: data.message || '', raw: data };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: 'network_error', detail: err.message };
  }
}

/**
 * Create a charge from a card token (credit/debit card flow).
 * amountSatang: integer, smallest currency unit.
 */
export async function createCardCharge({ amountSatang, token, metadata = {} }) {
  const body = {
    amount: amountSatang,
    currency: 'thb',
    card: token,
    'metadata[registrationId]': metadata.registrationId || '',
    'metadata[referenceNumber]': metadata.referenceNumber || '',
  };
  return omiseFetch('/charges', { body });
}

/**
 * Create a PromptPay charge. This first needs a source of type
 * 'promptpay', then a charge referencing it. The charge response
 * carries source.scannable_code.image.download_uri (the QR image) and
 * stays 'pending' until the customer pays — confirmation arrives via
 * webhook (charge.complete).
 */
export async function createPromptPayCharge({ amountSatang, metadata = {} }) {
  const source = await omiseFetch('/sources', {
    body: { type: 'promptpay', amount: amountSatang, currency: 'thb' },
  });
  if (!source.ok) return source;

  const charge = await omiseFetch('/charges', {
    body: {
      amount: amountSatang,
      currency: 'thb',
      source: source.data.id,
      'metadata[registrationId]': metadata.registrationId || '',
      'metadata[referenceNumber]': metadata.referenceNumber || '',
    },
  });
  return charge;
}

/** Retrieve a charge by id (used by the webhook to re-verify). */
export async function retrieveCharge(chargeId) {
  return omiseFetch(`/charges/${chargeId}`, { method: 'GET' });
}

/**
 * Extract the PromptPay QR image URL from a charge response, if present.
 */
export function getPromptPayQrUrl(charge) {
  return (
    charge?.source?.scannable_code?.image?.download_uri ||
    charge?.source?.scannable_code?.image?.uri ||
    null
  );
}
