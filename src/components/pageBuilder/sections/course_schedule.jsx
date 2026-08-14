import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveScheduleBadge } from '@/lib/scheduleStatus';
import { formatRoundDays } from '@/lib/schedule/roundDateLabel';

/**
 * course_schedule — upcoming sessions for one course (2C.2b). Server component;
 * it does NOT fetch. The schedules are resolved ABOVE the renderer
 * (resolveSectionData: code→ObjectId→/schedules) and injected as `data`, so the
 * ONE SectionRenderer serves both the public page and the client canvas.
 *
 * canvas-FAKE (see docs/page-builder-status.md §2C.2b): the row set is a function
 * of REQUEST time — upstream returns only upcoming, open/nearly_full sessions, so
 * what publishes depends on when the page is viewed. The canvas can only show an
 * edit-time SAMPLE; the editor LABELS it as such. This component just draws what
 * it is handed.
 *
 * No new client module on the public route: this is server-rendered with CI
 * tokens (§7) — deliberately NOT the `'use client'` ScheduleCard, which would add
 * a client bundle to /[...slug]. Fails closed: an empty resolved set (no course,
 * no upcoming sessions, or an unresolved code) renders nothing; the editor warns.
 */

const TYPE_TH = { classroom: 'ในห้องเรียน', hybrid: 'ไฮบริด', online: 'ออนไลน์' };

/**
 * A round's dates, adapted to this section's null-means-unknown contract.
 *
 * ── THE LOGIC IS NO LONGER LOCAL, AND THE OLD COMMENT WAS THE WARNING ───────
 * This used to be a hand-rolled range with its own `MONTH_TH` array, explaining
 * itself as "mirrors the schedule page's own label logic; kept local because
 * that one is a client component". It did not mirror it — it had drifted, and
 * both were wrong the same way: first-date-to-last-date rendered a round on
 * 8, 10 and 12 ต.ค. as `8-12 ต.ค.`, three days advertised as five.
 *
 * `lib/schedule/roundDateLabel` is a PURE module — no React, no next/*, no db —
 * so the server/client split that justified the copy does not apply to it. The
 * reason the copy existed is gone; the copy goes with it.
 *
 * `showMonth: true` and no year, which is what this section rendered before.
 * The month/year come from Intl, so the eighth `MONTH_TH` array in src/ goes
 * too.
 *
 * @returns {string|null} null when there is no usable date, so the caller's
 *   `range ?? 'ยังไม่ระบุวันที่'` fallback keeps working unchanged.
 */
function formatRange(dates) {
  const label = formatRoundDays(dates, { showMonth: true });
  return label === '-' ? null : label;
}

function scheduleHref(schedule, code) {
  if (schedule?._id && code) {
    return `/registration/public?course=${String(code).toLowerCase()}&class=${schedule._id}`;
  }
  return schedule?.signup_url || null;
}

export function CourseScheduleSection({ content, data }) {
  const schedules = Array.isArray(data) ? data : [];
  if (!schedules.length) return null;
  const code = String(content?.courseId ?? '');

  return (
    <div className="overflow-hidden rounded-9e-md border border-[var(--surface-border)]">
      <ul className="divide-y divide-[var(--surface-border)]">
        {schedules.map((s, i) => {
          const range = formatRange(s?.dates);
          const status = resolveScheduleBadge(s?.status);
          const typeLabel = TYPE_TH[s?.type] ?? null;
          const href = scheduleHref(s, code);

          const row = (
            <div className="flex items-center gap-3 px-4 py-3">
              <CalendarDays className="h-4 w-4 shrink-0 text-9e-action" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[var(--text-primary)]">{range ?? 'ยังไม่ระบุวันที่'}</span>
                {typeLabel && <span className="block text-xs text-[var(--text-secondary)]">{typeLabel}</span>}
              </span>
              {/* Omitted entirely when the status is missing/blank. */}
              {status && (
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', status.soft)}>
                  {status.action}
                </span>
              )}
            </div>
          );

          return (
            <li key={s?._id ?? i}>
              {href ? (
                <a href={href} className="block transition-colors hover:bg-9e-signature-900">{row}</a>
              ) : row}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
