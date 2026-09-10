import Link from 'next/link';
import { BrandSection, Subsection } from './_components/BrandSection';
import { SectionNavRail, SectionNavStrip } from './_components/SectionNav';
import {
  DefinitionGrid,
  CopyList,
  StatementBlock,
  LabelledBlock,
} from './_components/DefinitionGrid';
import { PositioningContrast } from './_components/PositioningContrast';
import { ColorSwatchGrid } from './_components/ColorSwatchGrid';
import { BrandAssetExplorer } from './_components/BrandAssetExplorer';
import { GuidancePair, GuidancePanel } from './_components/GuidancePanels';
import { MinimumSizeTable } from './_components/MinimumSizeTable';
import { WallpaperPanel } from './_components/WallpaperPanel';
import {
  PAGE_HEADER,
  CLOSING_NOTE,
  sectionById,
  ABOUT_PARAGRAPHS,
  VISION,
  MISSION,
  BRAND_PURPOSE,
  BRAND_POSITIONING,
  CORE_VALUES,
  BRAND_PERSONALITY,
  VOICE_AND_TONE,
  LOGO_MEANING,
  BRAND_KEYWORDS,
  LOGO_ANATOMY,
  LOGO_CONSTRUCTION,
  CLEAR_SPACE,
  MINIMUM_SIZE_NOTE,
  BACKGROUND_GUIDANCE,
  COLOR_GUIDANCE,
  MISUSE_LEAD,
  PROHIBITIONS,
  REQUIREMENTS,
  BRAND_ASSETS_LEAD,
} from './brandContent';

/**
 * /brand — the 9Expert brand hub.
 *
 * A SERVER COMPONENT with no data access and no async work: every value on this
 * page is a constant in src/lib/brand/palette.js or ./brandContent.js, so the
 * route is prerendered as static. The section rail is plain anchors for the
 * same reason — see SectionNav.
 *
 * ── ONE CLIENT COMPONENT, AND IT IS NAMED ───────────────────────────────────
 * `BrandAssetExplorer` in section 06 — the three download cards and the colour
 * picker that drives all three. It is the ONLY 'use client' module this page
 * reaches, it holds a single `useState`, and it does not make the route
 * dynamic: a client component is still prerendered, then hydrated. Every other
 * component here must stay server-rendered; if a second one needs state, that
 * is a decision to take deliberately rather than by importing.
 *
 * ── THIS STATIC ROUTE BEATS THE CATCH-ALL. SAY IT OUT LOUD ──────────────────
 * `src/app/(public)/[...slug]/page.jsx` resolves a CustomPage by slug. Next.js
 * route precedence is static > dynamic > catch-all, and `(public)` is a route
 * group that contributes nothing to the URL, so from the moment this file
 * exists /brand is THIS page and the catch-all is never reached for that
 * segment. A CustomPage on this slug would not collide and nothing would 500 —
 * it would simply become unreachable, preview token included, and publishing it
 * would NOT take the URL back.
 *
 * `public/brand/` does not shadow it either: public/ serves FILES, so
 * /brand/logo-blue.png comes from the directory and bare /brand reaches here.
 *
 * ── CONTENT SOURCE ──────────────────────────────────────────────────────────
 * prompts/brand-page-content-reference.md — the approved transcription of
 * Master Brand Guideline v1.0. Copy is not rewritten here; every string comes
 * from ./brandContent.js, which holds it verbatim. The English/Thai split is
 * the source document's own and is explained there.
 *
 * ── WHAT IS DELIBERATELY MISSING ────────────────────────────────────────────
 * Typography and Gradients. The reasoning is at BRAND_SECTIONS in
 * ./brandContent.js, and test/render/brandPage asserts their absence — read
 * that before adding either back from the guideline's contents page.
 */

export const metadata = {
  title: PAGE_HEADER.title,
  description:
    'ศูนย์รวมอัตลักษณ์องค์กร 9Expert Training — Brand Story, โลโก้, หลักการใช้งาน, ระบบสี และไฟล์ต้นฉบับสำหรับดาวน์โหลด',
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL}/brand` },
  openGraph: { url: `${process.env.NEXT_PUBLIC_SITE_URL}/brand` },
};

export default function BrandPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-12 pt-8 sm:px-6">
      <header>
        <p className="inline-block rounded-full bg-9e-action/10 px-3 py-1 font-en text-xs font-bold uppercase tracking-wider text-9e-action dark:bg-9e-air/10 dark:text-9e-air">
          {PAGE_HEADER.eyebrow}
        </p>
        <h1 className="mt-2.5 font-heading text-[32px] font-bold leading-tight text-[var(--text-primary)]">
          {PAGE_HEADER.title}
        </h1>
        <p className="mt-3 max-w-[840px] text-base leading-loose text-[var(--text-secondary)]">
          {PAGE_HEADER.subline}
        </p>
      </header>

      {/* Narrow screens: the chip strip, above the content. It sits outside the
          grid below so it spans the full width rather than the content column. */}
      <div className="mt-6 lg:hidden">
        <SectionNavStrip />
      </div>

      {/* Wide screens: rail beside content. `items-start` is what lets the
          rail's `sticky` work — a stretched flex child is as tall as the
          content, so there is nothing for it to stick within. */}
      <div className="mt-6 flex items-start gap-8 lg:mt-8">
        <SectionNavRail />

        <div className="min-w-0 flex-1 space-y-8">
          {/* ── 01 ───────────────────────────────────────────────────────── */}
          <BrandSection {...sectionById['brand-story']}>
            <Subsection title="About">
              <div className="space-y-3">
                {ABOUT_PARAGRAPHS.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="text-sm leading-relaxed text-[var(--text-primary)]"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </Subsection>

            <Subsection title="Vision">
              <StatementBlock>{VISION}</StatementBlock>
            </Subsection>

            <Subsection title="Mission">
              <CopyList items={MISSION} />
            </Subsection>

            <Subsection title="Brand Purpose">
              <StatementBlock>{BRAND_PURPOSE}</StatementBlock>
            </Subsection>

            <Subsection title="Brand Positioning" lead={BRAND_POSITIONING.lead}>
              <PositioningContrast />
            </Subsection>

            <Subsection title="Core Values">
              <DefinitionGrid items={CORE_VALUES} columns={3} />
            </Subsection>

            <Subsection title="Brand Personality" lead={BRAND_PERSONALITY.lead}>
              <DefinitionGrid items={BRAND_PERSONALITY.traits} columns={3} />
            </Subsection>

            <Subsection title="Voice & Tone" lead={VOICE_AND_TONE.lead}>
              <GuidancePair affirm={VOICE_AND_TONE.do} avoid={VOICE_AND_TONE.avoid} />
            </Subsection>
          </BrandSection>

          {/* ── 02 ───────────────────────────────────────────────────────── */}
          <BrandSection {...sectionById.logo}>
            <Subsection title="Logo Meaning" lead={LOGO_MEANING.lead}>
              <DefinitionGrid items={LOGO_MEANING.elements} />
              {/* The four keywords. The source runs them together on one line
                  with middots; as chips they read as the four separate words
                  they are. */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="font-en text-[13px] font-semibold text-[var(--text-secondary)]">
                  Keywords
                </span>
                {BRAND_KEYWORDS.map((keyword) => (
                  <span
                    key={keyword}
                    className="rounded-full bg-9e-action/10 px-3 py-1 font-en text-xs font-bold tracking-wide text-9e-action dark:bg-9e-air/10 dark:text-9e-air"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </Subsection>

            <Subsection title="Logo Anatomy">
              <DefinitionGrid items={LOGO_ANATOMY.parts} columns={3} />
              <div className="mt-4">
                <LabelledBlock
                  title={LOGO_ANATOMY.rules.title}
                  items={LOGO_ANATOMY.rules.items}
                />
              </div>
            </Subsection>

            <Subsection title="Logo Construction">
              <CopyList items={LOGO_CONSTRUCTION.measurements} />
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {LOGO_CONSTRUCTION.note}
              </p>
            </Subsection>
          </BrandSection>

          {/* ── 03 ───────────────────────────────────────────────────────── */}
          <BrandSection {...sectionById['logo-usage']}>
            <Subsection title="Clear Space" lead={CLEAR_SPACE} />

            <Subsection title="Minimum Size">
              <MinimumSizeTable />
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {MINIMUM_SIZE_NOTE}
              </p>
            </Subsection>

            <Subsection title="Logo on Backgrounds">
              <GuidancePair
                affirm={BACKGROUND_GUIDANCE.do}
                avoid={BACKGROUND_GUIDANCE.avoid}
              />
            </Subsection>
          </BrandSection>

          {/* ── 04 ───────────────────────────────────────────────────────── */}
          <BrandSection {...sectionById.colors}>
            <ColorSwatchGrid />
            {/* `as="h3"`: no Subsection sits above these two, so their titles
                are the section's first sub-headings, not sub-sub-headings. */}
            <GuidancePair as="h3" affirm={COLOR_GUIDANCE.do} avoid={COLOR_GUIDANCE.avoid} />
          </BrandSection>

          {/* ── 05 ───────────────────────────────────────────────────────── */}
          <BrandSection {...sectionById['do-and-dont']} lead={MISUSE_LEAD}>
            {/* One full-width panel per group, and no affirmative partner for
                the prohibitions — the source has none there, and inventing
                eight "do" bullets to balance the column would be writing
                guideline copy rather than transcribing it. Two columns so eight
                short prohibitions do not read as a strip of single words. */}
            <GuidancePanel
              tone="avoid"
              as="h3"
              title={PROHIBITIONS.title}
              items={PROHIBITIONS.items}
              columns={2}
              className="w-full"
            />
            <LabelledBlock as="h3" title={REQUIREMENTS.title} items={REQUIREMENTS.items} />
          </BrandSection>

          {/* ── 06 ───────────────────────────────────────────────────────── */}
          <BrandSection {...sectionById['brand-assets']} lead={BRAND_ASSETS_LEAD}>
            {/* Signature / Symbol / Square — three cards and one shared colour
                picker, both driven by brandContent's LOGO_SHAPES and
                LOGO_VARIANTS, so a fourth lockup or a sixth ink is one entry
                rather than another copy of this block.

                THE ONE CLIENT COMPONENT ON THIS PAGE. The picker needs state,
                and this is the only thing on /brand that does; everything above
                and below it stays server-rendered so the route stays static.
                See BrandAssetExplorer for why the selection is component state
                and not a search param. */}
            <BrandAssetExplorer />

            <Subsection title="Wallpaper">
              <WallpaperPanel />
            </Subsection>
          </BrandSection>

          {/* The closing note: not a BrandSection — it has no number, no anchor
              and is not a chapter of the guideline.

              ── AND NOT A `Card` EITHER, WHICH IS A MEASURED CHOICE ─────────
              It wants a tinted blue ground rather than the neutral surface, and
              `bg-9e-action/5` CANNOT be handed to Card through `className`.
              Card merges with `cn` (twMerge), and twMerge does not know the
              project's custom `9e-*` scales, so it cannot see `bg-9e-action/5`
              and Card's own `bg-[var(--surface)]` as one conflict group: BOTH
              would survive into the markup and the winner would be Tailwind's
              emission order, not this file. Same trap as the `rounded-9e-*` one
              documented in button.jsx. A plain <div> owns its classes outright
              and has nothing to merge. */}
          <div className="rounded-9e-lg border border-9e-action/20 bg-9e-action/5 p-4 shadow-9e-sm sm:p-[18px]">
            <p className="text-sm leading-relaxed text-[var(--text-primary)]">
              {CLOSING_NOTE.before}{' '}
              <Link
                href={CLOSING_NOTE.href}
                className="font-semibold text-9e-action underline underline-offset-4 dark:text-9e-air"
              >
                {CLOSING_NOTE.linkText}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
