import Link from 'next/link';
import { ArrowRight, Pin } from 'lucide-react';
import { shouldShowPinBadge } from '@/lib/articlePositioning';
import { ProgramOverlay, SkillChips } from '@/components/articles/ArticleTaxonomyChips';

/**
 * One card on /articles.
 *
 * ── THE TOP-LEFT OVERLAY: TYPE OUT, PROGRAM IN ──────────────────────────────
 * That slot used to say บทความ or บทความวิดีโอ on every card, so on a page where
 * the overwhelming majority are plain articles it was a label that read "this is
 * a thing on the articles page". The type is still a real distinction and still
 * filterable — the `?type=` param still works — it just does not need to be
 * stamped on every cover image to be available.
 *
 * BLOGSECTION IS NO LONGER AN EXCEPTION. This block used to say the landing
 * card was untouched, and that is no longer true: it has been brought onto the
 * same presentation — program overlay, skill chips, no type badge, no free-text
 * tags — rendered by the SHARED components in
 * src/components/articles/ArticleTaxonomyChips.jsx rather than by a second copy
 * of this markup. The two cards now differ in exactly one thing, the skill cap,
 * and it is passed at each call site with its own measurement because the
 * columns really are different widths: 384px here (3 cols, gap-6) against 288px
 * there (4 cols, gap-4), 25% narrower.
 *
 * The slot now carries the article's PROGRAM, which is the thing a reader
 * scanning a grid of covers actually wants: which part of the catalogue this
 * belongs to. Same treatment as the badge it replaces — that was a deliberate
 * reuse rather than a coincidence, because the slot's job (one short,
 * high-contrast label over artwork) has not changed.
 *
 * THE CHIPS ARE NON-INTERACTIVE, AND THAT IS NOT AN OVERSIGHT. They sit inside
 * the cover `<Link>`, so making them link to `?program=` would nest an anchor
 * inside an anchor — invalid HTML that React will render anyway and that
 * browsers resolve by silently splitting the outer link, which breaks the card's
 * own click target. The filter for programs already exists in the toolbar.
 *
 * CAPPED AT 2, WITH NO "+N" COUNTER, unlike the skills row below. This slot
 * overlays the artwork rather than sitting in the text column: a third chip
 * starts covering the image, and a `+1` in that position reads as part of the
 * picture. The body's skill row keeps its own cap of 3 because it has the width.
 *
 * ── SKILLS REPLACE TAGS ON THE CARD, AND ONLY ON THE CARD ───────────────────
 * `tags` is a free-text field an author types; `skills` is a chosen reference to
 * the upstream taxonomy the rest of the site navigates by. The chip row now
 * shows the second. NOTHING ELSE MOVES: the `tags` field, the `?tag=` filter,
 * the toolbar's tag chip and the search box (which searches tags) are all
 * unchanged, so every existing tag link still works and this is a display
 * change rather than a data one.
 *
 * AN ID WITH NO NAME IS DROPPED, NEVER PRINTED — for BOTH rows, resolved the
 * same way so the two cannot drift. An article stores `skill_id` / `program_id`
 * strings and the names come from a separate service; when that service is
 * unreachable the map is empty (page.jsx catches to `{items: []}`), and when an
 * entry is retired upstream its id survives in old articles forever. Printing
 * the raw id would put `SK-014` on a public card, which is worse than showing
 * nothing — so an unresolved id is skipped, and a card with nothing left to show
 * renders NO WRAPPER AT ALL rather than an empty element: in the body that would
 * be a strip of padding, and in the overlay it would be a transparent box
 * floating on the artwork.
 */
export function ArticleCard({ article, programNames = {}, skillNames = {} }) {
  const href = `/articles/${article.slug}`;
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-9e-lg dark:bg-[#0D1B2A]">
      <Link href={href} className="relative block aspect-video overflow-hidden bg-9e-ice dark:bg-[#111d2c]">
        {article.coverUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={article.coverUrl}
            alt={article.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-9e-action">
            {article.title?.slice(0, 1) ?? '?'}
          </div>
        )}
        {/* The overlay slot the type badge vacated. Rendered only when there is
            something to say — no wrapper, so a card with no resolvable program
            has a clean cover image.

            CAP 2, passed rather than defaulted: this row is absolutely
            positioned on the artwork, so its budget is the card width (384px
            here) minus the pin badge's corner. The widest real pair measures
            185.8px against 336px usable — comfortable. The landing passes 2 for
            a tighter budget; see the note there. */}
        <ProgramOverlay ids={article.programs} names={programNames} cap={2} />
        {/* Badge only — NOT the ordering. `isPinnedOnArticlePage` still decides
            where this card sits in the list (the cascade in
            src/lib/actions/articles.js is unchanged); shouldShowPinBadge decides
            whether it wears the glyph. The helper treats an ABSENT
            `showPinBadge` as ON, which is why this is not an inline field check
            — see the note on the helper. */}
        {shouldShowPinBadge(article) && (
          <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm dark:bg-[#0D1B2A]/90">
            <Pin className="h-3.5 w-3.5 text-9e-action" strokeWidth={2.5} />
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-lg font-bold text-9e-navy dark:text-white">
          <Link href={href} className="hover:text-9e-action">
            {article.title}
          </Link>
        </h3>

        {article.excerpt && (
          <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-[#94a3b8]">
            {article.excerpt}
          </p>
        )}

        {/* CAP 3, and the cap is passed rather than defaulted because the
            landing card passes 2. This grid is lg:grid-cols-3 at gap-6 inside
            max-w-[1200px] → (1200 - 48) / 3 = 384px per card, which is the
            width three chips need. */}
        <SkillChips ids={article.skills} names={skillNames} cap={3} />

        {/* The publish date used to sit on the left of this row. Removed by
            the owner's decision — see the note in ArticleDetailClient. The row
            keeps `justify-between` so the link stays hard right rather than
            sliding to the left edge when its only sibling disappeared. */}
        <div className="mt-auto flex items-center justify-between pt-4 text-xs text-9e-slate-dp-50 dark:text-[#94a3b8]">
          <span />
          <Link
            href={href}
            className="inline-flex items-center gap-1 font-semibold text-9e-action hover:underline"
          >
            อ่านเพิ่มเติม <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </article>
  );
}