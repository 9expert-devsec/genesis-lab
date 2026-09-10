import { BRAND_PALETTE, formatRgb, formatCmyk } from '@/lib/brand/palette';

/**
 * The six brand colours, rendered FROM src/lib/brand/palette.js.
 *
 * ── WHY THE CHIP IS AN INLINE STYLE AND NOT A TAILWIND CLASS ────────────────
 * It has to be. Tailwind's JIT emits only the classes it can SEE as literals,
 * so `bg-[${color.hex}]` compiles to nothing — the exact silent-blank failure
 * test/pure/tailwindContentCoverage.test.mjs exists to warn about. A hardcoded
 * six-class map would work and would also be a second copy of the palette,
 * which is what this whole round is removing. `backgroundColor` from the module
 * is the honest form: one value, one source, no build-time coupling.
 *
 * This is also why there is no `dark:` on the chip. It is a colour SAMPLE — a
 * printed reference someone matches artwork against — so it shows the colour
 * itself in both themes. Everything around it (surface, text, hairline) is
 * semantic and does follow the theme.
 */
export function ColorSwatchGrid() {
  return (
    <div className="flex flex-wrap gap-3.5">
      {BRAND_PALETTE.map((color) => (
        <div
          key={color.key}
          className="min-w-0 flex-[1_1_200px] overflow-hidden rounded-9e-md border border-[var(--surface-border)]"
        >
          {/* The sample. A hairline inset keeps Cloud Base (#F8FAFD) from
              vanishing into a light surface — without it the near-white swatch
              reads as an empty box rather than as a colour. */}
          <div
            className="h-[74px] ring-1 ring-inset ring-black/5 sm:h-24"
            style={{ backgroundColor: color.hex }}
            aria-hidden="true"
          />
          <div className="bg-[var(--surface-muted)] p-3.5">
            <p className="text-base font-bold text-[var(--text-primary)]">{color.name}</p>
            <p className="mt-1 font-en text-sm font-bold tracking-wide text-9e-action dark:text-9e-air">
              {color.hex}
            </p>
            <p className="mt-0.5 font-en text-xs leading-relaxed text-[var(--text-secondary)]">
              {formatRgb(color)} · {formatCmyk(color)}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-primary)]">
              {color.role}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
