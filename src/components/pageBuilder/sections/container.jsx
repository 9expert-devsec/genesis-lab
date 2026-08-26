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
 * The component cannot resolve that itself — SectionRenderer hands components
 * `content`, `style`, `layout`, `domId`, `inEditor` and `data`, never
 * `settings`, so there is no value here to defer to. So the type's character
 * moved to where an author can reach it: `container` now DEFAULTS to the narrow
 * column in the schema (see settingsWithContainerWidth in schemas/sections/base)
 * and this renders whatever box it is given.
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
export function ContainerSection({ children }) {
  return <div className="mx-auto flex flex-col gap-8">{children}</div>;
}
