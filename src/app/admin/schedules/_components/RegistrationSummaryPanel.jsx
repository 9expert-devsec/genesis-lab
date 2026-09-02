'use client';

/**
 * The loaded half of a round's details view: a total and a per-status
 * breakdown, or a sentence saying nobody registered.
 *
 * ── WHY IT IS ITS OWN COMPONENT AND NOT A BRANCH INSIDE THE MODAL ──────────
 * The modal owns a fetch. Its `ready` markup therefore only exists after an
 * effect has run and a promise has resolved, which `renderToStaticMarkup` never
 * does — a render test of the modal can only ever see "กำลังโหลด…". Splitting
 * the presentation out means the two states that actually carry the answer are
 * reachable from a fixture, with no test-only prop threaded through the modal
 * and no stubbed server action.
 *
 * It takes a summary and renders it. It fetches nothing, stores nothing, and
 * writes nothing.
 */
export function RegistrationSummaryPanel({ summary }) {
  const total = summary?.total ?? 0;

  if (total === 0) {
    /*
      ── THE EMPTY STATE IS A SENTENCE, NOT FOUR ZEROS ───────────────────────
      A round nobody booked is an ordinary outcome and this says so in words.
      Drawing the breakdown with every count at 0 would look identical to a join
      that silently matched nothing — same four rows, same four zeros — and an
      admin could not tell from the screen which of the two they were looking
      at. One of those needs no action and the other is a bug.
    */
    return (
      <div className="rounded-9e-md border border-dashed border-[var(--surface-border)] px-3 py-6 text-center">
        <div className="text-sm text-9e-navy dark:text-white">
          ไม่มีผู้ลงทะเบียนในรอบนี้
        </div>
        <div className="mt-1 text-xs text-9e-slate-dp-50">
          ไม่พบใบสมัครแบบสาธารณะที่ผูกกับรอบอบรมนี้
        </div>
      </div>
    );
  }

  /*
   * Known statuses first, in the vocabulary's own pipeline order, then anything
   * stored that the vocabulary does not know. Concatenated rather than merged
   * and re-sorted, so an unrecognised value can never be mistaken for a step of
   * the pipeline by appearing in the middle of it.
   */
  const rows = [...(summary.known ?? []), ...(summary.unrecognised ?? [])];

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between rounded-9e-md border border-[var(--surface-border)] px-3 py-2">
        <span className="text-sm text-9e-slate-dp-50">ทั้งหมด</span>
        <span className="text-lg font-bold text-9e-navy dark:text-white">
          {total}
        </span>
      </div>

      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.value || '(unset)'}
            className="flex items-center justify-between gap-3"
          >
            <span
              className={'rounded-full px-2 py-0.5 text-[11px] font-medium ' + row.badge}
            >
              {row.label}
            </span>
            <span className="text-sm font-medium text-9e-navy dark:text-white">
              {row.count}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
