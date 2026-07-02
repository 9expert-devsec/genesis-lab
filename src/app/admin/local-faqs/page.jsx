import { requirePage } from '@/lib/rbac/guard';
import { dbConnect } from '@/lib/db/connect';
import CareerPath from '@/models/CareerPath';
import MasterclassCourse from '@/models/MasterclassCourse';
import { getCourseByCode } from '@/lib/api/public-courses';
import { getAllLocalFaqs } from '@/lib/local-faqs/getLocalFaqs';
import { LocalFaqAdminClient } from './_components/LocalFaqAdminClient';

export const metadata = { title: 'FAQ (Local) — ภาพรวม' };
export const dynamic = 'force-dynamic';

const TYPE_LABELS = {
  public: 'Public / In-house',
  career_path: 'Career Path',
  masterclass: 'Masterclass',
};

function hrefForCourse(course_type, ref_id) {
  switch (course_type) {
    case 'public':      return `/admin/courses/${ref_id}`;
    case 'career_path': return `/admin/career-paths/${ref_id}/faqs`;
    case 'masterclass': return `/admin/masterclass/${ref_id}/faqs`;
    default:            return '/admin/local-faqs';
  }
}

/**
 * Resolve a human-readable name for every (course_type, ref_id) pair.
 * Returns a Map keyed by `${course_type}::${ref_id}`.
 */
async function resolveCourseNames(pairs) {
  await dbConnect();
  const names = new Map();

  const byType = { public: [], career_path: [], masterclass: [] };
  for (const { course_type, ref_id } of pairs) {
    if (byType[course_type]) byType[course_type].push(ref_id);
  }

  // Career paths — one query.
  if (byType.career_path.length) {
    const docs = await CareerPath.find({ career_path_id: { $in: byType.career_path } })
      .select('career_path_id title')
      .lean();
    for (const d of docs) names.set(`career_path::${d.career_path_id}`, d.title || d.career_path_id);
  }

  // Masterclass — one query.
  if (byType.masterclass.length) {
    const docs = await MasterclassCourse.find({ _id: { $in: byType.masterclass } })
      .select('title_th')
      .lean();
    for (const d of docs) names.set(`masterclass::${String(d._id)}`, d.title_th || String(d._id));
  }

  // Public — upstream lookup per code (best-effort; fall back to the code).
  const publicResults = await Promise.allSettled(
    byType.public.map((code) => getCourseByCode(code))
  );
  byType.public.forEach((code, i) => {
    const r = publicResults[i];
    const course = r.status === 'fulfilled' ? r.value : null;
    const name = course?.course_name_th || course?.course_name || code;
    names.set(`public::${code}`, name);
  });

  return names;
}

export default async function LocalFaqOverviewPage() {
  await requirePage('local_faqs');

  const faqs = await getAllLocalFaqs();

  // Orphans — no course assigned. Need manual reassignment.
  const orphans = faqs
    .filter((f) => !f.ref_id)
    .map((f) => ({
      _id: f._id,
      course_type: f.course_type,
      question_th: f.question_th,
    }));

  // Group assigned FAQs by course_type → ref_id.
  const buckets = new Map(); // `${type}::${ref}` → { course_type, ref_id, total, active }
  for (const f of faqs) {
    if (!f.ref_id) continue;
    const key = `${f.course_type}::${f.ref_id}`;
    if (!buckets.has(key)) {
      buckets.set(key, { course_type: f.course_type, ref_id: f.ref_id, total: 0, active: 0 });
    }
    const b = buckets.get(key);
    b.total += 1;
    if (f.is_active) b.active += 1;
  }

  const names = await resolveCourseNames(
    [...buckets.values()].map((b) => ({ course_type: b.course_type, ref_id: b.ref_id }))
  );

  // Assemble grouped structure for the client, ordered by course type.
  const order = ['public', 'career_path', 'masterclass'];
  const groups = order
    .map((course_type) => ({
      course_type,
      label: TYPE_LABELS[course_type],
      items: [...buckets.values()]
        .filter((b) => b.course_type === course_type)
        .map((b) => ({
          ref_id: b.ref_id,
          name: names.get(`${b.course_type}::${b.ref_id}`) || b.ref_id,
          href: hrefForCourse(b.course_type, b.ref_id),
          total: b.total,
          active: b.active,
        }))
        .sort((a, z) => a.name.localeCompare(z.name)),
    }))
    .filter((g) => g.items.length > 0);

  return <LocalFaqAdminClient groups={groups} orphans={orphans} />;
}
