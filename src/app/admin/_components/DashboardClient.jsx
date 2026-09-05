'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';
import { buildStatusLabels, INHOUSE_STATUSES } from '@/lib/registrations/statuses';
/**
 * The queue cards as DATA — id, label, threshold phrase, link and whether that
 * link is truly filtered. Imported rather than restated so a card cannot be
 * drawn without the rule that produced it, and so the threshold text and the
 * Mongo query come from one constant. See lib/dashboard/queueThresholds.js.
 */
import { QUEUE_CARDS } from '@/lib/dashboard/actionQueue';
import { DEFAULT_RANGE } from '@/lib/dashboard/ranges';
/**
 * The dashboard's status colours — the hexes the charts fill with and the chip
 * classes the pills wear. ONE module since round E5, because four surfaces draw
 * them now: the proportional bar, the age histogram, the sparklines and the
 * รายการล่าสุด pills. See lib/dashboard/statusColors.js for why the palette is
 * there and the vocabulary is still in lib/registrations/statuses.js.
 */
import { SERIES_COLOR, statusBadge, statusColor } from '@/lib/dashboard/statusColors';

// ── Constants ──────────────────────────────────────────────────────

/**
 * The public registration status labels, DERIVED.
 *
 * These four cards link straight into `/admin/registrations?status=…`, so a
 * label here that disagrees with the one on the list screen sends the admin to
 * a page whose heading contradicts the card they clicked. 'ยืนยันแล้ว' had four
 * copies across the admin; this was one of them.
 *
 * The `badge` text beside each card is deliberately NOT derived — it is a
 * two-or-three character abbreviation chosen to fit the card, not a label.
 */
const PUBLIC_STATUS_LABEL = buildStatusLabels();

/**
 * The IN-HOUSE labels, from the in-house SUBSET of the same module.
 *
 * Passed explicitly rather than taking the default: buildStatusLabels defaults
 * to the PUBLIC list, so an argument-less call here would silently label the
 * in-house cards with the public vocabulary and no card would render blank to
 * say so — pending and cancelled are in both.
 */
const INHOUSE_STATUS_LABEL = buildStatusLabels(INHOUSE_STATUSES);

const RANGE_OPTIONS = [
  { value: 'today', label: 'วันนี้' },
  { value: 'week',  label: '7 วัน' },
  { value: 'month', label: 'เดือนนี้' },
  { value: 'all',   label: 'ทั้งหมด' },
];

const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

/**
 * The Thai word for a bucket size, for the "จำนวนรายการต่อ…" subtitle.
 *
 * Keyed on the SERVER's `data.bucket` rather than on the range, so the subtitle
 * describes the buckets that were actually grouped. Deriving it from the range
 * here would be a second copy of the bucket rule, and the two would eventually
 * disagree about what เดือนนี้ means.
 */
const BUCKET_WORD = { hour: 'ชั่วโมง', day: 'วัน', month: 'เดือน' };

/**
 * ══ WHICH WAY IS GOOD, PER CARD ════════════════════════════════════════════
 *
 * The badge used to be green for any rise and red for any fall, on every card.
 * That is one rule applied to eight cards that do not agree about what a rise
 * MEANS: `ยกเลิก +40%` rendered in the same green as `ชำระแล้ว +40%`, which is
 * not a formatting slip — it tells the reader that more cancellations is good
 * news.
 *
 * So direction is a property of the CARD, and this is where each one declares
 * it. Three values, and the third is the one that was decided rather than
 * derived:
 *
 *   'up-good'   more is better — ชำระแล้ว, ส่งใบเสนอราคาแล้ว, and both ยอดรวม.
 *   'up-bad'    more is worse  — ยกเลิก, and only ยกเลิก.
 *   'neutral'   more is neither, and the badge stays grey in both directions.
 *
 * ── รอดำเนินการ IS NEUTRAL, DELIBERATELY ──────────────────────────────────
 * The obvious reading is that a growing backlog is bad. It is not: a rise in
 * รอดำเนินการ is mostly a rise in people signing up, which is the same event
 * that makes ยอดรวม go up, and colouring it red would report a good week as a
 * problem. What is actually bad about pending work is its AGE, and age is not
 * something this percentage can see — it is what the อายุของงานที่ค้าง
 * histogram answers. Grey here is the honest colour: the number is worth
 * showing and is not worth judging.
 *
 * A card that names no direction gets `neutral`, so a new card cannot acquire
 * a judgement nobody made by being added to the grid.
 */
const DELTA_DIRECTION = Object.freeze({
  UP_GOOD: 'up-good',
  UP_BAD:  'up-bad',
  NEUTRAL: 'neutral',
});

/** A Buddhist-era date, for telling an admin when the last record actually was. */
function fmtRecordDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/**
 * An axis label for a BUCKET KEY, not for a date.
 *
 * The server now sends `'2026-09-05T14'`, `'2026-09-05'` or `'2026-09'`
 * depending on the range's bucket size (lib/dashboard/ranges.js), and the key is
 * already in Bangkok time. So this parses the STRING rather than handing it to
 * `new Date()`: `new Date('2026-09')` is parsed as UTC midnight and would shift
 * the label back a day for every reader east of Greenwich — the same class of
 * timezone slip that BUCKET_TZ exists to end on the server side.
 */
/**
 * "3 นาทีที่แล้ว" / "5 วันที่แล้ว" — how long ago, in Thai.
 *
 * ── RELATIVE, AND IT STOPS BEING RELATIVE AFTER A MONTH ───────────────────
 * "เมื่อสักครู่" is what a reader wants for something that just happened and
 * is useless for something from April: "134 วันที่แล้ว" is arithmetic nobody
 * asked for. Past 30 days it falls back to the absolute date the rest of the
 * admin prints, Buddhist year and all.
 *
 * ── IT TAKES `now` AS AN ARGUMENT ─────────────────────────────────────────
 * Not `Date.now()` inside. This renders on the server and hydrates on the
 * client, and a function that reads the wall clock at each of those produces
 * two different strings for one row — a hydration mismatch that appears only
 * when the two happen to straddle a minute boundary, which is the worst kind
 * of intermittent. The caller passes ONE timestamp for the whole table.
 */
function fmtRelativeThai(iso, nowMs) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const mins = Math.floor((nowMs - then) / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days <= 30) return `${days} วันที่แล้ว`;
  return fmtRecordDate(iso);
}

function fmtBucketShort(key) {
  const s = String(key ?? '');
  const hour = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(s);
  if (hour) return `${hour[4]}:00`;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (day) return `${Number(day[3])} ${THAI_MONTHS_SHORT[Number(day[2]) - 1]}`;
  const month = /^(\d{4})-(\d{2})$/.exec(s);
  // The Buddhist-era year, two digits — 2026 CE is 2569 BE, so "ส.ค. 69".
  if (month) return `${THAI_MONTHS_SHORT[Number(month[2]) - 1]} ${String(Number(month[1]) + 543).slice(-2)}`;
  return s;
}

// ── Component ──────────────────────────────────────────────────────

/**
 * ── THE SCOPES ARRIVE INSIDE `data`, NOT AS A PROP OF THEIR OWN ─────────────
 *
 * `data.scopes` is written by the server action, which reads it off the session
 * through `canAccess`. This component NEVER decides a scope; it reports one. The
 * distinction is not cosmetic — a `scopes` prop assembled by the page would be
 * one more place the answer could be got wrong, and a `scopes` value the client
 * could set would not be an access control at all.
 *
 * It is also not what protects the figures. The figures are protected by not
 * existing: a caller without `dashboard_registrations` gets a payload with no
 * `public`, no `inhouse`, no `trend` and no `statusDist` keys. Everything below
 * is about DRAWING the right thing, not about hiding the wrong thing — if this
 * component were replaced tomorrow by one that rendered `JSON.stringify(data)`,
 * no unauthorised number would appear.
 */
export function DashboardClient({ data, openSchedulesCount, initialRange, initialFrom = '', initialTo = '' }) {
  const router   = useRouter();
  const pathname = usePathname();
  const sp       = useSearchParams();
  const [, startTransition] = useTransition();

  const setRange = (val) => {
    const params = new URLSearchParams(sp.toString());
    // The DEFAULT is the value that means "no query parameter". Hard-coding
    // 'today' here after the default moved would leave /admin?range=all as the
    // canonical URL for the default view — working, but a URL nobody would
    // write, and one that disagrees with what the page does with no parameter.
    if (val === DEFAULT_RANGE) params.delete('range');
    else params.set('range', val);
    // Choosing a PRESET drops any custom window. Leaving from/to behind would
    // make the server keep honouring them — the custom window wins — so the
    // button would light and nothing would change, which is the worst of the
    // three possible outcomes.
    params.delete('from');
    params.delete('to');
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  /**
   * The custom window, submitted rather than navigated-on-change.
   *
   * Both halves are sent even when one is blank: the SERVER decides what a
   * half-open range means (it falls back to the preset), and a client that
   * silently dropped an empty half would be a second opinion about that.
   */
  const submitCustom = (e) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const params = new URLSearchParams(sp.toString());
    const nextFrom = String(form.get('from') ?? '');
    const nextTo = String(form.get('to') ?? '');
    if (nextFrom) params.set('from', nextFrom); else params.delete('from');
    if (nextTo) params.set('to', nextTo); else params.delete('to');
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 text-[var(--text-muted)]">
        ไม่สามารถโหลดข้อมูลแดชบอร์ดได้ — กรุณารีเฟรช
      </div>
    );
  }

  const scopes = data.scopes ?? { registrations: false, system: false };

  /**
   * A CUSTOM window is reported by the SERVER, not inferred from the URL here.
   *
   * The dates in the query string may have been rejected — a reversed pair is
   * swapped, an unparseable one falls back to the preset — so `initialFrom` being
   * non-empty does not mean a custom window was drawn. `data.range === 'custom'`
   * means it was, because the server sets it after validating. Reading the URL
   * instead would light the button for a window nobody is looking at.
   */
  const isCustom = data.range === 'custom';

  /**
   * ── NEITHER SCOPE: A PAGE THAT RENDERS AND EXPLAINS ──────────────────────
   * Not a crash, not a blank, and above all not a silent full view. This admin
   * holds `dashboard` — they were allowed through the door — so the page owes
   * them an answer about why it is empty, and the answer names the thing an
   * admin would have to ask for. Distinguished from the `!data` branch above,
   * which means the fetch failed and a refresh might help; this one is a
   * permission state and refreshing will not change it.
   */
  if (!scopes.registrations && !scopes.system) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">แดชบอร์ด</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            ภาพรวมระบบ 9Expert Training
          </p>
        </div>
        <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-8 text-center">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            บทบาทของคุณยังไม่ได้เปิดส่วนใดของแดชบอร์ด
          </p>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            แดชบอร์ดแบ่งเป็นสองส่วน — การลงทะเบียน และ ภาพรวมระบบ —
            และบทบาทของคุณยังไม่ได้รับสิทธิ์ทั้งสองส่วน
            กรุณาติดต่อผู้ดูแลระบบเพื่อขอเปิดสิทธิ์ที่หน้า บทบาทและสิทธิ์
          </p>
        </div>
      </div>
    );
  }

  // Derived from the registration payload, so they are computed only when that
  // payload exists. Reading `data.trend` unconditionally would throw for a
  // system-only admin — which is the shape of the round: the absent half is
  // ABSENT, not empty, and every reader has to say which half it belongs to.
  // The fallback is the DEFAULT's own label, derived rather than typed: a
  // literal here would go on saying วันนี้ after the default moved, and it is
  // the label of a range the page is not showing.
  const rangeLabel  = RANGE_OPTIONS.find((r) => r.value === initialRange)?.label
    ?? RANGE_OPTIONS.find((r) => r.value === DEFAULT_RANGE)?.label;
  // The bars are STACKED, so the axis has to scale against the stack rather than
  // against the taller of the two series — otherwise a bucket whose two halves
  // sum past the maximum overflows the plot area.
  const trendMax    = scopes.registrations
    ? Math.max(...data.trend.map((d) => d.publicCount + d.inhouseCount), 1)
    : 1;
  const trendTotal  = scopes.registrations
    ? data.trend.reduce((s, d) => s + d.publicCount + d.inhouseCount, 0)
    : 0;

  /**
   * ══ THE QUEUE CARDS A CALLER ACTUALLY HAS COUNTS FOR ═══════════════════════
   *
   * Built by looking the count UP rather than by re-deriving the scope: the
   * server put `queue` in the payload only for `dashboard_registrations` and
   * `systemQueue` only for `dashboard_system`, so a card whose count is absent
   * is a card whose read never ran. Filtering on the presence of the number
   * means this component cannot show a card the server did not authorise, even
   * if someone later gets the scope flags wrong.
   *
   * `?? null` and an explicit null check rather than `||`: ZERO IS A RESULT.
   * `count || null` would drop every empty queue, which is exactly the bug (e)
   * would ship with — it is 0 today and must render as 0.
   */
  /**
   * Is the SELECTED WINDOW empty — as distinct from the corpus being empty?
   *
   * Both sources, because a window holding only in-house enquiries is not empty
   * and telling the reader it is would be its own small lie.
   */
  const registrationsEmpty = scopes.registrations
    && data.public.total === 0
    && data.inhouse.total === 0;

  const queueCounts = { ...(data.queue ?? {}), ...(data.systemQueue ?? {}) };
  const queueCards = QUEUE_CARDS
    .map((card) => ({ card, count: queueCounts[card.id] ?? null }))
    .filter(({ count }) => count !== null);
  const statusTotal = scopes.registrations ? data.statusDist.reduce((s, d) => s + d.count, 0) : 0;

  return (
    <div className="space-y-8">

      {/* ── Header + range toggle ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">แดชบอร์ด</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            ภาพรวมระบบ 9Expert Training
          </p>
        </div>

        {/*
          THE RANGE CONTROL BELONGS TO THE REGISTRATION SCOPE, and to nothing
          else. It has never driven the ภาพรวมระบบ strip — that strip's own
          subtitle says ไม่กรองตามวันที่ — so for a system-only admin it would
          be a control that changes nothing on screen, which is worse than an
          absent one. The page also resolves `initialRange` to null for them and
          the action ignores `range` without the scope, so all three layers say
          the same thing.
        */}
        {scopes.registrations && <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-1 gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRange(opt.value)}
                className={cn(
                  'rounded-9e-md px-3 py-1.5 text-sm font-semibold transition-colors',
                  // A CUSTOM window lights NO preset. The server reports
                  // `range: 'custom'`, so `initialRange` matches none of the
                  // four and the reader is not told two things at once.
                  initialRange === opt.value && !isCustom
                    ? 'bg-9e-navy text-9e-ice shadow-9e-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/*
            ══ THE CUSTOM RANGE PICKER ═══════════════════════════════════════

            NATIVE `<input type="date">`, and NO NEW DEPENDENCY. This is the
            same control the registrations list's FilterPanel already uses —
            same element, same `from`/`to` parameter names, same "both ends
            optional" affordance — so an admin who has used the date filter
            there already knows this one. A calendar widget would have been a
            dependency, a bundle, and a second thing to learn.

            SUBMITTED AS A FORM, not on every keystroke: a partially-typed date
            is a date, and navigating on each one would fire a query per
            character and land the reader on windows they never asked for.

            The inputs are UNCONTROLLED with a `key` tied to their value — the
            same pattern FilterPanel uses — so a navigation that changes the
            dates re-seeds them, while typing does not fight the cursor.
          */}
          <form
            onSubmit={submitCustom}
            className="flex items-center gap-1.5 rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-1"
          >
            <input
              type="date" name="from" defaultValue={initialFrom} key={`from-${initialFrom}`}
              aria-label="ตั้งแต่วันที่"
              className="h-[30px] rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-2 text-[12px] text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-9e-brand"
            />
            <span className="text-[12px] text-[var(--text-muted)]">–</span>
            <input
              type="date" name="to" defaultValue={initialTo} key={`to-${initialTo}`}
              aria-label="ถึงวันที่"
              className="h-[30px] rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] px-2 text-[12px] text-[var(--text-primary)] focus-visible:outline-none focus-visible:border-9e-brand"
            />
            <button
              type="submit"
              className={cn(
                'rounded-9e-md px-2.5 py-1 text-[12px] font-semibold transition-colors',
                isCustom
                  ? 'bg-9e-navy text-9e-ice shadow-9e-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              กำหนดเอง
            </button>
          </form>
        </div>}
      </div>

      {/*
        ══ SECTION 0: THE ACTION QUEUE ═══════════════════════════════════════

        FIRST on the page, above the counts, because it is the only section that
        asks the reader to DO something. The registration cards describe the
        past; these describe work that is waiting.

        NOT DATE-FILTERED, and the subtitle says so. These are absolute
        operational states — "three receipts were never sent" does not become
        untrue because the reader selected วันนี้ — and a queue that emptied
        itself when you narrowed the range would hide work by being filtered.

        The cards a caller sees follow the SCOPE their reads ran under: a–d for
        `dashboard_registrations`, (e) for `dashboard_system`. A caller with one
        scope has no count for the other half, because it was never queried.
      */}
      {queueCards.length > 0 && (
        <section className="space-y-3">
          <SectionHeader
            title="รอดำเนินการ"
            subtitle="สถานะปัจจุบัน — ไม่กรองตามช่วงวันที่"
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {queueCards.map(({ card, count }) => (
              <QueueCard key={card.id} card={card} count={count} />
            ))}
          </div>
        </section>
      )}

      {/* ── Section 1: Registration metrics (date-filtered) ── */}
      {scopes.registrations && <section className="space-y-3">
        <SectionHeader
          title={`การลงทะเบียน — ${rangeLabel}`}
          subtitle="Public + In-house"
        />

        {/*
          ══ AN EMPTY WINDOW SAYS SO, ABOVE THE ZEROS ═══════════════════════
          Round E1 measured this as the NORMAL state: the newest registration is
          2026-08-29, so วันนี้, 7 วัน and เดือนนี้ all hold nothing, and the
          page rendered eight zeros while working exactly as designed.

          The zeros stay — they are the honest count for the window, and hiding
          them would leave the section looking broken. What was missing is the
          sentence above them, which turns "0, 0, 0" from something that looks
          like a measurement of nothing into "nothing happened in the window you
          chose, and here is when something last did".

          `corpus` is the whole point and is why the aggregation's bounds branch
          is deliberately unfiltered — a windowed branch cannot see the record
          the reader most needs to be told about.
        */}
        {registrationsEmpty && <EmptyRange corpus={data.corpus} />}

        {/*
          ══ WHY THERE IS NO PERCENTAGE, SAID OUT LOUD ══════════════════════

          Round E3 decided that ทั้งหมด renders no change badge: there is no
          period before everything, so there is nothing to divide by, and a
          '0%' or a '—' would assert a measurement nobody made. That decision
          is right and is unchanged.

          What was missing is that the READER cannot see a decision. They see
          eight cards that had percentages a moment ago and do not now, which
          looks like the feature broke — several people have asked. One line
          of copy is the whole fix, and it is keyed on `data.delta` being
          ABSENT rather than on the range being 'all', so it appears exactly
          when the badges do not, whatever produced that.
        */}
        {!data.delta && (
          <p className="text-xs text-[var(--text-muted)]">
            ช่วง “ทั้งหมด” ไม่มีช่วงก่อนหน้าให้เปรียบเทียบ จึงไม่แสดงเปอร์เซ็นต์การเปลี่ยนแปลง
          </p>
        )}

        {/* Public stats */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Public ทั้งหมด"
            value={data.public.total}
            delta={data.delta?.public?.total}
            series={data.sparklines?.public?.total}
            seriesColor={SERIES_COLOR.public}
            deltaDirection={DELTA_DIRECTION.UP_GOOD}
            href="/admin/registrations"
            accent="border-l-4 border-l-9e-action"
          />
          <StatCard
            label={PUBLIC_STATUS_LABEL.pending}
            value={data.public.pending}
            delta={data.delta?.public?.pending}
            series={data.sparklines?.public?.pending}
            seriesColor={statusColor('pending')}
            deltaDirection={DELTA_DIRECTION.NEUTRAL}
            href="/admin/registrations?status=pending"
            badge={{ text: 'รอ', cls: 'bg-amber-100 text-amber-700' }}
          />
          <StatCard
            label={PUBLIC_STATUS_LABEL.confirmed}
            value={data.public.confirmed}
            delta={data.delta?.public?.confirmed}
            series={data.sparklines?.public?.confirmed}
            seriesColor={statusColor('confirmed')}
            deltaDirection={DELTA_DIRECTION.UP_GOOD}
            href="/admin/registrations?status=confirmed"
            badge={{ text: 'ใบเสนอราคา', cls: 'bg-blue-100 text-blue-700' }}
          />
          <StatCard
            label={PUBLIC_STATUS_LABEL.paid}
            value={data.public.paid}
            delta={data.delta?.public?.paid}
            series={data.sparklines?.public?.paid}
            seriesColor={statusColor('paid')}
            deltaDirection={DELTA_DIRECTION.UP_GOOD}
            href="/admin/registrations?status=paid"
            badge={{ text: 'ชำระ', cls: 'bg-emerald-100 text-emerald-700' }}
          />
          <StatCard
            label={PUBLIC_STATUS_LABEL.cancelled}
            value={data.public.cancelled}
            delta={data.delta?.public?.cancelled}
            series={data.sparklines?.public?.cancelled}
            seriesColor={statusColor('cancelled')}
            deltaDirection={DELTA_DIRECTION.UP_BAD}
            href="/admin/registrations?status=cancelled"
            badge={{ text: 'ยกเลิก', cls: 'bg-slate-100 text-slate-500' }}
          />
        </div>

        {/* Inhouse stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="In-house ทั้งหมด"
            value={data.inhouse.total}
            delta={data.delta?.inhouse?.total}
            series={data.sparklines?.inhouse?.total}
            seriesColor={SERIES_COLOR.inhouse}
            deltaDirection={DELTA_DIRECTION.UP_GOOD}
            href="/admin/registrations?source=inhouse"
            accent="border-l-4 border-l-violet-400"
          />
          {/*
            THE TWO IN-HOUSE CARDS FOLLOW THE COLLAPSED VOCABULARY.

            They were รอติดต่อ (`?status=new`) and ปิดงานสำเร็จ
            (`?status=closed-won`). Both statuses are retired, so both links
            would have pointed at a filter the list can no longer offer — and
            the second card counted a sales outcome the system never observed
            (see the ruling in lib/registrations/statuses.js).

            The labels come from the shared vocabulary rather than being typed
            here, for the same reason the four public cards above derive theirs.
          */}
          <StatCard
            label={INHOUSE_STATUS_LABEL.pending}
            value={data.inhouse.pending}
            delta={data.delta?.inhouse?.pending}
            series={data.sparklines?.inhouse?.pending}
            seriesColor={statusColor('pending')}
            deltaDirection={DELTA_DIRECTION.NEUTRAL}
            href="/admin/registrations?source=inhouse&status=pending"
            badge={{ text: INHOUSE_STATUS_LABEL.pending, cls: 'bg-amber-100 text-amber-700' }}
          />
          <StatCard
            label={INHOUSE_STATUS_LABEL.quoted}
            value={data.inhouse.quoted}
            delta={data.delta?.inhouse?.quoted}
            series={data.sparklines?.inhouse?.quoted}
            seriesColor={statusColor('quoted')}
            deltaDirection={DELTA_DIRECTION.UP_GOOD}
            href="/admin/registrations?source=inhouse&status=quoted"
            badge={{ text: INHOUSE_STATUS_LABEL.quoted, cls: 'bg-blue-100 text-blue-700' }}
          />
        </div>
      </section>}

      {/*
        ══ SECTION 2a: THE TWO STATUS VISUALS, SIDE BY SIDE ═══════════════════

        Round E5.5 puts these ABOVE the trend chart. Both answer "what is the
        state of the work right now" — the histogram by age, the bar by status
        — and they are read together; the trend is a different question (how
        did we get here) and now sits below them at full width rather than
        sharing a row with one of them.

        Registration scope, like the counts they are drawn from. E2.2
        classifies these with those counts, not with the ภาพรวมระบบ strip.
      */}
      {scopes.registrations && <section className="grid gap-6 lg:grid-cols-2">
        {/*
          ══ E5.1 — อายุของงานที่ค้าง ═════════════════════════════════════════

          Round E1 measured the shape this draws: 2 / 0 / 0 / 27. THE
          LOPSIDEDNESS IS THE MESSAGE — 27 of the 29 pending registrations are
          more than a fortnight old — so the axis is NOT normalised, capped or
          log-scaled. The last bar being ~13x the first is the finding an admin
          needs to see in one glance.
        */}
        <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
          <p className="mb-1 text-sm font-bold text-[var(--text-primary)]">อายุของงานที่ค้าง</p>
          <p className="mb-5 text-xs text-[var(--text-muted)]">
            {rangeLabel} — {PUBLIC_STATUS_LABEL.pending} {data.ageTotal} รายการ
          </p>
          <AgeHistogram buckets={data.ageDist} total={data.ageTotal} />
        </div>

        {/*
          ══ E5.2 — THE DONUT BECAME A PROPORTIONAL BAR ══════════════════════

          A donut asks the reader to compare arc lengths around a circle, which
          is the hardest comparison in charting and is why the 2% slice was
          unreadable. One bar puts every segment on a common baseline.

          THE TITLE AND SUBTITLE ARE UNCHANGED. `สัดส่วนสถานะ Public` names the
          chart and the subtitle names the WINDOW and the TOTAL — a proportion
          with no stated window is unreadable, and "71%" of an unnamed N is not
          a figure. Only the drawing changed.
        */}
        <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
          <p className="mb-1 text-sm font-bold text-[var(--text-primary)]">สัดส่วนสถานะ Public</p>
          <p className="mb-5 text-xs text-[var(--text-muted)]">{rangeLabel} — {statusTotal} รายการ</p>
          <ProportionalBar segments={data.statusDist} total={statusTotal} />
        </div>
      </section>}

      {/*
        ══ SECTION 2b: THE TREND, FULL WIDTH ══════════════════════════════════

        It was half a two-column row beside the donut. At ทั้งหมด the axis runs
        to 31 buckets, and 31 columns in half a card is the reason the bars were
        14px wide with a horizontal scrollbar under them. The freed space is
        E5.2’s doing: one 28px bar where a 100px donut and its legend used to
        sit is roughly half the height, and this is where it goes.
      */}
      {scopes.registrations && <section className="grid gap-6">

        {/*
          ══ THE TITLE STATES THE WINDOW THAT WAS ACTUALLY DRAWN ═════════════
          It said "แนวโน้มการลงทะเบียน (7 วัน)" no matter what the range control
          said, and drew a fixed seven days underneath a header reading ทั้งหมด
          — one screen making two contradictory claims, with seven empty bars
          because the newest registration is older than a week.

          `data.windowLabel` comes from the SAME module that chose the bucket
          size and built the `$match` (lib/dashboard/ranges.js), so the title
          cannot drift from the query. A title written independently of the
          query is exactly how the seven-day lie survived.
        */}
        <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
          <p className="mb-1 text-sm font-bold text-[var(--text-primary)]">
            แนวโน้มการลงทะเบียน — {data.windowLabel}
          </p>
          <p className="mb-4 text-xs text-[var(--text-muted)]">
            Public + In-house — จำนวนรายการต่อ{BUCKET_WORD[data.bucket] ?? 'ช่วง'}
          </p>

          {/* The two series, named where the colours are, not in a distant key. */}
          <div className="mb-4 flex items-center gap-4 text-[11px] text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-9e-action" />Public
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-violet-400" />In-house
            </span>
          </div>

          {trendTotal === 0 ? (
            /*
              An empty WINDOW, distinguished from an empty corpus. `EmptyRange`
              names the most recent record's date; a chart of flat zero bars
              would look like a measurement of nothing rather than an absence of
              data. See the section header for the whole ruling.
            */
            <EmptyRange corpus={data.corpus} className="h-32" />
          ) : (
            <div className="flex items-end gap-1.5 h-32 overflow-x-auto">
              {data.trend.map((d) => {
                /*
                  STACKED, not side-by-side, and scaled against the stack's own
                  maximum. Two half-width bars per bucket at 31 buckets is 62
                  bars in the width of a card; the stack keeps one column per
                  bucket at every bucket size, so ทั้งหมด and 7 วัน read alike.
                */
                const stack = d.publicCount + d.inhouseCount;
                const pubPct = trendMax > 0 ? (d.publicCount / trendMax) * 100 : 0;
                const inhPct = trendMax > 0 ? (d.inhouseCount / trendMax) * 100 : 0;
                return (
                  <div key={d.key} className="flex min-w-[14px] flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold tabular-nums text-[var(--text-secondary)]">
                      {stack > 0 ? stack : ''}
                    </span>
                    <div
                      className="w-full rounded-t-9e-sm bg-[var(--surface-muted)] relative"
                      style={{ height: '96px' }}
                      title={`${fmtBucketShort(d.key)} — Public ${d.publicCount} / In-house ${d.inhouseCount}`}
                    >
                      <div
                        className="absolute bottom-0 w-full bg-violet-400 transition-all duration-300"
                        style={{ height: `${Math.max(inhPct, d.inhouseCount > 0 ? 4 : 0)}%` }}
                      />
                      <div
                        className="absolute w-full rounded-t-9e-sm bg-9e-action transition-all duration-300"
                        style={{
                          bottom: `${Math.max(inhPct, d.inhouseCount > 0 ? 4 : 0)}%`,
                          height: `${Math.max(pubPct, d.publicCount > 0 ? 4 : 0)}%`,
                        }}
                      />
                    </div>
                    <span className="text-[9px] leading-tight text-[var(--text-muted)]">
                      {fmtBucketShort(d.key)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </section>}

      {/*
        ══ SECTION 3: รายการล่าสุด — REGISTRATION SCOPE ═══════════════════════

        Below the charts and above the system strip, because it is the most
        specific thing on the page: the counts describe a window, the charts
        describe a shape, and this describes six actual records an admin can
        click into. It reads `data.latestActivity`, which is present only with
        `dashboard_registrations` — the read never ran for anyone else.
      */}
      {scopes.registrations && <section className="space-y-3">
        <SectionHeader
          title="รายการล่าสุด"
          subtitle="Public — ใหม่สุดก่อน ไม่กรองตามช่วงวันที่"
        />
        <ActivityTable rows={data.latestActivity} generatedAt={data.generatedAt} />
      </section>}

      {/*
        ── Section 3: System overview — SYSTEM SCOPE ──
        THIS GATE CHANGED, AND IT IS THE ONE BEHAVIOURAL CHANGE IN THE ROUND.
        It was `isSuperadmin &&`, i.e. the strip was superadmin-only and no
        `pages` grant could produce it. It is now `dashboard_system`, which is
        what makes the round's stated purpose reachable at all — content writers
        and course staff are supposed to get the system overview, and there was
        previously no way to give it to them short of making them superadmin.

        A superadmin still sees it: canAccess short-circuits on isSuperadmin, so
        `scopes.system` is true for them without any grant.
      */}
      {scopes.system && <section className="space-y-3">
        <SectionHeader
          title="ภาพรวมระบบ"
          subtitle="ข้อมูล Live — ไม่กรองตามวันที่"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="รอบอบรมที่เปิดอยู่"
            value={openSchedulesCount}
            href="/training-course"
            badge={{ text: 'หลักสูตร Public', cls: 'bg-sky-100 text-sky-700' }}
          />
          <StatCard
            label="แบนเนอร์ที่แสดง"
            value={data.content.banners}
            href="/admin/banners"
            badge={{ text: 'Live', cls: 'bg-emerald-100 text-emerald-700' }}
          />
          <StatCard
            label="โปรโมชันที่แสดง"
            value={data.content.promotions}
            href="/admin/promotions"
            badge={{ text: 'Live', cls: 'bg-emerald-100 text-emerald-700' }}
          />
          <StatCard
            label="บทความที่แสดง"
            value={data.content.articles}
            href="/admin/articles"
            badge={{ text: 'Published', cls: 'bg-blue-100 text-blue-700' }}
          />
          <StatCard
            label="รีวิวที่แสดง"
            value={data.content.reviews}
            href="/admin/featured-reviews"
            badge={{ text: 'Featured', cls: 'bg-amber-100 text-amber-700' }}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <StatCard
            label="ประกาศรับสมัครงาน"
            value={data.content.recruits}
            href="/admin/recruits"
            badge={{ text: 'เปิดรับ', cls: 'bg-violet-100 text-violet-700' }}
            className="lg:max-w-[220px]"
          />
        </div>
      </section>}

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

/**
 * ══ AN EMPTY WINDOW SAYS SO, AND NAMES THE LAST RECORD ══════════════════════
 *
 * Round E1 measured the state this exists for and it is the NORMAL state today:
 * the newest registration is 2026-08-29, so วันนี้, 7 วัน and เดือนนี้ all hold
 * nothing. Before this, the page rendered five zeros and a flat chart — working
 * exactly as designed and telling the admin nothing. Zeros look like a
 * measurement. They are indistinguishable from "the system counted, and the
 * answer is none", when the truth is "nothing happened in the window you chose,
 * and here is when something last did".
 *
 * The distinction that makes it useful is `corpus`, which the aggregation
 * returns from an UNFILTERED branch precisely so this can be said. An empty
 * corpus gets a different sentence — there is no date to name, and "no
 * registrations yet" is the honest thing to tell someone on a fresh install.
 *
 * This stays true after cutover. Quiet days will happen, and on a quiet day
 * this is still the right thing for the screen to say.
 */
function EmptyRange({ corpus, className = '' }) {
  const latest = fmtRecordDate(corpus?.latest);
  return (
    <div className={cn(
      'flex flex-col items-center justify-center gap-1 rounded-9e-md border border-dashed border-[var(--surface-border)] px-4 py-6 text-center',
      className,
    )}>
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        ไม่มีการลงทะเบียนในช่วงที่เลือก
      </p>
      {latest ? (
        <p className="text-xs text-[var(--text-secondary)]">
          รายการล่าสุดคือวันที่ {latest} — ลองเลือก “ทั้งหมด” เพื่อดูข้อมูลทั้งหมด
        </p>
      ) : (
        <p className="text-xs text-[var(--text-secondary)]">
          ยังไม่มีรายการลงทะเบียนในระบบ
        </p>
      )}
    </div>
  );
}

/**
 * ══ ONE QUEUE CARD ══════════════════════════════════════════════════════════
 *
 * Three things, and the second and third are what make the first trustworthy:
 * the COUNT, the CONDITION it was counted under, and where to go and act on it.
 * A number whose rule is invisible cannot be challenged, and the person who
 * should be challenging these thresholds is an admin, not the code.
 *
 * ── ZERO RENDERS. IT DOES NOT VANISH. ──────────────────────────────────────
 * Queue (e) is 0 today — all 987 webhook logs are `ok` and none has ever been
 * an error — and an admin who cannot tell "no errors" from "the card is broken"
 * has learned nothing. So an empty queue renders CALMLY: muted, a check mark,
 * and no alarm colour. The card stays on the page and says the queue is clear.
 * Filtering empty cards out is control (b), and the test that catches it is
 * `queue ui: a ZERO count renders as a card`.
 *
 * ── THE LINK TELLS THE TRUTH ABOUT ITSELF ──────────────────────────────────
 * None of the five destinations can express its card's full condition — the
 * registrations list has no filter for payment state, receipt state or a
 * rolling age. So a card with `linkFiltered: false` says what the list WILL
 * show ("รายการทั้งหมดที่รอดำเนินการ"), because an admin who clicks 27 and
 * lands on 29 rows should have been told, not left to work it out.
 */
function QueueCard({ card, count }) {
  const clear = count === 0;
  return (
    <Link href={card.href} className="block">
      <div className={cn(
        'h-full rounded-9e-lg border bg-[var(--surface)] p-4 transition-shadow hover:shadow-9e-md',
        clear
          ? 'border-[var(--surface-border)]'
          : 'border-[var(--surface-border)] border-l-4 border-l-amber-400',
      )}>
        <p className="text-xs font-medium text-[var(--text-secondary)]">{card.label}</p>
        <p className={cn(
          'mt-1 text-3xl font-bold tabular-nums',
          clear ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]',
        )}>
          {count}
        </p>
        {card.threshold && (
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">{card.threshold}</p>
        )}
        {clear && (
          <p className="mt-1 text-[11px] font-medium text-emerald-600">ไม่มีรายการค้าง</p>
        )}
        {!card.linkFiltered && (
          <p className="mt-2 text-[10px] leading-tight text-[var(--text-muted)]">
            เปิดรายการ: {card.linkNote}
          </p>
        )}
      </div>
    </Link>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
      {subtitle && (
        <span className="text-xs text-[var(--text-muted)]">{subtitle}</span>
      )}
    </div>
  );
}

/**
 * ══ THE PERCENTAGE, AND THE THREE WAYS IT IS ABSENT ═════════════════════════
 *
 * `delta` is `undefined` when the SERVER sent no `delta` block at all — which is
 * what happens at ทั้งหมด, because there is no period before everything. It is
 * `null` when there IS a previous period but it held zero, because "+100% from
 * nothing" is not a hundred percent of anything.
 *
 * In both cases NOTHING RENDERS. Not "0%", not "+0%", not a dash: a dash reads
 * as a value that happened to be small, and 0% asserts a measurement nobody
 * made. Control (c) puts "0%" back at ทั้งหมด and the no-percentage test catches
 * it.
 *
 * When it does render, the SIGN is part of the number — a bare "28%" beside a
 * count is ambiguous between a share and a change.
 */
function DeltaBadge({ delta, direction = DELTA_DIRECTION.NEUTRAL }) {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return null;
  const up = delta > 0;
  const flat = delta === 0;
  /**
   * ── THE SIGN IS THE MEASUREMENT; THE COLOUR IS THE JUDGEMENT ────────────
   * They are computed separately on purpose. `+40%` is a fact and renders
   * identically on every card. Whether that fact is GOOD is the card's
   * business, and a card that has not claimed to know stays grey rather than
   * defaulting to green — see DELTA_DIRECTION.
   *
   * Zero is grey under every direction: nothing moved, so there is nothing to
   * approve or worry about.
   */
  const good = direction === DELTA_DIRECTION.UP_GOOD ? up
    : direction === DELTA_DIRECTION.UP_BAD ? !up
    : null;
  const tone = flat || good === null
    ? 'text-[var(--text-muted)]'
    : good ? 'text-emerald-600' : 'text-red-600';
  return (
    <span data-delta-direction={direction} className={cn(
      'mt-2 inline-block text-[11px] font-semibold tabular-nums',
      tone,
    )}>
      {up ? '+' : ''}{delta}% <span className="font-normal text-[var(--text-muted)]">เทียบช่วงก่อนหน้า</span>
    </span>
  );
}

/**
 * ══ A CARD'S OWN SERIES, DRAWN AT CARD SIZE ═════════════════════════════════
 *
 * The values come from the SAME facet pass and the SAME bucket enumeration as
 * the trend chart — one array per card, already aligned to the chart's buckets
 * by construction (see `seriesFor` in lib/dashboard/buildMetrics.js). Nothing
 * here decides a window or a bucket size; if it did, the card and the chart
 * would be two implementations that agree until they do not.
 *
 * ── FLAT, NOT ABSENT, WHEN EVERY VALUE IS ZERO ─────────────────────────────
 * The same ruling as E3's zero queue cards. A card with no registrations draws
 * a flat line along the baseline; a card with no DATA draws nothing. An admin
 * must be able to tell "none happened" from "no chart" — and at the default
 * range, on a quiet week, "none happened" is the common case.
 *
 * ── DECORATIVE, IN THE ACCESSIBILITY SENSE ─────────────────────────────────
 * `aria-hidden` and no tab stop. THE NUMBER IS THE FACT: it is stated in the
 * card's value, in text, above this. The sparkline must never become the only
 * place a value appears, because for a screen-reader user it is not a place at
 * all. It is `focusable="false"` as well as aria-hidden — IE/Edge legacy SVG
 * takes a tab stop from the former and not the latter, and this costs nothing.
 */
function Sparkline({ values, color }) {
  if (!Array.isArray(values) || values.length === 0) return null;

  const W = 96;
  const H = 20;
  const max = Math.max(...values, 0);
  const n = values.length;

  // A single bucket has no line to draw between two points, so it gets a dot's
  // worth of flat segment rather than a zero-length path that renders nothing.
  const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  // `max || 1` keeps an all-zero series on the baseline instead of dividing by
  // zero — which is the flat line the header promises.
  const y = (v) => H - (v / (max || 1)) * (H - 2) - 1;

  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      /**
       * ── THE COLOUR ARRIVES AS A PROP, AND `currentColor` IS THE FALLBACK ──
       * Since round E5 each card's line is drawn in ITS OWN status colour, from
       * lib/dashboard/statusColors.js — the same hex the proportional bar fills
       * that status's segment with, so a reader who has learnt "amber is
       * รอดำเนินการ" on one chart reads the other for free.
       *
       * `text-9e-action` stays as the CLASS so a caller that passes no colour
       * still draws the blue line it always drew, rather than inheriting
       * whatever colour the card's text happens to be.
       */
      className="block overflow-visible text-9e-action"
    >
      <path
        d={d}
        fill="none"
        stroke={color ?? 'currentColor'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * ══ ONE CARD SHELL, WITH EVERY OPTIONAL PART GIVEN A RESERVED SLOT ══════════
 *
 * "Public ทั้งหมด" and "In-house ทั้งหมด" did not match their neighbours in
 * height. The neighbours carry a status chip and those two do not, so their
 * content boxes differed by a chip's height while the grid stretched the
 * anchors around them — the borders lined up and the contents did not.
 *
 * The fix is structural rather than a special case for the two. EVERY card
 * renders EVERY slot; a slot with nothing in it still occupies its height. So
 * the shell is identical whichever optional parts a caller passes, and adding a
 * new optional part later means adding a slot to this one function rather than
 * finding the cards that now disagree.
 *
 *   · `h-full` on both the <Link> and the card, so grid stretch reaches the
 *     card itself. Without it the anchor stretches and the card inside does not,
 *     which is what made the borders line up while the contents did not.
 *   · `flex-col` + `mt-auto` on the last slot, so the delta sits on the baseline
 *     of every card rather than floating under whatever content precedes it.
 *   · `min-h` on the chip and delta slots — the reserved space. The values are
 *     the rendered heights of the things that go in them, so a card with no chip
 *     is exactly as tall as one with a chip.
 *
 * ── `data-slot` IS FOR THE TEST, AND IT IS THE HONEST WAY TO ASSERT THIS ────
 * Equal HEIGHT is a pixel fact, and `renderToStaticMarkup` has no layout engine
 * — a render test cannot measure it and would be lying if it claimed to. What a
 * render test CAN assert is the property that produces it: every card emits the
 * same slots in the same order. So the slots are named, and the test counts them
 * per card. What that cannot prove is the pixels, and the report says so.
 */
function StatCard({ label, value, href, badge, accent = '', className, delta, series, seriesColor, deltaDirection }) {
  const inner = (
    <div
      data-slot="card"
      className={cn(
        'flex h-full flex-col rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-5 transition-shadow',
        href && 'hover:shadow-9e-md cursor-pointer',
        accent,
        className
      )}
    >
      <p data-slot="label" className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
      <p data-slot="value" className="mt-1 text-3xl font-bold tabular-nums text-[var(--text-primary)]">{value}</p>

      {/* The chip slot. Reserved whether or not a chip was passed. */}
      <div data-slot="badge" className="mt-2 min-h-[19px]">
        {badge && (
          <span className={cn('inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold', badge.cls)}>
            {badge.text}
          </span>
        )}
      </div>

      {/*
        The sparkline slot — reserved, and flat rather than absent at all-zero.

        ── PRESENT WHEN THE CARD IS A SERIES-BEARING CARD, NOT ALWAYS ─────────
        `StatCard` is also the ภาพรวมระบบ strip's card, and those six count LIVE
        totals — active banners, open rounds — which have no per-bucket history
        to draw and never will. Reserving 24px of empty chart on them would be
        space spent on nothing.

        The equal-height rule is a WITHIN-ROW property, and no row mixes the two
        kinds: the eight registration cards all receive a series, the six system
        cards all receive none. So each row stays uniform, which is what E4.2
        actually requires. A registration card that lost its series would lose
        its slot and shrink — the very defect E4.2 fixed — so the sparkline test
        asserts all eight have one.
      */}
      {Array.isArray(series) && (
        <div data-slot="sparkline" className="mt-2 min-h-[24px]">
          <Sparkline values={series} color={seriesColor} />
        </div>
      )}

      {/* The delta slot. `mt-auto` pins it to the card's baseline. */}
      <div data-slot="delta" className="mt-auto min-h-[17px] pt-2">
        <DeltaBadge delta={delta} direction={deltaDirection} />
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}

/**
 * ══ THE AGE HISTOGRAM — FOUR BARS, ONE SCALE, NO FLATTERING ════════════════
 *
 * Horizontal because the labels are Thai phrases, not dates: four words down
 * the left edge read at a glance, where four rotated captions under vertical
 * bars do not.
 *
 * ── ONE SHARED SCALE, AND IT IS THE POINT ─────────────────────────────────
 * Every bar is a percentage of the SAME `max` — the largest bucket — so the
 * bars are comparable to each other and to nothing else. Round E1 measured
 * 2 / 0 / 0 / 27, and E5.1 is explicit that this must not be normalised,
 * capped or log-scaled: an admin needs to see that the oldest bucket is ~13x
 * the newest, and every one of those transforms exists to hide exactly that.
 *
 * There is no `Math.max(pct, floor)` here either. The trend chart has one,
 * deliberately, because a bar of ONE registration must be visible at all; this
 * chart states its count in text beside every bar, so a floor would buy
 * nothing and would cost the proportion that is the whole message.
 *
 * ── A ZERO BUCKET DRAWS NO TRACK ──────────────────────────────────────────
 * Not a full-width empty rail. A rail behind a zero reads as "there is
 * something here, and it is empty", which is the opposite of true — the two
 * middle buckets hold nothing at all in production. The label and a plain `0`
 * are the whole row.
 *
 * ── ONE COLOUR, AND IT IS รอดำเนินการ’S ───────────────────────────────────
 * Including เกิน 14 วัน. These bars are a SUBSET of the pending card above, so
 * they wear its amber and the eye connects them. Red would say "the system is
 * broken" where the truth is "this work is old", and it would be the only red
 * on a page where red already means a bad change.
 */
function AgeHistogram({ buckets, total }) {
  const rows = Array.isArray(buckets) ? buckets : [];
  if (rows.length === 0 || total === 0) {
    return (
      <p className="py-6 text-center text-xs text-[var(--text-muted)]">
        ไม่มีงานที่ค้างอยู่ในช่วงนี้
      </p>
    );
  }
  const max = Math.max(...rows.map((b) => b.count), 0);
  return (
    <div data-chart="age-histogram" className="flex flex-col gap-3">
      {rows.map((b) => {
        // Against `max`, never against `total` and never against a cap.
        const pct = max > 0 ? (b.count / max) * 100 : 0;
        return (
          <div key={b.id} data-age-bucket={b.id} className="flex items-center gap-3">
            <span className="w-[68px] flex-none text-[11px] text-[var(--text-secondary)]">{b.label}</span>
            <div className="flex flex-1 items-center gap-2">
              {b.count > 0 && (
                <div
                  data-age-bar={b.id}
                  className="h-[18px] rounded-9e-sm transition-all duration-300"
                  style={{ width: `${pct}%`, background: statusColor('pending') }}
                />
              )}
              <span className="text-[11px] font-semibold tabular-nums text-[var(--text-primary)]">
                {b.count}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * ══ ONE BAR, FOUR SEGMENTS, AND A LEGEND THAT LEADS WITH THE COUNT ═════════
 *
 * Replaces the donut. Segments are laid out in the order the server sends
 * them, which is a declared PRESENTATION order (see `statusDist` in
 * lib/dashboard/buildMetrics.js) rather than the lifecycle order the
 * transition table runs on.
 *
 * ── THE SLIVER IS LEFT AS A SLIVER ────────────────────────────────────────
 * At N=41 one cancelled record is 2.4% of the bar, which is about 7px. There
 * is no minimum-width floor, because a floor is the bar lying: it would draw
 * one record the same size as three. The legend below is where a small segment
 * becomes readable, and that is what the legend is for.
 *
 * ── RAW COUNT FIRST, PERCENTAGE SECOND ────────────────────────────────────
 * `รอดำเนินการ 29 (71%)`. At N=41 a bare "2%" makes one record look like a
 * measurement; the count says how many things were actually counted and the
 * percentage qualifies it. The subtitle above states the window and the total,
 * so the percentage has a stated denominator.
 */
function ProportionalBar({ segments, total }) {
  const rows = Array.isArray(segments) ? segments : [];
  if (total === 0) {
    return (
      <div>
        <div className="h-[28px] w-full rounded-full bg-[var(--surface-muted)]" />
        <p className="mt-4 text-center text-xs text-[var(--text-muted)]">ไม่มีรายการในช่วงนี้</p>
      </div>
    );
  }
  return (
    <div>
      {/*
        `overflow-hidden` on a `rounded-full` track is what rounds the two END
        segments without rounding the joins between them. Four separately
        rounded children would leave slivers of empty track showing between the
        colours, which reads as a fifth, unlabelled category.
      */}
      <div data-chart="status-bar" className="flex h-[28px] w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
        {rows.map((s) => (
          <div
            key={s.status}
            data-segment={s.status}
            className="h-full transition-all duration-300"
            style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
            title={`${s.label} — ${s.count}`}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map((s) => (
          <div key={s.status} data-legend={s.status} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.color }} />
            <span className="flex-1 truncate text-xs text-[var(--text-secondary)]">{s.label}</span>
            <span className="text-xs font-semibold tabular-nums text-[var(--text-primary)]">
              {s.count}
              <span className="ml-1 font-normal text-[var(--text-muted)]">
                ({Math.round((s.count / total) * 100)}%)
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


/**
 * ══ รายการล่าสุด — SIX ROWS, SIX TAB STOPS, NOT TWENTY-FOUR ════════════════
 *
 * ── THE ROW-AS-LINK PATTERN IS COPIED, NOT REINVENTED ─────────────────────
 * Every cell holds its own <Link> to the same href, and every one but the
 * first carries `tabIndex={-1}`. That is exactly the shape
 * registrations/_components/tableParts.jsx `CellLink` uses, and the reasoning
 * is recorded there in full: ONE stretched `position:absolute` link over a
 * `position:relative` <tr> is tidier markup, but relative positioning on a
 * table row was undefined in CSS 2.1, and if a browser declines, `inset: 0`
 * resolves against the panel instead — so one row’s link covers the WHOLE
 * table and every row navigates to that record. A silent, data-wrong failure
 * no server-rendered test can see.
 *
 * The cost is four links per row instead of one, and `tabIndex={-1}` is what
 * keeps the keyboard to ONE stop per row while leaving every cell genuinely
 * clickable and middle-clickable.
 *
 * ── AND ONE FOCUS RING, ON THE ROW ────────────────────────────────────────
 * `focus-within` on the <tr> rather than a ring on each anchor: four rings
 * lighting up inside one row is four times the noise for one focus.
 *
 * ── THE EMPTY STATE IS A SENTENCE, NOT AN EMPTY TABLE ─────────────────────
 * A header row over nothing reads as "the table failed to load". Six column
 * headings with no rows beneath them say less than one line of text.
 */
function ActivityTable({ rows, generatedAt }) {
  const items = Array.isArray(rows) ? rows : [];
  if (items.length === 0) {
    return (
      <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
        <p className="text-center text-xs text-[var(--text-muted)]">ยังไม่มีรายการลงทะเบียน</p>
      </div>
    );
  }
  /**
   * THE SERVER’S CLOCK, NOT THIS ONE. `generatedAt` is the same `now` every
   * other figure in the payload was computed against, so the string rendered
   * on the server is the string the browser hydrates — see its note in
   * lib/dashboard/buildMetrics.js. `Date.now()` here would be a hydration
   * mismatch waiting for a minute boundary, and would put these strings
   * beyond the reach of a test that fixes the clock.
   *
   * The fallback is this render’s clock, for the one case where a caller
   * passes rows without a timestamp: a slightly stale relative time beats a
   * column of dashes.
   */
  const nowMs = generatedAt ? new Date(generatedAt).getTime() : Date.now();
  return (
    <div className="overflow-x-auto rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">
      <table data-table="latest-activity" className="w-full min-w-[520px] text-left">
        <thead>
          <tr className="border-b border-[var(--surface-border)]">
            <th className="px-4 py-2 text-[11px] font-semibold text-[var(--text-muted)]">ชื่อผู้สมัคร</th>
            <th className="px-4 py-2 text-[11px] font-semibold text-[var(--text-muted)]">หลักสูตร</th>
            <th className="px-4 py-2 text-[11px] font-semibold text-[var(--text-muted)]">สถานะ</th>
            <th className="px-4 py-2 text-right text-[11px] font-semibold text-[var(--text-muted)]">เวลา</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const href = `/admin/registrations/${row.id}`;
            return (
              <tr
                key={row.id}
                data-activity-row={row.id}
                className="border-b border-[var(--surface-border)] last:border-b-0 hover:bg-[var(--surface-muted)] focus-within:bg-[var(--surface-muted)] focus-within:outline focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-9e-action"
              >
                <td className="p-0">
                  <Link href={href} className="block px-4 py-3 text-xs font-semibold text-[var(--text-primary)]">
                    {row.name || '—'}
                  </Link>
                </td>
                <td className="p-0">
                  <Link href={href} tabIndex={-1} className="block px-4 py-3 text-xs text-[var(--text-secondary)]">
                    <span className="line-clamp-1">{row.courseName || '—'}</span>
                  </Link>
                </td>
                <td className="p-0">
                  <Link href={href} tabIndex={-1} className="block px-4 py-3">
                    <span
                      data-status-pill={row.status}
                      className={cn(
                        'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        statusBadge(row.status),
                      )}
                    >
                      {PUBLIC_STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </Link>
                </td>
                <td className="p-0">
                  <Link href={href} tabIndex={-1} className="block px-4 py-3 text-right text-[11px] tabular-nums text-[var(--text-muted)]">
                    {fmtRelativeThai(row.createdAt, nowMs)}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}