import Link from 'next/link';
import { panelFailureMessage } from '@/lib/chatPanel/messages';
import { RANGE_PRESETS, presetRange } from '@/lib/chatPanel/range';

/**
 * The plain building blocks of the three /admin/chat pages.
 *
 * ── SERVER COMPONENTS, ALL OF THEM — NO 'use client' ────────────────────────
 * Deliberate and load-bearing. The pages import src/lib/chatPanel/client.js,
 * which is `server-only`; a client component anywhere under this tree that
 * imported a helper from here would be one hop from that module, and
 * test/fs/chatPanelBundleGuard walks those hops. So the range control is a
 * plain GET <form> with native date inputs and the presets are plain links —
 * no router, no state, nothing to hydrate. The dashboard's RangeControl is a
 * client component because it lives in one; this surface has no reason to be.
 *
 * ── PLAIN ON PURPOSE (round B2) ─────────────────────────────────────────────
 * Numbers, tables and links. No chart, no chip, no filter beyond the three the
 * brief lists. Round B3 does the visual design from a mockup; anything drawn
 * here now would be drawn twice.
 *
 * ── THE RANGE LIVES IN THE URL ──────────────────────────────────────────────
 * `range` arrives as a prop the page read from searchParams on THIS request.
 * Nothing here copies it anywhere; the form's inputs are seeded with
 * `defaultValue` and keyed on the value so a navigation re-seeds them (the
 * same shape the dashboard's picker uses — see test/fs/urlFilterNoState).
 */

export const PANEL_MAX_WIDTH = 'mx-auto max-w-7xl space-y-6';

const CARD = 'rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]';
const TH = 'px-4 py-2.5 text-left text-xs font-medium text-[var(--text-secondary)]';
const TD = 'px-4 py-2.5 align-top text-sm text-[var(--text-primary)]';
const LINK = 'text-9e-action underline-offset-2 hover:underline';
const BTN = 'rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]';
const BTN_ACTIVE = 'rounded-9e-md bg-9e-navy px-3 py-1.5 text-xs font-semibold text-9e-ice';
const INPUT = 'h-[30px] rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-2 text-[12px] text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-9e-brand';

export function PanelHeading({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-[var(--text-primary)]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** `?from=&to=` plus any carried params, as a query string for `href`. */
export function rangeHref(basePath, { from, to }, extra = {}) {
  const q = new URLSearchParams();
  q.set('from', from);
  q.set('to', to);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  return `${basePath}?${q.toString()}`;
}

/**
 * The window control: four preset links and a from/to form. `carry` is the
 * page's other URL state (vote, has_error) so choosing a window does not drop
 * a filter; `page` is deliberately NOT carried — a new window starts at page 1.
 */
export function PanelRangeControl({ basePath, range, carry = {}, now = Date.now() }) {
  const invalid = range.source === 'invalid';
  return (
    <div className="space-y-2" data-testid="panel-range">
      <div className="flex flex-wrap items-center gap-2">
        {RANGE_PRESETS.map((p) => {
          const r = presetRange(p, now);
          const active = r.from === range.from && r.to === range.to;
          return (
            <Link key={p.key} href={rangeHref(basePath, r, carry)} className={active ? BTN_ACTIVE : BTN} aria-current={active ? 'true' : undefined}>
              {p.label}
            </Link>
          );
        })}
        <form method="get" action={basePath} className="flex items-center gap-1.5 rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-1">
          {Object.entries(carry).map(([k, v]) => (
            v !== undefined && v !== null && v !== '' ? <input key={k} type="hidden" name={k} value={String(v)} /> : null
          ))}
          <input type="date" name="from" defaultValue={range.from} key={`from-${range.from}`} aria-label="ตั้งแต่วันที่" className={INPUT} required />
          <span className="text-[12px] text-[var(--text-muted)]">–</span>
          <input type="date" name="to" defaultValue={range.to} key={`to-${range.to}`} aria-label="ถึงวันที่" className={INPUT} required />
          <button type="submit" className={BTN}>แสดง</button>
        </form>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        ช่วงวันที่ {range.from} ถึง {range.to} (เวลาไทย, สูงสุด 92 วัน)
        {invalid ? ' — ช่วงวันที่ในลิงก์ไม่ถูกต้อง จึงแสดงช่วงเริ่มต้นแทน' : ''}
      </p>
    </div>
  );
}

/** The one sentence for a failed read. `reason` is a PANEL_FAILURE_REASONS member. */
export function PanelFailure({ reason }) {
  return (
    <div role="status" data-testid="panel-failure" data-reason={reason}
      className="rounded-9e-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      {panelFailureMessage(reason)}
    </div>
  );
}

export function PanelNote({ children, testId }) {
  return (
    <div role="note" data-testid={testId}
      className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">
      {children}
    </div>
  );
}

/** A labelled plain number. */
export function TotalsRow({ items }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="panel-totals">
      {items.map((it) => (
        <div key={it.key} className={`${CARD} px-4 py-3`} data-total={it.key}>
          <dt className="text-xs text-[var(--text-secondary)]">{it.label}</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-[var(--text-primary)]">{fmtInt(it.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A plain table. `columns` = [{ key, label, render?, className? }];
 * `rows` = objects; `rowKey` names the unique field. Empty → one line.
 */
export function PlainTable({ title, columns, rows, rowKey, empty = 'ไม่มีข้อมูลในช่วงนี้', testId, footer = null }) {
  return (
    <section className={CARD} data-testid={testId}>
      {title ? <h2 className="border-b border-[var(--surface-border)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)]">{title}</h2> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
            <tr>{columns.map((c) => <th key={c.key} className={`${TH} ${c.className ?? ''}`}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">{empty}</td></tr>
            ) : rows.map((row, i) => (
              <tr key={rowKey ? String(row[rowKey]) : i} className="border-b border-[var(--surface-border)] last:border-b-0">
                {columns.map((c) => (
                  <td key={c.key} className={`${TD} ${c.className ?? ''}`}>
                    {c.render ? c.render(row, i) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </section>
  );
}

/** A ranked list ({ label, count, href? }) as a three-column table. */
export function RankedTable({ title, items, testId, labelHeading = 'รายการ' }) {
  const columns = [
    { key: 'rank', label: '#', className: 'w-10 tabular-nums', render: (_r, i) => i + 1 },
    { key: 'label', label: labelHeading, render: (r) => (r.href ? <Link href={r.href} className={LINK}>{r.label}</Link> : r.label) },
    { key: 'count', label: 'จำนวน', className: 'w-24 text-right tabular-nums', render: (r) => fmtInt(r.count) },
  ];
  return <PlainTable title={title} columns={columns} rows={items} rowKey="label" testId={testId} />;
}

/** Previous / next as plain links, driven by page and total. */
export function PanelPager({ basePath, page, pageSize, total, carry = {} }) {
  const pageCount = Math.max(1, Math.ceil((Number(total) || 0) / (Number(pageSize) || 1)));
  const link = (p) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(carry)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    q.set('page', String(p));
    return `${basePath}?${q.toString()}`;
  };
  const disabled = 'rounded-9e-md border border-[var(--surface-border)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] opacity-40';
  return (
    <div className="flex items-center justify-between border-t border-[var(--surface-border)] px-4 py-3" data-testid="panel-pager">
      {page > 1 ? <Link href={link(page - 1)} className={BTN} rel="prev">ก่อนหน้า</Link> : <span className={disabled}>ก่อนหน้า</span>}
      <span className="text-xs text-[var(--text-secondary)]">หน้า {page} / {pageCount} — ทั้งหมด {fmtInt(total)} รายการ</span>
      {page < pageCount ? <Link href={link(page + 1)} className={BTN} rel="next">ถัดไป</Link> : <span className={disabled}>ถัดไป</span>}
    </div>
  );
}

export function PanelLink({ href, children, external = false }) {
  if (external) {
    return <a href={href} className={LINK} target="_blank" rel="noopener noreferrer">{children}</a>;
  }
  return <Link href={href} className={LINK}>{children}</Link>;
}

// ── formatting ───────────────────────────────────────────────────────────────

export function fmtInt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '–';
  return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 }).format(v);
}

/**
 * An ISO timestamp as `YYYY-MM-DD HH:mm` in Asia/Bangkok. The service already
 * sends +07:00, but formatting through the zone rather than slicing the string
 * means a UTC timestamp from a future version reads the same. Unparseable → '–'.
 */
export function fmtBangkok(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}
