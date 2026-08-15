import Image from 'next/image';
import { PolicyBreadcrumb } from './PolicyBreadcrumb';
import { PolicyIcon } from './PolicyIcon';
import { POLICY_VERSION } from '@/config/policies';

/**
 * The one hero used by all five legal pages.
 *
 * ── IT NOW RENDERS REAL ARTWORK, AND THE COMPONENT DID NOT MOVE ─────────────
 * This used to draw a single geometric motif — a token-filled panel holding the
 * page's icon — because the Figma's four bespoke illustrations were light-only
 * vector art that would each have needed re-tuning by hand for dark mode.
 *
 * Commissioned artwork replaced them, one per page. The COMPONENT is unchanged:
 * the box, the spacing, and the below-md rule all still live here, so the five
 * pages cannot drift apart. Only what fills the box changed.
 *
 * The artwork carries no baked-in background — verified, 0.00% opaque pixels
 * around the border of all six files — which is what lets one set of PNGs sit
 * on both the light and the dark surface. If a future file arrives with a white
 * rectangle in it, the fix is a new export, NOT a CSS filter or a blend mode:
 * those would wash out the blues that make the set look like one family.
 *
 * `illustration` comes from config/policies.js, which owns the rendered box
 * size. See the note there for why the declared size is much smaller than the
 * source files.
 */
/**
 * `updated` is passed in rather than read from config: it is a claim about THIS
 * page's copy, and each page owns its own. Passing it also means the stamp
 * cannot render without a caller having supplied a date — see the guard below.
 */
export function PolicyHero({
  breadcrumb,
  illustration,
  title,
  titleEn,
  lede,
  updated,
  showStamp = true,
}) {
  return (
    <section className="border-b border-[var(--surface-border)] bg-[var(--page-bg-muted)]">
      <div className="mx-auto w-full max-w-[1200px] px-0 pb-12 pt-6 max-md:px-4">
        <PolicyBreadcrumb items={breadcrumb} />

        <div className="mt-6 flex items-center justify-between gap-10">
          {/* Text column — 640 in the Figma, unchanged at 1200 because it is
              capped by readable measure, not by the container width. */}
          <div className="max-w-[640px]">
            <h1 className="text-[32px] font-bold leading-tight text-[var(--text-primary)]">
              {title}
            </h1>
            {titleEn && (
              <p className="mt-1 text-[24px] font-bold leading-tight text-9e-action dark:text-[#48B0FF]">
                ({titleEn})
              </p>
            )}
            {lede && (
              <p className="mt-4 text-[15px] leading-[1.7] text-[var(--text-secondary)]">
                {lede}
              </p>
            )}
            {/* No date, no stamp. Rendering "ปรับปรุงล่าสุด:" followed by
                nothing would be worse than omitting the line, and silently
                falling back to a shared date is the exact defect that made
                this a per-page field. */}
            {showStamp && updated && (
              <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
                <PolicyIcon name="clock" className="h-4 w-4 shrink-0" />
                <span>ปรับปรุงล่าสุด: {updated}</span>
                <span aria-hidden="true">·</span>
                <span>เวอร์ชัน {POLICY_VERSION}</span>
              </p>
            )}
          </div>

          {/* The illustration. DECORATIVE — empty alt and aria-hidden, because
              the h1 beside it already carries the meaning and a screen reader
              announcing "folder with shield and scales" would only add noise.

              Dropped below md, where the text column needs the full width.
              Explicit width/height reserve the box so nothing reflows when the
              image arrives, and it is deliberately NOT priority: on mobile it
              is not rendered at all, and on desktop it is decoration that must
              not compete with the text for bandwidth. */}
          {illustration && (
            <div aria-hidden="true" className="shrink-0 max-md:hidden">
              <Image
                src={illustration.src}
                alt=""
                width={illustration.width}
                height={illustration.height}
                className="h-auto w-auto select-none"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
