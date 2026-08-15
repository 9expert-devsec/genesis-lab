'use client';

import { useTransition, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { refNo } from '@/lib/refNo';
import { LastEditedHint } from '@/components/audit/auditRowParts';
import {
  buildStatCards,
  buildStatusChips,
  buildStatusLabels,
  statusesForSource,
} from '@/lib/registrations/statuses';
import { InhouseTable } from './InhouseTable';

// ── Constants ──────────────────────────────────────────────────────

/**
 * ONE MODULE, TWO SUBSETS — NEITHER WRITTEN HERE.
 *
 * The two vocabularies used to be two modules aliased apart in this file,
 * because in-house stored new / contacted / quoted / closed-won / closed-lost
 * and public stored pending / confirmed / paid / cancelled. Round 2 collapsed
 * in-house onto the same three values public already uses, so there is now one
 * module with a per-source SUBSET — and `statusesForSource` is the only place
 * `source` turns into a list.
 *
 * The subsets stay distinct even though the module is shared: `paid` is PUBLIC
 * ONLY, and merging the two lists is how a `ชำระแล้ว` card would appear over a
 * collection that can never hold one. That is the same rule this screen already
 * had to learn — no branch may render a value the data does not hold.
 *
 * The public side used to be three hand-written lists in this file — the filter
 * options, the label map and the stat-card literal — which is the same shape
 * that had already drifted on the in-house side.
 */
const RANGE_OPTIONS = [
  { value: 'all',   label: 'ทั้งหมด' },
  { value: 'today', label: 'วันนี้' },
  { value: 'week',  label: '7 วัน' },
  { value: 'month', label: 'เดือนนี้' },
];

const STATUS_BADGE = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  paid:      'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

/**
 * value → Thai label, for the public สถานะ cell.
 *
 * DERIVED. A status with no entry here renders its raw enum value in the table,
 * which is the same class of bug as a status with no card — and it is how
 * `confirmed` came to be labelled 'ยืนยันแล้ว' in five places and needed
 * changing in five places.
 *
 * The in-house rows do not read this map: InhouseTable derives its own labels
 * from the in-house subset.
 */
const STATUS_LABEL = buildStatusLabels();

const SCHEDULE_BADGE = {
  hybrid:    'bg-violet-100 text-violet-700',
  online:    'bg-emerald-100 text-emerald-700',
  classroom: 'bg-sky-100 text-sky-700',
};

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/**
 * THE DETAIL ROUTE FOR A ROW — and there are two of them, not one.
 *
 * This list renders BOTH collections: `source` picks which one, and each has
 * its own fully-built detail page. `/admin/registrations/[id]` reads
 * `register_public`; `/admin/registrations/inhouse/[id]` reads
 * `register_inhouse`. They are separate collections, so an in-house `_id` sent
 * to the public route finds nothing and the page calls `notFound()` — a 404 on
 * a record that exists, with a working page sitting one segment away.
 *
 * `source` is the same value the list query used to choose the model, so the
 * link cannot disagree with the row it is attached to.
 */
function detailHref(source, id) {
  return source === 'inhouse'
    ? `/admin/registrations/inhouse/${id}`
    : `/admin/registrations/${id}`;
}


// ── Main Component ─────────────────────────────────────────────────

/**
 * ── THE FILTERS ARE PROPS. THERE IS NO FILTER STATE IN THIS FILE. ───────────
 *
 * `source`, `status`, `q` and `range` are derived from the URL by page.jsx on
 * every render and passed straight down. None of them is copied into
 * `useState`, and the prop names deliberately no longer start with `initial` —
 * that prefix is what invites the copy.
 *
 * ── THE DEFECT THIS SHAPE REMOVES ───────────────────────────────────────────
 * They WERE `useState(initialSource)` and friends, seeded once. On a
 * client-side navigation to the same route — clicking the sidebar's bare
 * `/admin/registrations` while sitting on `?source=inhouse`, or pressing Back —
 * React preserves the component instance, so the props updated and the state did
 * not. The result was measured: the header read "Public — 39" and the rows were
 * real public records, while the toggle, the summary cards and the COLUMNS were
 * all still in-house. Every in-house column rendered an em-dash over a public
 * document and the สถานะ cell showed `confirmed`, which is not a value an
 * in-house enquiry can hold.
 *
 * That is the same rule this screen already had to learn once, in InhouseTable:
 * NO BRANCH MAY RENDER A VALUE THE DATA DOES NOT HOLD. A stale `source` makes
 * the whole table such a branch.
 *
 * The second-order effect was worse than the display. `navigate` re-serialises
 * the filters into the next URL, so a stale value was WRITTEN BACK — the lie
 * became the real filter on the following click.
 *
 * ── CONFORMANCE, NOT INVENTION ──────────────────────────────────────────────
 * AuditLogClient, WebhookLogsClient and DashboardClient already do exactly this:
 * filters arrive as props, render directly, and are re-serialised from props in
 * `navigate`. This file is brought into line with them.
 *
 * The one thing that cannot be a prop is the search box's in-progress text,
 * because the user is typing it and no navigation has happened yet. It is an
 * UNCONTROLLED input instead — `defaultValue` plus a `key`, read out of the form
 * on submit. The `key` is what keeps it honest: when the URL's `q` changes the
 * input is a new element, so it cannot go on showing a term the list is not
 * filtered by.
 */
export function RegistrationsClient({
  initialData,
  status = 'all',
  q      = '',
  source = 'public',
  range  = 'all',
  counts,
  lastEdited = {},
  // Built server-side in page.jsx and only for source=inhouse; null on a public
  // render, where nothing reads it.
  courseNames = null,
}) {
  const router     = useRouter();
  const pathname   = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const navigate = useCallback((overrides = {}) => {
    const params = new URLSearchParams(searchParams.toString());
    const next = { page: '1', status, q, source, range, ...overrides };
    Object.entries(next).forEach(([k, v]) => {
      const isDefault =
        (k === 'status' && v === 'all') ||
        (k === 'q'      && v === '')    ||
        (k === 'source' && v === 'public') ||
        (k === 'range'  && v === 'all') ||
        (k === 'page'   && v === '1');
      if (!isDefault && v !== '' && v != null) params.set(k, String(v));
      else params.delete(k);
    });
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }, [pathname, searchParams, router, status, q, source, range]);

  // The term is read out of the form, not out of state — see the header.
  const handleSearch = (e) => {
    e.preventDefault();
    const term = String(new FormData(e.currentTarget).get('q') ?? '');
    navigate({ q: term, page: '1' });
  };

  const { items, page, pageCount } = initialData;
  // `{}`, not a hand-written zero-filled object. That fallback was a fourth
  // spelling of the public enum — and it was the WRONG enum on an in-house
  // render. The card already reads `statCounts[key] ?? 0`, so an empty object
  // produces the same zeroes for whichever collection is showing.
  const statCounts = counts ?? {};
  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range)?.label ?? 'ทั้งหมด';

  /**
   * EVERY LIST ON THIS SCREEN COMES FROM ONE ARRAY — see
   * src/lib/registrations/statuses.js.
   *
   * The in-house cards and chips were two hand-written lists fifteen lines
   * apart and they had drifted: the cards had five entries and no
   * `ส่งใบเสนอราคาแล้ว`, the chips had six and did. A record in that status was
   * counted in ทั้งหมด and displayed by nothing, so the strip read 6 over cards
   * summing to 5.
   *
   * Public had the identical shape and had not yet been bitten. Deriving both
   * sides makes a card-without-a-chip unrepresentable in either.
   *
   * ONE `statusesForSource` CALL FEEDS BOTH BUILDERS, rather than a ternary per
   * list. Two ternaries reading the same `source` is two places to get it
   * wrong, and getting it wrong means a chip whose card is missing — which is
   * the original defect, rebuilt from newer parts.
   */
  const sourceStatuses = statusesForSource(source);
  const statCards      = buildStatCards(sourceStatuses);
  const statusOptions  = buildStatusChips(sourceStatuses);

  return (
    <div className="space-y-5">

      {/* ── Source toggle ── */}
      <div className="flex items-center rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-1 w-fit gap-1">
        {[
          { value: 'public',  label: 'Public' },
          { value: 'inhouse', label: 'In-house' },
        ].map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => navigate({ source: s.value, page: '1', status: 'all' })}
            className={cn(
              'rounded-9e-md px-5 py-1.5 text-sm font-semibold transition-colors',
              source === s.value
                ? 'bg-9e-navy text-9e-ice shadow-9e-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Stat strip ── */}
      <div className="space-y-2">
        {/* Range filter for stat strip */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            สรุปยอด — <span className="font-semibold">{rangeLabel}</span>
          </p>
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => navigate({ range: opt.value, page: '1' })}
                className={cn(
                  'rounded-9e-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  range === opt.value
                    ? 'bg-[var(--surface-border)] text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/*
          THE COLUMN COUNT IS DERIVED FROM THE CARDS, not asserted alongside them.

          This was `grid-cols-5` while the in-house set is six cards long — which
          is why the sixth (ส่งใบเสนอราคาแล้ว) had nowhere to go and the strip was
          left summing to less than its own total. An inline
          `gridTemplateColumns` rather than a Tailwind class because Tailwind
          scans for whole class names: `grid-cols-${n}` is purged at build time
          and the grid silently collapses to one column.
        */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${statCards.length}, minmax(0, 1fr))` }}
        >
          {statCards.map(({ key, label, filterVal, cls }) => (
            <button
              key={key}
              type="button"
              onClick={() => navigate({ status: filterVal, page: '1' })}
              className={cn(
                'rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-4 text-left transition-shadow hover:shadow-9e-sm',
                status === filterVal && 'ring-2 ring-9e-brand ring-offset-1',
                cls
              )}
            >
              <p className="text-xs text-[var(--text-muted)]">{label}</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums text-[var(--text-primary)]">
                {statCounts[key] ?? 0}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Toolbar: status pills + search ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => navigate({ status: opt.value, page: '1' })}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                status === opt.value
                  ? 'bg-9e-navy text-9e-ice'
                  : 'bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:bg-[var(--surface-border)]'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="ml-auto flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              name="q"
              /*
                UNCONTROLLED, and `key`ed on the term the list is actually
                filtered by. In-progress typing is the one piece of this toolbar
                that genuinely is local — but holding it in `useState` seeded
                from a prop is what let the whole filter set go stale across a
                navigation. `defaultValue` + `key` gives the box its own text
                while keeping it unable to disagree with the URL: when `q`
                changes, this is a new element with a new default.
              */
              defaultValue={q}
              key={q}
              /*
                THE PLACEHOLDER NAMES THE FIELDS THE FILTER ACTUALLY SEARCHES,
                and the two filters do not search the same ones.

                Public matches courseName + coordinator name/email, so the
                original label was correct there and is unchanged. In-house
                matches companyName + contact name/email and NOT the course —
                `coursesInterested` holds codes and no $or clause touches it — so
                'หลักสูตร' was an invitation to type a course and get nothing
                back, while the one field that does work (บริษัท) went unnamed.
                See listRegistrations in src/lib/actions/registrations.js.
              */
              placeholder={source === 'inhouse'
                ? 'ค้นหาบริษัท / ชื่อ / อีเมล'
                : 'ค้นหาชื่อ / อีเมล / หลักสูตร'}
              className={cn(
                'h-9 w-64 rounded-9e-md border bg-[var(--surface)] pl-9 pr-3 text-sm',
                'border-[var(--surface-border)] text-[var(--text-primary)]',
                'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
              )}
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-9e-md bg-9e-navy px-4 text-xs font-semibold text-9e-ice hover:opacity-90"
          >
            ค้นหา
          </button>
        </form>
      </div>

      {/* ── Table ──
          IN-HOUSE GETS ITS OWN BODY. The columns below are the PUBLIC set and
          only the public set — an in-house document has no courseName, no
          coordinator, no attendeesCount, no requestInvoice and no payment — so
          rendering one through them produced a row of blanks with two cells that
          stated a confident falsehood instead. See InhouseTable.jsx for why that
          is a separate component and not a `source ===` test inside each cell.

          THE PUBLIC BLOCK BELOW IS DELIBERATELY NOT RE-INDENTED. Nothing in the
          suite covers this table, so the only available proof that this commit
          did not disturb a public cell is the diff itself. Wrapping the block
          without shifting it keeps all 87 lines BYTE-IDENTICAL to HEAD: `git
          diff` shows four added lines around an untouched body. Re-indenting
          would have turned every one of those lines into a diff line and reduced
          the proof to trusting `git diff -w`. */}
      {source === 'inhouse' ? (
        <InhouseTable items={items} lastEdited={lastEdited} courseNames={courseNames} />
      ) : (
      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
              <tr>
                <Th>เลขอ้างอิง</Th>
                <Th>หลักสูตร</Th>
                <Th>วันอบรม</Th>
                <Th>รูปแบบ</Th>
                <Th>ผู้ประสานงาน</Th>
                <Th center>ผู้เข้าอบรม</Th>
                <Th center>ใบเสนอราคา</Th>
                <Th center>ชำระเงิน</Th>
                <Th>สถานะ</Th>
                <Th>วันที่สมัคร</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-[var(--text-muted)]">
                    ไม่พบรายการที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              )}
              {items.map((row) => (
                <tr
                  key={row._id}
                  className="border-b border-[var(--surface-border)] last:border-b-0 hover:bg-[var(--surface-muted)]"
                >
                  <td className="px-4 py-3 font-mono text-xs font-bold text-9e-action">
                    {refNo(row._id)}
                    <LastEditedHint entry={lastEdited[String(row._id)]} />
                  </td>
                  <td className="max-w-[180px] px-4 py-3">
                    <p className="truncate font-medium text-[var(--text-primary)]">{row.courseName}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">{row.classDate}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    {row.classDate || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ScheduleBadge type={row.scheduleType} mode={row.attendanceMode} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--text-primary)]">
                      {row.coordinator?.firstName} {row.coordinator?.lastName}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">{row.coordinator?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-[var(--text-primary)]">
                    {row.attendeesCount}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.requestInvoice
                      ? <span className="text-xs font-semibold text-emerald-600">✓</span>
                      : <span className="text-xs text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <PaymentChip payment={row.payment} pricing={row.pricing} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      STATUS_BADGE[row.status] ?? 'bg-slate-100 text-slate-600'
                    )}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)] whitespace-nowrap">
                    {fmtDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={detailHref(source, row._id)}
                      className="text-xs font-semibold text-9e-action hover:underline"
                    >
                      ดูรายละเอียด →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* ── Pagination ── */}
      {pageCount > 1 && (
        <Pagination page={page} pageCount={pageCount} onNavigate={navigate} />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function Th({ children, center }) {
  return (
    <th className={cn(
      'px-4 py-3 text-xs font-medium text-[var(--text-secondary)]',
      center ? 'text-center' : 'text-left'
    )}>
      {children}
    </th>
  );
}

const PAY_METHOD_CHIP = {
  credit_card: { label: 'บัตร', cls: 'bg-indigo-100 text-indigo-700' },
  promptpay:   { label: 'QR',   cls: 'bg-teal-100 text-teal-700' },
};

function PaymentChip({ payment, pricing }) {
  const chip = PAY_METHOD_CHIP[payment?.method];
  // Rows without an online-payment record (or quote method) = ใบเสนอราคา / legacy.
  if (!chip) {
    return <span className="text-[10px] text-[var(--text-muted)]">ใบเสนอราคา</span>;
  }
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn('inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold', chip.cls)}>
        {chip.label}
      </span>
      {pricing?.total != null && (
        <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
          ฿{Number(pricing.total).toLocaleString('th-TH')}
        </span>
      )}
    </div>
  );
}

function ScheduleBadge({ type, mode }) {
  if (!type || type === 'classroom') {
    return <span className="text-xs text-[var(--text-muted)]">Classroom</span>;
  }
  return (
    <span className={cn(
      'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold',
      SCHEDULE_BADGE[type] ?? 'bg-slate-100 text-slate-600'
    )}>
      {type === 'hybrid'
        ? (mode === 'teams' ? 'Hybrid · Teams' : 'Hybrid · Class')
        : 'Online'}
    </span>
  );
}

function Pagination({ page, pageCount, onNavigate }) {
  const pages  = Array.from({ length: pageCount }, (_, i) => i + 1);
  const visible = pages.filter(
    (p) => p === 1 || p === pageCount || Math.abs(p - page) <= 2
  );
  return (
    <div className="flex items-center justify-center gap-1">
      <PagerBtn disabled={page <= 1} onClick={() => onNavigate({ page: page - 1 })}>‹ ก่อนหน้า</PagerBtn>
      {visible.map((p, i) => {
        const prev = visible[i - 1];
        const gap  = prev && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-1">
            {gap && <span className="px-1 text-[var(--text-muted)]">…</span>}
            <PagerBtn active={p === page} onClick={() => onNavigate({ page: p })}>{p}</PagerBtn>
          </span>
        );
      })}
      <PagerBtn disabled={page >= pageCount} onClick={() => onNavigate({ page: page + 1 })}>ถัดไป ›</PagerBtn>
    </div>
  );
}

function PagerBtn({ children, onClick, disabled, active }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'min-w-[36px] rounded-9e-md px-2.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-9e-navy text-9e-ice'
          : 'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--surface-border)] hover:bg-[var(--surface-muted)]',
        disabled && 'opacity-40 pointer-events-none'
      )}
    >
      {children}
    </button>
  );
}