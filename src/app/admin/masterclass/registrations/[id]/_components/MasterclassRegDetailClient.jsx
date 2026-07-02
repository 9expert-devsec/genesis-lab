'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Trash2, Check, Plus, Save, X, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatTHB } from '@/lib/pricing';
import { formatBillingAddress } from '@/lib/address/formatBillingAddress';
import {
  updateMasterclassRegistrationStatus,
  deleteMasterclassRegistration,
  updateMasterclassRegistrationAttendees,
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
const PAYMENT_METHOD_LABEL = { credit_card: 'บัตรเครดิต/เดบิต', promptpay: 'QR PromptPay', quote: 'ขอใบเสนอราคา' };
const OMISE_STATUS_LABEL   = { pending: 'รอชำระ', successful: 'สำเร็จ', failed: 'ล้มเหลว', expired: 'หมดอายุ' };
const LICENSE_CHOICE_LABEL = { own: 'ใช้ License ของตนเอง', '9expert': 'ใช้ License ของ 9Expert' };
const LICENSE_CHOICE_SHORT = { own: 'License ตนเอง', '9expert': 'License 9Expert' };

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.`;
}
function refNo(id) { return String(id).slice(-8).toUpperCase(); }

// ── Main Component ─────────────────────────────────────────────────

export function MasterclassRegDetailClient({ reg }) {
  const router = useRouter();
  const [status, setStatus] = useState(reg.status);
  const [error,  setError]  = useState(null);
  const [busy,   setBusy]   = useState(null);
  const [activeTab, setActiveTab] = useState('registration'); // 'registration' | 'attendees'
  const [, startTransition] = useTransition();

  const handleSaveStatus = () => {
    setBusy('status'); setError(null);
    startTransition(async () => {
      const res = await updateMasterclassRegistrationStatus(reg._id, status);
      if (res?.ok) startTransition(() => router.refresh());
      else setError(res?.error || 'บันทึกไม่สำเร็จ');
      setBusy(null);
    });
  };

  const handleDelete = () => {
    if (!window.confirm(`ลบใบลงทะเบียน ${refNo(reg._id)} ถาวร?\n\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`)) return;
    setBusy('delete'); setError(null);
    startTransition(async () => {
      const res = await deleteMasterclassRegistration(reg._id);
      if (res?.ok) router.push('/admin/masterclass/registrations');
      else { setError(res?.error || 'ลบไม่สำเร็จ'); setBusy(null); }
    });
  };

  const p = reg.pricing;
  const pay = reg.payment;
  const inv = reg.invoice;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-28">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/masterclass/registrations"
            className="mb-3 flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-9e-action"
          >
            <ArrowLeft className="h-4 w-4" /> ผู้ลงทะเบียนทั้งหมด
          </Link>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            ใบลงทะเบียน <span className="font-mono text-9e-action">{refNo(reg._id)}</span>
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">ลงทะเบียนเมื่อ {fmtDate(reg.createdAt)}</p>
        </div>
        <span className={cn('inline-block rounded-full px-3 py-1 text-sm font-semibold', STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-600')}>
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-[var(--surface-border)]">
        {[
          { key: 'registration', label: 'ข้อมูลการลงทะเบียน' },
          { key: 'attendees',    label: 'ข้อมูลผู้เข้าอบรม' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-semibold transition-colors',
              activeTab === t.key
                ? 'text-9e-action'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            )}
          >
            {t.label}
            {activeTab === t.key && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-9e-action" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Registration info ── */}
      <div className={cn('grid gap-6 md:grid-cols-2', activeTab !== 'registration' && 'hidden')}>
        {/* ── ข้อมูลผู้ประสานงาน ── */}
        <Card title="ข้อมูลผู้ประสานงาน">
          {(() => {
            const c = reg.coordinator ?? {};
            const hasCoord = c.firstName || c.lastName || c.email || c.phone;
            if (!hasCoord) {
              return <p className="text-sm italic text-[var(--text-muted)]">ไม่มีข้อมูลผู้ประสานงาน</p>;
            }
            return (
              <>
                <Row label="ชื่อ-นามสกุล" value={`${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()} />
                <Row label="อีเมล"        value={c.email} />
                <Row label="เบอร์โทร"     value={c.phone} />
                <Row label="เข้าอบรมด้วย"  value={c.isAttending ? 'ใช่' : 'ไม่'} />
              </>
            );
          })()}
        </Card>

        {/* ── หลักสูตร ── */}
        <Card title="หลักสูตร">
          <Row label="หลักสูตร"   value={reg.course_title} />
          <Row label="รุ่น"       value={reg.batch_label} />
          <Row label="วันอบรม"    value={reg.batch_date_label} />
          <Row label="สถานที่"    value={reg.venue_name} />
        </Card>

        {/* ── License (choice only — no conditions) ── */}
        <Card title="License">
          {reg.license_scope === 'per_attendee' ? (
            <Row label="รูปแบบ" value="แยกรายคน (ดูในแท็บผู้เข้าอบรม)" />
          ) : reg.license_choice ? (
            <>
              <Row label="ตัวเลือก" value={LICENSE_CHOICE_LABEL[reg.license_choice] ?? reg.license_choice} />
              {reg.license_level  && <Row label="ระดับ"      value={reg.license_level} />}
              {reg.license_detail && <Row label="รายละเอียด" value={reg.license_detail} />}
            </>
          ) : (
            <p className="text-sm italic text-[var(--text-muted)]">ไม่ได้เลือก License</p>
          )}
        </Card>

        {/* ── ราคา ── */}
        {p && (
          <Card title="ราคา">
            <Row label="ราคาต่อท่าน" value={`${formatTHB(p.pricePerSeat)} บาท`} />
            <Row label={`ราคา × ${p.seats ?? 1} ท่าน`} value={`${formatTHB(p.subtotal)} บาท`} />
            <Row label={`VAT ${Math.round((p.vatRate ?? 0.07) * 100)}%`} value={`${formatTHB(p.vatAmount)} บาท`} />
            <Row label="ยอดสุทธิ" value={<span className="font-bold text-9e-action">{formatTHB(p.total)} บาท</span>} />
          </Card>
        )}

        {/* ── การชำระเงิน ── */}
        {pay && (
          <Card title="การชำระเงิน">
            <Row label="วิธีชำระเงิน" value={PAYMENT_METHOD_LABEL[pay.method] ?? pay.method} />
            <Row
              label="สถานะการชำระ"
              value={
                <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', PAYMENT_BADGE[pay.omiseStatus] ?? 'bg-slate-100 text-slate-600')}>
                  {OMISE_STATUS_LABEL[pay.omiseStatus] ?? (pay.omiseStatus || '—')}
                </span>
              }
            />
            {pay.omiseChargeId && (
              <Row
                label="Omise Charge ID"
                value={
                  <a
                    href={`https://dashboard.omise.co/charges/${pay.omiseChargeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block max-w-[200px] truncate font-mono text-xs text-9e-action hover:underline"
                  >
                    {pay.omiseChargeId}
                  </a>
                }
              />
            )}
            {pay.paidAt && <Row label="วันที่ชำระ" value={fmtDate(pay.paidAt)} />}
            {(pay.failureCode || pay.failureMessage) && (
              <Row label="สาเหตุที่ล้มเหลว" value={[pay.failureCode, pay.failureMessage].filter(Boolean).join(' · ')} />
            )}
          </Card>
        )}

        {/* ── ใบเสร็จ / ใบกำกับภาษี ── */}
        <Card title="ใบเสร็จ / ใบกำกับภาษี">
          {!reg.request_invoice || !inv ? (
            <p className="text-sm italic text-[var(--text-muted)]">ไม่ได้ขอใบกำกับภาษี</p>
          ) : (
            <>
              <Row
                label="ประเภทลูกค้า"
                value={`${inv.type === 'corporate' ? 'นิติบุคคล / บริษัท' : 'บุคคลทั่วไป'} · ${inv.country === 'OTHER' ? 'ต่างประเทศ' : 'ไทย'}`}
              />
              {inv.type === 'individual' ? (
                <Row label="ชื่อ-นามสกุล" value={`${inv.firstName ?? ''} ${inv.lastName ?? ''}`.trim()} />
              ) : (
                <>
                  <Row label="ชื่อบริษัท" value={inv.companyName} />
                  {inv.branch && <Row label="สาขา" value={inv.branch} />}
                </>
              )}
              {inv.taxId && <Row label="เลขประจำตัวผู้เสียภาษี" value={inv.taxId} />}
              {formatBillingAddress(inv) && (
                <Row label="ที่อยู่" value={formatBillingAddress(inv)} />
              )}
            </>
          )}
        </Card>

      </div>

      {/* ── Tab 2: Attendees ── */}
      <div className={cn(activeTab !== 'attendees' && 'hidden')}>
        <AttendeesEditor reg={reg} />
      </div>

      {/* ── Admin actions (fixed full-width bottom bar) ── */}
      <section className="fixed right-0 bottom-0 left-0 z-40 border-t border-[var(--surface-border)] bg-[var(--surface)] px-6 py-4 shadow-9e-md md:left-64">
        <div className="mx-auto flex max-w-4xl flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">สถานะ</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={cn(
                  'h-9 w-44 rounded-9e-md border bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]',
                  'border-[var(--surface-border)] focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
                )}
              >
                <option value="pending">{STATUS_LABEL.pending}</option>
                <option value="confirmed">{STATUS_LABEL.confirmed}</option>
                <option value="paid">{STATUS_LABEL.paid}</option>
                <option value="cancelled">{STATUS_LABEL.cancelled}</option>
              </select>
            </div>
            <button
              type="button"
              onClick={handleSaveStatus}
              disabled={busy !== null || status === reg.status}
              className="flex h-9 items-center gap-1.5 rounded-9e-md bg-9e-navy px-4 text-xs font-semibold text-9e-ice hover:opacity-90 disabled:opacity-40"
            >
              {busy === 'status' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              บันทึก
            </button>
          </div>

          <button
            type="button"
            onClick={handleDelete}
            disabled={busy !== null}
            className="flex h-9 items-center gap-1.5 rounded-9e-md border border-red-200 px-4 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            ลบรายการ
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </section>
    </div>
  );
}

// ── Attendees editor ───────────────────────────────────────────────

function AttendeesEditor({ reg }) {
  const router = useRouter();
  const seatTarget = reg.attendeesCount
    ?? (Array.isArray(reg.attendees) ? reg.attendees.length : 1)
    ?? 1;

  // Shared (batch-level) license, used as the fallback for "all" scope.
  const sharedLicense = {
    choice: reg.license_choice ?? '',
    level:  reg.license_level  ?? '',
    detail: reg.license_detail ?? '',
  };
  const wasPerAttendee = reg.license_scope === 'per_attendee';

  // Seed rows from attendees + license. Per-attendee scope reads the index-aligned
  // license_per_attendee[]; "all" scope falls back to the shared license so every
  // row shows the shared choice (display only — scope is preserved on save).
  const seed = () => {
    const lpa = Array.isArray(reg.license_per_attendee) ? reg.license_per_attendee : [];
    const licenseForRow = (i) => {
      const per = lpa[i];
      if (wasPerAttendee && per && per.choice) {
        return { choice: per.choice ?? '', level: per.level ?? '', detail: per.detail ?? '' };
      }
      return { ...sharedLicense };
    };
    const base = (Array.isArray(reg.attendees) ? reg.attendees : []).map((a, i) => ({
      firstName: a.firstName ?? '',
      lastName:  a.lastName  ?? '',
      email:     a.email     ?? '',
      phone:     a.phone     ?? '',
      license: licenseForRow(i),
    }));
    while (base.length < seatTarget) {
      const i = base.length;
      base.push({ firstName: '', lastName: '', email: '', phone: '', license: licenseForRow(i) });
    }
    return base;
  };

  const [rows, setRows] = useState(seed);
  const [editing, setEditing] = useState(() => new Set()); // row indices in edit mode
  const [busy, setBusy] = useState(false);
  const [msg,  setMsg]  = useState(null);
  const [, startTransition] = useTransition();

  const isEditing = (i) => editing.has(i);
  const startEdit = (i) => setEditing((prev) => new Set(prev).add(i));
  const stopEdit  = (i) => setEditing((prev) => { const n = new Set(prev); n.delete(i); return n; });

  const setField = (i, key, val) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));

  const setLicense = (i, key, val) =>
    setRows((prev) => prev.map((r, idx) =>
      idx === i ? { ...r, license: { ...r.license, [key]: val } } : r
    ));

  const canAdd = rows.length < seatTarget;
  const addRow = () => {
    if (!canAdd) return;
    setRows((prev) => [...prev, { firstName: '', lastName: '', email: '', phone: '', license: { choice: '', level: '', detail: '' } }]);
    setEditing((prev) => new Set(prev).add(rows.length)); // new row starts editable
  };

  const removeRow = (i) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
    setEditing((prev) => {
      // Reindex editing set after removal.
      const n = new Set();
      prev.forEach((e) => { if (e < i) n.add(e); else if (e > i) n.add(e - 1); });
      return n;
    });
  };

  const save = () => {
    setBusy(true); setMsg(null);
    startTransition(async () => {
      // Detect whether the admin changed any row's license away from the shared one.
      const licensesDifferFromShared = rows.some((r) =>
        (r.license?.choice ?? '') !== (sharedLicense.choice ?? '') ||
        (r.license?.level  ?? '') !== (sharedLicense.level  ?? '') ||
        (r.license?.detail ?? '') !== (sharedLicense.detail ?? '')
      );
      // Only promote to per-attendee when it already was, or the admin diverged a row.
      const perAttendeeIntent = wasPerAttendee || licensesDifferFromShared;
      const res = await updateMasterclassRegistrationAttendees(reg._id, rows, { perAttendeeIntent });
      if (res?.ok) {
        setMsg({ ok: true, text: 'บันทึกรายชื่อผู้เข้าอบรมแล้ว' });
        setEditing(new Set()); // lock all rows after save
        startTransition(() => router.refresh());
      } else {
        setMsg({ ok: false, text: res?.error || 'บันทึกไม่สำเร็จ' });
      }
      setBusy(false);
    });
  };

  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)]">ข้อมูลผู้เข้าอบรม</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            จำนวนที่สมัคร {seatTarget} ท่าน · ปัจจุบัน {rows.length} แถว
          </p>
        </div>
        <button
          type="button"
          onClick={addRow}
          disabled={!canAdd}
          title={!canAdd ? 'ครบจำนวนที่สมัครแล้ว' : undefined}
          className="flex h-8 items-center gap-1.5 rounded-9e-md border border-[var(--surface-border)] px-3 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> เพิ่มผู้เข้าอบรม
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--surface-border)] bg-[var(--surface-muted)]">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-secondary)] w-10">#</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">ชื่อ</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">นามสกุล</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">อีเมล</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">เบอร์โทร</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-[var(--text-secondary)]">License</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-[var(--text-secondary)] w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const ed = isEditing(i);
              return (
                <tr key={i} className="border-b border-[var(--surface-border)] last:border-b-0 align-top">
                  <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{i + 1}</td>

                  {/* name / lastname / email / phone */}
                  <td className="px-2 py-1.5">
                    {ed ? <CellInput value={r.firstName} onChange={(v) => setField(i, 'firstName', v)} />
                        : <ReadCell value={r.firstName} />}
                  </td>
                  <td className="px-2 py-1.5">
                    {ed ? <CellInput value={r.lastName} onChange={(v) => setField(i, 'lastName', v)} />
                        : <ReadCell value={r.lastName} />}
                  </td>
                  <td className="px-2 py-1.5">
                    {ed ? <CellInput value={r.email} type="email" onChange={(v) => setField(i, 'email', v)} />
                        : <ReadCell value={r.email} />}
                  </td>
                  <td className="px-2 py-1.5">
                    {ed ? <CellInput value={r.phone} onChange={(v) => setField(i, 'phone', v)} />
                        : <ReadCell value={r.phone} />}
                  </td>

                  {/* license */}
                  <td className="px-2 py-1.5 min-w-[180px]">
                    {ed ? (
                      <div className="space-y-1.5">
                        <select
                          value={r.license.choice}
                          onChange={(e) => setLicense(i, 'choice', e.target.value)}
                          className={cn(
                            'h-8 w-full rounded-9e-md border bg-[var(--surface)] px-2 text-sm text-[var(--text-primary)]',
                            'border-[var(--surface-border)] focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
                          )}
                        >
                          <option value="">— เลือก —</option>
                          <option value="own">License ตนเอง</option>
                          <option value="9expert">License 9Expert</option>
                        </select>
                        {r.license.choice === 'own' && (
                          <CellInput value={r.license.level} onChange={(v) => setLicense(i, 'level', v)} placeholder="ระดับ / รุ่น" />
                        )}
                        {r.license.choice === '9expert' && (
                          <CellInput value={r.license.detail} onChange={(v) => setLicense(i, 'detail', v)} placeholder="รายละเอียด" />
                        )}
                      </div>
                    ) : (
                      <LicenseReadCell license={r.license} />
                    )}
                  </td>

                  {/* row actions */}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {ed ? (
                        <button
                          type="button"
                          onClick={() => stopEdit(i)}
                          aria-label="เสร็จ"
                          title="เสร็จ (ยังต้องกดบันทึกรายชื่อ)"
                          className="rounded-9e-md p-1.5 text-emerald-600 hover:bg-emerald-50"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit(i)}
                          aria-label="แก้ไข"
                          title="แก้ไข"
                          className="rounded-9e-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        aria-label="ลบแถว"
                        title="ลบแถว"
                        className="rounded-9e-md p-1.5 text-[var(--text-muted)] hover:text-red-500"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">
                  ยังไม่มีผู้เข้าอบรม
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="flex h-9 items-center gap-1.5 rounded-9e-md bg-9e-navy px-4 text-xs font-semibold text-9e-ice hover:opacity-90 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          บันทึกรายชื่อ
        </button>
        {msg && (
          <span className={cn('text-xs font-medium', msg.ok ? 'text-emerald-600' : 'text-red-600')}>
            {msg.text}
          </span>
        )}
      </div>
    </section>
  );
}

function CellInput({ value, onChange, type = 'text', placeholder }) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-8 w-full rounded-9e-md border bg-[var(--surface)] px-2 text-sm text-[var(--text-primary)]',
        'border-[var(--surface-border)] focus-visible:outline-none focus-visible:border-9e-brand focus-visible:ring-1 focus-visible:ring-9e-brand'
      )}
    />
  );
}

function ReadCell({ value }) {
  return <span className="block px-1 text-sm text-[var(--text-primary)]">{value || '—'}</span>;
}

function LicenseReadCell({ license }) {
  if (!license?.choice) return <span className="block px-1 text-sm text-[var(--text-muted)]">—</span>;
  const base = LICENSE_CHOICE_SHORT[license.choice] ?? license.choice;
  const extra = license.choice === 'own' ? license.level : license.detail;
  return (
    <span className="block px-1 text-sm text-[var(--text-primary)]">
      {base}{extra ? <span className="text-[var(--text-muted)]"> · {extra}</span> : null}
    </span>
  );
}

// ── Shared atoms ───────────────────────────────────────────────────

function Card({ title, children }) {
  return (
    <section className="rounded-9e-lg border border-[var(--surface-border)] bg-[var(--surface)] p-6">
      <h2 className="mb-4 text-base font-bold text-[var(--text-primary)]">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-full text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] sm:w-40 sm:flex-none">{label}</dt>
      <dd className="text-sm text-[var(--text-primary)] break-words">{value || '—'}</dd>
    </div>
  );
}
