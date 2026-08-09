import { resolveTaxonomyNames } from '@/lib/articleTaxonomy';

/**
 * The two chip rows an article card wears, shared by /articles and the
 * landing page's BlogSection.
 *
 * ── SHARED COMPONENTS, NOT SHARED-LOOKING MARKUP ────────────────────────────
 * Both cards previously drew their own chips. Two copies of one visual element
 * is how the chat avatar's two rows silently drifted apart — one drew the
 * mascot, the other an empty circle, for as long as nobody looked at both at
 * once. A copy that is byte-identical today is caught only by a structural
 * guard, so these are components rather than a documented convention.
 *
 * ── AN ID WITH NO NAME IS DROPPED, NEVER PRINTED ────────────────────────────
 * Resolution and that rule live in src/lib/articleTaxonomy.js — see the note
 * there. A row with nothing left to show renders NO WRAPPER AT ALL rather than
 * an empty element: in the body that would be a strip of padding, and in the
 * overlay a transparent box floating on the artwork.
 */

/**
 * The cover overlay: PROGRAM names.
 *
 * `cap` IS REQUIRED AND HAS NO DEFAULT, exactly like SkillChips below. An
 * earlier draft hid a 2 in here on the reasoning that the cap "is about the
 * artwork, not the column" — that inverts. The artwork's RENDERED width IS the
 * column width, so this row is subject to the same 384px/288px difference, and
 * it is MORE width-sensitive than the body chips, not less: skill chips sit in
 * normal flow and wrap when they run out of room, while this row is absolutely
 * positioned and instead runs into whatever the cover art puts at the opposite
 * corner. That is the chat course-card bug — a two-chip row growing off its
 * corner into the 9Expert logo until neither was readable.
 *
 * ── THE CONSTRAINT IS THE CARD EDGE ────────────────────────────────────────
 * An earlier version of this note said the binding limit was the 9Expert logo
 * at ~86% of the cover width, and gave a ~199px text budget from it. THAT WAS
 * DRAWN FROM TWO IMAGES and does not generalise. Measured over the real
 * population: of 487 active articles, 479 covers are legacy files on
 * www.9experttraining.com and only 5 are the newer Cloudinary artwork; of the
 * 57 that carry a program and could therefore show this overlay, 53 are legacy.
 * A sample of those legacy covers includes one with NO 9Expert logo at all
 * (a screenshot, with dense UI content exactly where this row sits) and one
 * with the logo BOTTOM-right. The top-right logo is a property of the
 * Cloudinary artwork specifically.
 *
 * So the general limit is the CARD EDGE, which is also what the sizing ruling
 * actually used. Measured at 11px in the shipped GoogleSans-Medium, chips
 * adding 16px padding each plus a 4px gap, overlay inset 12px:
 *
 *   card    usable   widest real pair (185.8px)
 *   288px   264px    fits, 78px spare      (xl grid, and the slider at xl)
 *   232px   208px    fits, 22px spare      (slider at lg)
 *   172px   148px    OVERFLOWED by 37.8px  (slider at md — now unreachable)
 *
 * That 172px was the old BlogSlider showing 4 cards per view at every width.
 * It now matches the grid — 2 at md, 3 at lg, 4 at xl — so the narrowest card
 * this overlay can land on is 288px. If that ever changes, THIS is the table to
 * redo; the logo is not the thing to measure against.
 *
 * So both call sites pass 2 and both carry their own measurement. Two callers
 * passing the same value does not imply they must agree — it records that the
 * constraint is per-surface and currently resolves the same way. The day the
 * landing grid becomes 5 columns, the failure shows up at the call site rather
 * than inside a component that never heard about it.
 *
 * No "+N" counter: a `+1` in this position reads as part of the photograph.
 *
 * A <span> rather than a <div> because this subtree sits inside the cover <a>.
 * The chips are NON-INTERACTIVE and that is not an oversight: making them link
 * to `?program=` would nest an anchor inside an anchor — invalid HTML that
 * React renders anyway and browsers resolve by silently splitting the outer
 * link, breaking the card's own click target.
 */
export function ProgramOverlay({ ids, names, cap }) {
  const programs = resolveTaxonomyNames(ids, names, cap);
  if (programs.length === 0) return null;

  return (
    <span className="absolute left-3 top-3 flex flex-wrap gap-1">
      {programs.map((name) => (
        <span
          key={name}
          className="rounded-full bg-9e-action px-2 py-0.5 text-[11px] font-medium text-white"
        >
          {name}
        </span>
      ))}
    </span>
  );
}

/**
 * The body row: SKILL names.
 *
 * `cap` IS REQUIRED AND HAS NO DEFAULT. The two pages genuinely differ — 3 on
 * /articles, 2 on the landing — for a measured reason (column width, see each
 * call site), and a default here would hide that difference behind a number
 * nobody chose. A missing cap should be a visible mistake, not a silent 3.
 *
 * Colours: `text-9e-action` with `dark:text-9e-air`. The dark override is not
 * cosmetic — #005CFF on #111d2c measures 3.22:1 where WCAG AA needs 4.5:1 for
 * 11px text; #48B0FF measures 7.22:1. See the commit that fixed it.
 */
export function SkillChips({ ids, names, cap }) {
  const skills = resolveTaxonomyNames(ids, names, cap);
  if (skills.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {skills.map((name) => (
        <span
          key={name}
          className="rounded-full bg-9e-ice px-2 py-0.5 text-[11px] text-9e-action dark:bg-[#111d2c] dark:text-9e-air"
        >
          {name}
        </span>
      ))}
    </div>
  );
}
