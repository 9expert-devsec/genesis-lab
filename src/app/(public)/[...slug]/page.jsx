import { notFound } from 'next/navigation';
import { PagePlaceholder } from '@/components/layout/PagePlaceholder';

/**
 * Catch-all route for legacy-style pattern URLs:
 *   /<slug>-training-course      → course detail
 *   /<slug>-career-path          → career path detail
 *   /<slug>-all-courses          → catalog by skill or program
 *
 * The `[...slug]` parameter here is always a single-segment array for these
 * patterns (e.g. ['power-bi-training-course']). We dispatch by suffix.
 *
 * In Phase 1 this renders placeholders. Phase 2/3 replace each branch with
 * the real page implementation (data-fetch from upstream + render).
 */
export default async function CatchAllPage({ params }) {
  const { slug } = await params;
  const segment = Array.isArray(slug) ? slug.join('/') : String(slug ?? '');

  // We only match SINGLE-segment patterns with known suffixes.
  // Multi-segment or unknown patterns → 404.
  if (segment.includes('/')) notFound();

  if (segment.endsWith('-training-course')) {
    const courseSlug = segment.slice(0, -'-training-course'.length);
    return (
      <PagePlaceholder
        title={`รายละเอียดคอร์ส: ${courseSlug}`}
        description="รายละเอียดหลักสูตร จุดเด่น เนื้อหา และตารางอบรม — เชื่อมต่อ /api/ai/public-courses ใน Phase 2"
        phase="Phase 2"
      />
    );
  }

  if (segment.endsWith('-career-path')) {
    const pathSlug = segment.slice(0, -'-career-path'.length);
    return (
      <PagePlaceholder
        title={`เส้นทางอาชีพ: ${pathSlug}`}
        description="รายละเอียดเส้นทางอาชีพ ทักษะที่จำเป็น และหลักสูตรแนะนำ — เชื่อมต่อ /api/ai/career-path ใน Phase 3"
        phase="Phase 3"
      />
    );
  }

  if (segment.endsWith('-all-courses')) {
    const catalogSlug = segment.slice(0, -'-all-courses'.length);
    return (
      <PagePlaceholder
        title={`หลักสูตรทั้งหมด: ${catalogSlug}`}
        description="รวมหลักสูตรตาม Skill หรือ Program — filter จาก /api/ai/public-courses ใน Phase 3"
        phase="Phase 3"
      />
    );
  }

  notFound();
}

// Allow Next.js to render this route dynamically.
// When real implementations land, each branch can add `generateStaticParams`
// to pre-render known slugs at build time.
export const dynamic = 'force-dynamic';
