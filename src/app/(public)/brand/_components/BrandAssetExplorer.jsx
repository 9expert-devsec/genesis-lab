'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LOGO_SHAPES, LOGO_VARIANTS, svgHref, pngHref } from '../brandContent';

/**
 * Section 06's downloader: three logo forms, one shared ink picker.
 *
 * ══ THE ONLY CLIENT COMPONENT ON /brand, AND IT STAYS THAT WAY ══════════════
 *
 * Everything else the page renders — the six sections, the rail, the palette
 * grid, the wallpaper panel — is a server component with no client JavaScript,
 * and the route is still prerendered as static. This file is the whole
 * boundary: ONE `useState` holding which ink is selected. Nothing here reads
 * the router, the URL or storage, so there is no reason for the boundary to
 * widen and no reason for the rest of the page to follow it across.
 *
 * The selection is component state ON PURPOSE. It resets on reload and it does
 * not appear in the address bar — a shared /brand link lands on Nine Blue for
 * everyone, which is the default the guideline itself leads with. Putting the
 * choice in a search param would make every ink a separately shareable URL and
 * would drag `useSearchParams` (and a Suspense boundary) into a page that has
 * no other need for either. If that is ever wanted it is its own change.
 *
 * ── WHAT THIS REPLACED, AND WHY ─────────────────────────────────────────────
 * Fifteen cards — three forms x five inks, all on screen at once. Correct, and
 * a very tall wall of near-identical tiles that made the reader scan for the
 * one file they came for. Three cards and a picker say the same thing: pick an
 * ink, take the form you need.
 *
 * ══ THE TILE FOLLOWS THE SELECTED INK. IT NEVER FOLLOWED THE THEME. ═════════
 *
 * `TILE` below still has no `dark:` variant, deliberately, and must not acquire
 * one. What changed with the picker is which side it is driven from, not the
 * rule: the tile used to be fixed per CARD, because each card owned one ink.
 * Now all three cards share the selected ink, so all three tiles flip together
 * when the picker changes — light for Nine Blue, Deep Navy and State Deep, dark
 * for Cloud Base and State Light — in BOTH site themes.
 *
 * The reason is unchanged and is the whole point of the tile: a white logo on a
 * white tile is invisible. A Cloud Base logo is the knockout, drawn to be
 * legible only on a dark ground; a Deep Navy logo is drawn for a light one. So
 * the tile is carrying section 03's own "การวางโลโก้บนพื้นหลัง" rule rather
 * than decorating the card. With the picker, that rule stops being a paragraph
 * the visitor reads and becomes something they OPERATE — which is a gain, but
 * only if the pairing is correct for every one of the five inks. Get one wrong
 * and the page demonstrates the mistake it forbids, with nothing thrown and
 * nothing to see but a blank tile. test/render/brandPage clicks all five.
 *
 * Let the tile invert with the theme instead and a reader in dark mode is shown
 * the navy logo on navy and the near-white logo on white. A theme is a reading
 * preference; this is the content.
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

/**
 * Nine Blue, named rather than taken as LOGO_VARIANTS[0].
 *
 * The guideline leads with it, so it is the ink the page opens on — and
 * spelling the key here means reordering the ink list (a presentation decision)
 * cannot silently change which file a visitor downloads by default.
 */
const DEFAULT_INK_KEY = 'nineblue';

const PICKER_LABEL_ID = 'brand-ink-picker-label';

/**
 * The five inks as five toggle buttons.
 *
 * ── aria-pressed, NOT role="radiogroup" ─────────────────────────────────────
 * Both are legitimate for a single-choice control; the difference is what they
 * oblige the implementation to do. A real radio group owns its own keyboard
 * model — ONE tab stop for the whole group, arrow keys moving between options,
 * and roving `tabIndex` to make that true — and a group that declares the role
 * without implementing that model is worse than no role at all, because
 * assistive tech then announces a keyboard contract the widget does not honour.
 *
 * Five buttons in a labelled `group` need none of that: each is a native
 * button, so it is tab-reachable, Enter/Space-operable and focus-ringed for
 * free, and `aria-pressed` exposes the selected one without promising
 * arrow-key traversal that is not there. Five short toggles is exactly the size
 * where that trade favours the simpler pattern.
 *
 * ── AND THE SELECTED ONE IS NOT MARKED BY COLOUR ALONE ──────────────────────
 * Colour is the last thing this particular control can lean on: two of the five
 * inks are greys (State Deep and State Light) that many readers cannot tell
 * apart, and the swatch dot beside each label is itself a colour. So selection
 * is carried by a RING and a check mark as well as by tint, and every button
 * prints its English name — a bare coloured circle would be unusable by
 * keyboard, unreadable by a screen reader, and ambiguous for anyone who cannot
 * separate the two greys.
 */
export function InkPicker({ selectedKey, onSelect }) {
  return (
    <div>
      <p
        id={PICKER_LABEL_ID}
        className="font-en text-[13px] font-semibold text-[var(--text-secondary)]"
      >
        Logo Colour
      </p>
      <div role="group" aria-labelledby={PICKER_LABEL_ID} className="mt-2 flex flex-wrap gap-2">
        {LOGO_VARIANTS.map((variant) => {
          const selected = variant.key === selectedKey;
          return (
            <button
              key={variant.key}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(variant.key)}
              className={cn(
                'inline-flex h-11 items-center gap-2 rounded-9e-md border px-3.5',
                'font-en text-sm transition-all duration-9e-micro ease-9e',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-9e-brand',
                'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]',
                selected
                  ? 'border-9e-action font-bold text-9e-action ring-2 ring-9e-action ' +
                      'dark:border-9e-air dark:text-9e-air dark:ring-9e-air'
                  : 'border-[var(--surface-border)] font-semibold text-[var(--text-secondary)] ' +
                      'hover:border-9e-action hover:text-9e-action',
              )}
            >
              {/* The dot is an inline style for the reason ColorSwatchGrid
                  records: Tailwind's JIT only emits classes it can SEE, so
                  `bg-[<hex>]` built from data compiles to nothing. The hairline
                  inset keeps State Light from vanishing into a light surface. */}
              <span
                className="h-4 w-4 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                style={{ backgroundColor: variant.hex }}
                aria-hidden="true"
              />
              <span>{variant.name}</span>
              {/* Held in the layout when unselected so the row does not reflow
                  as the reader moves through the five. */}
              <span aria-hidden="true" className={selected ? '' : 'invisible'}>
                ✓
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DownloadPair({ shape, variant }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {/* The shared Button via `asChild`, so href survives through Radix Slot
          and both links get the site's 44px tap target and focus ring instead
          of a local anchor dialect. `radius="md"` for the reason recorded in
          button.jsx: the default `xl` (24px) is more than half an h-11
          button's height, which rounds a three-character label into a pill.

          NO `download` attribute on either link. The delivery layer already
          sends the originals under /files/ci/ and /files/ci-svg/ as
          attachments, so the attribute would be a second, weaker copy of that
          ruling sitting in a place nothing checks. */}
      <Button asChild variant="primary" size="md" radius="md" className="flex-1 px-4 sm:flex-none">
        <a href={svgHref(shape.key, variant.key)}>SVG</a>
      </Button>
      <Button asChild variant="outline" size="md" radius="md" className="flex-1 px-4 sm:flex-none">
        <a href={pngHref(shape.key, variant.key)}>PNG</a>
      </Button>
    </div>
  );
}

/**
 * The three logo forms in the currently selected ink.
 *
 * Exported separately from the stateful shell so the render tier can mount it
 * once per ink and read the tile straight off the markup, for the claims that
 * are about the pairing rather than about clicking.
 *
 * `flex-wrap` with a 240px basis rather than a fixed three-column grid: the
 * three cards sit side by side wherever the content column can hold them and
 * fold to two-then-one on a phone, which is the same idiom ColorSwatchGrid uses
 * one section up.
 */
export function LogoCardRow({ variant }) {
  return (
    <div className="flex flex-wrap gap-3.5">
      {LOGO_SHAPES.map((shape) => (
        <Card key={shape.key} className="flex min-w-0 flex-[1_1_240px] flex-col overflow-hidden">
          <div
            className={cn(
              'flex min-h-[150px] items-center justify-center px-5 py-6',
              // Fixed by the SELECTED INK, never by the theme — see the block
              // note at the top of this file.
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
              src={svgHref(shape.key, variant.key)}
              alt={`${shape.alt} สี ${variant.name}`}
              className={cn('block h-auto w-auto max-w-full', shape.stageHeight)}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="p-4">
            <h3 className="font-heading text-base font-bold text-[var(--text-primary)]">
              {shape.title}
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {shape.blurb}
            </p>
            {/* The ink and the FILE STEM, so the reader knows which of the
                fifteen files the two buttons below are about to hand them
                before clicking either one. */}
            <p className="mt-2 font-en text-xs text-[var(--text-secondary)]">
              {variant.name} · {variant.hex} · {shape.key}-{variant.key}
            </p>
            <DownloadPair shape={shape} variant={variant} />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function BrandAssetExplorer() {
  const [selectedKey, setSelectedKey] = useState(DEFAULT_INK_KEY);
  // Falls back rather than rendering nothing: the only way `find` misses is an
  // ink being dropped from the list, and a blank section 06 would be a worse
  // answer to that than the default ink.
  const variant =
    LOGO_VARIANTS.find((v) => v.key === selectedKey) ??
    LOGO_VARIANTS.find((v) => v.key === DEFAULT_INK_KEY);

  return (
    <div className="space-y-5">
      <InkPicker selectedKey={variant.key} onSelect={setSelectedKey} />
      <LogoCardRow variant={variant} />
    </div>
  );
}
