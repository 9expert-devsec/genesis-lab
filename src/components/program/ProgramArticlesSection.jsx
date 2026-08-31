import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { BlogCard } from '@/app/_components/home/BlogSection';
import { toBlogCardModel } from '@/lib/articleCardModel';

/**
 * Articles written about one program, at the foot of the program page.
 *
 * Sits after the FAQ, last in the page's document order:
 *   course grid -> online courses -> FAQ -> ARTICLES.
 *
 * Fetched server-side by the route and handed down as a prop, the same flow
 * `faqs` and `onlineCourses` use.
 *
 * ── THE CARD IS THE LANDING PAGE'S CARD, AND SO IS THE GRID ───────────────
 *
 * This rendered `ArticleCard` (the /articles card) in a 3-column grid, which
 * made its cards visibly larger than the landing page's: same 1200px
 * container, but (1200 - 48) / 3 = 384px per card against the landing's
 * (1200 - 48) / 4 = 288px. A third wider, and taller in proportion.
 *
 * Both halves of that gap are closed by reusing what the landing section
 * already does rather than by tuning classes to look close: `BlogCard`, in
 * `BlogCard`'s grid literal. Matching only the grid would have been worse than
 * not matching — `ArticleCard` passes `cap={3}` to SkillChips, measured for
 * 384px, and the landing card drops to `cap={2}` precisely because a third
 * chip wraps at 288px. Same card, same cap, no second measurement to keep.
 *
 * BlogCard takes a mapped shape rather than an Article, so the mapping lives in
 * lib/articleCardModel — see that module for why BlogSection's own inline copy
 * was left alone.
 *
 * ── EMPTY MEANS INVISIBLE ─────────────────────────────────────────────────
 *
 * Same guard as FaqAccordionSection and the online section. Measured at audit
 * time: 3 of 27 programs (GOO, MSJ, N8N) have no published articles, so this
 * section is absent on three pages and populated on the other 24 — the inverse
 * of the online section's distribution, which is absent on 14.
 *
 * @param {Array}  articles     already filtered, ordered and capped by the route
 * @param {object} program      for the heading icon and the see-all href
 * @param {object} programNames program_id -> name, for the card's overlay
 * @param {object} skillNames   skill_id  -> name, for the card's chips
 */
export function ProgramArticlesSection({
  articles = [],
  program,
  programNames = {},
  skillNames = {},
  title = 'บทความเกี่ยวกับโปรแกรมนี้',
  id = 'articles',
}) {
  if (!articles?.length) return null;

  /**
   * THE SHORT CODE, matching Article.programs and ProgramPageConfig.programId.
   * `/articles?program=<code>` already resolves server-side — page.jsx reads
   * `searchParams.program` straight into `getArticles` — so this needs no new
   * route and no new filter.
   */
  const code = program?.program_id ?? program?._id ?? '';
  const seeAllHref = code
    ? `/articles?program=${encodeURIComponent(String(code))}`
    : '/articles';

  return (
    <section id={id} className="mx-auto max-w-[1200px] pt-10 lg:pt-14">
      <div className="mb-6 flex items-center gap-3">
        {program?.programiconurl && (
          <Image
            src={program.programiconurl}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
            unoptimized
          />
        )}
        <h2 className="text-lg font-bold text-9e-navy dark:text-white">{title}</h2>
        <span className="rounded-full bg-9e-air/20 px-2 py-0.5 text-xs font-bold text-9e-action dark:bg-[#111d2c] dark:text-9e-air">
          {articles.length}
        </span>

        {/*
          THE SEE-ALL LINK IS IN THE HEADING ROW, not under the grid, and
          `ml-auto` puts it hard right. The count pill beside the title says how
          many are SHOWN (at most 6); this is how a reader reaches the rest,
          which for POWER-BI is another 35.
        */}
        <Link
          href={seeAllHref}
          className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-9e-action hover:underline dark:text-9e-air"
        >
          ดูบทความทั้งหมด
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>

      {/*
        THE GRID LITERAL IS THE LANDING SECTION'S, copied deliberately rather
        than approximated: BlogSection.jsx:84. Same container width above, same
        columns, same gap — so a card here is the same 288px it is there.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {articles.map((a) => {
          const blog = toBlogCardModel(a);
          return (
            <BlogCard
              key={blog.id}
              blog={blog}
              programNames={programNames}
              skillNames={skillNames}
            />
          );
        })}
      </div>
    </section>
  );
}
