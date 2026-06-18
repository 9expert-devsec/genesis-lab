'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, Loader2, Download, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getMasterclassBatchOptions,
  updateMasterclassRegistrationStatus,
  deleteMasterclassRegistration,
} from '@/lib/actions/masterclass-registrations';

// ── Constants ──────────────────────────────────────────────────────

const STATUS_BADGE = {
  pending:   'bg-amber-100 text-amber-700',
  confirmed: 'bg-blue-100 text-blue-700',
  paid:      'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};
const STATUS_LABEL = {
  pending:   'รอดำเนินการ',
  confirmed: 'ยืนยันแล้ว',
  paid:      'ชำระแล้ว',
  cancelled: 'ยกเลิก',
};
const PAYMENT_BADGE = {
  successful: 'bg-emerald-100 text-emerald-700',
  pending:    'bg-amber-100 text-amber-700',
  failed:     'bg-red-100 text-red-600',
  expired:    'bg-slate-100 text-slate-500',
};
const PAYMENT_LABEL = {
  successful: 'สำเร็จ',
  pending:    'รอชำระ',
  failed:     'ล้มเหลว',
  expired:    'หมดอายุ',
};
const PAY_METHOD_CHIP = {
  credit_card: { label: 'บัตร', cls: 'bg-indigo-100 text-indigo-700' },
  promptpay:   { label: 'QR',   cls: 'bg-teal-100 text-teal-700' },
};

const STATUS_OPTIONS = [
  { value: 'all',       label: 'ทั้งหมด' },
  { value: 'pending',   label: 'รอดำเนินการ' },
  { value: 'confirmed', label: 'ยืนยันแล้ว' },
  { value: 'paid',      label: 'ชำระแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
];

const RANGE_OPTIONS = [
  { value: 'all',   label: 'ทั้งหมด' },
  { value: 'today', label: 'วันนี้' },
  { value: 'week',  label: '7 วัน' },
  { value: 'month', label: 'เดือนนี้' },
];

const STAT_CARDS = [
  { key: 'total',     label: 'ทั้งหมด',     filterVal: 'all',       cls: 'border-l-4 border-l-[var(--surface-border)]' },
  { key: 'pending',   label: 'รอดำเนินการ', filterVal: 'pending',   cls: 'border-l-4 border-l-amber-400' },
  { key: 'confirmed', label: 'ยืนยันแล้ว',  filterVal: 'confirmed', cls: 'border-l-4 border-l-blue-400' },
  { key: 'paid',      label: 'ชำระแล้ว',    filterVal: 'paid',      cls: 'border-l-4 border-l-emerald-400' },
  { key: 'cancelled', label: 'ยกเลิก',      filterVal: 'cancelled', cls: 'border-l-4 border-l-slate-300' },
];

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}
function refNo(id) { return String(id).slice(-8).toUpperCase(); }

// ── Main Component ─────────────────────────────────────────────────

export function MasterclassRegistrationsClient({
  initialData,
  initialStatus,
  initialQ,
  initialRange    = 'all',
  initialCourseId = '',
  initialBatchId  = '',
  counts,
  courseOptions = [],
}) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [q,        setQ]        = useState(initialQ);
  const [status,   setStatus]   = useState(initialStatus);
  const [range,    setRange]    = useState(initialRange);
  const [courseId, setCourseId] = useState(initialCourseId);
  const [batchId,  setBatchId]  = useState(initialBatchId);
  const [batchOptions, setBatchOptions] = useState([]);
  // For inline status update
  const [updatingId, setUpdatingId] = useState(null);

  const navigate = useCallback((overrides = {}) => {
    const params = new URLSearchParams(searchParams.toString());
    const next = { page: '1', status, q, range, courseId, batchId, ...overrides };
    Object.entries(next).forEach(([k, v]) => {
      const isDefault =
        (k === 'status'   && v === 'all') ||
        (k === 'q'        && v === '')    ||
        (k === 'range'    && v === 'all') ||
        (k === 'courseId' && v === '')    ||
        (k === 'batchId'  && v === '')    ||
        (k === 'page'     && v === '1');
      if (!isDefault && v !== '' && v != null) params.set(k, String(v));
      else params.delete(k);
    });
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }, [pathname, searchParams, router, status, q, range, courseId, batchId]);

  // Fetch batch options when the selected course changes.
  useEffect(() => {
    if (!courseId) { setBatchOptions([]); return; }
    getMasterclassBatchOptions(courseId)
      .then((opts) => setBatchOptions(Array.isArray(opts) ? opts : []))
      .catch(() => {});
  }, [courseId]);

  const handleSearch = (e) => {
    e.preventDefault();
    navigate({ q, page: '1' });
  };

  async function handleStatusChange(id, newStatus) {
    setUpdatingId(id);
    await updateMasterclassRegistrationStatus(id, newStatus);
    startTransition(() => router.refresh());
    setUpdatingId(null);
  }

  async function handleDelete(id) {
    if (!window.confirm(`ลบใบลงทะเบียน ${refNo(id)} ถาวร?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    setUpdatingId(id);
    await deleteMasterclassRegistration(id);
    startTransition(() => router.refresh());
    setUpdatingId(null);
  }

  async function handleExportCsv() {
    const headers = ['รหัส','ชื่อ','นามสกุล','อีเมล','เบอร์โทร','หลักสูตร','รุ่น','วันที่','License','ราคา','สถานะ'];
    const rows = initialData.items.map((reg) => [
      refNo(reg._id),
      reg.attendee?.firstName ?? '',
      reg.attendee?.lastName  ?? '',
      reg.attendee?.email     ?? '',
      reg.attendee?.phone     ?? '',
      reg.course_title        ?? '',
      reg.batch_label         ?? '',
      reg.batch_date_label    ?? '',
      reg.license_choice      ?? '',
      reg.pricing?.total      ?? '',
      STATUS_LABEL[reg.status] ?? reg.status,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    const bom  = '﻿'; // UTF-8 BOM for Thai in Excel
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `masterclass-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const { items, page, pageCount } = initialData;
  const statCounts = counts ?? { total: 0, pending: 0, confirmed: 0, paid: 0, cancelled: 0 };
  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range)?.label ?? 'ทั้งหมด';

  return (
    <div className="space-y-5">

      {/* ── [A] Stat strip ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            สรุปยอด — <span className="font-semibold">{rangeLabel}</span>
          </p>
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setRange(opt.value); navigate({ range: opt.value, page: '1' }); }}
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

        <div className="grid grid-cols-5 gap-3">
          {STAT_CARDS.map(({ key, label, filterVal, cls }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setStatus(filterVal); navigate({ status: filterVal, page: '1' }); }}
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

      {/* ── [B] Filters row ── */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ / อีเมล / เบอร์โทร"
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

        {/* Course dropdown */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">หลักสูตร</label>
          <select
            value={courseId}
            onChange={(e) => {
              const next = e.target.value;
              setCourseId(next);
              setBatchId('');
              navigate({ courseId: next, batchId: '', page: '1' });
            }}
            className={selectCls()}
          >
            <option value="">ทุกหลักสูตร</option>
            {courseOptions.map((c) => (
              <option key={c._id} value={c._id}>{c.title_th}</option>
            ))}
          </select>
        </div>

        {/* Batch dropdown */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">รุ่น</label>
          <select
            value={batchId}
            disabled={!courseId}
            onChange={(e) => {
              const next = e.target.value;
              setBatchId(next);
              navigate({ batchId: next, page: '1' });
            }}
            className={cn(selectCls(), !courseId && 'opacity-50')}
          >
            <option value="">ทุกรุ่น</option>
            {batchOptions.map((b) => (
              <option key={b._id} value={b._id}>
                {b.batch_label || `รุ่นที่ ${b.batch_no}`}
              </option>
            ))}
          </select>
        </div>

        {/* Status filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setStatus(opt.value); navigate({ status: opt.value, page: '1' }); }}
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

        {/* Export CSV */}
        <button
          type="button"
          onClick={handleExportCsv}
          title="ส่งออกเฉพาะรายการในหน้านี้"
          className="ml-auto flex h-9 items-center gap-1.5 rounded-9e-md border border-[var(--surface-border)] px-3 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {/* ── [C] Table ── */}
      <div className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
              <tr>
                <Th>รหัส</Th>
                <Th>ชื่อ-อีเมล</Th>
                <Th>หลักสูตร / รุ่น</Th>
                <Th>License</Th>
                <Th>ราคา</Th>
                <Th center>การชำระ</Th>
                <Th>สถานะ</Th>
                <Th>วันที่</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-[var(--text-muted)]">
                    ไม่พบรายการที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              )}
              {items.map((reg) => (
                <tr
                  key={reg._id}
                  className="border-b border-[var(--surface-border)] last:border-b-0 hover:bg-[var(--surface-muted)]"
                >
                  {/* รหัส */}
                  <td className="px-4 py-3 font-mono text-xs font-bold text-9e-action whitespace-nowrap">
                    {refNo(reg._id)}
                  </td>

                  {/* ชื่อ-อีเมล */}
                  <td className="max-w-[200px] px-4 py-3">
                    <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                      {reg.attendee?.firstName} {reg.attendee?.lastName}
                    </p>
                    <p className="truncate text-xs text-[var(--text-muted)]">{reg.attendee?.email}</p>
                    {reg.attendee?.phone && (
                      <p className="truncate text-xs text-[var(--text-muted)]">{reg.attendee.phone}</p>
                    )}
                  </td>

                  {/* หลักสูตร / รุ่น */}
                  <td className="max-w-[200px] px-4 py-3">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{reg.course_title}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {[reg.batch_label, reg.batch_date_label].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </td>

                  {/* License */}
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    {reg.license_choice === 'own'
                      ? `own${reg.license_level ? ` · ${reg.license_level}` : ''}`
                      : reg.license_choice === '9expert'
                        ? '9Expert license'
                        : '—'}
                  </td>

                  {/* ราคา */}
                  <td className="px-4 py-3 text-sm tabular-nums text-[var(--text-primary)] whitespace-nowrap">
                    {reg.pricing?.total != null
                      ? `${Number(reg.pricing.total).toLocaleString('th-TH')} ฿`
                      : '—'}
                  </td>

                  {/* การชำระ */}
                  <td className="px-4 py-3 text-center">
                    <PaymentCell payment={reg.payment} />
                  </td>

                  {/* สถานะ — inline select */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={reg.status}
                        disabled={updatingId === reg._id}
                        onChange={(e) => handleStatusChange(reg._id, e.target.value)}
                        className={cn(
                          'rounded-full border-0 px-2.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-9e-brand',
                          STATUS_BADGE[reg.status] ?? 'bg-slate-100 text-slate-600'
                        )}
                      >
                        <option value="pending">{STATUS_LABEL.pending}</option>
                        <option value="confirmed">{STATUS_LABEL.confirmed}</option>
                        <option value="paid">{STATUS_LABEL.paid}</option>
                        <option value="cancelled">{STATUS_LABEL.cancelled}</option>
                      </select>
                      {updatingId === reg._id && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" />
                      )}
                    </div>
                  </td>

                  {/* วันที่ */}
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)] whitespace-nowrap">
                    {fmtDate(reg.createdAt)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/admin/masterclass/registrations/${reg._id}`}
                        className="text-xs font-semibold text-9e-action hover:underline"
                      >
                        ดูรายละเอียด →
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(reg._id)}
                        disabled={updatingId === reg._id}
                        className="text-[var(--text-muted)] hover:text-red-500 transition-colors disabled:opacity-40"
                        aria-label="ลบ"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── [D] Pagination ── */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <PagerBtn disabled={page <= 1} onClick={() => navigate({ page: page - 1 })}>‹ ก่อนหน้า</PagerBtn>
          <span className="text-xs text-[var(--text-secondary)]">
            หน้า {page} / {pageCount}
          </span>
          <PagerBtn disabled={page >= pageCount} onClick={() => navigate({ page: page + 1 })}>ถัดไป ›</PagerBtn>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function selectCls() {
  return cn(
    'h-9 rounded-9e-md border bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]',
    'border-[var(--surface-border)]',
    'focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
  );
}

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

function PaymentCell({ payment }) {
  const omiseStatus = payment?.omiseStatus ?? 'pending';
  const chip = PAY_METHOD_CHIP[payment?.method];
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={cn(
        'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold',
        PAYMENT_BADGE[omiseStatus] ?? 'bg-slate-100 text-slate-600'
      )}>
        {PAYMENT_LABEL[omiseStatus] ?? omiseStatus}
      </span>
      {chip && (
        <span className={cn('inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold', chip.cls)}>
          {chip.label}
        </span>
      )}
    </div>
  );
}

function PagerBtn({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'min-w-[88px] rounded-9e-md px-3 py-1.5 text-xs font-medium transition-colors',
        'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--surface-border)] hover:bg-[var(--surface-muted)]',
        disabled && 'opacity-40 pointer-events-none'
      )}
    >
      {children}
    </button>
  );
}
