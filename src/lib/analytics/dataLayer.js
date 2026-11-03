/**
 * The dataLayer contract — business events, vendor-neutral.
 *
 * ══ WHAT THIS IS FOR ═══════════════════════════════════════════════════════
 *
 * The site says WHAT happened ("a public registration was created, worth
 * ฿12,900, from LINE"); Google Tag Manager decides which vendors hear about it.
 * Every event below is pushed in BOTH modes:
 *
 *   · no NEXT_PUBLIC_GTM_ID — gtag.js reads dataLayer only for its own
 *     `gtag(...)` argument objects, so a plain `{ event: … }` push is inert.
 *     Behaviour is byte-for-byte what it was; these pushes are free.
 *   · NEXT_PUBLIC_GTM_ID set — GTM is the ONE owner of Google tags, and these
 *     pushes are the only thing its triggers listen to. See gtag.js for how the
 *     code's own gtag events go quiet in that mode so nothing is counted twice.
 *
 * The table of events and parameters is the plan's contract (R2) and is pinned
 * by test/pure/dataLayerContract.test.mjs.
 *
 * ══ NO PERSONAL DATA. EVER. ════════════════════════════════════════════════
 *
 * No name, email, phone, address, tax id — nothing a customer typed about
 * themselves. `pushEvent` enforces this rather than trusting call sites: any
 * key outside the allow-list is DROPPED, so a future caller spreading a form
 * object into an event loses the extra keys instead of shipping them to every
 * tag in the container.
 */
import { DEFAULT_CURRENCY } from '@/lib/analytics/config';

/** Every parameter key the contract allows, across all events. */
export const ALLOWED_KEYS = Object.freeze([
  'page_path', 'page_location', 'page_title',
  'form_type', 'registration_id', 'course_code', 'course_codes', 'bundle_id',
  'career_path', 'attendee_count', 'value', 'currency', 'lead_channel',
  'payment_method', 'ecommerce',
  'file_name', 'landing_slug', 'contact_method',
  // postcode_lookup_miss — the one event that predates the contract. A
  // postcode, never joined to anything else; see ThaiAddressFields.
  'postal_code',
]);

/** The contract's event names. */
export const EVENTS = Object.freeze({
  pageView: 'page_view',
  registerPublic: 'register_public',
  registerBundle: 'register_bundle',
  registerInhouse: 'register_inhouse',
  registerCareerPath: 'register_career_path',
  registerMasterclass: 'register_masterclass',
  purchase: 'purchase',
  fileDownload: 'file_download',
  viewLanding: 'view_landing',
  contactClick: 'contact_click',
  postcodeLookupMiss: 'postcode_lookup_miss',
});

const ECOMMERCE_KEYS = ['transaction_id', 'value', 'currency', 'items'];
const ITEM_KEYS = ['item_id', 'item_name', 'price', 'quantity', 'item_category'];

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj?.[k] !== undefined && obj[k] !== null && obj[k] !== '') out[k] = obj[k];
  }
  return out;
}

/**
 * The payload that would be pushed — pure, so the contract can be tested
 * without a window. Drops unknown keys and empty values; numbers stay numbers.
 */
export function buildEvent(event, params = {}) {
  const out = { event, ...pick(params, ALLOWED_KEYS) };
  if (out.ecommerce) {
    const ecommerce = pick(out.ecommerce, ECOMMERCE_KEYS);
    if (Array.isArray(ecommerce.items)) ecommerce.items = ecommerce.items.map((i) => pick(i, ITEM_KEYS));
    out.ecommerce = ecommerce;
  }
  if (Array.isArray(out.course_codes)) out.course_codes = out.course_codes.filter(Boolean).map(String);
  return out;
}

/** Push one contract event. Silent no-op on the server; never throws. */
export function pushEvent(event, params = {}) {
  if (typeof window === 'undefined') return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(buildEvent(event, params));
  } catch {
    /* analytics must never break a page */
  }
}

/**
 * Has this key already been sent in this tab? Records it if not.
 *
 * The step-3 screens are routes, and a refresh re-mounts them with fresh refs —
 * a purchase or registration event keyed only on a ref would fire again on
 * every reload of the thank-you page. sessionStorage is per-tab and survives
 * the reload, which is exactly the scope "once per transaction" needs. When
 * storage is blocked the event fires (a possible duplicate beats a certain
 * loss), and the in-memory set still stops a re-render from repeating it.
 */
const sentInMemory = new Set();
function alreadySent(key) {
  if (sentInMemory.has(key)) return true;
  sentInMemory.add(key);
  try {
    const k = `9e_dl_sent:${key}`;
    if (window.sessionStorage.getItem(k)) return true;
    window.sessionStorage.setItem(k, '1');
  } catch {
    /* fall through: fire */
  }
  return false;
}

/**
 * True the FIRST time `event` + `key` is claimed in this tab, false after.
 * The once-guard every deduped sender shares, so a dataLayer push and its Meta
 * twin fire together or not at all. A missing key always claims (true): no id
 * to dedupe on is not a reason to drop the event.
 */
export function claimOnce(event, key) {
  if (typeof window === 'undefined' || !key) return true;
  return !alreadySent(`${event}:${key}`);
}

/** pushEvent, at most once per `key` per tab. */
export function pushEventOnce(key, event, params = {}) {
  if (!claimOnce(event, key)) return;
  pushEvent(event, params);
}

/**
 * GA4 ecommerce purchase, in the shape GTM's "Send ecommerce data → Data
 * Layer" option reads. `{ ecommerce: null }` first, always: dataLayer MERGES
 * pushes, so without the reset a second ecommerce event in the same page would
 * inherit the previous one's items.
 *
 * Once per transaction id per tab — see alreadySent. Returns true when this
 * call is the one that sent it, so a caller can send the same purchase to
 * other destinations under the SAME dedupe decision.
 */
export function pushPurchase({ transactionId, value, currency = DEFAULT_CURRENCY, items = [], paymentMethod, formType }) {
  if (typeof window === 'undefined' || !transactionId) return false;
  if (alreadySent(`purchase:${transactionId}`)) return false;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ecommerce: null });
  } catch {
    /* the event below still goes; pushEvent never throws */
  }
  pushEvent(EVENTS.purchase, {
    ecommerce: { transaction_id: String(transactionId), value, currency, items },
    payment_method: paymentMethod,
    form_type: formType,
  });
  return true;
}

/**
 * The contact a link opens, or null. `tel:`, `mailto:`, and LINE (line.me,
 * lin.ee) — the three ways a visitor reaches sales without a form.
 */
export function contactMethodOf(href) {
  if (typeof href !== 'string') return null;
  const h = href.trim().toLowerCase();
  if (h.startsWith('tel:')) return 'phone';
  if (h.startsWith('mailto:')) return 'email';
  if (/^https?:\/\/([a-z0-9-]+\.)*(line\.me|lin\.ee)(\/|$|\?)/.test(h)) return 'line';
  return null;
}
