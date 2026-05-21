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
        <ArticlesPageClient
          articles={items}
          programs={programs}
        />
      </section>
    </>
  );
}