import { Suspense } from 'react';
import { getArticles } from '@/lib/actions/articles';
import { listPrograms } from '@/lib/api/programs';
import { ArticlesPageClient } from './_components/ArticlesPageClient';

export const metadata = {
  title: 'บทความ',
  description: 'แบ่งปันความรู้เทคโนโลยี เพื่อ "ขับเคลื่อนประเทศไทย"',
};

// The list is now page- and filter-driven via searchParams, so render
// fresh per request rather than serving a single ISR snapshot. Server
// Actions still call revalidatePath('/articles') on every write.
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;

export default async function ArticlesIndexPage({ searchParams }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page) || 1);
  const search = (sp?.q ?? '').toString();
  const tag = (sp?.tag ?? '').toString();
  const program = (sp?.program ?? '').toString();
  const articleType = (sp?.type ?? '').toString(); // '', 'article', 'video'

  const [{ items, total }, programsRes] = await Promise.all([
    getArticles({
      active: true,
      limit: PAGE_SIZE,
      page,
      search,
      tag,
      program,
      articleType: articleType === 'all' ? '' : articleType,
    }),
    listPrograms().catch(() => ({ items: [] })),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const programs = (programsRes.items ?? []).map((p) => ({
    program_id:   p.program_id,
    program_name: p.program_name,
  }));

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

      <section className="mx-auto mt-8 max-w-[1200px] pb-16">
        {/* useSearchParams inside ArticlesPageClient forces a CSR
            bailout for the search-param-driven subtree — Suspense
            gives the static pre-render something to flush. */}
        <Suspense fallback={null}>
          <ArticlesPageClient
            articles={items}
            programs={programs}
            page={page}
            totalPages={totalPages}
            total={total}
            initialFilters={{ q: search, tag, program, type: articleType || 'all' }}
          />
        </Suspense>
      </section>
    </>
  );
}
