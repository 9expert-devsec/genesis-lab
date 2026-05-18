import { listPublicCourses } from '@/lib/api/public-courses';
import { getAllSchedules } from '@/lib/api/schedules';
import { dbConnect } from '@/lib/db/connect';
import Article from '@/models/Article';
import { getActiveCareerPaths } from '@/lib/career-paths/getCareerPaths';
import { getActivePromotions } from '@/lib/promotions/getPromotions';
import { SearchClient } from './_components/SearchClient';

export const metadata = {
  title: 'ค้นหา | 9Expert Training',
  description: 'ค้นหาหลักสูตร บทความ และตารางอบรมที่ 9Expert Training',
};

export const revalidate = 1800;

function serialize(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export default async function SearchPage({ searchParams }) {
  const sp = await searchParams;
  const initialQ = String(sp?.q ?? '').trim();

  const [coursesResult, schedulesResult, careerPaths, promotions] = await Promise.all([
    listPublicCourses().catch(() => ({ items: [] })),
    getAllSchedules().catch(() => ({ items: [] })),
    // Career paths come from our synced MongoDB cache (not the upstream
    // API directly) — the cache normalises field names (e.g.
    // cardDetail → short_description) and respects admin curation
    // (is_active). Both are already serialised plain objects.
    getActiveCareerPaths().catch(() => []),
    getActivePromotions().catch(() => []),
  ]);

  await dbConnect();
  const articlesRaw = await Article.find({ active: true })
    .sort({ publishedAt: -1 })
    .select('slug title excerpt coverUrl publishedAt tags')
    .lean();

  const courses   = coursesResult.items ?? [];
  const schedules = schedulesResult.items ?? [];
  const articles  = serialize(articlesRaw);

  // course._id → course, used by the client to enrich schedule rows.
  const courseMap = Object.fromEntries(
    courses.map((c) => [String(c._id), c])
  );

  return (
    <SearchClient
      courses={courses}
      schedules={schedules}
      articles={articles}
      courseMap={courseMap}
      careerPaths={careerPaths}
      promotions={promotions}
      initialQ={initialQ}
    />
  );
}