/**
 * Registration attribution — where a visitor came from, carried onto the
 * registration they eventually submit.
 *
 * PURE. No window, no storage, no Mongoose. The browser half
 * (attributionStore.js) and every server write point call into this, so the
 * rules for "what is a touch", "which touch wins" and "what channel is that"
 * exist once and are tested once (test/pure/attribution.test.mjs).
 *
 * ══ THE SHAPE ══════════════════════════════════════════════════════════════
 *
 *   { first: Touch, last: Touch, channel: Channel }
 *
 * `first` is the first touch inside the window (FIRST_TOUCH_TTL_DAYS); `last`
 * is the last touch that carried a campaign signal or an external referrer.
 * `channel` is DERIVED, on the server, from `last` — the browser's opinion of
 * its own channel is never stored.
 *
 * ── LAST-TOUCH NEVER FALLS BACK TO DIRECT ─────────────────────────────────
 * A visitor who clicks a LINE broadcast on Monday and types the address on
 * Wednesday registered because of the broadcast. A Direct touch therefore only
 * replaces `last` when there is nothing to replace, or what is there has aged
 * out of the window. This is GA4's last-non-direct rule, and following it is
 * what lets `lead_channel` on a dataLayer event be reconciled against GA4's own
 * acquisition report.
 *
 * ── NO PERSONAL DATA ──────────────────────────────────────────────────────
 * Every field is a marketing parameter we (or an ad platform) put on a link, a
 * referrer HOST (never the full referrer URL, whose path and query can carry
 * anything), and a landing PATH (never its query). That is the whole reason it
 * may be stored before consent — see the cookie policy's "จำเป็น" entry.
 */

export const FIRST_TOUCH_TTL_DAYS = 90;
const TTL_MS = FIRST_TOUCH_TTL_DAYS * 24 * 60 * 60 * 1000;

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
export const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid'];
/** Every key a Touch may hold, in display order. */
export const TOUCH_KEYS = [...UTM_KEYS, ...CLICK_ID_KEYS, 'referrer_host', 'landing_path', 'captured_at'];

export const CHANNELS = Object.freeze([
  'Paid Search',
  'Paid Social',
  'Social (Meta)',
  'Organic Search',
  'Organic Social',
  'LINE',
  'Email',
  'Referral',
  'Other Campaign',
  'Direct',
]);

/**
 * Value caps. Click ids are long (a gclid is ~100 chars, an fbclid can pass
 * 200), so the cap is generous; it exists to stop a hand-built POST from
 * parking a megabyte on a registration, not to police real values.
 */
const MAX_VALUE = 300;

/**
 * Pages whose referrer is NOT a source: the return leg of a payment.
 * A card 3-D Secure challenge or a PromptPay redirect comes back from the bank
 * or Omise with THEIR host as referrer, and treating that as a Referral would
 * overwrite the campaign that brought the customer, at the exact moment they
 * convert.
 */
const NO_REFERRER_PATHS = ['/registration/payment/', '/masterclass/payment/'];
const IGNORED_REFERRER_HOSTS = ['omise.co', 'omise.net', 'accounts.google.com'];

const SEARCH_HOSTS = [
  'google.', 'bing.com', 'yahoo.', 'duckduckgo.com', 'baidu.com', 'yandex.',
  'ecosia.org', 'naver.com', 'search.brave.com',
];
const SOCIAL_HOSTS = [
  'facebook.com', 'fb.com', 'instagram.com', 'messenger.com', 'threads.net',
  't.co', 'x.com', 'twitter.com', 'linkedin.com', 'lnkd.in',
  'youtube.com', 'youtu.be', 'tiktok.com', 'pinterest.com', 'reddit.com', 'pantip.com',
];
const LINE_HOSTS = ['line.me', 'line.naver.jp'];
const SOCIAL_SOURCES = [
  'facebook', 'fb', 'instagram', 'ig', 'meta', 'messenger', 'threads',
  'twitter', 'x', 'linkedin', 'youtube', 'tiktok', 'pinterest',
];

function hostMatches(host, list) {
  if (!host) return false;
  return list.some((h) =>
    h.endsWith('.')
      // `google.` — any TLD: google.com, google.co.th
      ? host === h.slice(0, -1) || host.startsWith(h) || host.includes(`.${h}`)
      : host === h || host.endsWith(`.${h}`),
  );
}

/**
 * ASCII control characters (U+0000–U+001F, U+007F). Stripped from every value
 * before it is stored or shown: a NUL or an escape sequence in a UTM is never a
 * real campaign name, and the admin card renders these values verbatim.
 */
// eslint-disable-next-line no-control-regex -- matching them is the point
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

function clean(value) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARS, '').trim().slice(0, MAX_VALUE);
}

function hostOf(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Same site: the host the page is being served from, `www.` ignored on both
 * sides (hostOf strips it from the referrer; it is stripped here from ours).
 * That is the WHOLE self list — every other host is external.
 *
 * ── THE CORPORATE SITE IS A REFERRER, ON PURPOSE ─────────────────────────
 * `9expert.co.th` / `www.9expert.co.th` is the company's corporate website, a
 * different site from this one, and the team wants to count the leads it
 * sends. So it is NOT treated as self: a visitor arriving from it is
 * `referrer_host: 9expert.co.th` and classifies as Referral. No other
 * `*.9expert.co.th` host takes part in a payment or login round-trip with this
 * site, so none is listed; the round-trips that do exist (Omise, Google
 * sign-in, the payment-return pages) are excluded above, by name.
 */
function isOwnHost(host, ownHost) {
  const own = String(ownHost ?? '').toLowerCase().replace(/^www\./, '');
  if (!host) return true;
  return host === own;
}

/** Does this touch carry a campaign parameter or a click id? */
export function hasCampaignSignal(touch) {
  if (!touch) return false;
  return [...UTM_KEYS, ...CLICK_ID_KEYS].some((k) => touch[k]);
}

/** A touch that says nothing about a source at all. */
export function isDirectTouch(touch) {
  return !hasCampaignSignal(touch) && !touch?.referrer_host;
}

/**
 * Read one touch off a document load or a soft navigation.
 *
 * `referrer` is passed ONLY for the first read of a document: `document.referrer`
 * does not change on client-side navigation, so reading it again on every
 * route change would re-record the same external referrer on every page.
 *
 * Returns null for pages that must never be a touch (the admin).
 *
 * @param {{ href: string, referrer?: string, ownHost?: string, now?: Date }} input
 */
export function readTouch({ href, referrer = '', ownHost = '', now = new Date() }) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const path = url.pathname || '/';
  if (path === '/admin' || path.startsWith('/admin/')) return null;

  const touch = {};
  for (const key of UTM_KEYS) {
    const v = clean(url.searchParams.get(key));
    if (v) touch[key] = v.toLowerCase();
  }
  for (const key of CLICK_ID_KEYS) {
    const v = clean(url.searchParams.get(key));
    if (v) touch[key] = v;
  }

  const refHost = hostOf(referrer);
  const referrerCounts =
    refHost
    && !isOwnHost(refHost, ownHost || url.hostname)
    && !hostMatches(refHost, IGNORED_REFERRER_HOSTS)
    && !NO_REFERRER_PATHS.some((p) => path.startsWith(p));
  if (referrerCounts) touch.referrer_host = refHost;

  touch.landing_path = clean(path);
  touch.captured_at = now.toISOString();
  return touch;
}

function isExpired(touch, now) {
  const at = Date.parse(touch?.captured_at ?? '');
  return !Number.isFinite(at) || now.getTime() - at > TTL_MS;
}

/**
 * Fold a new touch into the stored state.
 *
 *   first — set when absent or older than the window; otherwise kept.
 *   last  — replaced by any touch with a campaign signal or an external
 *           referrer; replaced by a Direct touch only when absent or expired.
 *
 * Returns the SAME object when nothing changed, so the caller can skip a write.
 *
 * @param {{first?: object, last?: object}|null} state
 * @param {object|null} touch
 */
export function mergeTouch(state, touch, now = new Date()) {
  const prev = state && typeof state === 'object' ? state : {};
  if (!touch) return prev;
  const firstStale = !prev.first || isExpired(prev.first, now);
  const lastStale = !prev.last || isExpired(prev.last, now);
  const replaceLast = !isDirectTouch(touch) || lastStale;
  if (!firstStale && !replaceLast) return prev;
  return {
    first: firstStale ? touch : prev.first,
    last: replaceLast ? touch : prev.last,
  };
}

/**
 * The channel a touch belongs to. Order matters — the first rule that matches
 * wins, from the most specific evidence (an ad click id) to the least (any
 * referrer at all).
 *
 * `fbclid` ALONE is 'Social (Meta)', not 'Paid Social': Meta appends it to
 * organic link clicks as well as to ads, so on its own it proves the visitor
 * came from Meta and nothing about whether we paid. A tagged ad link says
 * `utm_medium=paid_social` and lands in the rule above it.
 */
export function classifyChannel(touch) {
  if (!touch || typeof touch !== 'object') return 'Direct';
  const source = String(touch.utm_source ?? '').toLowerCase();
  const medium = String(touch.utm_medium ?? '').toLowerCase();
  const host = String(touch.referrer_host ?? '').toLowerCase();
  const paidMedium = /^(cpc|ppc|paid|paidsearch|paid_search|paid-search|cpm|display|banner)$/.test(medium);
  const socialSource = SOCIAL_SOURCES.includes(source);

  if (touch.gclid || touch.gbraid || touch.wbraid) return 'Paid Search';
  if (/^(paid_social|paidsocial|paid-social|social_paid|social-paid)$/.test(medium)) return 'Paid Social';
  if (paidMedium && socialSource) return 'Paid Social';
  if (paidMedium) return 'Paid Search';
  if (medium === 'email' || medium === 'e-mail' || source === 'newsletter' || source === 'email') return 'Email';
  if (source === 'line' || /^line(_oa)?$/.test(medium) || hostMatches(host, LINE_HOSTS)) return 'LINE';
  if (touch.fbclid && !medium) return 'Social (Meta)';
  if (/^(social|organic_social|social-network|social_network|sm)$/.test(medium) || (socialSource && !medium)) {
    return 'Organic Social';
  }
  if (medium === 'organic') return 'Organic Search';
  if (medium === 'referral') return 'Referral';
  if (source || medium || touch.utm_campaign) return 'Other Campaign';
  if (hostMatches(host, SOCIAL_HOSTS)) return 'Organic Social';
  if (hostMatches(host, SEARCH_HOSTS)) return 'Organic Search';
  if (host) return 'Referral';
  return 'Direct';
}

/**
 * How far ahead of the server clock a `captured_at` may be. A few minutes covers
 * a visitor's clock running fast; anything later is not a time the visit could
 * have happened, and is dropped rather than stored.
 */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function sanitizeTouch(raw, now) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const key of TOUCH_KEYS) {
    if (key === 'captured_at') continue;
    const v = clean(raw[key]);
    if (v) out[key] = v;
  }
  if (out.referrer_host) out.referrer_host = out.referrer_host.toLowerCase();
  const at = Date.parse(typeof raw.captured_at === 'string' ? raw.captured_at : '');
  if (Number.isFinite(at) && at <= now.getTime() + MAX_CLOCK_SKEW_MS) out.captured_at = new Date(at);
  return Object.keys(out).length ? out : null;
}

/**
 * The server's ONE entry point: whatever the browser sent → what is stored.
 *
 * Only known keys, strings only, control characters stripped, capped, a
 * `captured_at` more than five minutes in the future dropped, and the channel
 * recomputed here — a client-supplied `channel` is ignored. Returns `undefined` when there is
 * nothing usable, so callers spread it conditionally and an untracked
 * registration writes no key at all (the same convention `bundle` and
 * `earlyBird` follow on RegisterPublic).
 *
 * It never throws: attribution is not what the customer came for, and a
 * malformed blob must cost the registration nothing.
 */
export function buildAttribution(raw, now = new Date()) {
  try {
    if (!raw || typeof raw !== 'object') return undefined;
    const first = sanitizeTouch(raw.first, now);
    const last = sanitizeTouch(raw.last, now) ?? first;
    if (!first && !last) return undefined;
    return {
      ...(first ? { first } : {}),
      ...(last ? { last } : {}),
      channel: classifyChannel(last ?? first),
    };
  } catch {
    return undefined;
  }
}

/** `{ attribution }` or `{}` — for spreading straight into a create(). */
export function attributionField(raw) {
  const attribution = buildAttribution(raw);
  return attribution ? { attribution } : {};
}

/**
 * The admin card's rows. One display model for the four detail views, which
 * each render it inside their own card component.
 *
 * Returns null when the record has no attribution (every registration filed
 * before this field existed). The views still render the card for null, with
 * ATTRIBUTION_EMPTY_LABEL as its only content — an absent card would read as a
 * screen that forgot to show the field, not as "nothing was captured".
 *
 * Click ids are reported as PRESENCE only ("มี gclid"). The value identifies
 * one ad click and nobody reading this card needs it.
 */
export const ATTRIBUTION_EMPTY_LABEL = 'ไม่มีข้อมูล (ลงทะเบียนก่อนเริ่มเก็บข้อมูลที่มา)';

export function attributionSummary(attribution) {
  if (!attribution || typeof attribution !== 'object') return null;
  const { first, last } = attribution;
  if (!first && !last) return null;
  const channel = CHANNELS.includes(attribution.channel)
    ? attribution.channel
    : classifyChannel(last ?? first);
  const describe = (t) => {
    if (!t) return '';
    const parts = [t.utm_source, t.utm_medium, t.utm_campaign].filter(Boolean);
    if (parts.length) return parts.join(' / ');
    if (t.gclid || t.gbraid || t.wbraid) return 'Google Ads (auto-tagged)';
    if (t.fbclid) return 'Meta (fbclid)';
    if (t.referrer_host) return t.referrer_host;
    return 'Direct';
  };
  const headline = [channel, last?.utm_source, last?.utm_campaign].filter(Boolean).join(' / ');
  const clickIds = CLICK_ID_KEYS.filter((k) => last?.[k] || first?.[k])
    .map((k) => `มี ${k}`)
    .join(', ');
  return {
    headline,
    channel,
    rows: [
      { label: 'ช่องทาง', value: channel },
      { label: 'Last touch', value: describe(last) },
      { label: 'Last touch landing', value: last?.landing_path ?? '' },
      { label: 'Last touch at', value: last?.captured_at ?? '', isDate: true },
      { label: 'First touch', value: describe(first) },
      { label: 'First touch landing', value: first?.landing_path ?? '' },
      { label: 'First touch at', value: first?.captured_at ?? '', isDate: true },
      ...(last?.utm_content || last?.utm_term
        ? [{ label: 'Content / Term', value: [last.utm_content, last.utm_term].filter(Boolean).join(' / ') }]
        : []),
      ...(clickIds ? [{ label: 'Click ID', value: clickIds }] : []),
    ],
  };
}
