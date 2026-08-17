/**
 * Shared shell for every panel on /admin/cache.
 *
 * Presentational and SYNCHRONOUS on purpose — the page does all the awaiting
 * and passes plain data down, so each panel can be driven by
 * renderToStaticMarkup in the render tier. An async server component cannot be,
 * and a test that mounted a React root to get around that would leak
 * globalThis.window into every other renderToStaticMarkup test in the run
 * (the runner is isolation:'none', one shared process).
 */
export function Panel({ title, subtitle, children }) {
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-5">
      <h2 className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * A read that failed, rendered as itself.
 *
 * This screen is opened BECAUSE something looks wrong, so a panel that cannot
 * read its data has to say so in place rather than render as empty — an empty
 * panel and a broken one look identical, and the empty reading is the
 * reassuring one.
 */
export function PanelError({ label, error }) {
  return (
    <p className="rounded-9e-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-300">
      อ่าน {label} ไม่สำเร็จ — ตัวเลขในแผงนี้จึงไม่ใช่ &quot;ศูนย์&quot; แต่คือ &quot;ไม่ทราบ&quot;
      {' '}(This panel could not read its data. The numbers below are absent, not zero.)
      <span className="mt-1 block break-all font-mono text-xs">{error}</span>
    </p>
  );
}

/** A labelled value. `mono` for machine strings (timestamps, counts, tags). */
export function Field({ label, value, mono = false }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span
        className={
          mono
            ? 'break-all font-mono text-sm text-[var(--text-primary)]'
            : 'text-sm text-[var(--text-primary)]'
        }
      >
        {value}
      </span>
    </div>
  );
}
