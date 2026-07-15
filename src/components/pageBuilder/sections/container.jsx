/**
 * container — stacks child sections in a narrower, centred readable column
 * (inside the section box's own width). Server component. Use for prose-like
 * runs of content; use full_width when children should span the whole box.
 */
export function ContainerSection({ children }) {
  return <div className="mx-auto flex max-w-3xl flex-col gap-8">{children}</div>;
}
