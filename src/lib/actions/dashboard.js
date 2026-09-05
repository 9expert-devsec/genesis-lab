'use server';

/**
 * The dashboard's one server action — the AUTHORISED WRAPPER.
 *
 * ══ WHAT THIS FILE IS AND IS NOT ════════════════════════════════════════════
 * It owns exactly three things: the guard, the scope resolution, and handing the
 * real mongoose models to the read layer. The reads themselves, the filters and
 * the payload shape live in lib/dashboard/buildMetrics.js — see that file's
 * header for why the models are a parameter there and must never be one here.
 *
 * ── THE SCOPES COME FROM THE SESSION. THERE IS NO OTHER SOURCE. ─────────────
 * `requireAdmin('dashboard')` returns the session it just validated, and
 * `dashboardScopes` reads the page keys off `session.user`. Nothing about which
 * sections run is derived from an argument: this module is `'use server'`, so
 * every parameter it declares is a client-supplied value, and `range` is the
 * only one — a value that can change WHICH ROWS are counted but never WHETHER
 * they are counted. A system-only caller can post any range they like and reach
 * no registration read, because the branch that would run one is decided by
 * `canAccess` on their session before `range` is looked at.
 *
 * ── requirePage('dashboard') IS NOT WEAKENED ────────────────────────────────
 * The scopes NARROW. A caller still needs `dashboard` to get past the guard
 * below; holding `dashboard_registrations` without `dashboard` gets them
 * nothing, because they never reach this function.
 */

import { dbConnect } from '@/lib/db/connect';
import RegisterPublic  from '@/models/RegisterPublic';
import RegisterInhouse from '@/models/RegisterInhouse';
import Banner          from '@/models/Banner';
import Promotion       from '@/models/Promotion';
import Article         from '@/models/Article';
import FeaturedReview  from '@/models/FeaturedReview';
import Recruit         from '@/models/Recruit';
/**
 * Round E3's action queue.
 *
 * `MasterclassRegistration` is the FIRST masterclass figure ever to reach this
 * page — one queue card, no section, no batch seats, no revenue. Round E1
 * measured it as the largest queue in the system (30 pending, 28 of them older
 * than a fortnight) against a dashboard that did not mention masterclass at all.
 *
 * `WebhookLog` serves the system-scope error card and is read ONLY for a caller
 * holding `dashboard_system`.
 */
import MasterclassRegistration from '@/models/MasterclassRegistration';
import WebhookLog              from '@/models/WebhookLog';
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

/** The real models, in the shape buildDashboardMetrics destructures. */
const MODELS = {
  RegisterPublic,
  RegisterInhouse,
  Banner,
  Promotion,
  Article,
  FeaturedReview,
  Recruit,
  MasterclassRegistration,
  WebhookLog,
};

/**
 * Fetch the dashboard metrics the caller is authorised to see.
 *
 * ══ THREE PARAMETERS, ALL OF THEM WINDOW PARAMETERS ═════════════════════════
 *
 * This is a `'use server'` export, so every argument is a value a browser can
 * post. Round E2 pinned it at ONE parameter with the reasoning that `range` can
 * change WHICH rows are counted and never WHETHER they are. `from` and `to`
 * are the same kind of value and carry the same guarantee, so the guard in
 * test/fs/dashboardScopeEnforcement is now a NAMED ALLOWLIST of exactly these
 * three rather than a count — a count would have been satisfied by folding them
 * into one object, which is the letter of the rule with none of its point.
 *
 * What still holds, and is what the rule was protecting: the SCOPES decide
 * whether the registration half runs at all, and they come from the session
 * before any of these is looked at. A caller without `dashboard_registrations`
 * can post any `from`/`to` they like and reach no registration read.
 *
 * ── THE DATES ARE VALIDATED HERE, WHERE THE UNTRUSTED STRINGS ARRIVE ───────
 * `resolveCustomWindow` is the one rule (see its header for the case table). It
 * returns instants or null; nothing downstream ever parses a date, so there is
 * one place a bad date can be handled and one place to read to know what happens
 * to one.
 *
 * @param {'today'|'week'|'month'|'all'} range — preset window. Client-supplied,
 *   and deliberately inert for a caller without `dashboard_registrations`.
 * @param {string} [from] — 'YYYY-MM-DD', a BANGKOK date. Untrusted.
 * @param {string} [to]   — 'YYYY-MM-DD', a BANGKOK date, INCLUSIVE. Untrusted.
 */
export async function getDashboardMetrics(range = DEFAULT_RANGE, from = '', to = '') {
  const session = await requireAdmin('dashboard');
  const scopes = dashboardScopes(session?.user);

  /**
   * ── NO SCOPE, NO CONNECTION ─────────────────────────────────────────────
   * Returned BEFORE `dbConnect()`. `buildDashboardMetrics` with two false
   * scopes already issues no query, so this is not what makes the read count
   * zero — but opening a database handle to answer "you may see nothing" is
   * work with no reader, and returning first says so in the shape of the code.
   */
  if (hasNoDashboardScope(scopes)) {
    return serialize({ scopes });
  }

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

  return serialize(await buildDashboardMetrics({ scopes, range, custom, models: MODELS }));
}
