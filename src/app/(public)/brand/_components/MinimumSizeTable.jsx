import { MINIMUM_SIZE_COLUMNS, MINIMUM_SIZE_ROWS } from '../brandContent';

/**
 * ขนาดเล็กที่สุดที่ใช้ได้ — four rows of minimums, screen and print.
 *
 * ── WRITTEN HERE BECAUSE THE REPO HAS NO SHARED TABLE ───────────────────────
 * Checked before writing it: there is no <table> primitive anywhere in
 * src/components, and no admin list to borrow from that is not bound to its own
 * data shape. This is four rows of static reference values, so it is a real
 * <table> — the values are tabular data a reader compares down a column, not a
 * layout — with <th scope="col"> so a screen reader announces which column each
 * cell belongs to.
 *
 * ── THE HORIZONTAL SCROLL IS LOAD-BEARING ───────────────────────────────────
 * Four columns, one of them a Thai sentence, do not fit a phone. The wrapper
 * scrolls the TABLE rather than letting the table widen the page: without it
 * the whole document gets a horizontal scrollbar and every other section
 * inherits the overflow.
 */
export function MinimumSizeTable() {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr>
            {MINIMUM_SIZE_COLUMNS.map((label) => (
              <th
                key={label}
                scope="col"
                className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)] px-3 py-2.5 text-left font-bold text-[var(--text-primary)]"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MINIMUM_SIZE_ROWS.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, column) => (
                <td
                  key={cell}
                  className={
                    column === 0
                      ? 'border-b border-[var(--surface-border)] px-3 py-2.5 align-top font-semibold text-[var(--text-primary)]'
                      : 'border-b border-[var(--surface-border)] px-3 py-2.5 align-top text-[var(--text-secondary)]'
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
