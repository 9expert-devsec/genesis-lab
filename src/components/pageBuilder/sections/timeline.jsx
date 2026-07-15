/**
 * timeline — a vertical list of title/body milestones with an accent marker on
 * a connector line. Server component (item-based; no child sections). Body is
 * plain text with line breaks preserved.
 */
export function TimelineSection({ content }) {
  const items = (Array.isArray(content?.items) ? content.items : []).filter(
    (it) => it && (it.title || it.body)
  );
  if (!items.length) return null;

  return (
    <ol className="relative ml-1 border-l-2 border-[var(--surface-border)] pl-6">
      {items.map((it, i) => (
        <li key={i} className="relative pb-8 last:pb-0">
          <span
            className="absolute -left-[29px] top-1.5 h-3 w-3 rounded-full bg-[var(--pb-accent-fill)] ring-4 ring-white dark:ring-[#0D1B2A]"
            aria-hidden
          />
          {it.title && <h3 className="font-heading text-lg font-bold">{it.title}</h3>}
          {it.body && (
            <p className="mt-1 whitespace-pre-line text-9e-slate-dp-50 dark:text-[#94a3b8]">{it.body}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
