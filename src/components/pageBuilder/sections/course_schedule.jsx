import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

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

const MONTH_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const STATUS = {
  open:        { label: 'รับสมัคร', cls: 'bg-9e-green-900 text-9e-green-50' },
  nearly_full: { label: 'ใกล้เต็ม', cls: 'bg-9e-orange-900 text-9e-orange-50' },
  full:        { label: 'เต็ม',     cls: 'bg-red-50 text-red-600' },
};

const TYPE_TH = { classroom: 'ในห้องเรียน', hybrid: 'ไฮบริด', online: 'ออนไลน์' };

// Format a schedule's `dates` array into a compact Thai range: "17-18 ต.ค." or
// "30 ต.ค. - 2 พ.ย." across a month boundary. Mirrors the schedule page's own
// label logic; kept local because that one is a client component.
function formatRange(dates) {
  const parsed = (Array.isArray(dates) ? dates : [])
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b);
  if (!parsed.length) return null;
  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  if (parsed.length === 1 || first.getTime() === last.getTime()) {
    return `${first.getDate()} ${MONTH_TH[first.getMonth()]}`;
  }
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()}-${last.getDate()} ${MONTH_TH[first.getMonth()]}`;
  }
  return `${first.getDate()} ${MONTH_TH[first.getMonth()]} - ${last.getDate()} ${MONTH_TH[last.getMonth()]}`;
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
          const status = STATUS[s?.status] ?? STATUS.open;
          const typeLabel = TYPE_TH[s?.type] ?? null;
          const href = scheduleHref(s, code);

          const row = (
            <div className="flex items-center gap-3 px-4 py-3">
              <CalendarDays className="h-4 w-4 shrink-0 text-9e-action" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[var(--text-primary)]">{range ?? 'ยังไม่ระบุวันที่'}</span>
                {typeLabel && <span className="block text-xs text-[var(--text-secondary)]">{typeLabel}</span>}
              </span>
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', status.cls)}>
                {status.label}
              </span>
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
