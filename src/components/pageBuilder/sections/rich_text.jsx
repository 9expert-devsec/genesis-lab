import { renderTiptap } from '../richText/tiptapToReact';

/**
 * rich_text — renders Tiptap JSON (content.doc) directly to React via the
 * walker (no HTML string, no server-side sanitizer, no jsdom). Server
 * component. Typography comes from the `prose` plugin; links pick up the
 * section accent. The supported node/mark set is documented in the walker.
 */
export function RichTextSection({ content }) {
  const nodes = renderTiptap(content?.doc);
  if (!nodes) return null;
  return (
    <div className="prose prose-lg max-w-none prose-headings:font-heading prose-a:text-[var(--pb-accent-text)] prose-img:rounded-9e-md dark:prose-invert">
      {nodes}
    </div>
  );
}
