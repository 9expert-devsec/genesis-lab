import { cn } from '@/lib/utils';

/**
 * A grid of name → copy cards. Two uses on this page: Logo Meaning's elements
 * and Logo Anatomy's parts.
 *
 * Core Values and Brand Personality used to be here too, and were moved out to
 * BrandTraits: rendering that pair identically was the bug — they share three
 * names, and matching grids made the overlap look accidental. Do NOT route
 * either back through here to "reuse the component".
 *
 * Both remaining uses are the same shape in the source document — a two-column
 * table of a short label against one Thai sentence — so they stay one component
 * rather than two grids that would drift a gap and a font-weight apart within
 * a month.
 *
 * ── WHY NOT A <table> ───────────────────────────────────────────────────────
 * The source draws these as tables, but they are not tabular DATA: nobody reads
 * down the "copy" column comparing values, and a two-column table of label and
 * sentence is a definition list wearing a table's clothes. `<dl>` says what the
 * relationship actually is, and it reflows to one column on a phone without a
 * horizontal scroller. The one real table on this page — Minimum Size, where
 * the numbers ARE compared down the column — stays a <table>.
 */
export function DefinitionGrid({ items, columns = 2, className }) {
  return (
    <dl
      className={cn(
        'grid gap-3',
        columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2',
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.name}
          className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4"
        >
          <dt className="font-en text-[15px] font-bold text-[var(--text-primary)]">
            {item.name}
          </dt>
          <dd className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
            {item.copy}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A plain bulleted list of Thai sentences — Mission, Logo Construction's
 * measurements. Not a DefinitionGrid: these have no label half.
 */
export function CopyList({ items, className }) {
  return (
    <ul className={cn('space-y-1.5', className)}>
      {items.map((item) => (
        <li
          key={item}
          className="flex gap-2.5 text-sm leading-relaxed text-[var(--text-primary)]"
        >
          {/* A marker rather than list-disc: the bullet takes the brand accent
              and stays aligned to the first line of a sentence that wraps. */}
          <span
            className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-9e-action dark:bg-9e-air"
            aria-hidden="true"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A titled, UNCOLOURED block of rules — `Rules` under Logo Anatomy,
 * `Requirements` under Do & Don't.
 *
 * ── WHY NOT A GuidancePanel ─────────────────────────────────────────────────
 * Because both lists are MIXED, and the green/rose pair would lie about them.
 * Logo Anatomy's rules run "ห้ามแยกองค์ประกอบ…" (a don't), "ต้องคงสัดส่วน…"
 * (a must) and "ใช้เฉพาะ Artwork มาตรฐาน…" (a must); Requirements is the same
 * shape. Rendering either in rose reads as "all of these are forbidden" and in
 * green as "all of these are encouraged" — and a reader who trusts the colour
 * over the Thai gets the second item backwards. Neutral makes no claim the
 * copy does not.
 */
export function LabelledBlock({ title, items, as = 'h4' }) {
  // `as` for the same reason GuidancePanel takes it: this title is a heading,
  // and whether it is an h3 or an h4 depends on whether a Subsection sits above
  // it at the call site. A <p> would have kept it out of the outline entirely.
  const Heading = as;
  return (
    <div className="rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface-muted)] p-4">
      <Heading className="font-en text-[15px] font-bold text-[var(--text-primary)]">
        {title}
      </Heading>
      <CopyList items={items} className="mt-2.5" />
    </div>
  );
}

/**
 * A single quoted statement — Vision, Brand Purpose. One sentence each in the
 * source, and both carry more weight than a paragraph of body copy, so they get
 * an accent edge rather than being lost between two headings.
 */
export function StatementBlock({ children }) {
  return (
    <p className="border-l-2 border-9e-action pl-4 text-[15px] leading-relaxed text-[var(--text-primary)] dark:border-9e-air">
      {children}
    </p>
  );
}
