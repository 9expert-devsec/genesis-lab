import { Suspense } from 'react';
import { getArticles, listUsedArticleSkillIds } from '@/lib/actions/articles';
import { listPrograms } from '@/lib/api/programs';
import { listSkills } from '@/lib/api/skills';
import { buildProgramNames, buildSkillNames } from '@/lib/articleTaxonomy';
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
  const skill = (sp?.skill ?? '').toString();
  // `?type=` IS NOW URL-ONLY, AND THAT IS DELIBERATE RATHER THAN AN OVERSIGHT.
  // Nothing on this page offers it any more: the toolbar's ประเภท dropdown was
  // replaced by the skill filter, and the card's type badge was removed the
  // round before that. So `articleType` has NO public surface left — a visitor
  // can only reach it by typing the parameter, or by following a link written
  // before the control existed.
  //
  // Kept rather than deleted, and kept VISIBLY: the field is real, it is still
  // in the schema and in the admin list, and `getArticles` still filters on it,
  // so an old `?type=video` link keeps working instead of silently returning an
  // unfiltered list. Deleting it would be the quiet kind of breakage; leaving it
  // undocumented would be worse, because the next reader would look for the
  // control that feeds it and find nothing. If it should stop working, that is a
  // decision to take on purpose — not a line to drop while doing something else.
  const articleType = (sp?.type ?? '').toString(); // '', 'article', 'video'

  const [{ items, total }, programsRes, skillsRes, usedSkillIds] = await Promise.all([
    getArticles({
      active: true,
      limit: PAGE_SIZE,
      page,
      search,
      tag,
      program,
      skill,
      articleType: articleType === 'all' ? '' : articleType,
    }),
    listPrograms().catch(() => ({ items: [] })),
    // Same `.catch` shape as listPrograms and for the same reason: upstream is
    // a separate service, and an article list that 500s because a skill lookup
    // did is a worse page than one whose cards show no skill chips.
    listSkills().catch(() => ({ items: [] })),
    // Our own database, so no `.catch`: a silent `[]` here would empty the
    // filter's option list for a reason nobody could see.
    listUsedArticleSkillIds(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const programs = (programsRes.items ?? []).map((p) => ({
    program_id:   p.program_id,
    program_name: p.program_name,
  }));

  // program_id → program_name and skill_id → skill_name, for the card's overlay
  // and chips. Both built by the SHARED builders in src/lib/articleTaxonomy.js —
  // the landing page needs the same two maps, and the reasoning (which key, what
  // to drop, what a wrong key looks like) travels with them rather than being
  // copied. Still derived from THIS page's single fetch of each list, so the
  // filter <select> and the cards cannot disagree.
  //
  // The list read for this page applies NO projection (getArticles takes
  // `select` opt-in and this call omits it), so `skills` is already on every
  // item — nothing new is fetched from Mongo for this.
  const programNames = buildProgramNames(programsRes.items);
  const skillNames = buildSkillNames(skillsRes.items);

  // The toolbar's skill options — built from the ids ARTICLES ACTUALLY CARRY
  // (listUsedArticleSkillIds), not from the full upstream list in `skillsRes`.
  // Upstream holds skills nothing has been written about yet, and offering one
  // is offering a control whose only possible outcome is
  // "ไม่พบบทความที่ตรงกับเงื่อนไข".
  //
  // An id with no name is DROPPED, never offered raw — the same rule the card's
  // chips follow, resolved through the same map, so the dropdown and the chips
  // cannot disagree about what a skill is called or about which ones are
  // presentable. Sorted by the RESOLVED name with localeCompare('th'), because
  // the ids sort by an upstream code the reader never sees.
  const skillOptions = usedSkillIds
    .map((id) => ({ skill_id: id, skill_name: skillNames[id] }))
    .filter((s) => s.skill_name)
    .sort((a, b) => a.skill_name.localeCompare(b.skill_name, 'th'));

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

      <section className="mx-auto mt-8 max-w-[1200px] px-4 pb-16 lg:px-6">
        {/* useSearchParams inside ArticlesPageClient forces a CSR
            bailout for the search-param-driven subtree — Suspense
            gives the static pre-render something to flush. */}
        <Suspense fallback={null}>
          <ArticlesPageClient
            articles={items}
            programs={programs}
            programNames={programNames}
            skillNames={skillNames}
            skillOptions={skillOptions}
            page={page}
            totalPages={totalPages}
            total={total}
            initialFilters={{ q: search, tag, program, skill }}
          />
        </Suspense>
      </section>
    </>
  );
}
