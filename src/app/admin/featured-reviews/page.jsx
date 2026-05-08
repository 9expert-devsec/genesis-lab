import { getFeaturedReviews } from '@/lib/actions/featured-reviews';
import { getAllReviews } from '@/lib/api/reviews';
import { ReviewSelector } from './_components/ReviewSelector';
import { FeaturedReviewList } from './_components/FeaturedReviewList';

export const metadata = { title: 'รีวิวแนะนำ' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [featured, all] = await Promise.all([
    getFeaturedReviews(),
    getAllReviews(),
  ]);

  // Hide already-curated reviews from the picker. Match on either
  // `_id` or `id` since the upstream returns both.
  const featuredIds = new Set(featured.map((f) => f.review_id));
  const idOf = (r) => String(r._id ?? r.id ?? '');
  const selectable = all.filter((r) => idOf(r) && !featuredIds.has(idOf(r)));

  // Hydrate featured rows with the live review payload so the list
  // can render reviewer name + course without an extra round-trip per
  // row. Missing upstream rows still render with a placeholder.
  const allById = new Map(all.flatMap((r) => {
    const entries = [];
    if (r._id) entries.push([String(r._id), r]);
    if (r.id) entries.push([String(r.id), r]);
    return entries;
  }));
  const hydratedFeatured = featured.map((f) => ({
    ...f,
    review: allById.get(String(f.review_id)) ?? null,
  }));

  const activeCount = featured.filter((c) => c.active).length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-9e-navy">รีวิวแนะนำ (Featured)</h1>
        <p className="text-sm text-9e-slate-dp-50">
          {activeCount} / {featured.length} active
        </p>
      </div>

      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-white p-6">
        <h2 className="mb-4 text-base font-bold text-9e-navy">เพิ่มรีวิว</h2>
        <ReviewSelector reviews={selectable} />
      </div>

      <FeaturedReviewList items={hydratedFeatured} />
    </div>
  );
}
