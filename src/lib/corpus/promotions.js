/**
 * The promotions corpus: every promotion genesis is selling RIGHT NOW, as data,
 * for the chat agent. Read-only. Serves what docs/promotions-corpus-phase-a.md
 * measured, under the decisions recorded in docs/promotions-corpus-endpoint.md.
 *
 * ── THREE SOURCES, THREE EXISTING PREDICATES ───────────────────────────────
 * "Is it live?" is answered by the same functions the site answers it with —
 * imported, never re-implemented — so the corpus cannot say a deal is on while
 * the page says it is over:
 *
 *   masterclass         resolveBatchPrice(batch, now).is_early_bird
 *                       ∧ batch.status ∈ {open, full} ∧ course.is_published
 *   builder_page        isPubliclyVisible(page, now); early_bird pages add
 *                       earlyBirdIsActive (the min-of-two deadline); bundle
 *                       pages add content.registrationOpen per section
 *   early_bird_config   deadline != null ∧ deadline > now — and NOTHING ELSE.
 *                       `is_active` is reported on the item and is never a
 *                       filter: at measurement three rows carried
 *                       `is_active: true` with deadlines 110/35/2 days past.
 *
 * NOT served: the MSDB mirror (`promotions`, the bot reads MSDB directly and
 * the mirror's `is_active` is all-false) and `custom_pages` (the one row is
 * `yearly-promotion`, which the bot already has from MSDB, with no price).
 *
 * ── ONE CLOCK ──────────────────────────────────────────────────────────────
 * `now` is captured once per call and threaded into every predicate, then
 * returned as `generated_at`, so the response can say exactly which instant
 * each item was judged against. There is no module-level cache: a deadline
 * that passes between two calls is honoured by the second call.
 *
 * ── FAILURE ISOLATION ──────────────────────────────────────────────────────
 * Each source is read and mapped inside its own try. A source that throws is
 * logged, contributes no items, and is named as failed in `sources`, so a
 * partial response never looks complete.
 *
 * ── THE JOIN THAT MUST NOT BE BY SLUG ──────────────────────────────────────
 * `masterclass_batches.course_slug` is a denormalised copy and it is STALE on
 * the live data (`ai-content` where the course is `mas-ai-dmc`). The course is
 * resolved by `course_id` ObjectId only, and the URL is built from the COURSE's
 * slug. `course_slug` on the batch is not read anywhere in this module.
 *
 * Every read is injectable (`deps`) for the test tier, as pickerOptions.js
 * carries its own and for the same reason: which rows come out is not
 * observable from source text. Production callers pass nothing.
 */
import { isPubliclyVisible } from '@/lib/pageBuilder/visibility';
import { isPromotionPage, publicPageHref } from '@/lib/pages/promotionMode';
import {
  earlyBirdDeadline,
  earlyBirdIsActive,
  hasEarlyBirdBinding,
} from '@/lib/earlyBird/pageWriteThrough';
import { resolveBatchPrice } from '@/lib/masterclass/getMasterclass';

/** Every item's URL is on the main site host — the masterclass pages included. */
export const CORPUS_PUBLIC_ORIGIN = 'https://www.9experttraining.com';

export const CORPUS_SOURCES = Object.freeze(['masterclass', 'builder_page', 'early_bird_config']);

export const TIMEZONE_NOTE =
  'all instants are UTC ISO-8601; deadlines are end-of-day Asia/Bangkok unless noted';

// ── Small normalisers ──────────────────────────────────────────────────────
// Every field a consumer reads is one of: an ISO instant or null, a finite
// number or null, a trimmed non-empty string or null, or an array. Absent,
// null, '' and NaN all become null so the contract has ONE spelling of
// "no data".

const str = (v) => String(v ?? '').trim();
const text = (v) => (str(v) === '' ? null : str(v));

function ms(value) {
  if (value == null || value === '') return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}
const iso = (value) => (ms(value) === null ? null : new Date(ms(value)).toISOString());
const day = (value) => (ms(value) === null ? null : new Date(ms(value)).toISOString().slice(0, 10));

function num(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Whole-percent discount, or null when either side is unknown or the "special" is not a discount. */
export function discountPct(normal, special) {
  const n = num(normal);
  const s = num(special);
  if (n === null || s === null || n <= 0 || s > n) return null;
  return Math.round((1 - s / n) * 100);
}

function price(normal, special) {
  return { normal: num(normal), special: num(special), currency: 'THB', discount_pct: discountPct(normal, special) };
}

function course({ course_code, title, schedule_id, dates, time, venue } = {}) {
  return {
    course_code: text(course_code),
    title:       text(title),
    schedule_id: text(schedule_id),
    dates:       Array.isArray(dates) ? dates.filter(Boolean) : [],
    time:        text(time),
    venue:       text(venue),
  };
}

/** The public URL of a builder page, or null when the site would not link it either. */
function pageUrl(page, now) {
  const href = publicPageHref(page, now);
  return href ? `${CORPUS_PUBLIC_ORIGIN}${href}` : null;
}

// ── Per-source mappers (pure; each takes rows + the ONE `now`) ─────────────

/**
 * masterclass_batches ⋈ masterclass_courses by `course_id` ObjectId.
 * No `seats`: `registered_count` has two maintenance schemes and is not
 * trustworthy enough to answer "how many left" with — the field is ABSENT,
 * not null, so a consumer cannot mistake "unknown" for "none left".
 */
export function masterclassItems({ batches = [], courses = [] } = {}, now) {
  const byId = new Map(courses.map((c) => [str(c._id), c]));
  const items = [];
  for (const b of batches) {
    if (!['open', 'full'].includes(b?.status)) continue;
    const c = byId.get(str(b.course_id)); // ObjectId join — `course_slug` is stale and unused
    if (!c || c.is_published !== true) continue;
    const p = resolveBatchPrice(b, now);
    if (!p.is_early_bird) continue;

    const label = text(b.batch_label) ?? `รุ่นที่ ${b.batch_no}`;
    items.push({
      id:         `masterclass:${str(b._id)}`,
      kind:       'early_bird',
      source:     'masterclass',
      title:      `${str(c.title_th)} — ${label}`,
      url:        `${CORPUS_PUBLIC_ORIGIN}/masterclass/${str(c.slug)}`,
      // No start is stored on a batch; its creation is the earliest it could have been on sale.
      live_from:  iso(b.createdAt),
      live_until: iso(b.early_bird_deadline),
      is_live:    true,
      price:      price(b.price_normal, b.price_early_bird),
      courses: [
        course({
          course_code: c.course_code,
          title:       c.title_th,
          schedule_id: null,
          dates:       (b.dates ?? []).map((d) => day(d?.date)).filter(Boolean),
          time:        c.time_start && c.time_end ? `${c.time_start}–${c.time_end}` : null,
          venue:       b.venue_name,
        }),
      ],
      bundle:      null,
      description: text(c.subtitle_th),
    });
  }
  return items;
}

/**
 * page_builder_pages with pageType 'promotion', gated by the shared
 * visibility predicate. One item per page for kinds `early_bird` and `none`
 * (served as kind `page`); one item PER OPEN BUNDLE SECTION for kind `bundle`.
 *
 * `price.normal` is null for an early-bird page: the binding stores the
 * special price only, and the list price lives in typed prose. That join is a
 * later round and is not invented here.
 */
export function builderPageItems(pages = [], now) {
  const items = [];
  for (const page of pages) {
    if (!isPromotionPage(page) || !isPubliclyVisible(page, now)) continue;
    const url = pageUrl(page, now);
    const base = {
      source:     'builder_page',
      title:      text(page.title) ?? str(page.slug),
      url,
      live_from:  iso(page.publishStartDate),
      live_until: iso(page.publishEndDate),
      is_live:    true,
      bundle:     null,
      description: null,
    };

    if (page.promotionKind === 'early_bird' && hasEarlyBirdBinding(page)) {
      if (!earlyBirdIsActive(page, now)) continue;
      const eb = page.earlyBird ?? {};
      items.push({
        id:   `builder_page:${str(page._id)}`,
        kind: 'early_bird',
        ...base,
        live_until: iso(earlyBirdDeadline(eb, page)), // the min-of-two rule, not the page window alone
        price:      price(null, eb.specialPrice),
        courses:    [course({ course_code: eb.courseCode, schedule_id: eb.scheduleId })],
      });
      continue;
    }

    if (page.promotionKind === 'bundle') {
      for (const section of page.sections ?? []) {
        if (section?.type !== 'promotion_bundle') continue;
        const content = section.content ?? {};
        if (content.registrationOpen !== true) continue;
        items.push({
          id:    `builder_page:${str(page._id)}:${str(section.id)}`,
          kind:  'bundle',
          ...base,
          title: text(content.name) ?? base.title,
          price: price(content.listPrice, content.netPrice),
          courses: (content.items ?? []).map((it) =>
            course({
              course_code: it?.courseId,
              schedule_id: it?.roundId,
              dates:       it?.roundSnapshot?.dates ?? [],
            })
          ),
          bundle: {
            label:             text(content.label),
            list_price:        num(content.listPrice),
            net_price:         num(content.netPrice),
            discount_code:     text(content.discountCode),
            registration_open: true,
          },
          description: text(content.blurb),
        });
      }
      continue;
    }

    // `none` (and an early_bird kind with no binding yet — a half-filled form
    // is a page, not a price): the page is live, and that is all we know.
    items.push({
      id:      `builder_page:${str(page._id)}`,
      kind:    'page',
      ...base,
      price:   price(null, null),
      courses: [],
    });
  }
  return items;
}

/**
 * early_bird_configs — deadline in the future, and nothing else.
 *
 * `pages` is the same builder read the page items came from: a row's
 * `owner_page_id` resolves against it for the URL (null when the page is not
 * publicly linkable — NO fallback to a legacy `promotion_id` slug), and a row
 * whose owning page was ALREADY served as a builder early-bird item is skipped,
 * because the page item carries every field the row does plus a title and a
 * URL; two items for one deal would be the corpus disagreeing with itself.
 */
export function earlyBirdConfigItems(rows = [], { pages = [], now, servedPageIds = new Set() } = {}) {
  const nowMs = ms(now);
  const byId = new Map(pages.map((p) => [str(p._id), p]));
  const items = [];
  for (const row of rows) {
    const deadline = ms(row?.deadline);
    if (deadline === null || deadline <= nowMs) continue; // `is_active` is deliberately not consulted
    const owner = byId.get(str(row.owner_page_id)) ?? null;
    if (owner && servedPageIds.has(str(owner._id))) continue;
    items.push({
      id:         `early_bird_config:${str(row._id)}`,
      kind:       'early_bird',
      source:     'early_bird_config',
      title:      `${text(row.label_th) ?? 'Early Bird'} — ${str(row.course_id)}`,
      url:        owner ? pageUrl(owner, now) : null,
      live_from:  null,
      live_until: iso(row.deadline),
      is_live:    true,
      is_active:  row.is_active === true, // informational only — see the header
      price:      price(null, row.special_price),
      courses:    [course({ course_code: row.course_id, schedule_id: row.schedule_id })],
      bundle:      null,
      description: null,
    });
  }
  return items;
}

/**
 * Deterministic order: soonest `live_until` first (null — no deadline — last),
 * then `id` ascending. Two calls with the same data give the same bytes.
 */
export function sortItems(items) {
  return [...items].sort((a, b) => {
    const ua = ms(a.live_until);
    const ub = ms(b.live_until);
    if (ua !== ub) {
      if (ua === null) return 1;
      if (ub === null) return -1;
      return ua - ub;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ── Default readers (the only code here that touches Mongo) ────────────────
// Projections name exactly what the mappers read. The builder read deliberately
// excludes `draft`, which holds the unpublished content surface — the same
// discipline getActiveBuilderPromotions documents.

async function readMasterclassRows() {
  const { dbConnect } = await import('@/lib/db/connect');
  const MasterclassBatch = (await import('@/models/MasterclassBatch')).default;
  const MasterclassCourse = (await import('@/models/MasterclassCourse')).default;
  await dbConnect();
  const [batches, courses] = await Promise.all([
    MasterclassBatch.find({ status: { $in: ['open', 'full'] } })
      .select('course_id batch_no batch_label dates venue_name price_normal price_early_bird early_bird_deadline early_bird_active status createdAt')
      .lean(),
    MasterclassCourse.find({ is_published: true })
      .select('slug course_code title_th subtitle_th time_start time_end is_published')
      .lean(),
  ]);
  return { batches, courses };
}

async function readBuilderPageRows() {
  const { dbConnect } = await import('@/lib/db/connect');
  const PageBuilder = (await import('@/models/PageBuilder')).default;
  await dbConnect();
  return PageBuilder.find({
    pageType: 'promotion',
    status: { $in: ['published', 'scheduled'] },
  })
    .select('slug title pageType status promotionKind earlyBird sections publishStartDate publishEndDate createdAt')
    .lean();
}

async function readEarlyBirdConfigRows() {
  const { dbConnect } = await import('@/lib/db/connect');
  const EarlyBirdConfig = (await import('@/models/EarlyBirdConfig')).default;
  await dbConnect();
  return EarlyBirdConfig.find({ deadline: { $ne: null } })
    .select('course_id owner_page_id schedule_id label_th special_price deadline is_active')
    .lean();
}

// ── The corpus ─────────────────────────────────────────────────────────────

/**
 * @param {object} [deps]
 * @param {Date}     [deps.now]                  the ONE instant; defaults to the call time
 * @param {Function} [deps.readMasterclass]      () → { batches, courses }
 * @param {Function} [deps.readBuilderPages]     () → pages
 * @param {Function} [deps.readEarlyBirdConfigs] () → rows
 * @param {Function} [deps.log]                  server-side sink for a failed source
 */
export async function buildPromotionsCorpus({
  now = new Date(),
  readMasterclass = readMasterclassRows,
  readBuilderPages = readBuilderPageRows,
  readEarlyBirdConfigs = readEarlyBirdConfigRows,
  log = console.error,
} = {}) {
  const at = new Date(ms(now) ?? Date.now());
  const sources = {};
  const items = [];

  const attempt = async (name, fn) => {
    try {
      const out = await fn();
      sources[name] = { ok: true, count: out.length };
      items.push(...out);
      return out;
    } catch (err) {
      log(`[corpus/promotions] source "${name}" failed:`, err);
      sources[name] = { ok: false, count: 0, error: 'read_failed' };
      return [];
    }
  };

  // Builder pages are read once and reused by the early_bird_config mapper, so
  // the URL a config row gets and the item its page became agree by construction.
  let pages = [];
  const pageItems = await attempt('builder_page', async () => {
    pages = await readBuilderPages();
    return builderPageItems(pages, at);
  });
  const servedPageIds = new Set(
    pageItems.filter((i) => i.kind === 'early_bird').map((i) => i.id.slice('builder_page:'.length))
  );

  await attempt('masterclass', async () => masterclassItems(await readMasterclass(), at));
  await attempt('early_bird_config', async () =>
    earlyBirdConfigItems(await readEarlyBirdConfigs(), { pages, now: at, servedPageIds })
  );

  return {
    generated_at:  at.toISOString(),
    timezone_note: TIMEZONE_NOTE,
    sources:       Object.fromEntries(CORPUS_SOURCES.map((s) => [s, sources[s]])),
    items:         sortItems(items),
  };
}
