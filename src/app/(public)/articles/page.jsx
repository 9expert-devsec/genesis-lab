import { Suspense } from 'react';
import { getArticles } from '@/lib/actions/articles';
import { listPrograms } from '@/lib/api/programs';
import { ArticlesPageClient } from './_components/ArticlesPageClient';

export const metadata = {
  title: 'บทความ',
  description: 'แบ่งปันความรู้เทคโนโลยี เพื่อ "ขับเคลื่อนประเทศไทย"',
};

// Articles change with new posts, not by the minute — 1h ISR is fine.
// Server Actions hit revalidatePath('/articles') on every write.
export const revalidate = 3600;

export default async function ArticlesIndexPage() {
  const [{ items }, programsRes] = await Promise.all([
    getArticles({ active: true, limit: 50 }),
    listPrograms().catch(() => ({ items: [] })),
  ]);

  const programs = (programsRes.items ?? []).map((p) => ({
    program_id:   p.program_id,
    program_name: p.program_name,
  }));

  // Distinct tag list sourced from the loaded articles — used by the
  // client to render a "filtering by #tag" chip when arriving from a
  // detail page's clickable tag link. The list page doesn't expose a
  // dropdown for it; the chip is the only entry point and is set by
  // the `?tag=` URL searchParam.
  const allTags = [
    ...new Set((items ?? []).flatMap((a) => a.tags ?? [])),
  ].sort();

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0D1B2A] via-[#0F2A4A] to-[#005CFF] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_40%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">บทความ</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-white/80 sm:text-lg">
            แบ่งปันความรู้เทคโนโลยี เพื่อ &ldquo;ขับเคลื่อนประเทศไทย&rdquo;
          </p>
        </div>
      </section>

      <section className="mx-auto -mt-8 max-w-6xl px-4 pb-16 sm:px-6">
        {/* useSearchParams inside ArticlesPageClient forces a CSR
            bailout for the search-param-driven subtree — Suspense
            gives the static pre-render something to flush. */}
        <Suspense fallback={null}>
          <ArticlesPageClient
            articles={items}
            programs={programs}
            allTags={allTags}
          />
        </Suspense>
      </section>
    </>
  );
}