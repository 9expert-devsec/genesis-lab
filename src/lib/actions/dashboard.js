'use server';

import { dbConnect } from '@/lib/db/connect';
import RegisterPublic  from '@/models/RegisterPublic';
import RegisterInhouse from '@/models/RegisterInhouse';
import Banner          from '@/models/Banner';
import Promotion       from '@/models/Promotion';
import Article         from '@/models/Article';
import FeaturedReview  from '@/models/FeaturedReview';
import Recruit         from '@/models/Recruit';
import { auth } from '@/lib/auth/options';

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
}

function serialize(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

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
  await requireAdmin();
  await dbConnect();

  const { from, to } = dateRange(range);
  const dateFilter = from ? { createdAt: { $gte: from, $lte: to } } : {};

  // ── Registration counts ────────────────────────────────────────
  const [
    publicTotal,
    publicPending,
    publicConfirmed,
    publicPaid,
    publicCancelled,
    inhouseTotal,
    inhouseNew,
    inhouseContacted,
    inhouseClosedWon,
  ] = await Promise.all([
    RegisterPublic.countDocuments(dateFilter),
    RegisterPublic.countDocuments({ ...dateFilter, status: 'pending' }),
    RegisterPublic.countDocuments({ ...dateFilter, status: 'confirmed' }),
    RegisterPublic.countDocuments({ ...dateFilter, status: 'paid' }),
    RegisterPublic.countDocuments({ ...dateFilter, status: 'cancelled' }),
    RegisterInhouse.countDocuments(dateFilter),
    RegisterInhouse.countDocuments({ ...dateFilter, status: 'new' }),
    RegisterInhouse.countDocuments({ ...dateFilter, status: 'contacted' }),
    RegisterInhouse.countDocuments({ ...dateFilter, status: 'closed-won' }),
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
    { status: 'pending',   label: 'รอดำเนินการ', count: publicPending,   color: '#f59e0b' },
    { status: 'confirmed', label: 'ยืนยันแล้ว',  count: publicConfirmed, color: '#3b82f6' },
    { status: 'paid',      label: 'ชำระแล้ว',    count: publicPaid,      color: '#10b981' },
    { status: 'cancelled', label: 'ยกเลิก',      count: publicCancelled, color: '#94a3b8' },
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
    inhouse: {
      total: inhouseTotal,
      new: inhouseNew,
      contacted: inhouseContacted,
      closedWon: inhouseClosedWon,
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