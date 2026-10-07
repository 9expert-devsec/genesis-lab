import { bangkokDate } from '@/lib/consentStats';

/**
 * The anonymous daily article view counter — the pure half, shared by the
 * endpoint (src/app/api/articles/view/route.js) and the client beacon
 * (ArticleViewBeacon). No imports beyond a date helper: the beacon ships this
 * module to the browser.
 *
 * `article_views` is read by /admin/article-views (lib/articleViews/queries.js).
 */

/** A real body is `{"id":"<24 hex>"}` — 33 bytes. 1 KB is generous and cheap to check. */
export const MAX_VIEW_BODY_BYTES = 1024;

/**
 * The counting day, 'YYYY-MM-DD' in Asia/Bangkok — the same function the
 * consent counter uses, so both collections roll over at the same midnight.
 */
export const viewDay = bangkokDate;

/**
 * Crawlers, link-preview fetchers, headless browsers and scripted HTTP
 * clients. ONE regex for the endpoint; the beacon additionally skips when
 * `navigator.webdriver` is set. Case-insensitive, matched anywhere in the UA.
 *
 * Not a security boundary — anyone can send any UA. It keeps honest automation
 * (search engines, social previews, uptime checks, our own headless tooling)
 * out of the numbers.
 *
 * DELIBERATELY ABSENT: in-app browsers. LINE (`Line/13.x`), Facebook
 * (`FBAN/FBAV`) and Instagram open the page for a real reader and are a large
 * share of Thai traffic. The generic `bot` pattern is word-bounded or followed
 * by `/` for the same reason — a bare substring would also drop phone models
 * such as "Cubot".
 */
export const BOT_UA_RE = new RegExp(
  [
    '\\bbot\\b', '[a-z]bot/', 'crawl', 'spider', 'slurp',
    'googlebot', 'bingbot', 'google-inspectiontool', 'googleother', 'mediapartners-google',
    'facebookexternalhit', 'facebookcatalog', 'meta-externalagent', 'meta-externalfetcher',
    'twitterbot', 'linkedinbot', 'slackbot', 'discordbot', 'telegrambot', 'whatsapp/',
    'headlesschrome', 'phantomjs', 'puppeteer', 'playwright', 'lighthouse', 'pagespeed',
    'vercel-screenshot', 'vercelbot', 'vercel-favicon',
    'curl/', 'wget/', 'python-requests', 'python-urllib', 'aiohttp', 'httpx',
    'go-http-client', 'node-fetch', 'undici', 'axios/', 'okhttp', 'java/', 'libwww-perl',
    'postmanruntime', 'insomnia',
    'gptbot', 'chatgpt-user', 'claudebot', 'claude-web', 'anthropic-ai', 'perplexitybot',
    'bytespider', 'amazonbot', 'applebot', 'yandex', 'baiduspider', 'duckduckbot', 'petalbot',
    'ahrefs', 'semrush', 'mj12bot', 'dotbot', 'uptimerobot', 'pingdom',
  ].join('|'),
  'i',
);

/** A missing or empty UA is treated as automation: every real browser sends one. */
export function isBotUserAgent(ua) {
  const s = String(ua ?? '').trim();
  return s === '' || BOT_UA_RE.test(s);
}

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

/**
 * The request body → the article id, or null. Strict: an object with a 24-hex
 * `id` string. The id, not the slug — Thai slugs have broken encoding before,
 * and an ObjectId needs no normalising.
 */
export function parseViewBody(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_VIEW_BODY_BYTES) return null;
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return typeof body.id === 'string' && OBJECT_ID_RE.test(body.id) ? body.id.toLowerCase() : null;
}

/**
 * Is this a live, published article — i.e. not a draft? Same definition as
 * buildJsonLd: active AND a publishedAt. A draft render never counts.
 */
export function isCountableArticle(article) {
  return Boolean(article?._id && article.active && article.publishedAt);
}

/**
 * Count only on the production deployment. Dev, preview and production share
 * one database, and only production traffic is real readership.
 *
 * @param {object} env  process.env (server-side; VERCEL_ENV is set by Vercel)
 */
export function isCountingEnabled(env) {
  return env?.VERCEL_ENV === 'production';
}

/** The per-tab dedupe key the beacon keeps in sessionStorage. */
export function viewSessionKey(id, day) {
  return `av:${id}:${day}`;
}
