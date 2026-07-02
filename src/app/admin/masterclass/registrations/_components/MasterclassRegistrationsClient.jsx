'use client';

import { useState, useEffect, useTransition, useCallback, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, Loader2, Download, Trash2, MoreVertical, Eye } from 'lucide-react';
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

const LICENSE_SCOPE_OPTIONS = [
  { value: '',             label: 'ทุก License' },
  { value: 'all',          label: 'เลือกรวม' },
  { value: 'per_attendee', label: 'แยกรายคน' },
];

// Human-readable license summary for the list cell.
function licenseCellText(reg) {
  if (reg.license_scope === 'per_attendee') return 'แยกรายคน';
  const choice = reg.license_choice;
  if (!choice) return '—';
  const base =
    choice === 'own'     ? 'License ตนเอง'
  : choice === '9expert' ? 'License 9Expert'
  : choice;
  const extra = reg.license_level || reg.license_detail;
  return extra ? `${base} · ${extra}` : base;
}

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
  initialLicenseScope = '',
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
  const [licenseScope, setLicenseScope] = useState(initialLicenseScope);
  const [batchOptions, setBatchOptions] = useState([]);
  const [openMenuId, setOpenMenuId] = useState(null);
  // For inline status update
  const [updatingId, setUpdatingId] = useState(null);

  const navigate = useCallback((overrides = {}) => {
    const params = new URLSearchParams(searchParams.toString());
    // `ppp` (per-page) is managed separately by the auto-fit effect; preserve it.
    const next = { page: '1', status, q, range, courseId, batchId, licenseScope, ...overrides };
    Object.entries(next).forEach(([k, v]) => {
      const isDefault =
        (k === 'status'       && v === 'all') ||
        (k === 'q'            && v === '')    ||
        (k === 'range'        && v === 'all') ||
        (k === 'courseId'     && v === '')    ||
        (k === 'batchId'      && v === '')    ||
        (k === 'licenseScope' && v === '')    ||
        (k === 'page'         && v === '1');
      if (!isDefault && v !== '' && v != null) params.set(k, String(v));
      else params.delete(k);
    });
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }, [pathname, searchParams, router, status, q, range, courseId, batchId, licenseScope]);

  // Fetch batch options when the selected course changes.
  useEffect(() => {
    if (!courseId) { setBatchOptions([]); return; }
    getMasterclassBatchOptions(courseId)
      .then((opts) => setBatchOptions(Array.isArray(opts) ? opts : []))
      .catch(() => {});
  }, [courseId]);

  // Auto-fit page size to the viewport: measure free vertical space below the
  // table's top, divide by an approximate row height, and sync to the `ppp` URL
  // param. Runs on mount and on window resize (debounced).
  const tableWrapRef = useRef(null);
  useEffect(() => {
    const ROW_H = 64;   // approx per-row height (px), matches py-3 rows
    const FOOTER = 120; // reserve space for pagination + page padding

    function computeFit() {
      const el = tableWrapRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const avail = window.innerHeight - top - FOOTER;
      const fit = Math.max(5, Math.min(100, Math.floor(avail / ROW_H)));

      const current = parseInt(searchParams.get('ppp') ?? '', 10) || 20;
      if (fit !== current) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('ppp', String(fit));
        params.delete('page'); // reset to first page when page size changes
        startTransition(() => router.replace(`${pathname}?${params.toString()}`));
      }
    }

    computeFit();
    let t;
    function onResize() { clearTimeout(t); t = setTimeout(computeFit, 200); }
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); };
  }, [pathname, searchParams, router]);

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

        {/* License scope dropdown */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]">License</label>
          <select
            value={licenseScope}
            onChange={(e) => {
              const next = e.target.value;
              setLicenseScope(next);
              navigate({ licenseScope: next, page: '1' });
            }}
            className={selectCls()}
          >
            {LICENSE_SCOPE_OPTIONS.map((o) => (
              <option key={o.value || 'any'} value={o.value}>{o.label}</option>
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
      <div ref={tableWrapRef} className="overflow-hidden rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
              <tr>
                <Th>รหัส</Th>
                <Th>ผู้ประสานงาน</Th>
                <Th>หลักสูตร / รุ่น</Th>
                <Th center>ผู้เข้าอบรม</Th>
                <Th>License</Th>
                <Th>ราคา</Th>
                <Th center>การชำระ</Th>
                <Th>สถานะ</Th>
                <Th>วันที่ลงทะเบียน</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-[var(--text-muted)]">
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

                  {/* ผู้ประสานงาน */}
                  <td className="max-w-[220px] px-4 py-3">
                    {(() => {
                      const c = reg.coordinator || {};
                      const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()
                        || `${reg.attendee?.firstName ?? ''} ${reg.attendee?.lastName ?? ''}`.trim()
                        || '—';
                      const email = c.email || reg.attendee?.email || '';
                      const phone = c.phone || reg.attendee?.phone || '';
                      return (
                        <>
                          <p className="truncate text-sm font-bold text-[var(--text-primary)]">{name}</p>
                          {email && <p className="truncate text-xs text-[var(--text-muted)]">{email}</p>}
                          {phone && <p className="truncate text-xs text-[var(--text-muted)]">{phone}</p>}
                        </>
                      );
                    })()}
                  </td>

                  {/* หลักสูตร / รุ่น */}
                  <td className="max-w-[200px] px-4 py-3">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{reg.course_title}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {[reg.batch_label, reg.batch_date_label].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </td>

                  {/* ผู้เข้าอบรม */}
                  <td className="px-4 py-3 text-center text-sm tabular-nums font-semibold text-[var(--text-primary)] whitespace-nowrap">
                    {reg.attendeesCount ?? (Array.isArray(reg.attendees) ? reg.attendees.length : 1) ?? 1}
                  </td>

                  {/* License */}
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    {licenseCellText(reg)}
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

                  {/* Actions — kebab menu */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <RowActionsMenu
                      reg={reg}
                      isOpen={openMenuId === reg._id}
                      onToggle={() => setOpenMenuId((cur) => (cur === reg._id ? null : reg._id))}
                      onClose={() => setOpenMenuId(null)}
                      onDelete={() => { setOpenMenuId(null); handleDelete(reg._id); }}
                      busy={updatingId === reg._id}
                    />
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

function RowActionsMenu({ reg, isOpen, onToggle, onClose, onDelete, busy }) {
  const btnRef  = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState(null); // { top, right } in viewport space

  // Compute fixed-position coords from the trigger button.
  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right });
  }, []);

  const handleToggle = () => {
    if (!isOpen) place();
    onToggle();
  };

  useEffect(() => {
    if (!isOpen) return;
    place();

    function onDocClick(e) {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) onClose();
    }
    function onDismiss() { onClose(); } // any scroll/resize closes the menu

    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('scroll', onDismiss, true); // capture: catch inner scrollers
    window.addEventListener('resize', onDismiss);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('scroll', onDismiss, true);
      window.removeEventListener('resize', onDismiss);
    };
  }, [isOpen, onClose, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        disabled={busy}
        aria-label="ตัวเลือก"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="rounded-9e-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)] disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
      </button>

      {isOpen && coords && (
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: coords.top, right: coords.right, zIndex: 50 }}
          className="w-44 overflow-hidden rounded-9e-md border border-[var(--surface-border)] bg-[var(--surface)] py-1 shadow-9e-md"
        >
          <Link
            href={`/admin/masterclass/registrations/${reg._id}`}
            role="menuitem"
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
          >
            <Eye className="h-3.5 w-3.5" /> ดูรายละเอียด
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={onDelete}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> ลบรายการ
          </button>
        </div>
      )}
    </>
  );
}

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
