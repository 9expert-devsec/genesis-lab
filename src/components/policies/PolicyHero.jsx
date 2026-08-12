import { PolicyBreadcrumb } from './PolicyBreadcrumb';
import { PolicyIcon } from './PolicyIcon';
import { POLICY_VERSION } from '@/config/policies';

/**
 * The one hero used by all five legal pages.
 *
 * ── WHY ONE MOTIF AND NOT THE FIGMA'S FIVE ──────────────────────────────────
 * The design gave each page a bespoke illustration: a folder-and-scales pair, a
 * cookie bubble over a browser panel, a document stack with a lock badge, a
 * credit card with a wallet and a sync ring. Four hand-built vector
 * compositions, all of them light-mode art built from literal hex.
 *
 * They are not ported, for two reasons. Five pages carrying two visual
 * languages read as unfinished, and every one of those compositions would need
 * re-tuning by hand for dark mode. What replaces them is deliberately one
 * shape — a token-filled panel holding the page's own icon — drawn entirely
 * from CSS variables and `currentColor`, so the dark theme costs nothing.
 *
 * The icon is the SAME glyph as the hub card that links here (see PolicyIcon),
 * which is what carries the sense of continuity the bespoke art was carrying.
 *
 * If a hero looks bare, the fix is restraint — tighter type, more space — not
 * a second visual language.
 */
/**
 * `updated` is passed in rather than read from config: it is a claim about THIS
 * page's copy, and each page owns its own. Passing it also means the stamp
 * cannot render without a caller having supplied a date — see the guard below.
 */
export function PolicyHero({
  breadcrumb,
  icon,
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

          {/* The motif. Decorative: hidden from assistive tech and dropped
              below md, where the text column needs the full width. */}
          <div aria-hidden="true" className="shrink-0 max-md:hidden">
            <div className="relative flex h-[140px] w-[200px] items-center justify-center rounded-2xl bg-9e-action/10 ring-1 ring-inset ring-9e-action/20 dark:bg-[#48B0FF]/10 dark:ring-[#48B0FF]/25">
              <span className="absolute h-[104px] w-[104px] rounded-full bg-9e-action/5 dark:bg-[#48B0FF]/5" />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface)] text-9e-action shadow-sm dark:text-[#48B0FF]">
                <PolicyIcon name={icon} className="h-8 w-8" strokeWidth={1.6} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
