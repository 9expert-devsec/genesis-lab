import { marqueeCopyCount, marqueeTrackVars } from '@/lib/marqueeGeometry.mjs';

const ROW_A_NAMES = [
  'ajinomoto', 'betagro', 'charoen pokphand', 'cpf', 'sony', 'cargill', 'gpv',
  'metropolitan electricity', 'bank of thailand', 'mitsubishi', 'nippon steel',
  'pandora', 'ptt', 'siam cement', 'scg', 'thai beverage', 'thaibev',
  'siam commercial bank', 'scb', 'land and houses bank', 'lh bank',
  'abbott', 'kao',
];

function assignRows(logos) {
  const hasOrder = logos.some((l) => l.display_order > 10);

  if (hasOrder) {
    const sorted = [...logos].sort((a, b) => a.display_order - b.display_order);
    const mid    = Math.ceil(sorted.length / 2);
    return { rowA: sorted.slice(0, mid), rowB: sorted.slice(mid) };
  }

  const rowA = [], rowB = [];
  for (const logo of logos) {
    const name = logo.company_name.toLowerCase();
    const inA  = ROW_A_NAMES.some((k) => name.includes(k));
    (inA ? rowA : rowB).push(logo);
  }
  if (rowA.length === 0 || rowB.length === 0) {
    const half = Math.ceil(logos.length / 2);
    return { rowA: logos.slice(0, half), rowB: logos.slice(half) };
  }
  return { rowA, rowB };
}

export default function ClientLogosSection({ logos }) {
  if (!logos || logos.length === 0) return null;

  const { rowA, rowB } = assignRows(logos);

  return (
    <section
      aria-label="องค์กรที่ให้ความไว้วางใจ"
      /* py-20 in BOTH themes. The `dark:py-12` that used to be here existed
       * only to cancel the panel's `dark:py-8`; with the panel gone there is
       * nothing to compensate, and a theme-conditional padding would be the
       * very reflow-on-toggle it was added to prevent. */
      /* ROUND HS-B: bg-[var(--page-bg)] alone, no dark: override — --page-bg
         already differs FFFFFF (light) / 0D1B2A (dark) in globals.css, so the
         explicit dark:bg-[var(--page-bg)] this used to carry was redundant
         (it named the same var the base class now already resolves under
         .dark). Dropping bg-[var(--page-bg-muted)] also means the section no
         longer stands out as a distinct muted band from its neighbours. */
      className="overflow-hidden bg-[var(--page-bg)] py-20"
    >
      <div className="mx-auto max-w-[1200px] text-center">
        <h2 className="font-heading text-[28px] font-bold text-9e-navy dark:text-white">
          องค์กรที่ให้ความไว้วางใจ
        </h2>
        <p className="mt-3 font-thai text-9e-slate-dp-50 dark:text-9e-slate-dp-400">
          ได้รับความไว้วางใจจากบริษัทและองค์กรชั้นนำมากกว่า 5,000 แห่ง ครอบคลุมหลากหลายอุตสาหกรรม
        </p>
      </div>

      <p className="sr-only">
        บริษัทและองค์กรชั้นนำที่ใช้บริการ ได้แก่ {rowA.concat(rowB).map(l => l.company_name).join(', ')}
      </p>

      {/* No panel, no tiles. The rows sit directly on the section background,
        * so each row's `mask-image` fades its edges into the page colour —
        * which is what a mask does when nothing is layered behind it. The
        * light-panel version terminated the fade on the panel's own hard
        * edge, which read as clipping rather than fading. */}
      <div className="mt-14 space-y-6">
        <MarqueeRow logos={rowA} direction="left" speed={40} />
        <MarqueeRow logos={rowB} direction="right" speed={35} />
      </div>
    </section>
  );
}

/**
 * One scrolling row. THE MOTION IS A CSS ANIMATION ON THE COMPOSITOR.
 *
 * It used to be a requestAnimationFrame loop writing `transform` from the main
 * thread, so anything else on that thread (hydration, other scripts) dropped
 * frames and the logos stuttered; and it wrapped at `scrollWidth / 3`, one gap
 * short of the real period, so every loop jumped 16px. Now:
 *
 *   · the track holds `copies` identical copies, each its own flex wrapper
 *     carrying the 48px gap INSIDE (`gap-12`) and AFTER itself (`pr-12`), with
 *     no gap between copies — so one copy's width IS the repeat period;
 *   · @keyframes (globals.css) move the track by exactly one copy,
 *     `--marquee-shift` = −100/copies % of its own width, linear, infinite;
 *   · `--marquee-duration` = period / speed, so each row keeps its px/s.
 *
 * Pause on hover and the reduced-motion stop are CSS too (globals.css), so
 * this component has no state, no effect and no client JavaScript at all.
 * The copy count comes from lib/marqueeGeometry: enough copies to keep the
 * 1200px window covered (2 for today's 21 logos per row).
 */
function MarqueeRow({ logos, direction, speed = 40 }) {
  const copies = marqueeCopyCount(logos.length);

  return (
    <div
      aria-hidden="true"
      role="presentation"
      className="marquee-row relative overflow-hidden max-w-[1200px] mx-auto"
      style={{
        maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
      }}
    >
      <div
        className={`marquee-track marquee-track--${direction === 'right' ? 'right' : 'left'} flex items-center will-change-transform`}
        style={{ width: 'max-content', ...marqueeTrackVars(logos.length, speed) }}
      >
        {Array.from({ length: copies }, (_, copy) => (
          /* One copy = one period: the 48px gap between its logos AND after
             the last one (pr-12), so copies abut with no gap of their own. */
          <div key={copy} className="flex shrink-0 items-center gap-12 pr-12">
            {logos.map((logo) => (
              /* Plain slot — no background, no rounding, in either mode. */
              <div
                key={`${logo._id}-${copy}`}
                className="flex h-[72px] w-[140px] shrink-0 items-center justify-center"
              >
            {/* MONOCHROME WALL, dark mode only.
              *
              * `brightness-0 invert` maps every opaque pixel to the same
              * white, at FULL opacity — the `opacity-40` that used to sit
              * alongside it was the actual defect, turning the wall into
              * ghosts. Light mode is untouched: original colour, full opacity.
              *
              * The exception is data, not a name list: brightness(0) erases
              * every ENCLOSED counter-form, so a logo whose mark depends on
              * one (the gold tree inside SCB's purple square, the '9' inside
              * Praram 9's teal block) collapses to a featureless blob. Those
              * carry `keepColorOnDark` and render in original colour, which
              * is legible because their bright elements sit inside their own
              * coloured fields. See ClientLogo.keepColorOnDark. */}
            {/* EAGER: a copy slides in from OUTSIDE the viewport, where a lazy
              * image has not been fetched yet — it showed blank and then
              * popped in. The copies share each unique URL, so eager costs no
              * extra bytes, and the fixed 140×72 slot means nothing shifts
              * while a logo loads. */}
            <ClientLogoImage
              logo={logo}
              className="h-auto max-h-[52px] w-auto max-w-[130px] object-contain"
              loading="eager"
            />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * One client logo with the dark-mode treatment above. Exported so the About
 * page's static logo wall renders logos exactly as this marquee does, rather
 * than spelling a second version of the knockout and its exception.
 *
 * `loading` defaults to lazy (the About wall); the marquee passes "eager".
 */
export function ClientLogoImage({ logo, className, loading = 'lazy' }) {
  return (
    <img
      src={logo.image_url}
      alt={logo.company_name}
      className={className + (logo.keepColorOnDark ? '' : ' dark:brightness-0 dark:invert')}
      loading={loading}
      decoding="async"
      draggable={false}
    />
  );
}
