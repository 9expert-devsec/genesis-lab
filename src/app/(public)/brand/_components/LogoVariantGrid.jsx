import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LOGO_VARIANTS, svgHref, pngHref } from '../brandContent';

/**
 * The five approved inks of one logo shape, as five download cards.
 *
 * Signature / Symbol / Square differ only in the file-name stem and how tall
 * the artwork may stand inside its tile, so all fifteen cards on the page come
 * from this one component looped over LOGO_SHAPES — not from fifteen blocks
 * that would drift apart the first time one of them was edited.
 *
 * ══ THE TILE DOES NOT FOLLOW THE THEME, AND THAT IS THE POINT ═══════════════
 *
 * `TILE` below has no `dark:` variant, deliberately, and must not acquire one.
 *
 * The tile behind each logo is not a background — it is the DEMONSTRATION. A
 * Cloud Base logo is the knockout, drawn to be legible only on a dark ground; a
 * Deep Navy logo is drawn for a light one. So Cloud Base and State Light sit on
 * a dark tile and Nine Blue, Deep Navy and State Deep sit on a light tile, in
 * BOTH themes, because that pairing is the rule the section three panels down
 * ("การวางโลโก้บนพื้นหลัง") states in words.
 *
 * Let the tile invert with the theme and a reader in dark mode is shown the
 * navy logo on navy and the near-white logo on white: the page would be
 * teaching the exact mistake it forbids, and each artwork would be close to
 * invisible while it did so. A theme is a reading preference; this is the
 * content.
 *
 * ── WHY THESE ARE PLAIN CLASSES ON A PLAIN <div> ────────────────────────────
 * `bg-9e-navy` is NOT passed through a cn()-based component's `className`.
 * tailwind-merge does not know the project's custom `9e-*` scales, so it cannot
 * see `bg-9e-navy` and Card's `bg-[var(--surface)]` as one conflict group: both
 * would survive into the markup and the winner would be decided by Tailwind's
 * emission order rather than by this file. The tile is therefore its own
 * element with no competing base class — nothing to merge, nothing to lose.
 */
const TILE = {
  light: 'bg-white',
  dark: 'bg-9e-navy',
};

function DownloadPair({ shape, variant }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {/* The shared Button via `asChild`, so href survives through Radix Slot
          and both links get the site's 44px tap target and focus ring instead
          of a local anchor dialect. `radius="md"` for the reason recorded in
          button.jsx: the default `xl` (24px) is more than half an h-11
          button's height, which rounds a three-character label into a pill. */}
      <Button asChild variant="primary" size="md" radius="md" className="flex-1 px-4 sm:flex-none">
        <a href={svgHref(shape, variant.key)}>SVG</a>
      </Button>
      <Button asChild variant="outline" size="md" radius="md" className="flex-1 px-4 sm:flex-none">
        <a href={pngHref(shape, variant.key)}>PNG</a>
      </Button>
    </div>
  );
}

export function LogoVariantGrid({ shape, alt, stageHeight }) {
  return (
    <div className="flex flex-wrap gap-3.5">
      {LOGO_VARIANTS.map((variant) => (
        <Card key={variant.key} className="flex min-w-0 flex-[1_1_260px] flex-col overflow-hidden">
          <div
            className={cn(
              'flex min-h-[150px] items-center justify-center px-5 py-6',
              // Fixed by the guideline, NOT by the theme — see the block note above.
              TILE[variant.tile],
            )}
          >
            {/* A plain <img>, not next/image: next.config.mjs does not set
                `dangerouslyAllowSVG`, so the optimizer refuses an SVG source
                outright. It is the right refusal to respect rather than to
                switch off for one page — and the delivery layer already returns
                these bytes untransformed, so there is nothing to optimize. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={svgHref(shape, variant.key)}
              alt={`${alt} สี ${variant.name}`}
              className={cn('block h-auto w-auto max-w-full', stageHeight)}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="p-4">
            <p className="text-[15px] font-bold text-[var(--text-primary)]">{variant.name}</p>
            <p className="mt-0.5 font-en text-xs text-[var(--text-secondary)]">
              {variant.hex} · {shape}-{variant.key}
            </p>
            <DownloadPair shape={shape} variant={variant} />
          </div>
        </Card>
      ))}
    </div>
  );
}
