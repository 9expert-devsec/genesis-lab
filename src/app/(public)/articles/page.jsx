import { Suspense } from 'react';
import { getArticles, listUsedArticleSkillIds } from '@/lib/actions/articles';
import { listPrograms } from '@/lib/api/programs';
import { listSkills } from '@/lib/api/skills';
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

  // program_id → program_name, for the card's overlay tag.
  //
  // DERIVED FROM `programs` ABOVE, not from a second `listPrograms()` call. The
  // filter <select> and the card need the same two fields off the same fetch,
  // and two calls would be two answers on a slow upstream — a card tagged with a
  // program the dropdown does not offer, from one page render.
  //
  // KEYED ON `program_id`, NOT `_id`, for the same reason skillNames is: that is
  // what an article stores. src/models/Article.js:26 declares
  // `programs: [String]` and comments it "program_id values", articleSchema and
  // parseArticleFormData both carry it as a string array, and ArticleForm's
  // ProgramPicker checks and stores `p.program_id`. Keyed on `_id` this map
  // would resolve nothing and every overlay would silently disappear — which,
  // since an unresolved id is DROPPED rather than printed, produces no error and
  // no visible symptom beyond "the tags stopped appearing".
  const programNames = Object.fromEntries(
    programs
      .filter((p) => p.program_id && p.program_name)
      .map((p) => [String(p.program_id), String(p.program_name)])
  );

  // skill_id → skill_name, for the card's chips.
  //
  // KEYED ON `skill_id`, NOT `_id`: that is what an article stores. The form's
  // picker is built from `s.skill_id` (ArticleForm.jsx), the parser and
  // `articleSchema` both declare `skills` as a string array, and the model
  // comments the field as "skill_id values". Keying this on `_id` would resolve
  // nothing and every chip would silently disappear — which is exactly the
  // failure mode the card's "drop what you cannot resolve" rule turns into
  // silence, so the key is the part worth being sure about.
  //
  // The list read for this page applies NO projection (getArticles takes
  // `select` opt-in and this call omits it), so `skills` is already on every
  // item — nothing new is fetched from Mongo for this.
  const skillNames = Object.fromEntries(
    (skillsRes.items ?? [])
      .filter((s) => s?.skill_id && s?.skill_name)
      .map((s) => [String(s.skill_id), String(s.skill_name)])
  );

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

      <section className="mx-auto mt-8 max-w-[1200px] pb-16">
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
