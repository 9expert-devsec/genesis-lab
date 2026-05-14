'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────

const RANGE_OPTIONS = [
  { value: 'today', label: 'วันนี้' },
  { value: 'week',  label: '7 วัน' },
  { value: 'month', label: 'เดือนนี้' },
  { value: 'all',   label: 'ทั้งหมด' },
];

const THAI_MONTHS_SHORT = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

function fmtDateShort(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]}`;
}

// ── Component ──────────────────────────────────────────────────────

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

  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === initialRange)?.label ?? 'วันนี้';
  const trendMax   = Math.max(...data.trend.map((d) => d.count), 1);
  const statusTotal = data.statusDist.reduce((s, d) => s + d.count, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8">

      {/* ── Header + range toggle ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">แดชบอร์ด</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            ภาพรวมระบบ 9Expert Training
          </p>
        </div>

        <div className="flex items-center rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-1 gap-1">
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
        </div>
      </div>

      {/* ── Section 1: Registration metrics (date-filtered) ── */}
      <section className="space-y-3">
        <SectionHeader
          title={`การลงทะเบียน — ${rangeLabel}`}
          subtitle="Public + In-house"
        />

        {/* Public stats */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Public ทั้งหมด"
            value={data.public.total}
            href="/admin/registrations"
            accent="border-l-4 border-l-9e-action"
          />
          <StatCard
            label="รอดำเนินการ"
            value={data.public.pending}
            href="/admin/registrations?status=pending"
            badge={{ text: 'รอ', cls: 'bg-amber-100 text-amber-700' }}
          />
          <StatCard
            label="ยืนยันแล้ว"
            value={data.public.confirmed}
            href="/admin/registrations?status=confirmed"
            badge={{ text: 'ยืนยัน', cls: 'bg-blue-100 text-blue-700' }}
          />
          <StatCard
            label="ชำระแล้ว"
            value={data.public.paid}
            href="/admin/registrations?status=paid"
            badge={{ text: 'ชำระ', cls: 'bg-emerald-100 text-emerald-700' }}
          />
          <StatCard
            label="ยกเลิก"
            value={data.public.cancelled}
            href="/admin/registrations?status=cancelled"
            badge={{ text: 'ยกเลิก', cls: 'bg-slate-100 text-slate-500' }}
          />
        </div>

        {/* Inhouse stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="In-house ทั้งหมด"
            value={data.inhouse.total}
            href="/admin/registrations?source=inhouse"
            accent="border-l-4 border-l-violet-400"
          />
          <StatCard
            label="รอติดต่อ"
            value={data.inhouse.new}
            href="/admin/registrations?source=inhouse&status=new"
            badge={{ text: 'ใหม่', cls: 'bg-violet-100 text-violet-700' }}
          />
          <StatCard
            label="ปิดงานสำเร็จ"
            value={data.inhouse.closedWon}
            href="/admin/registrations?source=inhouse&status=closed-won"
            badge={{ text: 'สำเร็จ', cls: 'bg-emerald-100 text-emerald-700' }}
          />
        </div>
      </section>

      {/* ── Section 2: Visualizations ── */}
      <section className="grid gap-6 lg:grid-cols-2">

        {/* Bar chart: 7-day trend */}
        <div className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
          <p className="mb-1 text-sm font-bold text-[var(--text-primary)]">แนวโน้มการลงทะเบียน (7 วัน)</p>
          <p className="mb-5 text-xs text-[var(--text-muted)]">Public — จำนวนรายการต่อวัน</p>
          <div className="flex items-end gap-2 h-32">
            {data.trend.map((d) => {
              const pct = trendMax > 0 ? (d.count / trendMax) * 100 : 0;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold text-[var(--text-secondary)]">
                    {d.count > 0 ? d.count : ''}
                  </span>
                  <div className="w-full rounded-t-9e-sm bg-[var(--surface-muted)] relative" style={{ height: '96px' }}>
                    <div
                      className="absolute bottom-0 w-full rounded-t-9e-sm bg-9e-action transition-all duration-300"
                      style={{ height: `${Math.max(pct, d.count > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {fmtDateShort(d.date)}
                  </span>
                </div>
              );
            })}
          </div>
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
      </section>

      {/* ── Section 3: System overview (not date-filtered) ── */}
      <section className="space-y-3">
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
      </section>

    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

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

function StatCard({ label, value, href, badge, accent = '', className }) {
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