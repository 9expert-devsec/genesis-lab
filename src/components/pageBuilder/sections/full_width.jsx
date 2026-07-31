/**
 * full_width — a container that stacks its child sections vertically, each
 * spanning the full width of the section box. Server component. Recursion is
 * owned by the renderer: `children` are already-rendered child sections.
 */
export function FullWidthSection({ children }) {
  return <div className="flex flex-col gap-8">{children}</div>;
}
