import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { ArticleCard } from '@/components/articles/ArticleCard';

/**
 * Articles written about one program, at the foot of the program page.
 *
 * Sits after the FAQ, last in the page's document order:
 *   course grid -> online courses -> FAQ -> ARTICLES.
 *
 * Fetched server-side by the route and handed down as a prop, the same flow
 * `faqs` and `onlineCourses` use.
 *
 * ── THE CARD IS THE /articles CARD, NOT A LOOKALIKE ────────────────────────
 *
 * `ArticleCard` was extracted from ArticlesPageClient for this section (the
 * commit before this one) and moved byte-for-byte, so a reader arriving here
 * from /articles sees the same card rather than something that resembles it.
 * The alternative measured at audit time — BlogCard plus a mapper — differs in
 * ways that are not cosmetic: BlogCard is a single `<a>` wrapping everything
 * where this is an `<article>` with three separate links, it has no `h-full`
 * so cards in a grid do not share a height, it carries no pin badge and no
 * "อ่านเพิ่มเติม" affordance, and it has no no-cover fallback at all.
 *
 * ── WHY THREE COLUMNS AND NOT THE FOUR THE SECTION ABOVE USES ─────────────
 *
 * This is the one place this section deliberately departs from the online-
 * courses section, and it is the card's measurement that decides it, not
 * taste. `ArticleCard` passes `cap={3}` to SkillChips, and the note at that
 * call site records why: 3 columns at gap-6 inside max-w-[1200px] gives
 * (1200 - 48) / 3 = 384px per card, "which is the width three chips need". The
 * landing card drops to `cap={2}` precisely because its 4-column grid is 288px
 * — 25% narrower — and a third chip wraps.
 *
 * So rendering this card four-up would reproduce the defect that measurement
 * was taken to avoid. Three columns keeps the card at the width it was tuned
 * for, and 6 items is exactly two full rows.
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

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 items-start">
        {articles.map((a) => (
          <ArticleCard
            key={a._id ?? a.slug}
            article={a}
            programNames={programNames}
            skillNames={skillNames}
          />
        ))}
      </div>
    </section>
  );
}
