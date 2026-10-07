/**
 * /admin/article-views — the pure half. No DB, no request objects: the page
 * reads `article_views` and `articles` through lib/articleViews/queries.js and
 * hands the results here; everything it renders is decided in this file.
 *
 * ── NULL IS "NOT COLLECTING YET", ZERO IS A REAL ZERO ───────────────────────
 * Counting started on one day (the earliest `day` in article_views, queried —
 * never hardcoded). A day ON/AFTER that start with no row is a day nobody
 * opened the article: 0. A day BEFORE it is a day we were not counting: null,
 * never 0 — drawing it as zero would claim "nobody read anything" about a time
 * we know nothing about.
 *
 * ── LEFT JOIN FROM THE ARTICLE SIDE ─────────────────────────────────────────
 * The table, the KPIs and the per-skill bars all start from the FILTERED
 * ARTICLE LIST and look up views, so an article nobody opened appears with 0.
 * Views of an article that no longer exists are not counted anywhere.
 */
import { addDays, daySpan, eachDay } from '@/lib/admin/dateRange';

/**
 * "Popular but stale" — the criterion.
 *
 * First-cut criterion agreed 2026-10-07; expected to be revised. The on-page
 * explanation is generated from these constants — change them here only.
 */
export const STALE_TOP_PERCENT = 20;
export const STALE_MONTHS = 12;

export const ARTICLE_VIEWS_PAGE_SIZE = 25;
export const NO_SKILL_LABEL = 'ไม่มี skill';

const get = (m, k) => (m instanceof Map ? m.get(k) : m?.[k]);

/**
 * One value per day from `from` to `to`, oldest first: null before
 * `collectionStart` (or everywhere when nothing was ever collected), else the
 * day's total or 0.
 *
 * @param {Map<string,number>|object} dayTotals  day → count
 * @returns {Array<{ day: string, value: number|null }>}
 */
export function buildDailySeries({ from, to, collectionStart, dayTotals }) {
  return eachDay(from, to).map((day) => ({
    day,
    value: !collectionStart || day < collectionStart ? null : Number(get(dayTotals, day)) || 0,
  }));
}

/**
 * The x-domain start for a per-row sparkline: the later of the range start
 * and the collection start, so days that were never counted do not squash
 * the real data into a sliver at the right edge. Returns `from` when nothing
 * was ever collected; a start after `to` yields an empty domain.
 */
export function sparklineFrom(from, collectionStart) {
  return collectionStart && collectionStart > from ? collectionStart : from;
}

/** Index of the first collected day in a series from buildDailySeries (-1: none). */
export function firstCollectedIndex(series) {
  return series.findIndex((p) => p.value !== null);
}

/**
 * The filtered articles with their view totals for the range. Every article
 * is kept (0 when it has no row) — the LEFT JOIN.
 *
 * @param {object[]} articles  lean Article docs
 * @param {Map<string,number>|object} totals  articleId (string) → views
 */
export function mergeArticleViews(articles, totals) {
  return (articles ?? []).map((a) => {
    const id = String(a._id);
    return { ...a, id, views: Number(get(totals, id)) || 0 };
  });
}

/** The equal-length period immediately before [from, to]. */
export function previousPeriod({ from, to }) {
  const len = daySpan(from, to);
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

/**
 * Whether the previous period is comparable: it must lie FULLY on/after the
 * collection start. A period that straddles the start would compare a full
 * range against a partly-uncounted one and report growth that is just the
 * counter switching on.
 */
export function isPreviousAvailable(prev, collectionStart) {
  return Boolean(collectionStart) && prev.from >= collectionStart;
}

/**
 * The four KPI cards.
 *
 * @param {object[]} rows             mergeArticleViews output (the filtered set)
 * @param {Array}    series           buildDailySeries output for the same set
 * @param {number}   previousTotal    views in the previous period, same set
 * @param {boolean}  previousAvailable see isPreviousAvailable
 */
export function computeKpis({ rows, series, previousTotal, previousAvailable }) {
  const total = rows.reduce((s, r) => s + r.views, 0);
  const withViews = rows.filter((r) => r.views > 0).length;

  const collected = series.filter((p) => p.value !== null);
  const avgPerDay = collected.length ? total / collected.length : null;

  let peak = null;
  for (const p of collected) {
    if (p.value > 0 && (!peak || p.value > peak.value)) peak = { day: p.day, value: p.value };
  }

  let deltaPct = null;
  if (previousAvailable && previousTotal > 0) {
    deltaPct = ((total - previousTotal) / previousTotal) * 100;
  }

  return {
    total,
    previousAvailable: Boolean(previousAvailable),
    previousTotal: previousAvailable ? previousTotal : null,
    deltaPct,
    withViews,
    articleCount: rows.length,
    zeroCount: rows.length - withViews,
    avgPerDay,
    peak,
  };
}

/**
 * Views per skill over a set of rows (the page passes the set filtered by
 * everything EXCEPT the skill filter). An article with several skills counts
 * toward each, so the bars sum to more than the real total. Articles with no
 * skill go to one NO_SKILL_LABEL bucket, always last.
 *
 * @param {object} names  skill_id → display name; an unresolved id shows as itself
 * @returns {Array<{ id: string|null, name: string, value: number }>}
 */
export function skillTotals(rows, names = {}) {
  const sums = new Map();
  let none = 0;
  let noneArticles = 0;
  for (const r of rows ?? []) {
    const ids = [...new Set((r.skills ?? []).map(String).filter(Boolean))];
    if (ids.length === 0) {
      none += r.views;
      noneArticles += 1;
      continue;
    }
    for (const id of ids) sums.set(id, (sums.get(id) ?? 0) + r.views);
  }
  const items = [...sums]
    .map(([id, value]) => ({ id, name: names?.[id] ?? id, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'th'));
  if (noneArticles > 0) items.push({ id: null, name: NO_SKILL_LABEL, value: none });
  return items;
}

/**
 * contentUpdatedAt ONLY — no fallback. For the table's "แก้เนื้อหาล่าสุด"
 * column and its sort: the field has only been written since 2026-10-06, so an
 * article without it has not had a content edit SINCE THEN, which is a
 * different fact from "last edited on its publish date".
 */
export function contentUpdatedDate(article) {
  const v = article?.contentUpdatedAt;
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The date the article's content last changed: contentUpdatedAt, else
 * publishedAt. Used ONLY by the "popular but stale" criterion — the fallback
 * there is a separate decision, kept as-is pending the publishedAt survey.
 */
export function lastContentDate(article) {
  const v = article?.contentUpdatedAt ?? article?.publishedAt;
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `now` minus `months` calendar months. */
export function monthsBefore(now, months) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/**
 * "Popular but stale": among articles with views > 0, those ranked in the top
 * STALE_TOP_PERCENT by views (rounded up, so there is always at least one
 * candidate when anything was read) whose last content date is STRICTLY older
 * than STALE_MONTHS months. An article with no date at all is not judged.
 * Sorted by views, highest first.
 */
export function staleArticles(rows, now = new Date()) {
  const viewed = (rows ?? [])
    .filter((r) => r.views > 0)
    .sort((a, b) => b.views - a.views || String(a.title).localeCompare(String(b.title), 'th'));
  const topN = Math.ceil((viewed.length * STALE_TOP_PERCENT) / 100);
  const cutoff = monthsBefore(now, STALE_MONTHS);
  return viewed
    .slice(0, topN)
    .map((r) => ({ ...r, contentDate: lastContentDate(r) }))
    .filter((r) => r.contentDate && r.contentDate < cutoff);
}

/** The on-page explanation — generated from the constants, never written by hand. */
export function staleExplanation() {
  return (
    `บทความที่ยอดเปิดอ่านอยู่ใน ${STALE_TOP_PERCENT}% แรกของบทความที่มีคนอ่านในช่วงนี้ ` +
    `แต่เนื้อหาไม่ได้แก้มานานกว่า ${STALE_MONTHS} เดือน ` +
    '(นับจากวันแก้เนื้อหาล่าสุด หรือวันเผยแพร่ถ้ายังไม่เคยแก้)'
  );
}

/** "8 เดือน" / "1 ปี 3 เดือน" — whole months between `date` and `now`. */
export function ageLabel(date, now = new Date()) {
  if (!date) return '—';
  const a = new Date(date);
  const b = new Date(now);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  months = Math.max(0, months);
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} เดือน`;
  return m ? `${y} ปี ${m} เดือน` : `${y} ปี`;
}

// ── URL state ──────────────────────────────────────────────────────────────

export const STATUSES = Object.freeze(['active', 'all', 'hidden']);
export const SORTS = Object.freeze(['views', 'published', 'updated']);

const first = (v) => (Array.isArray(v) ? v[0] : v);
const str = (v) => String(first(v) ?? '').trim();

/**
 * Everything but the date range (lib/admin/dateRange parses that). Unknown
 * values fall back to the defaults rather than erroring.
 */
export function parseDashboardQuery(sp) {
  const status = str(sp?.status);
  const sort = str(sp?.sort);
  const dir = str(sp?.dir);
  return {
    q: str(sp?.q).slice(0, 200),
    skill: str(sp?.skill),
    program: str(sp?.program),
    status: STATUSES.includes(status) ? status : 'active',
    sort: SORTS.includes(sort) ? sort : 'views',
    dir: dir === 'asc' ? 'asc' : 'desc',
    zero: str(sp?.zero) === '1',
    page: Math.max(1, Math.floor(Number(str(sp?.page))) || 1),
    customOpen: str(sp?.range) === 'custom',
  };
}

/**
 * The page URL for a state, defaults omitted. `patch` overrides; pass
 * `page: 1` (or leave it out of the state) to drop pagination.
 */
export function articleViewsHref(state, patch = {}) {
  const s = { ...state, ...patch };
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.skill) p.set('skill', s.skill);
  if (s.program) p.set('program', s.program);
  if (s.status && s.status !== 'active') p.set('status', s.status);
  if (s.from && s.to) {
    p.set('from', s.from);
    p.set('to', s.to);
  } else if (s.customOpen) {
    p.set('range', 'custom');
  } else if (s.range && Number(s.range) !== 30) {
    p.set('range', String(s.range));
  }
  if (s.sort && s.sort !== 'views') p.set('sort', s.sort);
  if (s.dir === 'asc') p.set('dir', 'asc');
  if (s.zero) p.set('zero', '1');
  if (s.page && s.page > 1) p.set('page', String(s.page));
  const qs = p.toString();
  return qs ? `/admin/article-views?${qs}` : '/admin/article-views';
}

/**
 * Table order. Missing dates sort LAST in either direction, so "newest first"
 * never opens with a column of dashes. Ties fall back to title.
 */
export function sortRows(rows, sort = 'views', dir = 'desc') {
  const key = {
    views: (r) => r.views,
    published: (r) => (r.publishedAt ? new Date(r.publishedAt).getTime() : null),
    updated: (r) => contentUpdatedDate(r)?.getTime() ?? null,
  }[sort] ?? ((r) => r.views);
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb !== null) return 1;
    if (kb === null && ka !== null) return -1;
    if (ka !== kb) return (ka - kb) * sign;
    return String(a.title).localeCompare(String(b.title), 'th');
  });
}

/** One page of rows, the page clamped into range. `a`/`b` are 1-based, inclusive. */
export function paginate(rows, page, size = ARTICLE_VIEWS_PAGE_SIZE) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pageCount);
  const start = (p - 1) * size;
  const pageRows = rows.slice(start, start + size);
  return { pageRows, page: p, pageCount, total, a: total ? start + 1 : 0, b: start + pageRows.length };
}
