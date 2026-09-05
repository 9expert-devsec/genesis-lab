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
export function DashboardClient({ data, openSchedulesCount, initialRange }) {
  const router   = useRouter();
  const pathname = usePathname();
  const sp       = useSearchParams();
  const [, startTransition] = useTransition();

  const setRange = (val) => {
    const params = new URLSearchParams(sp.toString());
    if (val === 'today') params.delete('range');
    else params.set('range', val);
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
  const rangeLabel  = RANGE_OPTIONS.find((r) => r.value === initialRange)?.label ?? 'วันนี้';
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
        {scopes.registrations && <div className="flex items-center rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-1 gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRange(opt.value)}
              className={cn(
                'rounded-9e-md px-3 py-1.5 text-sm font-semibold transition-colors',
                initialRange === opt.value
                  ? 'bg-9e-navy text-9e-ice shadow-9e-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              {opt.label}
            </button>
          ))}
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

        {/* Public stats */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Public ทั้งหมด"
            value={data.public.total}
            delta={data.delta?.public?.total}
            href="/admin/registrations"
            accent="border-l-4 border-l-9e-action"
          />
          <StatCard
            label={PUBLIC_STATUS_LABEL.pending}
            value={data.public.pending}
            delta={data.delta?.public?.pending}
            href="/admin/registrations?status=pending"
            badge={{ text: 'รอ', cls: 'bg-amber-100 text-amber-700' }}
          />
          <StatCard
            label={PUBLIC_STATUS_LABEL.confirmed}
            value={data.public.confirmed}
            delta={data.delta?.public?.confirmed}
            href="/admin/registrations?status=confirmed"
            badge={{ text: 'ใบเสนอราคา', cls: 'bg-blue-100 text-blue-700' }}
          />
          <StatCard
            label={PUBLIC_STATUS_LABEL.paid}
            value={data.public.paid}
            delta={data.delta?.public?.paid}
            href="/admin/registrations?status=paid"
            badge={{ text: 'ชำระ', cls: 'bg-emerald-100 text-emerald-700' }}
          />
          <StatCard
            label={PUBLIC_STATUS_LABEL.cancelled}
            value={data.public.cancelled}
            delta={data.delta?.public?.cancelled}
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
            href="/admin/registrations?source=inhouse&status=pending"
            badge={{ text: INHOUSE_STATUS_LABEL.pending, cls: 'bg-amber-100 text-amber-700' }}
          />
          <StatCard
            label={INHOUSE_STATUS_LABEL.quoted}
            value={data.inhouse.quoted}
            delta={data.delta?.inhouse?.quoted}
            href="/admin/registrations?source=inhouse&status=quoted"
            badge={{ text: INHOUSE_STATUS_LABEL.quoted, cls: 'bg-blue-100 text-blue-700' }}
          />
        </div>
      </section>}

      {/*
        ── Section 2: Visualizations — REGISTRATION SCOPE ──
        Both charts read registration figures: the bar chart is the 7-day Public
        trend and the donut is the Public status split. E2.2 classifies them with
        the counts they are drawn from, not with the ภาพรวมระบบ strip they sit
        above.
      */}
      {scopes.registrations && <section className="grid gap-6 lg:grid-cols-2">

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

        {/* Donut chart: status distribution */}
        <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
          <p className="mb-1 text-sm font-bold text-[var(--text-primary)]">สัดส่วนสถานะ Public</p>
          <p className="mb-5 text-xs text-[var(--text-muted)]">{rangeLabel} — {statusTotal} รายการ</p>

          <div className="flex items-center gap-6">
            {/* SVG donut */}
            <DonutChart segments={data.statusDist} total={statusTotal} />

            {/* Legend */}
            <div className="flex flex-col gap-2 flex-1">
              {data.statusDist.map((s) => (
                <div key={s.status} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: s.color }} />
                    <span className="text-xs text-[var(--text-secondary)]">{s.label}</span>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-[var(--text-primary)]">
                    {s.count}
                    {statusTotal > 0 && (
                      <span className="ml-1 font-normal text-[var(--text-muted)]">
                        ({Math.round((s.count / statusTotal) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
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
function DeltaBadge({ delta }) {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return null;
  const up = delta > 0;
  const flat = delta === 0;
  return (
    <span className={cn(
      'mt-2 inline-block text-[11px] font-semibold tabular-nums',
      flat ? 'text-[var(--text-muted)]' : up ? 'text-emerald-600' : 'text-red-600',
    )}>
      {up ? '+' : ''}{delta}% <span className="font-normal text-[var(--text-muted)]">เทียบช่วงก่อนหน้า</span>
    </span>
  );
}

function StatCard({ label, value, href, badge, accent = '', className, delta }) {
  const inner = (
    <div
      className={cn(
        'rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-5 transition-shadow',
        href && 'hover:shadow-9e-md cursor-pointer',
        accent,
        className
      )}
    >
      <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-[var(--text-primary)]">{value}</p>
      {badge && (
        <span className={cn('mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold', badge.cls)}>
          {badge.text}
        </span>
      )}
      <DeltaBadge delta={delta} />
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function DonutChart({ segments, total }) {
  const SIZE   = 100;
  const R      = 36;
  const CX     = SIZE / 2;
  const CY     = SIZE / 2;
  const STROKE = 14;
  const CIRC   = 2 * Math.PI * R;

  if (total === 0) {
    return (
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="flex-none">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--surface-muted)" strokeWidth={STROKE} />
        <text x={CX} y={CY + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--text-muted)">0</text>
      </svg>
    );
  }

  let offset = 0;
  const arcs = segments.map((s) => {
    const pct  = s.count / total;
    const dash = pct * CIRC;
    const gap  = CIRC - dash;
    const arc  = { ...s, dash, gap, offset };
    offset += dash;
    return arc;
  });

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="flex-none -rotate-90">
      {arcs.map((arc) => (
        <circle
          key={arc.status}
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={arc.color}
          strokeWidth={STROKE}
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          strokeDashoffset={-arc.offset}
        />
      ))}
      <text
        x={CX} y={CY + 5}
        textAnchor="middle"
        fontSize="16"
        fontWeight="700"
        fill="currentColor"
        className="rotate-90 origin-center"
        style={{ transform: 'rotate(90deg)', transformOrigin: `${CX}px ${CY}px` }}
      >
        {total}
      </text>
    </svg>
  );
}