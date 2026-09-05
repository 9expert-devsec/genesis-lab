'use server';

import { dbConnect } from '@/lib/db/connect';
import RegisterPublic  from '@/models/RegisterPublic';
import RegisterInhouse from '@/models/RegisterInhouse';
import Banner          from '@/models/Banner';
import Promotion       from '@/models/Promotion';
import Article         from '@/models/Article';
import FeaturedReview  from '@/models/FeaturedReview';
import Recruit         from '@/models/Recruit';
import { requireAdmin } from '@/lib/actions/auth';
// ══ THE SAME TWO RULES /admin/registrations COUNTS BY ═════════════════════
// Imported, never restated. This screen and that one must not disagree about
// how many registrations exist, and the only way to guarantee that is for both
// to group by the same key and collapse a request with the same precedence.
import { REQUEST_KEY_EXPR } from '@/lib/registrations/foldRequests';
import { requestStatusExpr } from '@/lib/registrations/requestStatus';
import {
  buildStatusLabels,
  INHOUSE_STATUS_VALUES,
  storedValuesForFilter,
} from '@/lib/registrations/statuses';

function serialize(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

/**
 * The public status labels for the donut, DERIVED.
 *
 * The chart colours live below because they are this chart's business and
 * belong to no other consumer; the LABELS are the shared vocabulary and are
 * not respelled here. 'ยืนยันแล้ว' had four copies across the admin and the
 * dashboard was one of them.
 */
const PUBLIC_STATUS_LABEL = buildStatusLabels();

/**
 * Compute the [start, end] Date range from a range key.
 * @param {'today'|'week'|'month'|'all'} range
 * @returns {{ from: Date|null, to: Date }}
 */
function dateRange(range) {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  if (range === 'today') {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (range === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }
  if (range === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { from, to };
  }
  // 'all' — no start constraint
  return { from: null, to };
}

/**
 * Fetch all dashboard metrics in a single server action.
 * @param {'today'|'week'|'month'|'all'} range - date filter for registration counts
 */
export async function getDashboardMetrics(range = 'today') {
  await requireAdmin('dashboard');
  await dbConnect();

  const { from, to } = dateRange(range);
  const dateFilter = from ? { createdAt: { $gte: from, $lte: to } } : {};

  // ── Registration counts ────────────────────────────────────────
  /**
   * ══ THE PUBLIC NUMBERS COUNT REQUESTS, NOT LEGS ═══════════════════════════
   *
   * They counted legs until this commit, and a three-course bundle added three
   * to the total, three to the donut and three to the seven-day trend.
   *
   * THE RULE IS THAT THE TWO SCREENS MUST NOT DISAGREE. /admin/registrations
   * shows one row per request and every number on it counts requests; a
   * dashboard total differing from the list header by the number of bundle
   * legs, with nothing on either screen explaining which is right, is the
   * silent-wrong-number class this project keeps removing. It does not matter
   * which of the two is "correct" if they differ.
   *
   * ── SAME KEY, SAME PRECEDENCE, NOT A SECOND COPY ────────────────────────
   * `REQUEST_KEY_EXPR` and `requestStatusExpr` are imported from the same two
   * modules the list and its cards read. A dashboard that grouped by a
   * hand-written `$ifNull` here would agree today and drift the first time the
   * precedence changed.
   *
   * ── WHAT WOULD KEEP LEGS ────────────────────────────────────────────────
   * Anything about SEATS OR ROOMS: a bundle's three legs are three different
   * rooms on three different days and that person is expected in each. There is
   * no such metric on this screen — the seat count lives on the schedules round
   * panel, which reads `find({classId})` and is labelled there. If one is ever
   * added here it keeps legs and says so in its own label.
   */
  const publicByStatus = await RegisterPublic.aggregate([
    { $match: dateFilter },
    { $group: { _id: REQUEST_KEY_EXPR, statuses: { $addToSet: '$status' } } },
    { $group: { _id: requestStatusExpr('$statuses'), n: { $sum: 1 } } },
  ]);

  const publicTally = new Map(publicByStatus.map((r) => [String(r._id ?? ''), r.n]));
  // EVERY bucket reaches the total, including a status the vocabulary does not
  // know — so the donut can sum to less than the total and never to more.
  const publicTotal     = publicByStatus.reduce((sum, r) => sum + r.n, 0);
  const publicPending   = publicTally.get('pending')   ?? 0;
  const publicConfirmed = publicTally.get('confirmed') ?? 0;
  const publicPaid      = publicTally.get('paid')      ?? 0;
  const publicCancelled = publicTally.get('cancelled') ?? 0;

  const [
    inhouseTotal,
    inhousePending,
    inhouseQuoted,
    inhouseCancelled,
  ] = await Promise.all([
    RegisterInhouse.countDocuments(dateFilter),
    /**
     * THE THREE LIVE IN-HOUSE STATUSES, matched through `storedValuesForFilter`.
     *
     * These were `status: 'new'`, `'contacted'` and `'closed-won'` — three
     * values round 2 retired. Left as they were, all three cards would read 0
     * against a non-zero total the moment the migration ran, and the two cards
     * `new`/`closed-won` link to would filter to nothing.
     *
     * The widening handles the OTHER side of the same window: before --apply
     * the documents still hold the retired values, and a bare `status:
     * 'pending'` would find none of them. Either way the cards agree with the
     * total. See storedValuesForFilter in lib/registrations/statuses.js.
     */
    ...INHOUSE_STATUS_VALUES.map((value) =>
      RegisterInhouse.countDocuments({ ...dateFilter, status: { $in: storedValuesForFilter(value, 'inhouse') } })
    ),
  ]);

  // ── Content counts (live/active — not date-filtered) ──────────
  const [
    activeBanners,
    activePromotions,
    activeArticles,
    activeReviews,
    activeRecruits,
  ] = await Promise.all([
    Banner.countDocuments({ active: true }),
    Promotion.countDocuments({ is_active: true }),
    Article.countDocuments({ active: true }),
    FeaturedReview.countDocuments({ active: true }),
    Recruit.countDocuments({ active: true }),
  ]);

  // ── 7-day registrations trend (Public) — always last 7 days ──
  // Returns array of { date: 'YYYY-MM-DD', count: number } for the chart
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const trendAgg = await RegisterPublic.aggregate([
    { $match: { createdAt: { $gte: sevenDaysAgo } } },
    /**
     * REQUESTS PER DAY, not legs. Without this stage a customer who bought a
     * three-course package on Tuesday puts a bar of three on Tuesday — the
     * chart would report a busy day that was one enquiry.
     *
     * `$min` because the legs of one request are written inside a single
     * transaction milliseconds apart: the request happened when the FIRST leg
     * landed, and taking any other one could push a request submitted at
     * 23:59:59.9 into the following day.
     */
    { $group: { _id: REQUEST_KEY_EXPR, createdAt: { $min: '$createdAt' } } },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+07:00' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fill in missing days with 0
  const trendMap = Object.fromEntries(trendAgg.map((r) => [r._id, r.count]));
  const trend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    return { date: key, count: trendMap[key] ?? 0 };
  });

  // ── Status distribution for pie/donut (Public, range-filtered) ─
  const statusDist = [
    { status: 'pending',   label: PUBLIC_STATUS_LABEL.pending,   count: publicPending,   color: '#f59e0b' },
    { status: 'confirmed', label: PUBLIC_STATUS_LABEL.confirmed, count: publicConfirmed, color: '#3b82f6' },
    { status: 'paid',      label: PUBLIC_STATUS_LABEL.paid,      count: publicPaid,      color: '#10b981' },
    { status: 'cancelled', label: PUBLIC_STATUS_LABEL.cancelled, count: publicCancelled, color: '#94a3b8' },
  ];

  return serialize({
    range,
    public: {
      total: publicTotal,
      pending: publicPending,
      confirmed: publicConfirmed,
      paid: publicPaid,
      cancelled: publicCancelled,
    },
    /**
     * KEYED BY THE STORED VALUE, like the public block above and like the
     * summary strip. The old keys were `new` / `contacted` / `closedWon` — one
     * of them camelCase against a hyphenated filter value, which is exactly the
     * bridge-spelling that once made a card render 0 forever on the list
     * screen. There is one spelling now, and it is the one in the URL.
     */
    inhouse: {
      total: inhouseTotal,
      pending: inhousePending,
      quoted: inhouseQuoted,
      cancelled: inhouseCancelled,
    },
    content: {
      banners: activeBanners,
      promotions: activePromotions,
      articles: activeArticles,
      reviews: activeReviews,
      recruits: activeRecruits,
    },
    trend,         // [{date, count}] last 7 days
    statusDist,    // [{status, label, count, color}]
  });
}