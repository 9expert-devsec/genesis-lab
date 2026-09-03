import { cn } from "@/lib/utils";
import { spacingBetweenClass } from "@/lib/pageBuilder/presets";

/**
 * container — stacks child sections in a narrower, centred readable column.
 * Server component. Use for prose-like runs of content; use full_width when
 * children should span the whole box.
 *
 * ── THE NARROWNESS MOVED TO THE SCHEMA, AND THAT IS THE FIX ────────────────
 * This used to set its own max-width. That is a second authority over what
 * `settings.containerWidth` already owns, and it silently won: measured in
 * Chrome, the four width settings painted 640 / 768 / 768 / 768, so only
 * `small` did anything and the other three were indistinguishable.
 *
 * The component could not resolve that itself: SectionRenderer handed
 * components `content`, `style`, `layout`, `domId`, `inEditor` and `data` and
 * never `settings`, so there was no value here to defer to. So the type's
 * character moved to where an author can reach it: `container` now DEFAULTS to
 * the narrow column in the schema (see settingsWithContainerWidth in
 * schemas/sections/base) and this renders whatever box it is given.
 *
 * ROUND 71 CHANGED THE PREMISE OF THAT PARAGRAPH: `settings` IS handed down
 * now. It does not reopen the width question — `containerWidth` is applied by
 * the wrapper and this component still must not second-guess it — but the
 * sentence above is no longer a statement about what is possible, only about
 * why the width lives where it does.
 *
 * ── WHY THIS DID NOT DISSOLVE THE TYPE ─────────────────────────────────────
 * The max-width was the only thing separating this from `full_width` — delete
 * it alone and both are a vertical stack with a gap. What separates them now is
 * where they START: this opens at a readable column, `full_width` at the wide
 * default, and either can be moved. Distinguished by a default an author can
 * override rather than by a ceiling they cannot raise.
 *
 * `mx-auto` is kept and is now inert on its own — the wrapper that sizes this
 * box already centres it. It is left because it costs nothing and becomes live
 * again the moment anything gives this element a width of its own.
 */

/**
 * ── ROUND 71: THE GAP BETWEEN CHILDREN IS THE AUTHOR'S NOW ────────────────
 * It was `gap-8`, written here, unreachable. `settings.spacingTop`/
 * `spacingBottom` are the space OUTSIDE this section; nothing was the space
 * BETWEEN its children, so three stacked containers meant three fixed 32px
 * gaps an author could only work around by deleting containers.
 *
 * ABSENT IS STILL 32px. `spacingBetweenClass` answers an absent value with
 * `gap-8` — the exact class that was hardcoded here — so every container
 * stored before this commit renders byte-for-byte what it rendered before.
 * That is checked, not asserted: scripts/_measure-round71-container-gap.mjs
 * renders every stored container against the pre-change component.
 */
export function ContainerSection({ children, settings }) {
  return (
    <div
      className={cn(
        "mx-auto flex flex-col",
        spacingBetweenClass(settings?.spacingBetween),
      )}
    >
      {children}
    </div>
  );
}
